import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const priorMigration = fs.readFileSync(
  new URL('../supabase/migrations/20261105120000_delete_inward_qc_inspection.sql', import.meta.url),
  'utf8'
);
const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261111140000_qc_approval_posts_inventory.sql', import.meta.url),
  'utf8'
);
const serviceSql = fs.readFileSync(
  new URL('../src/services/supabaseDataService.js', import.meta.url),
  'utf8'
);
const inventoryUi = fs.readFileSync(
  new URL('../src/components/InventoryManagement.jsx', import.meta.url),
  'utf8'
);

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
    CREATE SCHEMA IF NOT EXISTS private;

    CREATE TABLE public.vendors (
      id text PRIMARY KEY,
      name text
    );
    CREATE TABLE public.grns (
      id text PRIMARY KEY,
      grn_number text,
      vendor_id text,
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
    CREATE TABLE public.grn_line_items (
      id text PRIMARY KEY,
      grn_id text,
      line_no integer,
      po_line_id text,
      category text,
      item_name text,
      film_type text,
      micron numeric,
      width_mm numeric,
      metallocene_pct text,
      unit text,
      stock_item_id text,
      master_item_id text,
      purchase_rate numeric,
      batch_no text,
      packaging_type text,
      rolls_received integer,
      gross_weight_kg numeric,
      tare_weight_kg numeric,
      net_weight_kg numeric,
      invoice_qty_kg numeric,
      remarks text,
      rolls jsonb DEFAULT '[]'::jsonb
    );
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_name text,
      stock_qty_kg numeric DEFAULT 0,
      unit_price numeric,
      last_batch text,
      last_vendor text,
      last_updated timestamptz,
      metadata jsonb DEFAULT '{}'::jsonb
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      item_id text,
      item_name text NOT NULL DEFAULT '',
      grn_id text,
      grn_line_item_id text,
      line_no integer,
      vendor_roll_no text,
      unit_no integer,
      status text,
      qc_status text,
      location_bay text,
      batch_no text,
      film_type text,
      micron numeric,
      width_mm numeric,
      available_weight_kg numeric DEFAULT 0,
      net_weight_kg numeric DEFAULT 0,
      gross_weight_kg numeric DEFAULT 0,
      tare_weight_kg numeric DEFAULT 0,
      length_meters numeric,
      metadata jsonb DEFAULT '{}'::jsonb
    );

    CREATE OR REPLACE FUNCTION public._grn_to_numeric(raw text)
    RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE AS $$
    BEGIN
      IF raw IS NULL OR btrim(raw) = '' THEN RETURN NULL; END IF;
      RETURN btrim(raw)::numeric;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
    $$;

    CREATE OR REPLACE FUNCTION public._grn_unpack_item_name(raw text)
    RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE
      marker integer;
      payload text;
      parsed jsonb;
    BEGIN
      marker := position('|||' IN coalesce(raw, ''));
      IF marker = 0 THEN
        RETURN jsonb_build_object('itemName', btrim(coalesce(raw, '')), 'meta', '{}'::jsonb);
      END IF;
      payload := btrim(substring(raw FROM marker + 3));
      BEGIN
        parsed := payload::jsonb;
      EXCEPTION WHEN others THEN
        parsed := '{}'::jsonb;
      END;
      IF jsonb_typeof(parsed) IS DISTINCT FROM 'object' THEN
        parsed := '{}'::jsonb;
      END IF;
      RETURN jsonb_build_object(
        'itemName', btrim(substring(raw FROM 1 FOR marker - 1)),
        'meta', parsed
      );
    END;
    $$;
  `);
  await db.exec(priorMigration);
  await db.exec(migrationSql);
  await db.exec(`
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON FUNCTION public.save_grn_with_lines(jsonb) TO authenticated;
  `);
  await db.query(
    `INSERT INTO public.inventory (id, item_name, stock_qty_kg, metadata)
     VALUES ('INVT-0007', 'PET-610-12', 10, '{}'::jsonb),
            ('INVT-0010', 'PET-650-12', 20, '{}'::jsonb)`
  );
  return db;
}

function receipt(status, extra = {}) {
  return {
    id: 'SIL/GRN/26-27/900',
    grnNo: 'SIL/GRN/26-27/900',
    vendorName: 'Manish packaging',
    invoiceNo: 'GST/26-27/900',
    status,
    qcRemarks: status === 'Approved' ? 'Inspected and passed all laboratory parameters.' : 'Held',
    postStockOnApproval: true,
    receivedQtyKg: 353.63,
    itemName: 'PET-610-12 + 1 more',
    stockItemId: 'INVT-0007',
    masterItemId: 'INVT-0007',
    lineItems: [
      {
        id: 'SIL/GRN/26-27/900-L1',
        lineNo: 1,
        category: 'Film Substrates',
        itemName: 'PET-610-12',
        filmType: 'PET',
        micron: 12,
        widthMm: 610,
        stockItemId: 'INVT-0007',
        masterItemId: 'INVT-0007',
        purchaseRate: 146,
        batchNo: 'GST/26-27/900',
        netWeightKg: 100,
        rolls: [{ barcodeId: 'RM-BC-SIL/GRN/26-27/900-L1-R1', netWeightKg: 100, grossWeightKg: 103, tareWeightKg: 3, lengthMeters: 1000 }]
      },
      {
        id: 'SIL/GRN/26-27/900-L2',
        lineNo: 2,
        category: 'Film Substrates',
        itemName: 'PET-650-12',
        filmType: 'PET',
        micron: 12,
        widthMm: 650,
        stockItemId: 'INVT-0010',
        masterItemId: 'INVT-0010',
        purchaseRate: 146,
        batchNo: 'GST/26-27/900',
        netWeightKg: 253.63,
        rolls: [{ barcodeId: 'RM-BC-SIL/GRN/26-27/900-L2-R2', netWeightKg: 253.63, grossWeightKg: 256.9, tareWeightKg: 3.27, lengthMeters: 23326 }]
      }
    ],
    ...extra
  };
}

async function stagePending(db) {
  await db.query(
    `INSERT INTO public.grns (id, grn_number, invoice_number, item_name, received_qty_kg, status, stock_item_id)
     VALUES ('SIL/GRN/26-27/900', 'SIL/GRN/26-27/900', 'GST/26-27/900', 'PET-610-12', 353.63, 'Pending QC Approval', 'INVT-0007')`
  );
  await db.query(
    `INSERT INTO public.inventory_rolls (barcode_id, item_id, item_name, grn_id, status, qc_status, net_weight_kg, available_weight_kg)
     VALUES
       ('RM-BC-SIL/GRN/26-27/900-L1-R1', 'INVT-0007', 'PET-610-12', 'SIL/GRN/26-27/900', 'Pending QC', 'Pending QC', 100, 100),
       ('RM-BC-SIL/GRN/26-27/900-L2-R2', 'INVT-0010', 'PET-650-12', 'SIL/GRN/26-27/900', 'Pending QC', 'Pending QC', 253.63, 253.63)`
  );
}

async function save(db, body) {
  const result = await db.query(
    `SELECT public.save_grn_with_lines($1::jsonb) AS payload`,
    [JSON.stringify(body)]
  );
  return result.rows[0].payload;
}

async function stock(db, id) {
  const result = await db.query(`SELECT stock_qty_kg, last_batch FROM public.inventory WHERE id = $1`, [id]);
  return result.rows[0];
}

test('the client asks the database to post stock and does not add it a second time', () => {
  assert.match(migrationSql, /postStockOnApproval/);
  assert.match(migrationSql, /grn_qc_stock_posts/);
  assert.match(migrationSql, /QC Hold Store/);
  assert.match(serviceSql, /postStockOnApproval:\s*true/);
  assert.match(inventoryUi, /stockPosted !== true/);
  assert.match(inventoryUi, /grnInwardLedgerEntries/);
});

test('approving a multi-line GRN posts every line once, under the same inward barcodes', async () => {
  const db = await database();
  await stagePending(db);
  const payload = await save(db, receipt('Approved'));
  assert.equal(payload.stockPosted, true);
  assert.equal(payload.posts.length, 2);

  const narrow = await stock(db, 'INVT-0007');
  const wide = await stock(db, 'INVT-0010');
  assert.equal(Number(narrow.stock_qty_kg), 110);
  assert.equal(Number(wide.stock_qty_kg), 273.63);
  assert.equal(wide.last_batch, 'GST/26-27/900');

  const rolls = await db.query(
    `SELECT barcode_id, status, qc_status, item_id, available_weight_kg, location_bay
     FROM public.inventory_rolls ORDER BY barcode_id`
  );
  assert.deepEqual(rolls.rows.map((row) => row.barcode_id), [
    'RM-BC-SIL/GRN/26-27/900-L1-R1',
    'RM-BC-SIL/GRN/26-27/900-L2-R2'
  ]);
  for (const roll of rolls.rows) {
    assert.equal(roll.status, 'In Stock');
    assert.equal(roll.qc_status, 'Approved');
    assert.equal(roll.location_bay, 'Bay A');
  }
  assert.equal(rolls.rows[1].item_id, 'INVT-0010');
  assert.equal(Number(rolls.rows[1].available_weight_kg), 253.63);

  const posts = await db.query(`SELECT count(*)::int AS n FROM public.grn_qc_stock_posts`);
  assert.equal(posts.rows[0].n, 2);

  await assert.rejects(
    () => save(db, receipt('Approved')),
    /QC-approved and cannot be edited/
  );
  const again = await stock(db, 'INVT-0010');
  assert.equal(Number(again.stock_qty_kg), 273.63);
  await db.close();
});

test('QC hold and a missing stock item do not add usable stock', async () => {
  const db = await database();
  await stagePending(db);
  const held = await save(db, receipt('QC Hold'));
  assert.equal(held.stockPosted, true);
  assert.equal(held.posts.length, 0);
  assert.equal(Number((await stock(db, 'INVT-0010')).stock_qty_kg), 20);
  assert.equal(Number((await stock(db, 'INVT-0007')).stock_qty_kg), 10);
  const heldRoll = await db.query(
    `SELECT status, qc_status, location_bay FROM public.inventory_rolls WHERE barcode_id = 'RM-BC-SIL/GRN/26-27/900-L2-R2'`
  );
  assert.equal(heldRoll.rows[0].status, 'QC Hold');
  assert.equal(heldRoll.rows[0].qc_status, 'Rejected');
  assert.equal(heldRoll.rows[0].location_bay, 'QC Hold Store');
  const posts = await db.query(`SELECT count(*)::int AS n FROM public.grn_qc_stock_posts`);
  assert.equal(posts.rows[0].n, 0);

  await db.query(
    `INSERT INTO public.grns (id, grn_number, invoice_number, item_name, received_qty_kg, status)
     VALUES ('SIL/GRN/26-27/901', 'SIL/GRN/26-27/901', 'GST/26-27/901', 'Mystery film', 40, 'Pending QC Approval')`
  );
  await assert.rejects(
    () => save(db, {
      id: 'SIL/GRN/26-27/901',
      grnNo: 'SIL/GRN/26-27/901',
      vendorName: 'Other supplier',
      invoiceNo: 'GST/26-27/901',
      status: 'Approved',
      postStockOnApproval: true,
      receivedQtyKg: 40,
      itemName: 'Mystery film',
      lineItems: [{
        id: 'SIL/GRN/26-27/901-L1',
        lineNo: 1,
        category: 'Film Substrates',
        itemName: 'Mystery film',
        stockItemId: 'INVT-MISSING',
        netWeightKg: 40,
        rolls: [{ barcodeId: 'RM-BC-SIL/GRN/26-27/901-L1-R1', netWeightKg: 40 }]
      }]
    }),
    /no inventory item matches/
  );
  const stillPending = await db.query(`SELECT status FROM public.grns WHERE id = 'SIL/GRN/26-27/901'`);
  assert.equal(stillPending.rows[0].status, 'Pending QC Approval');
  assert.equal(Number((await stock(db, 'INVT-0010')).stock_qty_kg), 20);
  await db.close();
});

test('an older client that does not ask for a server post is not posted twice, and the dry-run does not add stock', async () => {
  const db = await database();
  await stagePending(db);
  const quiet = await save(db, receipt('Approved', { postStockOnApproval: false }));
  assert.equal(quiet.stockPosted, false);
  assert.equal(Number((await stock(db, 'INVT-0010')).stock_qty_kg), 20);
  const stillPendingRoll = await db.query(
    `SELECT status FROM public.inventory_rolls WHERE barcode_id = 'RM-BC-SIL/GRN/26-27/900-L2-R2'`
  );
  assert.equal(stillPendingRoll.rows[0].status, 'Pending QC');

  await db.query(
    `UPDATE public.inventory_rolls
     SET status = 'In Stock', qc_status = 'Approved', item_id = 'INVT-0010', available_weight_kg = 253.63
     WHERE barcode_id = 'RM-BC-SIL/GRN/26-27/900-L2-R2'`
  );
  await db.query(`UPDATE public.inventory SET stock_qty_kg = 0 WHERE id = 'INVT-0010'`);
  const preview = await db.query(
    `SELECT line_id, recommend_kg, reason FROM public.preview_unposted_qc_stock() WHERE grn_id = 'SIL/GRN/26-27/900' ORDER BY line_no`
  );
  const wide = preview.rows.find((row) => row.line_id === 'SIL/GRN/26-27/900-L2');
  assert.equal(Number(wide.recommend_kg), 253.63);
  assert.match(wide.reason, /may add it once/);
  assert.equal(Number((await stock(db, 'INVT-0010')).stock_qty_kg), 0);

  await db.query(`UPDATE public.inventory SET stock_qty_kg = 273.63 WHERE id = 'INVT-0010'`);
  const covered = await db.query(
    `SELECT recommend_kg, reason FROM public.preview_unposted_qc_stock() WHERE line_id = 'SIL/GRN/26-27/900-L2'`
  );
  assert.equal(Number(covered.rows[0].recommend_kg), 0);
  assert.match(covered.rows[0].reason, /Do not add/);
  await db.close();
});
