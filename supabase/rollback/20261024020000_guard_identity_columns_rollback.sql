-- Restores the privilege trigger from 20261022060000_guard_privilege_columns.sql.
-- Running this re-opens the account-link gap. Do not run it on production
-- unless an Admin is locked out and the later lockdown policies are still in place.

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
