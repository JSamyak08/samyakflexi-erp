-- Employee Management decisions are Admin only.
--
-- Roles that can already open the module may still add information:
-- a new attendance row, overtime hours on that new row, a salary-advance
-- request, and an edit of a request that is still Requested. They cannot
-- approve, reject, revert, disburse, recover, or authorize payroll.
-- This file does not change role_permissions and does not rewrite rows.
--
-- Overtime, on public.employee_attendance
--   A non-Admin may insert attendance. Overtime hours above zero stay out
--   of Approved and Rejected, and the approval stamp stays blank. Zero
--   overtime stored as Approved is the existing "no overtime to authorize"
--   mark, and it stays allowed. Updating a row that is already marked is
--   an attendance exception and is Admin only, which also blocks approve,
--   reject, and revert. Deleting a row that already carries an overtime
--   decision is Admin only. A plain attendance row with no decision can
--   still be removed.
--
-- Salary advances and loans, on public.salary_advances
--   private.guard_salary_advance() is replaced. A new row still has to
--   start as Requested, and an unsettled earlier advance still blocks a
--   second request unless the caller is a verified Admin. Moving a row
--   off Requested (approve, including the policy override, disburse, or
--   fully recover) and any later change, including a recovery balance,
--   require private.caller_is_verified_admin(). A same-status edit of a
--   Requested row stays open to the payroll writers who already hold it.
--   There is still no reject status on this table.
--
-- Payroll authorization, on public.salary_payments
--   Insert, update, and delete of a salary payment require a verified
--   Admin. Reading the sheet is unchanged.

CREATE OR REPLACE FUNCTION private.employee_overtime_decision(p_status text, p_hours numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_status, ''))) = 'rejected' THEN 'rejected'
    WHEN lower(btrim(coalesce(p_status, ''))) = 'approved'
         AND coalesce(p_hours, 0) > 0 THEN 'approved'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION private.guard_employee_attendance_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  decision text;
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF to_regprocedure('private.caller_is_verified_admin()') IS NOT NULL
     AND private.caller_is_verified_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF private.employee_overtime_decision(OLD.overtime_status, OLD.overtime_hours) IS NOT NULL THEN
      RAISE EXCEPTION 'Only an Admin can approve, reject, or revert overtime'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Only an Admin can approve, reject, revert overtime, or change attendance that is already marked'
      USING ERRCODE = '42501';
  END IF;

  decision := private.employee_overtime_decision(NEW.overtime_status, NEW.overtime_hours);
  IF decision IS NOT NULL
     OR length(btrim(coalesce(NEW.overtime_approved_by, ''))) > 0
     OR length(btrim(coalesce(NEW.overtime_approved_date, ''))) > 0 THEN
    RAISE EXCEPTION 'Only an Admin can approve or reject overtime'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_salary_payment_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF to_regprocedure('private.caller_is_verified_admin()') IS NULL
     OR NOT private.caller_is_verified_admin() THEN
    RAISE EXCEPTION 'Only an Admin can authorize a salary payment'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Replaces private.guard_salary_advance() from
-- 20261024140000_salary_advance_upsert_stage.sql. The stage rules are the
-- same. The new check refuses every authorization to a caller who is not
-- a verified Admin. Upserts of an existing id still fall through to the
-- UPDATE branch.
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
  IF current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF to_regprocedure('private.has_role(text[])') IS NOT NULL
     AND NOT private.has_role(ARRAY['HR & Payroll Manager']::text[]) THEN
    RAISE EXCEPTION 'Only payroll approvers can record a salary advance'
      USING ERRCODE = '42501';
  END IF;

  actor := coalesce(private.salary_advance_actor_name(), private.app_role(), 'Payroll');
  unsettled := private.employee_has_unsettled_advance(NEW.employee_id, NEW.id);

  IF TG_OP = 'INSERT' THEN
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

  IF NOT private.caller_is_verified_admin() THEN
    IF OLD.status IS DISTINCT FROM 'Requested'
       OR NEW.status IS DISTINCT FROM 'Requested'
       OR coalesce(NEW.policy_override, false) IS DISTINCT FROM coalesce(OLD.policy_override, false) THEN
      RAISE EXCEPTION 'Only an Admin can approve, disburse, recover, or otherwise authorize a salary advance'
        USING ERRCODE = '42501';
    END IF;
  END IF;

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
      IF NOT private.caller_is_verified_admin() THEN
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

REVOKE ALL ON FUNCTION private.employee_overtime_decision(text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_employee_attendance_authorization() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_salary_payment_authorization() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_salary_advance() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION private.employee_overtime_decision(text, numeric) FROM anon;
    REVOKE ALL ON FUNCTION private.guard_employee_attendance_authorization() FROM anon;
    REVOKE ALL ON FUNCTION private.guard_salary_payment_authorization() FROM anon;
    REVOKE ALL ON FUNCTION private.guard_salary_advance() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION private.employee_overtime_decision(text, numeric) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.guard_employee_attendance_authorization() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.guard_salary_payment_authorization() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.guard_salary_advance() TO authenticated;
  END IF;
END $$;

DO $attendance_trigger$
BEGIN
  IF to_regclass('public.employee_attendance') IS NULL
     OR to_regprocedure('private.caller_is_verified_admin()') IS NULL THEN
    RAISE NOTICE 'employee authorization: skipped attendance trigger';
    RETURN;
  END IF;
  EXECUTE 'DROP TRIGGER IF EXISTS employee_attendance_authorization ON public.employee_attendance';
  EXECUTE $sql$
    CREATE TRIGGER employee_attendance_authorization
      BEFORE INSERT OR UPDATE OR DELETE ON public.employee_attendance
      FOR EACH ROW
      EXECUTE FUNCTION private.guard_employee_attendance_authorization()
  $sql$;
END
$attendance_trigger$;

DO $payment_trigger$
BEGIN
  IF to_regclass('public.salary_payments') IS NULL
     OR to_regprocedure('private.caller_is_verified_admin()') IS NULL THEN
    RAISE NOTICE 'employee authorization: skipped salary payment trigger';
    RETURN;
  END IF;
  EXECUTE 'DROP TRIGGER IF EXISTS salary_payments_authorization ON public.salary_payments';
  EXECUTE $sql$
    CREATE TRIGGER salary_payments_authorization
      BEFORE INSERT OR UPDATE OR DELETE ON public.salary_payments
      FOR EACH ROW
      EXECUTE FUNCTION private.guard_salary_payment_authorization()
  $sql$;
END
$payment_trigger$;
