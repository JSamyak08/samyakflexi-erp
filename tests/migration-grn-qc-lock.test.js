import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const lineItemsSql = fs.readFileSync(
  new URL('../supabase/migrations/20261023120000_grn_line_items.sql', import.meta.url),
  'utf8'
);
const pelletSql = fs.readFileSync(
  new URL('../supabase/migrations/20261023190000_pellet_fuel_grn_and_vehicle.sql', import.meta.url),
  'utf8'
);
const saveSql = fs.readFileSync(
  new URL('../supabase/migrations/20261024013000_save_grn_with_lines.sql', import.meta.url),
  'utf8'
);
const lockSql = fs.readFileSync(
  new URL('../supabase/migrations/20261030140000_grn_lock_after_qc_approval.sql', import.meta.url),
  'utf8'
);

async function schema(db) {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.vendors (id text PRIMARY KEY, name text);
    CREATE TABLE public.grns (
      id text PRIMARY KEY,
      grn_number text,
      vendor_id text REFERENCES public.vendors(id),
      po_number text,
      invoice_number text,
      received_date date,
      item_name text,
      received_qty_kg numeric,
      status text,
      qc_remarks text,
      created_at timestamptz DEFAULT now(),
      metallocene_pct text,
      stock_item_id text,
      master_item_id text
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      item_name text NOT NULL DEFAULT '',
      metadata jsonb
    );
    CREATE TABLE public.pellet_inwards (
      id text PRIMARY KEY,
      grn_no text,
      inward_date date,
      inward_qty_kg numeric DEFAULT 0,
      unit_cost_per_kg numeric DEFAULT 0,
      total_amount numeric DEFAULT 0,
      payload jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text,
      updated_at timestamptz
    );
    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb,
      updated_at timestamptz DEFAULT now()
    );
  `);
}

function payload(overrides = {}) {
  return {
    id: 'SIL/GRN/26-27/160',
    grnNo: 'SIL/GRN/26-27/160',
    vendorId: 'VEND-1',
    vendorName: 'Acme',
    invoiceNo: '2526008783',
    receivedDate: '2026-10-30',
    itemName: 'PET-670-12 ||| {"vendorName":"Acme"}',
    receivedQtyKg: 100,
    status: 'Pending QC Approval',
    stockItemId: 'INVT-0011',
    masterItemId: 'INVT-0011',
    lineItems: [{
      id: 'SIL/GRN/26-27/160-L1',
      lineNo: 1,
      itemName: 'PET-670-12',
      category: 'Film Substrates',
      netWeightKg: 100,
      purchaseRate: 155,
      stockItemId: 'INVT-0011',
      masterItemId: 'INVT-0011',
      rolls: [{ barcodeId: 'RM-BC-1', netWeightKg: 100 }]
    }],
    rolls: [{ barcodeId: 'RM-BC-1', grnLineItemId: 'SIL/GRN/26-27/160-L1', lineNo: 1, unitNo: 1 }],
    ...overrides
  };
}

async function save(db, body) {
  const result = await db.query(
    `SELECT public.save_grn_with_lines($1::jsonb) AS saved`,
    [JSON.stringify(body)]
  );
  const saved = result.rows[0].saved;
  return typeof saved === 'string' ? JSON.parse(saved) : saved;
}

test('a receipt can be edited before QC and is locked after approval', async () => {
  const db = new PGlite();
  await schema(db);
  await db.exec(`
    INSERT INTO public.vendors (id, name) VALUES ('VEND-1', 'Acme');
    INSERT INTO public.inventory_rolls (barcode_id, item_name) VALUES ('RM-BC-1', 'PET');
  `);
  await db.exec(lineItemsSql);
  await db.exec(pelletSql);
  await db.exec(saveSql);
  await db.exec(lockSql);

  await save(db, payload());
  await save(db, payload({
    invoiceNo: '2526008783-REV',
    itemName: 'PET-670-12 ||| {"vendorName":"Acme"}',
    receivedQtyKg: 90,
    lineItems: [{
      id: 'SIL/GRN/26-27/160-L1',
      lineNo: 1,
      itemName: 'PET-670-12',
      netWeightKg: 90,
      stockItemId: 'INVT-0011',
      masterItemId: 'INVT-0011',
      rolls: [{ barcodeId: 'RM-BC-1', netWeightKg: 90 }]
    }]
  }));
  const edited = await db.query(`SELECT invoice_number, received_qty_kg, status FROM public.grns WHERE id = 'SIL/GRN/26-27/160'`);
  assert.equal(edited.rows[0].invoice_number, '2526008783-REV');
  assert.equal(Number(edited.rows[0].received_qty_kg), 90);
  assert.equal(edited.rows[0].status, 'Pending QC Approval');

  await save(db, payload({
    invoiceNo: '2526008783-REV',
    status: 'Approved',
    receivedQtyKg: 90,
    lineItems: [{
      id: 'SIL/GRN/26-27/160-L1',
      lineNo: 1,
      itemName: 'PET-670-12',
      netWeightKg: 90,
      stockItemId: 'INVT-0011',
      masterItemId: 'INVT-0011',
      rolls: []
    }],
    rolls: []
  }));

  await assert.rejects(
    () => save(db, payload({ invoiceNo: '2526008783-REV', status: 'Approved', receivedQtyKg: 1 })),
    /QC-approved/
  );
  await assert.rejects(
    () => db.exec(`UPDATE public.grns SET qc_remarks = 'changed' WHERE id = 'SIL/GRN/26-27/160'`),
    /QC-approved/
  );
  await assert.rejects(
    () => db.exec(`DELETE FROM public.grn_line_items WHERE grn_id = 'SIL/GRN/26-27/160'`),
    /QC-approved/
  );
  await assert.rejects(
    () => db.exec(`DELETE FROM public.grns WHERE id = 'SIL/GRN/26-27/160'`),
    /QC-approved/
  );

  const stock = await db.query(`SELECT to_regclass('public.inventory') AS name`);
  assert.equal(stock.rows[0].name, null);
});

test('underscores do not make a second invoice, and a cancelled invoice can be used again', async () => {
  const db = new PGlite();
  await schema(db);
  await db.exec(`INSERT INTO public.vendors (id, name) VALUES ('VEND-1', 'Acme');`);
  await db.exec(lineItemsSql);
  await db.exec(pelletSql);
  await db.exec(saveSql);
  await db.exec(lockSql);

  await save(db, payload({ id: 'G166', grnNo: 'SIL/GRN/26-27/166', invoiceNo: '2526008783' }));
  await assert.rejects(
    () => save(db, payload({ id: 'G170', grnNo: 'SIL/GRN/26-27/170', invoiceNo: '2526008783_' })),
    /Duplicate Inward GRN/
  );

  await save(db, payload({
    id: 'G9',
    grnNo: 'SIL/GRN/26-27/9',
    invoiceNo: 'INV-9',
    status: 'Cancelled',
    lineItems: [{ id: 'G9-L1', lineNo: 1, itemName: 'PET', netWeightKg: 1, rolls: [] }],
    rolls: []
  }));
  const again = await save(db, payload({
    id: 'G10',
    grnNo: 'SIL/GRN/26-27/10',
    invoiceNo: 'INV-9',
    lineItems: [{ id: 'G10-L1', lineNo: 1, itemName: 'PET', netWeightKg: 1, rolls: [] }],
    rolls: []
  }));
  assert.equal(again.grnNo, 'SIL/GRN/26-27/10');

  await db.exec(`UPDATE public.grns SET status = 'Cancelled', qc_remarks = 'wrong film' WHERE id = 'G10'`);
  const cancelled = await db.query(`SELECT status FROM public.grns WHERE id = 'G10'`);
  assert.equal(cancelled.rows[0].status, 'Cancelled');
});
