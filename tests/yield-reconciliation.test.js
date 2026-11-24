import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildYieldReconciliation,
  expectedInkGainKg,
  recoveryOutsideBand,
  yieldBandForProcess
} from '../src/utils/yieldReconciliation.js';

const children = [
  { barcodeId: 'SFG-PRN-R01', netWeightKg: 40, grossWeightKg: 40.5, lengthMeters: 1600, sfgType: 'Printed Rolls', orderId: 'ORD-1' },
  { barcodeId: 'SFG-PRN-R02', netWeightKg: 60, grossWeightKg: 60.5, lengthMeters: 2400, sfgType: 'Printed Rolls', orderId: 'ORD-1' }
];

test('a printed lot and its child rolls are counted once and the lot is only a total', () => {
  const model = buildYieldReconciliation({
    targetOrder: {
      id: 'ORD-1',
      jobName: 'Milk pouch',
      inputRollsList: [{ barcodeId: 'RM-1', consumedWeightKg: 100, initialWeightKg: 100, lengthMeters: 4200 }]
    },
    sfgGoods: [{
      sfgBatchCode: 'SFG-LOT-ORD-1',
      sfgType: 'Printed Rolls',
      orderId: 'ORD-1',
      totalNetKg: 100,
      rollsCount: 2,
      childRolls: children
    }],
    inventoryRolls: children
  });
  assert.equal(model.totalOutputKg, 100);
  assert.equal(model.linkedRolls.some((roll) => roll.barcodeId === 'SFG-LOT-ORD-1'), false);
  assert.equal(model.lotTotals.length, 1);
  assert.equal(model.lotTotals[0].barcodeId, 'SFG-LOT-ORD-1');
  assert.equal(model.lotTotals[0].netKg, 100);
  assert.equal(model.pairedRolls.filter((row) => row.outputRoll).length, 2);
});

test('roll yield uses the run, not positional pairing, unless the roll recorded its input barcodes', () => {
  const model = buildYieldReconciliation({
    targetOrder: {
      id: 'ORD-2',
      jobName: 'Positional',
      widthMm: 1000,
      inputRollsList: [
        { barcodeId: 'RM-A', consumedWeightKg: 10, initialWeightKg: 10 },
        { barcodeId: 'RM-B', consumedWeightKg: 90, initialWeightKg: 90 }
      ]
    },
    inventoryRolls: [
      { barcodeId: 'SFG-PRN-A', orderId: 'ORD-2', netWeightKg: 40, grossWeightKg: 40, sfgType: 'Printed Rolls', lengthMeters: 400 },
      {
        barcodeId: 'SFG-PRN-B',
        orderId: 'ORD-2',
        netWeightKg: 60,
        grossWeightKg: 60,
        sfgType: 'Printed Rolls',
        lengthMeters: 600,
        inputSubstrateBarcodes: ['RM-B']
      }
    ]
  });
  const first = model.pairedRolls.find((row) => row.outputRoll?.barcodeId === 'SFG-PRN-A');
  const second = model.pairedRolls.find((row) => row.outputRoll?.barcodeId === 'SFG-PRN-B');
  assert.equal(first.inputBasis, 'run-share');
  assert.equal(first.inConsKg, 40);
  assert.notEqual(first.inConsKg, 10);
  assert.equal(first.recoveryPct, 100);
  assert.equal(second.inputBasis, 'recorded');
  assert.equal(second.inConsKg, 90);
  assert.equal(second.linkedInputList[0].barcodeId, 'RM-B');
});

test('a held run keeps its input and a yield outside 98-112% is Check entries', () => {
  const inside = buildYieldReconciliation({
    targetOrder: {
      id: 'ORD-3',
      jobName: 'Band',
      printWidthMm: 1000,
      inputRollsList: [{ barcodeId: 'RM-NOW', consumedWeightKg: 70, initialWeightKg: 70, lengthMeters: 2000 }],
      printHoldHistory: [{
        reason: 'Machine Maintenance',
        meters: 1000,
        printedKg: 31,
        segmentId: 'hold-1',
        inputRolls: [{ barcodeId: 'RM-HELD', consumedWeightKg: 30, initialWeightKg: 30, lengthMeters: 1000 }]
      }]
    },
    targetRecord: { orderId: 'ORD-3', actualMetersPrinted: 2000, actualInkGsm: 2 },
    inventoryRolls: [
      { barcodeId: 'SFG-PRN-NOW', orderId: 'ORD-3', netWeightKg: 102, grossWeightKg: 102, sfgType: 'Printed Rolls', lengthMeters: 1900 }
    ]
  });
  assert.equal(inside.totalInputConsumedKg, 100);
  assert.ok(inside.runs.some((run) => run.id === 'hold-1' && run.inputKg === 30));
  assert.equal(inside.runs.find((run) => run.id === 'final-print').inputKg, 70);
  assert.equal(inside.checkEntries, false);
  assert.equal(inside.yieldLabel, 'Ink & Solvent Gain');
  assert.equal(expectedInkGainKg({ inkGsm: 2, widthMm: 1000, meters: 3000 }), 6);

  const outside = buildYieldReconciliation({
    targetOrder: {
      id: 'ORD-4',
      jobName: 'High',
      inputRollsList: [{ barcodeId: 'RM-X', consumedWeightKg: 100, initialWeightKg: 100 }]
    },
    inventoryRolls: [
      { barcodeId: 'SFG-PRN-X', orderId: 'ORD-4', netWeightKg: 120, grossWeightKg: 120, sfgType: 'Printed Rolls' }
    ]
  });
  assert.equal(outside.cumulativeRecoveryPct, 120);
  assert.equal(outside.checkEntries, true);
  assert.equal(outside.yieldLabel, 'Check entries');
  assert.equal(recoveryOutsideBand(120, yieldBandForProcess(null, 'printing')), true);
  assert.equal(recoveryOutsideBand(105, yieldBandForProcess({ printing: { minPct: 98, maxPct: 112 } }, 'printing')), false);
  const low = buildYieldReconciliation({
    targetOrder: {
      id: 'ORD-5',
      jobName: 'Low',
      inputRollsList: [{ barcodeId: 'RM-Y', consumedWeightKg: 100, initialWeightKg: 100 }]
    },
    inventoryRolls: [
      { barcodeId: 'SFG-PRN-Y', orderId: 'ORD-5', netWeightKg: 90, grossWeightKg: 90, sfgType: 'Printed Rolls' }
    ]
  });
  assert.equal(low.checkEntries, true);
});
