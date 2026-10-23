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
    id: 'SIL/GRN/26-27/300',
    grnNo: 'SIL/GRN/26-27/300',
    grnPrefix: 'SIL/GRN/26-27/',
    vendorId: 'VEND-1',
    vendorName: 'Acme',
    poNumber: 'PO-1',
    invoiceNo: 'INV-300',
    receivedDate: '2026-10-24',
    itemName: 'PET 12 x 1000 ||| {"vendorName":"Acme","batchNo":"B1"}',
    receivedQtyKg: 100,
    status: 'Pending QC Approval',
    qcRemarks: '',
    metallocenePct: '',
    stockItemId: 'LOT-1',
    masterItemId: 'LOT-1',
    lineItems: [{
      id: 'SIL/GRN/26-27/300-L1',
      lineNo: 1,
      category: 'Film Substrates',
      itemName: 'PET 12 x 1000',
      filmType: 'PET',
      micron: 12,
      widthMm: 1000,
      purchaseRate: 100,
      batchNo: 'B1',
      netWeightKg: 100,
      grossWeightKg: 110,
      tareWeightKg: 10,
      rollsReceived: 1,
      stockItemId: 'LOT-1',
      masterItemId: 'LOT-1',
      rolls: [{ unitNo: 1, barcodeId: 'RM-BC-1', netWeightKg: 100, vendorRollNo: 'VR-1' }]
    }],
    rolls: [{ barcodeId: 'RM-BC-1', grnLineItemId: 'SIL/GRN/26-27/300-L1', lineNo: 1, vendorRollNo: 'VR-1', unitNo: 1 }],
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

test('multi-line save is idempotent and a single line matches the header', async () => {
  const db = new PGlite();
  await schema(db);
  await db.exec(`
    INSERT INTO public.vendors (id, name) VALUES ('VEND-1', 'Acme'), ('VEND-2', 'Other Mills');
    INSERT INTO public.grns (id, grn_number, item_name, received_qty_kg, status)
    VALUES ('OLD-1', 'SIL/GRN/26-27/1', 'Old film', 23, 'Approved');
    INSERT INTO public.inventory_rolls (barcode_id, item_name) VALUES ('RM-BC-1', 'PET');
  `);
  await db.exec(lineItemsSql);
  await db.exec(pelletSql);
  await db.exec(saveSql);
  await db.exec(saveSql);

  const oldBefore = await db.query(`SELECT item_name, received_qty_kg FROM public.grns WHERE id = 'OLD-1'`);
  const oldLinesBefore = await db.query(`SELECT count(*)::int AS n FROM public.grn_line_items WHERE grn_id = 'OLD-1'`);

  const first = await save(db, payload());
  assert.equal(first.grnNo, 'SIL/GRN/26-27/300');
  assert.equal(first.lineCount, 1);
  await save(db, payload());
  const single = await db.query(`
    SELECT item_name, received_qty_kg, stock_item_id
    FROM public.grns WHERE id = 'SIL/GRN/26-27/300'
  `);
  assert.equal(single.rows[0].item_name, 'PET 12 x 1000 ||| {"vendorName":"Acme","batchNo":"B1"}');
  assert.equal(Number(single.rows[0].received_qty_kg), 100);
  assert.equal(single.rows[0].stock_item_id, 'LOT-1');
  const singleLines = await db.query(`SELECT id, net_weight_kg FROM public.grn_line_items WHERE grn_id = 'SIL/GRN/26-27/300'`);
  assert.equal(singleLines.rows.length, 1);
  assert.equal(singleLines.rows[0].id, 'SIL/GRN/26-27/300-L1');
  assert.equal(Number(singleLines.rows[0].net_weight_kg), 100);
  const linked = await db.query(`SELECT grn_id, grn_line_item_id, vendor_roll_no FROM public.inventory_rolls WHERE barcode_id = 'RM-BC-1'`);
  assert.equal(linked.rows[0].grn_id, 'SIL/GRN/26-27/300');
  assert.equal(linked.rows[0].grn_line_item_id, 'SIL/GRN/26-27/300-L1');
  assert.equal(linked.rows[0].vendor_roll_no, 'VR-1');

  const multiBody = payload({
    id: 'SIL/GRN/26-27/301',
    grnNo: 'SIL/GRN/26-27/301',
    invoiceNo: 'INV-301',
    itemName: 'PET 12 x 1000 + 1 more ||| {"vendorName":"Acme","lineCount":2}',
    receivedQtyKg: 140,
    stockItemId: 'LOT-A',
    masterItemId: 'LOT-A',
    lineItems: [
      {
        id: 'SIL/GRN/26-27/301-L1', lineNo: 1, itemName: 'PET 12 x 1000', filmType: 'PET',
        micron: 12, widthMm: 1000, purchaseRate: 100, netWeightKg: 100, stockItemId: 'LOT-A',
        rolls: [{ barcodeId: 'R-A', netWeightKg: 100 }]
      },
      {
        id: 'SIL/GRN/26-27/301-L2', lineNo: 2, category: 'Chemicals & Solvents', itemName: 'Solvent',
        purchaseRate: 50, netWeightKg: 40, stockItemId: 'LOT-B',
        rolls: [{ barcodeId: 'R-B', netWeightKg: 40 }]
      }
    ],
    rolls: []
  });
  const multi = await save(db, multiBody);
  assert.equal(multi.lineCount, 2);
  await save(db, multiBody);
  const multiHeader = await db.query(`SELECT received_qty_kg, item_name FROM public.grns WHERE id = 'SIL/GRN/26-27/301'`);
  assert.equal(Number(multiHeader.rows[0].received_qty_kg), 140);
  assert.match(multiHeader.rows[0].item_name, /PET 12 x 1000 \+ 1 more/);
  const multiLines = await db.query(`SELECT id, item_name, net_weight_kg FROM public.grn_line_items WHERE grn_id = 'SIL/GRN/26-27/301' ORDER BY line_no`);
  assert.equal(multiLines.rows.length, 2);
  assert.equal(multiLines.rows[1].item_name, 'Solvent');
  assert.equal(Number(multiLines.rows[1].net_weight_kg), 40);

  await assert.rejects(
    () => save(db, payload({ id: 'SIL/GRN/26-27/399', grnNo: 'SIL/GRN/26-27/399' })),
    /Duplicate Inward GRN/
  );
  const otherVendor = await save(db, payload({
    id: 'SIL/GRN/26-27/302',
    grnNo: 'SIL/GRN/26-27/302',
    vendorId: 'VEND-2',
    vendorName: 'Other Mills',
    invoiceNo: 'INV-300',
    itemName: 'PET ||| {"vendorName":"Other Mills"}',
    lineItems: [{
      id: 'SIL/GRN/26-27/302-L1', lineNo: 1, itemName: 'PET', netWeightKg: 10, rolls: []
    }],
    rolls: []
  }));
  assert.equal(otherVendor.lineCount, 1);

  const allocated = await save(db, payload({
    id: '',
    grnNo: '',
    invoiceNo: 'INV-NEW',
    itemName: 'Allocated ||| {"vendorName":"Acme"}',
    lineItems: [{ id: '', lineNo: 1, itemName: 'Allocated', netWeightKg: 5, rolls: [] }],
    rolls: []
  }));
  assert.match(allocated.grnNo, /^SIL\/GRN\/26-27\/\d+$/);
  const allocatedLines = await db.query(
    `SELECT count(*)::int AS n FROM public.grn_line_items WHERE grn_id = $1`,
    [allocated.id]
  );
  assert.equal(allocatedLines.rows[0].n, 1);

  const pellet = await db.query(
    `SELECT public.save_pellet_inward_with_grn($1::jsonb) AS saved`,
    [JSON.stringify({
      id: 'PEL-1',
      grnNo: 'SIL/GRN/26-27/104',
      inwardDate: '2026-10-24',
      vendorId: 'VEND-1',
      vendorName: 'Acme',
      invoiceNo: 'PEL-INV',
      inwardQtyKg: 1000,
      unitCostPerKg: 18.5,
      storageLocation: 'Silo 2',
      receivedBy: 'Asha Rao',
      vehicleNo: 'MH12AB1234',
      companionGrn: {
        stockItemId: 'INV-PEL',
        itemName: 'Wood Pellets',
        receivedQtyKg: 1000,
        status: 'Pending QC',
        qcNotes: '',
        poNumber: ''
      }
    })]
  );
  const pelletSaved = typeof pellet.rows[0].saved === 'string' ? JSON.parse(pellet.rows[0].saved) : pellet.rows[0].saved;
  assert.equal(pelletSaved.grn.grnNo, 'SIL/GRN/26-27/104');
  const pelletLine = await db.query(`SELECT id, item_name, net_weight_kg FROM public.grn_line_items WHERE grn_id = 'PEL-1'`);
  assert.equal(pelletLine.rows.length, 1);
  assert.equal(pelletLine.rows[0].id, 'PEL-1-L1');
  assert.equal(pelletLine.rows[0].item_name, 'Wood Pellets');
  assert.equal(Number(pelletLine.rows[0].net_weight_kg), 1000);
  const pelletHeader = await db.query(`SELECT item_name, received_qty_kg FROM public.grns WHERE id = 'PEL-1'`);
  assert.equal(pelletHeader.rows[0].item_name, 'Wood Pellets');
  assert.equal(Number(pelletHeader.rows[0].received_qty_kg), 1000);

  const oldAfter = await db.query(`SELECT item_name, received_qty_kg FROM public.grns WHERE id = 'OLD-1'`);
  const oldLinesAfter = await db.query(`SELECT count(*)::int AS n FROM public.grn_line_items WHERE grn_id = 'OLD-1'`);
  assert.deepEqual(oldAfter.rows, oldBefore.rows);
  assert.equal(oldLinesAfter.rows[0].n, oldLinesBefore.rows[0].n);
  assert.equal(oldLinesAfter.rows[0].n, 1);

  await db.close();
});
