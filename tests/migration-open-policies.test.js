import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261021190000_open_policies_where_missing.sql', import.meta.url),
  'utf8'
);
const repairSql = fs.readFileSync(
  new URL('../supabase/migrations/20261021210000_keep_email_send_log_private.sql', import.meta.url),
  'utf8'
);

test('open-policy migration fills only listed tables that have no policy', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.vendors (id text PRIMARY KEY);
    ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public.users (id text PRIMARY KEY);
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public.clients (id text PRIMARY KEY);
    ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow anon and auth full access"
      ON public.clients FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
    CREATE TABLE public.leave_alone (id text PRIMARY KEY);
    ALTER TABLE public.leave_alone ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public.email_send_log (id bigint PRIMARY KEY);
    ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public."Samyak International Ltd" (id bigint PRIMARY KEY);
    ALTER TABLE public."Samyak International Ltd" ENABLE ROW LEVEL SECURITY;
  `);

  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const policies = await db.query(`
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  const byTable = Object.fromEntries(policies.rows.map((row) => [row.tablename, row.policyname]));
  assert.equal(byTable.vendors, 'Allow anon and auth full access');
  assert.equal(byTable.users, 'Allow anon and auth full access');
  assert.equal(byTable.clients, 'Allow anon and auth full access');
  assert.equal(byTable.leave_alone, undefined);
  assert.equal(byTable.email_send_log, undefined);
  assert.equal(byTable['Samyak International Ltd'], undefined);
  assert.equal(policies.rows.filter((row) => row.tablename === 'clients').length, 1);
  assert.equal(migrationSql.includes("'email_send_log'"), true);
  const allowList = migrationSql.split('targets text[]')[1];
  assert.equal(allowList.includes("'email_send_log'"), false);

  const grants = await db.query(`
    SELECT has_table_privilege('anon', 'public.vendors', 'INSERT') AS anon_insert,
           has_table_privilege('authenticated', 'public.users', 'SELECT') AS auth_select
  `);
  assert.equal(grants.rows[0].anon_insert, true);
  assert.equal(grants.rows[0].auth_select, true);
  const privateGrants = await db.query(`
    SELECT has_table_privilege('anon', 'public.email_send_log', 'SELECT') AS anon_select
  `);
  assert.equal(privateGrants.rows[0].anon_select, false);
  await db.close();
});

test('email send log repair removes an open policy and browser grants', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.email_send_log (id bigint PRIMARY KEY);
    ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_send_log TO anon, authenticated;
    CREATE POLICY "Allow anon and auth full access"
      ON public.email_send_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  `);

  await db.exec(repairSql);
  await db.exec(repairSql);

  const policies = await db.query(`
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'email_send_log'
  `);
  assert.equal(policies.rows.length, 0);
  const grants = await db.query(`
    SELECT has_table_privilege('anon', 'public.email_send_log', 'SELECT') AS anon_select,
           has_table_privilege('authenticated', 'public.email_send_log', 'INSERT') AS auth_insert
  `);
  assert.equal(grants.rows[0].anon_select, false);
  assert.equal(grants.rows[0].auth_insert, false);
  await db.close();
});
