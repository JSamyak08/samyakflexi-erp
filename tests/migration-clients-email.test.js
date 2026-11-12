import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261112140000_clients_email.sql', import.meta.url),
  'utf8'
);

test('the clients email migration is additive and later than the order-id migration', () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const previous = '20261112130000_allocate_order_id.sql';
  const current = '20261112140000_clients_email.sql';
  assert.ok(names.includes(previous));
  assert.ok(names.includes(current));
  assert.ok(names.indexOf(current) > names.indexOf(previous));
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS email text/i);
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.clients/i);
  assert.doesNotMatch(migrationSql, /GRANT[\s\S]*TO\s+anon/i);
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.match(migrationSql, /clients_access/);
});

test('email is nullable and the existing clients_access policy still covers the table', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE TABLE public.clients (
      id text PRIMARY KEY,
      name text NOT NULL,
      gstin text,
      address text,
      payment_terms text,
      contact_person text,
      phone text,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clients TO authenticated;
    CREATE POLICY clients_access
      ON public.clients
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
    INSERT INTO public.clients (id, name, phone)
    VALUES ('CLI-2026-9267', 'Zain Natural Agro', '8380893808');
  `);

  await db.exec(migrationSql);

  const column = await db.query(`
    SELECT data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'email'
  `);
  assert.equal(column.rows.length, 1);
  assert.equal(column.rows[0].data_type, 'text');
  assert.equal(column.rows[0].is_nullable, 'YES');

  const existing = await db.query(`SELECT email, phone FROM public.clients WHERE id = 'CLI-2026-9267'`);
  assert.equal(existing.rows[0].email, null);
  assert.equal(existing.rows[0].phone, '8380893808');

  const policy = await db.query(`
    SELECT policyname, cmd, roles::text
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients'
  `);
  assert.equal(policy.rows.length, 1);
  assert.equal(policy.rows[0].policyname, 'clients_access');
  assert.equal(policy.rows[0].cmd, 'ALL');
  assert.match(policy.rows[0].roles, /authenticated/);

  const grants = await db.query(`
    SELECT
      has_table_privilege('authenticated', 'public.clients', 'SELECT') AS auth_select,
      has_table_privilege('authenticated', 'public.clients', 'UPDATE') AS auth_update,
      has_table_privilege('public', 'public.clients', 'SELECT') AS public_select
  `);
  assert.equal(grants.rows[0].auth_select, true);
  assert.equal(grants.rows[0].auth_update, true);
  assert.equal(grants.rows[0].public_select, false);

  await db.query(`UPDATE public.clients SET email = 'buyer@example.com' WHERE id = 'CLI-2026-9267'`);
  const saved = await db.query(`SELECT email FROM public.clients WHERE id = 'CLI-2026-9267'`);
  assert.equal(saved.rows[0].email, 'buyer@example.com');
  await db.close();
});
