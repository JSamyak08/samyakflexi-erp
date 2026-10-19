-- B-026: remember which GRNs were included in the QC-overdue digest.
-- Apply after 20261019120100_create_pellet_fuel_tables.sql and after
-- 20261019120000_auth_rls_lockdown.sql (PR #1). Merge this PR after PR #1.
--
-- The column lives on public.grns. Row access stays on the lockdown policy
-- grns_access: FOR ALL TO authenticated, private.can_any(ARRAY['inventory','purchase_orders']).
-- This file does not create a policy, and it does not grant anon.
--
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_grns_escalated_at;
--   ALTER TABLE public.grns DROP COLUMN IF EXISTS escalated_at;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'grns'
      AND policyname = 'grns_access'
  ) THEN
    RAISE EXCEPTION
      'grns_access is missing. Apply 20261019120000_auth_rls_lockdown.sql (PR #1) before this migration.';
  END IF;
END $$;

ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.grns.escalated_at IS
  'Stamped once, before the daily QC-overdue digest email. Null means this GRN has not been escalated.';

ALTER TABLE public.grns ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.grns FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.grns TO authenticated;

CREATE INDEX IF NOT EXISTS idx_grns_escalated_at ON public.grns (escalated_at);
