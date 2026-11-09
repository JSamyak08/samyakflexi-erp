import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261109150000_printing_operator_sfg_view.sql', import.meta.url),
  'utf8',
);

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const SHOP = '33333333-3333-4333-8333-333333333333';
const STORE = '44444444-4444-4444-8444-444444444444';
const BOTH = '55555555-5555-4555-8555-555555555555';

const STAMP = '2026-01-01T00:00:00Z';

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
    GRANT USAGE ON SCHEMA public, private, auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

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
    CREATE TABLE public.sfg_goods (
      sfg_batch_code text PRIMARY KEY,
      job_name text
    );
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
    GRANT ALL ON public.role_permissions, public.users, public.sfg_goods, public.inventory, public.production_schedules
      TO authenticated;
  `);
  return db;
}

async function seed(db) {
  await db.query(
    `INSERT INTO public.role_permissions (role, permissions, updated_at) VALUES
      ('Printing Operator', $1::jsonb, $4::timestamptz),
      ('Shop Floor Operator', $2::jsonb, $4::timestamptz),
      ('Store Manager', $3::jsonb, $4::timestamptz)`,
    [
      JSON.stringify({
        sfg_store: true,
        inventory: true,
        printing_scheduler: true,
        plant_note: 'keep',
        dispatch: false,
      }),
      JSON.stringify({
        sfg_store: 'view',
        inventory: true,
        printing_scheduler: true,
        pellet_fuel: false,
      }),
      JSON.stringify({
        sfg_store: true,
        inventory: true,
        custom_flag: true,
      }),
      STAMP,
    ],
  );
  await db.query(
    `INSERT INTO public.users (id, role, assigned_roles, auth_user_id) VALUES
      ('op', 'Printing Operator', ARRAY['Printing Operator'], $1::uuid),
      ('shop', 'Shop Floor Operator', ARRAY['Shop Floor Operator'], $2::uuid),
      ('store', 'Store Manager', ARRAY['Store Manager'], $3::uuid),
      ('both', 'Printing Operator', ARRAY['Printing Operator', 'Store Manager'], $4::uuid)`,
    [OPERATOR, SHOP, STORE, BOTH],
  );
}

async function asUser(db, authId) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [authId]);
  await db.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  await db.exec('SET ROLE authenticated');
}

async function installStoreGuards(db) {
  await db.exec('RESET ROLE');
  await db.exec(`
    CREATE OR REPLACE FUNCTION private.reject_sfg_view_only_write()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = ''
    AS $fn$
    BEGIN
      IF current_user IN ('authenticated', 'anon')
         AND NOT private.can_edit_sfg_store(ARRAY['inventory', 'printing_scheduler']::text[]) THEN
        RAISE EXCEPTION 'SFG / FG Store is view-only for this account'
          USING ERRCODE = '42501';
      END IF;
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END;
    $fn$;

    ALTER TABLE public.sfg_goods ENABLE ROW LEVEL SECURITY;
    CREATE POLICY sfg_goods_select ON public.sfg_goods
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY sfg_goods_insert ON public.sfg_goods
      FOR INSERT TO authenticated
      WITH CHECK (private.can_edit_sfg_store(ARRAY['inventory', 'printing_scheduler']::text[]));
    CREATE TRIGGER sfg_goods_view_only_write
      BEFORE INSERT OR UPDATE OR DELETE ON public.sfg_goods
      FOR EACH ROW EXECUTE FUNCTION private.reject_sfg_view_only_write();

    ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
    CREATE POLICY inventory_access ON public.inventory
      FOR ALL TO authenticated
      USING (private.can_any(ARRAY['inventory']::text[]))
      WITH CHECK (private.can_any(ARRAY['inventory']::text[]));

    ALTER TABLE public.production_schedules ENABLE ROW LEVEL SECURITY;
    CREATE POLICY production_schedules_access ON public.production_schedules
      FOR ALL TO authenticated
      USING (private.can_any(ARRAY['printing_scheduler']::text[]))
      WITH CHECK (private.can_any(ARRAY['printing_scheduler']::text[]));

    CREATE OR REPLACE FUNCTION public._test_record_printed_lot()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $fn$
    BEGIN
      INSERT INTO public.sfg_goods (sfg_batch_code, job_name)
      VALUES ('SFG-LOT-END-RUN', 'Printed by end of run');
    END;
    $fn$;
    GRANT EXECUTE ON FUNCTION public._test_record_printed_lot() TO authenticated;
  `);
}

test('the migration is after the production floor and does not rewrite complete_print_run', () => {
  assert.ok('20261109150000' > '20261109140000');
  assert.match(migrationSql, /Printing Operator/);
  assert.match(migrationSql, /Shop Floor Operator/);
  assert.match(migrationSql, /jsonb_set/);
  assert.match(migrationSql, /'"view"'::jsonb/);
  assert.match(migrationSql, /NOT IN \('Printing Operator', 'Shop Floor Operator'\)/);
  assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION public\.complete_print_run/);
  assert.doesNotMatch(migrationSql, /"inventory": false/);
  assert.doesNotMatch(migrationSql, /permissions = target/);
});

test('only the operator SFG flag changes, and a second run leaves updated_at alone', async () => {
  const db = await database();
  await seed(db);
  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const rows = await db.query(`SELECT role, permissions, updated_at FROM public.role_permissions ORDER BY role`);
  const byRole = Object.fromEntries(rows.rows.map((row) => [row.role, row]));

  assert.equal(byRole['Printing Operator'].permissions.sfg_store, 'view');
  assert.equal(byRole['Printing Operator'].permissions.inventory, true);
  assert.equal(byRole['Printing Operator'].permissions.printing_scheduler, true);
  assert.equal(byRole['Printing Operator'].permissions.plant_note, 'keep');
  assert.equal(byRole['Printing Operator'].permissions.dispatch, false);
  assert.notEqual(new Date(byRole['Printing Operator'].updated_at).toISOString(), STAMP);

  assert.equal(byRole['Shop Floor Operator'].permissions.sfg_store, 'view');
  assert.equal(byRole['Shop Floor Operator'].permissions.inventory, true);
  assert.equal(byRole['Shop Floor Operator'].permissions.printing_scheduler, true);
  assert.equal(byRole['Shop Floor Operator'].permissions.pellet_fuel, false);
  assert.equal(new Date(byRole['Shop Floor Operator'].updated_at).toISOString(), new Date(STAMP).toISOString());

  assert.equal(byRole['Store Manager'].permissions.sfg_store, true);
  assert.equal(byRole['Store Manager'].permissions.custom_flag, true);
  assert.equal(new Date(byRole['Store Manager'].updated_at).toISOString(), new Date(STAMP).toISOString());
});

test('operators stay view-only on the store, keep inventory and scheduler writes, and a definer lot insert still works', async () => {
  const db = await database();
  await seed(db);
  await db.exec(migrationSql);
  await installStoreGuards(db);

  await asUser(db, OPERATOR);
  const operatorEdit = await db.query(
    `SELECT private.can_edit_sfg_store(ARRAY['inventory', 'printing_scheduler']::text[]) AS allowed`,
  );
  assert.equal(operatorEdit.rows[0].allowed, false);
  const visible = await db.query(`SELECT count(*)::int AS n FROM public.sfg_goods`);
  assert.equal(visible.rows[0].n, 0);
  await assert.rejects(
    () => db.query(`INSERT INTO public.sfg_goods (sfg_batch_code, job_name) VALUES ('SFG-DIRECT', 'Blocked')`),
    /view-only|row-level security/i,
  );
  await db.query(`SELECT public._test_record_printed_lot()`);
  const lot = await db.query(`SELECT job_name FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-LOT-END-RUN'`);
  assert.equal(lot.rows[0].job_name, 'Printed by end of run');
  await db.query(`INSERT INTO public.inventory (id, item_name, available_qty_kg) VALUES ('RM-1', 'PET', 20)`);
  await db.query(`UPDATE public.inventory SET available_qty_kg = 18 WHERE id = 'RM-1'`);
  const stock = await db.query(`SELECT available_qty_kg FROM public.inventory WHERE id = 'RM-1'`);
  assert.equal(Number(stock.rows[0].available_qty_kg), 18);
  await db.query(`INSERT INTO public.production_schedules (id, order_id, status) VALUES ('SCHED-1', 'ORD-1', 'Planned')`);
  const schedule = await db.query(`SELECT status FROM public.production_schedules WHERE id = 'SCHED-1'`);
  assert.equal(schedule.rows[0].status, 'Planned');

  await asUser(db, SHOP);
  const shopEdit = await db.query(
    `SELECT private.can_edit_sfg_store(ARRAY['inventory', 'printing_scheduler']::text[]) AS allowed`,
  );
  assert.equal(shopEdit.rows[0].allowed, false);
  await assert.rejects(
    () => db.query(`INSERT INTO public.sfg_goods (sfg_batch_code, job_name) VALUES ('SFG-SHOP', 'Blocked')`),
    /view-only|row-level security/i,
  );

  await asUser(db, STORE);
  const storeEdit = await db.query(
    `SELECT private.can_edit_sfg_store(ARRAY['inventory', 'printing_scheduler']::text[]) AS allowed`,
  );
  assert.equal(storeEdit.rows[0].allowed, true);
  await db.query(`INSERT INTO public.sfg_goods (sfg_batch_code, job_name) VALUES ('SFG-STORE', 'Store batch')`);

  await asUser(db, BOTH);
  const unionEdit = await db.query(
    `SELECT private.can_edit_sfg_store(ARRAY['inventory', 'printing_scheduler']::text[]) AS allowed`,
  );
  assert.equal(unionEdit.rows[0].allowed, true);
  await db.query(`INSERT INTO public.sfg_goods (sfg_batch_code, job_name) VALUES ('SFG-BOTH', 'Union batch')`);
});
