-- Multiple Assigned Plant Roles.
--
-- users.role stays the primary role. assigned_roles holds every role granted
-- to that person. Existing rows are copied into a one-element array and the
-- role, active, status, and auth link columns are not rewritten, so current
-- accounts keep the access they already have.
--
-- private.app_role() is unchanged and still returns that primary role.
-- private.app_roles() returns the primary role plus assigned_roles, limited
-- to the same plant-role list. private.has_role() and private.can_any()
-- grant the union. Admin still passes every helper. user_management and
-- audit_logs stay Admin-only in the app even when another role's matrix
-- flag is on.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres, service_role, authenticated;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS assigned_roles text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN public.users.assigned_roles IS
  'All plant roles assigned to this account. users.role remains the primary role.';

-- Backfill only. This statement does not assign a new role and does not
-- rewrite users.role.
UPDATE public.users AS u
SET assigned_roles = CASE
  WHEN u.assigned_roles IS NULL OR cardinality(u.assigned_roles) = 0 THEN ARRAY[u.role]::text[]
  WHEN u.role = ANY (u.assigned_roles) THEN u.assigned_roles
  ELSE u.assigned_roles || ARRAY[u.role]::text[]
END
WHERE u.role IS NOT NULL
  AND btrim(u.role) <> ''
  AND (
    u.assigned_roles IS NULL
    OR cardinality(u.assigned_roles) = 0
    OR NOT (u.role = ANY (u.assigned_roles))
  );

UPDATE public.users
SET assigned_roles = '{}'::text[]
WHERE assigned_roles IS NULL;

ALTER TABLE public.users
  ALTER COLUMN assigned_roles SET DEFAULT '{}'::text[];

ALTER TABLE public.users
  ALTER COLUMN assigned_roles SET NOT NULL;

-- Same active-user lookup as private.app_role(), but every assigned role.
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
        'HR & Payroll Manager'
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

CREATE OR REPLACE FUNCTION private.has_role(allowed text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(private.app_roles()) AS granted(role_name)
    WHERE granted.role_name = 'Admin'
       OR granted.role_name = ANY (allowed)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_any(modules text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(private.app_roles()) AS granted(role_name)
    WHERE granted.role_name = 'Admin'
       OR EXISTS (
         SELECT 1
         FROM public.role_permissions AS rp
         WHERE rp.role = granted.role_name
           AND EXISTS (
             SELECT 1
             FROM unnest(modules) AS requested(module_key)
             WHERE rp.permissions -> requested.module_key = 'true'::jsonb
           )
       )
  );
$$;

-- Admin status is still the Admin role. An Admin entry in assigned_roles
-- counts as well, which matches rows whose primary role was set to Admin.
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
      AND (
        u.role = 'Admin'
        OR 'Admin' = ANY (coalesce(u.assigned_roles, ARRAY[]::text[]))
      )
      AND u.active IS NOT FALSE
      AND (u.status IS NULL OR u.status = 'Active')
  ) INTO found;
  RETURN found IS TRUE;
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
     OR NEW.assigned_roles IS DISTINCT FROM OLD.assigned_roles
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

CREATE OR REPLACE FUNCTION private.protect_user_directory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF jwt_role IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND NOT private.has_role(ARRAY['Admin']) THEN
      RAISE EXCEPTION 'Only an Admin can create users';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.role IS DISTINCT FROM OLD.role AND NOT private.has_role(ARRAY['Admin']) THEN
        RAISE EXCEPTION 'Only an Admin can change roles';
      END IF;
      IF NEW.assigned_roles IS DISTINCT FROM OLD.assigned_roles AND NOT private.has_role(ARRAY['Admin']) THEN
        RAISE EXCEPTION 'Only an Admin can change roles';
      END IF;
      IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id AND NOT private.has_role(ARRAY['Admin']) THEN
        RAISE EXCEPTION 'Only an Admin can change the auth link';
      END IF;
      IF NEW.email IS DISTINCT FROM OLD.email AND NOT private.has_role(ARRAY['Admin']) THEN
        RAISE EXCEPTION 'Only an Admin can change the auth link, email, or username';
      END IF;
      IF NEW.username IS DISTINCT FROM OLD.username AND NOT private.has_role(ARRAY['Admin']) THEN
        RAISE EXCEPTION 'Only an Admin can change the auth link, email, or username';
      END IF;
      IF NEW.id LIKE 'USR-SETTING-%' OR OLD.id LIKE 'USR-SETTING-%' THEN
        RAISE EXCEPTION 'Settings are not stored on user rows';
      END IF;
    END IF;
    IF TG_OP = 'INSERT' AND NEW.id LIKE 'USR-SETTING-%' THEN
      RAISE EXCEPTION 'Settings are not stored on user rows';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Keep users.role inside assigned_roles. When Admin is assigned, it becomes
-- the primary role so existing Admin checks and the new array agree.
CREATE OR REPLACE FUNCTION private.sync_user_assigned_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  incoming text[] := ARRAY[]::text[];
  item text;
  primary_role text;
BEGIN
  IF NEW.assigned_roles IS NOT NULL THEN
    FOREACH item IN ARRAY NEW.assigned_roles LOOP
      item := btrim(coalesce(item, ''));
      IF item <> '' AND NOT item = ANY (incoming) THEN
        incoming := incoming || ARRAY[item];
      END IF;
    END LOOP;
  END IF;

  primary_role := btrim(coalesce(NEW.role, ''));

  IF cardinality(incoming) = 0 AND primary_role <> '' THEN
    incoming := ARRAY[primary_role];
  END IF;

  IF 'Admin' = ANY (incoming) THEN
    primary_role := 'Admin';
  ELSIF primary_role = '' OR NOT (primary_role = ANY (incoming)) THEN
    primary_role := incoming[1];
  END IF;

  IF primary_role <> '' AND NOT (primary_role = ANY (incoming)) THEN
    incoming := ARRAY[primary_role] || incoming;
  END IF;

  NEW.role := NULLIF(primary_role, '');
  NEW.assigned_roles := incoming;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.app_roles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_role(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_any(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.caller_is_verified_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.guard_user_privilege_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.protect_user_directory() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.sync_user_assigned_roles() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.app_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_any(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.caller_is_verified_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.guard_user_privilege_columns() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.protect_user_directory() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.sync_user_assigned_roles() TO authenticated, service_role;

DROP TRIGGER IF EXISTS users_guard_privilege_columns ON public.users;
CREATE TRIGGER users_guard_privilege_columns
  BEFORE INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_user_privilege_columns();

DROP TRIGGER IF EXISTS users_protect_directory ON public.users;
CREATE TRIGGER users_protect_directory
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_user_directory();

DROP TRIGGER IF EXISTS users_sync_assigned_roles ON public.users;
CREATE TRIGGER users_sync_assigned_roles
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_user_assigned_roles();
