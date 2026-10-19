-- Auth identity preparation. Safe to apply while the current app is still live:
-- anon policies are left in place, password_hash is left in place, and existing
-- role values are not overwritten. Run scripts/invite-existing-users.mjs after
-- this file and before the lockdown migration. See the pull request runbook.

-- ---------------------------------------------------------------------------
-- Link app users to Supabase Auth without trusting signup metadata
-- ---------------------------------------------------------------------------

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_key
  ON public.users (auth_user_id);

CREATE INDEX IF NOT EXISTS users_email_lower_idx
  ON public.users (lower(email));

ALTER TABLE public.users ALTER COLUMN role DROP NOT NULL;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_allowed;
ALTER TABLE public.users ADD CONSTRAINT users_role_allowed CHECK (
  role IS NULL
  OR role IN (
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
    'System'
  )
);

COMMENT ON COLUMN public.users.auth_user_id IS
  'auth.users.id for this person. Authorization reads public.users.role for this id. Do not copy role from raw_user_meta_data.';

COMMENT ON COLUMN public.users.role IS
  'Assigned only by an Admin (or the service role). Signup metadata is ignored.';

-- Link rows that already share an auth user id or the same email.
-- Never touches USR-SETTING-* pseudo rows and never changes role.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (a.id)
      u.id AS user_id,
      a.id AS auth_id
    FROM auth.users a
    JOIN public.users u
      ON u.id NOT LIKE 'USR-SETTING-%'
     AND (
       u.id = a.id::text
       OR lower(coalesce(u.email, '')) = lower(a.email)
     )
    ORDER BY a.id, (u.role = 'Admin') DESC, u.created_at NULLS LAST
  LOOP
    UPDATE public.users
       SET auth_user_id = rec.auth_id
     WHERE id = rec.user_id
       AND (auth_user_id IS NULL OR auth_user_id = rec.auth_id);
  END LOOP;
END $$;

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres, service_role, authenticated;

CREATE OR REPLACE FUNCTION private.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  existing_id text;
BEGIN
  -- Attach the auth user to an existing directory row. Do not read role,
  -- department, or any other privilege from raw_user_meta_data.
  SELECT u.id
    INTO existing_id
  FROM public.users u
  WHERE u.id NOT LIKE 'USR-SETTING-%'
    AND lower(coalesce(u.email, '')) = lower(NEW.email)
  ORDER BY (u.role = 'Admin') DESC, u.created_at NULLS LAST
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.users
       SET auth_user_id = NEW.id
     WHERE id = existing_id
       AND (auth_user_id IS NULL OR auth_user_id = NEW.id);
    RETURN NEW;
  END IF;

  INSERT INTO public.users (
    id, auth_user_id, username, full_name, email, role, department, active, status
  ) VALUES (
    NEW.id::text,
    NEW.id,
    lower(NEW.email),
    coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NULL,
    NULL,
    false,
    'Pending'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.handle_new_auth_user() TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION private.handle_new_auth_user() TO supabase_auth_admin;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_auth_user();

DROP FUNCTION IF EXISTS public.handle_new_auth_user();

-- The event trigger that enables RLS must not be callable through PostgREST.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- Stop new rows from inheriting a mailbox password that was baked into the
-- column default. The lockdown migration drops the column.
ALTER TABLE public.email_settings ALTER COLUMN smtp_pass SET DEFAULT '';

-- ---------------------------------------------------------------------------
-- Role permissions live in a table. Seed defaults, then keep any customization
-- already stored in system_settings.role_permissions. Payroll stays limited.
-- ---------------------------------------------------------------------------

INSERT INTO public.role_permissions (role, permissions, updated_at)
SELECT key, value, now()
FROM jsonb_each($perms$
{
  "Admin": {
    "dashboard": true,
    "production_records": true,
    "sales": true,
    "job_punching": true,
    "orders": true,
    "clients": true,
    "job_masters": true,
    "vendors": true,
    "purchase_orders": true,
    "inventory": true,
    "ink_management": true,
    "material_indents": true,
    "employees": true,
    "user_management": true,
    "cylinders": true,
    "printing_scheduler": true,
    "supabase": true,
    "doc_settings": true,
    "scrap_analytics": true,
    "dispatch": true,
    "sfg_store": true,
    "pellet_fuel": true,
    "audit_logs": true
  },
  "Plant Manager": {
    "dashboard": true,
    "production_records": true,
    "sales": true,
    "job_punching": true,
    "orders": true,
    "clients": true,
    "job_masters": true,
    "vendors": true,
    "purchase_orders": true,
    "inventory": true,
    "ink_management": true,
    "material_indents": true,
    "employees": false,
    "user_management": false,
    "cylinders": true,
    "printing_scheduler": true,
    "supabase": true,
    "doc_settings": true,
    "scrap_analytics": true,
    "dispatch": true,
    "sfg_store": true,
    "pellet_fuel": true,
    "audit_logs": false
  },
  "HR & Payroll Manager": {
    "dashboard": true,
    "production_records": true,
    "sales": true,
    "job_punching": true,
    "orders": true,
    "clients": true,
    "job_masters": true,
    "vendors": true,
    "purchase_orders": true,
    "inventory": true,
    "ink_management": true,
    "material_indents": true,
    "employees": true,
    "user_management": false,
    "cylinders": true,
    "printing_scheduler": true,
    "supabase": true,
    "doc_settings": true,
    "scrap_analytics": true,
    "dispatch": true,
    "sfg_store": true,
    "pellet_fuel": true,
    "audit_logs": false
  },
  "Production Manager": {
    "dashboard": true,
    "production_records": true,
    "sales": false,
    "job_punching": false,
    "orders": true,
    "clients": false,
    "job_masters": true,
    "vendors": false,
    "purchase_orders": true,
    "inventory": true,
    "ink_management": false,
    "material_indents": false,
    "employees": false,
    "user_management": false,
    "cylinders": true,
    "printing_scheduler": true,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": true,
    "dispatch": false,
    "sfg_store": true,
    "pellet_fuel": true,
    "audit_logs": false
  },
  "Store Manager": {
    "dashboard": true,
    "production_records": false,
    "sales": false,
    "job_punching": false,
    "orders": false,
    "clients": false,
    "job_masters": false,
    "vendors": true,
    "purchase_orders": true,
    "inventory": true,
    "ink_management": true,
    "material_indents": true,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": false,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false,
    "dispatch": true,
    "sfg_store": true,
    "pellet_fuel": true,
    "audit_logs": false
  },
  "QC Chemist": {
    "dashboard": true,
    "production_records": true,
    "sales": false,
    "job_punching": false,
    "orders": false,
    "clients": false,
    "job_masters": false,
    "vendors": false,
    "purchase_orders": false,
    "inventory": true,
    "ink_management": true,
    "material_indents": false,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": false,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false,
    "dispatch": true,
    "sfg_store": true,
    "pellet_fuel": false,
    "audit_logs": false
  },
  "Purchase Manager": {
    "dashboard": true,
    "production_records": false,
    "sales": false,
    "job_punching": false,
    "orders": false,
    "clients": false,
    "job_masters": false,
    "vendors": true,
    "purchase_orders": true,
    "inventory": true,
    "ink_management": true,
    "material_indents": true,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": false,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false,
    "dispatch": false,
    "sfg_store": false,
    "pellet_fuel": true,
    "audit_logs": false
  },
  "Sales Manager": {
    "dashboard": true,
    "production_records": false,
    "sales": true,
    "job_punching": true,
    "orders": true,
    "clients": true,
    "job_masters": false,
    "vendors": false,
    "purchase_orders": false,
    "inventory": false,
    "ink_management": false,
    "material_indents": false,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": false,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false,
    "dispatch": true,
    "sfg_store": false,
    "pellet_fuel": false,
    "audit_logs": false
  },
  "Printing Operator": {
    "dashboard": true,
    "production_records": false,
    "sales": false,
    "job_punching": false,
    "orders": false,
    "clients": false,
    "job_masters": false,
    "vendors": false,
    "purchase_orders": false,
    "inventory": false,
    "ink_management": false,
    "material_indents": false,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": true,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false,
    "dispatch": false,
    "sfg_store": true,
    "pellet_fuel": false,
    "audit_logs": false
  },
  "Shop Floor Operator": {
    "dashboard": true,
    "production_records": true,
    "sales": false,
    "job_punching": false,
    "orders": false,
    "clients": false,
    "job_masters": false,
    "vendors": false,
    "purchase_orders": false,
    "inventory": false,
    "ink_management": false,
    "material_indents": false,
    "employees": false,
    "user_management": false,
    "cylinders": false,
    "printing_scheduler": true,
    "supabase": false,
    "doc_settings": false,
    "scrap_analytics": false,
    "dispatch": false,
    "sfg_store": true,
    "pellet_fuel": false,
    "audit_logs": false
  }
}
$perms$::jsonb)
ON CONFLICT (role) DO NOTHING;

DO $$
DECLARE
  raw text;
  parsed jsonb;
BEGIN
  SELECT setting_value INTO raw
  FROM public.system_settings
  WHERE setting_key = 'role_permissions';

  IF raw IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    parsed := raw::jsonb;
  EXCEPTION WHEN others THEN
    parsed := NULL;
  END;

  IF parsed IS NULL OR jsonb_typeof(parsed) <> 'object' THEN
    RETURN;
  END IF;

  INSERT INTO public.role_permissions (role, permissions, updated_at)
  SELECT key, value, now()
  FROM jsonb_each(parsed)
  WHERE key IN (
    'Admin', 'Plant Manager', 'Production Manager', 'Sales Manager',
    'Purchase Manager', 'Store Manager', 'QC Chemist', 'Printing Operator',
    'Shop Floor Operator', 'HR & Payroll Manager'
  )
  ON CONFLICT (role) DO UPDATE
    SET permissions = EXCLUDED.permissions,
        updated_at = now();
END $$;

UPDATE public.role_permissions
SET permissions = permissions || jsonb_build_object(
      'employees', role IN ('Admin', 'HR & Payroll Manager'),
      'user_management', role = 'Admin',
      'audit_logs', role = 'Admin',
      'dispatch', role IN ('Admin', 'Plant Manager', 'HR & Payroll Manager', 'Store Manager', 'QC Chemist', 'Sales Manager'),
      'sfg_store', role IN ('Admin', 'Plant Manager', 'HR & Payroll Manager', 'Production Manager', 'Store Manager', 'QC Chemist', 'Shop Floor Operator', 'Printing Operator'),
      'pellet_fuel', role IN ('Admin', 'Plant Manager', 'HR & Payroll Manager', 'Store Manager', 'Purchase Manager', 'Production Manager')
    ),
    updated_at = now();

-- Preserve settings that were only stored on fake user rows, without copying
-- them into new user accounts.
INSERT INTO public.system_settings (setting_key, setting_value, updated_at)
SELECT substring(id FROM 13), full_name, now()
FROM public.users
WHERE id LIKE 'USR-SETTING-%'
  AND full_name IS NOT NULL
  AND full_name <> ''
ON CONFLICT (setting_key) DO NOTHING;
