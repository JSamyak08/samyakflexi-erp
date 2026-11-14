import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261113230000_balance_roll_parent_details.sql', import.meta.url),
  'utf8'
);
const backfillSql = fs.readFileSync(
  new URL('../supabase/manual/20261113230000_backfill_balance_roll_parent_details.sql', import.meta.url),
  'utf8'
);

test('the migration does not name production and the backfill is not applied by it', () => {
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.doesNotMatch(migrationSql, /UPDATE public\.inventory_rolls/);
  assert.match(migrationSql, /inward_datetime is the split time/i);
  assert.match(backfillSql, /not run/i);
  assert.match(backfillSql, /UPDATE public\.inventory_rolls/);
  assert.match(backfillSql, /balance_receipt/);
});

test('a new -BAL roll and its ledger receipt copy the parent and keep the split time', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_name text NOT NULL,
      unit_price numeric DEFAULT 0,
      last_vendor text,
      last_batch text
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      roll_type text DEFAULT 'RAW_MATERIAL' NOT NULL,
      item_id text,
      item_name text NOT NULL,
      vendor_name text,
      invoice_no text,
      batch_no text,
      film_type text,
      micron numeric,
      width_mm numeric,
      net_weight_kg numeric DEFAULT 0 NOT NULL,
      available_weight_kg numeric DEFAULT 0 NOT NULL,
      inward_datetime timestamptz,
      production_date date,
      grn_id text,
      grn_line_item_id text,
      vendor_roll_no text,
      metadata jsonb DEFAULT '{}'::jsonb
    );
    CREATE TABLE public.inventory_ledger_entries (
      id text PRIMARY KEY,
      entry_kind text NOT NULL,
      barcode text NOT NULL,
      parent_barcode text,
      item_name text,
      vendor_name text,
      batch_no text,
      film_type text,
      micron numeric,
      width_mm numeric,
      purchase_rate numeric,
      grn_no text,
      parent_net_kg numeric,
      parent_inward_at timestamptz,
      qty_kg numeric DEFAULT 0,
      occurred_at timestamptz
    );
  `);
  await db.exec(migrationSql);

  await db.exec(`
    INSERT INTO public.inventory (id, item_name, unit_price, last_vendor, last_batch)
    VALUES ('INVT-PET-750-12', 'PET-750-12', 186, 'Cosmo Films', 'HEAT-197');

    INSERT INTO public.inventory_rolls (
      barcode_id, item_id, item_name, vendor_name, batch_no, invoice_no, film_type,
      micron, width_mm, net_weight_kg, available_weight_kg, inward_datetime, grn_id, metadata
    ) VALUES (
      'RM-PARENT', 'INVT-PET-750-12', 'PET-750-12', 'Cosmo Films', 'HEAT-197', 'INV-197', 'PET',
      12, 750, 210.40, 210.40, '2026-10-21 08:30:00+00', 'GRN-ROW-1',
      '{"grnNo":"SIL/GRN/26-27/197","purchaseRatePerKg":186}'::jsonb
    );
  `);

  await db.exec(`
    INSERT INTO public.inventory_rolls (
      barcode_id, item_name, film_type, net_weight_kg, available_weight_kg, inward_datetime, metadata
    ) VALUES (
      'RM-PARENT-BAL', 'PET roll - Remaining Balance Roll', 'PET', 152.05, 152.05,
      '2026-11-13 17:15:00+00', '{"parentBarcodeId":"RM-PARENT","balanceRoll":true}'::jsonb
    );
  `);

  const roll = (await db.query(`
    SELECT item_name, vendor_name, batch_no, invoice_no, micron, width_mm, item_id,
           net_weight_kg, inward_datetime, metadata
    FROM public.inventory_rolls
    WHERE barcode_id = 'RM-PARENT-BAL'
  `)).rows[0];

  assert.equal(roll.item_name, 'PET-750-12');
  assert.equal(roll.vendor_name, 'Cosmo Films');
  assert.equal(roll.batch_no, 'HEAT-197');
  assert.equal(roll.invoice_no, 'INV-197');
  assert.equal(Number(roll.micron), 12);
  assert.equal(Number(roll.width_mm), 750);
  assert.equal(roll.item_id, 'INVT-PET-750-12');
  assert.equal(Number(roll.net_weight_kg), 152.05);
  assert.equal(new Date(roll.inward_datetime).toISOString(), '2026-11-13T17:15:00.000Z');
  assert.equal(roll.metadata.parentBarcodeId, 'RM-PARENT');
  assert.equal(roll.metadata.grnNo, 'SIL/GRN/26-27/197');
  assert.equal(Number(roll.metadata.parentNetWeightKg), 210.4);
  assert.equal(Number(roll.metadata.purchaseRatePerKg), 186);
  assert.notEqual(roll.metadata.parentInwardDatetime, '2026-11-13T17:15:00+00');

  await db.exec(`
    INSERT INTO public.inventory_ledger_entries (
      id, entry_kind, barcode, parent_barcode, item_name, qty_kg, occurred_at
    ) VALUES (
      'roll-return:1', 'balance_receipt', 'RM-PARENT-BAL', 'RM-PARENT',
      'PET roll - Remaining Balance Roll', 152.05, '2026-11-13 17:15:01+00'
    );
  `);
  const receipt = (await db.query(`
    SELECT item_name, vendor_name, batch_no, purchase_rate, grn_no, parent_net_kg,
           parent_inward_at, micron, width_mm, occurred_at
    FROM public.inventory_ledger_entries
    WHERE id = 'roll-return:1'
  `)).rows[0];
  assert.equal(receipt.item_name, 'PET-750-12');
  assert.equal(receipt.vendor_name, 'Cosmo Films');
  assert.equal(receipt.batch_no, 'HEAT-197');
  assert.equal(Number(receipt.purchase_rate), 186);
  assert.equal(receipt.grn_no, 'SIL/GRN/26-27/197');
  assert.equal(Number(receipt.parent_net_kg), 210.4);
  assert.equal(Number(receipt.micron), 12);
  assert.equal(Number(receipt.width_mm), 750);
  assert.equal(new Date(receipt.occurred_at).toISOString(), '2026-11-13T17:15:01.000Z');
  assert.equal(new Date(receipt.parent_inward_at).toISOString(), '2026-10-21T08:30:00.000Z');

  await db.close();
});
