import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVERT_WINDOW_CLOSED,
  REVERT_WINDOW_MS,
  assessConsumptionRevert,
  canRevertConsumption,
  consumptionStockKg,
  isRevertedConsumption,
  restoredSourceBalances,
  revertWindowOpen
} from '../src/utils/revertConsumption.js';

const NOW = Date.parse('2026-11-10T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function source(over = {}) {
  return {
    sfgBatchCode: 'SFG-100',
    sfgType: 'Printed Rolls',
    rollType: 'SFG',
    consumedKg: 25,
    availableKg: 75,
    totalNetKg: 100,
    status: 'Partially Consumed',
    ...over
  };
}

test('stock kilograms use the lot deduction when the log recorded one', () => {
  assert.equal(consumptionStockKg({ consumedKg: 60, stockDeductedKg: 45 }), 45);
  assert.equal(consumptionStockKg({ consumedKg: 25 }), 25);
});

test('restoring one of two partial consumptions puts only that weight back', () => {
  const balances = restoredSourceBalances(
    { sfgBatchCode: 'SFG-100', consumedKg: 50, availableKg: 50, totalNetKg: 100 },
    { consumedKg: 20 }
  );
  assert.deepEqual(
    { consumedAfter: balances.consumedAfter, availableAfter: balances.availableAfter, statusAfter: balances.statusAfter },
    { consumedAfter: 30, availableAfter: 70, statusAfter: 'Partially Consumed' }
  );
});

test('a full revert of the only consumption restores the before balances', () => {
  const plan = assessConsumptionRevert({
    now: NOW,
    actor: { role: 'Admin' },
    log: { id: 'LOG-1', timestamp: new Date(NOW - DAY).toISOString(), consumedKg: 25, targetProcess: 'Dispatch Packing', sfgBatchCode: 'SFG-100' },
    source: source()
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.source.consumedAfter, 0);
  assert.equal(plan.source.availableAfter, 100);
  assert.equal(plan.source.statusAfter, 'In Stock (WIP)');
  assert.match(plan.lines[0], /Return 25\.00 kg to SFG-100/);
});

test('an output-stage log restores the stock that left the lot, not the weighed input', () => {
  const plan = assessConsumptionRevert({
    now: NOW,
    actor: { role: 'Production Manager' },
    log: {
      id: 'LOG-LAM',
      timestamp: new Date(NOW - 2 * DAY).toISOString(),
      consumedKg: 60,
      stockDeductedKg: 45,
      targetProcess: 'Lamination (Pass 1)',
      sfgBatchCode: 'SFG-100',
      outputRoll: { barcode: 'SFG-OUT-1', netWeightKg: 40 },
      scrapBreakdown: { laminateWastageKg: 1.5, laminationPlainSubstrateWastageKg: 0.5, adhesiveConsumedL1Kg: 2 }
    },
    source: { ...source(), consumedKg: 45, availableKg: 55 },
    outputs: [{ barcode: 'SFG-OUT-1', consumedKg: 0, status: 'In Stock (WIP)', totalNetKg: 40 }]
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.restoredKg, 45);
  assert.equal(plan.source.availableAfter, 100);
  assert.equal(plan.source.consumedAfter, 0);
  assert.ok(plan.lines.some((line) => line.includes('Remove output roll SFG-OUT-1')));
  assert.ok(plan.lines.some((line) => line.includes('laminate wastage')));
});

test('lamination revert names the substrate weight and the balance roll', () => {
  const plan = assessConsumptionRevert({
    now: NOW,
    actor: { role: 'Plant Manager' },
    log: {
      id: 'LOG-SUB',
      timestamp: new Date(NOW - DAY).toISOString(),
      consumedKg: 40,
      targetProcess: 'Lamination (Pass 1)',
      sfgBatchCode: 'SFG-100',
      substrate2Rolls: [{ barcode: 'RM-1', initialKg: 80, consumedKg: 30 }]
    },
    source: source({ consumedKg: 40, availableKg: 60 }),
    substrates: [{ barcode: 'RM-1', parentAvailableKg: 0, balanceAvailableKg: 50, balanceNetKg: 50, balanceStatus: 'In Stock (RM)' }]
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.substrates[0].balanceBarcode, 'RM-1-BAL');
  assert.equal(plan.substrates[0].initialKg, 80);
  assert.match(plan.lines.find((line) => line.includes('RM-1')), /80\.00 kg available/);
});

test('revert window stays open at exactly 7 days and closes one millisecond later', () => {
  const log = { timestamp: new Date(NOW - REVERT_WINDOW_MS).toISOString() };
  assert.equal(revertWindowOpen(log, NOW), true);
  assert.equal(revertWindowOpen(log, NOW + 1), false);
  const closed = assessConsumptionRevert({
    now: NOW + 1,
    actor: { role: 'Admin' },
    log: { ...log, id: 'LOG-OLD', consumedKg: 10 },
    source: source({ consumedKg: 10, availableKg: 90 })
  });
  assert.equal(closed.ok, false);
  assert.ok(closed.blocks.some((block) => block.includes(REVERT_WINDOW_CLOSED)));
});

test('a later plain consumption on the same roll does not block reverting the other one', () => {
  const plan = assessConsumptionRevert({
    now: NOW,
    actor: { role: 'Admin' },
    log: { id: 'LOG-A', timestamp: new Date(NOW - 2 * DAY).toISOString(), consumedKg: 30, sfgBatchCode: 'SFG-100' },
    source: source({ consumedKg: 50, availableKg: 50 }),
    allLogs: [
      { id: 'LOG-A', consumedKg: 30, sfgBatchCode: 'SFG-100' },
      { id: 'LOG-B', timestamp: new Date(NOW - DAY).toISOString(), consumedKg: 20, sfgBatchCode: 'SFG-100', targetProcess: 'Dispatch Packing' }
    ]
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.source.consumedAfter, 20);
  assert.equal(plan.source.availableAfter, 80);
});

test('an output that has itself been consumed blocks, and names the later step', () => {
  const plan = assessConsumptionRevert({
    now: NOW,
    actor: { role: 'Admin' },
    log: {
      id: 'LOG-OUT',
      timestamp: new Date(NOW - DAY).toISOString(),
      consumedKg: 40,
      targetProcess: 'Slitting & Rewinding',
      outputRoll: { barcode: 'FG-OUT', netWeightKg: 36 }
    },
    source: source({ consumedKg: 40, availableKg: 60 }),
    outputs: [{ barcode: 'FG-OUT', consumedKg: 36, status: 'Fully Consumed', totalNetKg: 36 }],
    allLogs: [{ id: 'LOG-NEXT', sfgBatchCode: 'FG-OUT', consumedKg: 36, targetProcess: 'Dispatch Packing' }]
  });
  assert.equal(plan.ok, false);
  assert.match(plan.blocks.join(' '), /Output roll FG-OUT has already been consumed \(Dispatch Packing\)/);
});

test('a balance roll that has moved blocks the substrate revert', () => {
  const plan = assessConsumptionRevert({
    now: NOW,
    actor: { role: 'Plant Manager' },
    log: {
      id: 'LOG-BAL',
      timestamp: new Date(NOW - DAY).toISOString(),
      consumedKg: 10,
      targetProcess: 'Lamination (Pass 1)',
      substrate2: { barcode: 'RM-9', initialKg: 40, consumedKg: 15 }
    },
    source: source({ consumedKg: 10, availableKg: 90 }),
    substrates: [{ barcode: 'RM-9', parentAvailableKg: 0, balanceAvailableKg: 10, balanceNetKg: 25, balanceStatus: 'Partially Consumed' }]
  });
  assert.equal(plan.ok, false);
  assert.match(plan.blocks.join(' '), /Balance roll RM-9-BAL/);
});

test('a finalised packing list blocks the dispatch consumption', () => {
  const plan = assessConsumptionRevert({
    now: NOW,
    actor: { role: 'Admin' },
    apply: true,
    reason: 'wrong roll',
    log: { id: 'LOG-PL', timestamp: new Date(NOW - DAY).toISOString(), consumedKg: 12, targetProcess: 'Dispatch Packing' },
    source: source({ consumedKg: 12, availableKg: 88 }),
    packing: { id: 'PL-1', packingListId: 'PL-1', status: 'Finalised', packedNetKg: 12, itemCount: 1 }
  });
  assert.equal(plan.ok, false);
  assert.match(plan.blocks.join(' '), /packing list PL-1/);
});

test('operators cannot revert, and a reason is required to apply', () => {
  assert.equal(canRevertConsumption({ role: 'Printing Operator' }), false);
  assert.equal(canRevertConsumption({ role: 'Shop Floor Operator' }), false);
  assert.equal(canRevertConsumption({ role: 'Store Manager' }), false);
  assert.equal(canRevertConsumption({ role: 'Plant Manager' }), true);
  assert.equal(canRevertConsumption({ role: 'Production Manager', roles: ['Printing Operator'] }), true);
  const denied = assessConsumptionRevert({
    now: NOW,
    actor: { role: 'Printing Operator' },
    log: { id: 'LOG-1', timestamp: new Date(NOW).toISOString(), consumedKg: 5 },
    source: source({ consumedKg: 5, availableKg: 95 })
  });
  assert.match(denied.blocks.join(' '), /Only Admin, Plant Manager, and Production Manager/);
  const noReason = assessConsumptionRevert({
    now: NOW,
    actor: { role: 'Admin' },
    apply: true,
    log: { id: 'LOG-1', timestamp: new Date(NOW).toISOString(), consumedKg: 5 },
    source: source({ consumedKg: 5, availableKg: 95 })
  });
  assert.match(noReason.blocks.join(' '), /reason is required/);
});

test('a reverted log is skipped and cannot be reverted again', () => {
  assert.equal(isRevertedConsumption({ status: 'Reverted', revertedAt: NOW }), true);
  const plan = assessConsumptionRevert({
    now: NOW,
    actor: { role: 'Admin' },
    log: { id: 'LOG-1', status: 'Reverted', timestamp: new Date(NOW).toISOString(), consumedKg: 5 },
    source: source()
  });
  assert.match(plan.blocks.join(' '), /already been reverted/);
});
