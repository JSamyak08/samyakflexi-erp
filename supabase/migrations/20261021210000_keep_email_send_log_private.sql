-- email_send_log is service-role only. An earlier draft of
-- 20261021190000_open_policies_where_missing listed it and, on a database
-- where that draft already ran, created "Allow anon and auth full access"
-- and granted DML to anon and authenticated. Drop that policy and revoke
-- those grants. This is a no-op when the policy was never created.
-- service_role is not touched.

DO $$
BEGIN
  IF to_regclass('public.email_send_log') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "Allow anon and auth full access" ON public.email_send_log';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.email_send_log FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.email_send_log FROM authenticated';
  END IF;
  EXECUTE 'REVOKE ALL ON TABLE public.email_send_log FROM PUBLIC';
END $$;
