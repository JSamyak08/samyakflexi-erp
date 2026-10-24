-- Salary advance upserts are INSERT ... ON CONFLICT DO UPDATE.
-- A BEFORE INSERT trigger runs before Postgres notices the id already
-- exists. The previous guard treated that insert as a brand-new request
-- and rejected every status other than Requested, so Approve (including
-- Approve with Override) and Disburse never reached the UPDATE branch.
-- The row stayed where it was, and the screen's save failed.
--
-- When the id is already stored, leave the proposed row alone and let the
-- UPDATE branch enforce Requested -> Approved -> Disbursed. A genuine new
-- id still has to start as Requested.
--
-- policy_override_by / policy_override_at are an audit stamp written by
-- the approval branch. Later upserts echo the browser's copy of those
-- columns. Only a change to the policy_override flag is rejected outside
-- Requested -> Approved. Disbursal copies the stored audit columns and
-- still requires a payment reference for Admin and HR & Payroll Manager.

CREATE OR REPLACE FUNCTION private.salary_advance_exists(advance_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.salary_advances
    WHERE id = advance_id
  );
$$;

CREATE OR REPLACE FUNCTION private.guard_salary_advance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  actor text;
  unsettled boolean;
BEGIN
  -- Invoker role. SECURITY INVOKER so current_user is the session role
  -- (authenticated or service_role), not the function owner.
  IF current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF NOT private.has_role(ARRAY['HR & Payroll Manager']::text[]) THEN
    RAISE EXCEPTION 'Only payroll approvers can record a salary advance'
      USING ERRCODE = '42501';
  END IF;

  actor := coalesce(private.salary_advance_actor_name(), private.app_role(), 'Payroll');
  unsettled := private.employee_has_unsettled_advance(NEW.employee_id, NEW.id);

  IF TG_OP = 'INSERT' THEN
    -- Upsert of a row that is already stored. Do not rewrite NEW: ON CONFLICT
    -- uses this row as EXCLUDED, and forcing Requested would discard the
    -- approval or disbursal. The UPDATE trigger still enforces the stage.
    IF private.salary_advance_exists(NEW.id) THEN
      RETURN NEW;
    END IF;

    IF NEW.status IS NULL OR btrim(NEW.status) = '' THEN
      NEW.status := 'Requested';
    END IF;
    IF NEW.status IS DISTINCT FROM 'Requested' THEN
      RAISE EXCEPTION 'A new salary advance must start as Requested'
        USING ERRCODE = '23514';
    END IF;
    IF coalesce(NEW.policy_override, false) THEN
      RAISE EXCEPTION 'A policy override cannot be set when the advance is requested'
        USING ERRCODE = '42501';
    END IF;
    IF unsettled AND NOT private.caller_is_verified_admin() THEN
      RAISE EXCEPTION 'An employee with an unsettled advance cannot receive a new advance request'
        USING ERRCODE = '42501';
    END IF;
    NEW.policy_override := false;
    NEW.policy_override_by := NULL;
    NEW.policy_override_at := NULL;
    NEW.payment_reference := NULL;
    NEW.disbursed_date := NULL;
    NEW.disbursed_by := NULL;
    NEW.approved_by := NULL;
    NEW.approved_date := NULL;
    RETURN NEW;
  END IF;

  -- The flag can change only on Admin approval. by/at are rewritten below
  -- and must not block a later disbursal upsert that echoes them.
  IF NEW.policy_override IS DISTINCT FROM OLD.policy_override THEN
    IF NOT (OLD.status = 'Requested' AND NEW.status = 'Approved') THEN
      RAISE EXCEPTION 'A policy override can only be recorded when an Admin approves'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
       AND private.employee_has_unsettled_advance(NEW.employee_id, NEW.id)
       AND NOT private.caller_is_verified_admin() THEN
      RAISE EXCEPTION 'An employee with an unsettled advance cannot receive a new advance request'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'Disbursed' AND length(btrim(coalesce(NEW.payment_reference, ''))) = 0 THEN
      IF length(btrim(coalesce(OLD.payment_reference, ''))) = 0 THEN
        RAISE EXCEPTION 'A disbursed salary advance must keep its payment reference'
          USING ERRCODE = '23514';
      END IF;
      NEW.payment_reference := OLD.payment_reference;
    END IF;
    IF NEW.status IN ('Requested', 'Approved') THEN
      NEW.payment_reference := NULL;
      NEW.disbursed_by := NULL;
    ELSE
      NEW.disbursed_by := OLD.disbursed_by;
    END IF;
    NEW.approved_by := OLD.approved_by;
    NEW.approved_date := OLD.approved_date;
    NEW.policy_override := OLD.policy_override;
    NEW.policy_override_by := OLD.policy_override_by;
    NEW.policy_override_at := OLD.policy_override_at;
    RETURN NEW;
  END IF;

  IF OLD.status = 'Requested' AND NEW.status = 'Approved' THEN
    IF unsettled THEN
      IF NOT private.caller_is_verified_admin() OR private.app_role() IS DISTINCT FROM 'Admin' THEN
        RAISE EXCEPTION 'Only an Admin can approve a salary advance while a previous advance is unsettled'
          USING ERRCODE = '42501';
      END IF;
      IF NOT coalesce(NEW.policy_override, false) THEN
        RAISE EXCEPTION 'An Admin must record a policy override to approve while a previous advance is unsettled'
          USING ERRCODE = '42501';
      END IF;
      NEW.policy_override := true;
      NEW.policy_override_by := actor;
      NEW.policy_override_at := now();
    ELSE
      IF coalesce(NEW.policy_override, false) THEN
        RAISE EXCEPTION 'A policy override is only for approving while a previous advance is unsettled'
          USING ERRCODE = '42501';
      END IF;
      NEW.policy_override := false;
      NEW.policy_override_by := NULL;
      NEW.policy_override_at := NULL;
    END IF;
    NEW.approved_by := actor;
    NEW.approved_date := to_char((CURRENT_DATE)::date, 'YYYY-MM-DD');
    NEW.payment_reference := NULL;
    NEW.disbursed_date := NULL;
    NEW.disbursed_by := NULL;
    RETURN NEW;
  END IF;

  IF OLD.status = 'Approved' AND NEW.status = 'Disbursed' THEN
    IF length(btrim(coalesce(NEW.payment_reference, ''))) = 0 THEN
      RAISE EXCEPTION 'A payment reference is required to disburse an approved salary advance'
        USING ERRCODE = '23514';
    END IF;
    NEW.payment_reference := btrim(NEW.payment_reference);
    IF NEW.disbursed_date IS NULL OR btrim(NEW.disbursed_date) = '' THEN
      NEW.disbursed_date := to_char((CURRENT_DATE)::date, 'YYYY-MM-DD');
    END IF;
    NEW.disbursed_by := actor;
    NEW.approved_by := OLD.approved_by;
    NEW.approved_date := OLD.approved_date;
    NEW.policy_override := OLD.policy_override;
    NEW.policy_override_by := OLD.policy_override_by;
    NEW.policy_override_at := OLD.policy_override_at;
    RETURN NEW;
  END IF;

  IF OLD.status = 'Disbursed' AND NEW.status = 'Fully Recovered' THEN
    IF coalesce(NEW.remaining_balance, 0) > 0 THEN
      RAISE EXCEPTION 'A salary advance can be fully recovered only after it is disbursed and the balance is zero'
        USING ERRCODE = '23514';
    END IF;
    IF length(btrim(coalesce(NEW.payment_reference, ''))) = 0 THEN
      NEW.payment_reference := OLD.payment_reference;
    END IF;
    NEW.approved_by := OLD.approved_by;
    NEW.approved_date := OLD.approved_date;
    NEW.disbursed_by := OLD.disbursed_by;
    NEW.policy_override := OLD.policy_override;
    NEW.policy_override_by := OLD.policy_override_by;
    NEW.policy_override_at := OLD.policy_override_at;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Salary advance status can only move forward: Requested, Approved, Disbursed, then Fully Recovered'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION private.salary_advance_exists(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_salary_advance() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION private.salary_advance_exists(text) FROM anon;
    REVOKE ALL ON FUNCTION private.guard_salary_advance() FROM anon;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION private.salary_advance_exists(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.guard_salary_advance() TO authenticated;
