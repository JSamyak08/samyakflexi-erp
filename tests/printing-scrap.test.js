import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAIN_SETTING_TYPE,
  PRINTING_SCRAP_SOURCE,
  PRINTING_WASTAGE_TYPE,
  planPrintingScrap,
  printingScrapId
} from '../src/utils/printingScrap.js';

function applyPlan(store, plan) {
  plan.deleteIds.forEach((id) => store.delete(id));
  plan.upserts.forEach((row) => store.set(row.id, row));
  return store;
}

test('printing scrap uses one id per job and type and skips a zero quantity', () => {
  const first = planPrintingScrap({
    orderId: 'ORD-2026-194',
    productionRecordId: 'REC-ORD-2026-194',
    jobName: 'Nyra Original Outer',
    jobCode: 'ORD-2026-194',
    plainSettingKg: 8,
    printingWastageKg: 0,
    date: '2026-10-26',
    timestamp: '2026-10-26T09:17:09.996Z'
  });
  assert.deepEqual(first.deleteIds, [printingScrapId('ORD-2026-194', PRINTING_WASTAGE_TYPE)]);
  assert.equal(first.upserts.length, 1);
  assert.equal(first.upserts[0].id, 'print-scrap:ORD-2026-194:plain-setting');
  assert.equal(first.upserts[0].type, PLAIN_SETTING_TYPE);
  assert.equal(first.upserts[0].defectCategory, PLAIN_SETTING_TYPE);
  assert.equal(first.upserts[0].source, PRINTING_SCRAP_SOURCE);
  assert.equal(first.upserts[0].productionRecordId, 'REC-ORD-2026-194');
  assert.equal(first.upserts[0].jobName, 'Nyra Original Outer');
  assert.equal(first.upserts[0].jobNo, 'ORD-2026-194');
  assert.equal(first.upserts[0].scrapQtyKg, 8);
  assert.equal(first.upserts[0].date, '2026-10-26');

  const store = applyPlan(new Map(), first);
  const retry = planPrintingScrap({
    orderId: 'ORD-2026-194',
    productionRecordId: 'REC-ORD-2026-194',
    jobName: 'Nyra Original Outer',
    jobCode: 'ORD-2026-194',
    plainSettingKg: '8.50',
    printingWastageKg: '4.25',
    date: '2026-10-26',
    timestamp: '2026-10-26T09:20:00.000Z'
  });
  applyPlan(store, retry);
  assert.equal(store.size, 2);
  assert.equal(store.get('print-scrap:ORD-2026-194:plain-setting').scrapQtyKg, 8.5);
  assert.equal(store.get('print-scrap:ORD-2026-194:printing-wastage').type, PRINTING_WASTAGE_TYPE);

  const cleared = planPrintingScrap({
    orderId: 'ORD-2026-194',
    productionRecordId: 'REC-ORD-2026-194',
    plainSettingKg: '',
    printingWastageKg: 0
  });
  assert.equal(cleared.upserts.length, 0);
  applyPlan(store, cleared);
  assert.equal(store.size, 0);
});

test('a negative printing scrap quantity is refused', () => {
  assert.throws(
    () => planPrintingScrap({ orderId: 'ORD-1', plainSettingKg: -1, printingWastageKg: 0 }),
    /Plain Setting/
  );
});
