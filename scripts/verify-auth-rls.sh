#!/usr/bin/env bash
# Apply the versioned migrations to a throwaway local database and check RLS.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_NAME="flexierp_rls_check"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1)

if ! sudo -u postgres pg_isready -q; then
  sudo service postgresql start
fi

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB_NAME};"

"${PSQL[@]}" -d "$DB_NAME" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text,
  public boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY,
  bucket_id text,
  name text
);
INSERT INTO storage.buckets (id, name, public)
VALUES ('erp-files', 'erp-files', true), ('artwork', 'artwork', true)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated, anon;
GRANT SELECT ON storage.buckets TO authenticated, anon;
SQL

"${PSQL[@]}" -d "$DB_NAME" -f supabase/migrations/20261019100000_baseline_public_schema.sql
"${PSQL[@]}" -d "$DB_NAME" -f supabase/migrations/20261019110000_auth_identity_prep.sql
"${PSQL[@]}" -d "$DB_NAME" -f supabase/migrations/20261019115000_role_permissions_sync.sql
"${PSQL[@]}" -d "$DB_NAME" -f supabase/migrations/20261019120000_auth_rls_lockdown.sql
"${PSQL[@]}" -d "$DB_NAME" -f scripts/verify-auth-rls.sql
echo "RLS migration checks passed"
