-- Optional email on the client directory.
-- Timestamped after 20261112130000_allocate_order_id.sql. That order-id
-- migration is already applied on production, so this file must sort later.
--
-- public.clients already has a table-level policy, clients_access, FOR ALL
-- to authenticated, from 20261024023000_auth_rls_lockdown.sql
-- (private.can_any on clients, sales, orders, and job_punching).
-- Table grants for authenticated are SELECT, INSERT, UPDATE, DELETE.
-- A new column is covered by that policy and those grants. anon has no
-- grant on this table. This migration does not create a policy, does not
-- grant anon, and does not rewrite existing rows. Email stays null until
-- someone saves it from the client directory.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.clients.email IS
  'Optional directory email. Null when the plant has not recorded one.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clients'
      AND policyname = 'clients_access'
      AND cmd = 'ALL'
      AND roles @> ARRAY['authenticated']::name[]
  ) THEN
    RAISE EXCEPTION 'public.clients is missing the table-level clients_access policy, so email would not be covered by RLS';
  END IF;
END $$;
