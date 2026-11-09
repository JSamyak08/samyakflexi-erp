import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261109150100_inventory_ledger_select.sql', import.meta.url),
  'utf8',
);

const ADMIN = '11111111-1111-4111-8111-111111111111';
const STORE = '22222222-2222-4222-8222-222222222222';
const SALES = '33333333-3333-4333-8333-333333333333';
const PRESS = '44444444-4444-4444-8444-444444444444';

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    GRANT USAGE ON SCHEMA public, private, auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb
    );
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      role text,
      assigned_roles text[] DEFAULT '{}'::text[],
      active boolean DEFAULT true,
      status text DEFAULT 'Active',
      auth_user_id uuid
    );
    CREATE TABLE public.inventory_ledger_entries (
      id text PRIMARY KEY,
      entry_kind text NOT NULL,
      barcode text,
      stock_item_id text,
      order_id text,
      job_name text,
      qty_kg numeric
    );
    ALTER TABLE public.inventory_ledger_entries ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_ledger_entries TO anon, authenticated;

    CREATE OR REPLACE FUNCTION private.app_roles()
    RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
    AS $$
      SELECT COALESCE((
        SELECT ARRAY(
          SELECT DISTINCT candidate
          FROM (
            SELECT u.role AS candidate
            UNION ALL
            SELECT unnest(coalesce(u.assigned_roles, ARRAY[]::text[]))
          ) AS raw(candidate)
          WHERE candidate IS NOT NULL AND btrim(candidate) <> ''
        )
        FROM public.users AS u
        WHERE u.auth_user_id = auth.uid()
        LIMIT 1
      ), ARRAY[]::text[]);
    $$;

    CREATE OR REPLACE FUNCTION private.can_any(modules text[])
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
    AS $$
      SELECT EXISTS (
        SELECT 1
        FROM unnest(private.app_roles()) AS granted(role_name)
        WHERE granted.role_name = 'Admin'
           OR EXISTS (
             SELECT 1
             FROM public.role_permissions AS rp
             WHERE rp.role = granted.role_name
               AND EXISTS (
                 SELECT 1
                 FROM unnest(modules) AS requested(module_key)
                 WHERE rp.permissions -> requested.module_key = 'true'::jsonb
               )
           )
      );
    $$;
    GRANT EXECUTE ON FUNCTION private.app_roles() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.can_any(text[]) TO authenticated;
  `);
  await db.query(
    `INSERT INTO public.role_permissions (role, permissions) VALUES
      ('Admin', '{"inventory": true}'::jsonb),
      ('Store Manager', '{"inventory": true}'::jsonb),
      ('Sales Manager', '{"inventory": false, "sales": true}'::jsonb),
      ('Printing Operator', '{"inventory": false, "printing_scheduler": true}'::jsonb)`,
  );
  await db.query(
    `INSERT INTO public.users (id, role, assigned_roles, auth_user_id) VALUES
      ('admin', 'Admin', ARRAY['Admin'], $1::uuid),
      ('store', 'Store Manager', ARRAY['Store Manager'], $2::uuid),
      ('sales', 'Sales Manager', ARRAY['Sales Manager'], $3::uuid),
      ('press', 'Printing Operator', ARRAY['Printing Operator'], $4::uuid)`,
    [ADMIN, STORE, SALES, PRESS],
  );
  await db.query(
    `INSERT INTO public.inventory_ledger_entries
      (id, entry_kind, barcode, stock_item_id, order_id, job_name, qty_kg)
     VALUES
      ('issue-1', 'issue', 'RM-QA95-A1', 'INV-QA95-A', 'ORD-QA95-PRINT', 'QA95 Meter Print Job', 20),
      ('return-1', 'balance_receipt', 'RM-QA95-A1-BAL', 'INV-QA95-A', 'ORD-QA95-PRINT', 'QA95 Meter Print Job', 11.6)`,
  );
  return db;
}

async function asUser(db, authId) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [authId]);
  await db.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  await db.exec('SET ROLE authenticated');
}

test('the migration is select-only and later than the production floor', () => {
  assert.ok('20261109150100' > '20261109140000');
  assert.match(migrationSql, /FOR SELECT/);
  assert.match(migrationSql, /private\.can_any\(ARRAY\['inventory'\]/);
  assert.match(migrationSql, /inventory_ledger_entries_select/);
  assert.doesNotMatch(migrationSql, /FOR INSERT/);
  assert.doesNotMatch(migrationSql, /FOR UPDATE/);
  assert.doesNotMatch(migrationSql, /FOR DELETE/);
  assert.doesNotMatch(migrationSql, /FOR ALL/);
});

test('inventory roles can read issue and balance rows, and nobody can write through the table', async () => {
  const db = await database();
  await asUser(db, STORE);
  const blocked = await db.query(`SELECT id FROM public.inventory_ledger_entries ORDER BY id`);
  assert.deepEqual(blocked.rows, []);

  await db.exec('RESET ROLE');
  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const policies = await db.query(
    `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'inventory_ledger_entries' ORDER BY policyname`,
  );
  assert.deepEqual(policies.rows, [{ policyname: 'inventory_ledger_entries_select', cmd: 'SELECT' }]);

  await asUser(db, STORE);
  const visible = await db.query(
    `SELECT id, entry_kind, order_id, job_name, qty_kg FROM public.inventory_ledger_entries ORDER BY id`,
  );
  assert.deepEqual(visible.rows.map((row) => row.entry_kind), ['issue', 'balance_receipt']);
  assert.equal(visible.rows[0].order_id, 'ORD-QA95-PRINT');
  assert.equal(visible.rows[0].job_name, 'QA95 Meter Print Job');
  assert.equal(visible.rows[1].order_id, 'ORD-QA95-PRINT');
  await assert.rejects(
    () => db.query(`INSERT INTO public.inventory_ledger_entries (id, entry_kind, qty_kg) VALUES ('x', 'issue', 1)`),
    /row-level security|permission denied/i,
  );
  const updated = await db.query(
    `UPDATE public.inventory_ledger_entries SET qty_kg = 1 WHERE id = 'issue-1' RETURNING id`,
  );
  assert.equal(updated.rows.length, 0);
  const deleted = await db.query(
    `DELETE FROM public.inventory_ledger_entries WHERE id = 'issue-1' RETURNING id`,
  );
  assert.equal(deleted.rows.length, 0);
  const kept = await db.query(`SELECT qty_kg FROM public.inventory_ledger_entries WHERE id = 'issue-1'`);
  assert.equal(Number(kept.rows[0].qty_kg), 20);

  await asUser(db, ADMIN);
  const adminRows = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  assert.equal(adminRows.rows[0].n, 2);

  await asUser(db, SALES);
  const salesRows = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  assert.equal(salesRows.rows[0].n, 0);

  await asUser(db, PRESS);
  const pressRows = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  assert.equal(pressRows.rows[0].n, 0);

  await db.exec('RESET ROLE');
  await db.exec(`
    CREATE OR REPLACE FUNCTION public._test_post_ledger()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $fn$
    BEGIN
      INSERT INTO public.inventory_ledger_entries (id, entry_kind, barcode, order_id, job_name, qty_kg)
      VALUES ('posted-1', 'balance_receipt', 'RM-NEW-BAL', 'ORD-NEW', 'Posted by definer', 4);
    END;
    $fn$;
  `);
  await asUser(db, STORE);
  await db.query(`SELECT public._test_post_ledger()`);
  const posted = await db.query(`SELECT job_name FROM public.inventory_ledger_entries WHERE id = 'posted-1'`);
  assert.equal(posted.rows[0].job_name, 'Posted by definer');
});
