-- Manual cleanup for 0 kg SFG/FG rows created by the old Create modal.
-- Those rows used an inv-<epoch>-<4 chars> batch code and stored 0 kg
-- because the weight was never copied onto total_net_kg.
--
-- Do not run this from the app. Run the preview first.
-- The transaction below ends in ROLLBACK. Change that word to COMMIT
-- only after the preview count is the set you mean to delete.
-- SFG-LOT- rows and any row with weight, consumption, or another status
-- are not deleted. The typed weight is not stored on these rows, so they
-- cannot be repaired from the database.

-- PREVIEW
SELECT id,
       sfg_batch_code,
       order_id,
       job_name,
       sfg_type,
       status,
       total_net_kg,
       total_gross_kg,
       available_kg,
       consumed_kg,
       storage_bay,
       created_at
FROM public.sfg_goods
WHERE sfg_batch_code ~ '^inv-[0-9]+-[a-z0-9]{4}$'
  AND COALESCE(total_net_kg, 0) = 0
  AND COALESCE(total_gross_kg, 0) = 0
  AND COALESCE(available_kg, 0) = 0
  AND COALESCE(consumed_kg, 0) = 0
  AND status = 'In Stock'
ORDER BY created_at;

-- APPLY (rolled back unless you change the last line to COMMIT)
BEGIN;

DELETE FROM public.sfg_goods
WHERE sfg_batch_code ~ '^inv-[0-9]+-[a-z0-9]{4}$'
  AND COALESCE(total_net_kg, 0) = 0
  AND COALESCE(total_gross_kg, 0) = 0
  AND COALESCE(available_kg, 0) = 0
  AND COALESCE(consumed_kg, 0) = 0
  AND status = 'In Stock';

ROLLBACK;
