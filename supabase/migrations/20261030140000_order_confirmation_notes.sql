-- Order Confirmation Notes (OCN) and amendments persistence.
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS public.order_confirmations (
  id text PRIMARY KEY,
  ocn_number text NOT NULL,
  order_id text,
  job_name text,
  client_name text,
  status text DEFAULT 'Confirmed',
  revision_no integer DEFAULT 0,
  amendment_no text DEFAULT 'Rev 00',
  amended_at timestamptz,
  amended_by text,
  amendment_reason text,
  payload jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_confirmations_ocn_number_idx ON public.order_confirmations (ocn_number);
CREATE INDEX IF NOT EXISTS order_confirmations_order_id_idx ON public.order_confirmations (order_id);
CREATE INDEX IF NOT EXISTS order_confirmations_client_name_idx ON public.order_confirmations (client_name);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ocn_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ocn_id text;

ALTER TABLE public.order_confirmations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('private.can_any(text[])') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.order_confirmations FROM anon, PUBLIC';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_confirmations TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS order_confirmations_access ON public.order_confirmations';
    EXECUTE 'DROP POLICY IF EXISTS "Allow anon and auth full access" ON public.order_confirmations';
    EXECUTE $policy$
      CREATE POLICY order_confirmations_access
      ON public.order_confirmations
      FOR ALL
      TO authenticated
      USING (private.can_any(ARRAY['job_punching','orders','sales','dashboard']))
      WITH CHECK (private.can_any(ARRAY['job_punching','orders','sales','dashboard']))
    $policy$;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_confirmations TO anon, authenticated';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'order_confirmations'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY "Allow anon and auth full access"
        ON public.order_confirmations
        FOR ALL
        TO anon, authenticated
        USING (true)
        WITH CHECK (true)
      $policy$;
    END IF;
  END IF;
END $$;

