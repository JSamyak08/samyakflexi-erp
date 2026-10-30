-- Pre-printing deadline edits are limited to Admin and Sales Manager.
-- private.has_role already treats Admin as allowed. This replaces the guard
-- and the history insert policy from the earlier deadline migrations.
-- Existing order rows are not updated.

DO $$
BEGIN
  IF to_regprocedure('private.has_role(text[])') IS NULL
     OR to_regclass('public.orders') IS NULL THEN
    RETURN;
  END IF;

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
         AND coalesce(private.has_role(ARRAY['Sales Manager']), false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Only Admin or Sales Manager can revise an order deadline'
          USING ERRCODE = '42501';
      END IF;

      IF OLD.original_deadline IS NOT NULL THEN
        NEW.original_deadline := OLD.original_deadline;
      ELSIF NEW.original_deadline IS NULL AND NEW.revised_deadline IS NOT NULL THEN
        NEW.original_deadline := COALESCE(OLD.target_delivery_date, OLD.delivery_date);
      END IF;

      IF NEW.revised_deadline IS DISTINCT FROM OLD.revised_deadline THEN
        NEW.client_informed := NULL;
        NEW.client_informed_at := NULL;
        NEW.client_informed_by := NULL;
      END IF;

      RETURN NEW;
    END;
    $body$
  $fn$;

  EXECUTE 'REVOKE ALL ON FUNCTION private.guard_order_deadline_columns() FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION private.guard_order_deadline_columns() TO authenticated';

  EXECUTE 'DROP TRIGGER IF EXISTS orders_guard_deadline_columns ON public.orders';
  EXECUTE 'CREATE TRIGGER orders_guard_deadline_columns BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.guard_order_deadline_columns()';

  IF to_regclass('public.order_deadline_revisions') IS NOT NULL
     AND to_regprocedure('private.can_any(text[])') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS order_deadline_revisions_insert ON public.order_deadline_revisions';
    EXECUTE $policy$
      CREATE POLICY order_deadline_revisions_insert
      ON public.order_deadline_revisions
      FOR INSERT
      TO authenticated
      WITH CHECK (
        private.can_any(ARRAY['orders','job_punching','sales','production_records','printing_scheduler'])
        AND private.has_role(ARRAY['Sales Manager'])
      )
    $policy$;
  END IF;
END $$;
