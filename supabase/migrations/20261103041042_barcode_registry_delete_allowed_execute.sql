-- Signed-in reads of public.barcode_registry fail with
-- "permission denied for function inventory_delete_allowed".
--
-- The view is security invoker, so the caller also runs the
-- deleted_barcodes RLS policy. That policy calls
-- private.inventory_delete_allowed(). The helper is SECURITY DEFINER,
-- search_path is empty, and it only returns whether this caller has one
-- of the inventory modules. EXECUTE was revoked from PUBLIC and never
-- granted back to authenticated (private.can_any still has that grant).
-- Anon stays revoked. This does not grant inventory row access.

DO $$
BEGIN
  IF to_regprocedure('private.inventory_delete_allowed()') IS NULL THEN
    RAISE NOTICE 'barcode registry read: private.inventory_delete_allowed() is missing';
    RETURN;
  END IF;

  EXECUTE 'ALTER FUNCTION private.inventory_delete_allowed() SECURITY DEFINER';
  EXECUTE 'ALTER FUNCTION private.inventory_delete_allowed() SET search_path TO ' || quote_literal('');
  EXECUTE 'REVOKE ALL ON FUNCTION private.inventory_delete_allowed() FROM PUBLIC';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION private.inventory_delete_allowed() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.inventory_delete_allowed() TO authenticated';
  END IF;
END $$;
