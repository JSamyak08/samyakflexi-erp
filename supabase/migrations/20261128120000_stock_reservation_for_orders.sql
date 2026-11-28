-- Stock reservation for orders. Default off.
--
-- How to apply
-- 1. Apply this file on the test Supabase project before checking the screens.
-- 2. Production receives it from supabase/migrations when this change reaches
--    main. Do not run it by hand against production.
-- 3. It is safe to run more than once. It adds one guard function, one trigger
--    on system_settings, and one settings row when that key is missing.
--    Existing tables, views, policies, and functions stay in place, and order,
--    inventory, and stock rows are not changed.
--    Turning the setting on later uses those same rows.
--
-- An existing row is left unchanged so a later Admin edit is not overwritten.
-- Only Admin may insert, update, or delete this key. Other settings are untouched.
-- Number series (order ids, GRN, OCN, quotations, packing lists, cylinder codes)
-- are not stock reservations and are not gated here.

CREATE OR REPLACE FUNCTION public.guard_stock_reservation_for_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  key text;
BEGIN
  key := lower(COALESCE(CASE WHEN TG_OP = 'DELETE' THEN OLD.setting_key ELSE NEW.setting_key END, ''));
  IF key <> 'stock_reservation_for_orders' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL AND current_user NOT IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF private.has_role(ARRAY['Admin']) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Only an Admin can edit stock reservation for orders'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_stock_reservation_for_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_stock_reservation_for_orders() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'system_settings_guard_stock_reservation_for_orders'
      AND tgrelid = 'public.system_settings'::regclass
  ) THEN
    CREATE TRIGGER system_settings_guard_stock_reservation_for_orders
      BEFORE INSERT OR UPDATE OR DELETE ON public.system_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_stock_reservation_for_orders();
  END IF;
END $$;

INSERT INTO public.system_settings (setting_key, setting_value, updated_at)
VALUES ('stock_reservation_for_orders', 'false', pg_catalog.now())
ON CONFLICT (setting_key) DO NOTHING;
