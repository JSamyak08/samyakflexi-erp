import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261031160000_record_own_audit_log.sql', import.meta.url),
  'utf8'
);

const PRESS = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';

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
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
    CREATE POLICY audit_logs_insert ON public.audit_logs
      FOR INSERT TO authenticated
      WITH CHECK (true);
    CREATE POLICY audit_logs_select ON public.audit_logs
      FOR SELECT TO authenticated
      USING (false);
    CREATE POLICY audit_logs_update ON public.audit_logs
      FOR UPDATE TO authenticated
      USING (false)
      WITH CHECK (false);
    INSERT INTO auth.users (id, email_confirmed_at) VALUES
      ('${PRESS}', '2026-10-01 00:00:00+00'),
      ('${STRANGER}', NULL);
    INSERT INTO public.users (id, auth_user_id, full_name, username, email, role, status, active) VALUES
      ('user-press', '${PRESS}', 'Flexi Print', 'forged-name', 'flexi.print@example.test', 'Printing Operator', 'Active', true);
  `);
  await db.exec(migrationSql);
  await db.exec(migrationSql);
  return db;
}

test('a confirmed user records their own audit row and cannot forge the actor', async () => {
  const db = await database();
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${PRESS}', false)`);
  await db.exec('SET ROLE authenticated');
  const saved = await db.query(
    `SELECT public.record_audit_log($1, $2, $3, $4) AS row`,
    ['UPDATE', 'Orders', 'Changed the deadline', 'ORD-1']
  );
  const row = saved.rows[0].row;
  assert.equal(row.username, 'Flexi Print');
  assert.equal(row.user_role, 'Printing Operator');
  assert.equal(row.actor_id, PRESS);
  assert.equal(row.module, 'Orders');
  assert.equal(row.target_id, 'ORD-1');
  assert.notEqual(row.username, 'forged-name');

  await assert.rejects(
    db.query(`INSERT INTO public.audit_logs (id, username, user_role, action_type, module, details) VALUES ('forged', 'Admin', 'Admin', 'UPDATE', 'Orders', 'no')`),
    /row-level security|permission denied/i
  );
  await db.close();
});

test('an unconfirmed account cannot record an audit row', async () => {
  const db = await database();
  await db.exec(`
    INSERT INTO public.users (id, auth_user_id, full_name, email, role, status, active)
    VALUES ('user-new', '${STRANGER}', 'New Hire', 'new@example.test', 'Store Manager', 'Active', true)
  `);
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${STRANGER}', false)`);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(
    db.query(`SELECT public.record_audit_log('UPDATE', 'Orders', 'no', NULL)`),
    /Verify your email/
  );
  await db.close();
});

test('anon cannot execute the audit function and reads stay closed', async () => {
  const db = await database();
  const anonExec = await db.query(`
    SELECT has_function_privilege('anon', 'public.record_audit_log(text, text, text, text)', 'execute') AS anon_exec,
           has_function_privilege('authenticated', 'public.record_audit_log(text, text, text, text)', 'execute') AS auth_exec
  `);
  assert.equal(anonExec.rows[0].anon_exec, false);
  assert.equal(anonExec.rows[0].auth_exec, true);
  const policies = await db.query(`
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.audit_logs'::regclass
    ORDER BY polname
  `);
  const names = policies.rows.map((row) => row.polname);
  assert.equal(names.includes('audit_logs_insert'), false);
  assert.equal(names.includes('audit_logs_select'), true);
  await db.close();
});
