import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSaleChallanConflicts,
  itemsForShipment,
  ordersOnShipment,
  packingListDcAction,
  replacePackingListOnChallan,
  rollWithTare,
  saleChallanConflicts,
  syncChallansForShipment,
  tareEditSummary,
} from '../src/utils/deliveryChallanGuard.js';
import { liveGainLossForShipment } from '../src/utils/dispatchPacking.js';
import { preserveDispatchStatus } from '../src/utils/printRun.js';
import { getOrderStageInfo } from '../src/factoryStore.js';

const orders = [
  { id: 'ORD-A', jobName: 'Alpha Pouch', orderQtyKg: 100, clientName: 'Alpha' },
  { id: 'ORD-B', jobName: 'Beta Pouch', orderQtyKg: 200, clientName: 'Beta' },
];

function shipment(extra = {}) {
  return {
    id: 'DISP-1',
    dispatchId: 'PL-1',
    orderId: 'ORD-A',
    jobName: 'Alpha Pouch',
    packingStatus: 'Finalised',
    items: [
      { barcodeId: 'FG-1', orderId: 'ORD-A', jobName: 'Alpha Pouch', netWeightKg: 40, tareWeightKg: 0.5, grossWeightKg: 40.5 },
      { barcodeId: 'FG-2', orderId: 'ORD-B', jobName: 'Beta Pouch', netWeightKg: 60, tareWeightKg: 0.5, grossWeightKg: 60.5 },
    ],
    ...extra,
  };
}

test('a packing list can name every job order on its rolls', () => {
  const found = ordersOnShipment(shipment(), orders).map((order) => order.id).sort();
  assert.deepEqual(found, ['ORD-A', 'ORD-B']);
});

test('a short order may take one balance challan, and a completed dispatch may not', () => {
  const challans = [{
    id: 'DC-1',
    challanNo: 'SIL/DC/26-27/200',
    challanNature: 'Sale of Goods',
    jobName: 'Alpha Pouch',
    linkedPackingListIds: ['PL-1'],
    items: [
      { orderId: 'ORD-A', jobName: 'Alpha Pouch', quantity: 40, unit: 'Kg', packingListId: 'PL-1' },
      { orderId: 'ORD-B', jobName: 'Beta Pouch', quantity: 60, unit: 'Kg', packingListId: 'PL-1' },
    ],
  }];
  const balance = saleChallanConflicts(ordersOnShipment(shipment(), orders), challans, [shipment()]);
  assert.equal(balance.length, 0);

  const completedOrder = { ...orders[0], orderQtyKg: 40 };
  const blocked = saleChallanConflicts([completedOrder], challans, [shipment()]);
  assert.deepEqual(blocked.map((row) => row.orderId), ['ORD-A']);
  assert.match(formatSaleChallanConflicts(blocked), /another challan is not issued/);

  const second = {
    id: 'DC-2',
    challanNo: 'SIL/DC/26-27/201',
    challanNature: 'Sale of Goods',
    orderId: 'ORD-A',
    items: [{ orderId: 'ORD-A', quantity: 20, unit: 'Kg' }],
  };
  const third = saleChallanConflicts([orders[0]], [challans[0], second], [shipment()]);
  assert.equal(third[0].reason, 'balance-used');
  assert.match(formatSaleChallanConflicts(third), /third challan is not issued/);

  const editing = saleChallanConflicts(orders, challans, [shipment()], { exceptChallanId: 'DC-1' });
  assert.equal(editing.length, 0);

  const issued = packingListDcAction(shipment(), { orders, challans, shipments: [shipment()] });
  assert.equal(issued.action, 'edit');
  assert.equal(issued.challan.challanNo, 'SIL/DC/26-27/200');
  const leftover = packingListDcAction(
    { ...shipment(), id: 'DISP-2', dispatchId: 'PL-2', items: [{ orderId: 'ORD-A', jobName: 'Alpha Pouch', netWeightKg: 30, unit: 'Kg' }] },
    { orders, challans, shipments: [shipment()] }
  );
  assert.equal(leftover.action, 'issue');
});

test('the packing list being issued does not count as dispatch already finished', () => {
  const challans = [{
    id: 'DC-1',
    challanNo: 'SIL/DC/26-27/200',
    challanNature: 'Sale of Goods',
    items: [{ orderId: 'ORD-B', quantity: 90, unit: 'Kg' }],
  }];
  const first = {
    id: 'DISP-1',
    dispatchId: 'PL-1',
    packingStatus: 'Finalised',
    items: [{ orderId: 'ORD-B', jobName: 'Beta Pouch', netWeightKg: 90, unit: 'Kg' }],
  };
  const balance = {
    id: 'DISP-2',
    dispatchId: 'PL-2',
    packingStatus: 'Finalised',
    orderId: 'ORD-B',
    items: [{ orderId: 'ORD-B', jobName: 'Beta Pouch', netWeightKg: 100, unit: 'Kg' }],
  };
  assert.equal(saleChallanConflicts([orders[1]], challans, [first, balance]).length, 1);
  assert.equal(saleChallanConflicts([orders[1]], challans, [first, balance], { exceptShipmentIds: ['PL-2'] }).length, 0);
  assert.equal(packingListDcAction(balance, { orders, challans, shipments: [first, balance] }).action, 'issue');
});

test('a returnable challan does not block a sale challan', () => {
  const challans = [{
    id: 'DC-R',
    challanNo: 'SIL/DC/26-27/179',
    challanNature: 'Returnable Material',
    orderId: 'ORD-A',
    items: [{ quantity: 10, unit: 'Kg' }],
  }];
  assert.equal(saleChallanConflicts([orders[0]], challans, []).length, 0);
});

test('tare edits keep the scale net and recompute gross', () => {
  const next = rollWithTare({ netWeightKg: 18.1, tareWeightKg: 0.53, grossWeightKg: 18.63 }, '0.80');
  assert.equal(next.netWeightKg, 18.1);
  assert.equal(next.tareWeightKg, 0.8);
  assert.equal(next.coreWeightKg, 0.8);
  assert.equal(next.grossWeightKg, 18.9);
  const notes = tareEditSummary(
    { items: [{ barcodeId: 'FG-1', tareWeightKg: 0.53, netWeightKg: 18.1 }] },
    { items: [{ barcodeId: 'FG-1', ...next }] }
  );
  assert.match(notes[0], /FG-1: core\/tare 0.53 kg → 0.8 kg/);
});

test('editing a packing list rewrites the linked challan instead of a new number', () => {
  const source = shipment({
    items: [
      { barcodeId: 'FG-1', orderId: 'ORD-A', jobName: 'Alpha Pouch', netWeightKg: 42, tareWeightKg: 0.8, grossWeightKg: 42.8 },
      { barcodeId: 'FG-2', orderId: 'ORD-B', jobName: 'Beta Pouch', netWeightKg: 60, tareWeightKg: 0.5, grossWeightKg: 60.5 },
    ],
  });
  const challan = {
    id: 'DC-1',
    challanNo: 'SIL/DC/26-27/200',
    challanNature: 'Sale of Goods',
    freightCharges: 0,
    gstRatePct: 18,
    linkedPackingListIds: ['PL-1'],
    items: itemsForShipment(shipment(), { rateFor: () => 100 }),
  };
  const [updated] = syncChallansForShipment(source, [challan], { rateFor: () => 100 });
  assert.equal(updated.id, 'DC-1');
  assert.equal(updated.challanNo, 'SIL/DC/26-27/200');
  const alpha = updated.items.find((item) => item.orderId === 'ORD-A');
  const beta = updated.items.find((item) => item.orderId === 'ORD-B');
  assert.equal(alpha.quantity, 42);
  assert.equal(alpha.amount, 4200);
  assert.equal(beta.quantity, 60);
  assert.equal(updated.subtotalAmount, 10200);
  const replaced = replacePackingListOnChallan(challan, source, { rateFor: () => 100 });
  assert.equal(replaced.items.length, 2);
});

test('a sale challan moves a slitting job to dispatch or balance dispatch pending', () => {
  const order = { id: 'ORD-SLIT', jobName: 'Kasa Creamy Donuts', orderQtyKg: 1000, status: 'In Production' };
  const slitting = [{
    orderId: 'ORD-SLIT',
    sfgType: 'Slit Rolls',
    stage: 'Slitting & Rewinding',
    rollType: 'SFG',
    category: 'Semi-Finished Goods (SFG)',
    availableKg: 20,
    totalNetKg: 20,
    sfgBatchCode: 'SFG-SLIT-1',
  }];
  const records = [{ orderId: 'ORD-SLIT', qtySlitting: '1100' }];
  assert.equal(getOrderStageInfo(order, slitting, records).stage, 'Slitting & Rewinding');
  const over = getOrderStageInfo(order, slitting, records, {
    challans: [{ id: 'DC-K', jobName: 'Kasa Creamy Donuts', challanNature: 'Sale of Goods', items: [{ quantity: 1137.1, unit: 'Kg' }] }],
    shipments: [],
    settings: { enabled: true, tolerancePct: 10 },
  });
  assert.equal(over.stage, 'Completed');
  assert.match(over.stageLabel, /Completed/);
  const short = getOrderStageInfo({ ...order, orderQtyKg: 1000 }, slitting, records, {
    challans: [{ id: 'DC-S', orderId: 'ORD-SLIT', challanNature: 'Sale of Goods', items: [{ quantity: 400, unit: 'Kg' }] }],
    shipments: [],
    settings: { tolerancePct: 10 },
  });
  assert.equal(short.stage, 'Balance Dispatch Pending');
});

test('gain/loss follows the production record filled after dispatch', () => {
  const list = shipment({ totalNetWeightKg: 100, items: [{ orderId: 'ORD-A', jobName: 'Alpha Pouch', netWeightKg: 100, unit: 'Kg' }] });
  const before = liveGainLossForShipment(list, []);
  assert.equal(before.consumedKg, 0);
  const after = liveGainLossForShipment(list, [{ orderId: 'ORD-A', jobName: 'Alpha Pouch', qtySlitting: '110' }]);
  assert.equal(after.consumedKg, 110);
  assert.equal(after.packedNetKg, 100);
  assert.equal(after.differenceKg, -10);
  assert.equal(after.direction, 'loss');
});

test('a production write does not put a dispatched order back to In Production', () => {
  assert.equal(preserveDispatchStatus('Completed', 'In Production'), 'Completed');
  assert.equal(preserveDispatchStatus('Balance Dispatch Pending', 'In Production'), 'Balance Dispatch Pending');
  assert.equal(preserveDispatchStatus('In Production', 'In Production'), 'In Production');
  assert.equal(preserveDispatchStatus('Completed', 'Balance Dispatch Pending'), 'Balance Dispatch Pending');
});
