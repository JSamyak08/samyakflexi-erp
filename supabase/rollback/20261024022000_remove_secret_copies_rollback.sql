-- password_hash and the deleted system_settings values are not restored.
-- They were password hashes, an SMTP password, and payroll copies.
-- The columns can be recreated empty. Do not copy the old values back.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text DEFAULT ''::text;
ALTER TABLE public.email_settings ADD COLUMN IF NOT EXISTS smtp_pass text DEFAULT ''::text;
