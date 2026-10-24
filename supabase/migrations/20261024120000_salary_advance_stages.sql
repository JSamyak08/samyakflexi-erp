-- Salary advance stages and the outstanding-advance rule.
--
-- Stages, forward only:
--   Requested -> Approved -> Disbursed -> Fully Recovered
-- Disbursed requires a payment reference. Fully Recovered is the existing
-- settlement status and is only reached from Disbursed.
-- There is no rejection or cancel status in the product, so none is added.
--
-- Legacy rows (production had no disbursal payment reference column):
--   * Pending Approval, blank, or null -> Requested.
--   * Fully Recovered is left as Fully Recovered. Balances, deduction
--     history, approved_by, and disbursed_date are not rewritten.
--   * Approved & Disbursed becomes Disbursed only when a payment reference
--     is already stored, a deduction-history paymentRef is present, or the
--     loan has already entered recovery (recovered amount, a history entry,
--     or remaining balance below the advance). Those rows were being
--     collected; demoting them would stop settlement. If no reference text
--     exists, payment_reference is set to LEGACY-<id>, a migration marker
--     rather than a bank UTR. A later same-status update may replace that
--     marker with the real reference; it cannot be cleared.
--   * Every other Approved & Disbursed row becomes Approved. The old screen
--     stamped disbursed_date at request time, so that date is not treated as
--     proof of payment. The column is left in place (non-destructive). EMI
--     starts only after a real payment reference moves the row to Disbursed.
--
-- Outstanding policy:
--   A new request is rejected when the employee already has an unsettled
--   advance, unless the caller is a verified Admin. The inserted status is
--   always Requested, and policy_override cannot be set on insert.
--   Approving that later request requires private.caller_is_verified_admin()
--   and an explicit policy_override flag. The trigger stamps who and when.
--   No other role can insert the second request or approve it.
--
-- Payroll writes stay on private.has_role(ARRAY['HR & Payroll Manager']),
-- which already includes Admin. private.can_any is not a grant path: the
-- permission matrix must not widen payroll
-- (20261024023000_auth_rls_lockdown.sql).

ALTER TABLE public.salary_advances
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS disbursed_by text,
  ADD COLUMN IF NOT EXISTS policy_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS policy_override_by text,
  ADD COLUMN IF NOT EXISTS policy_override_at timestamptz;

COMMENT ON COLUMN public.salary_advances.payment_reference IS
  'Disbursal payment reference. Required once status is Disbursed. LEGACY-<id> marks a recovered loan that had no stored reference.';
COMMENT ON COLUMN public.salary_advances.policy_override IS
  'True only when an Admin approved this advance while an earlier one was still unsettled.';
COMMENT ON COLUMN public.salary_advances.policy_override_by IS
  'Display name of the Admin who recorded the outstanding-advance override.';
COMMENT ON COLUMN public.salary_advances.policy_override_at IS
  'When the Admin recorded the outstanding-advance override.';

UPDATE public.salary_advances AS sa
SET
  status = 'Disbursed',
  payment_reference = COALESCE(
    NULLIF(btrim(sa.payment_reference), ''),
    (
      SELECT NULLIF(btrim(entry->>'paymentRef'), '')
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(sa.deduction_history) = 'array' THEN sa.deduction_history
          ELSE '[]'::jsonb
        END
      ) AS entry
      WHERE NULLIF(btrim(entry->>'paymentRef'), '') IS NOT NULL
      LIMIT 1
    ),
    'LEGACY-' || sa.id
  )
WHERE sa.status = 'Approved & Disbursed'
  AND (
    NULLIF(btrim(coalesce(sa.payment_reference, '')), '') IS NOT NULL
    OR coalesce(sa.total_recovered_amount, 0) > 0
    OR (
      jsonb_typeof(coalesce(sa.deduction_history, '[]'::jsonb)) = 'array'
      AND jsonb_array_length(coalesce(sa.deduction_history, '[]'::jsonb)) > 0
    )
    OR (
      sa.advance_amount IS NOT NULL
      AND sa.remaining_balance IS NOT NULL
      AND sa.remaining_balance < sa.advance_amount
    )
  );

UPDATE public.salary_advances
SET status = 'Approved'
WHERE status = 'Approved & Disbursed';

UPDATE public.salary_advances
SET status = 'Requested'
WHERE status IS NULL
   OR btrim(status) = ''
   OR status = 'Pending Approval';

ALTER TABLE public.salary_advances
  ALTER COLUMN status SET DEFAULT 'Requested';

ALTER TABLE public.salary_advances
  DROP CONSTRAINT IF EXISTS salary_advances_status_check;
ALTER TABLE public.salary_advances
  ADD CONSTRAINT salary_advances_status_check
  CHECK (status IN ('Requested', 'Approved', 'Disbursed', 'Fully Recovered'));

ALTER TABLE public.salary_advances
  DROP CONSTRAINT IF EXISTS salary_advances_disbursed_ref_check;
ALTER TABLE public.salary_advances
  ADD CONSTRAINT salary_advances_disbursed_ref_check
  CHECK (
    status IS DISTINCT FROM 'Disbursed'
    OR length(btrim(coalesce(payment_reference, ''))) > 0
  );

CREATE INDEX IF NOT EXISTS salary_advances_open_employee_idx
  ON public.salary_advances (employee_id)
  WHERE status IN ('Requested', 'Approved', 'Disbursed');

CREATE OR REPLACE FUNCTION private.employee_has_unsettled_advance(p_employee_id text, p_except_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.salary_advances AS other
    WHERE other.employee_id = p_employee_id
      AND other.id IS DISTINCT FROM p_except_id
      AND other.status IN ('Requested', 'Approved', 'Disbursed')
      AND NOT (
        other.status = 'Disbursed'
        AND coalesce(other.remaining_balance, 0) <= 0
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.salary_advance_actor_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    nullif(btrim(u.full_name), ''),
    nullif(btrim(u.username), ''),
    private.app_role()
  )
  FROM public.users AS u
  WHERE (
      u.auth_user_id = auth.uid()
      OR (u.auth_user_id IS NULL AND u.id = (auth.uid())::text)
    )
    AND u.id NOT LIKE 'USR-SETTING-%'
  ORDER BY (u.auth_user_id = auth.uid()) DESC
  LIMIT 1;
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

  IF NEW.policy_override IS DISTINCT FROM OLD.policy_override
     OR NEW.policy_override_by IS DISTINCT FROM OLD.policy_override_by
     OR NEW.policy_override_at IS DISTINCT FROM OLD.policy_override_at THEN
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
    END IF;
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
    NEW.policy_override := OLD.policy_override;
    NEW.policy_override_by := OLD.policy_override_by;
    NEW.policy_override_at := OLD.policy_override_at;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Salary advance status can only move forward: Requested, Approved, Disbursed, then Fully Recovered'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION private.employee_has_unsettled_advance(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.salary_advance_actor_name() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_salary_advance() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION private.employee_has_unsettled_advance(text, text) FROM anon;
    REVOKE ALL ON FUNCTION private.salary_advance_actor_name() FROM anon;
    REVOKE ALL ON FUNCTION private.guard_salary_advance() FROM anon;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION private.employee_has_unsettled_advance(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.salary_advance_actor_name() TO authenticated;
GRANT EXECUTE ON FUNCTION private.guard_salary_advance() TO authenticated;

DROP TRIGGER IF EXISTS salary_advances_stage_guard ON public.salary_advances;
CREATE TRIGGER salary_advances_stage_guard
  BEFORE INSERT OR UPDATE ON public.salary_advances
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_salary_advance();
