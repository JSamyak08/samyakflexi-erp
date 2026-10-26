import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISPATCH_PACKING_PROCESS,
  DEFAULT_GAIN_LOSS_THRESHOLD_PCT,
  applyDispatchPackingConsumption,
  buildGainLossReport,
  canSeePackingGainLoss,
  consumptionFromLog,
  formatGainLossKg,
  formatGainLossPct,
  gainLossForShipment,
  isDispatchPacking,
  mergeConsumptionsIntoShipments,
  nextDispatchQuantity,
  packingGainLoss,
  shouldAlertGainLoss,
  shipmentWithoutGainLoss
} from '../src/utils/dispatchPacking.js';

const NOW = '2026-10-26T09:13:00.000Z';

function entry(id, kg, extra = {}) {
  return consumptionFromLog({
    id,
    sfgBatchCode: extra.barcode || `FG-BC-${id}`,
    jobName: extra.jobName || 'Sonu jaljeera shots inner - Printed SFG Roll 2',
    jobCode: 'JOB-2',
    orderId: extra.orderId || 'ORD-2026-107',
    consumedKg: kg,
    operatorName: 'Samyak Jain',
    timestamp: '26/10/26, 2:43 pm',
    shift: 'Day Shift',
    targetMachine: 'Expert 1000 Rotogravure Press',
    notes: extra.notes || 'Bay A',
    targetProcess: DISPATCH_PACKING_PROCESS
  }, {
    clientName: 'Samyak',
    consumedBy: extra.consumedBy || 'samyak.jain@samyakinternational.in',
    suggestedDispatchId: extra.suggestedDispatchId || null,
    now: NOW
  });
}

test('dispatch packing consumption opens a list, then joins the same open list', () => {
  const first = applyDispatchPackingConsumption({
    shipments: [],
    entry: entry('SFG-LOG-1', 107, { suggestedDispatchId: 'PL-2026-606130' }),
    now: NOW
  });
  assert.equal(first.created, true);
  assert.equal(first.idempotent, false);
  assert.equal(first.shipment.packingStatus, 'Open');
  assert.equal(first.shipment.dispatchId, 'PL-2026-606130');
  assert.equal(first.shipment.totalNetWeightKg, 0);
  assert.equal(first.shipment.items.length, 0);
  assert.equal(first.shipment.dispatchConsumptions[0].barcode, 'FG-BC-SFG-LOG-1');
  assert.equal(first.shipment.dispatchConsumptions[0].consumedKg, 107);
  assert.equal(first.shipment.dispatchConsumptions[0].consumedBy, 'samyak.jain@samyakinternational.in');
  assert.equal(first.shipment.dispatchConsumptions[0].consumedAt, '2026-10-26T09:13:00.000Z');

  const second = applyDispatchPackingConsumption({
    shipments: first.shipments,
    entry: entry('SFG-LOG-2', 20, { barcode: 'FG-BC-2' }),
    now: NOW
  });
  assert.equal(second.created, false);
  assert.equal(second.shipment.dispatchId, 'PL-2026-606130');
  assert.equal(second.shipment.dispatchConsumptions.length, 2);
  assert.equal(second.shipments.length, 1);

  const replay = applyDispatchPackingConsumption({
    shipments: second.shipments,
    entry: entry('SFG-LOG-1', 107),
    now: NOW
  });
  assert.equal(replay.idempotent, true);
  assert.equal(replay.shipment.dispatchConsumptions.length, 2);
  assert.equal(replay.shipments.length, 1);
});

test('a finalised list and another order do not receive the next consumption', () => {
  const closed = {
    id: 'DISP-OLD',
    dispatchId: 'PL-2026-1',
    orderId: 'ORD-2026-107',
    jobName: 'Sonu jaljeera shots inner - Printed SFG Roll 2',
    packingStatus: 'Finalised',
    items: [{ netWeightKg: 50, unit: 'Kg' }],
    totalNetWeightKg: 50,
    dispatchConsumptions: []
  };
  const otherOpen = {
    id: 'DISP-OTHER',
    dispatchId: 'PL-2026-2',
    orderId: 'ORD-OTHER',
    jobName: 'Other job',
    packingStatus: 'Open',
    items: [],
    dispatchConsumptions: [{ id: 'OTHER', consumedKg: 4, consumedAt: NOW }]
  };
  const placed = applyDispatchPackingConsumption({
    shipments: [closed, otherOpen],
    entry: entry('SFG-LOG-9', 15, { suggestedDispatchId: 'PL-2026-9' }),
    now: NOW
  });
  assert.equal(placed.created, true);
  assert.equal(placed.shipment.dispatchId, 'PL-2026-9');
  assert.equal(placed.shipment.orderId, 'ORD-2026-107');
  assert.equal(closed.dispatchConsumptions.length, 0);
  assert.equal(otherOpen.dispatchConsumptions.length, 1);
});

test('gain and loss compare packed net with consumed FG weight', () => {
  const shipment = {
    dispatchId: 'PL-1',
    orderId: 'ORD-1',
    jobName: 'Tea',
    clientName: 'Acme',
    packingStatus: 'Open',
    createdAt: NOW,
    dispatchConsumptions: [
      { id: 'a', consumedKg: 60, consumedAt: NOW },
      { id: 'b', consumedKg: 47, consumedAt: NOW }
    ],
    items: []
  };
  const empty = gainLossForShipment(shipment, []);
  assert.deepEqual(packingGainLoss({ consumedKg: 107, packedNetKg: 0 }), {
    consumedKg: 107,
    packedNetKg: 0,
    differenceKg: -107,
    differencePct: -100,
    direction: 'loss'
  });
  assert.equal(empty.differenceKg, -107);
  assert.equal(shouldAlertGainLoss(empty, 2, { packageCount: 0, packingStatus: 'Open' }), false);

  const partial = gainLossForShipment(shipment, [
    { netWeightKg: 50, unit: 'Kg', grossWeightKg: 54.5, tareWeightKg: 4.5 }
  ]);
  assert.equal(partial.packedNetKg, 50);
  assert.equal(partial.differenceKg, -57);
  assert.equal(partial.differencePct, -53.27);
  assert.equal(shouldAlertGainLoss(partial, 2, { packageCount: 1, packingStatus: 'Open' }), true);

  const within = packingGainLoss({ consumedKg: 107, packedNetKg: 105 });
  assert.equal(within.differenceKg, -2);
  assert.equal(within.differencePct, -1.87);
  assert.equal(shouldAlertGainLoss(within, DEFAULT_GAIN_LOSS_THRESHOLD_PCT, { packageCount: 1, packingStatus: 'Open' }), false);

  const exact = packingGainLoss({ consumedKg: 100, packedNetKg: 102 });
  assert.equal(exact.differencePct, 2);
  assert.equal(shouldAlertGainLoss(exact, 2, { packageCount: 1, packingStatus: 'Finalised' }), false);

  const gain = packingGainLoss({ consumedKg: 100, packedNetKg: 103 });
  assert.equal(gain.direction, 'gain');
  assert.equal(gain.differenceKg, 3);
  assert.equal(gain.differencePct, 3);
  assert.equal(formatGainLossKg(gain.differenceKg), '+3.00 kg');
  assert.equal(formatGainLossPct(gain.differencePct), '+3.00%');
  assert.equal(shouldAlertGainLoss(gain, 2, { packageCount: 2, packingStatus: 'Finalised' }), true);

  const pieces = packedNetFrom(shipment);
  assert.equal(pieces, 0);
});

function packedNetFrom(shipment) {
  return gainLossForShipment({
    ...shipment,
    items: [{ netWeightKg: 10, unit: 'Pcs' }]
  }).packedNetKg;
}

test('the report lists consumed and packed weights and hides the comparison from other roles', () => {
  assert.equal(canSeePackingGainLoss('Admin'), true);
  assert.equal(canSeePackingGainLoss('Plant Manager'), false);
  assert.equal(canSeePackingGainLoss('Store Manager'), false);
  assert.equal(isDispatchPacking('Dispatch Packing'), true);
  assert.equal(isDispatchPacking('Lamination (Pass 1)'), false);

  const rows = buildGainLossReport([
    {
      dispatchId: 'PL-A',
      orderId: 'ORD-A',
      jobName: 'Jaljeera',
      clientName: 'Acme',
      packingStatus: 'Open',
      createdAt: '2026-10-20T00:00:00.000Z',
      dispatchConsumptions: [{ id: '1', consumedKg: 100, consumedAt: NOW }],
      items: [{ netWeightKg: 110, unit: 'Kg' }]
    },
    {
      dispatchId: 'PL-B',
      orderId: 'ORD-B',
      jobName: 'Other',
      packingStatus: 'Finalised',
      createdAt: '2026-10-01T00:00:00.000Z',
      dispatchConsumptions: [{ id: '2', consumedKg: 40, consumedAt: NOW }],
      items: [{ netWeightKg: 40, unit: 'Kg' }]
    },
    {
      dispatchId: 'PL-LEGACY',
      orderId: 'ORD-C',
      jobName: 'Manual',
      items: [{ netWeightKg: 10, unit: 'Kg' }],
      totalNetWeightKg: 10
    }
  ], { thresholdPct: 2, search: 'jal', onlyOver: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].packingListId, 'PL-A');
  assert.equal(rows[0].fgConsumedKg, 100);
  assert.equal(rows[0].packedNetKg, 110);
  assert.equal(rows[0].differenceKg, 10);
  assert.equal(rows[0].differencePct, 10);
  assert.equal(rows[0].overThreshold, true);
});

test('saved shipments do not carry gain/loss fields, and a repeat dispatch posting replaces its quantity', () => {
  const stripped = shipmentWithoutGainLoss({
    dispatchId: 'PL-1',
    differenceKg: 3,
    differencePct: 2.5,
    gainLoss: { differenceKg: 3 },
    items: []
  });
  assert.equal(stripped.dispatchId, 'PL-1');
  assert.equal('differenceKg' in stripped, false);
  assert.equal('differencePct' in stripped, false);

  const first = nextDispatchQuantity(0, [], { dispatchId: 'PL-1', totalNetWeightKg: 40, items: [{}, {}] });
  assert.equal(first.qtyDispatch, 40);
  assert.equal(first.dispatchHistory.length, 1);
  const second = nextDispatchQuantity(first.qtyDispatch, first.dispatchHistory, {
    dispatchId: 'PL-1',
    totalNetWeightKg: 55,
    items: [{}, {}, {}]
  });
  assert.equal(second.qtyDispatch, 55);
  assert.equal(second.deltaKg, 15);
  assert.equal(second.dispatchHistory.length, 1);
  assert.equal(second.dispatchHistory[0].netWeightKg, 55);
});

test('consumption rows from the table replace a missing payload copy', () => {
  const merged = mergeConsumptionsIntoShipments([
    { id: 'DISP-1', dispatchId: 'PL-1', packing_status: 'Open', items: [], dispatchConsumptions: [] }
  ], [{
    id: 'SFG-LOG-1',
    packing_list_id: 'PL-1',
    barcode: 'FG-1',
    consumed_kg: 12.5,
    consumed_at: NOW,
    consumed_by: 'operator@plant',
    job_name: 'Tea',
    order_id: 'ORD-1'
  }]);
  assert.equal(merged[0].packingStatus, 'Open');
  assert.equal(merged[0].dispatchConsumptions.length, 1);
  assert.equal(merged[0].dispatchConsumptions[0].consumedKg, 12.5);
  assert.equal(merged[0].dispatchConsumptions[0].barcode, 'FG-1');
});
