-- B-015: drop duplicate btree indexes.
-- Each dropped index has the same column list and access method as the index that is kept.
-- Unique indexes (primary keys and sfg_goods_sfg_batch_code_key) are not touched.
--
-- Kept counterparts:
--   idx_delivery_challans_no      (delivery_challans.challan_no)
--   idx_inv_rolls_barcode          (inventory_rolls.barcode_id)
--   idx_inv_rolls_roll_type        (inventory_rolls.roll_type)
--   idx_inv_rolls_status           (inventory_rolls.status)
--   idx_prod_rec_order             (production_records.order_id)
--   idx_sfg_batch_code             (sfg_goods.sfg_batch_code)
--
-- Rollback (recreate the duplicates; safe to run more than once):
--   CREATE INDEX IF NOT EXISTS idx_dc_challan_no ON public.delivery_challans USING btree (challan_no);
--   CREATE INDEX IF NOT EXISTS idx_inventory_rolls_barcode_id ON public.inventory_rolls USING btree (barcode_id);
--   CREATE INDEX IF NOT EXISTS idx_inventory_rolls_roll_type ON public.inventory_rolls USING btree (roll_type);
--   CREATE INDEX IF NOT EXISTS idx_rolls_status ON public.inventory_rolls USING btree (status);
--   CREATE INDEX IF NOT EXISTS idx_prod_rec_order_id ON public.production_records USING btree (order_id);
--   CREATE INDEX IF NOT EXISTS idx_sfg_goods_batch_code ON public.sfg_goods USING btree (sfg_batch_code);
--
-- Note: re-running the repository supabase_schema.sql recreates idx_prod_rec_order_id
-- and idx_rolls_status. Drop those again if that script is applied after this migration.

DROP INDEX IF EXISTS public.idx_dc_challan_no;
DROP INDEX IF EXISTS public.idx_inventory_rolls_barcode_id;
DROP INDEX IF EXISTS public.idx_inventory_rolls_roll_type;
DROP INDEX IF EXISTS public.idx_rolls_status;
DROP INDEX IF EXISTS public.idx_prod_rec_order_id;
DROP INDEX IF EXISTS public.idx_sfg_goods_batch_code;
