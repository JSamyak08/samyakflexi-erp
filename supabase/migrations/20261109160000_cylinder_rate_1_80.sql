-- Move cylinders stored at the old ₹1.60/sq cm default to ₹1.80.
--
-- This runs on production when the migration is applied. It does not touch
-- any other rate, including null. Affected rows are copied first into
-- public.cylinder_rate_backup_20261109 so they can be restored.
--
-- Area is round(face_mm * circumference_mm / 100) cm², the same integer the
-- app uses. Per-cylinder cost is round(area * rate). The set total is that
-- amount times the colour count. Text is Indian grouped, e.g. '₹ 5,782.00'.
--
-- A row is recomputed at ₹1.80 when at least one stored cost matches the
-- ₹1.60 formula within 2%, or when both cost fields are empty. That corrects
-- an inflated per-cylinder figure sitting beside a formula set total.
-- A stored price that does not match the ₹1.60 formula keeps its cost text
-- (the directory review flag still applies when it is far above ₹1.80).
-- Missing dimensions change the rate only.
--
-- Safe to run again: the backup insert skips ids already stored, and the
-- update only matches rate_per_sq_inch = 1.6.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.format_inr_rupees(amount numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  rounded bigint;
  digits text;
  grouped text;
  rest int;
BEGIN
  IF amount IS NULL THEN
    RETURN NULL;
  END IF;
  rounded := round(amount)::bigint;
  digits := abs(rounded)::text;
  IF length(digits) <= 3 THEN
    grouped := digits;
  ELSE
    grouped := right(digits, 3);
    rest := length(digits) - 3;
    WHILE rest > 0 LOOP
      IF rest = 1 THEN
        grouped := left(digits, 1) || ',' || grouped;
        rest := 0;
      ELSE
        grouped := substr(digits, rest - 1, 2) || ',' || grouped;
        rest := rest - 2;
      END IF;
    END LOOP;
  END IF;
  IF rounded < 0 THEN
    grouped := '-' || grouped;
  END IF;
  RETURN '₹ ' || grouped || '.00';
END;
$$;

REVOKE ALL ON FUNCTION private.format_inr_rupees(numeric) FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.cylinder_rate_backup_20261109 (
  cylinder_id text PRIMARY KEY,
  rate_per_sq_inch numeric,
  cylinder_cost text,
  cost_per_cylinder text,
  press_marks jsonb,
  face_length_mm numeric,
  circumference_mm numeric,
  colors_count integer,
  action text NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cylinder_rate_backup_20261109 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cylinder_rate_backup_20261109 FROM PUBLIC, anon, authenticated;

ALTER TABLE public.cylinders ALTER COLUMN rate_per_sq_inch SET DEFAULT 1.8;

WITH money AS (
  SELECT
    c.id,
    c.rate_per_sq_inch,
    c.cylinder_cost,
    c.cost_per_cylinder,
    c.press_marks,
    c.face_length_mm,
    c.circumference_mm,
    GREATEST(COALESCE(c.colors_count, 1), 1) AS colors,
    CASE
      WHEN regexp_replace(replace(COALESCE(c.cylinder_cost, ''), ',', ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN regexp_replace(replace(c.cylinder_cost, ',', ''), '[^0-9.]', '', 'g')::numeric
    END AS total_num,
    CASE
      WHEN regexp_replace(replace(COALESCE(c.cost_per_cylinder, ''), ',', ''), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN regexp_replace(replace(c.cost_per_cylinder, ',', ''), '[^0-9.]', '', 'g')::numeric
    END AS per_num,
    CASE
      WHEN c.face_length_mm > 0 AND c.circumference_mm > 0
        THEN round((c.face_length_mm * c.circumference_mm) / 100.0)
    END AS area_sq_cm
  FROM public.cylinders c
  WHERE c.rate_per_sq_inch = 1.6
),
planned AS (
  SELECT
    money.*,
    CASE WHEN area_sq_cm IS NOT NULL THEN round(area_sq_cm * 1.6) END AS old_per,
    CASE WHEN area_sq_cm IS NOT NULL THEN round(area_sq_cm * 1.6) * colors END AS old_total,
    CASE WHEN area_sq_cm IS NOT NULL THEN round(area_sq_cm * 1.8) END AS new_per,
    CASE WHEN area_sq_cm IS NOT NULL THEN round(area_sq_cm * 1.8) * colors END AS new_total
  FROM money
),
classified AS (
  SELECT
    planned.*,
    CASE
      WHEN area_sq_cm IS NULL THEN 'rate_only'
      WHEN per_num IS NULL AND total_num IS NULL THEN 'recompute'
      WHEN old_total IS NOT NULL AND total_num IS NOT NULL
        AND abs(total_num - old_total) / old_total <= 0.02 THEN 'recompute'
      WHEN old_per IS NOT NULL AND per_num IS NOT NULL
        AND abs(per_num - old_per) / old_per <= 0.02 THEN 'recompute'
      ELSE 'keep_costs'
    END AS action
  FROM planned
),
inserted AS (
  INSERT INTO public.cylinder_rate_backup_20261109 (
    cylinder_id, rate_per_sq_inch, cylinder_cost, cost_per_cylinder, press_marks,
    face_length_mm, circumference_mm, colors_count, action
  )
  SELECT
    id, rate_per_sq_inch, cylinder_cost, cost_per_cylinder, press_marks,
    face_length_mm, circumference_mm, colors, action
  FROM classified
  ON CONFLICT (cylinder_id) DO NOTHING
  RETURNING cylinder_id
)
UPDATE public.cylinders AS c
SET
  rate_per_sq_inch = 1.8,
  cylinder_cost = CASE
    WHEN classified.action = 'recompute' THEN private.format_inr_rupees(classified.new_total)
    ELSE c.cylinder_cost
  END,
  cost_per_cylinder = CASE
    WHEN classified.action = 'recompute' THEN private.format_inr_rupees(classified.new_per)
    ELSE c.cost_per_cylinder
  END,
  press_marks = CASE
    WHEN c.press_marks IS NULL OR jsonb_typeof(c.press_marks) <> 'object' THEN c.press_marks
    WHEN classified.action = 'recompute' THEN jsonb_set(
      jsonb_set(
        jsonb_set(c.press_marks, '{ratePerSqInch}', to_jsonb(1.8), true),
        '{cylinderCost}',
        to_jsonb(private.format_inr_rupees(classified.new_total)),
        true
      ),
      '{costPerCylinder}',
      to_jsonb(private.format_inr_rupees(classified.new_per)),
      true
    )
    ELSE jsonb_set(c.press_marks, '{ratePerSqInch}', to_jsonb(1.8), true)
  END
FROM classified
WHERE c.id = classified.id
  AND c.rate_per_sq_inch = 1.6
  AND (SELECT count(*) FROM inserted) >= 0;
