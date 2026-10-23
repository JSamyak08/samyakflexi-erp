import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261023120000_grn_line_items.sql', import.meta.url),
  'utf8'
);

const packedMeta = {
  category: 'Film Substrates',
  stockItemId: 'INV-100',
  masterItemId: 'INV-MASTER',
  filmType: 'PET',
  micron: 12,
  widthMm: 1000,
  metallocenePct: '',
  rollsReceived: 2,
  purchaseRatePerKg: 145.5,
  unit: 'Kg',
  batchNo: 'BATCH-PET-991',
  packagingType: 'Roll',
  grossWeightKg: 520,
  tareWeightKg: 20,
  itemRemarks: 'Good condition',
  itemsBreakdown: [
    { unitNo: 1, barcodeId: 'RM-BC-1', grossWeightKg: 260, tareWeightKg: 10, netWeightKg: 250, lengthMeters: 4000, vendorRollNo: 'VR-01', itemRemarks: 'A' },
    { unitNo: 2, barcodeId: 'RM-BC-2', grossWeightKg: 260, tareWeightKg: 10, netWeightKg: 250, lengthMeters: 4000, vendorRollNo: 'VR-02', notes: 'B' }
  ]
};

const packedName = `PET 12µ x 1000mm ||| ${JSON.stringify(packedMeta)}`;

async function baseSchema(db) {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.grns (
      id text PRIMARY KEY,
      grn_number text,
      item_name text,
      received_qty_kg numeric,
      metallocene_pct text,
      stock_item_id text,
      master_item_id text,
      status text,
      created_at timestamptz
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      item_name text NOT NULL DEFAULT '',
      metadata jsonb
    );
  `);
}

test('backfill creates one line per GRN and does not rewrite the header', async () => {
  const db = new PGlite();
  await baseSchema(db);
  await db.exec(`
    INSERT INTO public.grns (id, grn_number, item_name, received_qty_kg, stock_item_id, master_item_id, status, created_at)
    VALUES
      ('GRN-1', 'GRN-1', '${packedName.replace(/'/g, "''")}', 500, 'HEADER-STOCK', 'HEADER-MASTER', 'Pending QC Approval', '2026-10-01T00:00:00Z'),
      ('GRN-2', 'GRN-DOC-2', 'Plain solvent', 40, NULL, NULL, 'Approved', '2026-10-02T00:00:00Z'),
      ('GRN-3', 'GRN-3', 'Broken name ||| not-json', 15, NULL, NULL, 'Pending QC Approval', '2026-10-03T00:00:00Z');
    INSERT INTO public.inventory_rolls (barcode_id, item_name, metadata) VALUES
      ('RM-BC-1', 'PET', '{"grnNo":"GRN-1"}'::jsonb),
      ('RM-BC-9', 'PET', '{"grnNo":"GRN-DOC-2"}'::jsonb),
      ('RM-BC-X', 'Orphan', '{"grnNo":"MISSING"}'::jsonb),
      ('RM-BC-KEEP', 'Kept', '{"grnNo":"GRN-1"}'::jsonb);
  `);

  await db.exec(migrationSql);

  const beforeSecond = await db.query(`SELECT item_name, received_qty_kg FROM public.grns ORDER BY id`);
  await db.exec(`
    UPDATE public.inventory_rolls
    SET metadata = '{"grnNo":"GRN-2"}'::jsonb
    WHERE barcode_id = 'RM-BC-KEEP'
  `);
  await db.exec(migrationSql);
  const afterSecond = await db.query(`SELECT item_name, received_qty_kg FROM public.grns ORDER BY id`);
  assert.deepEqual(afterSecond.rows, beforeSecond.rows);
  assert.equal(afterSecond.rows[0].item_name, packedName);
  assert.equal(Number(afterSecond.rows[0].received_qty_kg), 500);
  assert.equal(afterSecond.rows[1].item_name, 'Plain solvent');

  const lines = await db.query(`
    SELECT id, grn_id, line_no, item_name, film_type, micron, width_mm, purchase_rate,
           batch_no, rolls_received, net_weight_kg, gross_weight_kg, invoice_qty_kg,
           stock_item_id, master_item_id, remarks, rolls
    FROM public.grn_line_items
    ORDER BY grn_id
  `);
  assert.equal(lines.rows.length, 3);

  const pet = lines.rows.find((row) => row.grn_id === 'GRN-1');
  assert.equal(pet.id, 'GRN-1-L1');
  assert.equal(pet.line_no, 1);
  assert.equal(pet.item_name, 'PET 12µ x 1000mm');
  assert.equal(pet.film_type, 'PET');
  assert.equal(Number(pet.micron), 12);
  assert.equal(Number(pet.width_mm), 1000);
  assert.equal(Number(pet.purchase_rate), 145.5);
  assert.equal(pet.batch_no, 'BATCH-PET-991');
  assert.equal(pet.rolls_received, 2);
  assert.equal(Number(pet.net_weight_kg), 500);
  assert.equal(Number(pet.gross_weight_kg), 520);
  assert.equal(pet.invoice_qty_kg, null);
  assert.equal(pet.stock_item_id, 'INV-100');
  assert.equal(pet.master_item_id, 'INV-MASTER');
  assert.equal(pet.remarks, 'Good condition');
  assert.equal(pet.rolls.length, 2);
  assert.equal(pet.rolls[0].vendorRollNo, 'VR-01');
  assert.equal(pet.rolls[1].itemRemarks, 'B');
  assert.equal(Number(pet.rolls[0].netWeightKg), 250);

  const plain = lines.rows.find((row) => row.grn_id === 'GRN-2');
  assert.equal(plain.item_name, 'Plain solvent');
  assert.equal(plain.rolls.length, 1);
  assert.equal(Number(plain.rolls[0].netWeightKg), 40);
  assert.equal(Number(plain.net_weight_kg), 40);

  const broken = lines.rows.find((row) => row.grn_id === 'GRN-3');
  assert.equal(broken.item_name, 'Broken name');
  assert.equal(broken.rolls.length, 1);
  assert.equal(Number(broken.net_weight_kg), 15);

  const rolls = await db.query(`
    SELECT barcode_id, grn_id, grn_line_item_id
    FROM public.inventory_rolls
    ORDER BY barcode_id
  `);
  const byBarcode = Object.fromEntries(rolls.rows.map((row) => [row.barcode_id, row]));
  assert.equal(byBarcode['RM-BC-1'].grn_id, 'GRN-1');
  assert.equal(byBarcode['RM-BC-1'].grn_line_item_id, null);
  assert.equal(byBarcode['RM-BC-9'].grn_id, 'GRN-2');
  assert.equal(byBarcode['RM-BC-X'].grn_id, null);
  assert.equal(byBarcode['RM-BC-KEEP'].grn_id, 'GRN-1');

  const policies = await db.query(`
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'grn_line_items'
  `);
  assert.equal(policies.rows.length, 1);
  assert.equal(policies.rows[0].policyname, 'Allow anon and auth full access');

  const grants = await db.query(`
    SELECT has_table_privilege('authenticated', 'public.grn_line_items', 'SELECT') AS can_select
  `);
  assert.equal(grants.rows[0].can_select, true);

  await db.close();
});
