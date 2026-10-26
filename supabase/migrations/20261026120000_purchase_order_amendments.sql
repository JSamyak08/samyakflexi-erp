-- Purchase order amendments. Additive and nullable.
-- Existing purchase_orders rows are not updated. A null revision is Rev 00
-- in the application. Previous revisions are inserted only when someone amends.

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS revision_no integer;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS amendment_no text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS amended_at timestamptz;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS amended_by text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS amendment_reason text;

CREATE TABLE IF NOT EXISTS public.purchase_order_revisions (
  id text PRIMARY KEY,
  po_id text,
  po_number text,
  revision_no integer,
  amendment_no text,
  payload jsonb,
  amended_by text,
  amended_at timestamptz,
  reason text,
  change_summary text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_order_revisions_po_number_idx
  ON public.purchase_order_revisions (po_number, revision_no);

ALTER TABLE public.purchase_order_revisions ENABLE ROW LEVEL SECURITY;

-- Same modules as purchase_orders. private.can_any exists after the auth
-- lockdown. Databases that still use the open policy get that policy instead.
DO $$
BEGIN
  IF to_regprocedure('private.can_any(text[])') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.purchase_order_revisions FROM anon, PUBLIC';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_order_revisions TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS purchase_order_revisions_access ON public.purchase_order_revisions';
    EXECUTE 'DROP POLICY IF EXISTS "Allow anon and auth full access" ON public.purchase_order_revisions';
    EXECUTE $policy$
      CREATE POLICY purchase_order_revisions_access
      ON public.purchase_order_revisions
      FOR ALL
      TO authenticated
      USING (private.can_any(ARRAY['purchase_orders','inventory']))
      WITH CHECK (private.can_any(ARRAY['purchase_orders','inventory']))
    $policy$;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_order_revisions TO anon, authenticated';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'purchase_order_revisions'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY "Allow anon and auth full access"
        ON public.purchase_order_revisions
        FOR ALL
        TO anon, authenticated
        USING (true)
        WITH CHECK (true)
      $policy$;
    END IF;
  END IF;
END $$;
