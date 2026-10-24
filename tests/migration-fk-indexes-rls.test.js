import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261024040100_grn_fk_indexes_and_users_select.sql', import.meta.url),
  'utf8'
);

const UID = '11111111-1111-1111-1111-111111111111';

async function baseSchema(db) {
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE TABLE IF NOT EXISTS auth_uid_holder (id int PRIMARY KEY, uid uuid);
    INSERT INTO auth_uid_holder (id, uid) VALUES (1, '${UID}')
    ON CONFLICT (id) DO UPDATE SET uid = EXCLUDED.uid;
    CREATE TABLE IF NOT EXISTS role_flag (id int PRIMARY KEY, is_admin boolean);
    INSERT INTO role_flag (id, is_admin) VALUES (1, false)
    ON CONFLICT (id) DO UPDATE SET is_admin = EXCLUDED.is_admin;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT uid FROM auth_uid_holder WHERE id = 1 $$;
    CREATE OR REPLACE FUNCTION private.has_role(text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT is_admin FROM role_flag WHERE id = 1 $$;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
    END $$;
  `);
}

test('migration drops only the redundant GRN index and covers the foreign keys', async () => {
  const db = new PGlite();
  try {
    await baseSchema(db);
    await db.exec(`
      CREATE TABLE public.grns (
        id text PRIMARY KEY,
        grn_number text,
        vendor_id text
      );
      ALTER TABLE public.grns ADD CONSTRAINT grns_grn_number_key UNIQUE (grn_number);
      CREATE UNIQUE INDEX grns_grn_number_uidx ON public.grns (grn_number);
      CREATE TABLE public.inks (id text PRIMARY KEY, supplier_id text);
      CREATE TABLE public.job_datasheets (id text PRIMARY KEY, job_id text);
      CREATE TABLE public.users (id text PRIMARY KEY, auth_user_id uuid);
      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON public.users TO authenticated;
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
    `);

    await db.exec(migrationSql);
    await db.exec(migrationSql);

    const indexes = await db.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'grns_grn_number_key',
          'grns_grn_number_uidx',
          'grns_vendor_id_idx',
          'inks_supplier_id_idx',
          'job_datasheets_job_id_idx'
        )
      ORDER BY indexname
    `);
    assert.deepEqual(indexes.rows.map((row) => row.indexname), [
      'grns_grn_number_key',
      'grns_vendor_id_idx',
      'inks_supplier_id_idx',
      'job_datasheets_job_id_idx',
    ]);

    await assert.rejects(
      () => db.exec(`
        INSERT INTO public.grns (id, grn_number) VALUES ('A', 'GRN-1'), ('B', 'GRN-1')
      `),
      /duplicate key|unique/i
    );

    const policy = await db.query(`
      SELECT pg_get_expr(pol.polqual, pol.polrelid) AS using_expr
      FROM pg_policy pol
      JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'users' AND pol.polname = 'users_select'
    `);
    const expr = policy.rows[0].using_expr.replace(/\s+/g, ' ');
    const wrapped = expr.match(/\(\s*SELECT\s+auth\.uid\(\)(?:\s+AS\s+\w+)?\s*\)/gi) || [];
    assert.equal(wrapped.length, 2);
    const stripped = expr.replace(/\(\s*SELECT\s+auth\.uid\(\)(?:\s+AS\s+\w+)?\s*\)/gi, '');
    assert.equal(stripped.includes('auth.uid()'), false);
    assert.match(expr, /USR-SETTING-%/);
    assert.match(expr, /private\.has_role\(ARRAY\['Admin'::text\]\)|private\.has_role\(ARRAY\['Admin'\]\)/);

    await db.exec(`
      INSERT INTO public.users (id, auth_user_id) VALUES
        ('own-auth', '${UID}'),
        ('${UID}', NULL),
        ('other', '22222222-2222-2222-2222-222222222222'),
        ('USR-SETTING-SECRET', '${UID}');
    `);
    await db.exec('SET ROLE authenticated');
    const visible = await db.query(`SELECT id FROM public.users ORDER BY id`);
    assert.deepEqual(visible.rows.map((row) => row.id), [UID, 'own-auth']);

    await db.exec('RESET ROLE');
    await db.exec('UPDATE role_flag SET is_admin = true WHERE id = 1');
    await db.exec('SET ROLE authenticated');
    const asAdmin = await db.query(`SELECT id FROM public.users ORDER BY id`);
    assert.deepEqual(asAdmin.rows.map((row) => row.id), [UID, 'other', 'own-auth']);
  } finally {
    await db.close();
  }
});

test('migration keeps grns_grn_number_uidx when it is the only uniqueness', async () => {
  const db = new PGlite();
  try {
    await baseSchema(db);
    await db.exec(`
      CREATE TABLE public.grns (id text PRIMARY KEY, grn_number text, vendor_id text);
      CREATE UNIQUE INDEX grns_grn_number_uidx ON public.grns (grn_number);
      CREATE TABLE public.inks (id text PRIMARY KEY, supplier_id text);
      CREATE TABLE public.job_datasheets (id text PRIMARY KEY, job_id text);
      CREATE TABLE public.users (id text PRIMARY KEY, auth_user_id uuid);
      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    `);
    await db.exec(migrationSql);
    const kept = await db.query(`
      SELECT indexname FROM pg_indexes WHERE indexname = 'grns_grn_number_uidx'
    `);
    assert.equal(kept.rows.length, 1);
  } finally {
    await db.close();
  }
});
