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

test('summarizes steps per manufacturing stage, fixes reverse logging order, and prevents lamination FG double count', () => {
  // Simulates the exact user production record from the screenshot (ORD-2026-230)
  const lineage = buildRollLineage({
    orderId: 'ORD-2026-230',
    printedOutputKg: 401,
    materialsList: [
      { filmType: 'PET 12µ', netConsumedQtyKg: 401, barcode: 'RM-PET-01' }
    ],
    sfgConsumptions: [
      // Logged in reverse order: Dispatch -> Slitting -> Lamination
      {
        orderId: 'ORD-2026-230',
        targetProcess: 'Dispatch Packing',
        sfgBatchCode: 'FG-BC-ORD2026230-0641',
        consumedKg: 287.43
      },
      {
        orderId: 'ORD-2026-230',
        targetProcess: 'Dispatch Packing',
        sfgBatchCode: 'FG-BC-ORD2026230-39557',
        consumedKg: 395.57
      },
      {
        orderId: 'ORD-2026-230',
        targetProcess: 'Dispatch Packing',
        sfgBatchCode: 'FG-BC-ORD2026230-41700',
        consumedKg: 417.00
      },
      {
        orderId: 'ORD-2026-230',
        targetProcess: 'Slitting & Rewinding',
        sfgBatchCode: 'FG-BC-ORD2026230-2601-R02',
        consumedKg: 295.00,
        outputRoll: { barcode: 'FG-BC-ORD2026230-0641', netWeightKg: 287.43, outputType: 'FG' }
      },
      {
        orderId: 'ORD-2026-230',
        targetProcess: 'Slitting & Rewinding',
        sfgBatchCode: 'FG-BC-ORD2026230-1465',
        consumedKg: 406.00,
        outputRoll: { barcode: 'FG-BC-ORD2026230-39557', netWeightKg: 395.57, outputType: 'FG' }
      },
      {
        orderId: 'ORD-2026-230',
        targetProcess: 'Slitting & Rewinding',
        sfgBatchCode: 'FG-BC-ORD2026230-4145-R02',
        consumedKg: 427.00,
        outputRoll: { barcode: 'FG-BC-ORD2026230-41700', netWeightKg: 417.00, outputType: 'FG' }
      },
      {
        orderId: 'ORD-2026-230',
        targetProcess: 'Lamination (Pass 1)',
        sfgBatchCode: 'SFG-LOT-ORD-2026-230',
        consumedKg: 401.00,
        substrate2Rolls: [
          { barcode: 'SUB-METPET', filmType: 'METPET', consumedKg: 708.60 }
        ],
        outputRolls: [
          { barcode: 'FG-BC-ORD2026230-2601-R02', netWeightKg: 295.00 },
          { barcode: 'FG-BC-ORD2026230-1465', netWeightKg: 406.00 },
          { barcode: 'FG-BC-ORD2026230-4145-R02', netWeightKg: 427.00 }
        ]
      }
    ]
  });

  // Verify summarized steps count (1 Printing, 1 Lamination, 1 Slitting, 1 Dispatch)
  assert.equal(lineage.steps.length, 4);

  const printStep = lineage.steps.find(s => s.stage === 'printing');
  const lamStep = lineage.steps.find(s => s.stage === 'lamination1');
  const slitStep = lineage.steps.find(s => s.stage === 'slitting');
  const dispatchStep = lineage.steps.find(s => s.stage === 'dispatch');

  // Printing
  assert.equal(printStep.inputKg, 401.00);
  assert.equal(printStep.outputKg, 401.00);

  // Lamination
  assert.equal(lamStep.inputKg, 401.00);
  assert.equal(lamStep.addedSubstrateKg, 708.60);
  assert.equal(lamStep.outputKg, 1128.00); // 295 + 406 + 427
  assert.equal(lamStep.gainKg, 18.40); // 1128 - (401 + 708.6) = 18.40 kg adhesive gain

  // Slitting: 3 rolls summarized into 1 row
  assert.equal(slitStep.inputKg, 1128.00); // 295 + 406 + 427
  assert.equal(slitStep.outputKg, 1100.00); // 287.43 + 395.57 + 417.00
  assert.equal(slitStep.lossKg, 28.00); // 1128 - 1100 = 28 kg trim loss

  // Dispatch Packing: 3 rolls summarized into 1 row
  assert.equal(dispatchStep.inputKg, 1100.00);
  assert.equal(dispatchStep.outputKg, 1100.00);

  // Summary Metrics
  assert.equal(lineage.summary.rawInputKg, 401.00);
  assert.equal(lineage.summary.addedSubstrateKg, 708.60);
  assert.equal(lineage.summary.fgOutputKg, 1100.00); // NOT 2228.00!
  assert.equal(lineage.summary.totalGainKg, 18.40);
  assert.equal(lineage.summary.totalLossKg, 28.00);
  assert.equal(lineage.summary.netYieldPct, 99.13); // 1100 / (401 + 708.60) = 99.13%

  // Tracing warnings should be 0 because all parent rolls and lots are known
  const tracingWarnings = lineage.findings.filter(f => f.message.includes('does not trace'));
  assert.equal(tracingWarnings.length, 0);

  // No dispatch missing weight warnings
  const dispatchWeightWarnings = lineage.findings.filter(f => f.message.includes('Dispatch Packing: weight is Not recorded'));
  assert.equal(dispatchWeightWarnings.length, 0);
});
