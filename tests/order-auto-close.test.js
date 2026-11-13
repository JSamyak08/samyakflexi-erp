import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateOrderAutoClose,
  buildManualClose,
  buildManualReopen,
  manualCloseGuard,
  planAutoCloseUpdates,
  isAdminRole
} from '../src/utils/orderAutoClose.js';

function order(qty = 1000) {
  return { id: 'ORD-1', jobName: 'Tea Pouch', orderQtyKg: qty, status: 'In Production' };
}

function challan(kg, extra = {}) {
  return { id: 'DC-1', orderId: 'ORD-1', status: 'Issued', items: [{ quantity: String(kg), unit: 'Kg' }], ...extra };
}

test('auto-close boundaries are 90 to 110 percent when a challan exists and nothing remains', () => {
  const settings = { enabled: true, tolerancePct: 10 };
  const at899 = evaluateOrderAutoClose({ order: order(), challans: [challan(899)], settings });
  assert.equal(at899.order.status, 'Balance Dispatch Pending');
  assert.notEqual(at899.order.closeMode, 'auto');

  const at900 = evaluateOrderAutoClose({ order: order(), challans: [challan(900)], settings });
  assert.equal(at900.action, 'close');
  assert.equal(at900.order.status, 'Completed');
  assert.equal(at900.order.closeMode, 'auto');
  assert.equal(at900.order.closedBy, 'auto-close');

  const at1100 = evaluateOrderAutoClose({ order: order(), challans: [challan(1100)], settings });
  assert.equal(at1100.action, 'close');
  assert.equal(at1100.order.closeMode, 'auto');

  const at1101 = evaluateOrderAutoClose({ order: order(), challans: [challan(1101)], settings });
  assert.equal(at1101.action, 'close');
  assert.equal(at1101.order.status, 'Completed');
  assert.equal(at1101.order.closeMode, 'auto');
  assert.equal(at1101.order.overDispatchWarning, null);

  const kasa = evaluateOrderAutoClose({
    order: { id: 'ORD-2026-230', jobName: 'Kasa Creamy Donuts', orderQtyKg: 1000, status: 'In Production', overDispatchWarning: 'stays open' },
    challans: [{ id: 'DC-K', orderId: 'ORD-2026-230', jobName: 'Kasa Creamy Donuts', status: 'Issued', items: [{ quantity: '1137.1', unit: 'Kg' }] }],
    settings
  });
  assert.equal(kasa.order.status, 'Completed');
  assert.equal(kasa.order.overDispatchWarning, null);
});

test('leftover SFG or FG does not keep a dispatched order open', () => {
  const settings = { enabled: true, tolerancePct: 10 };
  const sfgLeft = evaluateOrderAutoClose({
    order: order(),
    challans: [challan(1000)],
    sfgGoods: [{ orderId: 'ORD-1', availableKg: 12, sfgType: 'Printed Rolls', sfgBatchCode: 'SFG-1' }],
    settings
  });
  assert.equal(sfgLeft.action, 'close');
  assert.equal(sfgLeft.order.status, 'Completed');

  const fgLeft = evaluateOrderAutoClose({
    order: order(),
    challans: [challan(1000)],
    sfgGoods: [{ orderId: 'ORD-1', availableKg: 8, sfgType: 'Finished Goods', sfgBatchCode: 'FG-1' }],
    settings
  });
  assert.equal(fgLeft.order.status, 'Completed');

  const filledAfter = evaluateOrderAutoClose({
    order: { ...order(), status: 'Completed', closeMode: 'auto', closedBy: 'auto-close' },
    challans: [challan(1137.1)],
    sfgGoods: [{ orderId: 'ORD-1', availableKg: 40, sfgType: 'Slit Rolls', sfgBatchCode: 'SFG-AFTER' }],
    settings
  });
  assert.equal(filledAfter.order.status, 'Completed');
  assert.equal(filledAfter.changed, false);
});

test('an open packing list is not dispatched weight until it is finalised', () => {
  const settings = { enabled: true, tolerancePct: 10 };
  const openList = {
    id: 'PL-OPEN',
    dispatchId: 'PL-OPEN',
    orderId: 'ORD-1',
    packingStatus: 'Open',
    totalNetWeightKg: 1000,
    items: [{ netWeightKg: 1000, unit: 'Kg', quantity: 1000 }]
  };
  const open = evaluateOrderAutoClose({ order: order(), shipments: [openList], settings });
  assert.equal(open.changed, false);
  assert.notEqual(open.order.status, 'Completed');

  const finalised = evaluateOrderAutoClose({
    order: order(),
    shipments: [{ ...openList, packingStatus: 'Finalised' }],
    settings
  });
  assert.equal(finalised.action, 'close');
  assert.equal(finalised.order.status, 'Completed');
});

test('a challan is required and job names are not fuzzy matched', () => {
  const settings = { enabled: true };
  const noDoc = evaluateOrderAutoClose({
    order: order(),
    sfgGoods: [],
    settings
  });
  assert.equal(noDoc.changed, false);

  const fuzzy = evaluateOrderAutoClose({
    order: { ...order(), jobName: 'Mee Max Noodles 85gm' },
    challans: [{ id: 'DC-2', jobName: 'Meemax Instant Noodles', items: [{ quantity: '1000', unit: 'Kg' }] }],
    settings
  });
  assert.equal(fuzzy.changed, false);
});

test('a packing list of two orders counts each order only its own rolls', () => {
  const settings = { enabled: true, tolerancePct: 10 };
  const shipment = {
    id: 'PL-1',
    orderId: 'ORD-QA-DC-SHORT',
    jobName: 'QA DC Short Roll',
    packingStatus: 'Finalised',
    totalNetWeightKg: 190,
    items: [
      { orderId: 'ORD-QA-DC-FULL', jobName: 'QA DC Full Roll', netWeightKg: 100, unit: 'Kg' },
      { orderId: 'ORD-QA-DC-SHORT', jobName: 'QA DC Short Roll', netWeightKg: 90, unit: 'Kg' }
    ]
  };
  const short = evaluateOrderAutoClose({
    order: { id: 'ORD-QA-DC-SHORT', jobName: 'QA DC Short Roll', orderQtyKg: 200, status: 'In Production' },
    shipments: [shipment],
    settings
  });
  assert.equal(short.order.status, 'Balance Dispatch Pending');
  const full = evaluateOrderAutoClose({
    order: { id: 'ORD-QA-DC-FULL', jobName: 'QA DC Full Roll', orderQtyKg: 100, status: 'In Production' },
    shipments: [shipment],
    settings
  });
  assert.equal(full.action, 'close');
  assert.equal(full.order.status, 'Completed');
});

test('a short challan that is cancelled clears Balance Dispatch Pending', () => {
  const settings = { enabled: true };
  const cleared = evaluateOrderAutoClose({
    order: { ...order(), status: 'Balance Dispatch Pending' },
    challans: [{ ...challan(400), status: 'Cancelled' }],
    settings
  });
  assert.equal(cleared.order.status, 'In Production');
  assert.equal(cleared.order.closeMode || null, null);
});

test('cancelled challan reopens only an auto-closed order', () => {
  const settings = { enabled: true };
  const reopened = evaluateOrderAutoClose({
    order: { ...order(), status: 'Completed', closeMode: 'auto', closedBy: 'auto-close' },
    challans: [{ ...challan(1000), status: 'Cancelled' }],
    settings
  });
  assert.equal(reopened.action, 'reopen');
  assert.equal(reopened.order.closeMode, null);
  assert.notEqual(reopened.order.status, 'Completed');
});

test('non-admin cannot manually close and a manual close is not overridden', () => {
  assert.equal(isAdminRole('Plant Manager'), false);
  assert.equal(isAdminRole('Admin'), true);
  const blocked = buildManualClose(order(), { user: { role: 'Plant Manager', name: 'Op' }, reason: 'ship it' });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Only Admin/);

  const closed = buildManualClose(order(), { user: { role: 'Admin', name: 'Samyak' }, reason: 'Customer took the balance' });
  assert.equal(closed.ok, true);
  assert.equal(closed.order.closeMode, 'manual');
  assert.equal(closed.order.closedBy, 'Samyak');
  assert.equal(closed.order.closeReason, 'Customer took the balance');

  const recompute = evaluateOrderAutoClose({
    order: closed.order,
    challans: [challan(500)],
    sfgGoods: [{ orderId: 'ORD-1', availableKg: 400, sfgType: 'Printed Rolls', sfgBatchCode: 'SFG-9' }],
    settings: { enabled: true }
  });
  assert.equal(recompute.changed, false);
  assert.equal(recompute.reason, 'manual-close');
  assert.equal(recompute.order.status, 'Completed');
  assert.equal(recompute.order.closeMode, 'manual');

  const planned = planAutoCloseUpdates([closed.order], {
    challans: [],
    sfgGoods: [{ orderId: 'ORD-1', availableKg: 50, sfgType: 'Finished Goods', sfgBatchCode: 'FG-9' }],
    settings: { enabled: true }
  });
  assert.equal(planned.length, 0);

  assert.match(manualCloseGuard(order(), closed.order, { role: 'Supervisor' }), /Only Admin/);
  const reopenBlocked = buildManualReopen(closed.order, { user: { role: 'Plant Manager' }, reason: 'mistake' });
  assert.equal(reopenBlocked.ok, false);
});

test('producing above 110 percent of the order quantity is not capped', () => {
  const decision = evaluateOrderAutoClose({
    order: order(100),
    challans: [],
    sfgGoods: [{ orderId: 'ORD-1', availableKg: 500, sfgType: 'Printed Rolls', sfgBatchCode: 'SFG-BIG' }],
    settings: { enabled: true }
  });
  assert.equal(decision.changed, false);
  assert.equal(decision.order.status, 'In Production');
  assert.equal(decision.order.overDispatchWarning || null, null);
});
