import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  formatPlantDate,
  formatPlantDateTime,
  inventoryRollDateFields,
  toDatabaseDate,
  toDatabaseTimestamp
} from '../src/utils/dbDates.js';

const LOCALE_STAMP = '26/10/26, 2:43 pm';
const BALANCE_BARCODE = 'RM-BC-20261026-5662HWHQ-BAL';
const SFG_BARCODE = 'SFG-BC-ORD-2026-194-1';

test('the en-IN balance-roll timestamp becomes 26 Oct 2026, 2:43 pm IST', () => {
  assert.equal(toDatabaseTimestamp(LOCALE_STAMP), '2026-10-26T09:13:00.000Z');
  assert.equal(toDatabaseDate(LOCALE_STAMP), '2026-10-26');
  assert.equal(toDatabaseDate('24/10/2026'), '2026-10-24');
  assert.equal(toDatabaseTimestamp('24 Oct 2026, 04:09:48 pm'), '2026-10-24T10:39:48.000Z');
  assert.equal(toDatabaseDate('2026-10-26'), '2026-10-26');
});

test('inventory roll columns never keep a display date', () => {
  const fields = inventoryRollDateFields({
    inwardDatetime: LOCALE_STAMP,
    productionDate: LOCALE_STAMP
  });
  assert.equal(fields.inward_datetime, '2026-10-26T09:13:00.000Z');
  assert.equal(fields.production_date, '2026-10-26');
  assert.doesNotMatch(fields.inward_datetime, /pm|\/10\//i);
  assert.doesNotMatch(fields.production_date, /pm|\//i);

  const iso = inventoryRollDateFields({
    inwardDatetime: '2026-10-26T09:17:09.996Z'
  });
  assert.equal(iso.inward_datetime, '2026-10-26T09:17:09.996Z');
  assert.equal(iso.production_date, '2026-10-26');
});

test('display formatting is applied to ISO values and leaves stored display text alone', () => {
  assert.equal(formatPlantDate('24/10/2026'), '24/10/2026');
  assert.equal(formatPlantDate('2026-10-24'), '24/10/2026');
  assert.equal(formatPlantDateTime('24 Oct 2026, 04:09:48 pm'), '24 Oct 2026, 04:09:48 pm');
  assert.match(formatPlantDateTime('2026-10-26T09:13:00.000Z'), /26 Oct 2026/i);
  assert.match(formatPlantDateTime('2026-10-26T09:13:00.000Z'), /2:43/i);
  assert.equal(formatPlantDateTime('2026-10-26'), '26 Oct 2026');
});

test('the End Job balance roll is built with an ISO timestamp', () => {
  const source = fs.readFileSync(new URL('../src/components/ProductionScheduler.jsx', import.meta.url), 'utf8');
  const start = source.lastIndexOf('if (balW > 0)');
  const end = source.indexOf('createdBalanceRolls.push');
  assert.ok(start > 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /toISOString\(\)/);
  assert.doesNotMatch(block, /toLocaleString|toLocaleDateString/);
  assert.match(block, /\$\{inRoll\.barcodeId\}-BAL/);
});

test('retrying End Job upserts the same barcodes and does not create a second roll', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE inventory_rolls (
      barcode_id text PRIMARY KEY,
      item_name text,
      inward_datetime timestamptz,
      production_date date,
      net_weight_kg numeric
    );
  `);

  async function upsertRoll(roll) {
    const dates = inventoryRollDateFields(roll, new Date('2026-10-26T09:17:09.996Z'));
    await db.query(
      `INSERT INTO inventory_rolls (barcode_id, item_name, inward_datetime, production_date, net_weight_kg)
       VALUES ($1, $2, $3::timestamptz, $4::date, $5)
       ON CONFLICT (barcode_id) DO UPDATE SET
         item_name = EXCLUDED.item_name,
         inward_datetime = EXCLUDED.inward_datetime,
         production_date = EXCLUDED.production_date,
         net_weight_kg = EXCLUDED.net_weight_kg`,
      [roll.barcodeId, roll.itemName, dates.inward_datetime, dates.production_date, roll.netWeightKg]
    );
  }

  await assert.rejects(
    () => db.query(
      `INSERT INTO inventory_rolls (barcode_id, item_name, inward_datetime, production_date, net_weight_kg)
       VALUES ($1, $2, $3::timestamptz, $4::date, $5)`,
      [BALANCE_BARCODE, 'remaining', LOCALE_STAMP, LOCALE_STAMP, 3.9]
    ),
    (error) => {
      assert.match(String(error.message), /out of range|invalid input syntax/i);
      return true;
    }
  );

  const sfg = {
    barcodeId: SFG_BARCODE,
    itemName: 'Nyra Original Outer - Printed SFG Roll 1',
    inwardDatetime: '2026-10-26T09:17:09.996Z',
    productionDate: '2026-10-26',
    netWeightKg: 254.7
  };
  await upsertRoll(sfg);

  const balance = {
    barcodeId: BALANCE_BARCODE,
    itemName: 'MATTEBOPP remaining balance',
    inwardDatetime: LOCALE_STAMP,
    netWeightKg: 3.9
  };
  await upsertRoll(balance);
  await upsertRoll(sfg);
  await upsertRoll(balance);

  const rows = await db.query(
    `SELECT barcode_id, inward_datetime, production_date::text AS production_date, net_weight_kg::float AS net_weight_kg
     FROM inventory_rolls ORDER BY barcode_id`
  );
  assert.equal(rows.rows.length, 2);
  const savedBalance = rows.rows.find((row) => row.barcode_id === BALANCE_BARCODE);
  const savedSfg = rows.rows.find((row) => row.barcode_id === SFG_BARCODE);
  assert.equal(savedBalance.production_date, '2026-10-26');
  assert.equal(savedBalance.net_weight_kg, 3.9);
  assert.equal(new Date(savedBalance.inward_datetime).toISOString(), '2026-10-26T09:13:00.000Z');
  assert.equal(savedSfg.net_weight_kg, 254.7);
  assert.equal(rows.rows.filter((row) => row.barcode_id === SFG_BARCODE).length, 1);
});
