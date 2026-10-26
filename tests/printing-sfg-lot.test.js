import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planPrintingSfgLot,
  isPrintedLotChild,
  omitPrintedLotChildren,
  printingSfgLotCode
} from '../src/utils/printingSfgLot.js';

test('printed output rolls become one lot and a retry keeps kilograms already consumed', () => {
  const first = planPrintingSfgLot({
    orderId: 'ORD-2026-194',
    jobName: 'Nyra Original Outer',
    jobMasterId: 'JM-NYRA',
    outputRolls: [
      { barcodeId: 'SFG-BC-ORD-2026-194-1', netWeightKg: 120, lengthMeters: 8000 },
      { barcodeId: 'SFG-BC-ORD-2026-194-2', netWeightKg: 137.5, lengthMeters: 9800 }
    ],
    inputRolls: [{ barcodeId: 'RM-BC-20261026-5662HWHQ' }],
    meters: 17800
  });
  assert.equal(first.sfgBatchCode, 'SFG-LOT-ORD-2026-194');
  assert.equal(first.sfgType, 'Printed Rolls');
  assert.equal(first.isPrintedLot, true);
  assert.equal(first.totalNetKg, 257.5);
  assert.equal(first.availableKg, 257.5);
  assert.equal(first.totalMeters, 17800);
  assert.equal(first.jobMasterId, 'JM-NYRA');
  assert.deepEqual(first.inputBarcodeIds, ['RM-BC-20261026-5662HWHQ']);

  const retry = planPrintingSfgLot({
    orderId: 'ORD-2026-194',
    jobMasterId: 'JM-NYRA',
    outputRolls: [
      { barcodeId: 'SFG-BC-ORD-2026-194-1', netWeightKg: 120 },
      { barcodeId: 'SFG-BC-ORD-2026-194-2', netWeightKg: 137.5 }
    ],
    existingLot: { ...first, consumedKg: 40, availableKg: 217.5, printedAllocations: [{ orderId: 'ORD-NEXT', kg: 10 }] }
  });
  assert.equal(retry.consumedKg, 40);
  assert.equal(retry.availableKg, 217.5);
  assert.equal(retry.printedAllocations[0].orderId, 'ORD-NEXT');
  assert.equal(retry.childRolls.length, 2);
});

test('child roll barcodes stay traceable and are omitted from the stock sum', () => {
  const lot = planPrintingSfgLot({
    orderId: 'ORD-1',
    outputRolls: [{ barcodeId: 'SFG-BC-1', netWeightKg: 10 }, { barcodeId: 'SFG-BC-2', netWeightKg: 12 }]
  });
  const rows = [
    lot,
    { sfgBatchCode: 'SFG-BC-1', totalNetKg: 10, availableKg: 10 },
    { barcodeId: 'SFG-BC-2', parentSfgBatchCode: printingSfgLotCode('ORD-1'), netWeightKg: 12 },
    { sfgBatchCode: 'SFG-OLD', totalNetKg: 4, availableKg: 4, sfgType: 'Printed Rolls' }
  ];
  assert.equal(isPrintedLotChild({ barcodeId: 'SFG-BC-1' }, rows), true);
  assert.equal(isPrintedLotChild({ barcodeId: 'SFG-BC-2', parentSfgBatchCode: 'SFG-LOT-ORD-1' }, rows), true);
  const visible = omitPrintedLotChildren(rows);
  assert.deepEqual(visible.map((row) => row.sfgBatchCode || row.barcodeId), ['SFG-LOT-ORD-1', 'SFG-OLD']);
});
