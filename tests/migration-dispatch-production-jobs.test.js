import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261113180000_store_manager_dispatch_jobs.sql', import.meta.url),
  'utf8',
);

const ADMIN = '11111111-1111-4111-8111-111111111111';
const STORE = '22222222-2222-4222-8222-222222222222';
const PRESS = '33333333-3333-4333-8333-333333333333';
const SHOP = '44444444-4444-4444-8444-444444444444';
const PURCHASE = '55555555-5555-4555-8555-555555555555';
const STORE_NO_DISPATCH = '66666666-6666-4666-8666-666666666666';

test('the migration is a read-only job projection and does not open orders', () => {
  assert.match(migrationSql, /private\.can_read_dispatch_production_jobs\(\)/);
  assert.match(migrationSql, /private\.has_role\(ARRAY\['Store Manager'\]::text\[\]\)/);
  assert.match(migrationSql, /private\.can_any\(ARRAY\['dispatch'\]::text\[\]\)/);
  assert.match(migrationSql, /security_invoker = true/);
  assert.match(migrationSql, /split_part\(o\.job_name, ' \|\|\| ', 1\)/);
  assert.match(migrationSql, /job_details ->> 'poNumber'/);
  assert.match(migrationSql, /GRANT SELECT ON TABLE public\.dispatch_production_jobs TO authenticated/);
  const executable = migrationSql.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(executable, /CREATE POLICY/);
  assert.doesNotMatch(executable, /GRANT\s+(INSERT|UPDATE|DELETE|ALL)/i);
  assert.doesNotMatch(migrationSql, /ON TABLE public\.orders/i);
  assert.doesNotMatch(migrationSql, /calculationDetails|raw_material_requirements|order_qty_kg/);
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
});

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
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

    CREATE TABLE public.users (
      id text PRIMARY KEY,
      role text,
      assigned_roles text[] DEFAULT '{}'::text[],
      active boolean DEFAULT true,
      status text DEFAULT 'Active',
      auth_user_id uuid
    );
    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb
    );
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      client_name text NOT NULL,
      status text,
      order_qty_kg numeric,
      job_details jsonb,
      raw_material_requirements jsonb
    );
    ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.users, public.role_permissions, public.orders TO anon, authenticated;

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
          AND coalesce(u.active, true) = true
          AND lower(coalesce(u.status, 'Active')) = 'active'
        LIMIT 1
      ), ARRAY[]::text[]);
    $$;

    CREATE OR REPLACE FUNCTION private.has_role(allowed text[])
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
    AS $$
      SELECT EXISTS (
        SELECT 1
        FROM unnest(private.app_roles()) AS granted(role_name)
        WHERE granted.role_name = 'Admin'
           OR granted.role_name = ANY (allowed)
      );
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
    GRANT EXECUTE ON FUNCTION private.has_role(text[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.can_any(text[]) TO authenticated;

    CREATE POLICY orders_access ON public.orders
      FOR ALL TO authenticated
      USING (
        private.can_any(ARRAY['orders','job_punching','sales','production_records','printing_scheduler'])
      )
      WITH CHECK (
        private.can_any(ARRAY['orders','job_punching','sales','production_records','printing_scheduler'])
      );
  `);

  await db.exec(`
    INSERT INTO public.role_permissions (role, permissions) VALUES
      ('Admin', '{"dispatch": true, "orders": true}'::jsonb),
      ('Store Manager', '{"dispatch": true, "inventory": true, "orders": false, "sales": false, "job_punching": false, "production_records": false, "printing_scheduler": false}'::jsonb),
      ('Printing Operator', '{"dispatch": false, "printing_scheduler": true, "orders": false, "production_records": false}'::jsonb),
      ('Shop Floor Operator', '{"dispatch": false, "printing_scheduler": true, "production_records": true, "orders": false}'::jsonb),
      ('Purchase Manager', '{"dispatch": true, "orders": false, "inventory": true}'::jsonb);
    INSERT INTO public.users (id, role, assigned_roles, auth_user_id) VALUES
      ('admin', 'Admin', ARRAY['Admin'], '${ADMIN}'),
      ('store', 'Store Manager', ARRAY['Store Manager'], '${STORE}'),
      ('press', 'Printing Operator', ARRAY['Printing Operator'], '${PRESS}'),
      ('shop', 'Shop Floor Operator', ARRAY['Shop Floor Operator'], '${SHOP}'),
      ('purchase', 'Purchase Manager', ARRAY['Purchase Manager'], '${PURCHASE}'),
      ('store-off', 'Store Manager', ARRAY['Store Manager'], '${STORE_NO_DISPATCH}');
    INSERT INTO public.orders (id, job_name, client_name, status, order_qty_kg, job_details, raw_material_requirements) VALUES
      (
        'ORD-FG-1',
        'QA Flow Finished Goods ||| {"jobDetails":{"calculationDetails":{"rate":99}}}',
        'Insta Foods',
        'In Production',
        500,
        '{"poNumber":"PO-77","calculationDetails":{"rate":99}}'::jsonb,
        '[{"item":"PET"}]'::jsonb
      ),
      (
        'ORD-PLAIN',
        'Plain Reel Job',
        'Atta Limited',
        'Open',
        12,
        '{}'::jsonb,
        '[]'::jsonb
      );
  `);
  await db.exec(migrationSql);
  await db.exec(migrationSql);
  return db;
}

async function asUser(db, authId) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [authId]);
  await db.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  await db.exec('SET ROLE authenticated');
}

async function asOwner(db) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  await db.query(`SELECT set_config('request.jwt.claim.role', '', false)`);
}

test('Store Manager sees the same job names and cannot read or change orders', async () => {
  const db = await database();
  const columns = await db.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dispatch_production_jobs'
    ORDER BY ordinal_position
  `);
  assert.deepEqual(columns.rows.map((row) => row.column_name), [
    'id', 'job_name', 'client_name', 'status', 'po_number',
  ]);
  const options = await db.query(`
    SELECT c.reloptions
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'dispatch_production_jobs'
  `);
  assert.match(String(options.rows[0].reloptions), /security_invoker=true/);

  const policies = await db.query(`
    SELECT polname FROM pg_policy pol
    JOIN pg_class cls ON cls.oid = pol.polrelid
    WHERE cls.relname = 'orders'
  `);
  assert.deepEqual(policies.rows.map((row) => row.polname), ['orders_access']);

  await asUser(db, STORE);
  const jobs = await db.query(`
    SELECT id, job_name, client_name, status, po_number
    FROM public.dispatch_production_jobs
    ORDER BY job_name
  `);
  assert.deepEqual(jobs.rows, [
    {
      id: 'ORD-PLAIN',
      job_name: 'Plain Reel Job',
      client_name: 'Atta Limited',
      status: 'Open',
      po_number: null,
    },
    {
      id: 'ORD-FG-1',
      job_name: 'QA Flow Finished Goods',
      client_name: 'Insta Foods',
      status: 'In Production',
      po_number: 'PO-77',
    },
  ]);
  assert.equal(JSON.stringify(jobs.rows).includes('rate'), false);
  assert.equal(JSON.stringify(jobs.rows).includes('|||'), false);

  const hidden = await db.query(`SELECT id, job_details, order_qty_kg FROM public.orders`);
  assert.equal(hidden.rows.length, 0);

  await assert.rejects(
    () => db.query(`INSERT INTO public.orders (id, job_name, client_name) VALUES ('ORD-NEW', 'Nope', 'Nope')`),
    /row-level security|permission denied/i,
  );
  await db.query(`UPDATE public.orders SET client_name = 'Stolen' WHERE id = 'ORD-FG-1'`);
  await db.query(`DELETE FROM public.orders WHERE id = 'ORD-FG-1'`);
  await assert.rejects(
    () => db.query(`INSERT INTO public.dispatch_production_jobs (id, job_name, client_name) VALUES ('X', 'Y', 'Z')`),
    /cannot insert|permission denied|not allowed/i,
  );

  await asOwner(db);
  const still = await db.query(`SELECT id, client_name, order_qty_kg FROM public.orders ORDER BY id`);
  assert.equal(still.rows.length, 2);
  assert.equal(still.rows.find((row) => row.id === 'ORD-FG-1').client_name, 'Insta Foods');
  assert.equal(Number(still.rows.find((row) => row.id === 'ORD-FG-1').order_qty_kg), 500);

  await db.close();
});

test('operators and other dispatch roles do not gain the job projection', async () => {
  const db = await database();

  await asUser(db, PRESS);
  const pressJobs = await db.query(`SELECT id FROM public.dispatch_production_jobs`);
  const pressOrders = await db.query(`SELECT id, order_qty_kg FROM public.orders`);
  assert.equal(pressJobs.rows.length, 0);
  assert.equal(pressOrders.rows.length, 2);
  assert.equal(Number(pressOrders.rows.find((row) => row.id === 'ORD-FG-1').order_qty_kg), 500);

  await asUser(db, SHOP);
  const shopJobs = await db.query(`SELECT id FROM public.dispatch_production_jobs`);
  const shopOrders = await db.query(`SELECT id FROM public.orders`);
  assert.equal(shopJobs.rows.length, 0);
  assert.equal(shopOrders.rows.length, 2);

  await asUser(db, PURCHASE);
  const purchaseJobs = await db.query(`SELECT id FROM public.dispatch_production_jobs`);
  const purchaseOrders = await db.query(`SELECT id FROM public.orders`);
  assert.equal(purchaseJobs.rows.length, 0);
  assert.equal(purchaseOrders.rows.length, 0);

  await asUser(db, ADMIN);
  const adminJobs = await db.query(`SELECT id, job_name FROM public.dispatch_production_jobs ORDER BY id`);
  const adminOrders = await db.query(`SELECT id FROM public.orders`);
  assert.equal(adminJobs.rows.length, 2);
  assert.equal(adminJobs.rows.find((row) => row.id === 'ORD-FG-1').job_name, 'QA Flow Finished Goods');
  assert.equal(adminOrders.rows.length, 2);

  await asOwner(db);
  await db.query(`
    UPDATE public.role_permissions
    SET permissions = permissions || '{"dispatch": false}'::jsonb
    WHERE role = 'Store Manager'
  `);
  await asUser(db, STORE_NO_DISPATCH);
  const closed = await db.query(`SELECT id FROM public.dispatch_production_jobs`);
  assert.equal(closed.rows.length, 0);

  await asOwner(db);
  await db.exec('SET ROLE anon');
  await assert.rejects(
    () => db.query(`SELECT id FROM public.dispatch_production_jobs`),
    /permission denied/i,
  );

  await db.close();
});
