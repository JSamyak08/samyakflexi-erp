-- Fresh databases built only from git enable row level security and create no
-- policies. Production already has "Allow anon and auth full access" on the
-- business tables named below (kept outside git). This adds that same policy
-- only when a listed table exists, has row level security, and has zero policies.
--
-- The allow list is closed. A public table that is not named in `targets` is
-- never opened, including any future service-role-only table.
--
-- `email_send_log` is service-role only. claim_email_send and
-- release_email_send are the only writers, and the table is private because
-- RLS is on and there is no policy. `Samyak International Ltd` is the stray
-- baseline table that stays locked the same way. Both names are in `denied`,
-- which is checked before any grant or policy, so copying either name into
-- `targets` still does nothing.
--
-- A table that already has any policy is left alone, so applying this on
-- production does not replace or duplicate the live policies.
-- supabase/manual/20261019120000_auth_rls_lockdown.sql drops these policies
-- when that lockdown is applied by hand.

DO $$
DECLARE
  t text;
  denied text[] := ARRAY[
    'email_send_log',
    'Samyak International Ltd'
  ];
  targets text[] := ARRAY[
    'audit_logs',
    'certificate_of_analyses',
    'clients',
    'coa_reports',
    'cylinders',
    'delivery_challans',
    'dispatch_shipments',
    'email_settings',
    'email_templates',
    'employee_attendance',
    'employees',
    'fg_goods',
    'film_substrates',
    'grns',
    'inks',
    'inventory',
    'inventory_rolls',
    'job_datasheets',
    'job_masters',
    'material_structure_templates',
    'orders',
    'printing_machines',
    'production_records',
    'production_schedules',
    'purchase_orders',
    'role_permissions',
    'salary_advances',
    'salary_payments',
    'sales_quotations',
    'scrap_disposals',
    'sfg_fg_store',
    'sfg_goods',
    'system_settings',
    'users',
    'vendors'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  FOREACH t IN ARRAY targets LOOP
    IF t = ANY (denied) THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind = 'r'
        AND c.relrowsecurity
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = t
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated',
      t
    );
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
        'Allow anon and auth full access',
        t
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;
