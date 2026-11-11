-- Repair plan for approved GRN lines whose kilograms never reached the
-- inventory balance. NOT a migration. Do not put this file in
-- supabase/migrations.
--
-- Do not run this against production (eamstsaqkbeiywfaanhi).
-- Rehearse on the test project (awtjvrhpoyzjwrfumhip) only after the
-- application fix in 20261111140000_qc_approval_posts_inventory.sql is deployed.
--
-- What production already shows (read on 2026-11-11, nothing was written):
--   SIL/GRN/26-27/197 is Approved. All 31 inward barcodes, including
--   RM-BC-SIL/GRN/26-27/197-L2-R2 (PET-650-12, 253.63 kg), are already
--   In Stock on their own item ids.
--   INVT-0010 (PET-650-12) was saved at approval as 1,660.81 kg, which is
--   the prior balance plus this receipt's 1,568.08 kg line. Do not add
--   that line again.
--   The item ledger hid every line after the first because the receipt
--   header points only at INVT-0007. That is a display defect, fixed in
--   the application. It is not a missing stock post for this GRN.
--   A dry-run of the rule below found no approved line whose in-stock rolls
--   exceed the item balance by at least that line's kilograms.
--
-- This script is safe to run more than once. It adds a line only when
-- preview_unposted_qc_stock() recommends the full line, and it records the
-- line in grn_qc_stock_posts so a second run cannot add it again.
-- The transaction ends in ROLLBACK. Change that last line to COMMIT only
-- after the before/after report has been reviewed.

BEGIN;

CREATE TEMP TABLE repair_backup_inventory AS
SELECT id, item_name, stock_qty_kg, unit_price, last_batch, last_vendor, last_updated, metadata
FROM public.inventory
WHERE id IN (
  SELECT DISTINCT stock_item_id
  FROM public.grn_line_items
  WHERE grn_id IN (
    SELECT id FROM public.grns
    WHERE private.grn_is_qc_approved(status)
      AND NOT private.grn_is_deleted(status)
  )
);

CREATE TEMP TABLE repair_backup_posts AS
SELECT * FROM public.grn_qc_stock_posts;

CREATE TEMP TABLE repair_plan AS
SELECT *
FROM public.preview_unposted_qc_stock()
WHERE recommend_kg > 0;

-- Review this before considering a commit. An empty plan means nothing is added.
SELECT grn_id, line_id, item_id, item_name, line_kg, stock_qty_kg, usable_roll_kg, gap_kg, recommend_kg, reason
FROM repair_plan
ORDER BY grn_id, line_no;

-- SIL/GRN/26-27/197 must not be in repair_plan. This select is the check.
SELECT grn_id, line_id, recommend_kg
FROM public.preview_unposted_qc_stock()
WHERE grn_id = 'SIL/GRN/26-27/197';

UPDATE public.inventory AS item
SET stock_qty_kg = round(COALESCE(item.stock_qty_kg, 0) + plan.recommend_kg, 2),
    last_updated = now(),
    metadata = COALESCE(item.metadata, '{}'::jsonb) || jsonb_build_object(
      'availableQtyKg', round(COALESCE(item.stock_qty_kg, 0) + plan.recommend_kg, 2)
    )
FROM (
  SELECT item_id, sum(recommend_kg) AS recommend_kg
  FROM repair_plan
  GROUP BY item_id
) AS plan
WHERE item.id = plan.item_id
  AND plan.recommend_kg > 0;

INSERT INTO public.grn_qc_stock_posts (grn_line_id, grn_id, inventory_item_id, posted_kg)
SELECT line_id, grn_id, item_id, recommend_kg
FROM repair_plan
WHERE recommend_kg > 0
ON CONFLICT (grn_line_id) DO NOTHING;

SELECT 'before' AS side, id, stock_qty_kg FROM repair_backup_inventory ORDER BY id;
SELECT 'after' AS side, item.id, item.stock_qty_kg
FROM public.inventory AS item
JOIN repair_backup_inventory AS backup ON backup.id = item.id
ORDER BY item.id;

-- Leave this as ROLLBACK. COMMIT only after the report above is accepted.
ROLLBACK;
