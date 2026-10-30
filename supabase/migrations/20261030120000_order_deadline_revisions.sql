-- Pre-printing deadline revisions. Additive and nullable.
-- Existing orders rows are not updated. The original commercial date stays
-- in target_delivery_date. original_deadline is filled on the first revision
-- and a trigger keeps that value afterwards. History is append-only.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS original_deadline date;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS revised_deadline date;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deadline_revised_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deadline_revised_by text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deadline_revision_reason text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_informed boolean;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_informed_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_informed_by text;

COMMENT ON COLUMN public.orders.original_deadline IS
  'Commercial deadline frozen on the first pre-printing revision. Null until then.';
COMMENT ON COLUMN public.orders.revised_deadline IS
  'Working delivery date after a revision. Null until someone revises it.';

CREATE TABLE IF NOT EXISTS public.order_deadline_revisions (
  id text PRIMARY KEY,
  order_id text,
  event_type text,
  original_deadline date,
  previous_deadline date,
  revised_deadline date,
  reason text,
  actor text,
  acted_at timestamptz,
  client_informed boolean,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_deadline_revisions_order_id_idx
  ON public.order_deadline_revisions (order_id, acted_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_deadline_revisions_order_id_fkey'
  ) THEN
    ALTER TABLE public.order_deadline_revisions
      ADD CONSTRAINT order_deadline_revisions_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.order_deadline_revisions ENABLE ROW LEVEL SECURITY;

-- Same modules as orders. Deadline columns and history writes are limited to
-- Admin, Plant Manager, Production Manager, and Sales Manager. private.has_role
-- already treats Admin as allowed. Databases that still use the open policy
-- get that policy instead, and skip the role trigger.
DO $$
BEGIN
  IF to_regprocedure('private.can_any(text[])') IS NOT NULL
     AND to_regprocedure('private.has_role(text[])') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION private.guard_order_deadline_columns()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $body$
      DECLARE
        deadline_changed boolean;
      BEGIN
        deadline_changed :=
             NEW.original_deadline IS DISTINCT FROM OLD.original_deadline
          OR NEW.revised_deadline IS DISTINCT FROM OLD.revised_deadline
          OR NEW.deadline_revised_at IS DISTINCT FROM OLD.deadline_revised_at
          OR NEW.deadline_revised_by IS DISTINCT FROM OLD.deadline_revised_by
          OR NEW.deadline_revision_reason IS DISTINCT FROM OLD.deadline_revision_reason
          OR NEW.client_informed IS DISTINCT FROM OLD.client_informed
          OR NEW.client_informed_at IS DISTINCT FROM OLD.client_informed_at
          OR NEW.client_informed_by IS DISTINCT FROM OLD.client_informed_by;

        IF deadline_changed
           AND coalesce(private.has_role(ARRAY['Plant Manager', 'Production Manager', 'Sales Manager']), false) IS NOT TRUE THEN
          RAISE EXCEPTION 'Only Admin, Plant Manager, Production Manager, or Sales Manager can revise an order deadline'
            USING ERRCODE = '42501';
        END IF;

        IF OLD.original_deadline IS NOT NULL THEN
          NEW.original_deadline := OLD.original_deadline;
        ELSIF NEW.original_deadline IS NULL AND NEW.revised_deadline IS NOT NULL THEN
          NEW.original_deadline := COALESCE(OLD.target_delivery_date, OLD.delivery_date);
        END IF;

        RETURN NEW;
      END;
      $body$
    $fn$;

    EXECUTE 'REVOKE ALL ON FUNCTION private.guard_order_deadline_columns() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.guard_order_deadline_columns() TO authenticated';

    EXECUTE 'DROP TRIGGER IF EXISTS orders_guard_deadline_columns ON public.orders';
    EXECUTE 'CREATE TRIGGER orders_guard_deadline_columns BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.guard_order_deadline_columns()';

    EXECUTE 'REVOKE ALL ON TABLE public.order_deadline_revisions FROM anon, PUBLIC';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.order_deadline_revisions TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS order_deadline_revisions_select ON public.order_deadline_revisions';
    EXECUTE 'DROP POLICY IF EXISTS order_deadline_revisions_insert ON public.order_deadline_revisions';
    EXECUTE 'DROP POLICY IF EXISTS "Allow anon and auth full access" ON public.order_deadline_revisions';
    EXECUTE $policy$
      CREATE POLICY order_deadline_revisions_select
      ON public.order_deadline_revisions
      FOR SELECT
      TO authenticated
      USING (private.can_any(ARRAY['orders','job_punching','sales','production_records','printing_scheduler']))
    $policy$;
    EXECUTE $policy$
      CREATE POLICY order_deadline_revisions_insert
      ON public.order_deadline_revisions
      FOR INSERT
      TO authenticated
      WITH CHECK (
        private.can_any(ARRAY['orders','job_punching','sales','production_records','printing_scheduler'])
        AND private.has_role(ARRAY['Plant Manager', 'Production Manager', 'Sales Manager'])
      )
    $policy$;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_deadline_revisions TO anon, authenticated';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'order_deadline_revisions'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY "Allow anon and auth full access"
        ON public.order_deadline_revisions
        FOR ALL
        TO anon, authenticated
        USING (true)
        WITH CHECK (true)
      $policy$;
    END IF;
  END IF;
END $$;
