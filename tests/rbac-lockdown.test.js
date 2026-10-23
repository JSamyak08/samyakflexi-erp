import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

await register(new URL('../scripts/resolve-js-hook.mjs', import.meta.url));

const {
  SYSTEM_ROLES,
  ALL_MODULES,
  generateFullRolePermissions,
  grantAllRolePermissions,
  applyAuditLogBoundary,
} = await import('../src/factoryStore.js');
const { roleHasModule, roleNeedsAny, cachesToDrop, BOOT_NEEDS, canReadPayroll } = await import('../src/bootAccess.js');

const QC = {
  'QC Chemist': {
    dashboard: true,
    production_records: true,
    sfg_store: true,
    inventory: true,
    ink_management: true,
    pellet_fuel: true,
    dispatch: true,
    vendors: false,
    clients: false,
    orders: false,
    audit_logs: false,
    employees: false,
  },
};

test('matrix keys are real and dispatch is not forced on for every role', () => {
  const keys = ALL_MODULES.map((mod) => mod.key);
  assert.ok(keys.includes('dispatch'));
  assert.ok(keys.includes('sfg_store'));
  assert.ok(keys.includes('audit_logs'));

  const defaults = generateFullRolePermissions(false);
  assert.equal(defaults['Printing Operator'].dispatch, false);
  assert.equal(defaults['Printing Operator'].sfg_store, false);
  assert.equal(defaults['Printing Operator'].audit_logs, false);
  assert.equal(defaults['QC Chemist'].dispatch, true);
  assert.equal(defaults.Admin.audit_logs, true);
  assert.equal(defaults['Production Manager'].audit_logs, false);
  assert.equal(defaults['Sales Manager'].pellet_fuel, false);
  assert.equal(defaults['Printing Operator'].pellet_fuel, false);
});

test('Allow all sets every module key and Reset uses the code defaults', () => {
  const granted = grantAllRolePermissions();
  SYSTEM_ROLES.forEach((role) => {
    ALL_MODULES.forEach((mod) => {
      assert.equal(granted[role][mod.key], true, `${role} ${mod.key}`);
    });
  });
  const bounded = applyAuditLogBoundary(granted);
  assert.equal(bounded['Printing Operator'].dispatch, true);
  assert.equal(bounded['Printing Operator'].audit_logs, false);
  assert.equal(bounded.Admin.audit_logs, true);

  const reset = generateFullRolePermissions(false);
  assert.equal(reset['Shop Floor Operator'].dispatch, false);
  assert.notDeepEqual(reset, granted);
});

test('QC boot keeps inventory data in memory and drops vendor and audit caches', () => {
  assert.equal(roleHasModule(QC, 'QC Chemist', 'vendors'), false);
  assert.equal(roleHasModule(QC, 'QC Chemist', 'audit_logs'), false);
  assert.equal(roleHasModule(QC, 'QC Chemist', 'inventory'), true);
  assert.equal(roleNeedsAny(QC, 'QC Chemist', BOOT_NEEDS.vendors), true);
  assert.equal(roleNeedsAny(QC, 'QC Chemist', BOOT_NEEDS.orders), true);
  assert.equal(roleNeedsAny(QC, 'QC Chemist', BOOT_NEEDS.grns), true);
  assert.equal(canReadPayroll('QC Chemist'), false);
  assert.equal(canReadPayroll('Admin'), true);
  const dropped = cachesToDrop(QC, 'QC Chemist');
  assert.ok(dropped.includes('samyak_cache_vendors'));
  assert.ok(dropped.includes('samyak_cache_audit_logs'));
  assert.ok(dropped.includes('samyak_cache_employees'));
  assert.equal(dropped.includes('samyak_cache_inventory'), false);
  assert.equal(dropped.includes('samyak_cache_grns'), false);
});

test('lockdown SQL closes anon access without giving dispatch the client list', () => {
  const sql = fs.readFileSync(
    new URL('../supabase/migrations/20261024023000_auth_rls_lockdown.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon/);
  assert.match(sql, /REVOKE TRUNCATE, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated/);
  assert.match(sql, /public\.pellet_grn_counters/);
  assert.match(sql, /CREATE POLICY audit_logs_update/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.email_send_log FROM anon, authenticated, PUBLIC/);
  assert.match(sql, /public\.save_grn_with_lines\(jsonb\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\._grn_to_numeric\(text\) TO authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.handle_updated_at\(\) TO authenticated/);
  assert.match(
    sql,
    /public\.orders'::regclass, ARRAY\['orders','job_punching','sales','production_records','printing_scheduler'\]/,
  );
  assert.match(
    sql,
    /public\.clients'::regclass, ARRAY\['clients','sales','orders','job_punching'\]/,
  );
  assert.doesNotMatch(sql, /public\.orders'::regclass, ARRAY\[[^\]]*dispatch/);
  assert.doesNotMatch(sql, /public\.clients'::regclass, ARRAY\[[^\]]*dispatch/);
  const storage = fs.readFileSync(
    new URL('../supabase/migrations/20261024024000_private_storage_buckets.sql', import.meta.url),
    'utf8',
  );
  assert.match(storage, /public = false/);
  assert.match(storage, /erp_files_delete/);
  assert.match(storage, /private\.app_role\(\) IS NOT NULL/);
  const secrets = fs.readFileSync(
    new URL('../supabase/migrations/20261024022000_remove_secret_copies.sql', import.meta.url),
    'utf8',
  );
  assert.match(secrets, /DROP COLUMN IF EXISTS password_hash/);
  assert.match(secrets, /DROP COLUMN IF EXISTS smtp_pass/);
  assert.match(secrets, /'email_settings'/);
  assert.match(secrets, /'role_permissions'/);
});

test('identity guard rejects auth link, email, and username changes from a non-admin', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      username text,
      full_name text,
      email text,
      role text,
      department text,
      active boolean,
      status text,
      auth_user_id uuid
    );
    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb,
      updated_at timestamptz
    );
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text,
      updated_at timestamptz
    );
    CREATE TABLE public.email_settings (
      id text PRIMARY KEY,
      plant_manager_email text
    );
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON public.users, public.role_permissions, public.system_settings, public.email_settings
      TO anon, authenticated, service_role;
  `);
  const older = fs.readFileSync(
    new URL('../supabase/migrations/20261022060000_guard_privilege_columns.sql', import.meta.url),
    'utf8',
  );
  const newer = fs.readFileSync(
    new URL('../supabase/migrations/20261024020000_guard_identity_columns.sql', import.meta.url),
    'utf8',
  );
  await db.exec(older);
  await db.exec(newer);
  const adminAuth = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const staffAuth = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  await db.query(
    `INSERT INTO public.users (id, username, full_name, email, role, active, status, auth_user_id)
     VALUES
       ('admin-1', 'admin', 'Admin', 'admin@samyakinternational.in', 'Admin', true, 'Active', $1::uuid),
       ('staff-1', 'staff', 'Staff', 'staff@samyakinternational.in', 'QC Chemist', true, 'Active', $2::uuid)`,
    [adminAuth, staffAuth],
  );
  await db.exec('SET ROLE authenticated');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [staffAuth]);
  await db.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);

  for (const sql of [
    `UPDATE public.users SET auth_user_id = NULL WHERE id = 'admin-1'`,
    `UPDATE public.users SET email = 'taken@samyakinternational.in' WHERE id = 'admin-1'`,
    `UPDATE public.users SET username = 'taken' WHERE id = 'staff-1'`,
  ]) {
    await assert.rejects(() => db.query(sql), /Only an Admin/);
    await db.exec('ROLLBACK').catch(() => {});
    await db.exec('SET ROLE authenticated');
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [staffAuth]);
    await db.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  }

  await db.query(`UPDATE public.users SET full_name = 'Staff Renamed' WHERE id = 'staff-1'`);
  const renamed = await db.query(`SELECT full_name, auth_user_id FROM public.users WHERE id = 'staff-1'`);
  assert.equal(renamed.rows[0].full_name, 'Staff Renamed');
  assert.equal(renamed.rows[0].auth_user_id, staffAuth);

  await db.exec('RESET ROLE');
  await db.close();
});
