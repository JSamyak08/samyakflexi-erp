-- B-017: create the pellet fuel tables the client upserts into.
-- Columns match savePelletInwardToSupabase / savePelletConsumptionToSupabase
-- in src/services/supabaseDataService.js. id is TEXT (codes such as PEL-GRN-…),
-- not uuid. The full form object is stored in payload and is what the UI reads
-- back (r.payload || r.details || r).
--
-- This migration is NOT applied by the application. Apply it in Supabase when ready.
--
-- Rollback:
--   DROP POLICY IF EXISTS "Allow anon and auth full access on pellet_inwards" ON public.pellet_inwards;
--   DROP POLICY IF EXISTS "Allow anon and auth full access on pellet_consumptions" ON public.pellet_consumptions;
--   DROP TABLE IF EXISTS public.pellet_consumptions;
--   DROP TABLE IF EXISTS public.pellet_inwards;

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

-- Permissive policy so the page works with the current anon client after this
-- migration is applied. The parallel security PR should replace these with
-- role-based policies and may revoke the anon grants below. This file does not
-- alter policies on any existing table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pellet_inwards'
      AND policyname = 'Allow anon and auth full access on pellet_inwards'
  ) THEN
    CREATE POLICY "Allow anon and auth full access on pellet_inwards"
      ON public.pellet_inwards
      FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pellet_consumptions'
      AND policyname = 'Allow anon and auth full access on pellet_consumptions'
  ) THEN
    CREATE POLICY "Allow anon and auth full access on pellet_consumptions"
      ON public.pellet_consumptions
      FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pellet_inwards TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pellet_consumptions TO anon, authenticated, service_role;
