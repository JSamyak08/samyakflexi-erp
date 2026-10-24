import test from 'node:test';
import assert from 'node:assert/strict';
import { NOT_RECORDED } from '../src/utils/productionRecordQuality.js';
import { buildRollLineage } from '../src/utils/rollLineage.js';

const chain = {
  orderId: 'ORD-1',
  printWidthMm: 710,
  actualMetersPrinted: 10000,
  printedOutputKg: 105,
  inputRollsList: [
    { barcodeId: 'RM-1', filmType: 'MATTEBOPP', micron: 18, widthMm: 710, consumedWeightKg: 100 }
  ],
  sfgConsumptions: [
    {
      orderId: 'ORD-1',
      targetProcess: 'Lamination Pass 1',
      sfgBatchCode: 'SFG-PRINT-1',
      consumedKg: 105,
      substrate2Rolls: [
        { barcode: 'SUB-A', filmType: 'LD', consumedKg: 30 },
        { barcode: 'SUB-B', filmType: 'CPP', consumedKg: 20 }
      ],
      outputRoll: { barcode: 'LAM-1', netWeightKg: 150, outputType: 'SFG' }
    },
    {
      orderId: 'ORD-1',
      targetProcess: 'Slitting',
      sfgBatchCode: 'LAM-1',
      consumedKg: 150,
      outputRolls: [
        { barcode: 'FG-1', netWeightKg: 70, outputType: 'FG' },
        { barcode: 'FG-2', netWeightKg: 70, outputType: 'FG' }
      ]
    }
  ]
};

test('lineage sums the whole chain once, including multi-child and multi-substrate', () => {
  const lineage = buildRollLineage(chain);
  const print = lineage.steps.find((step) => step.stage === 'printing');
  const lam = lineage.steps.find((step) => step.stage === 'lamination1');
  const slit = lineage.steps.find((step) => step.stage === 'slitting');
  assert.equal(print.dryInkSolidsKg, 5);
  assert.equal(print.gainKg, 5);
  assert.equal(lam.addedSubstrateKg, 50);
  assert.equal(lam.lossKg, 5);
  assert.equal(slit.outputKg, 140);
  assert.equal(slit.lossKg, 10);
  assert.equal(slit.children.length, 2);
  assert.equal(slit.children[0].inputStatus, NOT_RECORDED);
  assert.equal(slit.children[1].inputKg, null);
  assert.equal(lineage.summary.rawInputKg, 100);
  assert.equal(lineage.summary.addedSubstrateKg, 50);
  assert.equal(lineage.summary.fgOutputKg, 140);
  assert.equal(lineage.summary.totalGainKg, 5);
  assert.equal(lineage.summary.totalLossKg, 15);
  assert.equal(lineage.summary.netYieldPct, 93.33);
});

test('a missing print weight stays not recorded instead of becoming the downstream output', () => {
  const lineage = buildRollLineage({
    outputRolls: [{ netWeightKg: 975.6, outputType: 'FG' }],
    inputRollsList: [],
    printedOutputKg: 0
  });
  const print = lineage.steps.find((step) => step.stage === 'printing');
  assert.equal(print.dryInkSolidsKg, undefined);
  assert.ok(print.findings.some((finding) => finding.message.includes(NOT_RECORDED)));
  assert.equal(lineage.summary.fgOutputKg, null);
});

test('the same roll cannot be consumed twice and an output cannot appear from nowhere', () => {
  const lineage = buildRollLineage({
    orderId: 'ORD-2',
    sfgConsumptions: [
      {
        orderId: 'ORD-2',
        targetProcess: 'Lamination Pass 1',
        sfgBatchCode: 'PARENT',
        consumedKg: 10,
        outputRoll: { barcode: 'OUT', netWeightKg: 80, outputType: 'SFG' }
      },
      {
        orderId: 'ORD-2',
        targetProcess: 'Lamination Pass 2',
        sfgBatchCode: 'PARENT',
        consumedKg: 10,
        outputRoll: { barcode: 'OUT-2', netWeightKg: 10, outputType: 'SFG' }
      }
    ]
  });
  assert.ok(lineage.findings.some((finding) => finding.level === 'block' && /more than once/.test(finding.message)));
  assert.ok(lineage.findings.some((finding) => finding.level === 'block' && /exceeds parent/.test(finding.message)));
});
