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
  assert.equal(at899.order.status, 'Partially Dispatched');
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
  assert.equal(at1101.action, 'over-dispatch');
  assert.notEqual(at1101.order.status, 'Completed');
  assert.match(at1101.order.overDispatchWarning, /stays open/);
});

test('leftover SFG or FG keeps the order open', () => {
  const settings = { enabled: true, tolerancePct: 10 };
  const sfgLeft = evaluateOrderAutoClose({
    order: order(),
    challans: [challan(1000)],
    sfgGoods: [{ orderId: 'ORD-1', availableKg: 12, sfgType: 'Printed Rolls', sfgBatchCode: 'SFG-1' }],
    settings
  });
  assert.equal(sfgLeft.action, 'none');
  assert.equal(sfgLeft.order.status, 'In Production');

  const fgLeft = evaluateOrderAutoClose({
    order: order(),
    challans: [challan(1000)],
    sfgGoods: [{ orderId: 'ORD-1', availableKg: 8, sfgType: 'Finished Goods', sfgBatchCode: 'FG-1' }],
    settings
  });
  assert.equal(fgLeft.changed, false);
  assert.notEqual(fgLeft.order.status, 'Completed');
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
