import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  additionalSubstrate2Materials,
  assignOutputBarcodes,
  buildChildOutputRoll,
  buildLegacyOutputRoll,
  buildLegacySubstrateInfo,
  buildSubstrate2RollList,
  consumptionOutputNetKg,
  consumptionOutputTrace,
  legacyOutputBarcode,
  nextAdditionalOutputBarcode,
  outputOverReferenceWarning,
  outputReferenceKg,
  outputRollsFromLog,
  resolveInputSubstrateBarcodes,
  sharedInputWeight,
  substrate2InputRolls,
  substrate2RollsFromLog,
  sumOutputNet,
  sumSubstrateConsumed,
  validateAddedConsumeRows
} from '../src/utils/consumeRollEntries.js';

const LEGACY_OUTPUT_KEYS = [
  'barcode', 'outputType', 'grossWeightKg', 'tareWeightKg', 'netWeightKg',
  'storageBay', 'stage', 'pouchCount', 'timestamp'
];

test('one output roll matches the previous consume payload', () => {
  const roll = buildLegacyOutputRoll({
    barcode: 'SFG-BC-ORD12-4321',
    outputType: 'SFG',
    orderId: 'ORD-12',
    nowMs: 1710000004321,
    grossWeightKg: 52.8,
    tareWeightKg: 0.8,
    netWeightKg: 52,
    storageBay: 'Bay A',
    stage: 'Lamination (Pass 1)',
    pouchCount: 0,
    timestamp: '2026-10-23T00:00:00.000Z'
  });
  assert.deepEqual(Object.keys(roll), LEGACY_OUTPUT_KEYS);
  assert.equal(roll.barcode, 'SFG-BC-ORD12-4321');
  assert.equal(roll.parentSfgBatchCode, undefined);
  assert.equal('outputRolls' in roll, false);

  const fallback = buildLegacyOutputRoll({
    barcode: '',
    outputType: 'FG',
    orderId: 'ORD-9',
    nowMs: 1710000004321,
    grossWeightKg: 10,
    tareWeightKg: 0.5,
    netWeightKg: 9.5,
    storageBay: '',
    stage: 'Slitting & Rewinding',
    pouchCount: 0,
    timestamp: '2026-10-23T00:00:00.000Z'
  });
  assert.equal(fallback.barcode, 'FG-BC-ORD-9-4321');
  assert.equal(fallback.storageBay, 'FG Warehouse');
});

test('one substrate roll matches the previous substrate object and substrate 3 is untouched', () => {
  const info = buildLegacySubstrateInfo(' RM-PET-1 ', 'PET 12', '100', '40');
  assert.deepEqual(info, {
    barcode: 'RM-PET-1',
    filmType: 'PET 12',
    initialKg: 100,
    consumedKg: 40,
    remainingKg: 60
  });
  assert.equal(buildLegacySubstrateInfo('', '', '', ''), null);
  assert.equal(buildSubstrate2RollList(info, []).length, 1);
  assert.equal(additionalSubstrate2Materials({ substrate2: info }).length, 0);

  const oldLog = {
    id: 'SFG-LOG-1',
    sfgBatchCode: 'SFG-PARENT',
    consumedKg: 100,
    targetProcess: 'Lamination (Pass 2)',
    substrate2: null,
    substrate3: { barcode: 'RM-SUB3', filmType: 'LD', initialKg: 80, consumedKg: 30, remainingKg: 50 },
    outputRoll: {
      barcode: 'SFG-BC-1',
      outputType: 'SFG',
      netWeightKg: 120,
      grossWeightKg: 120.8,
      tareWeightKg: 0.8
    }
  };
  assert.deepEqual(substrate2RollsFromLog(oldLog), []);
  assert.equal(substrate2InputRolls(oldLog).length, 0);
  assert.deepEqual(outputRollsFromLog(oldLog), [oldLog.outputRoll]);
  assert.equal(consumptionOutputNetKg(oldLog), 120);
  const trace = consumptionOutputTrace(oldLog);
  assert.deepEqual(trace.inputSubstrateBarcodes, ['SFG-PARENT', 'RM-SUB3']);
  assert.equal(trace.inputRollsTraceability[1].filmType, 'LD');
  assert.equal(trace.inputRollsTraceability[1].consumedWeightKg, 30);
});

test('a single substrate 2 log still becomes one input roll with the old id', () => {
  const log = {
    id: 'SFG-LOG-9',
    targetProcess: 'Lamination (Pass 1)',
    substrate2: { barcode: 'RM-2', filmType: 'MetPET', initialKg: 50, consumedKg: 20 }
  };
  const rolls = substrate2InputRolls(log);
  assert.equal(rolls.length, 1);
  assert.equal(rolls[0].id, 'sub2-cons-SFG-LOG-9');
  assert.equal(rolls[0].barcodeId, 'RM-2');
  assert.equal(rolls[0].consumedWeightKg, 20);
  assert.equal(rolls[0].initialWeightKg, 50);
  assert.equal(rolls[0].source, 'SFG Store (Lamination (Pass 1))');
});

test('added substrate 2 rolls are required, summed, and keep the first row shape', () => {
  const first = buildLegacySubstrateInfo('RM-A', 'PET', '400', '200');
  const extras = [
    { barcode: 'RM-B', filmType: 'LD', initialKg: '150', consumedKg: '100' },
    { barcode: '', filmType: '', initialKg: '', consumedKg: '' }
  ];
  const missing = validateAddedConsumeRows({
    substrateExtras: extras,
    firstSubstrateBarcode: 'RM-A',
    parentBatchCode: 'SFG-PARENT'
  });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /Substrate 2 roll 3 needs a roll barcode/);

  const over = validateAddedConsumeRows({
    substrateExtras: [{ barcode: 'RM-B', initialKg: '40', consumedKg: '50' }],
    firstSubstrateBarcode: 'RM-A'
  });
  assert.match(over.error, /cannot exceed initial roll balance/);

  const duplicate = validateAddedConsumeRows({
    substrateExtras: [{ barcode: 'rm-a', initialKg: '10', consumedKg: '5' }],
    firstSubstrateBarcode: 'RM-A'
  });
  assert.match(duplicate.error, /already used/);

  const parent = validateAddedConsumeRows({
    substrateExtras: [{ barcode: 'SFG-PARENT', initialKg: '10', consumedKg: '5' }],
    parentBatchCode: 'SFG-PARENT'
  });
  assert.match(parent.error, /same roll that is being consumed/);

  const okExtras = [
    { barcode: 'RM-B', filmType: 'LD', initialKg: '150', consumedKg: '100' },
    { barcode: 'RM-C', filmType: 'CPP', initialKg: '80', consumedKg: '80' }
  ];
  assert.equal(validateAddedConsumeRows({
    substrateExtras: okExtras,
    firstSubstrateBarcode: 'RM-A',
    parentBatchCode: 'SFG-PARENT'
  }).ok, true);
  assert.equal(sumSubstrateConsumed('200', okExtras), 380);

  const list = buildSubstrate2RollList(first, okExtras);
  assert.equal(list.length, 3);
  assert.deepEqual(Object.keys(list[1]), Object.keys(first));
  const log = { id: 'L1', substrate2: first, substrate2Rolls: list, targetProcess: 'Lamination (Pass 1)' };
  assert.equal(substrate2InputRolls(log).length, 3);
  assert.equal(additionalSubstrate2Materials(log).length, 2);
  assert.equal(additionalSubstrate2Materials(log)[0].barcode, 'RM-B');
  assert.equal(additionalSubstrate2Materials({ substrate2: first }).length, 0);
});

test('child output barcodes are unique without random ids and the first barcode is kept', () => {
  const source = fs.readFileSync(new URL('../src/utils/consumeRollEntries.js', import.meta.url), 'utf8');
  assert.equal(source.includes('Math.random'), false);
  assert.equal(legacyOutputBarcode('SFG', 'ORD-1', 1710000004321), 'SFG-BC-ORD-1-4321');

  const rows = [
    { barcode: 'SFG-BC-ORD1-4321', outputType: 'SFG' },
    { barcode: 'SFG-BC-ORD1-4321', outputType: 'SFG' },
    { barcode: 'SFG-BC-TAKEN-0099', outputType: 'FG' },
    { barcode: 'SFG-BC-HAND-1', outputType: 'SFG' }
  ];
  const barcodes = assignOutputBarcodes(rows, {
    orderId: 'ORD1',
    nowMs: 1710000004321,
    takenCodes: ['SFG-BC-TAKEN-0099', 'SFG-BC-ORD1-4321-R02']
  });
  assert.equal(barcodes[0], 'SFG-BC-ORD1-4321');
  assert.equal(barcodes[1], 'SFG-BC-ORD1-4321-R03');
  assert.notEqual(barcodes[2], 'SFG-BC-TAKEN-0099');
  assert.match(barcodes[2], /-R\d{2}$/);
  assert.equal(barcodes[3], 'SFG-BC-HAND-1');
  assert.equal(new Set(barcodes).size, barcodes.length);

  const added = nextAdditionalOutputBarcode({
    outputType: 'SFG',
    orderId: 'ORD1',
    nowMs: 1710000004321,
    takenCodes: ['SFG-BC-ORD1-4321', 'SFG-BC-ORD1-4321-R02']
  });
  assert.equal(added, 'SFG-BC-ORD1-4321-R03');
});

test('several child rolls require a quantity each and do not hard-cap output above input', () => {
  assert.equal(validateAddedConsumeRows({
    outputExtras: [],
    firstOutputGross: ''
  }).ok, true);

  const missingFirst = validateAddedConsumeRows({
    outputExtras: [{ barcode: 'B', grossKg: '10', tareKg: '0.8', outputType: 'SFG' }],
    firstOutputGross: '',
    firstOutputTare: '0.8'
  });
  assert.match(missingFirst.error, /Roll 1 is missing a net quantity/);

  const lightTare = validateAddedConsumeRows({
    outputExtras: [{ barcode: 'B', grossKg: '0.2', tareKg: '0.8', outputType: 'SFG' }],
    firstOutputGross: '10',
    firstOutputTare: '0.8'
  });
  assert.match(lightTare.error, /gross weight cannot be less than tare weight/);

  assert.equal(validateAddedConsumeRows({
    outputExtras: [
      { barcode: 'SFG-BC-1-R02', grossKg: '250.8', tareKg: '0.8', outputType: 'SFG' },
      { barcode: 'FG-BC-1-R03', grossKg: '100', tareKg: '0', outputType: 'FG' }
    ],
    firstOutputGross: '250.8',
    firstOutputTare: '0.8'
  }).ok, true);

  assert.equal(sumOutputNet('250.8', '0.8', [
    { grossKg: '250.8', tareKg: '0.8' },
    { grossKg: '250.8', tareKg: '0.8' },
    { grossKg: '250.8', tareKg: '0.8' }
  ]), 1000);

  const reference = outputReferenceKg(1000, 80);
  assert.equal(reference, 1080);
  const warning = outputOverReferenceWarning({ outputNetKg: 1100, consumedKg: 1000, substrateConsumedKg: 80 });
  assert.match(warning, /still allowed/);
  assert.equal(outputOverReferenceWarning({ outputNetKg: 1080, consumedKg: 1000, substrateConsumedKg: 80 }), '');

  const child = buildChildOutputRoll({
    barcode: 'SFG-BC-1-R02',
    outputType: 'SFG',
    grossWeightKg: 250.8,
    tareWeightKg: 0.8,
    storageBay: 'Bay A',
    stage: 'Lamination (Pass 1)',
    pouchCount: 0,
    timestamp: '2026-10-23T00:00:00.000Z',
    parentSfgBatchCode: 'SFG-PARENT'
  });
  assert.equal(child.netWeightKg, 250);
  assert.equal(child.parentBarcode, 'SFG-PARENT');
  assert.deepEqual(Object.keys(child).slice(0, LEGACY_OUTPUT_KEYS.length), LEGACY_OUTPUT_KEYS);

  const multiLog = {
    outputRoll: null,
    outputRolls: [
      { barcode: 'A', netWeightKg: 250, outputType: 'SFG' },
      { barcode: 'B', netWeightKg: 250, outputType: 'FG' }
    ]
  };
  assert.equal(consumptionOutputNetKg(multiLog), 500);
  assert.equal(outputRollsFromLog(multiLog).length, 2);
});

test('parent links do not change input matching for older rolls', () => {
  assert.deepEqual(resolveInputSubstrateBarcodes({
    inputBarcodeIds: ['RM-OLD'],
    inputRollsTraceability: []
  }), []);
  assert.deepEqual(resolveInputSubstrateBarcodes({
    inputSubstrateBarcodes: ['SFG-PARENT'],
    inputBarcodeIds: ['OTHER'],
    parentSfgBatchCode: 'SFG-PARENT'
  }), ['SFG-PARENT']);
  assert.deepEqual(resolveInputSubstrateBarcodes({
    parentSfgBatchCode: 'SFG-PARENT',
    inputBarcodeIds: ['SFG-PARENT']
  }), ['SFG-PARENT']);

  const full = 1000;
  assert.equal(sharedInputWeight({ netWeightKg: 250 }, [], full), full);
  const siblings = [
    { parentSfgBatchCode: 'P', netWeightKg: 250 },
    { parentSfgBatchCode: 'P', netWeightKg: 750 }
  ];
  assert.equal(sharedInputWeight(siblings[0], siblings, full), 250);
  assert.equal(sharedInputWeight(siblings[1], siblings, full), 750);
  assert.equal(sharedInputWeight({ netWeightKg: 250, parentSfgBatchCode: '' }, siblings, full), full);
});
