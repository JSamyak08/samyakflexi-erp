-- NOT APPLIED.
-- Read this file in review. Do not run it against production in this change.
-- Existing rows are not scanned: every CHECK is NOT VALID.
-- New writes are still checked once the migration is applied.
-- jsonb process_logs is not covered by these column checks.
-- The app writes through the Supabase client, so these checks are a gap until applied.
--
-- There is NO check that SFG or FG on hand must stay within 110% of the order quantity.
--
-- Manual close is also enforced here, using the same auth.uid() lookup as
-- private.caller_is_verified_admin() (public.users.auth_user_id, role = Admin).
-- It does not depend on the pending RLS change. service_role may still write.
-- Auto-close (close_mode = auto) is allowed for any signed-in user.
-- Until this migration is applied, Admin is enforced only in
-- buildManualClose, manualCloseGuard, and the order save path.
-- job_details is checked as well, because that is where the app stores the
-- close fields before these columns exist.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS closed_by text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS close_reason text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS close_mode text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS over_dispatch_warning text;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_close_mode_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_close_mode_check
  CHECK (close_mode IS NULL OR close_mode IN ('manual', 'auto')) NOT VALID;

ALTER TABLE public.production_records DROP CONSTRAINT IF EXISTS production_records_ink_gsm_bounds;
ALTER TABLE public.production_records
  ADD CONSTRAINT production_records_ink_gsm_bounds
  CHECK (actual_ink_gsm IS NULL OR (actual_ink_gsm >= 0 AND actual_ink_gsm <= 20)) NOT VALID;

ALTER TABLE public.production_records DROP CONSTRAINT IF EXISTS production_records_adhesive_gsm_bounds;
ALTER TABLE public.production_records
  ADD CONSTRAINT production_records_adhesive_gsm_bounds
  CHECK (actual_adhesive_gsm IS NULL OR (actual_adhesive_gsm >= 0 AND actual_adhesive_gsm <= 20)) NOT VALID;

ALTER TABLE public.production_records DROP CONSTRAINT IF EXISTS production_records_wastage_bounds;
ALTER TABLE public.production_records
  ADD CONSTRAINT production_records_wastage_bounds
  CHECK (wastage_percentage IS NULL OR (wastage_percentage >= 0 AND wastage_percentage <= 100)) NOT VALID;

ALTER TABLE public.production_records DROP CONSTRAINT IF EXISTS production_records_weight_bounds;
ALTER TABLE public.production_records
  ADD CONSTRAINT production_records_weight_bounds
  CHECK (
    (gross_production_kg IS NULL OR gross_production_kg >= 0)
    AND (net_usable_kg IS NULL OR net_usable_kg >= 0)
    AND (total_wastage_kg IS NULL OR total_wastage_kg >= 0)
  ) NOT VALID;

COMMENT ON CONSTRAINT orders_close_mode_check ON public.orders IS
  'NOT APPLIED in the guardrail change. manual is Admin-only once this migration is applied.';

CREATE OR REPLACE FUNCTION public.guard_manual_order_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  allowed boolean;
  new_manual boolean;
  old_manual boolean;
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  new_manual := NEW.close_mode = 'manual'
    OR COALESCE(NEW.job_details->>'closeMode', '') = 'manual';
  old_manual := TG_OP = 'UPDATE' AND (
    OLD.close_mode = 'manual'
    OR COALESCE(OLD.job_details->>'closeMode', '') = 'manual'
  );

  IF new_manual IS NOT DISTINCT FROM old_manual AND NOT (old_manual AND NEW.status IS DISTINCT FROM 'Completed' AND OLD.status = 'Completed') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE auth.uid() IS NOT NULL
      AND u.id NOT LIKE 'USR-SETTING-%'
      AND (
        u.auth_user_id = auth.uid()
        OR (u.auth_user_id IS NULL AND u.id = (auth.uid())::text)
      )
      AND u.role = 'Admin'
      AND u.active IS NOT FALSE
      AND (u.status IS NULL OR u.status = 'Active')
  ) INTO allowed;

  IF allowed IS TRUE THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an Admin can manually close or reopen an order'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS guard_manual_order_close ON public.orders;
CREATE TRIGGER guard_manual_order_close
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_manual_order_close();
