-- inventory_ledger_entries has row security and no SELECT policy, so a
-- signed-in read returns no rows. The Item Ledger modal then never shows
-- the balance-roll receipt posted when a roll is only partly used.
--
-- One SELECT policy: an authenticated user whose role may open Inventory.
-- private.can_any treats Admin as allowed and otherwise requires the
-- inventory flag to be JSON true. The Item Ledger is that screen.
--
-- No INSERT, UPDATE, or DELETE policy. Issues and balance receipts stay
-- inside the security-definer roll functions, which bypass row security.
-- Any earlier write policy on this table is removed so a signed-in client
-- cannot write the ledger directly. Policies on other tables, including
-- bug_reports, are left alone.
--
-- Safe to run more than once. A missing table or helper is skipped.

DO $policy$
DECLARE
  pol record;
BEGIN
  IF to_regclass('public.inventory_ledger_entries') IS NULL THEN
    RAISE NOTICE 'inventory ledger select: skipped because the table is missing';
    RETURN;
  END IF;
  IF to_regprocedure('private.can_any(text[])') IS NULL THEN
    RAISE NOTICE 'inventory ledger select: skipped because private.can_any is missing';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.inventory_ledger_entries ENABLE ROW LEVEL SECURITY';

  FOR pol IN
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'inventory_ledger_entries'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.inventory_ledger_entries',
      pol.policyname
    );
  END LOOP;

  EXECUTE $select$
CREATE POLICY inventory_ledger_entries_select
  ON public.inventory_ledger_entries
  FOR SELECT
  TO authenticated
  USING (private.can_any(ARRAY['inventory']::text[]))
$select$;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.inventory_ledger_entries FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT ON TABLE public.inventory_ledger_entries TO authenticated';
  END IF;
END
$policy$;

COMMENT ON POLICY inventory_ledger_entries_select ON public.inventory_ledger_entries IS
  'Signed-in staff who may open Inventory can read issue and balance-receipt rows. Writes stay in security-definer functions.';
