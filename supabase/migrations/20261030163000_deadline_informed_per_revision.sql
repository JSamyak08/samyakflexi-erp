-- Client informed belongs to one revised deadline. Changing that date
-- clears the tick, including on databases that already installed the
-- earlier guard function. Existing rows are not updated.

DO $$
BEGIN
  IF to_regprocedure('private.has_role(text[])') IS NULL THEN
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
         AND coalesce(private.has_role(ARRAY['Plant Manager', 'Production Manager', 'Sales Manager']), false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Only Admin, Plant Manager, Production Manager, or Sales Manager can revise an order deadline'
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
END $$;
