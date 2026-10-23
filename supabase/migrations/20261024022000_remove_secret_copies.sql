-- Remove password hashes and the JSON copies of payroll, SMTP, and the
-- permission matrix from client-readable stores.
-- SMTP sending reads SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, and
-- SMTP_PASS from the server environment. It does not read these rows.
-- The deleted setting values cannot be restored. Idempotent.

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
