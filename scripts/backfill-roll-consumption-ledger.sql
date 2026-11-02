-- NOT APPLIED AUTOMATICALLY. Do not run this against production until the
-- dry-run list has been reviewed.
--
-- Requires migration 20261102120000_roll_consumption_ledger.sql to be applied
-- first. This file is not a migration. Applying the migration does not insert
-- these historical rows and does not change existing stock.
--
-- The SELECT at the top is a dry run. It only lists missing issue rows.
-- The APPLY block is commented out. Uncomment it only after the dry run looks
-- right, and keep the ROLLBACK until a second dry run comes back empty.
--
-- Saving or editing a production record does not post lines that were already
-- on that record. This apply block is the explicit full post. Do not run it
-- until the dry-run list has been reviewed.

-- ---------------------------------------------------------------------------
-- DRY RUN. Lists what a backfill would post. Does not insert or update stock.
-- ---------------------------------------------------------------------------

WITH print_rolls AS (
  SELECT
    'print_run'::text AS source,
    o.id AS order_id,
    NULL::text AS production_record_id,
    public.print_run_job_label(o.job_name) AS job_name,
    'Printing'::text AS stage,
    btrim(COALESCE(roll ->> 'barcodeId', roll ->> 'barcode', '')) AS barcode,
    round(COALESCE(
      NULLIF(roll ->> 'consumedWeightKg', '')::numeric,
      NULLIF(roll ->> 'consumedKg', '')::numeric,
      0
    ), 2) AS consumed_kg,
    round(COALESCE(
      NULLIF(roll ->> 'initialWeightKg', '')::numeric,
      NULLIF(roll ->> 'initialKg', '')::numeric,
      NULLIF(roll ->> 'consumedWeightKg', '')::numeric,
      0
    ), 2) AS initial_kg
  FROM public.orders AS o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.job_details -> 'inputRollsList', '[]'::jsonb)) AS roll
  WHERE o.printing_end_time IS NOT NULL
    AND lower(btrim(COALESCE(o.printing_status, ''))) = 'completed'
),
record_rolls AS (
  SELECT
    'production_record'::text AS source,
    r.order_id,
    r.id AS production_record_id,
    btrim(split_part(COALESCE(r.job_name, ''), ' ||| ', 1)) AS job_name,
    COALESCE(NULLIF(btrim(mat ->> 'stage'), ''), 'Production') AS stage,
    btrim(COALESCE(mat ->> 'barcode', mat ->> 'barcodeId', '')) AS barcode,
    round(COALESCE(
      NULLIF(mat ->> 'netConsumedQtyKg', '')::numeric,
      GREATEST(
        COALESCE(NULLIF(mat ->> 'issueQtyKg', '')::numeric, 0)
        - COALESCE(NULLIF(mat ->> 'returnQtyKg', '')::numeric, 0),
        0
      )
    ), 2) AS consumed_kg,
    round(COALESCE(
      NULLIF(mat ->> 'initialWeightKg', '')::numeric,
      COALESCE(NULLIF(mat ->> 'netConsumedQtyKg', '')::numeric, 0)
        + COALESCE(NULLIF(mat ->> 'returnQtyKg', '')::numeric, 0)
    ), 2) AS initial_kg
  FROM public.production_records AS r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.materials_list, '[]'::jsonb)) AS mat
),
candidates AS (
  SELECT * FROM print_rolls
  UNION ALL
  SELECT * FROM record_rolls
)
SELECT
  source,
  order_id,
  production_record_id,
  job_name,
  stage,
  barcode,
  consumed_kg,
  initial_kg,
  GREATEST(initial_kg - consumed_kg, 0) AS balance_kg,
  CASE
    WHEN GREATEST(initial_kg - consumed_kg, 0) > 0 THEN barcode || '-BAL'
    ELSE ''
  END AS balance_barcode
FROM candidates
WHERE consumed_kg > 0
  AND barcode <> ''
  AND lower(barcode) NOT LIKE 'sfg-%'
  AND lower(barcode) NOT LIKE 'fg-%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_ledger_entries AS existing
    WHERE existing.entry_kind = 'issue'
      AND lower(existing.barcode) = lower(candidates.barcode)
      AND (
        (candidates.order_id IS NOT NULL AND existing.order_id = candidates.order_id)
        OR (candidates.production_record_id IS NOT NULL AND existing.production_record_id = candidates.production_record_id)
      )
  )
ORDER BY order_id NULLS LAST, barcode;

-- ---------------------------------------------------------------------------
-- APPLY. Commented out on purpose. Posts one idempotent issue per roll that
-- is still on a completed print run or a production record. A second run of
-- this block does not insert a second issue. Balance rolls use the same
-- barcode-BAL convention.
--
-- BEGIN;
--
-- SELECT private.sync_job_roll_issues(o.id, NULL, 'print_run')
-- FROM public.orders AS o
-- WHERE o.printing_end_time IS NOT NULL
--   AND lower(btrim(COALESCE(o.printing_status, ''))) = 'completed';
--
-- SELECT private.sync_job_roll_issues(r.order_id, r.id, 'production_record')
-- FROM public.production_records AS r;
--
-- ROLLBACK;
-- -- Replace ROLLBACK with COMMIT only after the dry-run SELECT is empty
-- -- or lists only the rows you intend to post.
-- ---------------------------------------------------------------------------
