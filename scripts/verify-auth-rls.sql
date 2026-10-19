-- Assertions for the three FlexiERP migrations. The shell wrapper creates
-- auth/storage stubs and applies the migrations before this file.

INSERT INTO public.employees (
  id, emp_code, full_name, department, designation, aadhar_no, pan_no, bank_details
) VALUES (
  'EMP-1', 'E001', 'Payroll Test', 'HR', 'Clerk', '123412341234', 'ABCDE1234F', '{"account":"000111"}'::jsonb
);

INSERT INTO public.orders (id, job_name, client_name)
VALUES ('ORD-1', 'Test Job', 'Test Client');

INSERT INTO public.printing_machines (id, name)
VALUES ('PM-1', 'Press 1');

INSERT INTO public.sales_quotations (id, quotation_no)
VALUES ('SQ-1', 'Q-1');

INSERT INTO public.system_settings (setting_key, setting_value)
VALUES
  ('employees', '[{"aadharNo":"should-not-leak"}]'),
  ('doc_prefix', '{"po":"SIL"}');

INSERT INTO public.users (id, username, full_name, email, role, active, status)
VALUES
  ('USR-ADMIN', 'admin@samyakinternational.in', 'Plant Admin', 'admin@samyakinternational.in', 'Admin', true, 'Active'),
  ('USR-HR', 'hr@samyakinternational.in', 'HR Lead', 'hr@samyakinternational.in', 'HR & Payroll Manager', true, 'Active'),
  ('USR-SHOP', 'shop@samyakinternational.in', 'Shop Floor', 'shop@samyakinternational.in', 'Shop Floor Operator', true, 'Active'),
  ('USR-PRINT', 'print@samyakinternational.in', 'Printer', 'print@samyakinternational.in', 'Printing Operator', true, 'Active'),
  ('USR-SALES', 'sales@samyakinternational.in', 'Sales', 'sales@samyakinternational.in', 'Sales Manager', true, 'Active');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id IN ('erp-files', 'artwork') AND public IS TRUE
  ) THEN
    RAISE EXCEPTION 'a storage bucket is still public';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash'
  ) THEN
    RAISE EXCEPTION 'password_hash is still on public.users';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_settings' AND column_name = 'smtp_pass'
  ) THEN
    RAISE EXCEPTION 'smtp_pass is still on public.email_settings';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND roles::text LIKE '%anon%'
  ) THEN
    RAISE EXCEPTION 'an anon policy remains on public';
  END IF;
END $$;

-- Signup metadata must not become a role.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'newperson@samyakinternational.in',
  '{"role":"Admin","full_name":"New Person"}'::jsonb
);

DO $$
DECLARE
  got_role text;
  got_status text;
  got_active boolean;
BEGIN
  SELECT role, status, active
    INTO got_role, got_status, got_active
  FROM public.users
  WHERE email = 'newperson@samyakinternational.in';
  IF got_role IS NOT NULL OR got_status IS DISTINCT FROM 'Pending' OR got_active IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'signup assigned role %, status %, active %', got_role, got_status, got_active;
  END IF;
END $$;

-- Linking an existing person must keep the Admin role already on the row.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'admin@samyakinternational.in',
  '{"role":"Shop Floor Operator"}'::jsonb
);

DO $$
DECLARE
  got_role text;
  got_auth uuid;
BEGIN
  SELECT role, auth_user_id INTO got_role, got_auth
  FROM public.users WHERE id = 'USR-ADMIN';
  IF got_role IS DISTINCT FROM 'Admin' OR got_auth IS DISTINCT FROM '22222222-2222-2222-2222-222222222222'::uuid THEN
    RAISE EXCEPTION 'existing admin was overwritten: role %, auth %', got_role, got_auth;
  END IF;
END $$;

UPDATE public.users SET auth_user_id = '33333333-3333-3333-3333-333333333333' WHERE id = 'USR-HR';
UPDATE public.users SET auth_user_id = '44444444-4444-4444-4444-444444444444' WHERE id = 'USR-SHOP';
UPDATE public.users SET auth_user_id = '55555555-5555-5555-5555-555555555555' WHERE id = 'USR-PRINT';
UPDATE public.users SET auth_user_id = '66666666-6666-6666-6666-666666666666' WHERE id = 'USR-SALES';

-- Anonymous key cannot read payroll.
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.employees;
    RAISE EXCEPTION 'anon select on employees was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.users;
    RAISE EXCEPTION 'anon select on users was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.role', 'authenticated', false);

-- Shop floor cannot see payroll or the settings copy of it.
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
SET ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.employees;
  IF n <> 0 THEN RAISE EXCEPTION 'shop floor saw % employee rows', n; END IF;
  SELECT count(*) INTO n FROM public.system_settings WHERE setting_key = 'employees';
  IF n <> 0 THEN RAISE EXCEPTION 'shop floor saw the employees settings mirror'; END IF;
  UPDATE public.users SET role = 'Admin' WHERE id = 'USR-SHOP';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'shop floor changed their own role'; END IF;
  BEGIN
    INSERT INTO public.users (id, username, email, role, active, status)
    VALUES ('USR-SETTING-orders', 'setting_orders', 'setting_orders@samyak.com', 'System', true, 'Active');
    RAISE EXCEPTION 'shop floor created a settings user';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%shop floor created%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

-- HR can read payroll. Admin can too, but neither can read the settings mirror.
SELECT set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
SET ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.employees;
  IF n <> 1 THEN RAISE EXCEPTION 'HR saw % employee rows', n; END IF;
  SELECT count(*) INTO n FROM public.system_settings WHERE setting_key = 'employees';
  IF n <> 0 THEN RAISE EXCEPTION 'HR could read the employees settings mirror'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
SET ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.employees;
  IF n <> 1 THEN RAISE EXCEPTION 'Admin saw % employee rows', n; END IF;
  SELECT count(*) INTO n FROM public.users WHERE id NOT LIKE 'USR-SETTING-%';
  IF n < 5 THEN RAISE EXCEPTION 'Admin could not list the directory (% rows)', n; END IF;
  SELECT count(*) INTO n FROM public.system_settings WHERE setting_key = 'doc_prefix';
  IF n <> 1 THEN RAISE EXCEPTION 'Admin could not read an operational setting'; END IF;
END $$;
RESET ROLE;

-- Printing operator keeps the scheduler's data and does not see payroll.
SELECT set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
SET ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.printing_machines;
  IF n <> 1 THEN RAISE EXCEPTION 'printing operator saw % machines', n; END IF;
  SELECT count(*) INTO n FROM public.orders;
  IF n <> 1 THEN RAISE EXCEPTION 'printing operator saw % orders', n; END IF;
  SELECT count(*) INTO n FROM public.employees;
  IF n <> 0 THEN RAISE EXCEPTION 'printing operator saw payroll'; END IF;
END $$;
RESET ROLE;

-- Sales can read quotations and cannot read payroll.
SELECT set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
SET ROLE authenticated;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.sales_quotations;
  IF n <> 1 THEN RAISE EXCEPTION 'sales saw % quotations', n; END IF;
  SELECT count(*) INTO n FROM public.employees;
  IF n <> 0 THEN RAISE EXCEPTION 'sales saw payroll'; END IF;
  SELECT count(*) INTO n FROM public.printing_machines;
  IF n <> 0 THEN RAISE EXCEPTION 'sales saw printing machines'; END IF;
END $$;
RESET ROLE;
