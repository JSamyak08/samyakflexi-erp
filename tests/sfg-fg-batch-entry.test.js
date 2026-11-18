import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSfgFgBatchPlan,
  commitSfgFgBatch,
  manualBatchCode,
  mergeLedgerMaterials,
  processKindForType,
  validateSfgFgEntry
} from '../src/utils/sfgFgBatchEntry.js';

const filmRoll = {
  barcodeId: 'RM-BC-100',
  itemId: 'ITEM-FILM',
  filmType: 'PET',
  micron: 10,
  widthMm: 910,
  availableWeightKg: 400,
  netWeightKg: 400
};
const inkItem = { id: 'ITEM-INK', itemCode: 'INK-RED', itemName: 'Red ink', category: 'Inks', availableQtyKg: 80 };
const adhesiveItem = { id: 'ITEM-ADH', itemCode: 'ADH-SL', itemName: 'Solventless adhesive', category: 'Adhesives', availableQtyKg: 40 };
const substrateRoll = {
  barcodeId: 'RM-BC-SUB',
  itemId: 'ITEM-SUB',
  filmType: 'LDPE',
  availableWeightKg: 200,
  netWeightKg: 200
};

function base(overrides = {}) {
  return {
    mode: 'SFG',
    stageType: 'Printed Rolls',
    orderId: 'ORD-2026-153',
    jobName: 'Darshan Milk Double Decker Inner',
    jobCode: 'CYL-2026-232',
    clientName: 'Nyra Chocolates Pvt Ltd',
    filmType: 'PET',
    micron: 10,
    widthMm: 910,
    machineName: 'Press 1',
    operatorName: 'Ravi',
    shift: 'Day Shift (8 AM - 8 PM)',
    storageBay: 'SFG Bay 1',
    productionDate: '2026-11-18',
    now: 1794832369356,
    outputRolls: [
      { barcodeId: 'SFG-PRN-CYL2026232-R01', grossWeightKg: 50.5, tareWeightKg: 0.5, netWeightKg: 50, lengthMeters: 4000 }
    ],
    inputRolls: [{ barcode: 'RM-BC-100', consumedKg: 48, initialKg: 400 }],
    actualMeters: 4000,
    inkGsm: 1.5,
    inkKg: 2,
    inkItemId: 'ITEM-INK',
    plainSettingKg: 0,
    printingWastageKg: 1.2,
    inventory: [inkItem, adhesiveItem, { id: 'ITEM-FILM', itemCode: 'PET-10-910', itemName: 'PET 10', category: 'Film Substrates' }],
    inventoryRolls: [filmRoll, substrateRoll],
    sfgGoods: [],
    ...overrides
  };
}

test('process kind follows the stage label and pouch laminate is not pouching', () => {
  assert.equal(processKindForType('Printed Rolls'), 'printing');
  assert.equal(processKindForType('Laminated Rolls (First Pass) for Pouch Form'), 'lamination-1');
  assert.equal(processKindForType('Laminated Rolls (Second Pass) for Roll Form'), 'lamination-2');
});

test('a manual batch code is SFG- or FG- and never inv-', () => {
  const sfg = manualBatchCode({ mode: 'SFG', jobCode: 'CYL-2026-232', orderId: 'ORD-2026-153', now: 1794832369356 });
  const fg = manualBatchCode({ mode: 'FG', jobCode: 'CYL-2026-232', orderId: 'ORD-2026-153', now: 1794832369356 });
  assert.match(sfg, /^SFG-/);
  assert.match(fg, /^FG-/);
  assert.doesNotMatch(sfg, /^inv-/);
  assert.doesNotMatch(fg, /^inv-/);
});

test('printing save payload keeps real net and gross on the printed lot and does not create an inventory master', () => {
  const plan = buildSfgFgBatchPlan(base({
    existingLot: {
      sfgBatchCode: 'SFG-LOT-ORD-2026-153',
      isPrintedLot: true,
      totalNetKg: 260,
      consumedKg: 0,
      availableKg: 260,
      childRolls: [
        { barcodeId: 'SFG-8C-CYL-2026-232-1', netWeightKg: 130.3, lengthMeters: 10000 },
        { barcodeId: 'SFG-8C-CYL-2026-232-2', netWeightKg: 129.7, lengthMeters: 10000 }
      ]
    }
  }));
  assert.equal(plan.ok, true, plan.errors?.join('\n'));
  assert.equal(plan.inventoryMaster, null);
  assert.equal(plan.createsInventoryMaster, false);
  assert.equal(plan.outputBatch, null);
  assert.equal(plan.stockRows.length, 1);
  assert.equal(plan.printedLot.sfgBatchCode, 'SFG-LOT-ORD-2026-153');
  assert.equal(plan.printedLot.totalNetKg, 310);
  assert.equal(plan.printedLot.availableKg, 310);
  assert.equal(plan.printedLot.childRolls.length, 3);
  assert.equal(plan.productionRecord.id, 'PR-ORD-2026-153');
  assert.equal(plan.productionRecord.qtyPrinting, 310);
  assert.equal(plan.productionRecord.actualMetersPrinted, 4000);
  assert.equal(plan.productionRecord.actualInkGsm, 1.5);
  assert.equal(plan.productionRecord.printingPlainSettingWastageKg, 0);
  assert.equal(plan.productionRecord.printingWastageKg, 1.2);
  assert.equal(plan.productionRecord.qtyPouching ?? null, null);
});

test('printing, lamination pass 1, and lamination pass 2 each name the missing required fields', () => {
  const printing = validateSfgFgEntry(base({
    inputRolls: [],
    actualMeters: '',
    inkGsm: '',
    inkKg: '',
    inkItemId: '',
    plainSettingKg: '',
    printingWastageKg: ''
  }));
  assert.equal(printing.ok, false);
  assert.match(printing.errors.join('\n'), /film roll barcode/i);
  assert.match(printing.errors.join('\n'), /Actual meters printed/);
  assert.match(printing.errors.join('\n'), /Ink GSM/);
  assert.match(printing.errors.join('\n'), /Ink consumed/);
  assert.match(printing.errors.join('\n'), /plain setting wastage/i);
  assert.match(printing.errors.join('\n'), /Printing wastage/);
  assert.match(printing.errors.join('\n'), /ink stock item/i);

  const pass1 = validateSfgFgEntry(base({
    mode: 'SFG',
    stageType: 'Laminated Rolls (First Pass) for Pouch Form',
    parentBarcode: '',
    parentConsumedKg: '',
    substrateRolls: [],
    adhesiveKg: '',
    adhesiveGsm: '',
    adhesiveItemId: '',
    stageMeters: '',
    laminationPlainWastageKg: '',
    laminateWastageKg: ''
  }));
  assert.equal(pass1.ok, false);
  assert.match(pass1.errors.join('\n'), /parent lot barcode/i);
  assert.match(pass1.errors.join('\n'), /substrate barcode/i);
  assert.match(pass1.errors.join('\n'), /Adhesive consumed/);
  assert.match(pass1.errors.join('\n'), /Adhesive GSM/);
  assert.match(pass1.errors.join('\n'), /Meters for lamination pass 1/);
  assert.match(pass1.errors.join('\n'), /plain substrate wastage/i);
  assert.match(pass1.errors.join('\n'), /adhesive stock item/i);

  const pass2 = validateSfgFgEntry(base({
    mode: 'FG',
    stageType: 'Laminated Rolls (Second Pass) for Roll Form',
    outputRolls: [{ barcodeId: 'FG-LAM2-R01', grossWeightKg: 40, tareWeightKg: 0, netWeightKg: 40 }],
    parentBarcode: 'SFG-LOT-ORD-2026-153',
    sfgGoods: [{ sfgBatchCode: 'SFG-LOT-ORD-2026-153', totalNetKg: 260, consumedKg: 0, availableKg: 260 }],
    parentConsumedKg: 30,
    substrateRolls: [{ barcode: 'RM-BC-SUB', consumedKg: 28, initialKg: 200 }],
    adhesiveKg: '',
    adhesiveGsm: 1.2,
    adhesiveItemId: 'ITEM-ADH',
    stageMeters: 3000,
    laminationPlainWastageKg: 0,
    laminateWastageKg: 0.4
  }));
  assert.equal(pass2.ok, false);
  assert.match(pass2.errors.join('\n'), /Adhesive consumed \(kg\) for pass 2/);
  assert.doesNotMatch(pass2.errors.join('\n'), /pass 1/);
});

test('film, ink, and adhesive each produce one ledger line on the existing item and a retry does not double the kilograms', () => {
  const first = buildSfgFgBatchPlan(base());
  assert.equal(first.ok, true, first.errors?.join('\n'));
  const lines = first.productionRecord.materialsList;
  const film = lines.find((row) => row.barcode === 'RM-BC-100');
  const ink = lines.find((row) => row.barcode === 'INK-RED');
  assert.ok(film);
  assert.ok(ink);
  assert.equal(film.stockItemId, 'ITEM-FILM');
  assert.equal(film.netConsumedQtyKg, 48);
  assert.equal(film.stage, 'Printing');
  assert.equal(ink.stockItemId, 'ITEM-INK');
  assert.equal(ink.netConsumedQtyKg, 2);
  assert.equal(lines.filter((row) => row.barcode === 'INK-RED').length, 1);
  for (const row of lines) {
    assert.doesNotMatch(row.barcode, /^(sfg-|fg-|mat-)/i);
    assert.doesNotMatch(row.id, /^inv-/);
  }

  const second = buildSfgFgBatchPlan(base({
    existingRecord: first.productionRecord,
    inkKg: 3,
    batchCode: first.batchCode
  }));
  const inkAgain = second.productionRecord.materialsList.filter((row) => row.barcode === 'INK-RED');
  assert.equal(inkAgain.length, 1);
  assert.equal(inkAgain[0].netConsumedQtyKg, 3);

  const extraBatch = buildSfgFgBatchPlan(base({
    existingRecord: second.productionRecord,
    now: 1794832369999,
    inkKg: 1
  }));
  const summed = extraBatch.productionRecord.materialsList.filter((row) => row.barcode === 'INK-RED');
  assert.equal(summed.length, 1);
  assert.equal(summed[0].netConsumedQtyKg, 4);
  assert.equal(summed[0].stockItemId, 'ITEM-INK');
});

test('a legacy film line for the same barcode is included once and stays included on the next save', () => {
  const legacy = [{
    id: 'print-film:ORD-2026-153:RM-BC-100',
    barcode: 'RM-BC-100',
    netConsumedQtyKg: 100,
    stockItemId: 'ITEM-FILM',
    itemName: 'PET'
  }];
  const plan = buildSfgFgBatchPlan(base({
    existingRecord: { id: 'PR-ORD-2026-153', orderId: 'ORD-2026-153', materialsList: legacy, sfgFgBatches: [] }
  }));
  const film = plan.productionRecord.materialsList.filter((row) => row.barcode === 'RM-BC-100');
  assert.equal(film.length, 1);
  assert.equal(film[0].netConsumedQtyKg, 148);
  assert.equal(film[0].includedLegacyKg, 100);
  const input = plan.productionRecord.inputRollsList.find((row) => row.barcodeId === 'RM-BC-100');
  assert.equal(input.consumedWeightKg, 148);

  const retry = buildSfgFgBatchPlan(base({
    existingRecord: plan.productionRecord,
    batchCode: plan.batchCode,
    inputRolls: [{ barcode: 'RM-BC-100', consumedKg: 50, initialKg: 400 }]
  }));
  const again = retry.productionRecord.materialsList.filter((row) => row.barcode === 'RM-BC-100');
  assert.equal(again.length, 1);
  assert.equal(again[0].netConsumedQtyKg, 150);
});

test('lamination reduces the parent lot once, keeps the retry from stacking, and files pouch laminate on pass 1', () => {
  const parent = {
    sfgBatchCode: 'SFG-LOT-ORD-2026-153',
    isPrintedLot: true,
    totalNetKg: 260,
    consumedKg: 0,
    availableKg: 260,
    consumptionHistory: []
  };
  const entry = base({
    stageType: 'Laminated Rolls (First Pass) for Pouch Form',
    outputRolls: [{ barcodeId: 'SFG-LAM1-R01', grossWeightKg: 80, tareWeightKg: 0, netWeightKg: 80, lengthMeters: 5000 }],
    parentBarcode: 'SFG-LOT-ORD-2026-153',
    parentConsumedKg: 70,
    parentLot: parent,
    sfgGoods: [parent],
    substrateRolls: [{ barcode: 'RM-BC-SUB', consumedKg: 20, initialKg: 200 }],
    adhesiveKg: 1.5,
    adhesiveGsm: 2,
    adhesiveItemId: 'ITEM-ADH',
    stageMeters: 5000,
    laminationPlainWastageKg: 0.5,
    laminateWastageKg: 0
  });
  const plan = buildSfgFgBatchPlan(entry);
  assert.equal(plan.ok, true, plan.errors?.join('\n'));
  assert.equal(plan.printedLot, null);
  assert.equal(plan.outputBatch.sfgBatchCode.startsWith('SFG-'), true);
  assert.doesNotMatch(plan.outputBatch.sfgBatchCode, /^inv-/);
  assert.equal(plan.outputBatch.totalNetKg, 80);
  assert.equal(plan.outputBatch.totalGrossKg, 80);
  assert.equal(plan.outputBatch.availableKg, 80);
  assert.equal(plan.outputBatch.childRolls.length, 1);
  assert.equal(plan.outputBatch.childRolls[0].netWeightKg, 80);
  assert.equal(plan.parentLot.consumedKg, 70);
  assert.equal(plan.parentLot.availableKg, 190);
  assert.equal(plan.productionRecord.qtyLaminationL1, 80);
  assert.equal(plan.productionRecord.qtyPouching ?? null, null);
  assert.equal(plan.productionRecord.adhesiveConsumedL1Kg, 1.5);
  assert.equal(plan.productionRecord.actualAdhesiveGsm, 2);
  assert.equal(plan.productionRecord.laminationMetersL1, 5000);
  assert.equal(plan.stockRows.length, 1);
  const adhesive = plan.productionRecord.materialsList.find((row) => row.stockItemId === 'ITEM-ADH');
  const substrate = plan.productionRecord.materialsList.find((row) => row.barcode === 'RM-BC-SUB');
  assert.equal(adhesive.netConsumedQtyKg, 1.5);
  assert.equal(adhesive.stage, 'Lamination (Pass 1)');
  assert.equal(substrate.netConsumedQtyKg, 20);
  assert.equal(plan.productionRecord.sfgConsumptions.length, 1);

  const retry = buildSfgFgBatchPlan({
    ...entry,
    batchCode: plan.batchCode,
    parentLot: plan.parentLot,
    parentConsumedKg: 75,
    existingRecord: plan.productionRecord
  });
  assert.equal(retry.parentLot.consumedKg, 75);
  assert.equal(retry.parentLot.availableKg, 185);
  assert.equal(retry.productionRecord.qtyLaminationL1, 80);
  assert.equal(retry.productionRecord.materialsList.filter((row) => row.barcode === 'RM-BC-SUB').length, 1);
});

test('finished goods dispatch kilograms are this FG batch only, not earlier SFG rolls', () => {
  const existing = {
    id: 'PR-ORD-2026-153',
    orderId: 'ORD-2026-153',
    qtyDispatch: 0,
    qtyPouching: 12,
    outputRolls: [{ barcodeId: 'SFG-OLD', netWeightKg: 260, batchCode: 'SFG-OLD', rollType: 'SFG' }],
    sfgFgBatches: []
  };
  const plan = buildSfgFgBatchPlan(base({
    mode: 'FG',
    stageType: 'Laminated Rolls (First Pass) for Roll Form',
    outputRolls: [{ barcodeId: 'FG-LAM1-R01', grossWeightKg: 42, tareWeightKg: 0, netWeightKg: 42 }],
    existingRecord: existing,
    parentBarcode: 'SFG-LOT-ORD-2026-153',
    parentConsumedKg: 40,
    sfgGoods: [{ sfgBatchCode: 'SFG-LOT-ORD-2026-153', totalNetKg: 260, consumedKg: 0, availableKg: 260 }],
    substrateRolls: [{ barcode: 'RM-BC-SUB', consumedKg: 10, initialKg: 200 }],
    adhesiveKg: 1,
    adhesiveGsm: 1.4,
    adhesiveItemId: 'ITEM-ADH',
    stageMeters: 2500,
    laminationPlainWastageKg: 0,
    laminateWastageKg: 0
  }));
  assert.equal(plan.ok, true, plan.errors?.join('\n'));
  assert.equal(plan.productionRecord.qtyDispatch, 42);
  assert.equal(plan.productionRecord.qtyPouching, 12);
  assert.equal(plan.productionRecord.qtyLaminationL1, 42);
  assert.equal(plan.outputBatch.sfgBatchCode.startsWith('FG-'), true);
  assert.equal(plan.outputBatch.totalNetKg, 42);
  assert.equal(plan.outputBatch.availableKg, 42);
});

test('pass 2 adhesive GSM is stored on its own field and the ledger line is pass 2', () => {
  const plan = buildSfgFgBatchPlan(base({
    mode: 'FG',
    stageType: 'Laminated Rolls (Second Pass) for Roll Form',
    outputRolls: [{ barcodeId: 'FG-LAM2-R01', grossWeightKg: 30, tareWeightKg: 0, netWeightKg: 30 }],
    parentBarcode: 'SFG-LAM1',
    parentConsumedKg: 28,
    sfgGoods: [{ sfgBatchCode: 'SFG-LAM1', totalNetKg: 80, consumedKg: 0, availableKg: 80 }],
    substrateRolls: [{ barcode: 'RM-BC-SUB', consumedKg: 8, initialKg: 200 }],
    adhesiveKg: 0.8,
    adhesiveGsm: 1.8,
    adhesiveItemId: 'ITEM-ADH',
    stageMeters: 1800,
    laminationPlainWastageKg: 0,
    laminateWastageKg: 0.2
  }));
  assert.equal(plan.ok, true, plan.errors?.join('\n'));
  assert.equal(plan.productionRecord.qtySecondPassL2, 30);
  assert.equal(plan.productionRecord.actualAdhesiveGsmL2, 1.8);
  assert.equal(plan.productionRecord.laminationMetersL2, 1800);
  assert.equal(plan.productionRecord.adhesiveConsumedL2Kg, 0.8);
  assert.equal(plan.productionRecord.qtyLaminationL1 ?? null, null);
  const adhesive = plan.productionRecord.materialsList.find((row) => row.stockItemId === 'ITEM-ADH');
  assert.equal(adhesive.stage, 'Lamination (Pass 2)');
});

test('an unsafe stock barcode is rewritten so the ledger trigger does not skip it', () => {
  const lines = mergeLedgerMaterials([], [{
    orderId: 'ORD-1',
    ledgerLines: [{
      barcode: 'stk-SFG-INK',
      netConsumedQtyKg: 2,
      stockItemId: 'ITEM-INK',
      itemName: 'Ink',
      stage: 'Printing',
      initialKg: 2
    }]
  }]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].barcode, 'stk-SFG-INK');
  assert.doesNotMatch(lines[0].barcode, /^(sfg-|fg-|mat-)/i);
  assert.equal(lines[0].stockItemId, 'ITEM-INK');
});

test('commit writes the production record before stock and does not ask for an inventory master', async () => {
  const plan = buildSfgFgBatchPlan(base());
  const calls = [];
  await commitSfgFgBatch({
    plan,
    saveProductionRecord: async (record) => { calls.push(`record:${record.id}`); },
    saveSfgGood: async (item) => { calls.push(`sfg:${item.sfgBatchCode}`); }
  });
  assert.deepEqual(calls, ['record:PR-ORD-2026-153', 'sfg:SFG-LOT-ORD-2026-153']);
  assert.equal(plan.inventoryMaster, null);

  await assert.rejects(
    () => commitSfgFgBatch({
      plan,
      saveProductionRecord: async () => { throw new Error('record failed'); },
      saveSfgGood: async () => { calls.push('sfg-should-not-run'); }
    }),
    /record failed/
  );
  assert.equal(calls.includes('sfg-should-not-run'), false);
});
