-- Job Master linkage and a conservative non-negative safety net.
-- Additive only. Existing production rows are not updated and are not scanned:
-- every CHECK below is NOT VALID, so current rows stay as they are.
-- New inserts and updates are checked.
-- jsonb process_logs is not covered by these column checks.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS job_master_id text;

ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS job_master_id text;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS print_film_type text;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS print_micron numeric;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS print_width_mm numeric;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS machine_name text;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS guardrail_warning_reason text;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS film_type_override_reason text;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS film_type_override_by text;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS qty_pouching_pcs numeric;
ALTER TABLE public.production_records ADD COLUMN IF NOT EXISTS zipper_consumed_m numeric;

COMMENT ON COLUMN public.orders.job_master_id IS
  'Job Master id stored when the order is saved. Nullable. Existing orders are not backfilled.';
COMMENT ON COLUMN public.production_records.job_master_id IS
  'Job Master id resolved when the record is saved. Nullable. Existing records are not backfilled.';
COMMENT ON COLUMN public.production_records.print_film_type IS
  'Printing layer film type from job_masters.layers[0] at save time.';
COMMENT ON COLUMN public.production_records.print_micron IS
  'Printing layer micron from job_masters.layers[0] at save time.';
COMMENT ON COLUMN public.production_records.print_width_mm IS
  'Print width from job_masters.print_width_mm at save time. Layer width is not used.';

-- gross_production_kg, net_usable_kg and total_wastage_kg already have
-- production_records_weight_bounds. This constraint covers the other kg and
-- meter columns. NULL stays allowed. There is no check that quantity must
-- stay within 110% or 150% of the order; that rule stays in the app.
ALTER TABLE public.production_records DROP CONSTRAINT IF EXISTS production_records_qty_meters_nonneg;
ALTER TABLE public.production_records
  ADD CONSTRAINT production_records_qty_meters_nonneg
  CHECK (
    (qty_printing IS NULL OR qty_printing >= 0)
    AND (qty_inspection IS NULL OR qty_inspection >= 0)
    AND (qty_lamination_l1 IS NULL OR qty_lamination_l1 >= 0)
    AND (qty_second_pass_l2 IS NULL OR qty_second_pass_l2 >= 0)
    AND (qty_slitting IS NULL OR qty_slitting >= 0)
    AND (qty_pouching IS NULL OR qty_pouching >= 0)
    AND (qty_dispatch IS NULL OR qty_dispatch >= 0)
    AND (qty_first_pass_l1 IS NULL OR qty_first_pass_l1 >= 0)
    AND (actual_meters_printed IS NULL OR actual_meters_printed >= 0)
    AND (adhesive_consumed_l1_kg IS NULL OR adhesive_consumed_l1_kg >= 0)
    AND (adhesive_consumed_l2_kg IS NULL OR adhesive_consumed_l2_kg >= 0)
    AND (zipper_consumed_kg IS NULL OR zipper_consumed_kg >= 0)
    AND (paper_core_consumed_kg IS NULL OR paper_core_consumed_kg >= 0)
    AND (printing_plain_setting_wastage_kg IS NULL OR printing_plain_setting_wastage_kg >= 0)
    AND (printing_wastage_kg IS NULL OR printing_wastage_kg >= 0)
    AND (lamination_plain_substrate_wastage_kg IS NULL OR lamination_plain_substrate_wastage_kg >= 0)
    AND (lamination_plain_substrate_wastage_l2_kg IS NULL OR lamination_plain_substrate_wastage_l2_kg >= 0)
    AND (printed_wastage_kg IS NULL OR printed_wastage_kg >= 0)
    AND (laminate_wastage_kg IS NULL OR laminate_wastage_kg >= 0)
    AND (trim_wastage_kg IS NULL OR trim_wastage_kg >= 0)
    AND (pouching_scrap_kg IS NULL OR pouching_scrap_kg >= 0)
    AND (print_micron IS NULL OR print_micron >= 0)
    AND (print_width_mm IS NULL OR print_width_mm >= 0)
    AND (qty_pouching_pcs IS NULL OR qty_pouching_pcs >= 0)
    AND (zipper_consumed_m IS NULL OR zipper_consumed_m >= 0)
  ) NOT VALID;

COMMENT ON CONSTRAINT production_records_qty_meters_nonneg ON public.production_records IS
  'NOT VALID. Existing rows are not scanned. New writes cannot store a negative kg or meter value in these columns.';
