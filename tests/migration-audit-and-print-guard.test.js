import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261103041322_audit_reads_and_one_print_run.sql', import.meta.url),
  'utf8'
);

const ADMIN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email_confirmed_at timestamptz
    );
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      auth_user_id uuid,
      full_name text,
      username text,
      email text,
      role text,
      assigned_roles text[] DEFAULT '{}',
      status text,
      active boolean
    );
    CREATE TABLE public.audit_logs (
      id text PRIMARY KEY,
      username text,
      user_role text,
      action_type text,
      module text,
      details text,
      target_id text,
      created_at timestamptz
    );
    ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON public.audit_logs TO authenticated;
    CREATE POLICY audit_logs_select ON public.audit_logs
      FOR SELECT TO authenticated
      USING (false);
    CREATE POLICY audit_logs_insert ON public.audit_logs
      FOR INSERT TO authenticated
      WITH CHECK (true);
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      client_name text NOT NULL,
      status text,
      printing_status text,
      printing_start_time timestamptz,
      printing_end_time timestamptz,
      machine_id text,
      job_details jsonb
    );
    CREATE TABLE public.clients (
      id text PRIMARY KEY,
      name text
    );
    GRANT SELECT, UPDATE ON public.orders TO authenticated;
    GRANT SELECT, INSERT ON public.clients TO authenticated;
    GRANT INSERT ON public.audit_logs TO authenticated;
    INSERT INTO auth.users (id, email_confirmed_at) VALUES ('${ADMIN}', '2026-10-01 00:00:00+00');
    INSERT INTO public.users (id, auth_user_id, full_name, username, email, role, assigned_roles, status, active)
    VALUES ('${ADMIN}', '${OTHER}', 'Plant Admin', 'forged-name', 'admin@example.test', 'Admin', ARRAY['Admin'], 'Active', true);
    INSERT INTO public.orders (id, job_name, client_name, status, printing_status, printing_start_time, machine_id, job_details)
    VALUES
      ('ORD-OPEN-1', 'Peas Pouch', 'Sharma', 'In Production', 'Pending', NULL, NULL,
        '{"printingStatus":"In Production","machineId":"MAC-PRINT-30","printingStartTime":"2026-11-01T02:00:00.000Z"}'::jsonb),
      ('ORD-OPEN-2', 'Rice Pouch', 'Sharma', 'In Production', 'In Production', '2026-11-01T03:00:00+00', 'MAC-PRINT-30', '{}'::jsonb),
      ('ORD-NEXT', 'Oil Pouch', 'Sharma', 'Scheduled', 'Pending', NULL, NULL, '{}'::jsonb);
  `);
  await db.exec(migrationSql);
  await db.exec(migrationSql);
  return db;
}

test('an admin matched by users.id can record and read audit rows', async () => {
  const db = await database();
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${ADMIN}', false)`);
  await db.exec('SET ROLE authenticated');
  const saved = await db.query(
    `SELECT public.record_audit_log($1, $2, $3, $4) AS row`,
    ['UPDATE', 'Orders', 'Changed the deadline', 'ORD-NEXT']
  );
  assert.equal(saved.rows[0].row.username, 'Plant Admin');
  assert.notEqual(saved.rows[0].row.username, 'forged-name');
  const visible = await db.query(`SELECT count(*)::int AS n FROM public.audit_logs`);
  assert.equal(visible.rows[0].n > 0, true);
  await assert.rejects(
    db.query(`INSERT INTO public.audit_logs (id, username, action_type, module, details) VALUES ('forged', 'Admin', 'UPDATE', 'Orders', 'no')`),
    /row-level security|permission denied/i
  );
  await db.close();
});

test('existing open runs stay open and a new run on that machine is refused', async () => {
  const db = await database();
  const slots = await db.query(`SELECT id, print_active_slot FROM public.orders WHERE id IN ('ORD-OPEN-1', 'ORD-OPEN-2') ORDER BY id`);
  assert.deepEqual(slots.rows.map((row) => row.print_active_slot), [null, null]);

  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${ADMIN}', false)`);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(
    db.query(`UPDATE public.orders SET printing_status = 'In Production', printing_start_time = now(), printing_end_time = NULL, machine_id = 'MAC-PRINT-30' WHERE id = 'ORD-NEXT'`),
    /End the current run first/
  );

  await db.query(`UPDATE public.orders SET status = 'In Production' WHERE id = 'ORD-OPEN-2'`);
  const stillOpen = await db.query(`SELECT print_active_slot FROM public.orders WHERE id = 'ORD-OPEN-2'`);
  assert.equal(stillOpen.rows[0].print_active_slot, null);

  const created = await db.query(
    `INSERT INTO public.clients (id, name) VALUES ('CLI-1', 'Sharma Traders') RETURNING id`
  );
  assert.equal(created.rows[0].id, 'CLI-1');
  const audit = await db.query(
    `SELECT action_type, module, target_id FROM public.audit_logs WHERE target_id = 'CLI-1'`
  );
  assert.equal(audit.rows[0].action_type, 'CREATE');
  assert.equal(audit.rows[0].module, 'Clients');
  await db.close();
});
