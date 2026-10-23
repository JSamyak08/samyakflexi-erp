-- B-026: remember which GRNs were included in the QC-overdue digest.
--
-- This version (20261019120200) is older than migrations already applied on
-- production. The GitHub integration still runs a missing history row and
-- finishes with a warning. It is not skipped. `supabase db push` without
-- --include-all refuses the push instead of applying the file.
--
-- Checked read-only on 23 Oct 2026: public.grns has no escalated_at column.
-- Its policy is "Allow anon and auth full access", not grns_access.
-- private.can_any(text[]) is not installed. The original body raised when
-- grns_access was missing, then revoked anon and granted only authenticated.
-- That would fail the deploy, or change grants the later open-policy
-- migrations left in place. This file does not enable, drop, or replace
-- policies and does not change grants.
--
-- ADD COLUMN IF NOT EXISTS and CREATE INDEX IF NOT EXISTS are safe to run
-- once, late, on the live table. Nothing here is applied by this change;
-- it runs only when the migration integration applies the file.

ALTER TABLE public.grns ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.grns.escalated_at IS
  'Stamped once, before the daily QC-overdue digest email. Null means this GRN has not been escalated.';

CREATE INDEX IF NOT EXISTS idx_grns_escalated_at ON public.grns (escalated_at);
