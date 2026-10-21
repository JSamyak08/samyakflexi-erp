import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261021190000_open_policies_where_missing.sql', import.meta.url),
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
  assert.equal(policies.rows.filter((row) => row.tablename === 'clients').length, 1);

  const grants = await db.query(`
    SELECT has_table_privilege('anon', 'public.vendors', 'INSERT') AS anon_insert,
           has_table_privilege('authenticated', 'public.users', 'SELECT') AS auth_select
  `);
  assert.equal(grants.rows[0].anon_insert, true);
  assert.equal(grants.rows[0].auth_select, true);
  await db.close();
});
