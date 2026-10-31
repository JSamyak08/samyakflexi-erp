import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { isInventoryItemActive } from '../src/services/inventoryArchive.js';

const previousSql = fs.readFileSync(
  new URL('../supabase/migrations/20261031082246_delete_inventory_item_keep_barcodes.sql', import.meta.url),
  'utf8'
);
const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261031085359_archive_inventory_instead_of_delete.sql', import.meta.url),
  'utf8'
);
const specSql = fs.readFileSync(
  new URL('../supabase/migrations/20261030200000_inventory_spec_duplicate_guard.sql', import.meta.url),
  'utf8'
);

function asJson(value) {
  if (value == null) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE TABLE private.delete_probe (allowed boolean NOT NULL);
    INSERT INTO private.delete_probe VALUES (true);
    CREATE OR REPLACE FUNCTION private.can_any(modules text[])
    RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT allowed FROM private.delete_probe $$;

    CREATE ROLE anon;
    CREATE ROLE authenticated;

    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_code text NOT NULL,
      item_name text NOT NULL,
      category text,
      film_type text,
      micron numeric,
      width_mm numeric,
      stock_qty_kg numeric DEFAULT 0,
      unit_price numeric DEFAULT 0,
      location text,
      barcode text,
      last_updated timestamptz
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      barcode text,
      roll_type text,
      item_id text,
      item_name text NOT NULL,
      film_type text,
      order_id text,
      job_name text,
      job_code text,
      status text,
      qc_status text,
      location_bay text,
      inward_datetime timestamptz,
      metadata jsonb,
      net_weight_kg numeric,
      available_weight_kg numeric
    );
    CREATE VIEW public.barcode_registry WITH (security_invoker = true) AS
    SELECT
      btrim(roll.barcode_id) AS barcode,
      'Raw material / GRN'::text AS source_module,
      roll.item_name AS description,
      roll.barcode_id AS reference_no,
      roll.inward_datetime AS created_at,
      roll.status,
      roll.location_bay AS location,
      'inventory_rolls'::text AS source_table,
      'barcode_id'::text AS source_column
    FROM public.inventory_rolls AS roll
    WHERE nullif(btrim(roll.barcode_id), '') IS NOT NULL;

    CREATE TABLE public.grns (
      id text PRIMARY KEY,
      grn_number text,
      item_name text,
      stock_item_id text,
      master_item_id text
    );
    CREATE TABLE public.grn_line_items (
      id text PRIMARY KEY,
      grn_id text,
      line_no integer,
      stock_item_id text,
      master_item_id text,
      item_name text,
      net_weight_kg numeric
    );
    CREATE TABLE public.stock_adjustments (
      id text PRIMARY KEY,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.store_issue_transactions (
      id text PRIMARY KEY,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.machine_issues (
      id text PRIMARY KEY,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.production_records (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      materials_list jsonb DEFAULT '[]'::jsonb
    );
    CREATE TABLE public.audit_logs (
      id text PRIMARY KEY,
      username text,
      user_role text,
      action_type text,
      module text,
      details text,
      target_id text,
      created_at timestamptz DEFAULT now()
    );
  `);
  await db.exec(specSql);
  await db.exec(previousSql);
  await db.exec(migrationSql);
  await db.exec(`
    INSERT INTO public.inventory (id, item_code, item_name, category, film_type, micron, width_mm, stock_qty_kg, unit_price, location)
    VALUES
      ('INVT-0010', 'INVT-0010', 'PET-650-12', 'Film Substrates', 'PET', 12, 650, 150, 155, 'Bay A'),
      ('INVT-0038', 'INVT-0038', 'METPET-650-12', 'Film Substrates', 'METPET', 12, 650, 80, 210, 'Bay B'),
      ('INVT-0090', 'INVT-0090', 'PET-700-12', 'Film Substrates', 'PET', 12, 700, 0, 140, 'Bay C');
    INSERT INTO public.inventory_rolls (
      barcode_id, item_id, item_name, status, qc_status, net_weight_kg, available_weight_kg, metadata
    ) VALUES
      ('RM-BC-PET-1', 'INVT-0010', 'PET-650-12', 'In Stock', 'Passed', 100, 100, '{}'),
      ('RM-BC-PET-HOLD', 'INVT-0010', 'PET-650-12', 'QC Hold', 'QC Hold', 50, 50, '{}'),
      ('RM-BC-MET', 'INVT-0038', 'METPET-650-12', 'In Stock', 'Passed', 80, 80, '{}');
    INSERT INTO public.grn_line_items (id, grn_id, line_no, stock_item_id, item_name, net_weight_kg)
    VALUES ('LINE-PET', 'GRN-1', 1, 'INVT-0010', 'PET-650-12', 100);
    INSERT INTO public.grns (id, grn_number, item_name, stock_item_id)
    VALUES ('GRN-1', 'SIL/GRN/26-27/10', 'PET-650-12', 'INVT-0010');
    INSERT INTO public.production_records (id, job_name, materials_list)
    VALUES ('REC-1', 'Atta', '[{"itemId":"INVT-0010","netConsumedQtyKg":4}]'::jsonb);
    INSERT INTO public.deleted_barcodes (
      id, barcode, source_module, description, status, deleted_reason, deleted_at, deleted_by, item_id
    ) VALUES (
      'Deleted|rm-bc-old', 'RM-BC-OLD', 'Raw material / GRN', 'Old roll', 'Deleted',
      'Removed with the previous rule', now(), 'Store', 'INVT-0001'
    );
  `);
  return db;
}

test('an item is active unless the archive flag is false', () => {
  assert.equal(isInventoryItemActive({ id: 'INVT-1' }), true);
  assert.equal(isInventoryItemActive({ id: 'INVT-1', is_active: false }), false);
  assert.equal(isInventoryItemActive({ id: 'INVT-1', isActive: false }), false);
});

test('the archive migration is newer than the cascade delete and does not touch production', () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const current = '20261031085359_archive_inventory_instead_of_delete.sql';
  assert.ok(names.indexOf(current) > names.indexOf('20261031082246_delete_inventory_item_keep_barcodes.sql'));
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.match(migrationSql, /cannot be deleted/);
  assert.match(migrationSql, /Written Off/);
});

test('used items are archived or written off, and only an unused item is deleted', async () => {
  const db = await database();
  const preview = asJson((await db.query(
    `SELECT public.preview_delete_inventory_items(ARRAY['INVT-0010']::text[]) AS plan`
  )).rows[0].plan);
  assert.equal(preview.mode, 'write_off');
  assert.equal(preview.canDelete, false);
  assert.equal(preview.history, true);
  assert.equal(preview.onHandRolls, 2);
  assert.equal(Number(preview.onHandKg), 150);

  await assert.rejects(
    () => db.query(`SELECT public.delete_inventory_items(ARRAY['INVT-0010']::text[], 'Mistake') AS result`),
    /cannot be deleted|Stock must be zero/
  );
  await assert.rejects(
    () => db.query(`SELECT public.archive_inventory_items(ARRAY['INVT-0010']::text[], 'No longer bought') AS result`),
    /Stock must be zero/
  );

  const rollsBefore = await db.query(`SELECT count(*)::int AS n FROM public.inventory_rolls WHERE item_id = 'INVT-0010'`);
  const linesBefore = await db.query(`SELECT count(*)::int AS n FROM public.grn_line_items`);
  const settled = asJson((await db.query(
    `SELECT public.write_off_inventory_items(ARRAY['INVT-0010']::text[], 'Gauge was wrong', NULL, true) AS result`
  )).rows[0].result);
  assert.equal(settled.action, 'archived');
  assert.equal(settled.barcodesMarked.length, 2);
  assert.ok(settled.barcodesMarked.every((row) => row.status === 'Written Off'));

  const rollsAfter = await db.query(`SELECT barcode_id, status, available_weight_kg FROM public.inventory_rolls WHERE item_id = 'INVT-0010' ORDER BY barcode_id`);
  assert.equal(rollsAfter.rows.length, rollsBefore.rows[0].n);
  assert.ok(rollsAfter.rows.every((row) => row.status === 'Written Off' && Number(row.available_weight_kg) === 0));
  const linesAfter = await db.query(`SELECT count(*)::int AS n FROM public.grn_line_items`);
  assert.equal(linesAfter.rows[0].n, linesBefore.rows[0].n);
  const materials = asJson((await db.query(`SELECT materials_list FROM public.production_records WHERE id = 'REC-1'`)).rows[0].materials_list);
  assert.equal(materials[0].itemId, 'INVT-0010');
  const met = await db.query(`SELECT status, available_weight_kg FROM public.inventory_rolls WHERE barcode_id = 'RM-BC-MET'`);
  assert.equal(met.rows[0].status, 'In Stock');
  assert.equal(Number(met.rows[0].available_weight_kg), 80);

  const item = await db.query(`SELECT is_active, archive_reason, stock_qty_kg FROM public.inventory WHERE id = 'INVT-0010'`);
  assert.equal(item.rows[0].is_active, false);
  assert.equal(item.rows[0].archive_reason, 'Gauge was wrong');
  assert.equal(Number(item.rows[0].stock_qty_kg), 0);

  const adjustments = await db.query(`SELECT payload->>'type' AS type, (payload->>'qtyKg')::numeric AS qty FROM public.stock_adjustments ORDER BY id`);
  assert.ok(adjustments.rows.length >= 2);
  assert.ok(adjustments.rows.every((row) => row.type === 'Write Off' && Number(row.qty) < 0));

  const registry = await db.query(`
    SELECT barcode, status, deleted_reason FROM public.barcode_registry
    WHERE barcode IN ('RM-BC-PET-1', 'RM-BC-PET-HOLD', 'RM-BC-OLD')
    ORDER BY barcode
  `);
  const byCode = Object.fromEntries(registry.rows.map((row) => [row.barcode, row]));
  assert.equal(byCode['RM-BC-PET-1'].status, 'Written Off');
  assert.equal(byCode['RM-BC-PET-1'].deleted_reason, 'Gauge was wrong');
  assert.equal(byCode['RM-BC-OLD'].status, 'Deleted');
  assert.equal(byCode['RM-BC-OLD'].deleted_reason, 'Removed with the previous rule');

  const audits = await db.query(`SELECT action_type, details FROM public.audit_logs WHERE target_id = 'INVT-0010' ORDER BY action_type`);
  assert.ok(audits.rows.some((row) => row.action_type === 'WRITE_OFF' && /Gauge was wrong/.test(row.details)));
  assert.ok(audits.rows.some((row) => row.action_type === 'ARCHIVE' && /Gauge was wrong/.test(row.details)));

  await assert.rejects(
    () => db.exec(`INSERT INTO public.inventory_rolls (barcode_id, item_id, item_name, net_weight_kg, available_weight_kg, status)
      VALUES ('RM-BC-PET-1', 'INVT-0038', 'METPET', 1, 1, 'In Stock')`),
    /cannot be received/
  );
  await assert.rejects(
    () => db.exec(`INSERT INTO public.inventory_rolls (barcode_id, item_id, item_name, net_weight_kg, available_weight_kg, status)
      VALUES ('RM-BC-OLD', 'INVT-0038', 'METPET', 1, 1, 'In Stock')`),
    /cannot be received/
  );

  await db.query(`SELECT public.reactivate_inventory_items(ARRAY['INVT-0010']::text[], 'Bought again')`);
  const reactivated = await db.query(`SELECT is_active, archive_reason FROM public.inventory WHERE id = 'INVT-0010'`);
  assert.equal(reactivated.rows[0].is_active, true);
  assert.equal(reactivated.rows[0].archive_reason, null);
  const reactivateAudit = await db.query(`SELECT details FROM public.audit_logs WHERE action_type = 'REACTIVATE'`);
  assert.match(reactivateAudit.rows[0].details, /Bought again/);

  const removed = asJson((await db.query(
    `SELECT public.delete_inventory_items(ARRAY['INVT-0090']::text[], 'Created by mistake') AS result`
  )).rows[0].result);
  assert.equal(removed.action, 'deleted');
  const left = await db.query(`SELECT id FROM public.inventory ORDER BY id`);
  assert.deepEqual(left.rows.map((row) => row.id), ['INVT-0010', 'INVT-0038']);
  const deleteAudit = await db.query(`SELECT details FROM public.audit_logs WHERE action_type = 'DELETE' AND target_id = 'INVT-0090'`);
  assert.match(deleteAudit.rows[0].details, /Created by mistake/);

  await assert.rejects(
    () => db.exec(`
      INSERT INTO public.inventory (id, item_code, item_name, category, micron, width_mm)
      VALUES ('INVT-0101', 'INVT-0101', 'METPET-650-12', 'Film Substrates', 12, 650)
    `),
    /Duplicate inventory item/
  );
});

test('a blank reason does not archive, write off, or delete', async () => {
  const db = await database();
  await assert.rejects(
    () => db.query(`SELECT public.archive_inventory_items(ARRAY['INVT-0090']::text[], '  ') AS result`),
    /reason is required/
  );
  await assert.rejects(
    () => db.query(`SELECT public.write_off_inventory_items(ARRAY['INVT-0010']::text[], '', NULL, true) AS result`),
    /reason is required/
  );
  await db.exec(`UPDATE private.delete_probe SET allowed = false`);
  await assert.rejects(
    () => db.query(`SELECT public.delete_inventory_items(ARRAY['INVT-0090']::text[], 'Mistake') AS result`),
    /not allowed to delete/
  );
  const still = await db.query(`SELECT count(*)::int AS n FROM public.inventory_rolls`);
  assert.equal(still.rows[0].n, 3);
});
