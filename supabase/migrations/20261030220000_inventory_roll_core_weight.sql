-- Bulk upload can store a core weight next to gross and tare.
-- GRN net weight remains gross_weight_kg minus tare_weight_kg.
-- core_dia stays the core diameter text. core_weight_kg is kilograms and is not subtracted again.

ALTER TABLE public.inventory_rolls
  ADD COLUMN IF NOT EXISTS core_weight_kg numeric;

COMMENT ON COLUMN public.inventory_rolls.core_weight_kg IS
  'Core weight in kg from bulk stock upload. Nullable. Net stock remains gross minus tare_weight_kg.';
