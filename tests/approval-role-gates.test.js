import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SYSTEM_ROLES } from '../src/roles.js';
import {
  canApproveMaterialIndent,
  canDecideGrnQc,
  canRecordPelletFuel,
  GRN_QC_DECISION_ROLES,
  MATERIAL_INDENT_APPROVER_ROLES,
  PELLET_RECORD_ROLES,
} from '../src/approvalAccess.js';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261103120000_approval_role_gates.sql', import.meta.url),
  'utf8'
);
const indentUi = fs.readFileSync(new URL('../src/components/ConsumablesAndIndents.jsx', import.meta.url), 'utf8');
const inventoryUi = fs.readFileSync(new URL('../src/components/InventoryManagement.jsx', import.meta.url), 'utf8');
const pelletUi = fs.readFileSync(new URL('../src/components/PelletFuelManagement.jsx', import.meta.url), 'utf8');
const boot = fs.readFileSync(new URL('../src/bootAccess.js', import.meta.url), 'utf8');

const INDENT_RAISERS = new Set([
  'Admin',
  'Plant Manager',
  'HR & Payroll Manager',
  'Production Manager',
  'Store Manager',
  'Purchase Manager',
]);

const PERMISSIONS = {
  Admin: { material_indents: true, inventory: true, purchase_orders: true, pellet_fuel: true, printing_scheduler: true },
  'Plant Manager': { material_indents: true, inventory: true, purchase_orders: true, pellet_fuel: true, printing_scheduler: true },
  'HR & Payroll Manager': { material_indents: true, inventory: true, purchase_orders: false, pellet_fuel: true, printing_scheduler: false },
  'Production Manager': { material_indents: true, inventory: true, purchase_orders: true, pellet_fuel: true, printing_scheduler: true },
  'Store Manager': { material_indents: true, inventory: true, purchase_orders: true, pellet_fuel: true, printing_scheduler: false },
  'QC Chemist': { material_indents: false, inventory: true, purchase_orders: false, pellet_fuel: true, printing_scheduler: false },
  'Purchase Manager': { material_indents: true, inventory: true, purchase_orders: true, pellet_fuel: true, printing_scheduler: false },
  'Sales Manager': { material_indents: false, inventory: false, purchase_orders: false, pellet_fuel: true, printing_scheduler: false },
  'Printing Operator': { material_indents: false, inventory: true, purchase_orders: false, pellet_fuel: false, printing_scheduler: true },
  'Shop Floor Operator': { material_indents: false, inventory: true, purchase_orders: false, pellet_fuel: false, printing_scheduler: true },
};

function authId(index) {
  return `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

const ROLE_IDS = Object.fromEntries(SYSTEM_ROLES.map((role, index) => [role, authId(index)]));

function slug(role) {
  return role.toLowerCase().replace(/[^a-z]+/g, '-');
}

async function database() {
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

    CREATE SCHEMA IF NOT EXISTS private;

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
    CREATE TABLE public.material_indents (
      id text PRIMARY KEY,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.grns (
      id text PRIMARY KEY,
      grn_number text,
      status text,
      item_name text,
      qc_remarks text
    );
    CREATE TABLE public.pellet_inwards (
      id text PRIMARY KEY,
      grn_no text,
      inward_qty_kg numeric,
      payload jsonb
    );
    CREATE TABLE public.pellet_consumptions (
      id text PRIMARY KEY,
      consumed_qty_kg numeric,
      payload jsonb
    );
    CREATE TABLE public.pellet_grn_counters (
      prefix text PRIMARY KEY,
      last_value bigint NOT NULL DEFAULT 0
    );
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text
    );
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_name text
    );
    CREATE TABLE public.production_schedules (
      id text PRIMARY KEY,
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

    ALTER TABLE public.material_indents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.grns ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.pellet_inwards ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.pellet_consumptions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.pellet_grn_counters ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.production_schedules ENABLE ROW LEVEL SECURITY;

    CREATE POLICY material_indents_access ON public.material_indents
      FOR ALL TO authenticated
      USING (private.can_any(ARRAY['material_indents', 'inventory']))
      WITH CHECK (private.can_any(ARRAY['material_indents', 'inventory']));
    CREATE POLICY grns_access ON public.grns
      FOR ALL TO authenticated
      USING (private.can_any(ARRAY['inventory', 'purchase_orders']))
      WITH CHECK (private.can_any(ARRAY['inventory', 'purchase_orders']));
    CREATE POLICY pellet_inwards_access ON public.pellet_inwards
      FOR ALL TO authenticated
      USING (private.can_any(ARRAY['pellet_fuel', 'inventory']))
      WITH CHECK (private.can_any(ARRAY['pellet_fuel', 'inventory']));
    CREATE POLICY pellet_consumptions_access ON public.pellet_consumptions
      FOR ALL TO authenticated
      USING (private.can_any(ARRAY['pellet_fuel', 'inventory']))
      WITH CHECK (private.can_any(ARRAY['pellet_fuel', 'inventory']));
    CREATE POLICY pellet_grn_counters_access ON public.pellet_grn_counters
      FOR ALL TO authenticated
      USING (private.can_any(ARRAY['pellet_fuel', 'inventory']))
      WITH CHECK (private.can_any(ARRAY['pellet_fuel', 'inventory']));
    CREATE POLICY inventory_access ON public.inventory
      FOR ALL TO authenticated
      USING (private.can_any(ARRAY['inventory', 'printing_scheduler']))
      WITH CHECK (private.can_any(ARRAY['inventory', 'printing_scheduler']));
    CREATE POLICY production_schedules_access ON public.production_schedules
      FOR ALL TO authenticated
      USING (private.can_any(ARRAY['printing_scheduler', 'production_records']))
      WITH CHECK (private.can_any(ARRAY['printing_scheduler', 'production_records']));

    CREATE OR REPLACE FUNCTION private.block_qc_approved_grn_header()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
    AS $lock$
    BEGIN
      IF lower(coalesce(OLD.status, '')) LIKE '%approved%' THEN
        RAISE EXCEPTION 'GRN % is QC-approved and cannot be edited or deleted', OLD.id
          USING ERRCODE = 'check_violation';
      END IF;
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END;
    $lock$;
    CREATE TRIGGER grns_lock_after_qc_approval
      BEFORE UPDATE OR DELETE ON public.grns
      FOR EACH ROW
      EXECUTE FUNCTION private.block_qc_approved_grn_header();

    GRANT USAGE ON SCHEMA public, private TO anon, authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION private.app_roles() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.has_role(text[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.can_any(text[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.block_qc_approved_grn_header() TO authenticated;
  `);

  const stamp = '2026-01-01T00:00:00Z';
  for (const role of SYSTEM_ROLES) {
    await db.query(
      `INSERT INTO public.role_permissions (role, permissions, updated_at) VALUES ($1, $2::jsonb, $3::timestamptz)`,
      [role, JSON.stringify(PERMISSIONS[role]), stamp]
    );
    await db.query(
      `INSERT INTO public.users (id, role, assigned_roles, auth_user_id) VALUES ($1, $2, ARRAY[$2]::text[], $3::uuid)`,
      [slug(role), role, ROLE_IDS[role]]
    );
  }
  await db.query(
    `INSERT INTO public.users (id, role, assigned_roles, auth_user_id)
     VALUES ('union', 'Printing Operator', ARRAY['Printing Operator', 'Store Manager']::text[], $1::uuid)`,
    ['10000000-0000-4000-8000-000000000099']
  );
  return db;
}

async function asUser(db, authIdValue) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [authIdValue]);
  await db.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  await db.exec('SET ROLE authenticated');
}

async function denied(run, pattern) {
  await assert.rejects(run, pattern);
}

test('the migration is newer than production and does not rewrite permission rows', () => {
  const file = '20261103120000_approval_role_gates.sql';
  assert.ok(file.slice(0, 14) > '20261103041322');
  assert.match(migrationSql, /Only an Admin can approve or reject a material indent/);
  assert.match(migrationSql, /approve, reject, or hold a GRN/);
  assert.match(migrationSql, /can record pellet fuel/);
  assert.match(migrationSql, /private\.block_qc_approved_grn_header is not/);
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.role_permissions/);
  assert.match(migrationSql, /WITH CHECK \(private\.can_record_pellet_fuel\(\)\)/);
  assert.match(indentUi, /Pending Admin approval/);
  assert.doesNotMatch(indentUi, /Pending Plant\/Store Manager approval/);
  assert.match(indentUi, /canApproveMaterialIndent/);
  assert.match(inventoryUi, /canDecideGrnQc/);
  assert.match(pelletUi, /canRecordPelletFuel/);
  assert.match(boot, /pellets: \['pellet_fuel'\]/);
});

test('each plant role is allowed or denied on the three approval checks', () => {
  assert.deepEqual([...SYSTEM_ROLES].sort(), [...Object.keys(PERMISSIONS)].sort());
  for (const role of SYSTEM_ROLES) {
    assert.equal(
      canApproveMaterialIndent(role),
      MATERIAL_INDENT_APPROVER_ROLES.includes(role),
      `${role} indent approval`
    );
    assert.equal(
      canDecideGrnQc(role),
      GRN_QC_DECISION_ROLES.includes(role),
      `${role} GRN QC`
    );
    assert.equal(
      canRecordPelletFuel(role),
      PELLET_RECORD_ROLES.includes(role),
      `${role} pellet record`
    );
    assert.equal(PERMISSIONS[role].pellet_fuel, !['Printing Operator', 'Shop Floor Operator'].includes(role) || false);
  }
  assert.equal(canApproveMaterialIndent({ role: 'Store Manager', assigned_roles: ['Admin'] }), true);
  assert.equal(canDecideGrnQc({ role: 'Store Manager', assigned_roles: ['QC Chemist'] }), true);
  assert.equal(canRecordPelletFuel({ role: 'QC Chemist', assigned_roles: ['Store Manager'] }), true);
  assert.equal(canRecordPelletFuel('Purchase Manager'), false);
  assert.equal(canRecordPelletFuel('Sales Manager'), false);
  assert.equal(canRecordPelletFuel('QC Chemist'), false);
  assert.equal(canRecordPelletFuel('Printing Operator'), false);
  assert.equal(canRecordPelletFuel('Shop Floor Operator'), false);
  assert.equal(PERMISSIONS['Printing Operator'].pellet_fuel, false);
  assert.equal(PERMISSIONS['Shop Floor Operator'].pellet_fuel, false);
  assert.equal(PERMISSIONS['Sales Manager'].pellet_fuel, true);
  assert.equal(PERMISSIONS['Purchase Manager'].pellet_fuel, true);
  assert.equal(PERMISSIONS['QC Chemist'].pellet_fuel, true);
});

test('the database enforces each role for indents, GRN QC, and pellet fuel', async () => {
  const db = await database();
  try {
    await db.exec(migrationSql);
    await db.exec(migrationSql);

    const before = await db.query(`SELECT role, permissions, updated_at FROM public.role_permissions ORDER BY role`);
    await asUser(db, ROLE_IDS.Admin);
    await db.exec('RESET ROLE');
    const after = await db.query(`SELECT role, permissions, updated_at FROM public.role_permissions ORDER BY role`);
    assert.deepEqual(after.rows, before.rows);
    assert.equal(after.rows.find((row) => row.role === 'Sales Manager').permissions.pellet_fuel, true);
    assert.equal(after.rows.find((row) => row.role === 'Printing Operator').permissions.pellet_fuel, false);
    assert.equal(after.rows.find((row) => row.role === 'Shop Floor Operator').permissions.pellet_fuel, false);
    assert.equal(new Date(after.rows[0].updated_at).toISOString(), '2026-01-01T00:00:00.000Z');

    for (const role of SYSTEM_ROLES) {
      await asUser(db, ROLE_IDS[role]);
      const indentId = `IND-${slug(role)}`;
      if (INDENT_RAISERS.has(role)) {
        await db.query(
          `INSERT INTO public.material_indents (id, payload) VALUES ($1, '{"status":"Pending Approval","item":"Solvent"}'::jsonb)`,
          [indentId]
        );
      } else {
        await denied(
          () => db.query(
            `INSERT INTO public.material_indents (id, payload) VALUES ($1, '{"status":"Pending Approval"}'::jsonb)`,
            [indentId]
          ),
          /row-level security|material indent/i
        );
      }
    }

    await asUser(db, ROLE_IDS['Store Manager']);
    await db.query(`UPDATE public.material_indents SET payload = payload || '{"remarks":"needed"}'::jsonb WHERE id = 'IND-store-manager'`);
    await db.query(`UPDATE public.material_indents SET payload = jsonb_set(payload, '{status}', '"Issued to Machine"') WHERE id = 'IND-store-manager'`);
    await denied(
      () => db.query(`UPDATE public.material_indents SET payload = jsonb_set(payload, '{status}', '"Approved"') WHERE id = 'IND-plant-manager'`),
      /Only an Admin can approve or reject/
    );
    await denied(
      () => db.query(`UPDATE public.material_indents SET payload = payload || '{"approvedBy":"Store"}'::jsonb WHERE id = 'IND-store-manager'`),
      /Only an Admin can approve or reject/
    );
    const issued = await db.query(`SELECT payload->>'status' AS status FROM public.material_indents WHERE id = 'IND-store-manager'`);
    assert.equal(issued.rows[0].status, 'Issued to Machine');

    for (const role of SYSTEM_ROLES) {
      if (role === 'Admin') continue;
      await asUser(db, ROLE_IDS[role]);
      if (INDENT_RAISERS.has(role)) {
        await denied(
          () => db.query(`UPDATE public.material_indents SET payload = jsonb_set(payload, '{status}', '"Rejected"') WHERE id = 'IND-purchase-manager'`),
          /Only an Admin can approve or reject/
        );
      }
    }
    await asUser(db, ROLE_IDS['Printing Operator']);
    await db.query(`UPDATE public.material_indents SET payload = jsonb_set(payload, '{status}', '"Approved"') WHERE id = 'IND-store-manager'`);
    await db.exec('RESET ROLE');
    const untouched = await db.query(`SELECT payload->>'status' AS status FROM public.material_indents WHERE id = 'IND-store-manager'`);
    assert.equal(untouched.rows[0].status, 'Issued to Machine');

    await asUser(db, ROLE_IDS.Admin);
    await db.query(`UPDATE public.material_indents SET payload = jsonb_set(payload, '{status}', '"Approved"') WHERE id = 'IND-store-manager'`);
    await db.query(`UPDATE public.material_indents SET payload = payload || '{"approvedBy":"Admin"}'::jsonb WHERE id = 'IND-store-manager'`);
    const approvedIndent = await db.query(`SELECT payload->>'status' AS status, payload->>'approvedBy' AS by FROM public.material_indents WHERE id = 'IND-store-manager'`);
    assert.equal(approvedIndent.rows[0].status, 'Approved');
    assert.equal(approvedIndent.rows[0].by, 'Admin');

    await asUser(db, ROLE_IDS['Printing Operator']);
    const operatorCanReadIndent = await db.query(`SELECT count(*)::int AS n FROM public.material_indents`);
    assert.ok(operatorCanReadIndent.rows[0].n > 0);

    const draft = (id, status, itemName) => db.query(
      `INSERT INTO public.grns (id, grn_number, status, item_name) VALUES ($1, $1, $2, $3)`,
      [id, status, itemName]
    );
    await asUser(db, ROLE_IDS['Store Manager']);
    await draft('GRN-DRAFT', 'Pending QC Approval', 'PET ||| {"category":"Film Substrates","status":"Pending QC Approval","qcStatus":"Pending QC Approval"}');
    await db.query(`UPDATE public.grns SET qc_remarks = 'weighed' WHERE id = 'GRN-DRAFT'`);
    await draft('GRN-CYL', 'Approved', 'Cylinder ||| {"category":"Rotogravure Cylinders","status":"Approved","qcStatus":"Approved"}');
    await denied(
      () => draft('GRN-SKIP', 'Approved', 'PET ||| {"category":"Film Substrates","status":"Approved","qcStatus":"Approved"}'),
      /approve, reject, or hold a GRN/
    );
    await denied(
      () => db.query(`UPDATE public.grns SET status = 'Approved', item_name = 'PET ||| {"qcStatus":"Approved","status":"Approved"}' WHERE id = 'GRN-DRAFT'`),
      /approve, reject, or hold a GRN/
    );
    await denied(
      () => db.query(`UPDATE public.grns SET status = 'QC Hold' WHERE id = 'GRN-DRAFT'`),
      /approve, reject, or hold a GRN/
    );
    await denied(
      () => db.query(`UPDATE public.grns SET item_name = 'PET ||| {"status":"Pending QC Approval","qcStatus":"Rejected"}' WHERE id = 'GRN-DRAFT'`),
      /approve, reject, or hold a GRN/
    );

    for (const role of ['Purchase Manager', 'Printing Operator', 'Shop Floor Operator', 'HR & Payroll Manager', 'Sales Manager']) {
      await asUser(db, ROLE_IDS[role]);
      if (role === 'Sales Manager') {
        await db.query(`UPDATE public.grns SET status = 'Approved' WHERE id = 'GRN-DRAFT'`);
      } else {
        await denied(
          () => db.query(`UPDATE public.grns SET status = 'Approved' WHERE id = 'GRN-DRAFT'`),
          /approve, reject, or hold a GRN/
        );
      }
    }
    await db.exec('RESET ROLE');
    const stillPending = await db.query(`SELECT status FROM public.grns WHERE id = 'GRN-DRAFT'`);
    assert.equal(stillPending.rows[0].status, 'Pending QC Approval');

    await asUser(db, ROLE_IDS['QC Chemist']);
    await db.query(`UPDATE public.grns SET status = 'Approved', item_name = 'PET ||| {"qcStatus":"Approved","status":"Approved"}' WHERE id = 'GRN-DRAFT'`);
    await denied(
      () => db.query(`UPDATE public.grns SET qc_remarks = 'changed after approval' WHERE id = 'GRN-DRAFT'`),
      /QC-approved/
    );
    await asUser(db, ROLE_IDS.Admin);
    await denied(
      () => db.query(`UPDATE public.grns SET qc_remarks = 'admin edit' WHERE id = 'GRN-DRAFT'`),
      /QC-approved/
    );

    await asUser(db, ROLE_IDS['Store Manager']);
    await draft('GRN-HOLD', 'Pending QC Approval', 'PET ||| {"status":"Pending QC Approval"}');
    await asUser(db, ROLE_IDS['Production Manager']);
    await db.query(`UPDATE public.grns SET status = 'QC Hold' WHERE id = 'GRN-HOLD'`);
    await asUser(db, ROLE_IDS['Plant Manager']);
    await draft('GRN-REJ', 'Pending QC Approval', 'PET ||| {"status":"Pending QC Approval"}');
    await db.query(`UPDATE public.grns SET status = 'Rejected' WHERE id = 'GRN-REJ'`);
    const decisions = await db.query(`SELECT id, status FROM public.grns WHERE id IN ('GRN-HOLD', 'GRN-REJ') ORDER BY id`);
    assert.deepEqual(decisions.rows.map((row) => row.status), ['QC Hold', 'Rejected']);

    await asUser(db, ROLE_IDS['Printing Operator']);
    await db.query(`INSERT INTO public.inventory (id, item_name) VALUES ('RM-OP', 'PET')`);
    await db.query(`UPDATE public.inventory SET item_name = 'PET updated' WHERE id = 'RM-OP'`);
    await db.query(`INSERT INTO public.production_schedules (id, status) VALUES ('RUN-1', 'Running')`);
    const stock = await db.query(`SELECT item_name FROM public.inventory WHERE id = 'RM-OP'`);
    assert.equal(stock.rows[0].item_name, 'PET updated');

    for (const role of SYSTEM_ROLES) {
      await asUser(db, ROLE_IDS[role]);
      const writePellet = () => db.query(
        `INSERT INTO public.pellet_consumptions (id, consumed_qty_kg) VALUES ($1, 12)`,
        [`CON-${slug(role)}`]
      );
      const writeInward = () => db.query(
        `INSERT INTO public.pellet_inwards (id, grn_no, inward_qty_kg) VALUES ($1, $2, 20)`,
        [`IN-${slug(role)}`, `SIL/GRN/26-27/${slug(role)}`]
      );
      if (PELLET_RECORD_ROLES.includes(role)) {
        await writePellet();
        await writeInward();
      } else {
        await denied(writePellet, /record pellet fuel|row-level security/i);
        await denied(writeInward, /record pellet fuel|row-level security/i);
      }
    }

    await asUser(db, ROLE_IDS['Sales Manager']);
    const salesView = await db.query(`SELECT count(*)::int AS n FROM public.pellet_inwards`);
    assert.ok(salesView.rows[0].n >= 4);
    const salesConsumption = await db.query(`SELECT count(*)::int AS n FROM public.pellet_consumptions`);
    assert.ok(salesConsumption.rows[0].n >= 4);
    await asUser(db, ROLE_IDS['Purchase Manager']);
    const purchaseView = await db.query(`SELECT count(*)::int AS n FROM public.pellet_consumptions`);
    assert.ok(purchaseView.rows[0].n >= 4);
    await asUser(db, ROLE_IDS['QC Chemist']);
    const chemistView = await db.query(`SELECT count(*)::int AS n FROM public.pellet_inwards`);
    assert.ok(chemistView.rows[0].n >= 4);
    await asUser(db, ROLE_IDS['Printing Operator']);
    const operatorPellet = await db.query(`SELECT count(*)::int AS n FROM public.pellet_inwards`);
    assert.equal(operatorPellet.rows[0].n, 0);
    await asUser(db, ROLE_IDS['Shop Floor Operator']);
    const shopPellet = await db.query(`SELECT count(*)::int AS n FROM public.pellet_consumptions`);
    assert.equal(shopPellet.rows[0].n, 0);

    await asUser(db, ROLE_IDS['Printing Operator']);
    await denied(
      () => db.query(`INSERT INTO public.pellet_grn_counters (prefix, last_value) VALUES ('OP/', 1)`),
      /pellet number series|row-level security/i
    );
    const operatorNumber = await db.query(`SELECT public.allocate_pellet_grn_number('SIL/GRN/26-27/') AS n`);
    assert.match(operatorNumber.rows[0].n, /^SIL\/GRN\/26-27\/\d+$/);
    await asUser(db, ROLE_IDS['Purchase Manager']);
    const purchaseNumber = await db.query(`SELECT public.allocate_pellet_grn_number('SIL/GRN/26-27/') AS n`);
    assert.match(purchaseNumber.rows[0].n, /^SIL\/GRN\/26-27\/\d+$/);
    assert.notEqual(purchaseNumber.rows[0].n, operatorNumber.rows[0].n);
    await asUser(db, ROLE_IDS['Sales Manager']);
    await denied(
      () => db.query(`SELECT public.allocate_pellet_grn_number('SIL/GRN/26-27/')`),
      /cannot reserve a GRN number/
    );

    await asUser(db, '10000000-0000-4000-8000-000000000099');
    await db.query(`INSERT INTO public.pellet_consumptions (id, consumed_qty_kg) VALUES ('CON-UNION', 3)`);
    await denied(
      () => db.query(`UPDATE public.material_indents SET payload = jsonb_set(payload, '{status}', '"Approved"') WHERE id = 'IND-production-manager'`),
      /Only an Admin can approve or reject/
    );

    await db.exec('RESET ROLE');
    const policies = await db.query(`
      SELECT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `);
    const names = policies.rows.map((row) => `${row.tablename}:${row.policyname}`);
    assert.ok(names.includes('grns:grns_access'));
    assert.ok(names.includes('inventory:inventory_access'));
    assert.ok(names.includes('production_schedules:production_schedules_access'));
    assert.equal(names.includes('material_indents:material_indents_access'), false);
    assert.equal(names.includes('pellet_inwards:pellet_inwards_access'), false);
    assert.ok(names.includes('pellet_inwards:pellet_inwards_select'));
    assert.ok(names.includes('pellet_inwards:pellet_inwards_insert'));
    const grnPolicy = await db.query(`SELECT qual FROM pg_policies WHERE tablename = 'grns' AND policyname = 'grns_access'`);
    assert.match(grnPolicy.rows[0].qual, /inventory/);
    assert.match(grnPolicy.rows[0].qual, /purchase_orders/);
    const triggers = await db.query(`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'public.grns'::regclass AND NOT tgisinternal
      ORDER BY tgname
    `);
    assert.deepEqual(triggers.rows.map((row) => row.tgname), ['grns_lock_after_qc_approval', 'grns_qc_decision_role']);
    const schedulePolicy = await db.query(`SELECT qual FROM pg_policies WHERE tablename = 'production_schedules'`);
    assert.match(schedulePolicy.rows[0].qual, /printing_scheduler/);
  } finally {
    await db.close();
  }
});
