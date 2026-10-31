-- The ink master form collects an HSN code. Purchase orders read that same value.
-- Store it on public.inks.hsn_code. Existing rows are left null: this table
-- never had an HSN column, and older ink purchase orders are not a source
-- for a backfill (they carry the film default 3920).

ALTER TABLE public.inks
  ADD COLUMN IF NOT EXISTS hsn_code text;

COMMENT ON COLUMN public.inks.hsn_code IS
  'HSN saved from the ink master. Nullable. Purchase orders read this column.';
