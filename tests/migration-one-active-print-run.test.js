import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { buildPrintMachineUtilization } from '../src/utils/printMachineUtilization.js';

const previousSql = fs.readFileSync(
  new URL('../supabase/migrations/20261031173000_print_run_keeps_order_close.sql', import.meta.url),
  'utf8'
);
const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261101193000_one_active_print_run_and_utilization.sql', import.meta.url),
  'utf8'
);

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const SHOP = '33333333-3333-4333-8333-333333333333';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const PLANT = '44444444-4444-4444-8444-444444444444';
const PRODUCTION = '55555555-5555-4555-8555-555555555555';
const SALES = '66666666-6666-4666-8666-666666666666';

async function database({ duplicates = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE SCHEMA IF NOT EXISTS private;
    GRANT USAGE ON SCHEMA private TO authenticated;
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      auth_user_id uuid,
      username text,
      full_name text,
      email text,
      role text,
      status text,
      active boolean
    );
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE OR REPLACE FUNCTION private.has_role(allowed text[])
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $$
      SELECT EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE auth.uid() IS NOT NULL
          AND (u.auth_user_id = auth.uid() OR (u.auth_user_id IS NULL AND u.id = (auth.uid())::text))
          AND u.active IS NOT FALSE
          AND (u.role = 'Admin' OR u.role = ANY (allowed))
      );
    $$;
    CREATE OR REPLACE FUNCTION private.app_roles()
    RETURNS text[]
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $$
      SELECT COALESCE((
        SELECT ARRAY[u.role]
        FROM public.users AS u
        WHERE auth.uid() IS NOT NULL
          AND u.auth_user_id = auth.uid()
          AND u.active IS NOT FALSE
        LIMIT 1
      ), ARRAY[]::text[]);
    $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.has_role(text[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.app_roles() TO authenticated;
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text,
      client_name text,
      order_type text,
      order_qty_kg numeric,
      delivery_date date,
      target_delivery_date date,
      status text,
      job_details jsonb,
      raw_material_requirements jsonb,
      printing_status text,
      printing_start_time timestamptz,
      printing_end_time timestamptz,
      printing_duration_minutes numeric,
      printing_duration_formatted text,
      actual_meters_printed numeric,
      ink_gsm_in_speed numeric,
      printed_output_kg numeric,
      printing_notes text,
      machine_id text,
      job_master_id text,
      closed_by text,
      closed_at timestamptz,
      close_reason text,
      close_mode text,
      over_dispatch_warning text
    );
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text,
      updated_at timestamptz
    );
    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb,
      updated_at timestamptz
    );
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
    GRANT SELECT ON public.users TO authenticated;
    GRANT SELECT ON public.role_permissions TO authenticated;
    INSERT INTO public.users (id, auth_user_id, username, full_name, email, role, status, active) VALUES
      ('op', '${OPERATOR}', 'ravi', 'Ravi Press', 'ravi@plant.test', 'Printing Operator', 'Active', true),
      ('shop', '${SHOP}', 'mina', 'Mina Floor', 'mina@plant.test', 'Shop Floor Operator', 'Active', true),
      ('admin', '${ADMIN}', 'admin', 'Asha Admin', 'asha@plant.test', 'Admin', 'Active', true),
      ('plant', '${PLANT}', 'plant', 'Plant Head', 'plant@plant.test', 'Plant Manager', 'Active', true),
      ('prod', '${PRODUCTION}', 'prod', 'Production Head', 'prod@plant.test', 'Production Manager', 'Active', true),
      ('sales', '${SALES}', 'sales', 'Sales Lead', 'sales@plant.test', 'Sales Manager', 'Active', true);
    INSERT INTO public.role_permissions (role, permissions) VALUES
      ('Admin', '{"print_run_analytics": true}'),
      ('Plant Manager', '{"print_run_analytics": true}'),
      ('Production Manager', '{"print_run_analytics": true}'),
      ('Printing Operator', '{"print_run_analytics": false, "sfg_store": "view", "printing_scheduler": true}'),
      ('Shop Floor Operator', '{"print_run_analytics": false, "sfg_store": "view"}'),
      ('Sales Manager', '{"print_run_analytics": false}');
    INSERT INTO public.orders (id, job_name, status, close_mode, job_details, printing_status, machine_id) VALUES
      ('ORD-OPEN', 'Peas Pouch', 'In Production', NULL, '{"closeMode": null}'::jsonb, 'Pending', NULL),
      ('ORD-NEXT', 'Rice Pouch', 'Scheduled', NULL, '{}'::jsonb, 'Pending', NULL),
      ('ORD-OTHER', 'Oil Pouch', 'Scheduled', NULL, '{}'::jsonb, 'Pending', NULL),
      ('ORD-MANUAL', 'Closed Pouch', 'Completed', 'manual', '{"closeMode": "manual"}'::jsonb, 'Pending', NULL);
  `);
  if (duplicates) {
    await db.exec(`
      INSERT INTO public.orders (id, job_name, status, printing_status, printing_start_time, printing_end_time, machine_id, job_details) VALUES
        ('ORD-DUP-1', 'Dup Job One', 'In Production', 'In Production', '2026-11-01 08:00:00+05:30', NULL, 'MAC-DUP', '{}'::jsonb),
        ('ORD-DUP-2', 'Dup Job Two', 'In Production', 'In Production', '2026-11-01 09:00:00+05:30', NULL, 'MAC-DUP', '{}'::jsonb);
    `);
  }
  await db.exec(previousSql);
  await db.exec(migrationSql);
  return db;
}

async function asUser(db, uid) {
  await db.exec('RESET ROLE');
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false)`);
  await db.exec('SET ROLE authenticated');
}

async function reset(db) {
  await db.exec('RESET ROLE');
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`);
}

test('migration timestamp is after the production floor', () => {
  const name = '20261101193000_one_active_print_run_and_utilization.sql';
  assert.ok(name.slice(0, 14) > '20261101180000');
  assert.match(migrationSql, /print_run_duplicate_actives/);
  assert.match(migrationSql, /Does not update public\.orders/);
  assert.doesNotMatch(migrationSql, /UPDATE public\.orders[\s\S]{0,120}printing_end_time\s*=\s*(now\(\)|pg_catalog\.now\(\))/);
});

test('existing duplicate active runs stay open and are reported', async () => {
  const db = await database({ duplicates: true });
  await reset(db);
  const rows = await db.query(`
    SELECT id, printing_status, printing_end_time
    FROM public.orders
    WHERE id IN ('ORD-DUP-1', 'ORD-DUP-2')
    ORDER BY id
  `);
  assert.equal(rows.rows.length, 2);
  assert.equal(rows.rows[0].printing_end_time, null);
  assert.equal(rows.rows[1].printing_end_time, null);
  assert.equal(rows.rows[0].printing_status, 'In Production');
  const dupes = await db.query(`SELECT order_id, job_name FROM public.print_run_duplicate_actives ORDER BY order_id`);
  assert.deepEqual(dupes.rows.map((row) => row.order_id), ['ORD-DUP-1', 'ORD-DUP-2']);
  assert.deepEqual(dupes.rows.map((row) => row.job_name), ['Dup Job One', 'Dup Job Two']);
  const slots = await db.query(`SELECT print_active_slot FROM public.orders WHERE id IN ('ORD-DUP-1', 'ORD-DUP-2')`);
  assert.deepEqual(slots.rows.map((row) => row.print_active_slot), [null, null]);

  await asUser(db, OPERATOR);
  await assert.rejects(
    db.query(`SELECT public.record_print_run('ORD-OPEN', 'start', '{"machineId":"MAC-DUP","printingStartTime":"2026-11-01T10:00:00+05:30"}'::jsonb)`),
    /PRINT_RUN_BUSY[\s\S]*Dup Job/
  );
  const still = await db.query(`SELECT printing_status FROM public.orders WHERE id = 'ORD-OPEN'`);
  assert.equal(still.rows[0].printing_status, 'Pending');
  await db.close();
});

test('one machine can have one active run, and a second start names the job still running', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  const started = await db.query(
    `SELECT public.record_print_run($1, 'start', $2::jsonb) AS run`,
    ['ORD-OPEN', JSON.stringify({ machineId: 'MAC-1', printingStartTime: '2026-11-01T02:30:00.000Z' })]
  );
  assert.equal(started.rows[0].run.printingStatus, 'In Production');
  assert.equal(started.rows[0].run.status, 'In Production');
  assert.equal(started.rows[0].run.closeMode, null);
  assert.equal(started.rows[0].run.machineId, 'MAC-1');

  await assert.rejects(
    db.query(
      `SELECT public.record_print_run($1, 'start', $2::jsonb)`,
      ['ORD-NEXT', JSON.stringify({ machineId: 'MAC-1', printingStartTime: '2026-11-01T04:00:00.000Z' })]
    ),
    (error) => {
      assert.match(error.message, /PRINT_RUN_BUSY/);
      assert.match(error.message, /Peas Pouch/);
      assert.match(error.message, /ORD-OPEN/);
      assert.match(error.message, /MAC-1/);
      return true;
    }
  );

  const otherPress = await db.query(
    `SELECT public.record_print_run($1, 'start', $2::jsonb) AS run`,
    ['ORD-OTHER', JSON.stringify({ machineId: 'MAC-2', printingStartTime: '2026-11-01T04:00:00.000Z' })]
  );
  assert.equal(otherPress.rows[0].run.printingStatus, 'In Production');
  assert.equal(otherPress.rows[0].run.machineId, 'MAC-2');

  await db.exec('RESET ROLE');
  await assert.rejects(
    db.query(`UPDATE public.orders SET printing_status = 'In Production', printing_start_time = '2026-11-01T10:30:00+05:30', printing_end_time = NULL, machine_id = 'MAC-1' WHERE id = 'ORD-NEXT'`),
    /PRINT_RUN_BUSY/
  );

  await asUser(db, OPERATOR);
  const again = await db.query(
    `SELECT public.record_print_run('ORD-OPEN', 'start', '{"machineId":"MAC-1","printingStartTime":"2026-11-01T02:30:00.000Z"}'::jsonb) AS run`
  );
  assert.equal(again.rows[0].run.printingStatus, 'In Production');

  await asUser(db, SHOP);
  const ended = await db.query(
    `SELECT public.record_print_run($1, 'end', $2::jsonb) AS run`,
    ['ORD-OPEN', JSON.stringify({
      printingEndTime: '2026-11-01T08:00:00.000Z',
      nextProcess: 'Lamination Machine',
      printedOutputKg: 12,
      closeMode: 'manual',
      status: 'Completed'
    })]
  );
  assert.equal(ended.rows[0].run.printingStatus, 'Completed');
  assert.equal(ended.rows[0].run.status, 'In Production');
  assert.equal(ended.rows[0].run.closeMode, null);
  assert.equal(ended.rows[0].run.nextProcess, 'Lamination Machine');

  await asUser(db, OPERATOR);
  const restarted = await db.query(
    `SELECT public.record_print_run('ORD-NEXT', 'start', '{"machineId":"MAC-1","printingStartTime":"2026-11-01T08:30:00.000Z"}'::jsonb) AS run`
  );
  assert.equal(restarted.rows[0].run.printingStatus, 'In Production');

  await reset(db);
  const history = await db.query(`
    SELECT order_id, machine_id, operator_name, ended_operator_name, ended_at IS NULL AS open, origin
    FROM public.print_runs
    WHERE order_id = 'ORD-OPEN'
    ORDER BY started_at
  `);
  assert.equal(history.rows.length, 1);
  assert.equal(history.rows[0].operator_name, 'Ravi Press');
  assert.equal(history.rows[0].ended_operator_name, 'Mina Floor');
  assert.equal(history.rows[0].open, false);
  assert.equal(history.rows[0].machine_id, 'MAC-1');
  const operatorPerms = await db.query(`SELECT permissions->>'sfg_store' AS sfg, permissions->>'print_run_analytics' AS analytics FROM public.role_permissions WHERE role = 'Printing Operator'`);
  assert.equal(operatorPerms.rows[0].sfg, 'view');
  assert.equal(operatorPerms.rows[0].analytics, 'false');
  await db.close();
});

test('a run with no machine allows only one active run in the plant', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'start', '{"printingStartTime":"2026-11-01T03:00:00.000Z"}'::jsonb)`);
  await assert.rejects(
    db.query(`SELECT public.record_print_run('ORD-NEXT', 'start', '{"machineId":"MAC-9","printingStartTime":"2026-11-01T04:00:00.000Z"}'::jsonb)`),
    /no printing machine/
  );
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'end', '{"printingEndTime":"2026-11-01T05:00:00.000Z","nextProcess":"Slitting Machine"}'::jsonb)`);
  await db.query(`SELECT public.record_print_run('ORD-NEXT', 'start', '{"machineId":"MAC-9","printingStartTime":"2026-11-01T05:10:00.000Z"}'::jsonb)`);
  await assert.rejects(
    db.query(`SELECT public.record_print_run('ORD-OTHER', 'start', '{"printingStartTime":"2026-11-01T05:20:00.000Z"}'::jsonb)`),
    /PRINT_RUN_BUSY/
  );
  const manual = await db.query(`SELECT public.record_print_run('ORD-MANUAL', 'end', '{"printingEndTime":"2026-11-01T06:00:00.000Z"}'::jsonb) AS run`);
  assert.equal(manual.rows[0].run.status, 'Completed');
  assert.equal(manual.rows[0].run.closeMode, 'manual');
  await db.close();
});

test('the unique slot index rejects two active claims if the lookup is skipped', async () => {
  const db = await database();
  await reset(db);
  await db.exec(`ALTER TABLE public.orders DISABLE TRIGGER guard_one_active_print_run`);
  await db.query(`UPDATE public.orders SET print_active_slot = 'MAC-RACE' WHERE id = 'ORD-OPEN'`);
  await assert.rejects(
    db.query(`UPDATE public.orders SET print_active_slot = 'MAC-RACE' WHERE id = 'ORD-NEXT'`),
    /duplicate key|unique/i
  );
  const slots = await db.query(`SELECT id, print_active_slot FROM public.orders WHERE print_active_slot = 'MAC-RACE'`);
  assert.equal(slots.rows.length, 1);
  assert.equal(slots.rows[0].id, 'ORD-OPEN');
  await db.close();
});

test('run and idle data is limited to admin, plant manager, and production manager', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'start', '{"machineId":"MAC-1","printingStartTime":"2026-11-01T02:30:00.000Z"}'::jsonb)`);
  await assert.rejects(
    db.query(`SELECT public.print_machine_run_idle('2026-11-01T00:00:00+05:30', '2026-11-02T00:00:00+05:30', '2026-11-01T10:30:00+05:30')`),
    /limited to Admin, Plant Manager, and Production Manager/
  );
  await asUser(db, SHOP);
  await assert.rejects(
    db.query(`SELECT public.print_machine_run_idle('2026-11-01T00:00:00+05:30', '2026-11-02T00:00:00+05:30', '2026-11-01T10:30:00+05:30')`),
    /limited to Admin, Plant Manager, and Production Manager/
  );
  await asUser(db, SALES);
  await assert.rejects(
    db.query(`SELECT public.print_machine_run_idle('2026-11-01T00:00:00+05:30', '2026-11-02T00:00:00+05:30', '2026-11-01T10:30:00+05:30')`),
    /limited to Admin, Plant Manager, and Production Manager/
  );

  await asUser(db, PLANT);
  const report = await db.query(`SELECT public.print_machine_run_idle('2026-11-01T00:00:00+05:30', '2026-11-02T00:00:00+05:30', '2026-11-01T10:30:00+05:30') AS report`);
  const payload = report.rows[0].report;
  assert.equal(payload.runs.length, 1);
  assert.equal(payload.runs[0].orderId, 'ORD-OPEN');
  assert.equal(payload.runs[0].endedAt, null);
  assert.equal(payload.runs[0].operatorName, 'Ravi Press');
  const built = buildPrintMachineUtilization({
    runs: payload.runs,
    rangeStart: '2026-11-01T00:00:00+05:30',
    rangeEnd: '2026-11-02T00:00:00+05:30',
    asOf: '2026-11-01T10:30:00+05:30',
    shifts: payload.shifts
  });
  assert.equal(built.runCount, 1);
  assert.ok(Math.abs(built.runMinutes - 150) < 0.01);
  assert.equal(built.gapCount, 0);

  await asUser(db, PRODUCTION);
  const production = await db.query(`SELECT public.print_machine_run_idle('2026-11-01T00:00:00+05:30', '2026-11-02T00:00:00+05:30', '2026-11-01T10:30:00+05:30') AS report`);
  assert.equal(production.rows[0].report.runs[0].orderId, 'ORD-OPEN');

  await reset(db);
  await db.query(`UPDATE public.role_permissions SET permissions = permissions || '{"print_run_analytics": false}'::jsonb WHERE role = 'Plant Manager'`);
  await asUser(db, PLANT);
  await assert.rejects(
    db.query(`SELECT public.print_machine_run_idle('2026-11-01T00:00:00+05:30', '2026-11-02T00:00:00+05:30', '2026-11-01T10:30:00+05:30')`),
    /limited to Admin, Plant Manager, and Production Manager/
  );
  await asUser(db, ADMIN);
  const admin = await db.query(`SELECT public.print_machine_run_idle('2026-11-01T00:00:00+05:30', '2026-11-02T00:00:00+05:30', '2026-11-01T10:30:00+05:30') AS report`);
  assert.equal(admin.rows[0].report.runs.length, 1);

  await asUser(db, OPERATOR);
  await assert.rejects(
    db.query(`UPDATE public.system_settings SET setting_value = '[]' WHERE setting_key = 'printing_shift_windows'`),
    /Only an Admin can edit printing shift times/
  );
  await db.query(`INSERT INTO public.system_settings (setting_key, setting_value) VALUES ('note_pad', 'ok')`);
  await asUser(db, ADMIN);
  await db.query(`UPDATE public.system_settings SET setting_value = '[{"id":"day","name":"Day","start":"06:00","end":"14:00"}]' WHERE setting_key = 'printing_shift_windows'`);
  const saved = await db.query(`SELECT setting_value FROM public.system_settings WHERE setting_key = 'printing_shift_windows'`);
  assert.match(saved.rows[0].setting_value, /06:00/);
  await db.close();
});
