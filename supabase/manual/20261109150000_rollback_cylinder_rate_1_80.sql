-- Restore cylinders moved from ₹1.60 to ₹1.80 by 20261109160000_cylinder_rate_1_80.
-- NOT a migration. Do not put this file in supabase/migrations.
--
-- The transaction ends in ROLLBACK. Change that last line to COMMIT only
-- after the restored sample looks right. A row whose rate is no longer 1.8
-- is left alone, so a rate edited after the move is not overwritten.
-- The column default goes back to 1.6.

BEGIN;

SELECT
  cylinder_id,
  rate_per_sq_inch AS restore_rate,
  cylinder_cost AS restore_set_cost,
  cost_per_cylinder AS restore_per_cylinder,
  action
FROM public.cylinder_rate_backup_20261109
ORDER BY cylinder_id;

UPDATE public.cylinders AS c
SET
  rate_per_sq_inch = b.rate_per_sq_inch,
  cylinder_cost = b.cylinder_cost,
  cost_per_cylinder = b.cost_per_cylinder,
  press_marks = b.press_marks
FROM public.cylinder_rate_backup_20261109 AS b
WHERE c.id = b.cylinder_id
  AND c.rate_per_sq_inch = 1.8;

ALTER TABLE public.cylinders ALTER COLUMN rate_per_sq_inch SET DEFAULT 1.6;

-- Leave this as ROLLBACK unless the restore above is approved.
ROLLBACK;
