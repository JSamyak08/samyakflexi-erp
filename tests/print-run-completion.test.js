import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrintRunPatch } from '../src/utils/printRun.js';
import {
  completionForOrder,
  labelRoll,
  printBarcodeBase,
  printedRollBarcode
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
  assert.equal(summary.printedRolls[0].lengthMeters, 1200);
  assert.equal(summary.balanceRolls[0].barcodeId, 'RM-1-BAL');
  assert.equal(summary.consumedRolls[0].consumedWeightKg, 40);
  const tag = labelRoll(summary.balanceRolls[0], summary);
  assert.equal(tag.rollType, 'RAW_MATERIAL');
  assert.equal(tag.barcodeId, 'RM-1-BAL');
});
