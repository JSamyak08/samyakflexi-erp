import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261024050000_barcode_registry.sql', import.meta.url),
  'utf8'
);
const rollbackSql = fs.readFileSync(
  new URL('../supabase/rollback/20261024050000_barcode_registry_rollback.sql', import.meta.url),
  'utf8'
);

async function barcodeSchema(db) {
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE TABLE private.barcode_probe (allowed boolean NOT NULL);
    INSERT INTO private.barcode_probe VALUES (true);
    CREATE OR REPLACE FUNCTION private.can_any(modules text[])
    RETURNS boolean
    LANGUAGE sql
    STABLE
    AS $$ SELECT allowed FROM private.barcode_probe $$;

    CREATE ROLE anon;
    CREATE ROLE authenticated;

    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb,
      updated_at timestamptz
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      barcode text,
      roll_type text,
      item_name text,
      film_type text,
      order_id text,
      job_name text,
      status text,
      qc_status text,
      location_bay text,
      inward_datetime timestamptz,
      metadata jsonb,
      input_barcode_ids jsonb
    );
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_code text,
      item_name text,
      barcode text,
      category text,
      location text,
      last_updated timestamptz
    );
    CREATE TABLE public.sfg_goods (
      id uuid PRIMARY KEY,
      sfg_batch_code text,
      sfg_type text,
      job_name text,
      order_id text,
      status text,
      storage_bay text,
      notes text,
      created_at timestamptz
    );
    CREATE TABLE public.fg_goods (
      id uuid PRIMARY KEY,
      fg_batch_code text,
      fg_type text,
      job_name text,
      order_id text,
      status text,
      storage_bay text,
      notes text,
      created_at timestamptz
    );
    CREATE TABLE public.sfg_fg_store (
      id text PRIMARY KEY,
      batch_no text,
      job_name text,
      job_card_no text,
      item_type text,
      status text,
      location_rack text,
      created_at timestamptz
    );
    CREATE TABLE public.grn_line_items (
      id text PRIMARY KEY,
      grn_id text,
      item_name text,
      rolls jsonb,
      created_at timestamptz
    );
    CREATE TABLE public.dispatch_shipments (
      dispatch_id text PRIMARY KEY,
      order_id text,
      job_name text,
      dispatch_date timestamptz,
      created_at timestamptz,
      items jsonb,
      challan_nature text,
      vehicle_no text
    );
    CREATE TABLE public.delivery_challans (
      id text PRIMARY KEY,
      challan_no text,
      payload jsonb,
      created_at timestamptz
    );
    CREATE TABLE public.custom_barcodes (
      id text PRIMARY KEY,
      payload jsonb,
      created_at timestamptz
    );
    CREATE TABLE public.stock_adjustments (
      id text PRIMARY KEY,
      payload jsonb,
      created_at timestamptz
    );
    CREATE TABLE public.sfg_qc_hold_items (
      id text PRIMARY KEY,
      payload jsonb,
      created_at timestamptz
    );
    CREATE TABLE public.sfg_scrap_items (
      id text PRIMARY KEY,
      payload jsonb,
      created_at timestamptz
    );
    CREATE TABLE public.store_issue_transactions (
      id text PRIMARY KEY,
      payload jsonb,
      created_at timestamptz
    );
    CREATE TABLE public.cylinders (
      id text PRIMARY KEY,
      sku text,
      job_name text,
      status text,
      assigned_press text,
      created_at timestamptz
    );
    CREATE TABLE public.production_records (
      id text PRIMARY KEY,
      order_id text,
      job_name text,
      status text,
      recorded_at timestamptz,
      materials_list jsonb,
      output_rolls jsonb,
      input_rolls_list jsonb,
      sfg_consumptions jsonb,
      process_logs jsonb
    );
  `);
}

test('barcode registry unions stored codes and stays closed to anon', async () => {
  const db = new PGlite();
  await barcodeSchema(db);
  await db.exec(`
    INSERT INTO public.role_permissions (role, permissions, updated_at) VALUES
      ('Store Manager', '{"inventory": true, "dispatch": true}', '2026-01-01'),
      ('Sales Manager', '{"sales": true, "pellet_fuel": false}', '2026-01-01'),
      ('QC Chemist', '{"barcodes": false, "inventory": true}', '2026-01-01');
    INSERT INTO public.inventory_rolls (barcode_id, roll_type, item_name, order_id, status, location_bay, inward_datetime, metadata, input_barcode_ids)
    VALUES
      ('RM-BC-GRN-1-L2-R1', 'RAW_MATERIAL', 'PET 12', NULL, 'In Stock', 'Bay A', '2026-10-20T08:00:00Z', '{"grnNo":"SIL/GRN/1"}', '["RM-BC-PARENT"]'),
      ('SFG-BC-ORD-1-R02', 'SFG', 'Child roll', 'ORD-1', 'In Stock', 'Bay B', '2026-10-21T08:00:00Z', '{"parentSfgBatchCode":"SFG-BC-ORD-1"}', '[]');
    INSERT INTO public.sfg_goods (id, sfg_batch_code, sfg_type, job_name, order_id, status, storage_bay, created_at)
    VALUES ('00000000-0000-0000-0000-000000000001', 'SFG-BC-ORD-1', 'Printed Rolls', 'Atta pouch', 'ORD-1', 'In Stock (WIP)', 'Bay B', '2026-10-21T09:00:00Z');
    INSERT INTO public.fg_goods (id, fg_batch_code, fg_type, job_name, order_id, status, storage_bay, created_at)
    VALUES ('00000000-0000-0000-0000-000000000002', 'FG-BC-ORD-1', 'Finished Goods', 'Atta pouch', 'ORD-1', 'Ready for Dispatch', 'FG Warehouse', '2026-10-22T09:00:00Z');
    INSERT INTO public.grn_line_items (id, grn_id, item_name, rolls)
    VALUES ('LINE-1', 'GRN-1', 'Solvent', '[{"barcodeId":"CON-BC-GRN-1-1"}]');
    INSERT INTO public.dispatch_shipments (dispatch_id, order_id, job_name, items, vehicle_no)
    VALUES ('PL-1', 'ORD-1', 'Atta pouch', '[{"barcodeId":"FG-DISP-100001-1"}]', 'MP09AB1234');
    INSERT INTO public.custom_barcodes (id, payload)
    VALUES ('TX-1', '{"barcode":"BAR-TX-1"}');
    INSERT INTO public.cylinders (id, sku, job_name, status, assigned_press)
    VALUES ('CYL-2026-001', 'SKU-CYL-001', 'Atta pouch', 'Active', 'Press 1');
    INSERT INTO public.production_records (id, order_id, job_name, status, materials_list, process_logs)
    VALUES (
      'REC-1', 'ORD-1', 'Atta pouch', 'Filled',
      '[{"barcode":"RM-BC-GRN-1-L2-R1"}]',
      '{"sfgConsumptions":[{"substrate2":{"barcode":"RM-SUB2-1"}}]}'
    );
    INSERT INTO public.inventory (id, item_name, barcode, location)
    VALUES ('INV-1', 'Ink drum', 'CON-BC-INK-1', 'Ink room');
  `);

  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const options = await db.query(`
    SELECT c.reloptions
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'barcode_registry'
  `);
  assert.match(String(options.rows[0].reloptions), /security_invoker=true/);

  const anon = await db.query(`
    SELECT privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'barcode_registry' AND grantee = 'anon'
  `);
  assert.equal(anon.rows.length, 0);
  const anonFn = await db.query(`
    SELECT privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'barcode_source_module' AND grantee = 'anon'
  `);
  assert.equal(anonFn.rows.length, 0);

  assert.equal((await db.query(`SELECT public.barcode_source_module('RM-BC-GRN-1-L2-R1') AS source`)).rows[0].source, 'Raw material / GRN');
  assert.equal((await db.query(`SELECT public.barcode_source_module('SFG-BC-ORD-1-R02') AS source`)).rows[0].source, 'Consume child rolls');

  const rows = await db.query(`
    SELECT barcode, source_module, source_table, source_column, reference_no
    FROM public.barcode_registry
    ORDER BY barcode, source_module
  `);
  const found = new Set(rows.rows.map((row) => `${row.source_module}|${row.barcode}`));
  for (const expected of [
    'Raw material / GRN|RM-BC-GRN-1-L2-R1',
    'Raw material / GRN|RM-BC-PARENT',
    'Raw material / GRN|CON-BC-GRN-1-1',
    'Consume child rolls|SFG-BC-ORD-1-R02',
    'SFG rolls|SFG-BC-ORD-1',
    'FG rolls|FG-BC-ORD-1',
    'Dispatch / challans|FG-DISP-100001-1',
    'Barcode print|BAR-TX-1',
    'Cylinders|SKU-CYL-001',
    'Cylinders|CYL-2026-001',
    'Production records|RM-SUB2-1',
    'Production records|RM-BC-GRN-1-L2-R1',
    'Inventory items|CON-BC-INK-1',
  ]) {
    assert.ok(found.has(expected), expected);
  }
  const grn = rows.rows.find((row) => row.barcode === 'RM-BC-GRN-1-L2-R1' && row.source_table === 'inventory_rolls');
  assert.equal(grn.reference_no, 'SIL/GRN/1');
  assert.equal(grn.source_column, 'barcode_id');

  await db.exec(`UPDATE private.barcode_probe SET allowed = false`);
  const hidden = await db.query(`SELECT count(*)::int AS n FROM public.barcode_registry`);
  assert.equal(hidden.rows[0].n, 0);

  const roles = await db.query(`SELECT role, permissions FROM public.role_permissions ORDER BY role`);
  const byRole = Object.fromEntries(roles.rows.map((row) => [
    row.role,
    typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
  ]));
  assert.equal(byRole['Store Manager'].barcodes, true);
  assert.equal(byRole['Store Manager'].inventory, true);
  assert.equal(byRole['Store Manager'].dispatch, true);
  assert.equal(byRole['Sales Manager'].barcodes, false);
  assert.equal(byRole['Sales Manager'].sales, true);
  assert.equal(byRole['Sales Manager'].pellet_fuel, false);
  assert.equal(byRole['QC Chemist'].barcodes, false);
  assert.equal(byRole['QC Chemist'].inventory, true);

  await db.exec(rollbackSql);
  const gone = await db.query(`
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'barcode_registry'
  `);
  assert.equal(gone.rows.length, 0);
  const cleared = await db.query(`SELECT permissions FROM public.role_permissions WHERE role = 'Store Manager'`);
  const store = typeof cleared.rows[0].permissions === 'string'
    ? JSON.parse(cleared.rows[0].permissions)
    : cleared.rows[0].permissions;
  assert.equal(store.barcodes, undefined);
  assert.equal(store.inventory, true);
});
