import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationUrl = new URL('../supabase/migrations/20261030210000_user_assigned_roles.sql', import.meta.url);
const migrationSql = fs.readFileSync(migrationUrl, 'utf8');

const EXISTING = [
  ['USR-QA-ADMIN', 'Admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
  ['USR-QA-PLANT-MANAGER', 'Plant Manager', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'],
  ['USR-QA-PRODUCTION-MANAGER', 'Production Manager', 'cccccccc-cccc-cccc-cccc-cccccccccccc'],
  ['USR-QA-QC-CHEMIST', 'QC Chemist', 'dddddddd-dddd-dddd-dddd-dddddddddddd'],
  ['USR-QA-STORE-MANAGER', 'Store Manager', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'],
  ['USR-QA-PURCHASE-MANAGER', 'Purchase Manager', 'ffffffff-ffff-ffff-ffff-ffffffffffff'],
  ['USR-QA-SALES-MANAGER', 'Sales Manager', '11111111-1111-1111-1111-111111111111'],
  ['USR-QA-SHOP-FLOOR-OPERATOR', 'Shop Floor Operator', '22222222-2222-2222-2222-222222222222'],
];

test('the assigned-roles migration only backfills the array', () => {
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS assigned_roles text\[\]/);
  assert.match(migrationSql, /ARRAY\[u\.role\]/);
  assert.match(migrationSql, /private\.app_roles\(\)/);
  assert.match(migrationSql, /private\.can_any\(modules text\[\]\)/);
  assert.match(migrationSql, /private\.has_role\(allowed text\[\]\)/);
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.users[\s\S]{0,400}\bSET\s+role\b/i);
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.doesNotMatch(migrationSql, /localStorage/);
});

async function database() {
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
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE OR REPLACE FUNCTION private.caller_is_verified_admin()
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE OR REPLACE FUNCTION private.privilege_write_allowed()
    RETURNS boolean
    LANGUAGE plpgsql STABLE AS $$
    BEGIN
      IF current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
        RETURN true;
      END IF;
      RETURN private.caller_is_verified_admin();
    END;
    $$;
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      username text,
      full_name text,
      email text,
      role text NOT NULL,
      department text,
      active boolean DEFAULT true,
      status text DEFAULT 'Active',
      auth_user_id uuid
    );
    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb
    );
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON public.users, public.role_permissions TO anon, authenticated, service_role;
    INSERT INTO public.role_permissions (role, permissions) VALUES
      ('Store Manager', '{"purchase_orders": true, "sales": false, "clients": false, "production_records": false}'::jsonb),
      ('Sales Manager', '{"purchase_orders": false, "sales": true, "clients": true, "production_records": false}'::jsonb),
      ('QC Chemist', '{"purchase_orders": false, "sales": false, "clients": false, "production_records": true}'::jsonb);
  `);
  for (const [id, role, authId] of EXISTING) {
    await db.query(
      `INSERT INTO public.users (id, username, full_name, email, role, active, status, auth_user_id)
       VALUES ($1, $2, $2, $3, $4, true, 'Active', $5::uuid)`,
      [id, id.toLowerCase(), `${id.toLowerCase()}@example.test`, role, authId],
    );
  }
  return db;
}

async function asAuthenticated(db, authId) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [authId]);
  await db.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  await db.exec('SET ROLE authenticated');
}

test('backfill copies each existing role and does not change it', async () => {
  const db = await database();
  const before = await db.query(`SELECT id, role, active, status FROM public.users ORDER BY id`);
  await db.exec(migrationSql);
  await db.exec(migrationSql);
  const after = await db.query(
    `SELECT id, role, active, status, assigned_roles FROM public.users ORDER BY id`,
  );
  assert.equal(after.rows.length, EXISTING.length);
  after.rows.forEach((row, index) => {
    assert.equal(row.id, before.rows[index].id);
    assert.equal(row.role, before.rows[index].role);
    assert.equal(row.active, before.rows[index].active);
    assert.equal(row.status, before.rows[index].status);
    assert.deepEqual(row.assigned_roles, [row.role]);
  });
  await db.close();
});

test('can_any and has_role use the union, and a non-admin cannot add roles', async () => {
  const db = await database();
  await db.exec(migrationSql);

  await db.query(
    `UPDATE public.users
     SET assigned_roles = ARRAY['Store Manager', 'Sales Manager']::text[]
     WHERE id = 'USR-QA-STORE-MANAGER'`,
  );
  const stored = await db.query(
    `SELECT role, assigned_roles FROM public.users WHERE id = 'USR-QA-STORE-MANAGER'`,
  );
  assert.equal(stored.rows[0].role, 'Store Manager');
  assert.deepEqual(stored.rows[0].assigned_roles, ['Store Manager', 'Sales Manager']);

  await asAuthenticated(db, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  const union = await db.query(`
    SELECT
      private.can_any(ARRAY['sales']) AS sales,
      private.can_any(ARRAY['clients']) AS clients,
      private.can_any(ARRAY['purchase_orders']) AS purchase_orders,
      private.can_any(ARRAY['production_records']) AS production_records,
      private.has_role(ARRAY['Sales Manager']) AS sales_role,
      private.has_role(ARRAY['Admin']) AS admin_role
  `);
  assert.equal(union.rows[0].sales, true);
  assert.equal(union.rows[0].clients, true);
  assert.equal(union.rows[0].purchase_orders, true);
  assert.equal(union.rows[0].production_records, false);
  assert.equal(union.rows[0].sales_role, true);
  assert.equal(union.rows[0].admin_role, false);

  try {
    await db.query(
      `UPDATE public.users SET assigned_roles = ARRAY['Admin']::text[] WHERE id = 'USR-QA-STORE-MANAGER'`,
    );
    assert.fail('a non-admin update of assigned roles should be rejected');
  } catch (error) {
    await db.exec('ROLLBACK').catch(() => {});
    assert.match(String(error.message || error), /Only an Admin/);
  }

  await asAuthenticated(db, 'dddddddd-dddd-dddd-dddd-dddddddddddd');
  const qc = await db.query(`
    SELECT
      private.can_any(ARRAY['production_records']) AS production_records,
      private.can_any(ARRAY['sales']) AS sales,
      private.has_role(ARRAY['Admin']) AS admin_role
  `);
  assert.equal(qc.rows[0].production_records, true);
  assert.equal(qc.rows[0].sales, false);
  assert.equal(qc.rows[0].admin_role, false);

  await asAuthenticated(db, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  const admin = await db.query(`SELECT private.can_any(ARRAY['production_records']) AS production_records`);
  assert.equal(admin.rows[0].production_records, true);
  const unchanged = await db.query(
    `SELECT role FROM public.users WHERE id = 'USR-QA-STORE-MANAGER'`,
  );
  assert.equal(unchanged.rows[0].role, 'Store Manager');
  await db.close();
});
