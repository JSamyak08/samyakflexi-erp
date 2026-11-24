-- Plain-substrate extra print percent. Default 3.
-- An existing row is left unchanged so a later Admin edit is not overwritten.
-- Only Admin may insert, update, or delete this key. Other settings are untouched.

CREATE OR REPLACE FUNCTION public.guard_extra_print_percent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  key text;
BEGIN
  key := lower(COALESCE(CASE WHEN TG_OP = 'DELETE' THEN OLD.setting_key ELSE NEW.setting_key END, ''));
  IF key <> 'extra_print_percent' THEN
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
  RAISE EXCEPTION 'Only an Admin can edit the extra print percent'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_extra_print_percent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_extra_print_percent() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'system_settings_guard_extra_print_percent'
      AND tgrelid = 'public.system_settings'::regclass
  ) THEN
    CREATE TRIGGER system_settings_guard_extra_print_percent
      BEFORE INSERT OR UPDATE OR DELETE ON public.system_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_extra_print_percent();
  END IF;
END $$;

INSERT INTO public.system_settings (setting_key, setting_value, updated_at)
VALUES ('extra_print_percent', '3', pg_catalog.now())
ON CONFLICT (setting_key) DO NOTHING;
