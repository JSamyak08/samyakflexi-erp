import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const scriptSql = fs.readFileSync(
  new URL('../supabase/manual/2026-10-30_merge_duplicate_inventory_items.sql', import.meta.url),
  'utf8'
);

function body() {
  return scriptSql
    .replace(/^\uFEFF/, '')
    .replace(/^[\s\S]*?\nbegin\s*;/i, '')
    .replace(/--\s*commit;[\s\S]*$/i, '');
}

const ITEMS = [
  ['INVT-0150', 'METBOPP-570-18', 26, 209, 'Bay A'],
  ['INVT-2031', 'METBOPP-570-18', 151.68, 205, 'Bay A - Inward Dock'],
  ['INVT-0154', 'METBOPP-650-18', 2013.58, 209, 'Bay A'],
  ['INVT-2032', 'METBOPP-650-18', 1313.1, 205, 'Bay A - Inward Dock'],
  ['INVT-0156', 'METBOPP-670-18', 1203.01, 209, 'Bay A'],
  ['INVT-2033', 'METBOPP-670-18', 728.8, 205, 'Inward Dock'],
  ['INVT-0010', 'PET-650-12', 354.23, 184, 'Bay A'],
  ['INVT-2036', 'PET-650-12', 10, 184, 'Inward Dock'],
  ['INVT-2037', 'PET-650-12', 0, 155, 'Inward Dock'],
  ['INVT-0011', 'PET-670-12', 55.6, 184, 'Bay A'],
  ['INVT-2028', 'PET-670-12', 1348.25, 155, 'Inward Dock'],
  ['INVT-0023', 'PET-955-12', 1688.2, 184, 'Bay A'],
  ['INVT-2030', 'PET-955-12', 1535.12, 155, 'Inward Dock']
];

async function schema(db) {
  await db.exec(`
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_code text NOT NULL,
      item_name text NOT NULL,
      stock_qty_kg numeric DEFAULT 0,
      allocated_qty_kg numeric DEFAULT 0,
      unit_price numeric DEFAULT 0,
      location text,
      last_updated timestamptz
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      item_id text,
      item_name text NOT NULL,
      grn_id text,
      invoice_no text,
      net_weight_kg numeric DEFAULT 0,
      available_weight_kg numeric DEFAULT 0,
      status text,
      qc_status text,
      remarks text
    );
    CREATE TABLE public.grns (
      id text PRIMARY KEY,
      grn_number text NOT NULL,
      invoice_number text,
      item_name text,
      received_qty_kg numeric,
      status text,
      qc_remarks text,
      stock_item_id text,
      master_item_id text
    );
    CREATE TABLE public.grn_line_items (
      id text PRIMARY KEY,
      grn_id text NOT NULL,
      line_no integer,
      stock_item_id text,
      master_item_id text,
      net_weight_kg numeric
    );
    CREATE TABLE public.store_issue_transactions (id text PRIMARY KEY, payload jsonb);
    CREATE TABLE public.stock_adjustments (id text PRIMARY KEY, payload jsonb);
    CREATE TABLE public.material_indents (id text PRIMARY KEY, payload jsonb);
    CREATE TABLE public.purchase_orders (id text PRIMARY KEY, items jsonb);
  `);
}

async function seed(db, { postedDuplicateKg = 10 } = {}) {
  for (const [id, name, qty, rate, location] of ITEMS) {
    const stock = id === 'INVT-2036' ? postedDuplicateKg : qty;
    const envelope = JSON.stringify({ availableQtyKg: stock, unitPrice: rate, location });
    await db.query(
      `INSERT INTO public.inventory (id, item_code, item_name, stock_qty_kg, allocated_qty_kg, unit_price, location)
       VALUES ($1, $1, $2, $3, 0, $4, $5)`,
      [id, `${name} ||| ${envelope}`, stock, rate, location]
    );
    await db.query(
      `INSERT INTO public.inventory_rolls (barcode_id, item_id, item_name, net_weight_kg, available_weight_kg, status, qc_status)
       VALUES ($1, $2, $3, 1, 1, 'In Stock', 'Approved')`,
      [`ROLL-${id}`, id, name]
    );
  }
  await db.exec(`
    INSERT INTO public.grns (id, grn_number, invoice_number, received_qty_kg, status, stock_item_id, master_item_id, item_name)
    VALUES
      ('SIL/GRN/25-26/124', 'SIL/GRN/25-26/124', 'K32', 23.4, 'Approved', 'INVT-2032', 'INVT-2032', 'Old film'),
      ('SIL/GRN/26-27/166', 'SIL/GRN/26-27/166', '2526008783', 100, 'Approved', 'INVT-0011', 'INVT-0011', 'PET-670-12'),
      ('SIL/GRN/26-27/170', 'SIL/GRN/26-27/170', '2526008783_', ${postedDuplicateKg}, 'QC Hold', 'INVT-2036', 'INVT-0010', 'PET-650-12'),
      ('SIL/GRN/26-27/171', 'SIL/GRN/26-27/171', '2526008783__', 0, 'Pending QC Approval', 'INVT-2037', 'INVT-2036', 'PET-650-12'),
      ('SIL/GRN/26-27/167', 'SIL/GRN/26-27/167', 'INV-167', 100, 'Approved', 'INVT-2031', 'INVT-0150', 'METBOPP');
    INSERT INTO public.grn_line_items (id, grn_id, line_no, stock_item_id, master_item_id, net_weight_kg)
    VALUES
      ('L124', 'SIL/GRN/25-26/124', 1, 'INVT-2032', 'INVT-2032', 23.4),
      ('L170', 'SIL/GRN/26-27/170', 1, 'INVT-2036', 'INVT-0010', ${postedDuplicateKg}),
      ('L171', 'SIL/GRN/26-27/171', 1, 'INVT-2037', 'INVT-2036', 0),
      ('L167', 'SIL/GRN/26-27/167', 1, 'INVT-2031', 'INVT-0150', 100);
    INSERT INTO public.inventory_rolls (barcode_id, item_id, item_name, grn_id, invoice_no, net_weight_kg, available_weight_kg, status, qc_status)
    VALUES
      ('ROLL-170-A', 'INVT-2036', 'PET-650-12', 'SIL/GRN/26-27/170', '2526008783_', 5, 5, 'QC Hold', 'Rejected'),
      ('ROLL-170-B', 'INVT-2036', 'PET-650-12', 'SIL/GRN/26-27/170', '2526008783_', 5, 5, 'QC Hold', 'Rejected');
    INSERT INTO public.store_issue_transactions (id, payload)
    VALUES ('ISSUE-1', '{"itemId":"INVT-2028","qty":1}'::jsonb);
    INSERT INTO public.stock_adjustments (id, payload)
    VALUES ('ADJ-1', '{"inventoryId":"INVT-2030"}'::jsonb);
    INSERT INTO public.material_indents (id, payload)
    VALUES ('IND-1', '{"lines":[{"stockItemId":"INVT-2033"}]}'::jsonb);
    INSERT INTO public.purchase_orders (id, items)
    VALUES ('PO-1', '[{"itemId":"INVT-2031"}]'::jsonb);
  `);
}

test('the merge script lives outside migrations and rolls back unless committed', () => {
  assert.match(scriptSql, /\nbegin\s*;/i);
  assert.match(scriptSql, /rollback\s*;\s*$/i);
  assert.match(scriptSql, /Section A/);
  assert.match(scriptSql, /INVT-2032/);
  assert.match(scriptSql, /K32/);
  assert.equal(fs.existsSync(new URL('../supabase/migrations/2026-10-30_merge_duplicate_inventory_items.sql', import.meta.url)), false);
});

test('seeded duplicates merge, GRN 170/171 are cancelled, and GRN 124 is left alone', async () => {
  const db = new PGlite();
  await schema(db);
  await seed(db, { postedDuplicateKg: 10 });
  await db.exec(body());

  const rows = await db.query(`SELECT id, stock_qty_kg, unit_price, location, item_name FROM public.inventory ORDER BY id`);
  const byId = Object.fromEntries(rows.rows.map((row) => [row.id, row]));
  assert.equal(byId['INVT-2031'], undefined);
  assert.equal(byId['INVT-2032'], undefined);
  assert.equal(byId['INVT-2036'], undefined);
  assert.equal(Number(byId['INVT-0150'].stock_qty_kg), 177.68);
  assert.equal(Number(byId['INVT-0154'].stock_qty_kg), 3326.68);
  assert.equal(Number(byId['INVT-0156'].stock_qty_kg), 1931.81);
  assert.equal(Number(byId['INVT-0010'].stock_qty_kg), 354.23);
  assert.equal(Number(byId['INVT-0011'].stock_qty_kg), 1403.85);
  assert.equal(Number(byId['INVT-0023'].stock_qty_kg), 3223.32);
  assert.equal(Number(byId['INVT-0150'].unit_price), 205.59);
  assert.equal(Number(byId['INVT-0154'].unit_price), 207.42);
  assert.equal(Number(byId['INVT-0156'].unit_price), 207.49);
  assert.equal(Number(byId['INVT-0010'].unit_price), 184);
  assert.equal(Number(byId['INVT-0011'].unit_price), 156.15);
  assert.equal(Number(byId['INVT-0023'].unit_price), 170.19);
  for (const id of ['INVT-0150', 'INVT-0154', 'INVT-0156', 'INVT-0010', 'INVT-0011', 'INVT-0023']) {
    assert.equal(byId[id].location, 'Bay A');
    assert.match(byId[id].item_name, /"location":\s*"Bay A"/);
  }
  assert.match(byId['INVT-0150'].item_name, /"availableQtyKg":\s*177\.68/);

  const grn124 = await db.query(`SELECT stock_item_id, master_item_id FROM public.grns WHERE id = 'SIL/GRN/25-26/124'`);
  assert.equal(grn124.rows[0].stock_item_id, 'INVT-2032');
  assert.equal(grn124.rows[0].master_item_id, 'INVT-2032');
  const line124 = await db.query(`SELECT stock_item_id FROM public.grn_line_items WHERE id = 'L124'`);
  assert.equal(line124.rows[0].stock_item_id, 'INVT-2032');

  const cancelled = await db.query(`SELECT id, status FROM public.grns WHERE id IN ('SIL/GRN/26-27/170', 'SIL/GRN/26-27/171') ORDER BY id`);
  assert.deepEqual(cancelled.rows.map((row) => row.status), ['Cancelled', 'Cancelled']);
  const kept = await db.query(`SELECT status, stock_item_id FROM public.grns WHERE id = 'SIL/GRN/26-27/166'`);
  assert.equal(kept.rows[0].status, 'Approved');
  assert.equal(kept.rows[0].stock_item_id, 'INVT-0011');

  const moved = await db.query(`SELECT stock_item_id, master_item_id FROM public.grn_line_items WHERE id = 'L167'`);
  assert.equal(moved.rows[0].stock_item_id, 'INVT-0150');
  assert.equal(moved.rows[0].master_item_id, 'INVT-0150');

  const voided = await db.query(`SELECT status, available_weight_kg, item_id FROM public.inventory_rolls WHERE barcode_id LIKE 'ROLL-170%' ORDER BY barcode_id`);
  assert.equal(voided.rows.length, 2);
  assert.equal(voided.rows.every((row) => row.status === 'Void' && Number(row.available_weight_kg) === 0 && row.item_id === 'INVT-0010'), true);

  const issue = await db.query(`SELECT payload::text AS payload FROM public.store_issue_transactions WHERE id = 'ISSUE-1'`);
  assert.match(issue.rows[0].payload, /INVT-0011/);
  assert.doesNotMatch(issue.rows[0].payload, /INVT-2028/);
  const po = await db.query(`SELECT items::text AS items FROM public.purchase_orders WHERE id = 'PO-1'`);
  assert.match(po.rows[0].items, /INVT-0150/);

  const report = await db.query(`SELECT detail FROM script_report WHERE section = 'cancel-grn-170-171'`);
  assert.match(report.rows.map((row) => row.detail).join('\n'), /reversed 10 kg on INVT-2036/);

  const qtyBefore = Number(byId['INVT-0150'].stock_qty_kg);
  await db.exec(body());
  const again = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-0150'`);
  assert.equal(Number(again.rows[0].stock_qty_kg), qtyBefore);
  const stillCancelled = await db.query(`SELECT status FROM public.grns WHERE id = 'SIL/GRN/26-27/170'`);
  assert.equal(stillCancelled.rows[0].status, 'Cancelled');
});
