import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261101180000_operator_sfg_view_only.sql', import.meta.url),
  'utf8',
);

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const SHOP = '33333333-3333-4333-8333-333333333333';
const STORE = '44444444-4444-4444-8444-444444444444';
const BOTH = '55555555-5555-4555-8555-555555555555';
const LOOKUP = '66666666-6666-4666-8666-666666666666';

const WIDE = {
  dashboard: true,
  production_records: true,
  sfg_store: true,
  inventory: false,
  printing_scheduler: true,
  dispatch: true,
  pellet_fuel: true,
  cylinders: true,
  audit_logs: false,
};

function lotPayload(batch, consumedKg) {
  return {
    sfg_batch_code: batch,
    sfg_type: 'Printed Rolls',
    job_name: 'Printed job',
    order_id: 'ORD-1',
    total_net_kg: 10,
    consumed_kg: consumedKg,
    available_kg: 10 - consumedKg,
    total_meters: 100,
    rolls_count: 1,
    storage_bay: 'SFG Store (Pre-Lamination)',
    production_date: '2026-11-01',
    status: consumedKg > 0 ? 'Partially Consumed' : 'In Stock (WIP)',
    notes: JSON.stringify({
      isPrintedLot: true,
      sfgBatchCode: batch,
      consumedKg,
      dispatchedKg: consumedKg,
      childRolls: [{ barcodeId: 'ROLL-1', netWeightKg: 10 }],
      consumptionHistory: [],
    }),
  };
}

async function database({ withHelpers = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO PUBLIC;
    GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb,
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      role text,
      assigned_roles text[] DEFAULT '{}'::text[],
      active boolean DEFAULT true,
      status text DEFAULT 'Active',
      auth_user_id uuid
    );
  `);
  if (!withHelpers) return db;

  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE OR REPLACE FUNCTION private.app_roles()
    RETURNS text[]
    LANGUAGE sql STABLE AS $$
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
    LANGUAGE sql STABLE AS $$
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

    CREATE TABLE public.sfg_goods (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sfg_batch_code text UNIQUE NOT NULL,
      sfg_type text NOT NULL,
      job_id text,
      order_id text,
      job_name text NOT NULL,
      job_code text,
      client_name text,
      structure text,
      film_type text,
      micron numeric DEFAULT 0,
      width_mm numeric DEFAULT 0,
      total_gross_kg numeric DEFAULT 0,
      gross_weight_kg numeric DEFAULT 0,
      tare_weight_kg numeric DEFAULT 0,
      total_net_kg numeric DEFAULT 0,
      consumed_kg numeric DEFAULT 0,
      available_kg numeric DEFAULT 0,
      total_meters numeric DEFAULT 0,
      rolls_count integer DEFAULT 1,
      machine_name text,
      operator_name text,
      shift text,
      storage_bay text,
      production_date date DEFAULT CURRENT_DATE,
      status text,
      notes text,
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.fg_goods (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE public.sfg_fg_store (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE public.sfg_qc_hold_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE public.sfg_scrap_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_name text,
      available_qty_kg numeric
    );
    CREATE TABLE public.production_schedules (
      id text PRIMARY KEY,
      order_id text,
      status text
    );

    ALTER TABLE public.sfg_goods ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.fg_goods ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.sfg_fg_store ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.sfg_qc_hold_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.sfg_scrap_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.production_schedules ENABLE ROW LEVEL SECURITY;

    CREATE POLICY sfg_goods_access ON public.sfg_goods FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY inventory_access ON public.inventory FOR ALL TO authenticated
      USING (private.can_any(ARRAY['inventory','printing_scheduler']))
      WITH CHECK (private.can_any(ARRAY['inventory','printing_scheduler']));
    CREATE POLICY production_schedules_access ON public.production_schedules FOR ALL TO authenticated
      USING (private.can_any(ARRAY['printing_scheduler','production_records']))
      WITH CHECK (private.can_any(ARRAY['printing_scheduler','production_records']));

    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT ALL ON public.role_permissions, public.users, public.sfg_goods, public.fg_goods,
      public.sfg_fg_store, public.sfg_qc_hold_items, public.sfg_scrap_items,
      public.inventory, public.production_schedules
      TO anon, authenticated;
  `);
  return db;
}

async function seed(db) {
  const stamp = '2026-01-01T00:00:00Z';
  await db.query(
    `INSERT INTO public.role_permissions (role, permissions, updated_at) VALUES
      ('Printing Operator', $1::jsonb, $3::timestamptz),
      ('Shop Floor Operator', $1::jsonb, $3::timestamptz),
      ('Store Manager', $2::jsonb, $3::timestamptz),
      ('Sales Manager', '{"dispatch": true, "sales": true, "pellet_fuel": false}'::jsonb, $3::timestamptz)`,
    [JSON.stringify(WIDE), JSON.stringify({
      inventory: true,
      dispatch: true,
      sfg_store: true,
      pellet_fuel: true,
      plant_note: true,
    }), stamp],
  );
  await db.query(
    `INSERT INTO public.users (id, role, assigned_roles, auth_user_id) VALUES
      ('op', 'Printing Operator', ARRAY['Printing Operator'], $1::uuid),
      ('shop', 'Shop Floor Operator', ARRAY['Shop Floor Operator'], $2::uuid),
      ('store', 'Store Manager', ARRAY['Store Manager'], $3::uuid),
      ('both', 'Printing Operator', ARRAY['Printing Operator','Store Manager'], $4::uuid),
      ('lookup', 'Lookup Only', ARRAY['Lookup Only'], $5::uuid)`,
    [OPERATOR, SHOP, STORE, BOTH, LOOKUP],
  );
}

async function asUser(db, authId) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [authId]);
  await db.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  await db.exec('SET ROLE authenticated');
}

test('the migration is later than the production floor and names the operator rows', () => {
  assert.match(migrationSql, /20261101180000|Printing Operator/);
  const file = '20261101180000_operator_sfg_view_only.sql';
  assert.ok(file.slice(0, 14) > '20261031173000');
  assert.match(migrationSql, /Printing Operator/);
  assert.match(migrationSql, /Shop Floor Operator/);
  assert.match(migrationSql, /IS DISTINCT FROM/);
  assert.match(migrationSql, /private\.can_edit_sfg_store/);
  assert.match(migrationSql, /public\.save_printing_sfg_lot/);
  assert.doesNotMatch(migrationSql, /UPDATE public\.role_permissions[\s\S]{0,200}WHERE role NOT IN/);
});

test('permission rows update only the two operator roles, and a second run is a no-op', async () => {
  const db = await database({ withHelpers: false });
  await seed(db);
  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const rows = await db.query(`SELECT role, permissions, updated_at FROM public.role_permissions ORDER BY role`);
  const byRole = Object.fromEntries(rows.rows.map((row) => [row.role, row]));
  for (const role of ['Printing Operator', 'Shop Floor Operator']) {
    const permissions = byRole[role].permissions;
    assert.equal(permissions.inventory, true);
    assert.equal(permissions.printing_scheduler, true);
    assert.equal(permissions.sfg_store, 'view');
    assert.equal(permissions.dispatch, false);
    assert.equal(permissions.pellet_fuel, false);
    assert.equal(permissions.dashboard, false);
    assert.equal(permissions.production_records, false);
    assert.equal(permissions.cylinders, false);
  }
  assert.equal(byRole['Store Manager'].permissions.dispatch, true);
  assert.equal(byRole['Store Manager'].permissions.sfg_store, true);
  assert.equal(byRole['Store Manager'].permissions.plant_note, true);
  assert.equal(byRole['Store Manager'].permissions.pellet_fuel, true);
  assert.equal(new Date(byRole['Store Manager'].updated_at).toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(byRole['Sales Manager'].permissions.dispatch, true);
  assert.equal(byRole['Sales Manager'].permissions.sales, true);
});

test('view-only operators can read stock but not change it, and can still write inventory and schedules', async () => {
  const db = await database();
  await seed(db);
  await db.exec(migrationSql);
  await db.exec(`
    INSERT INTO public.role_permissions (role, permissions)
    VALUES ('Lookup Only', '{"sfg_store": "view"}'::jsonb)
  `);

  await asUser(db, OPERATOR);
  const visible = await db.query(`SELECT count(*)::int AS n FROM public.sfg_goods`);
  assert.equal(visible.rows[0].n, 0);
  await assert.rejects(
    () => db.query(`INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name) VALUES ('SFG-NEW', 'Printed Rolls', 'Blocked')`),
    /row-level security|view-only|permission/i,
  );
  await assert.rejects(
    () => db.query(`INSERT INTO public.sfg_qc_hold_items (name) VALUES ('hold')`),
    /view-only|row-level security/i,
  );
  await assert.rejects(
    () => db.query(`INSERT INTO public.sfg_scrap_items (name) VALUES ('scrap')`),
    /view-only|row-level security/i,
  );
  await assert.rejects(
    () => db.query(`INSERT INTO public.fg_goods (name) VALUES ('fg')`),
    /view-only|row-level security/i,
  );

  await db.query(`SELECT public.save_printing_sfg_lot($1::jsonb)`, [JSON.stringify(lotPayload('SFG-LOT-ORD-1', 8))]);
  const created = await db.query(`SELECT consumed_kg, notes FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-LOT-ORD-1'`);
  assert.equal(Number(created.rows[0].consumed_kg), 0);

  await db.exec('RESET ROLE');
  await db.query(`UPDATE public.sfg_goods SET consumed_kg = 4, notes = jsonb_set(notes::jsonb, '{consumedKg}', '4')::text WHERE sfg_batch_code = 'SFG-LOT-ORD-1'`);
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.save_printing_sfg_lot($1::jsonb)`, [JSON.stringify(lotPayload('SFG-LOT-ORD-1', 9))]);
  const kept = await db.query(`SELECT consumed_kg, status, notes FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-LOT-ORD-1'`);
  assert.equal(Number(kept.rows[0].consumed_kg), 4);
  assert.equal(kept.rows[0].status, 'Partially Consumed');
  assert.equal(JSON.parse(kept.rows[0].notes).dispatchedKg, 0);
  await assert.rejects(
    () => db.query(`UPDATE public.sfg_goods SET consumed_kg = 9 WHERE sfg_batch_code = 'SFG-LOT-ORD-1'`),
    /view-only|row-level security/i,
  );
  await assert.rejects(
    () => db.query(`DELETE FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-LOT-ORD-1'`),
    /view-only|row-level security/i,
  );
  await assert.rejects(
    () => db.query(`SELECT public.save_printing_sfg_lot($1::jsonb)`, [JSON.stringify({ sfg_batch_code: 'SFG-OTHER', job_name: 'Nope', sfg_type: 'Printed Rolls' })]),
    /printed job lot|view-only/i,
  );

  await db.query(`INSERT INTO public.inventory (id, item_name, available_qty_kg) VALUES ('RM-1', 'PET', 25)`);
  await db.query(`UPDATE public.inventory SET available_qty_kg = 20 WHERE id = 'RM-1'`);
  const stock = await db.query(`SELECT available_qty_kg FROM public.inventory WHERE id = 'RM-1'`);
  assert.equal(Number(stock.rows[0].available_qty_kg), 20);
  await db.query(`INSERT INTO public.production_schedules (id, order_id, status) VALUES ('SCHED-1', 'ORD-1', 'Planned')`);
  await db.query(`UPDATE public.production_schedules SET status = 'In Production' WHERE id = 'SCHED-1'`);
  const schedule = await db.query(`SELECT status FROM public.production_schedules WHERE id = 'SCHED-1'`);
  assert.equal(schedule.rows[0].status, 'In Production');

  await asUser(db, SHOP);
  await assert.rejects(
    () => db.query(`INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name) VALUES ('SFG-SHOP', 'Printed Rolls', 'Blocked')`),
    /view-only|row-level security/i,
  );
  await db.query(`INSERT INTO public.inventory (id, item_name, available_qty_kg) VALUES ('RM-2', 'BOPP', 5)`);

  await asUser(db, LOOKUP);
  const lookup = await db.query(`SELECT count(*)::int AS n FROM public.sfg_goods`);
  assert.equal(lookup.rows[0].n, 1);
  await assert.rejects(
    () => db.query(`INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name) VALUES ('SFG-LOOK', 'Printed Rolls', 'Blocked')`),
    /view-only|row-level security/i,
  );

  await asUser(db, STORE);
  await db.query(`INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name, consumed_kg) VALUES ('SFG-STORE', 'Laminated Rolls', 'Store batch', 1)`);
  const storeRow = await db.query(`SELECT consumed_kg FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-STORE'`);
  assert.equal(Number(storeRow.rows[0].consumed_kg), 1);

  await asUser(db, BOTH);
  await db.query(`INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name) VALUES ('SFG-BOTH', 'Printed Rolls', 'Union batch')`);
  await db.query(`UPDATE public.sfg_goods SET consumed_kg = 2 WHERE sfg_batch_code = 'SFG-BOTH'`);
  const unionRow = await db.query(`SELECT consumed_kg FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-BOTH'`);
  assert.equal(Number(unionRow.rows[0].consumed_kg), 2);

  await db.exec('RESET ROLE');
  const inventoryPolicy = await db.query(`SELECT policyname FROM pg_policies WHERE tablename = 'inventory'`);
  assert.deepEqual(inventoryPolicy.rows.map((row) => row.policyname), ['inventory_access']);
  const sfgPolicies = await db.query(`SELECT policyname FROM pg_policies WHERE tablename = 'sfg_goods' ORDER BY policyname`);
  assert.deepEqual(sfgPolicies.rows.map((row) => row.policyname), [
    'sfg_goods_delete',
    'sfg_goods_insert',
    'sfg_goods_select',
    'sfg_goods_update',
  ]);
});
