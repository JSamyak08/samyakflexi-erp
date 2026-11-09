-- Read-only preview of the ₹1.60 → ₹1.80 cylinder rate move.
-- Do not put this file in supabase/migrations.
-- It only SELECTs. Safe on production eamstsaqkbeiywfaanhi and on test.
--
-- recompute: a stored cost matches the ₹1.60 area formula (or both costs are
-- empty), so per-cylinder and set cost would be rewritten at ₹1.80.
-- rate_only: dimensions are missing; only the rate would change.
-- keep_costs: the stored price does not match the ₹1.60 formula. The rate
-- would become ₹1.80 and the cost text would stay. The app keeps its review
-- flag when that price is still more than 20× the ₹1.80 formula.
-- Rows at any other rate, including null, are not listed.

WITH money AS (
  SELECT
    c.id,
    c.sku,
    c.job_name,
    c.rate_per_sq_inch,
    c.cylinder_cost,
    c.cost_per_cylinder,
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
    CASE WHEN area_sq_cm IS NOT NULL THEN round(area_sq_cm * 1.8) * colors END AS new_total,
    CASE
      WHEN area_sq_cm IS NULL THEN 'rate_only'
      WHEN per_num IS NULL AND total_num IS NULL THEN 'recompute'
      WHEN total_num IS NOT NULL AND abs(total_num - (round(area_sq_cm * 1.6) * colors))
        / NULLIF(round(area_sq_cm * 1.6) * colors, 0) <= 0.02 THEN 'recompute'
      WHEN per_num IS NOT NULL AND abs(per_num - round(area_sq_cm * 1.6))
        / NULLIF(round(area_sq_cm * 1.6), 0) <= 0.02 THEN 'recompute'
      ELSE 'keep_costs'
    END AS action
  FROM money
)
SELECT
  id,
  sku,
  job_name,
  colors,
  area_sq_cm,
  rate_per_sq_inch AS old_rate,
  1.8 AS new_rate,
  cylinder_cost AS old_set_cost,
  cost_per_cylinder AS old_per_cylinder,
  total_num,
  per_num,
  old_total AS formula_set_at_1_60,
  old_per AS formula_per_at_1_60,
  CASE WHEN action = 'recompute' THEN new_total ELSE total_num END AS new_set_cost_number,
  CASE WHEN action = 'recompute' THEN new_per ELSE per_num END AS new_per_cylinder_number,
  action
FROM planned
ORDER BY action, sku NULLS LAST, id;
