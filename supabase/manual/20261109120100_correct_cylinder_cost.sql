-- Correct stored cylinder engraving costs. NOT a migration.
-- Do not put this file in supabase/migrations (those run by themselves).
--
-- Rehearse on the test project awtjvrhpoyzjwrfumhip.
-- Do not run this against production eamstsaqkbeiywfaanhi.
--
-- The transaction ends in ROLLBACK. The UPDATE also refuses to change rows
-- unless the session has explicitly opted in with the test project ref:
--
--   SELECT set_config('samyak.confirm_not_production', 'awtjvrhpoyzjwrfumhip', true);
--
-- Change the final ROLLBACK to COMMIT only after the proposed rows look right
-- and only on a database you intend to correct. Running the file as-is prints
-- the proposal and leaves every row unchanged.
--
-- A row is corrected when the stored per-cylinder amount or set total is more
-- than 20x the geometric cost, or the per-cylinder amount disagrees with the
-- set total. Geometry is (face mm x circumference mm) / 100 cm², times a rate
-- that is kept only when it is between ₹0.20 and ₹50 per cm² (otherwise ₹1.60).
-- When the set total already matches that geometry, the per-cylinder amount
-- becomes total / colours. Otherwise both amounts are rewritten from geometry.
-- Text is stored as a plain rupee amount. The app formats Indian grouping on read.

BEGIN;

DROP TABLE IF EXISTS cylinder_cost_fix;
CREATE TEMP TABLE cylinder_cost_fix AS
WITH money AS (
  SELECT
    c.id,
    GREATEST(COALESCE(c.colors_count, 1), 1) AS colors,
    c.cylinder_cost,
    c.cost_per_cylinder,
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
    END AS area_sq_cm,
    CASE
      WHEN c.rate_per_sq_inch BETWEEN 0.2 AND 50 THEN c.rate_per_sq_inch
      ELSE 1.6
    END AS sane_rate
  FROM public.cylinders c
),
expected AS (
  SELECT
    money.*,
    CASE WHEN area_sq_cm IS NOT NULL THEN round(area_sq_cm * sane_rate) END AS expected_per,
    CASE WHEN area_sq_cm IS NOT NULL THEN round(area_sq_cm * sane_rate) * colors END AS expected_total
  FROM money
),
proposed AS (
  SELECT
    id,
    colors,
    cylinder_cost AS old_total,
    cost_per_cylinder AS old_per,
    total_num,
    per_num,
    expected_per,
    expected_total,
    CASE
      WHEN expected_total IS NOT NULL
        AND total_num IS NOT NULL
        AND abs(total_num - expected_total) / NULLIF(expected_total, 0) <= 0.02
        THEN expected_total
      ELSE expected_total
    END AS new_total_num,
    CASE
      WHEN expected_total IS NOT NULL
        AND total_num IS NOT NULL
        AND abs(total_num - expected_total) / NULLIF(expected_total, 0) <= 0.02
        THEN round(total_num / colors)
      ELSE expected_per
    END AS new_per_num
  FROM expected
  WHERE area_sq_cm IS NOT NULL
    AND (
      (per_num IS NOT NULL AND expected_per IS NOT NULL AND per_num > expected_per * 20)
      OR (total_num IS NOT NULL AND expected_total IS NOT NULL AND total_num > expected_total * 20)
      OR (total_num > 0 AND per_num IS NOT NULL AND abs(per_num * colors - total_num) / total_num > 0.5)
    )
)
SELECT
  id,
  old_total,
  old_per,
  new_total_num,
  new_per_num,
  '₹ ' || trim(to_char(new_total_num, 'FM999999990.00')) AS new_total,
  '₹ ' || trim(to_char(new_per_num, 'FM999999990.00')) AS new_per
FROM proposed
WHERE new_total_num IS NOT NULL
  AND new_per_num IS NOT NULL
  AND (
    new_total_num IS DISTINCT FROM total_num
    OR new_per_num IS DISTINCT FROM per_num
  );

-- Dry-run report. This is the review output.
SELECT id, old_total, old_per, new_total, new_per
FROM cylinder_cost_fix
ORDER BY id;

UPDATE public.cylinders AS c
SET
  cylinder_cost = fix.new_total,
  cost_per_cylinder = fix.new_per,
  press_marks = CASE
    WHEN c.press_marks IS NULL THEN c.press_marks
    ELSE jsonb_set(
      jsonb_set(c.press_marks, '{cylinderCost}', to_jsonb(fix.new_total), true),
      '{costPerCylinder}',
      to_jsonb(fix.new_per),
      true
    )
  END
FROM cylinder_cost_fix AS fix
WHERE c.id = fix.id
  AND current_setting('samyak.confirm_not_production', true) = 'awtjvrhpoyzjwrfumhip';

-- Leave this as ROLLBACK unless the report above is approved.
ROLLBACK;
