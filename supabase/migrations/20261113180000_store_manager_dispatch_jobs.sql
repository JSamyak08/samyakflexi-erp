-- Store Manager can open Dispatch and Inventory, and the packing-list screen
-- lists production jobs from public.orders. orders_access does not include
-- dispatch or inventory, so that read returns no rows and the dropdown is
-- empty. Admin still sees every job because private.can_any treats Admin as
-- allowed.
--
-- A SELECT policy on public.orders would also return quantities, the
-- job-details document, material requirements, and the costing envelope
-- packed into job_name. This migration does not add that policy, and it
-- does not give write access on orders.
--
-- private.dispatch_production_job_rows is security definer and stays in the
-- private schema. It returns only the id, the job name before that envelope,
-- the client name, the status, and the customer PO number, and only when the
-- caller is a Store Manager (Admin is included by private.has_role) who may
-- open Dispatch. Printing Operator, Shop Floor Operator, and every other role
-- receive no rows from this projection. Their existing orders policies are
-- left as they are.
--
-- The public view is security invoker. It does not bypass row security on its
-- own; the private function decides whether any row is returned.
-- Safe to run more than once. A missing table or helper is skipped.

DO $migration$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE NOTICE 'store manager dispatch jobs: skipped because orders is missing';
    RETURN;
  END IF;
  IF to_regprocedure('private.has_role(text[])') IS NULL
     OR to_regprocedure('private.can_any(text[])') IS NULL THEN
    RAISE NOTICE 'store manager dispatch jobs: skipped because role helpers are missing';
    RETURN;
  END IF;

  EXECUTE $gate$
CREATE OR REPLACE FUNCTION private.can_read_dispatch_production_jobs()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT private.has_role(ARRAY['Store Manager']::text[])
     AND private.can_any(ARRAY['dispatch']::text[]);
$fn$
$gate$;

  EXECUTE $rows$
CREATE OR REPLACE FUNCTION private.dispatch_production_job_rows()
RETURNS TABLE (
  id text,
  job_name text,
  client_name text,
  status text,
  po_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT
    o.id,
    COALESCE(NULLIF(btrim(split_part(o.job_name, ' ||| ', 1)), ''), 'Untitled Job') AS job_name,
    COALESCE(o.client_name, '') AS client_name,
    o.status,
    NULLIF(btrim(COALESCE(o.job_details ->> 'poNumber', '')), '') AS po_number
  FROM public.orders AS o
  WHERE (SELECT private.can_read_dispatch_production_jobs());
$fn$
$rows$;

  EXECUTE 'DROP VIEW IF EXISTS public.dispatch_production_jobs';
  EXECUTE $view$
CREATE VIEW public.dispatch_production_jobs
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, job_name, client_name, status, po_number
FROM private.dispatch_production_job_rows()
$view$;

  EXECUTE 'REVOKE ALL ON FUNCTION private.can_read_dispatch_production_jobs() FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION private.dispatch_production_job_rows() FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON TABLE public.dispatch_production_jobs FROM PUBLIC';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION private.can_read_dispatch_production_jobs() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION private.dispatch_production_job_rows() FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.dispatch_production_jobs FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.can_read_dispatch_production_jobs() TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.dispatch_production_job_rows() TO authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.dispatch_production_jobs TO authenticated';
  END IF;

  EXECUTE $comment_gate$
COMMENT ON FUNCTION private.can_read_dispatch_production_jobs() IS
  'True for a Store Manager who may open Dispatch. Admin is included by private.has_role. No other role is allowed.'
$comment_gate$;

  EXECUTE $comment_rows$
COMMENT ON FUNCTION private.dispatch_production_job_rows() IS
  'Read-only job id, display name, client, status, and customer PO for the dispatch packing list. Costing and other order columns are not returned.'
$comment_rows$;

  EXECUTE $comment_view$
COMMENT ON VIEW public.dispatch_production_jobs IS
  'Security-invoker projection of production jobs for the Dispatch packing list. Store Manager read only. Orders policies are unchanged.'
$comment_view$;
END
$migration$;

NOTIFY pgrst, 'reload schema';
