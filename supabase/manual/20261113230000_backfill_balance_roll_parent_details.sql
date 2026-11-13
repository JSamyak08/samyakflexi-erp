-- Backfill existing balance rolls. Not part of the migration, and not run
-- by the application. Review the SELECT, then run the UPDATE on a database
-- you intend to correct. Do not run this against production until that
-- review is done.
--
-- What it does: touching each -BAL inventory roll and each balance_receipt
-- ledger row fires the BEFORE triggers from
-- 20261113230000_balance_roll_parent_details.sql. Those triggers copy the
-- parent item name, vendor, batch, rate, GRN, size, micron, and original
-- net weight. They do not change inventory_rolls.inward_datetime, so FIFO
-- still ages a leftover from its parent's origin rather than from the split.
--
-- Preview (read only):
--
-- SELECT
--   roll.barcode_id,
--   roll.item_name,
--   roll.vendor_name,
--   roll.batch_no,
--   roll.micron,
--   roll.width_mm,
--   roll.inward_datetime,
--   roll.metadata ->> 'parentBarcodeId' AS parent_barcode,
--   roll.metadata ->> 'grnNo' AS grn_no,
--   roll.metadata ->> 'parentNetWeightKg' AS parent_net_kg
-- FROM public.inventory_rolls AS roll
-- WHERE roll.barcode_id ~* '-BAL$'
-- ORDER BY roll.barcode_id;

UPDATE public.inventory_rolls
SET metadata = COALESCE(metadata, '{}'::jsonb)
WHERE barcode_id ~* '-BAL$';

UPDATE public.inventory_ledger_entries
SET item_name = item_name
WHERE entry_kind = 'balance_receipt';
