-- Per-process meters and second-pass adhesive GSM.
-- Nullable on purpose: a blank field stays unknown. Zero is stored only
-- when someone entered zero. No default of 0.

ALTER TABLE public.production_records
  ADD COLUMN IF NOT EXISTS lamination_meters_l1 numeric,
  ADD COLUMN IF NOT EXISTS lamination_meters_l2 numeric,
  ADD COLUMN IF NOT EXISTS slitting_meters numeric,
  ADD COLUMN IF NOT EXISTS pouching_meters numeric,
  ADD COLUMN IF NOT EXISTS actual_adhesive_gsm_l2 numeric;

COMMENT ON COLUMN public.production_records.lamination_meters_l1 IS
  'Meters run on lamination pass 1. Null means not recorded.';
COMMENT ON COLUMN public.production_records.lamination_meters_l2 IS
  'Meters run on lamination pass 2. Null means not recorded.';
COMMENT ON COLUMN public.production_records.slitting_meters IS
  'Meters run on slitting. Null means not recorded.';
COMMENT ON COLUMN public.production_records.pouching_meters IS
  'Meters run on pouching. Null means not recorded.';
COMMENT ON COLUMN public.production_records.actual_adhesive_gsm_l2 IS
  'Adhesive GSM recorded for lamination pass 2. Pass 1 stays on actual_adhesive_gsm. Null means not recorded.';
