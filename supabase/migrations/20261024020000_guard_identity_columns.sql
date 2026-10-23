-- Reject non-admin changes to auth_user_id, email, and username.
-- The earlier privilege trigger blocked role, status, active, and permissions
-- only. A signed-in user could clear their own auth link and attach an Admin
-- row to their login. service_role, postgres, and the auth admin role can
-- still provision accounts. Idempotent.

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
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.username IS DISTINCT FROM OLD.username
     OR (new_row ? 'is_admin' AND new_row -> 'is_admin' IS DISTINCT FROM old_row -> 'is_admin')
     OR (new_row ? 'permissions' AND new_row -> 'permissions' IS DISTINCT FROM old_row -> 'permissions')
  THEN
    RAISE EXCEPTION 'Only an Admin can change role, permissions, status, auth link, email, or username'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_user_privilege_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.guard_user_privilege_columns() TO anon, authenticated, service_role;
