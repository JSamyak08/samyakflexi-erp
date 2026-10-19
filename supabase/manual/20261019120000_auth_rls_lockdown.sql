-- MANUAL ONLY. This file lives in supabase/manual so the GitHub integration
-- does not apply it on merge to main. Do not move it into supabase/migrations.
-- Run it from the SQL editor after this frontend is deployed and after staff
-- have set passwords. It drops password_hash and smtp_pass.
--
-- Lock down FlexiERP. Apply only after scripts/invite-existing-users.mjs has
-- linked real users and an Admin has signed in with Supabase Auth.
-- This revokes anonymous access. It does not restore plaintext passwords.

-- ---------------------------------------------------------------------------
-- Helpers. private is not an exposed API schema. RLS reads public.users.role
-- for auth.uid(). raw_user_meta_data and app_metadata are not consulted, so a
-- user cannot grant themselves a role and role changes apply immediately.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres, service_role, authenticated;

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
      'HR & Payroll Manager'
    )
  ORDER BY (u.auth_user_id = auth.uid()) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.has_role(allowed text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.app_role() = 'Admin'
      OR private.app_role() = ANY (allowed);
$$;

CREATE OR REPLACE FUNCTION private.can_any(modules text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.app_role() = 'Admin'
      OR EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        WHERE rp.role = private.app_role()
          AND EXISTS (
            SELECT 1
            FROM unnest(modules) AS requested(module_key)
            WHERE rp.permissions -> requested.module_key = 'true'::jsonb
          )
      );
$$;

CREATE OR REPLACE FUNCTION private.can_read_setting(setting_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k text := lower(coalesce(setting_key, ''));
BEGIN
  IF private.app_role() IS NULL THEN
    RETURN false;
  END IF;

  -- These keys duplicated payroll, SMTP secrets, or the permission matrix.
  -- They must not be readable or writable through the settings table.
  IF k IN (
    'employees',
    'employee_attendance',
    'salary_advances',
    'salary_payments',
    'email_settings',
    'role_permissions'
  ) THEN
    RETURN false;
  END IF;

  IF k IN ('delivery_challans', 'dispatch_shipments') THEN
    RETURN private.can_any(ARRAY['dispatch', 'sales', 'inventory']);
  END IF;

  IF k IN ('purchase_orders', 'samyak_erp_issued_pos') THEN
    RETURN private.can_any(ARRAY['purchase_orders', 'inventory']);
  END IF;

  IF k IN ('pellet_inwards', 'pellet_consumptions') THEN
    RETURN private.can_any(ARRAY['pellet_fuel', 'inventory']);
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_any(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_setting(text) TO authenticated;
REVOKE ALL ON FUNCTION private.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.handle_new_auth_user() TO service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION private.handle_new_auth_user() TO supabase_auth_admin;
  END IF;
END $$;

-- Block role and auth-link changes from browser roles. service_role and the
-- auth trigger (no end-user JWT) can still provision accounts.
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
      IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id AND NOT private.has_role(ARRAY['Admin']) THEN
        RAISE EXCEPTION 'Only an Admin can change the auth link';
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

DROP TRIGGER IF EXISTS users_protect_directory ON public.users;
CREATE TRIGGER users_protect_directory
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION private.protect_user_directory();

REVOKE ALL ON FUNCTION private.protect_user_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.protect_user_directory() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Remove secrets and payroll copies from client-readable stores
-- ---------------------------------------------------------------------------

ALTER TABLE public.users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE public.email_settings DROP COLUMN IF EXISTS smtp_pass;

DELETE FROM public.system_settings
WHERE lower(setting_key) IN (
  'employees',
  'employee_attendance',
  'salary_advances',
  'salary_payments',
  'email_settings',
  'role_permissions'
);

-- ---------------------------------------------------------------------------
-- Replace the open policies
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- Module screens. Admin is included by private.can_any. One FOR ALL policy
-- covers SELECT, so updates are not silently dropped.
CREATE OR REPLACE FUNCTION private.install_module_access(target_table regclass, modules text[])
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  qualified text := target_table::text;
  short_name text := split_part(target_table::text, '.', 2);
  module_list text;
BEGIN
  SELECT 'ARRAY[' || string_agg(quote_literal(module_key), ',') || ']'
    INTO module_list
  FROM unnest(modules) AS requested(module_key);

  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', short_name || '_access', qualified);
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR ALL TO authenticated USING (private.can_any(%s)) WITH CHECK (private.can_any(%s))',
    short_name || '_access',
    qualified,
    module_list,
    module_list
  );
END;
$$;

SELECT private.install_module_access('public.orders'::regclass, ARRAY['orders','job_punching','sales','production_records','printing_scheduler','dispatch']);
SELECT private.install_module_access('public.clients'::regclass, ARRAY['clients','sales','orders','job_punching','dispatch']);
SELECT private.install_module_access('public.sales_quotations'::regclass, ARRAY['sales']);
SELECT private.install_module_access('public.job_masters'::regclass, ARRAY['job_masters','job_punching','orders','cylinders','printing_scheduler']);
SELECT private.install_module_access('public.job_datasheets'::regclass, ARRAY['job_masters','production_records','scrap_analytics','job_punching']);
SELECT private.install_module_access('public.vendors'::regclass, ARRAY['vendors','purchase_orders','inventory']);
SELECT private.install_module_access('public.purchase_orders'::regclass, ARRAY['purchase_orders','inventory']);
SELECT private.install_module_access('public.grns'::regclass, ARRAY['inventory','purchase_orders']);
SELECT private.install_module_access('public.inventory'::regclass, ARRAY['inventory','material_indents','purchase_orders','production_records','printing_scheduler']);
SELECT private.install_module_access('public.inventory_rolls'::regclass, ARRAY['inventory','material_indents','production_records','printing_scheduler']);
SELECT private.install_module_access('public.inks'::regclass, ARRAY['ink_management','inventory']);
SELECT private.install_module_access('public.cylinders'::regclass, ARRAY['cylinders','job_masters','printing_scheduler']);
SELECT private.install_module_access('public.printing_machines'::regclass, ARRAY['printing_scheduler','production_records']);
SELECT private.install_module_access('public.production_schedules'::regclass, ARRAY['printing_scheduler','production_records']);
SELECT private.install_module_access('public.production_records'::regclass, ARRAY['production_records','scrap_analytics','printing_scheduler']);
SELECT private.install_module_access('public.dispatch_shipments'::regclass, ARRAY['dispatch','sales','inventory']);
SELECT private.install_module_access('public.delivery_challans'::regclass, ARRAY['dispatch','sales','inventory']);
SELECT private.install_module_access('public.certificate_of_analyses'::regclass, ARRAY['inventory','production_records']);
SELECT private.install_module_access('public.coa_reports'::regclass, ARRAY['inventory','production_records']);
SELECT private.install_module_access('public.scrap_disposals'::regclass, ARRAY['scrap_analytics','inventory']);
SELECT private.install_module_access('public.sfg_goods'::regclass, ARRAY['production_records','inventory','printing_scheduler','sfg_store']);
SELECT private.install_module_access('public.fg_goods'::regclass, ARRAY['production_records','inventory','printing_scheduler','sfg_store']);
SELECT private.install_module_access('public.sfg_fg_store'::regclass, ARRAY['production_records','inventory','printing_scheduler','sfg_store']);

DROP FUNCTION private.install_module_access(regclass, text[]);

-- Reference data used by costing forms. Any active role may read it.
-- Writes stay with the roles that maintain masters.
CREATE POLICY film_substrates_read ON public.film_substrates
  FOR SELECT TO authenticated
  USING (private.app_role() IS NOT NULL);
CREATE POLICY film_substrates_write ON public.film_substrates
  FOR INSERT TO authenticated
  WITH CHECK (private.can_any(ARRAY['inventory','purchase_orders','job_punching','orders']));
CREATE POLICY film_substrates_update ON public.film_substrates
  FOR UPDATE TO authenticated
  USING (private.can_any(ARRAY['inventory','purchase_orders','job_punching','orders']))
  WITH CHECK (private.can_any(ARRAY['inventory','purchase_orders','job_punching','orders']));
CREATE POLICY film_substrates_delete ON public.film_substrates
  FOR DELETE TO authenticated
  USING (private.can_any(ARRAY['inventory','purchase_orders','job_punching','orders']));

CREATE POLICY material_structure_templates_read ON public.material_structure_templates
  FOR SELECT TO authenticated
  USING (private.app_role() IS NOT NULL);
CREATE POLICY material_structure_templates_write ON public.material_structure_templates
  FOR INSERT TO authenticated
  WITH CHECK (private.can_any(ARRAY['inventory','purchase_orders','job_punching','orders']));
CREATE POLICY material_structure_templates_update ON public.material_structure_templates
  FOR UPDATE TO authenticated
  USING (private.can_any(ARRAY['inventory','purchase_orders','job_punching','orders']))
  WITH CHECK (private.can_any(ARRAY['inventory','purchase_orders','job_punching','orders']));
CREATE POLICY material_structure_templates_delete ON public.material_structure_templates
  FOR DELETE TO authenticated
  USING (private.can_any(ARRAY['inventory','purchase_orders','job_punching','orders']));

-- Payroll and identity documents. The permission matrix cannot widen this.
CREATE POLICY employees_hr ON public.employees
  FOR ALL TO authenticated
  USING (private.has_role(ARRAY['HR & Payroll Manager']))
  WITH CHECK (private.has_role(ARRAY['HR & Payroll Manager']));
CREATE POLICY employee_attendance_hr ON public.employee_attendance
  FOR ALL TO authenticated
  USING (private.has_role(ARRAY['HR & Payroll Manager']))
  WITH CHECK (private.has_role(ARRAY['HR & Payroll Manager']));
CREATE POLICY salary_advances_hr ON public.salary_advances
  FOR ALL TO authenticated
  USING (private.has_role(ARRAY['HR & Payroll Manager']))
  WITH CHECK (private.has_role(ARRAY['HR & Payroll Manager']));
CREATE POLICY salary_payments_hr ON public.salary_payments
  FOR ALL TO authenticated
  USING (private.has_role(ARRAY['HR & Payroll Manager']))
  WITH CHECK (private.has_role(ARRAY['HR & Payroll Manager']));

-- Directory: a person can read their own row. Only an Admin can list or change users.
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (
    id NOT LIKE 'USR-SETTING-%'
    AND (
      auth_user_id = auth.uid()
      OR id = auth.uid()::text
      OR private.has_role(ARRAY['Admin'])
    )
  );
CREATE POLICY users_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(ARRAY['Admin'])
    AND id NOT LIKE 'USR-SETTING-%'
  );
CREATE POLICY users_update ON public.users
  FOR UPDATE TO authenticated
  USING (private.has_role(ARRAY['Admin']) AND id NOT LIKE 'USR-SETTING-%')
  WITH CHECK (private.has_role(ARRAY['Admin']) AND id NOT LIKE 'USR-SETTING-%');
CREATE POLICY users_delete ON public.users
  FOR DELETE TO authenticated
  USING (private.has_role(ARRAY['Admin']) AND id NOT LIKE 'USR-SETTING-%');

-- Matrix is visible to signed-in staff so each role's screens still render.
-- Only an Admin can change it. Payroll flags are forced back by the app and
-- are not what authorizes the employee tables.
CREATE POLICY role_permissions_read ON public.role_permissions
  FOR SELECT TO authenticated
  USING (private.app_role() IS NOT NULL);
CREATE POLICY role_permissions_insert ON public.role_permissions
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(ARRAY['Admin']));
CREATE POLICY role_permissions_update ON public.role_permissions
  FOR UPDATE TO authenticated
  USING (private.has_role(ARRAY['Admin']))
  WITH CHECK (private.has_role(ARRAY['Admin']));
CREATE POLICY role_permissions_delete ON public.role_permissions
  FOR DELETE TO authenticated
  USING (private.has_role(ARRAY['Admin']));

CREATE POLICY system_settings_read ON public.system_settings
  FOR SELECT TO authenticated
  USING (private.can_read_setting(setting_key));
CREATE POLICY system_settings_insert ON public.system_settings
  FOR INSERT TO authenticated
  WITH CHECK (private.can_read_setting(setting_key));
CREATE POLICY system_settings_update ON public.system_settings
  FOR UPDATE TO authenticated
  USING (private.can_read_setting(setting_key))
  WITH CHECK (private.can_read_setting(setting_key));
CREATE POLICY system_settings_delete ON public.system_settings
  FOR DELETE TO authenticated
  USING (private.has_role(ARRAY['Admin']) AND private.can_read_setting(setting_key));

-- Non-secret routing only. The SMTP password is an environment variable.
CREATE POLICY email_settings_admin ON public.email_settings
  FOR ALL TO authenticated
  USING (private.has_role(ARRAY['Admin']))
  WITH CHECK (private.has_role(ARRAY['Admin']));

CREATE POLICY email_templates_read ON public.email_templates
  FOR SELECT TO authenticated
  USING (private.app_role() IS NOT NULL);
CREATE POLICY email_templates_write ON public.email_templates
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(ARRAY['Admin']));
CREATE POLICY email_templates_update ON public.email_templates
  FOR UPDATE TO authenticated
  USING (private.has_role(ARRAY['Admin']))
  WITH CHECK (private.has_role(ARRAY['Admin']));
CREATE POLICY email_templates_delete ON public.email_templates
  FOR DELETE TO authenticated
  USING (private.has_role(ARRAY['Admin']));

-- Any active role can append an audit row. Only an Admin can read or delete.
CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (private.app_role() IS NOT NULL);
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (private.has_role(ARRAY['Admin']));
CREATE POLICY audit_logs_delete ON public.audit_logs
  FOR DELETE TO authenticated
  USING (private.has_role(ARRAY['Admin']));

-- The stray default table stays locked: RLS on, no policy.
ALTER TABLE public."Samyak International Ltd" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Scrap view must honour the caller's RLS instead of the owner
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.high_scrap_audit_registry;
CREATE VIEW public.high_scrap_audit_registry
WITH (security_invoker = true) AS
SELECT
  id AS record_id,
  order_id,
  job_name,
  client_name,
  operator_name,
  shift,
  COALESCE(date_filled, recorded_at::date) AS record_date,
  gross_production_kg,
  net_usable_kg,
  total_wastage_kg,
  wastage_percentage,
  overall_scrap_pct_of_output,
  overall_scrap_pct_of_dispatch,
  final_production_cost_rs,
  status,
  filled_by,
  approved_by,
  notes,
  CASE WHEN wastage_percentage >= 5.0 THEN true ELSE false END AS is_high_scrap_alert
FROM public.production_records
ORDER BY recorded_at DESC;

REVOKE ALL ON public.high_scrap_audit_registry FROM anon, PUBLIC;
GRANT SELECT ON public.high_scrap_audit_registry TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage. Private buckets. Signed URLs are minted for signed-in users.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow public uploads to erp-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read from erp-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to erp-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from erp-files" ON storage.objects;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON storage.objects FROM anon;
REVOKE ALL ON storage.buckets FROM anon;

UPDATE storage.buckets
   SET public = false
 WHERE id IN ('erp-files', 'artwork');

DROP POLICY IF EXISTS erp_files_read ON storage.objects;
DROP POLICY IF EXISTS erp_files_insert ON storage.objects;
DROP POLICY IF EXISTS erp_files_update ON storage.objects;
DROP POLICY IF EXISTS erp_files_delete ON storage.objects;

CREATE POLICY erp_files_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('erp-files', 'artwork')
    AND private.app_role() IS NOT NULL
  );

CREATE POLICY erp_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('erp-files', 'artwork')
    AND private.app_role() IS NOT NULL
  );

CREATE POLICY erp_files_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('erp-files', 'artwork')
    AND private.app_role() IS NOT NULL
  )
  WITH CHECK (
    bucket_id IN ('erp-files', 'artwork')
    AND private.app_role() IS NOT NULL
  );

CREATE POLICY erp_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('erp-files', 'artwork')
    AND private.has_role(ARRAY['Plant Manager', 'Production Manager', 'Store Manager', 'Sales Manager'])
  );
