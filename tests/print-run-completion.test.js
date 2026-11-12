import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrintRunPatch } from '../src/utils/printRun.js';
import {
  completionForOrder,
  balanceRollMeterErrors,
  labelRoll,
  lengthForPrintedRoll,
  printBarcodeBase,
  printedRollBarcode,
  printedRollMeterErrors,
  withEnteredBalanceMeters
} from '../src/utils/printRunCompletion.js';

test('a print-run patch keeps output and scrap fields and still drops a close', () => {
  const patch = buildPrintRunPatch({
    outputRolls: [{ netWeightKg: 10 }],
    printingPlainSettingWastageKg: 6.5,
    printingWastageKg: 0,
    jobCode: 'JOB-1',
    closeMode: 'manual',
    status: 'Completed'
  });
  assert.deepEqual(patch.outputRolls, [{ netWeightKg: 10 }]);
  assert.equal(patch.printingPlainSettingWastageKg, 6.5);
  assert.equal(patch.jobCode, 'JOB-1');
  assert.equal(patch.closeMode, undefined);
  assert.equal(patch.status, undefined);
});

test('printed roll barcodes follow the job code, then the order id', () => {
  assert.equal(printedRollBarcode('JOB 9', 'ORD-1', 2), 'SFG-BC-JOB9-2');
  assert.equal(printBarcodeBase('', 'ORD/1'), 'ORD1');
  assert.equal(printedRollBarcode('', 'ORD/1', 1), 'SFG-BC-ORD1-1');
});

test('job history rebuilds printed, balance, and consumed rolls from the lot', () => {
  const summary = completionForOrder({
    order: {
      id: 'ORD-1',
      jobName: 'Snack roll',
      jobCode: 'JOB-1',
      actualMetersPrinted: 1200,
      inputRollsList: [{ barcodeId: 'RM-1', consumedWeightKg: 40, initialWeightKg: 80 }]
    },
    sfgGoods: [{
      sfgBatchCode: 'SFG-LOT-ORD-1',
      isPrintedLot: true,
      totalMeters: 1200,
      childRolls: [{ barcodeId: 'SFG-BC-JOB-1-1', netWeightKg: 36 }],
      runBalanceRolls: [{ barcodeId: 'RM-1-BAL', netWeightKg: 40 }],
      runConsumedRolls: [{ barcodeId: 'RM-1', consumedWeightKg: 40, initialWeightKg: 80 }]
    }]
  });
  assert.equal(summary.outputRecorded, true);
  assert.equal(summary.printedRolls[0].barcodeId, 'SFG-BC-JOB-1-1');
  assert.equal(summary.printedRolls[0].netWeightKg, 36);
  assert.equal(summary.printedRolls[0].lengthMeters, null);
  assert.equal(summary.meters, 1200);
  assert.equal(summary.balanceRolls[0].barcodeId, 'RM-1-BAL');
  assert.equal(summary.consumedRolls[0].consumedWeightKg, 40);
  assert.equal(lengthForPrintedRoll({ lengthMeters: null }), null);
  assert.equal(lengthForPrintedRoll({ lengthMeters: 80 }), 80);
  assert.equal(lengthForPrintedRoll({ totalMeters: 370 }), null);
  const tag = labelRoll(summary.balanceRolls[0], summary);
  assert.equal(tag.rollType, 'RAW_MATERIAL');
  assert.equal(tag.barcodeId, 'RM-1-BAL');
});

test('each printed roll and each balance roll keeps its own entered meters', () => {
  assert.deepEqual(printedRollMeterErrors([
    { netWeightKg: 10, lengthMeters: 400 },
    { netWeightKg: 8, lengthMeters: '' }
  ]), ['Printed roll 2 needs its own length in meters.']);
  assert.deepEqual(printedRollMeterErrors([{ netWeightKg: 10, lengthMeters: 0 }]), [
    'Printed roll 1 needs its own length in meters.'
  ]);
  assert.deepEqual(printedRollMeterErrors([{ netWeightKg: 10, lengthMeters: -5 }]), [
    'Printed roll 1 needs its own length in meters.'
  ]);
  assert.deepEqual(balanceRollMeterErrors([
    { initialWeightKg: 20, consumedWeightKg: 20, balanceLengthMeters: '' },
    { initialWeightKg: 20, consumedWeightKg: 5 }
  ]), ['Input roll 2 has leftover film and needs the balance length in meters.']);
  const tagged = withEnteredBalanceMeters(
    [{ barcodeId: 'RM-9-BAL', parentBarcodeId: 'RM-9', netWeightKg: 15 }],
    [{ barcodeId: 'RM-9', balanceLengthMeters: '640' }]
  );
  assert.equal(tagged[0].lengthMeters, 640);
  const untouched = withEnteredBalanceMeters(
    [{ barcodeId: 'RM-9-BAL', netWeightKg: 15 }],
    [{ barcodeId: 'RM-9' }]
  );
  assert.equal(untouched[0].lengthMeters, null);
  const summary = completionForOrder({
    order: { id: 'ORD-2', actualMetersPrinted: 9000 },
    sfgGoods: [{
      sfgBatchCode: 'SFG-LOT-ORD-2',
      childRolls: [
        { barcodeId: 'SFG-BC-ORD-2-1', netWeightKg: 4, lengthMeters: 210 },
        { barcodeId: 'SFG-BC-ORD-2-2', netWeightKg: 5 }
      ]
    }]
  });
  assert.equal(summary.printedRolls[0].lengthMeters, 210);
  assert.equal(summary.printedRolls[1].lengthMeters, null);
  assert.equal(summary.meters, 9000);
});

test('an empty saved balance list stays empty when a -BAL input was fully consumed', () => {
  const summary = completionForOrder({
    order: {
      id: 'ORD-2026-231',
      jobName: 'Ashirwad Panda Inner',
      inputRollsList: [
        { barcodeId: 'RM-BC-20261029-1945N5ZG-BAL', consumedWeightKg: 142.8, initialWeightKg: 142.8 },
        { barcodeId: 'RM-BC-20261029-1945K3SY', consumedWeightKg: 363.4, initialWeightKg: 363.4 }
      ]
    },
    sfgGoods: [{
      sfgBatchCode: 'SFG-LOT-ORD-2026-231',
      runBalanceRolls: [],
      runConsumedRolls: [
        { barcodeId: 'RM-BC-20261029-1945N5ZG-BAL', consumedWeightKg: 142.8, initialWeightKg: 142.8 },
        { barcodeId: 'RM-BC-20261029-1945K3SY', consumedWeightKg: 363.4, initialWeightKg: 363.4 }
      ],
      childRolls: [{ barcodeId: 'SFG-BC-CYL-2026-363-1', netWeightKg: 80 }]
    }],
    inventoryRolls: [{
      barcodeId: 'RM-BC-20261029-1945N5ZG-BAL',
      orderId: 'ORD-2026-231',
      netWeightKg: 142.8,
      availableWeightKg: 142.8,
      status: 'In Stock (RM)',
      metadata: {
        parentBarcodeId: 'RM-BC-20261029-1945N5ZG',
        orderId: 'ORD-2026-226',
        balanceRoll: true
      }
    }, {
      barcodeId: 'RM-BC-20261029-1945K3SY-BAL',
      status: 'In Stock (RM)',
      netWeightKg: 10,
      availableWeightKg: 10,
      metadata: { parentBarcodeId: 'RM-BC-20261029-1945K3SY', orderId: 'ORD-2026-231', balanceRoll: true }
    }]
  });
  assert.deepEqual(summary.balanceRolls, []);
  assert.equal(summary.consumedRolls.length, 2);
  assert.equal(summary.printedRolls[0].barcodeId, 'SFG-BC-CYL-2026-363-1');
});

test('inferred balance rolls skip reversed, void, and zero-kg rows and use available kg', () => {
  const summary = completionForOrder({
    order: {
      id: 'ORD-LEGACY',
      inputRollsList: [{ barcodeId: 'RM-PARENT', consumedWeightKg: 10, initialWeightKg: 30 }]
    },
    sfgGoods: [{ sfgBatchCode: 'SFG-LOT-ORD-LEGACY', childRolls: [{ barcodeId: 'SFG-BC-ORD-LEGACY-1', netWeightKg: 8 }] }],
    inventoryRolls: [
      {
        barcodeId: 'RM-PARENT-BAL',
        orderId: 'ORD-LEGACY',
        status: 'Reversed',
        netWeightKg: 20,
        availableWeightKg: 0,
        metadata: { parentBarcodeId: 'RM-PARENT', orderId: 'ORD-LEGACY' }
      },
      {
        barcodeId: 'RM-PARENT-VOID-BAL',
        status: 'Void',
        netWeightKg: 4,
        availableWeightKg: 4,
        metadata: { parentBarcodeId: 'RM-PARENT', orderId: 'ORD-LEGACY' }
      },
      {
        barcodeId: 'RM-PARENT-EMPTY-BAL',
        status: 'In Stock (RM)',
        netWeightKg: 16.7,
        availableWeightKg: 0,
        metadata: { parentBarcodeId: 'RM-PARENT', orderId: 'ORD-LEGACY' }
      },
      {
        barcodeId: 'RM-LAM-BAL',
        orderId: 'ORD-LEGACY',
        status: 'In Stock (RM)',
        netWeightKg: 0.02,
        availableWeightKg: 0.02,
        metadata: { parentBarcodeId: 'RM-LAM-PARENT', orderId: 'ORD-LEGACY', stage: 'Lamination (Pass 1)' }
      },
      {
        barcodeId: 'RM-ISSUED-BAL',
        orderId: 'ORD-LEGACY',
        status: 'In Stock (RM)',
        netWeightKg: 12,
        availableWeightKg: 12,
        metadata: { parentBarcodeId: 'RM-PARENT', orderId: 'ORD-OTHER' }
      },
      {
        barcodeId: 'RM-PARENT-KEEP-BAL',
        orderId: 'ORD-OTHER',
        status: 'In Stock (RM)',
        netWeightKg: 20,
        availableWeightKg: 8.5,
        creatingOrderId: 'ORD-LEGACY',
        parentBarcodeId: 'RM-PARENT'
      }
    ]
  });
  assert.deepEqual(summary.balanceRolls.map((roll) => roll.barcodeId), ['RM-PARENT-KEEP-BAL']);
  assert.equal(summary.balanceRolls[0].netWeightKg, 8.5);
});

test('a legacy balance roll without parent and creating-order metadata is not inferred', () => {
  const summary = completionForOrder({
    order: {
      id: 'ORD-OLD',
      inputRollsList: [{ barcodeId: 'RM-OLD', consumedWeightKg: 10, initialWeightKg: 24.2 }]
    },
    sfgGoods: [],
    inventoryRolls: [{
      barcodeId: 'RM-OLD-BAL',
      orderId: 'ORD-OLD',
      rollType: 'RAW_MATERIAL',
      status: 'In Stock (RM)',
      netWeightKg: 14.2,
      availableWeightKg: 14.2
    }]
  });
  assert.deepEqual(summary.balanceRolls, []);
});

test('partial consumption infers only the new balance roll, not the input that was used', () => {
  const summary = completionForOrder({
    order: {
      id: 'ORD-B',
      inputRollsList: [{ barcodeId: 'RM-A-BAL', consumedWeightKg: 40, initialWeightKg: 100 }]
    },
    sfgGoods: [{ sfgBatchCode: 'SFG-OTHER' }],
    inventoryRolls: [
      {
        barcodeId: 'RM-A-BAL',
        orderId: 'ORD-B',
        status: 'Issued to Printing',
        netWeightKg: 100,
        availableWeightKg: 0,
        metadata: { parentBarcodeId: 'RM-A', orderId: 'ORD-A', balanceRoll: true }
      },
      {
        barcodeId: 'RM-A-BAL-BAL',
        orderId: 'ORD-LATER',
        status: 'In Stock (RM)',
        netWeightKg: 60,
        availableWeightKg: 60,
        metadata: { parentBarcodeId: 'RM-A-BAL', orderId: 'ORD-B', balanceRoll: true }
      },
      {
        barcodeId: 'RM-A-BAL-OLD',
        orderId: 'ORD-B',
        status: 'In Stock (RM)',
        netWeightKg: 15,
        availableWeightKg: 15,
        metadata: { parentBarcodeId: 'RM-A', orderId: 'ORD-A' }
      }
    ]
  });
  assert.deepEqual(summary.balanceRolls.map((roll) => [roll.barcodeId, roll.netWeightKg]), [
    ['RM-A-BAL-BAL', 60]
  ]);
});
