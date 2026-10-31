import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261031082246_delete_inventory_item_keep_barcodes.sql', import.meta.url),
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
    RETURNS boolean
    LANGUAGE sql
    STABLE
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
      location_bay text,
      inward_datetime timestamptz,
      metadata jsonb,
      net_weight_kg numeric,
      available_weight_kg numeric
    );
    CREATE VIEW public.barcode_registry
    WITH (security_invoker = true) AS
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
  await db.exec(migrationSql);
  await db.exec(`
    INSERT INTO public.inventory (id, item_code, item_name, category, film_type, micron, width_mm, stock_qty_kg, unit_price, location, barcode)
    VALUES
      ('INVT-0010', 'INVT-0010', 'PET-650-12', 'Film Substrates', 'PET', 12, 650, 80, 155, 'Bay A', 'RM-BC-PET-1'),
      ('INVT-0038', 'INVT-0038', 'METPET-650-12', 'Film Substrates', 'METPET', 12, 650, 40, 210, 'Bay B', NULL);

    INSERT INTO public.inventory_rolls (
      barcode_id, item_id, item_name, film_type, roll_type, status, order_id, job_name,
      net_weight_kg, available_weight_kg, location_bay, inward_datetime, metadata
    ) VALUES
      ('RM-BC-PET-1', 'INVT-0010', 'PET-650-12', 'PET', 'RAW_MATERIAL', 'Consumed', 'JOB-1', 'Atta pouch', 100, 40, 'Bay A', '2026-10-29T08:00:00Z', '{}'),
      ('RM-BC-PET-2', 'INVT-0010', 'PET-650-12', 'PET', 'RAW_MATERIAL', 'In Stock', NULL, NULL, 50, 50, 'Bay A', '2026-10-30T08:00:00Z', '{}'),
      ('RM-BC-20261029-1945F8BH', 'INVT-0038', 'METPET-650-12', 'METPET', 'RAW_MATERIAL', 'In Stock', NULL, NULL, 80, 80, 'Bay B', '2026-10-29T19:45:00Z', '{}');

    INSERT INTO public.grns (id, grn_number, item_name, stock_item_id, master_item_id)
    VALUES
      ('GRN-MIX', 'SIL/GRN/26-27/10', 'Mixed receipt', 'INVT-0010', 'INVT-0010'),
      ('GRN-ONLY', 'SIL/GRN/26-27/11', 'PET only', 'INVT-0010', 'INVT-0010');
    INSERT INTO public.grn_line_items (id, grn_id, line_no, stock_item_id, master_item_id, item_name, net_weight_kg)
    VALUES
      ('LINE-PET', 'GRN-MIX', 1, 'INVT-0010', 'INVT-0010', 'PET-650-12', 100),
      ('LINE-MET', 'GRN-MIX', 2, 'INVT-0038', 'INVT-0038', 'METPET-650-12', 80),
      ('LINE-ONLY', 'GRN-ONLY', 1, 'INVT-0010', 'INVT-0010', 'PET-650-12', 50);

    INSERT INTO public.stock_adjustments (id, payload) VALUES
      ('ADJ-ROLL', '{"itemId":"INVT-0010","itemCode":"INVT-0010","itemName":"PET-650-12","qtyKg":100,"barcode":"RM-BC-PET-1","type":"Opening Stock Receipt (Bulk Upload)"}'),
      ('ADJ-LOOSE', '{"itemId":"INVT-0010","itemName":"PET-650-12","qtyKg":20,"type":"Physical Audit (+)"}'),
      ('ADJ-MET', '{"itemId":"INVT-0038","itemName":"METPET-650-12","qtyKg":80,"barcode":"RM-BC-20261029-1945F8BH"}');
    INSERT INTO public.store_issue_transactions (id, payload) VALUES
      ('ISS-PET', '{"itemId":"INVT-0010","itemName":"PET-650-12","qtyKg":10,"barcode":"RM-BC-PET-2","issueType":"issue"}'),
      ('ISS-MET', '{"itemId":"INVT-0038","itemName":"METPET-650-12","qtyKg":5}');
    INSERT INTO public.machine_issues (id, payload) VALUES
      ('MACH-PET', '{"itemId":"INVT-0010","itemName":"PET-650-12","qtyIssued":2}'),
      ('MACH-NAME', '{"itemName":"Cyan solvent ink","qtyIssued":1}');
    INSERT INTO public.production_records (id, job_name, materials_list) VALUES (
      'REC-1',
      'Atta pouch',
      '[
        {"itemId":"INVT-0010","itemName":"PET-650-12","netConsumedQtyKg":10},
        {"itemId":"INVT-0038","itemName":"METPET-650-12","netConsumedQtyKg":4}
      ]'::jsonb
    );
  `);
  return db;
}

test('the delete migration is newer than the ink HSN migration and does not touch production', () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const current = '20261031082246_delete_inventory_item_keep_barcodes.sql';
  assert.ok(names.indexOf(current) > names.indexOf('20261031060000_ink_hsn_code.sql'));
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.inventory\b/i);
  assert.match(migrationSql, /deleted_reason/);
  assert.match(migrationSql, /SECURITY DEFINER/);
});

test('deleting a stock item removes its rolls and ledger rows, keeps barcodes as Deleted, and leaves other items', async () => {
  const db = await database();
  const preview = asJson((await db.query(
    `SELECT public.preview_delete_inventory_items(ARRAY['INVT-0010']::text[]) AS plan`
  )).rows[0].plan);
  assert.equal(preview.rolls, 2);
  assert.equal(preview.barcodes, 2);
  assert.equal(preview.ledgerEntries, 7);
  assert.equal(Number(preview.totalKg), 170);
  assert.equal(preview.consumedOrIssued, true);
  assert.equal(preview.consumedOrIssuedRolls, 1);

  const deleted = asJson((await db.query(
    `SELECT public.delete_inventory_items(ARRAY['INVT-0010']::text[], 'Wrong film was stored under PET') AS result`
  )).rows[0].result);
  assert.equal(deleted.reason, 'Wrong film was stored under PET');
  assert.equal(deleted.rolls, 2);
  assert.equal(deleted.barcodes, 2);

  const items = await db.query(`SELECT id FROM public.inventory ORDER BY id`);
  assert.deepEqual(items.rows.map((row) => row.id), ['INVT-0038']);
  const rolls = await db.query(`SELECT barcode_id, item_id FROM public.inventory_rolls ORDER BY barcode_id`);
  assert.deepEqual(rolls.rows, [{ barcode_id: 'RM-BC-20261029-1945F8BH', item_id: 'INVT-0038' }]);

  const headers = await db.query(`SELECT id, stock_item_id FROM public.grns ORDER BY id`);
  assert.deepEqual(headers.rows, [
    { id: 'GRN-MIX', stock_item_id: 'INVT-0038' },
    { id: 'GRN-ONLY', stock_item_id: 'INVT-0010' }
  ]);
  const lines = await db.query(`SELECT id, stock_item_id FROM public.grn_line_items ORDER BY id`);
  assert.deepEqual(lines.rows, [{ id: 'LINE-MET', stock_item_id: 'INVT-0038' }]);

  const adjustments = await db.query(`SELECT id FROM public.stock_adjustments ORDER BY id`);
  assert.deepEqual(adjustments.rows.map((row) => row.id), ['ADJ-MET']);
  const issues = await db.query(`SELECT id FROM public.store_issue_transactions ORDER BY id`);
  assert.deepEqual(issues.rows.map((row) => row.id), ['ISS-MET']);
  const machines = await db.query(`SELECT id FROM public.machine_issues ORDER BY id`);
  assert.deepEqual(machines.rows.map((row) => row.id), ['MACH-NAME']);

  const materials = asJson((await db.query(
    `SELECT materials_list FROM public.production_records WHERE id = 'REC-1'`
  )).rows[0].materials_list);
  assert.equal(materials.length, 1);
  assert.equal(materials[0].itemId, 'INVT-0038');

  const tombstones = await db.query(
    `SELECT barcode, source_module, status, deleted_reason, deleted_by FROM public.deleted_barcodes ORDER BY barcode, source_module`
  );
  const tombstoneCodes = [...new Set(tombstones.rows.map((row) => row.barcode))];
  assert.deepEqual(tombstoneCodes, ['RM-BC-PET-1', 'RM-BC-PET-2']);
  assert.ok(tombstones.rows.every((row) => row.status === 'Deleted'));
  assert.ok(tombstones.rows.every((row) => row.deleted_reason === 'Wrong film was stored under PET'));
  assert.ok(tombstones.rows.every((row) => row.deleted_by));
  assert.ok(tombstones.rows.some((row) => row.barcode === 'RM-BC-PET-1' && row.source_module === 'Raw material / GRN'));
  assert.ok(tombstones.rows.some((row) => row.barcode === 'RM-BC-PET-1' && row.source_module === 'Inventory items'));

  const registry = await db.query(
    `SELECT barcode, status, deleted_reason, deleted_by
     FROM public.barcode_registry
     WHERE lower(barcode) LIKE 'rm-bc-pet-%'
     ORDER BY barcode`
  );
  assert.deepEqual([...new Set(registry.rows.map((row) => row.barcode))], ['RM-BC-PET-1', 'RM-BC-PET-2']);
  assert.ok(registry.rows.every((row) => row.status === 'Deleted' && row.deleted_reason === 'Wrong film was stored under PET'));

  const met = await db.query(
    `SELECT status FROM public.barcode_registry WHERE barcode = 'RM-BC-20261029-1945F8BH'`
  );
  assert.equal(met.rows[0].status, 'In Stock');

  const audit = await db.query(`SELECT details, target_id, action_type, module FROM public.audit_logs`);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].target_id, 'INVT-0010');
  assert.equal(audit.rows[0].action_type, 'DELETE');
  assert.match(audit.rows[0].details, /Wrong film was stored under PET/);
  assert.match(audit.rows[0].details, /Rolls 2/);

  await assert.rejects(
    () => db.exec(`
      INSERT INTO public.inventory_rolls (barcode_id, item_id, item_name, net_weight_kg, available_weight_kg)
      VALUES ('RM-BC-PET-1', 'INVT-0038', 'METPET-650-12', 10, 10)
    `),
    /was deleted and cannot be received/
  );

  await db.exec(`
    INSERT INTO public.inventory (id, item_code, item_name, category, micron, width_mm)
    VALUES ('INVT-0099', 'INVT-0099', 'PET-650-12', 'Film Substrates', 12, 650)
  `);
  await assert.rejects(
    () => db.exec(`
      INSERT INTO public.inventory (id, item_code, item_name, category, micron, width_mm)
      VALUES ('INVT-0100', 'INVT-0100', 'PET-650-12', 'Film Substrates', 12, 650)
    `),
    /Duplicate inventory item/
  );
  await assert.rejects(
    () => db.exec(`
      INSERT INTO public.inventory (id, item_code, item_name, category, micron, width_mm)
      VALUES ('INVT-0101', 'INVT-0101', 'METPET-650-12', 'Film Substrates', 12, 650)
    `),
    /Duplicate inventory item/
  );
});

test('a blank reason or a caller who cannot delete inventory leaves every row in place', async () => {
  const db = await database();
  await assert.rejects(
    () => db.query(`SELECT public.delete_inventory_items(ARRAY['INVT-0010']::text[], '   ') AS result`),
    /reason is required/
  );
  await db.exec(`UPDATE private.delete_probe SET allowed = false`);
  await assert.rejects(
    () => db.query(`SELECT public.delete_inventory_items(ARRAY['INVT-0010']::text[], 'Cleanup') AS result`),
    /not allowed to delete/
  );
  await assert.rejects(
    () => db.query(`SELECT public.preview_delete_inventory_items(ARRAY['INVT-0010']::text[]) AS plan`),
    /not allowed to delete/
  );
  const still = await db.query(`SELECT count(*)::int AS n FROM public.inventory`);
  assert.equal(still.rows[0].n, 2);
  const rolls = await db.query(`SELECT count(*)::int AS n FROM public.inventory_rolls`);
  assert.equal(rolls.rows[0].n, 3);
  const marked = await db.query(`SELECT count(*)::int AS n FROM public.deleted_barcodes`);
  assert.equal(marked.rows[0].n, 0);
});
