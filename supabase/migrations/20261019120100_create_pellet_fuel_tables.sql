-- B-017: pellet fuel tables the client upserts into.
-- Apply only after 20261019120000_auth_rls_lockdown.sql (PR #1). That migration
-- creates private.can_any() and then drops private.install_module_access(), so
-- these policies call private.can_any directly. Merge this PR after PR #1.
--
-- Columns match savePelletInwardToSupabase / savePelletConsumptionToSupabase.
-- id is TEXT (codes such as PEL-GRN-…), not uuid. The UI reads payload.
--
-- Access matches the lockdown's pellet settings rule and the inventory-style
-- module policy: FOR ALL TO authenticated, allowed when
-- private.can_any(ARRAY['pellet_fuel', 'inventory']) is true. Admin is included
-- inside private.can_any. There is no anon policy and no anon grant.
--
-- Rollback:
--   DROP POLICY IF EXISTS pellet_inwards_access ON public.pellet_inwards;
--   DROP POLICY IF EXISTS pellet_consumptions_access ON public.pellet_consumptions;
--   DROP TABLE IF EXISTS public.pellet_consumptions;
--   DROP TABLE IF EXISTS public.pellet_inwards;

DO $$
BEGIN
  IF to_regprocedure('private.can_any(text[])') IS NULL THEN
    RAISE EXCEPTION
      'private.can_any(text[]) is missing. Apply 20261019120000_auth_rls_lockdown.sql (PR #1) before this migration.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pellet_inwards (
    id TEXT PRIMARY KEY,
    grn_no TEXT,
    inward_date DATE,
    inward_qty_kg NUMERIC DEFAULT 0,
    unit_cost_per_kg NUMERIC DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pellet_consumptions (
    id TEXT PRIMARY KEY,
    consumption_date DATE,
    consumed_qty_kg NUMERIC DEFAULT 0,
    operating_hours NUMERIC DEFAULT 0,
    reference_printing_done_kg NUMERIC DEFAULT 0,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS grn_no TEXT;
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS inward_date DATE;
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS inward_qty_kg NUMERIC DEFAULT 0;
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS unit_cost_per_kg NUMERIC DEFAULT 0;
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0;
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.pellet_inwards ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS consumption_date DATE;
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS consumed_qty_kg NUMERIC DEFAULT 0;
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS operating_hours NUMERIC DEFAULT 0;
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS reference_printing_done_kg NUMERIC DEFAULT 0;
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.pellet_consumptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_pellet_inward_date ON public.pellet_inwards (inward_date DESC);
CREATE INDEX IF NOT EXISTS idx_pellet_consum_date ON public.pellet_consumptions (consumption_date DESC);

ALTER TABLE public.pellet_inwards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pellet_consumptions ENABLE ROW LEVEL SECURITY;

-- Drop any earlier permissive draft policies if this file replaces one that was applied by hand.
DROP POLICY IF EXISTS "Allow anon and auth full access on pellet_inwards" ON public.pellet_inwards;
DROP POLICY IF EXISTS "Allow anon and auth full access on pellet_consumptions" ON public.pellet_consumptions;
DROP POLICY IF EXISTS pellet_inwards_access ON public.pellet_inwards;
DROP POLICY IF EXISTS pellet_consumptions_access ON public.pellet_consumptions;

CREATE POLICY pellet_inwards_access
  ON public.pellet_inwards
  FOR ALL
  TO authenticated
  USING (private.can_any(ARRAY['pellet_fuel', 'inventory']))
  WITH CHECK (private.can_any(ARRAY['pellet_fuel', 'inventory']));

CREATE POLICY pellet_consumptions_access
  ON public.pellet_consumptions
  FOR ALL
  TO authenticated
  USING (private.can_any(ARRAY['pellet_fuel', 'inventory']))
  WITH CHECK (private.can_any(ARRAY['pellet_fuel', 'inventory']));

REVOKE ALL ON TABLE public.pellet_inwards FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.pellet_consumptions FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pellet_inwards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pellet_consumptions TO authenticated;
