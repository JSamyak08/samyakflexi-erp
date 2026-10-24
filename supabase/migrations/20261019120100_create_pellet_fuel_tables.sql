-- B-017 pellet fuel tables.
--
-- This version (20261019120100) is older than migrations already applied on
-- production (latest recorded in this check: 20261024023000). The Supabase
-- GitHub integration still runs a file missing from schema_migrations and
-- finishes with a warning. It is not skipped. `supabase db push` without
-- --include-all refuses instead.
--
-- Production already has public.pellet_inwards and public.pellet_consumptions
-- from 20261021180000_persist_business_records.sql, plus pellet_inwards.vehicle_no
-- and the GRN numbering functions from 20261023190000_pellet_fuel_grn_and_vehicle.sql.
-- 20261024023000_auth_rls_lockdown.sql is applied and private.can_any(text[])
-- is installed. The original body of this file dropped the live policies and
-- revoked anon. Running that now would undo the lockdown. This file does not.
--
-- This file now only makes sure the base tables, columns, and date indexes
-- exist. It does not create policies, revoke grants, or touch vehicle_no.
-- CREATE TABLE / ADD COLUMN / CREATE INDEX are no-ops when the object exists.

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
