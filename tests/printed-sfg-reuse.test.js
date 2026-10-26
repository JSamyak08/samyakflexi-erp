import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOrderAutoClose } from '../src/utils/orderAutoClose.js';
import { planPrintedSfgAllocation, sameProduct, SAME_PRODUCT_KEY } from '../src/utils/printedSfgReuse.js';

function lot(extra = {}) {
  return {
    isPrintedLot: true,
    sfgBatchCode: 'SFG-LOT-ORD-OLD',
    sfgType: 'Printed Rolls',
    orderId: 'ORD-OLD',
    jobName: 'Nyra Original Outer',
    jobMasterId: 'JM-NYRA',
    totalNetKg: 80,
    availableKg: 40,
    totalMeters: 8000,
    childRolls: [{ barcodeId: 'SFG-BC-1' }, { barcodeId: 'SFG-BC-2' }],
    status: 'Partially Consumed',
    ...extra
  };
}

const requirements = [
  { id: 'REQ-1', filmType: 'MATTE BOPP', micron: 18, widthMm: 730, qtyKg: 100 },
  { id: 'REQ-2', filmType: 'Natural LD', micron: 35, widthMm: 750, qtyKg: 90 },
  { id: 'REQ-3', filmType: 'Liquid Inks', micron: '-', widthMm: '-', qtyKg: 8 }
];

test('same product matches jobMasterId and falls back to an exact job name', () => {
  assert.equal(SAME_PRODUCT_KEY, 'jobMasterId');
  assert.equal(sameProduct({ jobMasterId: 'JM-1', jobName: 'A' }, { jobMasterId: 'JM-1', jobName: 'B' }), true);
  assert.equal(sameProduct({ jobMasterId: 'JM-1' }, { jobDetails: { jobMasterId: 'JM-1' } }), true);
  assert.equal(sameProduct({ jobMasterId: 'JM-1', jobName: 'Nyra' }, { jobMasterId: 'JM-2', jobName: 'Nyra' }), false);
  assert.equal(sameProduct({ jobName: 'Nyra Original Outer' }, { jobName: 'nyra original outer' }), true);
  assert.equal(sameProduct({ jobName: 'Nyra Original' }, { jobName: 'Nyra Original Outer' }), false);
});

test('auto-close leaves a printed lot in stock and still blocks on other leftover SFG or FG', () => {
  const printed = lot();
  const closed = evaluateOrderAutoClose({
    order: { id: 'ORD-OLD', jobName: 'Nyra Original Outer', orderQtyKg: 1000, status: 'In Production' },
    challans: [{ id: 'DC-1', orderId: 'ORD-OLD', status: 'Issued', items: [{ quantity: '1000', unit: 'Kg' }] }],
    sfgGoods: [printed],
    settings: { enabled: true, tolerancePct: 10 }
  });
  assert.equal(closed.action, 'close');
  assert.equal(closed.order.status, 'Completed');
  assert.equal(printed.availableKg, 40);

  const blocked = evaluateOrderAutoClose({
    order: { id: 'ORD-1', jobName: 'Tea Pouch', orderQtyKg: 1000, status: 'In Production' },
    challans: [{ id: 'DC-1', orderId: 'ORD-1', status: 'Issued', items: [{ quantity: '1000', unit: 'Kg' }] }],
    sfgGoods: [{ orderId: 'ORD-1', availableKg: 12, sfgType: 'Printed Rolls', sfgBatchCode: 'SFG-1' }],
    settings: { enabled: true, tolerancePct: 10 }
  });
  assert.equal(blocked.action, 'none');
});

test('default use takes the whole free printed balance and none leaves the PO quantities', () => {
  const order = { id: 'ORD-NEW', jobName: 'Nyra Original Outer', jobMasterId: 'JM-NYRA' };
  const all = planPrintedSfgAllocation({
    order,
    orders: [order, { id: 'ORD-OLD', jobMasterId: 'JM-NYRA', jobName: 'Nyra Original Outer', status: 'Completed' }],
    sfgGoods: [lot()],
    requirements,
    choice: { mode: 'all', explicit: true }
  });
  assert.equal(all.offers[0].freeKg, 40);
  assert.deepEqual(all.offers[0].childBarcodes, ['SFG-BC-1', 'SFG-BC-2']);
  assert.equal(all.printQtyBefore, 100);
  assert.equal(all.printQtyAfter, 60);
  assert.equal(all.requirements[0].qtyKg, 60);
  assert.equal(all.requirements[1].qtyKg, 90);
  assert.equal(all.requirements[2].qtyKg, 8);
  assert.equal(all.use.sources[0].kg, 40);
  assert.equal(all.use.sources[0].sfgBatchCode, 'SFG-LOT-ORD-OLD');

  const none = planPrintedSfgAllocation({
    order,
    orders: [order],
    sfgGoods: [lot()],
    requirements,
    choice: { mode: 'none', explicit: true }
  });
  assert.equal(none.allocatedKg, 0);
  assert.equal(none.requirements[0].qtyKg, 100);
  assert.deepEqual(none.use.sources, []);
});

test('part of a lot can be reserved and a second order cannot take those kilograms', () => {
  const first = { id: 'ORD-A', jobMasterId: 'JM-NYRA', jobName: 'Nyra Original Outer' };
  const planned = planPrintedSfgAllocation({
    order: first,
    orders: [first],
    sfgGoods: [lot()],
    requirements,
    choice: { mode: 'part', kg: 15, explicit: true }
  });
  assert.equal(planned.allocatedKg, 15);
  assert.equal(planned.requirements[0].qtyKg, 85);
  const reservedOrder = { ...first, printedSfgUse: planned.use, materialRequirements: planned.requirements };
  const second = { id: 'ORD-B', jobMasterId: 'JM-NYRA', jobName: 'Nyra Original Outer' };
  const next = planPrintedSfgAllocation({
    order: second,
    orders: [reservedOrder, second],
    sfgGoods: [lot()],
    requirements,
    choice: { mode: 'all', explicit: true }
  });
  assert.equal(next.offers[0].freeKg, 25);
  assert.equal(next.allocatedKg, 25);
  assert.equal(next.requirements[0].qtyKg, 75);

  const otherProduct = planPrintedSfgAllocation({
    order: { id: 'ORD-C', jobMasterId: 'JM-OTHER', jobName: 'Other' },
    orders: [reservedOrder],
    sfgGoods: [lot()],
    requirements,
    choice: { mode: 'all', explicit: true }
  });
  assert.equal(otherProduct.offers.length, 0);
  assert.equal(otherProduct.requirements[0].qtyKg, 100);
});
