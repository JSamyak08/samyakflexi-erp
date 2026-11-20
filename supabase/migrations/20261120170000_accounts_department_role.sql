-- Accounts Department Role Access:
-- 1. Inward GRN (inventory)
-- 2. Vendor Directory (vendors)
-- 3. Dispatch Challans & Packing Lists (dispatch)
-- 4. Employee Management: General Read Access, Disburse Access for Salary & Advances only
-- 5. Sales & Quotations: Read Access only (sales)

-- 1. Add Accounts Manager and Accounts to private.app_role()
CREATE OR REPLACE FUNCTION private.app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.role
  FROM public.users u
  WHERE (
      u.auth_user_id = auth.uid()
      OR (u.auth_user_id IS NULL AND u.id = auth.uid()::text)
    )
    AND u.id NOT LIKE 'USR-SETTING-%'
    AND coalesce(u.active, true) = true
    AND lower(coalesce(u.status, 'Active')) = 'active'
    AND u.role IN (
      'Admin',
      'Plant Manager',
      'Production Manager',
      'Sales Manager',
      'Purchase Manager',
      'Store Manager',
      'QC Chemist',
      'Printing Operator',
      'Shop Floor Operator',
      'HR & Payroll Manager',
      'Accounts Manager',
      'Accounts'
    )
  ORDER BY (u.auth_user_id = auth.uid()) DESC
  LIMIT 1;
$$;

-- 2. Add Accounts Manager and Accounts to private.app_roles()
CREATE OR REPLACE FUNCTION private.app_roles()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT ARRAY(
      SELECT DISTINCT candidate
      FROM (
        SELECT u.role AS candidate
        UNION ALL
        SELECT unnest(coalesce(u.assigned_roles, ARRAY[]::text[]))
      ) AS raw(candidate)
      WHERE candidate IN (
        'Admin',
        'Plant Manager',
        'Production Manager',
        'Sales Manager',
        'Purchase Manager',
        'Store Manager',
        'QC Chemist',
        'Printing Operator',
        'Shop Floor Operator',
        'HR & Payroll Manager',
        'Accounts Manager',
        'Accounts'
      )
    )
    FROM public.users AS u
    WHERE (
        u.auth_user_id = auth.uid()
        OR (u.auth_user_id IS NULL AND u.id = auth.uid()::text)
      )
      AND u.id NOT LIKE 'USR-SETTING-%'
      AND coalesce(u.active, true) = true
      AND lower(coalesce(u.status, 'Active')) = 'active'
    ORDER BY (u.auth_user_id = auth.uid()) DESC
    LIMIT 1
  ), ARRAY[]::text[]);
$$;

REVOKE ALL ON FUNCTION private.app_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.app_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.app_roles() TO authenticated;

-- 3. Upsert default role_permissions for Accounts Manager and Accounts
INSERT INTO public.role_permissions (role, permissions, updated_at)
VALUES
  (
    'Accounts Manager',
    jsonb_build_object(
      'dashboard', true,
      'inventory', true,
      'vendors', true,
      'dispatch', true,
      'employees', true,
      'sales', true,
      'purchase_orders', false,
      'production_records', false,
      'job_punching', false,
      'orders', false,
      'clients', false,
      'maintenance', false,
      'film_inventory', false,
      'ink_management', false,
      'cylinder_management', false,
      'material_indents', false,
      'qc_inspection', false,
      'system_settings', false,
      'user_management', false,
      'audit_logs', false
    ),
    now()
  ),
  (
    'Accounts',
    jsonb_build_object(
      'dashboard', true,
      'inventory', true,
      'vendors', true,
      'dispatch', true,
      'employees', true,
      'sales', true,
      'purchase_orders', false,
      'production_records', false,
      'job_punching', false,
      'orders', false,
      'clients', false,
      'maintenance', false,
      'film_inventory', false,
      'ink_management', false,
      'cylinder_management', false,
      'material_indents', false,
      'qc_inspection', false,
      'system_settings', false,
      'user_management', false,
      'audit_logs', false
    ),
    now()
  )
ON CONFLICT (role) DO UPDATE
SET permissions = EXCLUDED.permissions,
    updated_at = now();

-- 4. Update private.guard_salary_payment_authorization() to allow Accounts role
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

  IF to_regprocedure('private.caller_is_verified_admin()') IS NOT NULL
     AND private.caller_is_verified_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF to_regprocedure('private.has_role(text[])') IS NOT NULL
     AND private.has_role(ARRAY['Accounts Manager', 'Accounts']::text[]) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Only an Admin can delete a salary payment'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an Admin or Accounts can authorize a salary payment'
    USING ERRCODE = '42501';
END;
$$;

-- 5. Update private.guard_salary_advance() to allow Accounts disbursal and payroll recovery
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
     AND NOT private.has_role(ARRAY['HR & Payroll Manager', 'Accounts Manager', 'Accounts']::text[]) THEN
    RAISE EXCEPTION 'Only payroll approvers can record a salary advance'
      USING ERRCODE = '42501';
  END IF;

  actor := coalesce(private.salary_advance_actor_name(), private.app_role(), 'Payroll');
  unsettled := private.employee_has_unsettled_advance(NEW.employee_id, NEW.id);

  IF TG_OP = 'INSERT' THEN
    IF private.salary_advance_exists(NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Accounts role has read and disbursal access only; they cannot request advances
    IF to_regprocedure('private.has_role(text[])') IS NOT NULL
       AND private.has_role(ARRAY['Accounts Manager', 'Accounts']::text[])
       AND NOT private.caller_is_verified_admin()
       AND NOT private.has_role(ARRAY['HR & Payroll Manager']::text[]) THEN
      RAISE EXCEPTION 'Accounts role is not authorized to request new salary advances'
        USING ERRCODE = '42501';
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
    -- Disbursing an Approved advance by Accounts is permitted
    IF OLD.status = 'Approved' AND NEW.status = 'Disbursed'
       AND to_regprocedure('private.has_role(text[])') IS NOT NULL
       AND private.has_role(ARRAY['Accounts Manager', 'Accounts']::text[]) THEN
      -- Permitted
    -- Recovering an advance balance in salary payment by Accounts is permitted
    ELSIF OLD.status IN ('Disbursed', 'Approved & Disbursed')
       AND to_regprocedure('private.has_role(text[])') IS NOT NULL
       AND private.has_role(ARRAY['Accounts Manager', 'Accounts']::text[])
       AND (NEW.status = OLD.status OR (NEW.status = 'Fully Recovered' AND coalesce(NEW.remaining_balance, 0) = 0)) THEN
      -- Permitted
    ELSIF OLD.status IS DISTINCT FROM 'Requested'
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
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Unsupported salary advance transition from % to %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END;
$$;

-- 6. Add RLS Policies for Accounts on Employee, Attendance, Advances, and Payments
DO $$
BEGIN
  IF to_regclass('public.employees') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS employees_accounts_select ON public.employees';
    EXECUTE $pol$
      CREATE POLICY employees_accounts_select ON public.employees
        FOR SELECT TO authenticated
        USING (private.has_role(ARRAY['Accounts Manager', 'Accounts']));
    $pol$;
  END IF;

  IF to_regclass('public.employee_attendance') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS employee_attendance_accounts_select ON public.employee_attendance';
    EXECUTE $pol$
      CREATE POLICY employee_attendance_accounts_select ON public.employee_attendance
        FOR SELECT TO authenticated
        USING (private.has_role(ARRAY['Accounts Manager', 'Accounts']));
    $pol$;
  END IF;

  IF to_regclass('public.salary_advances') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS salary_advances_accounts ON public.salary_advances';
    EXECUTE $pol$
      CREATE POLICY salary_advances_accounts ON public.salary_advances
        FOR ALL TO authenticated
        USING (private.has_role(ARRAY['Accounts Manager', 'Accounts']))
        WITH CHECK (private.has_role(ARRAY['Accounts Manager', 'Accounts']));
    $pol$;
  END IF;

  IF to_regclass('public.salary_payments') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS salary_payments_accounts ON public.salary_payments';
    EXECUTE $pol$
      CREATE POLICY salary_payments_accounts ON public.salary_payments
        FOR ALL TO authenticated
        USING (private.has_role(ARRAY['Accounts Manager', 'Accounts']))
        WITH CHECK (private.has_role(ARRAY['Accounts Manager', 'Accounts']));
    $pol$;
  END IF;
END $$;
