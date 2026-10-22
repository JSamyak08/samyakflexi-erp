-- Stop a non-admin from changing role, status, or permissions.
--
-- The check reads public.users for auth.uid(). It does not read JWT
-- app_metadata or user_metadata. current_user is the invoker, so a forged
-- request.jwt.claim.role cannot impersonate service_role. service_role,
-- postgres, supabase_admin, and supabase_auth_admin (the signup trigger's
-- definer owner) may still provision accounts.
--
-- is_admin and permissions are guarded when those columns exist. active is
-- guarded with status because the API stores account status in both.
-- role_permissions, and the system_settings.role_permissions fallback, are
-- admin-only writes.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres, service_role, authenticated;

CREATE OR REPLACE FUNCTION private.caller_is_verified_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  found boolean;
BEGIN
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
  ) INTO found;
  RETURN found IS TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION private.privilege_write_allowed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
    RETURN true;
  END IF;
  RETURN private.caller_is_verified_admin();
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_user_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  allowed boolean;
  new_row jsonb;
  old_row jsonb;
BEGIN
  allowed := private.privilege_write_allowed();

  IF TG_OP = 'DELETE' THEN
    IF NOT allowed THEN
      RAISE EXCEPTION 'Only an Admin can change role, permissions, or status'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF allowed THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Only an Admin can change role, permissions, or status'
      USING ERRCODE = '42501';
  END IF;

  new_row := to_jsonb(NEW);
  old_row := to_jsonb(OLD);
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.active IS DISTINCT FROM OLD.active
     OR (new_row ? 'is_admin' AND new_row -> 'is_admin' IS DISTINCT FROM old_row -> 'is_admin')
     OR (new_row ? 'permissions' AND new_row -> 'permissions' IS DISTINCT FROM old_row -> 'permissions')
  THEN
    RAISE EXCEPTION 'Only an Admin can change role, permissions, or status'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_role_permission_rows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.privilege_write_allowed() THEN
    RAISE EXCEPTION 'Only an Admin can change role permissions'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_role_permission_setting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  touches boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    touches := OLD.setting_key = 'role_permissions';
  ELSIF TG_OP = 'UPDATE' THEN
    touches := NEW.setting_key = 'role_permissions' OR OLD.setting_key = 'role_permissions';
  ELSE
    touches := NEW.setting_key = 'role_permissions';
  END IF;

  IF touches AND NOT private.privilege_write_allowed() THEN
    RAISE EXCEPTION 'Only an Admin can change role permissions'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.caller_is_verified_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.privilege_write_allowed() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_user_privilege_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_role_permission_rows() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_role_permission_setting() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.caller_is_verified_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.privilege_write_allowed() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.guard_user_privilege_columns() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.guard_role_permission_rows() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.guard_role_permission_setting() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS users_protect_directory ON public.users;
DROP TRIGGER IF EXISTS users_guard_privilege_columns ON public.users;
CREATE TRIGGER users_guard_privilege_columns
  BEFORE INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_user_privilege_columns();

DROP TRIGGER IF EXISTS role_permissions_guard_privilege ON public.role_permissions;
CREATE TRIGGER role_permissions_guard_privilege
  BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_role_permission_rows();

DROP TRIGGER IF EXISTS system_settings_guard_role_permissions ON public.system_settings;
CREATE TRIGGER system_settings_guard_role_permissions
  BEFORE INSERT OR UPDATE OR DELETE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_role_permission_setting();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_settings'
      AND column_name = 'plant_manager_email'
  ) THEN
    ALTER TABLE public.email_settings
      ALTER COLUMN plant_manager_email SET DEFAULT 'admin@samyakinternational.in';
    UPDATE public.email_settings
       SET plant_manager_email = 'admin@samyakinternational.in'
     WHERE lower(plant_manager_email) = 'plant.manager@plant.com';
  END IF;
END $$;
