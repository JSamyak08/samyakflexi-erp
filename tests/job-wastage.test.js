import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HIGH_SCRAP_THRESHOLD_PCT,
  ORDER_QTY_UNIT,
  formatStageBreakdown,
  highScrapRegistryId,
  jobWastageScrapId,
  listHighScrapJobs,
  planBackfill,
  planJobWastage,
  wastagePctOfDispatch
} from '../src/utils/jobWastage.js';
import { PLAIN_SETTING_TYPE, PRINTING_WASTAGE_TYPE, printingScrapId } from '../src/utils/printingScrap.js';

function applyPlan(store, registry, plan) {
  plan.scrap.deleteIds.forEach((id) => store.delete(id));
  plan.scrap.upserts.forEach((row) => store.set(row.id, row));
  if (plan.registry.deleteId) registry.delete(plan.registry.deleteId);
  if (plan.registry.upsert) registry.set(plan.registry.upsert.id, plan.registry.upsert);
}

const order = { id: 'ORD-2026-194', jobName: 'Nyra Original Outer', orderQtyKg: 1000 };

function weighedShipment(orderId, kilograms, extra = {}) {
  const rolls = Array.isArray(kilograms) ? kilograms : [kilograms];
  return {
    orderId,
    jobName: extra.jobName || '',
    packingStatus: extra.packingStatus || 'Finalised',
    status: extra.status,
    items: rolls.map((netWeightKg) => ({ netWeightKg, unit: 'Kg' })),
    ...extra.rest
  };
}

test('every recorded wastage field becomes one scrap row tagged with stage and type', () => {
  const plan = planJobWastage({
    record: {
      id: 'REC-ORD-2026-194',
      orderId: 'ORD-2026-194',
      jobName: 'Nyra Original Outer',
      printingPlainSettingWastageKg: 8,
      printingWastageKg: 4,
      excessFilmWastageKg: 1.5,
      laminationPlainSubstrateWastageKg: 3,
      laminationPlainSubstrateWastageL2Kg: 2,
      laminateWastageKg: 6,
      printedWastageKg: 1,
      trimWastageKg: 5,
      slittingSettingWastageKg: 2,
      slittingScrapKg: 7,
      pouchingScrapKg: 4
    },
    order,
    date: '2026-10-26'
  });

  const byType = new Map(plan.scrap.upserts.map((row) => [row.type, row]));
  assert.equal(byType.size, 10);
  assert.equal(byType.get(PLAIN_SETTING_TYPE).id, printingScrapId('ORD-2026-194', PLAIN_SETTING_TYPE));
  assert.equal(byType.get(PLAIN_SETTING_TYPE).stage, 'Printing');
  assert.equal(byType.get(PRINTING_WASTAGE_TYPE).id, 'print-scrap:ORD-2026-194:printing-wastage');
  assert.equal(byType.get('Film Trimming Wastage').stage, 'Printing');
  assert.equal(byType.get('Lamination Plain Substrate').stage, 'Lamination');
  assert.equal(byType.get('Lamination Plain Substrate (L2)').id, 'print-scrap:ORD-2026-194:lamination-plain-substrate-l2');
  assert.equal(byType.get('Laminate Wastage').stage, 'Lamination');
  assert.equal(byType.get('Printed Defect Wastage').stage, 'Inspection');
  assert.equal(byType.get('Trim Wastage').stage, 'Slitting');
  assert.equal(byType.get('Slitting Setting Wastage').stage, 'Slitting');
  assert.equal(byType.get('Pouching Scrap').stage, 'Pouching');
  assert.equal(plan.scrap.upserts.some((row) => row.type === 'Slitting Scrap'), false);
  assert.equal(plan.totalWastageKg, 36.5);
  assert.equal(ORDER_QTY_UNIT, 'kg');
});

test('a zero quantity is skipped and a cleared quantity deletes the same id', () => {
  const store = new Map();
  const registry = new Map();
  const first = planJobWastage({
    record: { id: 'REC-1', orderId: 'ORD-1', laminateWastageKg: 4, printingWastageKg: 0 },
    order: { id: 'ORD-1', orderQtyKg: 1000 }
  });
  applyPlan(store, registry, first);
  assert.equal(store.size, 1);
  assert.equal(first.scrap.deleteIds.includes(printingScrapId('ORD-1', PRINTING_WASTAGE_TYPE)), true);

  const cleared = planJobWastage({
    record: { id: 'REC-1', orderId: 'ORD-1', laminateWastageKg: '', printingWastageKg: 0 },
    order: { id: 'ORD-1', orderQtyKg: 1000 }
  });
  applyPlan(store, registry, cleared);
  assert.equal(store.size, 0);
  assert.equal(cleared.scrap.deleteIds.includes(jobWastageScrapId('ORD-1', { type: 'Laminate Wastage', idKey: 'laminate-wastage' })), true);
});

test('a negative wastage quantity is refused', () => {
  assert.throws(
    () => planJobWastage({
      record: { orderId: 'ORD-1', pouchingScrapKg: -1 },
      order: { id: 'ORD-1', orderQtyKg: 100 }
    }),
    /Pouching Scrap/
  );
});

test('high scrap registry includes 5% of dispatched kg and leaves out 4.99%', () => {
  const dispatched = { shipments: [weighedShipment('ORD-A', 1000, { jobName: 'At Limit' })] };
  const atLimit = planJobWastage({
    record: { id: 'REC-A', orderId: 'ORD-A', jobName: 'At Limit', printingWastageKg: 50 },
    order: { id: 'ORD-A', jobName: 'At Limit', orderQtyKg: 100 },
    ...dispatched,
    date: '2026-10-26'
  });
  assert.equal(atLimit.flagged, true);
  assert.equal(atLimit.dispatchQtyKg, 1000);
  assert.equal(atLimit.orderQtyKg, 100);
  assert.equal(atLimit.wastagePct, 5);
  assert.equal(atLimit.registry.upsert.id, highScrapRegistryId('ORD-A'));
  assert.equal(atLimit.registry.upsert.dispatchQtyKg, 1000);
  assert.equal(atLimit.registry.upsert.dispatchQtyUnit, 'kg');
  assert.equal(atLimit.registry.upsert.orderQtyUnit, 'kg');
  assert.equal(atLimit.registry.upsert.thresholdPct, HIGH_SCRAP_THRESHOLD_PCT);
  assert.equal(atLimit.registry.deleteId, null);
  assert.match(formatStageBreakdown(atLimit.registry.upsert.stages), /Printing \/ Printing Wastage: 50.00 kg/);

  const under = planJobWastage({
    record: { id: 'REC-B', orderId: 'ORD-B', jobName: 'Under', printingWastageKg: 49.9 },
    order: { id: 'ORD-B', orderQtyKg: 1000 },
    shipments: [weighedShipment('ORD-B', 1000)]
  });
  assert.equal(under.flagged, false);
  assert.equal(under.wastagePct, 4.99);
  assert.equal(under.registry.upsert, null);
  assert.equal(under.registry.deleteId, highScrapRegistryId('ORD-B'));

  const registry = new Map();
  const store = new Map();
  applyPlan(store, registry, atLimit);
  const corrected = planJobWastage({
    record: { id: 'REC-A', orderId: 'ORD-A', jobName: 'At Limit', printingWastageKg: 40 },
    order: { id: 'ORD-A', orderQtyKg: 100 },
    ...dispatched
  });
  applyPlan(store, registry, corrected);
  assert.equal(registry.has(highScrapRegistryId('ORD-A')), false);
  assert.equal(store.get(printingScrapId('ORD-A', PRINTING_WASTAGE_TYPE)).scrapQtyKg, 40);

  const again = planJobWastage({
    record: { id: 'REC-A', orderId: 'ORD-A', printingWastageKg: 40 },
    order: { id: 'ORD-A', orderQtyKg: 100 },
    ...dispatched
  });
  applyPlan(store, registry, again);
  assert.equal(store.size, 1);
  assert.equal(registry.size, 0);
});

test('weighed packing-list rolls are the dispatch quantity, and an open list is not', () => {
  const orderRow = { id: 'ORD-SONU', jobName: 'Sonu Mango Mirchi Shots Inner', orderQtyKg: 500 };
  const record = { id: 'REC-SONU', orderId: 'ORD-SONU', jobName: orderRow.jobName, printingWastageKg: 30.82 };
  const rolls = weighedShipment('ORD-SONU', [210.5, 209.5], { jobName: orderRow.jobName });
  const plan = planJobWastage({
    record,
    order: orderRow,
    shipments: [rolls]
  });
  assert.equal(plan.dispatchQtyKg, 420);
  assert.equal(plan.wastagePct, 7.34);
  assert.equal(wastagePctOfDispatch(30.82, 420).toFixed(2), '7.34');
  assert.equal(plan.flagged, true);

  const stillOpen = planJobWastage({
    record,
    order: orderRow,
    shipments: [weighedShipment('ORD-SONU', [210.5, 209.5], { packingStatus: 'Open', jobName: orderRow.jobName })]
  });
  assert.equal(stillOpen.dispatchQtyKg, 0);
  assert.equal(stillOpen.notDispatched, true);
  assert.equal(stillOpen.wastagePct, null);
  assert.equal(stillOpen.flagged, false);
  assert.equal(stillOpen.scrap.upserts.length, 1);
});

test('a challan and a packing list for the same goods are not added together', () => {
  const plan = planJobWastage({
    record: { orderId: 'ORD-1', printingWastageKg: 20 },
    order: { id: 'ORD-1', jobName: 'Tea Pouch', orderQtyKg: 1000 },
    challans: [{ id: 'DC-1', orderId: 'ORD-1', jobName: 'Tea Pouch', items: [{ quantity: 400, unit: 'Kg' }] }],
    shipments: [weighedShipment('ORD-1', [180, 220], { jobName: 'Tea Pouch' })]
  });
  assert.equal(plan.dispatchQtyKg, 400);
  assert.equal(plan.wastagePct, 5);
  assert.equal(plan.flagged, true);
});

test('a job with no dispatch is not flagged and keeps its scrap rows', () => {
  const plan = planJobWastage({
    record: { orderId: 'ORD-Z', printingWastageKg: 80 },
    order: { id: 'ORD-Z', jobName: 'Waiting', orderQtyKg: 500 }
  });
  assert.equal(plan.flagged, false);
  assert.equal(plan.notDispatched, true);
  assert.equal(plan.dispatchQtyKg, 0);
  assert.equal(plan.wastagePct, null);
  assert.equal(plan.registry.upsert, null);
  assert.equal(plan.registry.deleteId, highScrapRegistryId('ORD-Z'));
  assert.equal(plan.scrap.upserts.length, 1);

  const cancelled = planJobWastage({
    record: { orderId: 'ORD-Z', printingWastageKg: 80 },
    order: { id: 'ORD-Z', jobName: 'Waiting', orderQtyKg: 500 },
    challans: [{ orderId: 'ORD-Z', status: 'Cancelled', items: [{ quantity: 400, unit: 'Kg' }] }]
  });
  assert.equal(cancelled.notDispatched, true);
  assert.equal(cancelled.flagged, false);
});

test('backfill flags only jobs at or above 5% of dispatch and keeps printing scrap ids', () => {
  const plan = planBackfill({
    orders: [
      { id: 'ORD-HIGH', jobName: 'High Job', order_qty_kg: 200 },
      { id: 'ORD-LOW', jobName: 'Low Job', orderQtyKg: 200 }
    ],
    shipments: [
      weighedShipment('ORD-HIGH', 200, { jobName: 'High Job' }),
      weighedShipment('ORD-LOW', 200, { jobName: 'Low Job' })
    ],
    productionRecords: [
      {
        id: 'REC-HIGH',
        order_id: 'ORD-HIGH',
        job_name: 'High Job',
        printing_wastage_kg: 6,
        trim_wastage_kg: 4,
        process_logs: { slittingSettingWastageKg: 2, slittingScrapKg: 6, excessFilmWastageKg: 1 }
      },
      {
        id: 'REC-LOW',
        orderId: 'ORD-LOW',
        jobName: 'Low Job',
        laminateWastageKg: 3
      }
    ]
  });

  assert.deepEqual(plan.flaggedJobs.map((job) => job.orderId), ['ORD-HIGH']);
  assert.equal(plan.flaggedJobs[0].totalWastageKg, 13);
  assert.equal(plan.flaggedJobs[0].dispatchQtyKg, 200);
  assert.equal(plan.flaggedJobs[0].wastagePct, 6.5);
  assert.equal(plan.registryDeletes.includes(highScrapRegistryId('ORD-LOW')), true);
  assert.equal(plan.scrapUpserts.some((row) => row.id === 'print-scrap:ORD-HIGH:printing-wastage' && row.scrapQtyKg === 6), true);
  assert.equal(plan.scrapUpserts.some((row) => row.type === 'Slitting Scrap'), false);
  assert.equal(listHighScrapJobs(plan.flaggedJobs, []).length, 0);
});

test('qc scrap ids are not part of the process wastage delete list', () => {
  const plan = planJobWastage({
    record: { orderId: 'ORD-1', printingPlainSettingWastageKg: 1 },
    order: { id: 'ORD-1', orderQtyKg: 1000 }
  });
  assert.equal(plan.scrap.deleteIds.some((id) => String(id).startsWith('SCRAP-LOG')), false);
  assert.equal(plan.scrap.deleteIds.includes('print-scrap:ORD-1:plain-setting'), false);
});

test('unified scrap table keeps Record Source & ID after defect remarks', () => {
  const source = readFileSync(new URL('../src/components/ScrapWastageAnalysis.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('{/* Main Unified Registry Table */}');
  assert.ok(start >= 0);
  const table = source.slice(start, source.indexOf('</table>', start));
  const thead = table.slice(0, table.indexOf('</thead>'));
  const headers = [...thead.matchAll(/<th\b[^>]*>\s*([^<]+?)\s*<\/th>/g)].map((match) => match[1].trim());
  assert.deepEqual(headers, [
    'Date',
    'Job Name & Order ID',
    'Operator / Inspector',
    'Gross Output / Qty (Kg)',
    'Scrap Weight (Kg)',
    'Scrap / Wastage %',
    'Defect Category / Remarks',
    'Record Source & ID'
  ]);

  const row = table.slice(table.indexOf('recordsPagination.paginatedItems.map'));
  const labels = [...row.matchAll(/\{\/\*\s*([^*]+?)\s*\*\/\}/g)].map((match) => match[1].trim());
  assert.equal(labels[0], 'Date');
  assert.deepEqual(labels.slice(-2), ['Defect Category / Remarks', 'Record Source & ID']);
  assert.match(source, /High scrap: \{HIGH_SCRAP_THRESHOLD_PCT\}% of dispatch quantity/);
  assert.match(source, /Dispatch qty \(\{ORDER_QTY_UNIT\}\)/);
  assert.match(source, /% of dispatch/);
  assert.match(source, /Not dispatched/);
  assert.doesNotMatch(source, /of order quantity/);
  assert.doesNotMatch(source, /% of order/);
});
