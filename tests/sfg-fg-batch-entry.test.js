import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { roleCanEditSfgStore } from '../src/bootAccess.js';
import { sfgStoreUi } from '../src/sfgStoreAccess.js';
import { dispatchSelectableLots } from '../src/utils/finishedGoods.js';
import {
  OPENING_BALANCE_BADGE,
  OPENING_BALANCE_TOGGLE_LABEL,
  SLITTED_FG_TYPE,
  buildSfgFgBatchPlan,
  commitSfgFgBatch,
  filmMassCeilingKg,
  shareMetersByWeight,
  manualBatchCode,
  mergeLedgerMaterials,
  openingBalanceStoreLabel,
  processKindForType,
  processRecordBlockVisible,
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

function openingEntry(overrides = {}) {
  return base({
    isOpeningBalance: true,
    productionDate: '2026-10-02',
    enteredBy: 'Samyak',
    enteredAt: '2026-11-18T08:30:00.000Z',
    ...overrides
  });
}

const priorRecord = {
  id: 'PR-ORD-2026-153',
  orderId: 'ORD-2026-153',
  jobName: 'Darshan Milk Double Decker Inner',
  jobCode: 'CYL-2026-232',
  machineName: 'Press kept',
  operatorName: 'Kept operator',
  shift: 'Night Shift (8 PM - 8 AM)',
  qtyPrinting: 260,
  actualMetersPrinted: 9000,
  printingPlainSettingWastageKg: 1,
  printingWastageKg: 4,
  qtyLaminationL1: 12,
  laminationMetersL1: 800,
  adhesiveConsumedL1Kg: 1.1,
  totalScrapQtyKg: 5,
  totalWastageKg: 5,
  materialsList: [{ id: 'keep-film', barcode: 'RM-BC-100', netConsumedQtyKg: 100, stockItemId: 'ITEM-FILM' }],
  inputRollsList: [{ barcodeId: 'RM-BC-100', consumedWeightKg: 100 }],
  sfgConsumptions: [{ id: 'keep-log', batchCode: 'OLD', consumedKg: 10 }],
  sfgFgBatches: [],
  outputRolls: [{ barcodeId: 'SFG-OLD', netWeightKg: 260, batchCode: 'SFG-OLD' }]
};

test('opening balance hides the process record and skips film, parent, ink, adhesive, meters, and wastage', () => {
  assert.equal(processRecordBlockVisible({ selectedType: 'Printed Rolls', isOpeningBalance: false, processKind: 'printing' }), true);
  assert.equal(processRecordBlockVisible({ selectedType: 'Printed Rolls', isOpeningBalance: true, processKind: 'printing' }), false);
  assert.equal(processRecordBlockVisible({ selectedType: 'Laminated Rolls (First Pass) for Pouch Form', isOpeningBalance: true, processKind: 'lamination-1' }), false);
  assert.equal(processRecordBlockVisible({ selectedType: '', isOpeningBalance: false, processKind: '' }), false);

  const skipped = validateSfgFgEntry(openingEntry({
    inputRolls: [],
    actualMeters: '',
    inkGsm: '',
    inkKg: '',
    inkItemId: '',
    plainSettingKg: '',
    printingWastageKg: '',
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
  assert.equal(skipped.ok, true, skipped.errors.join('\n'));

  const missingDate = validateSfgFgEntry(openingEntry({ productionDate: '' }));
  assert.equal(missingDate.ok, false);
  assert.match(missingDate.errors.join('\n'), /Production date is required for opening balance/);
  assert.doesNotMatch(missingDate.errors.join('\n'), /film roll barcode/i);
  assert.doesNotMatch(missingDate.errors.join('\n'), /Ink consumed/);
  assert.doesNotMatch(missingDate.errors.join('\n'), /parent lot barcode/i);

  const modal = fs.readFileSync(new URL('../src/components/SFGFGEntryModal.jsx', import.meta.url), 'utf8');
  assert.match(modal, /OPENING_BALANCE_TOGGLE_LABEL/);
  assert.match(modal, /data-testid="sfg-opening-balance"/);
  assert.match(modal, /data-testid="sfg-opening-production-date"/);
  assert.match(modal, /processRecordBlockVisible\(\{ selectedType, isOpeningBalance, processKind \}\)/);
  assert.match(modal, /data-testid="sfg-process-record"/);
});

test('the opening-balance toggle hides the process record on the Add Batch form', async () => {
  const { Window } = await import('happy-dom');
  const win = new Window({ url: 'http://localhost/sfg-store' });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent
  };
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.Node = win.Node;
  globalThis.Event = win.Event;
  globalThis.MouseEvent = win.MouseEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true }
  });
  try {
    const mod = await server.ssrLoadModule('/src/components/SFGFGEntryModal.jsx');
    const Modal = mod.default;
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    const host = win.document.createElement('div');
    win.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(Modal, {
        mode: 'SFG',
        orders: [{ id: 'ORD-2026-153', jobName: 'Darshan Milk', clientName: 'Nyra', orderQtyKg: 100 }],
        jobMasters: [],
        machines: [{ id: 'press-1', name: 'Press 1', status: 'Active' }],
        currentUser: { name: 'Samyak', role: 'Admin' },
        onClose: () => {},
        onSave: async () => {}
      }));
    });
    const textOf = () => host.textContent || '';
    assert.match(textOf(), new RegExp(OPENING_BALANCE_TOGGLE_LABEL.replace(/[()]/g, '\\$&')));
    assert.equal(host.querySelector('[data-testid="sfg-process-record"]'), null);
    assert.equal(host.querySelector('[data-testid="sfg-opening-production-date"]'), null);

    const typeLabel = [...host.querySelectorAll('label')].find((node) => /SFG Process Type/.test(node.textContent || ''));
    const typeBox = typeLabel?.parentElement?.querySelector('[role="combobox"]');
    assert.ok(typeBox);
    await act(async () => { typeBox.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
    const printed = [...host.querySelectorAll('[role="option"]')].find((node) => node.textContent === 'Printed Rolls');
    assert.ok(printed);
    await act(async () => { printed.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
    assert.ok(host.querySelector('[data-testid="sfg-process-record"]'));
    assert.match(textOf(), /Film rolls consumed/);

    const toggle = host.querySelector('[data-testid="sfg-opening-balance"]');
    await act(async () => { toggle.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
    assert.equal(host.querySelector('[data-testid="sfg-process-record"]'), null);
    assert.equal(toggle.checked, true);
    const date = host.querySelector('[data-testid="sfg-opening-production-date"]');
    assert.equal(date.type, 'date');
    assert.match(date.value, /^\d{4}-\d{2}-\d{2}$/);

    await act(async () => { toggle.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
    assert.equal(toggle.checked, false);
    assert.ok(host.querySelector('[data-testid="sfg-process-record"]'));
    assert.equal(host.querySelector('[data-testid="sfg-opening-production-date"]'), null);
    await act(async () => { root.unmount(); });

    const service = await server.ssrLoadModule('/src/services/supabaseDataService.js');
    const plain = JSON.parse(service.buildSfgNotesEnvelope({
      sfgBatchCode: 'SFG-1',
      sfgType: 'Printed Rolls',
      totalNetKg: 10,
      jobName: 'Job'
    }));
    assert.equal(plain.isOpeningBalance, undefined);
    const marked = JSON.parse(service.buildSfgNotesEnvelope({
      sfgBatchCode: 'FG-1',
      sfgType: 'Slitted Rolls',
      totalNetKg: 22,
      jobName: 'Job',
      isOpeningBalance: true,
      openingBalanceEnteredBy: 'Samyak',
      openingBalanceEnteredAt: '2026-11-18T08:30:00.000Z'
    }));
    assert.equal(marked.isOpeningBalance, true);
    assert.equal(marked.openingBalanceEnteredBy, 'Samyak');
    assert.equal(marked.openingBalanceEnteredAt, '2026-11-18T08:30:00.000Z');
  } finally {
    await server.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
  }
});

test('an opening-balance batch is an audit line and does not change consumption, quantity, meters, or wastage', () => {
  const parent = {
    sfgBatchCode: 'SFG-LOT-ORD-2026-153',
    totalNetKg: 260,
    consumedKg: 40,
    availableKg: 220,
    consumptionHistory: []
  };
  const plan = buildSfgFgBatchPlan(openingEntry({
    existingRecord: priorRecord,
    existingLot: {
      id: 'lot-1',
      sfgBatchCode: 'SFG-LOT-ORD-2026-153',
      isPrintedLot: true,
      totalNetKg: 260,
      totalMeters: 9000,
      consumedKg: 40,
      availableKg: 220,
      inputBarcodeIds: ['RM-BC-100'],
      childRolls: [
        { barcodeId: 'SFG-8C-1', netWeightKg: 130 },
        { barcodeId: 'SFG-8C-2', netWeightKg: 130 }
      ]
    },
    parentBarcode: parent.sfgBatchCode,
    parentConsumedKg: 70,
    parentLot: parent,
    inkKg: 9,
    inputRolls: [{ barcode: 'RM-BC-100', consumedKg: 48, initialKg: 400 }]
  }));
  assert.equal(plan.ok, true, plan.errors?.join('\n'));
  assert.equal(plan.inventoryMaster, null);
  assert.equal(plan.parentLot, null);
  assert.equal(parent.consumedKg, 40);
  assert.equal(plan.createsInventoryMaster, false);
  const record = plan.productionRecord;
  assert.equal(record.id, 'PR-ORD-2026-153');
  assert.equal(record.sfgFgBatches.length, 1);
  assert.equal(record.sfgFgBatches[0].isOpeningBalance, true);
  assert.deepEqual(record.sfgFgBatches[0].ledgerLines, []);
  assert.equal(record.sfgFgBatches[0].parentConsumedKg, 0);
  assert.equal(record.sfgFgBatches[0].meters, 0);
  assert.deepEqual(record.materialsList, priorRecord.materialsList);
  assert.deepEqual(record.inputRollsList, priorRecord.inputRollsList);
  assert.deepEqual(record.sfgConsumptions, priorRecord.sfgConsumptions);
  assert.deepEqual(record.outputRolls, priorRecord.outputRolls);
  assert.equal(record.qtyPrinting, 260);
  assert.equal(record.actualMetersPrinted, 9000);
  assert.equal(record.printingWastageKg, 4);
  assert.equal(record.printingPlainSettingWastageKg, 1);
  assert.equal(record.qtyLaminationL1, 12);
  assert.equal(record.laminationMetersL1, 800);
  assert.equal(record.adhesiveConsumedL1Kg, 1.1);
  assert.equal(record.totalScrapQtyKg, 5);
  assert.equal(record.machineName, 'Press kept');
  assert.equal(plan.printedLot.sfgBatchCode, 'SFG-LOT-ORD-2026-153');
  assert.equal(plan.printedLot.totalNetKg, 310);
  assert.equal(plan.printedLot.consumedKg, 40);
  assert.equal(plan.printedLot.availableKg, 270);
  assert.equal(plan.printedLot.totalMeters, 13000);
  assert.deepEqual(plan.printedLot.inputBarcodeIds, ['RM-BC-100']);
  assert.equal(plan.printedLot.childRolls.length, 3);
  assert.equal(plan.printedLot.childRolls.find((roll) => roll.barcodeId === 'SFG-PRN-CYL2026232-R01').isOpeningBalance, true);
  assert.equal(plan.printedLot.childRolls.find((roll) => roll.barcodeId === 'SFG-8C-1').isOpeningBalance, undefined);
  assert.equal(plan.printedLot.isOpeningBalance, true);
  assert.equal(plan.printedLot.openingBalanceEnteredBy, 'Samyak');
  assert.equal(plan.printedLot.openingBalanceEnteredAt, '2026-11-18T08:30:00.000Z');
  assert.equal(plan.outputBatch, null);
});

test('opening printed rolls create SFG-LOT when the job does not have one yet', () => {
  const plan = buildSfgFgBatchPlan(openingEntry());
  assert.equal(plan.ok, true, plan.errors?.join('\n'));
  assert.equal(plan.printedLot.sfgBatchCode, 'SFG-LOT-ORD-2026-153');
  assert.equal(plan.printedLot.isPrintedLot, true);
  assert.equal(plan.printedLot.totalNetKg, 50);
  assert.equal(plan.printedLot.childRolls.length, 1);
  assert.equal(plan.productionRecord.id, 'PR-ORD-2026-153');
  assert.deepEqual(plan.productionRecord.materialsList, []);
  assert.deepEqual(plan.productionRecord.sfgConsumptions, []);
  assert.deepEqual(plan.productionRecord.inputRollsList, []);
});

test('opening laminated stock keeps the SFG or FG prefix and does not reduce the parent lot', async () => {
  const parent = {
    sfgBatchCode: 'SFG-LOT-ORD-2026-153',
    totalNetKg: 260,
    consumedKg: 0,
    availableKg: 260,
    consumptionHistory: []
  };
  const plan = buildSfgFgBatchPlan(openingEntry({
    stageType: 'Laminated Rolls (First Pass) for Pouch Form',
    outputRolls: [{ barcodeId: 'SFG-LAM1-R01', grossWeightKg: 80, tareWeightKg: 0, netWeightKg: 80, lengthMeters: 5000 }],
    parentBarcode: parent.sfgBatchCode,
    parentConsumedKg: 70,
    parentLot: parent,
    sfgGoods: [parent],
    substrateRolls: [{ barcode: 'RM-BC-SUB', consumedKg: 20, initialKg: 200 }],
    adhesiveKg: 1.5,
    adhesiveItemId: 'ITEM-ADH',
    stageMeters: 5000
  }));
  assert.equal(plan.ok, true, plan.errors?.join('\n'));
  assert.equal(plan.printedLot, null);
  assert.equal(plan.parentLot, null);
  assert.equal(parent.consumedKg, 0);
  assert.match(plan.outputBatch.sfgBatchCode, /^SFG-/);
  assert.equal(plan.outputBatch.totalNetKg, 80);
  assert.equal(plan.outputBatch.availableKg, 80);
  assert.equal(plan.outputBatch.isOpeningBalance, true);
  assert.equal(plan.outputBatch.parentSfgBatchCode, undefined);
  assert.equal(plan.productionRecord.sfgConsumptions.length, 0);
  assert.equal(plan.productionRecord.materialsList.length, 0);
  const calls = [];
  await commitSfgFgBatch({
    plan,
    saveProductionRecord: async (record) => { calls.push(`record:${record.id}`); },
    saveSfgGood: async (item) => { calls.push(`sfg:${item.sfgBatchCode}`); }
  });
  assert.deepEqual(calls, [`record:PR-ORD-2026-153`, `sfg:${plan.outputBatch.sfgBatchCode}`]);
});

test('Slitted Rolls are an FG opening-balance type and are eligible for dispatch', () => {
  assert.equal(processKindForType(SLITTED_FG_TYPE), 'slitting');
  assert.equal(processKindForType('Laminated Rolls (Second Pass) for Roll Form'), 'lamination-2');
  const modal = fs.readFileSync(new URL('../src/components/SFGFGEntryModal.jsx', import.meta.url), 'utf8');
  assert.match(modal, /Slitted Rolls/);
  const blocked = buildSfgFgBatchPlan(base({
    mode: 'FG',
    stageType: SLITTED_FG_TYPE,
    outputRolls: [{ barcodeId: 'FG-SLT-R01', grossWeightKg: 22, tareWeightKg: 0, netWeightKg: 22 }]
  }));
  assert.equal(blocked.ok, false);
  assert.match(blocked.errors.join('\n'), /opening-balance stock/);
  assert.match(blocked.errors.join('\n'), /Consume/);

  const plan = buildSfgFgBatchPlan(openingEntry({
    mode: 'FG',
    stageType: SLITTED_FG_TYPE,
    outputRolls: [{ barcodeId: 'FG-SLT-CYL-R01', grossWeightKg: 22, tareWeightKg: 0, netWeightKg: 22 }]
  }));
  assert.equal(plan.ok, true, plan.errors?.join('\n'));
  assert.match(plan.outputBatch.sfgBatchCode, /^FG-/);
  assert.equal(plan.outputBatch.rollType, 'FG');
  assert.equal(plan.outputBatch.category, 'Finished Goods (FG)');
  assert.equal(plan.outputBatch.status, 'In Stock (Ready for Dispatch)');
  assert.equal(plan.outputBatch.isOpeningBalance, true);
  assert.equal(plan.parentLot, null);
  assert.equal(plan.printedLot, null);
  const printed = buildSfgFgBatchPlan(openingEntry());
  const selectable = dispatchSelectableLots([plan.outputBatch, printed.printedLot]);
  assert.deepEqual(selectable.map((item) => item.sfgBatchCode), [plan.outputBatch.sfgBatchCode]);
});

test('the store list badges opening balance and Add Batch keeps the same edit gate', async () => {
  assert.equal(openingBalanceStoreLabel({ isOpeningBalance: true }), OPENING_BALANCE_BADGE);
  assert.equal(openingBalanceStoreLabel({ isOpeningBalance: false }), '');
  assert.equal(openingBalanceStoreLabel({}), '');
  const store = fs.readFileSync(new URL('../src/components/SFGStoreManagement.jsx', import.meta.url), 'utf8');
  assert.match(store, /openingBalanceStoreLabel\(item\)/);
  assert.match(store, /data-testid="sfg-opening-balance-badge"/);
  assert.match(store, /\{storeUi\.canAddBatch && newGoodModalMode && \(/);
  const matrix = {
    'Store Manager': { sfg_store: true },
    'Printing Operator': { sfg_store: true, inventory: true, printing_scheduler: true }
  };
  assert.equal(sfgStoreUi(roleCanEditSfgStore(matrix, 'Store Manager')).canAddBatch, true);
  assert.equal(sfgStoreUi(roleCanEditSfgStore(matrix, 'Printing Operator')).canAddBatch, false);
  assert.equal(sfgStoreUi(false).canAddBatch, false);
  const service = fs.readFileSync(new URL('../src/services/supabaseDataService.js', import.meta.url), 'utf8');
  assert.match(service, /notesBody\.isOpeningBalance = true/);
  assert.match(service, /openingBalanceEnteredBy/);
  assert.match(service, /openingBalanceEnteredAt/);
  assert.match(service, /is_opening_balance: item\.isOpeningBalance === true/);
  assert.match(service, /isOpeningBalance: item\.is_opening_balance === true \|\| extra\.isOpeningBalance === true/);
});

const openingBalanceSql = fs.readFileSync(
  new URL('../supabase/migrations/20261118140000_sfg_opening_balance.sql', import.meta.url),
  'utf8'
);

test('the opening-balance column is added after the process-meter migration and defaults false', async () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const previous = '20261118130000_production_process_meters.sql';
  const current = '20261118140000_sfg_opening_balance.sql';
  assert.ok(names.includes(previous));
  assert.ok(names.indexOf(current) > names.indexOf(previous));
  assert.doesNotMatch(openingBalanceSql, /eamstsaqkbeiywfaanhi/);
  assert.match(openingBalanceSql, /is_opening_balance boolean NOT NULL DEFAULT false/);

  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA IF NOT EXISTS private;
    GRANT USAGE ON SCHEMA private TO authenticated;
    CREATE TABLE public.sfg_goods (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sfg_batch_code text UNIQUE NOT NULL,
      sfg_type text NOT NULL,
      job_name text NOT NULL,
      notes text
    );
  `);
  await db.exec(openingBalanceSql);
  const column = await db.query(`
    SELECT is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sfg_goods' AND column_name = 'is_opening_balance'
  `);
  assert.equal(column.rows[0].is_nullable, 'NO');
  assert.match(String(column.rows[0].column_default), /false/);

  await db.exec(`INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name) VALUES ('SFG-PLAIN', 'Printed Rolls', 'Plain')`);
  await db.exec(`
    INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name, notes)
    VALUES ('SFG-LOT-ORD-1', 'Printed Rolls', 'Opened', '{"isOpeningBalance":true,"openingBalanceEnteredBy":"Samyak"}')
  `);
  await db.exec(`
    UPDATE public.sfg_goods
    SET notes = '{"isPrintedLot":true}'
    WHERE sfg_batch_code = 'SFG-LOT-ORD-1'
  `);
  const rows = await db.query(`SELECT sfg_batch_code, is_opening_balance FROM public.sfg_goods ORDER BY sfg_batch_code`);
  assert.deepEqual(rows.rows.map((row) => [row.sfg_batch_code, row.is_opening_balance]), [
    ['SFG-LOT-ORD-1', true],
    ['SFG-PLAIN', false]
  ]);
  await db.close();
});

const closeSql = fs.readFileSync(new URL('../supabase/migrations/20261031173000_print_run_keeps_order_close.sql', import.meta.url), 'utf8');
const printRunSql = fs.readFileSync(new URL('../supabase/migrations/20261101193000_one_active_print_run_and_utilization.sql', import.meta.url), 'utf8');
const ledgerSql = fs.readFileSync(new URL('../supabase/migrations/20261102120000_roll_consumption_ledger.sql', import.meta.url), 'utf8');
const exactPostSql = fs.readFileSync(new URL('../supabase/migrations/20261102153000_roll_consumption_exact_post.sql', import.meta.url), 'utf8');

async function ledgerDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE SCHEMA IF NOT EXISTS private;
    GRANT USAGE ON SCHEMA private TO authenticated;
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      auth_user_id uuid,
      username text,
      full_name text,
      email text,
      role text,
      status text,
      active boolean
    );
    CREATE OR REPLACE FUNCTION private.has_role(allowed text[])
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
      SELECT false
    $$;
    CREATE OR REPLACE FUNCTION private.app_roles()
    RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
      SELECT ARRAY[]::text[]
    $$;
    CREATE OR REPLACE FUNCTION private.can_any(allowed text[])
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
      SELECT true
    $$;
    GRANT EXECUTE ON FUNCTION private.has_role(text[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.app_roles() TO authenticated;
    GRANT EXECUTE ON FUNCTION private.can_any(text[]) TO authenticated;
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text,
      client_name text,
      status text,
      job_details jsonb,
      printing_status text,
      printing_start_time timestamptz,
      printing_end_time timestamptz,
      printing_duration_minutes numeric,
      printing_duration_formatted text,
      actual_meters_printed numeric,
      ink_gsm_in_speed numeric,
      printed_output_kg numeric,
      printing_notes text,
      machine_id text,
      job_master_id text,
      closed_by text,
      closed_at timestamptz,
      close_reason text,
      close_mode text,
      over_dispatch_warning text
    );
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text,
      updated_at timestamptz
    );
    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb,
      updated_at timestamptz
    );
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_code text,
      item_name text,
      stock_qty_kg numeric DEFAULT 0,
      unit_price numeric DEFAULT 0,
      category text,
      film_type text,
      micron numeric,
      width_mm numeric,
      is_active boolean DEFAULT true,
      last_updated timestamptz
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      roll_type text NOT NULL DEFAULT 'RAW_MATERIAL',
      item_id text,
      item_name text NOT NULL,
      category text,
      job_name text,
      order_id text,
      micron numeric,
      width_mm numeric,
      film_type text,
      net_weight_kg numeric NOT NULL DEFAULT 0,
      available_weight_kg numeric NOT NULL DEFAULT 0,
      gross_weight_kg numeric,
      status text,
      qc_status text,
      location_bay text,
      inward_datetime timestamptz,
      metadata jsonb
    );
    CREATE TABLE public.production_records (
      id text PRIMARY KEY,
      order_id text,
      job_name text NOT NULL,
      job_code text,
      materials_list jsonb DEFAULT '[]'::jsonb,
      input_rolls_list jsonb DEFAULT '[]'::jsonb,
      process_logs jsonb,
      sfg_consumptions jsonb,
      recorded_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.deleted_barcodes (
      barcode text,
      status text
    );
    GRANT USAGE ON SCHEMA auth, public TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_rolls TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_records TO authenticated;
    GRANT SELECT ON public.users TO authenticated;
    GRANT SELECT ON public.role_permissions TO authenticated;
    INSERT INTO public.orders (id, job_name, status, job_details, printing_status) VALUES
      ('ORD-OPEN', 'Peas Pouch', 'In Production', '{}'::jsonb, 'Pending'),
      ('ORD-NEXT', 'Rice Pouch', 'Scheduled', '{}'::jsonb, 'Pending');
    INSERT INTO public.inventory (id, item_code, item_name, stock_qty_kg, category, film_type, micron, width_mm)
    VALUES ('INVT-15', 'INVT-15', 'PET 12µ', 500, 'Film Substrates', 'PET', 12, 500);
    INSERT INTO public.inventory_rolls (
      barcode_id, item_id, item_name, category, film_type, micron, width_mm,
      net_weight_kg, available_weight_kg, status
    ) VALUES ('RM-100', 'INVT-15', 'PET 12µ', 'Film Substrates', 'PET', 12, 500, 80, 80, 'In Stock');
  `);
  await db.exec(closeSql);
  await db.exec(printRunSql);
  await db.exec(ledgerSql);
  await db.exec(exactPostSql);
  return db;
}

test('the production-record ledger trigger posts no lines for an opening-balance audit', async () => {
  const db = await ledgerDatabase();
  const materials = [{
    barcode: 'RM-100',
    filmType: 'PET',
    micron: 12,
    widthMm: 500,
    issueQtyKg: 30,
    returnQtyKg: 0,
    netConsumedQtyKg: 30,
    stockItemId: 'INVT-15',
    stage: 'Printing'
  }];
  const consumptions = [{
    id: 'keep-log',
    batchCode: 'OLD',
    consumedKg: 10,
    targetProcess: 'Lamination (Pass 1)',
    sfgBatchCode: 'SFG-LOT-ORD-NEXT'
  }];
  await db.query(`
    INSERT INTO public.production_records (
      id, order_id, job_name, job_code, materials_list, input_rolls_list, sfg_consumptions, process_logs
    ) VALUES (
      'PR-ORD-NEXT', 'ORD-NEXT', 'Rice Pouch', 'CYL-1', $1::jsonb, '[]'::jsonb, $2::jsonb, $3::jsonb
    )
  `, [
    JSON.stringify(materials),
    JSON.stringify(consumptions),
    JSON.stringify({ sfgConsumptions: consumptions, sfgFgBatches: [], materialsList: materials })
  ]);
  const before = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  const stockBefore = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  assert.ok(before.rows[0].n > 0);

  await db.query(`
    UPDATE public.production_records
    SET process_logs = $1::jsonb
    WHERE id = 'PR-ORD-NEXT'
  `, [JSON.stringify({
    sfgConsumptions: consumptions,
    materialsList: materials,
    sfgFgBatches: [{
      batchCode: 'SFG-OPEN-1',
      isOpeningBalance: true,
      ledgerLines: [],
      netKg: 40,
      outputRolls: [{ barcodeId: 'SFG-PRN-R01', netWeightKg: 40 }]
    }]
  })]);

  const after = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  const stockAfter = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  const saved = await db.query(`
    SELECT materials_list, input_rolls_list, sfg_consumptions
    FROM public.production_records WHERE id = 'PR-ORD-NEXT'
  `);
  const openingLines = await db.query(`
    SELECT count(*)::int AS n
    FROM public.inventory_ledger_entries
    WHERE barcode ILIKE 'SFG-%' OR barcode ILIKE 'FG-%'
  `);
  assert.equal(after.rows[0].n, before.rows[0].n);
  assert.equal(Number(stockAfter.rows[0].stock_qty_kg), Number(stockBefore.rows[0].stock_qty_kg));
  assert.equal(openingLines.rows[0].n, 0);
  assert.equal(saved.rows[0].materials_list[0].barcode, 'RM-100');
  assert.equal(saved.rows[0].materials_list[0].netConsumedQtyKg, 30);
  assert.deepEqual(saved.rows[0].input_rolls_list, []);
  assert.equal(saved.rows[0].sfg_consumptions[0].id, 'keep-log');
  assert.equal(saved.rows[0].sfg_consumptions[0].consumedKg, 10);

  await db.query(`
    INSERT INTO public.production_records (
      id, order_id, job_name, materials_list, input_rolls_list, sfg_consumptions, process_logs
    ) VALUES (
      'PR-OPEN-ONLY', 'ORD-OPEN', 'Peas Pouch', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $1::jsonb
    )
  `, [JSON.stringify({
    sfgFgBatches: [{ batchCode: 'FG-SLT-1', isOpeningBalance: true, ledgerLines: [], netKg: 20 }],
    sfgConsumptions: [],
    materialsList: []
  })]);
  const only = await db.query(`
    SELECT count(*)::int AS n FROM public.inventory_ledger_entries WHERE production_record_id = 'PR-OPEN-ONLY'
  `);
  assert.equal(only.rows[0].n, 0);
  await db.close();
});

test('balance left becomes consumed kilograms and names the BAL roll the ledger trigger creates', () => {
  const plan = buildSfgFgBatchPlan(base({
    inputRolls: [{ barcode: 'RM-BC-100', initialKg: 50, balanceLeftKg: 12, balanceLeftMeters: 400 }],
    printingWastageKg: 0.2
  }));
  assert.equal(plan.ok, true, plan.errors?.join('\n'));
  const film = plan.productionRecord.materialsList.find((row) => row.barcode === 'RM-BC-100');
  assert.equal(film.netConsumedQtyKg, 38);
  assert.equal(film.initialWeightKg, 50);
  assert.equal(film.returnQtyKg, 12);
  const listed = plan.productionRecord.inputRollsList.find((row) => row.barcodeId === 'RM-BC-100');
  assert.equal(listed.consumedWeightKg, 38);
  assert.equal(listed.initialWeightKg, 50);
  assert.deepEqual(plan.balanceRolls, [{
    parentBarcodeId: 'RM-BC-100',
    balanceBarcodeId: 'RM-BC-100-BAL',
    balanceKg: 12,
    balanceMeters: 400
  }]);
  const missing = buildSfgFgBatchPlan(base({
    inputRolls: [{ barcode: 'RM-BC-100', initialKg: 100, balanceLeftKg: '' }]
  }));
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join('\n'), /Balance left on roll \(kg\) is required/);
});

test('child roll metres are the printed metres shared by weight and are written as inventory rolls', async () => {
  const plan = buildSfgFgBatchPlan(base({
    actualMeters: 1000,
    plainSettingKg: 0,
    printingWastageKg: 0,
    inputRolls: [{ barcode: 'RM-BC-100', consumedKg: 10, initialKg: 100 }],
    outputRolls: [
      { barcodeId: 'SFG-PRN-A', grossWeightKg: 30, tareWeightKg: 0, netWeightKg: 30, lengthMeters: 99999 },
      { barcodeId: 'SFG-PRN-B', grossWeightKg: 70, tareWeightKg: 0, netWeightKg: 70, lengthMeters: 1 }
    ]
  }));
  assert.equal(plan.ok, true, plan.errors?.join('\n'));
  assert.equal(plan.outputRolls.find((roll) => roll.barcodeId === 'SFG-PRN-A').lengthMeters, 300);
  assert.equal(plan.outputRolls.find((roll) => roll.barcodeId === 'SFG-PRN-B').lengthMeters, 700);
  assert.deepEqual(shareMetersByWeight([{ netWeightKg: 1 }, { netWeightKg: 1 }], 10).map((roll) => roll.lengthMeters), [5, 5]);
  assert.equal(plan.childInventoryRolls.length, 2);
  assert.equal(plan.childInventoryRolls[0].parentSfgBatchCode, 'SFG-LOT-ORD-2026-153');
  assert.equal(plan.childInventoryRolls[0].lengthMeters, 300);
  assert.equal(plan.childInventoryRolls[0].rollType, 'SEMI_FINISHED_GOODS');
  const calls = [];
  await commitSfgFgBatch({
    plan,
    saveProductionRecord: async () => ({ consumptionWarnings: [] }),
    saveSfgGood: async () => {},
    saveInventoryRoll: async (roll) => { calls.push(roll.barcodeId); }
  });
  assert.deepEqual(calls, ['SFG-PRN-A', 'SFG-PRN-B']);

  const opening = buildSfgFgBatchPlan(base({
    isOpeningBalance: true,
    outputRolls: [{ barcodeId: 'SFG-PRN-OPEN', grossWeightKg: 10, tareWeightKg: 0, netWeightKg: 10, lengthMeters: 111 }]
  }));
  assert.equal(opening.ok, true, opening.errors?.join('\n'));
  assert.equal(opening.printedLot.childRolls.find((roll) => roll.barcodeId === 'SFG-PRN-OPEN').lengthMeters, 111);
  assert.equal(opening.childInventoryRolls, undefined);
});

test('ink shortfall blocks the save until an Admin confirms it', () => {
  const short = buildSfgFgBatchPlan(base({
    inventory: [{ ...inkItem, availableQtyKg: 1 }, adhesiveItem]
  }));
  assert.equal(short.ok, false);
  assert.match(short.errors.join('\n'), /Ink stock has 1 kg available/);
  assert.match(short.errors.join('\n'), /Admin must confirm/);
  const confirmed = buildSfgFgBatchPlan(base({
    inventory: [{ ...inkItem, availableQtyKg: 1 }, adhesiveItem],
    confirmStockShortfall: true
  }));
  assert.equal(confirmed.ok, true, confirmed.errors?.join('\n'));
  const heavy = buildSfgFgBatchPlan(base({
    actualMeters: 100,
    widthMm: 1000,
    micron: 12,
    filmDensity: 1.4,
    plainSettingKg: 0,
    printingWastageKg: 0,
    inputRolls: [{ barcode: 'RM-BC-100', consumedKg: 40, initialKg: 400 }]
  }));
  const ceiling = filmMassCeilingKg({ meters: 100, widthMm: 1000, micron: 12, density: 1.4, wasteKg: 0 });
  assert.ok(40 > ceiling);
  assert.equal(heavy.ok, false);
  assert.match(heavy.errors.join('\n'), /Confirm this weight/);
  const accepted = buildSfgFgBatchPlan(base({
    actualMeters: 100,
    widthMm: 1000,
    micron: 12,
    filmDensity: 1.4,
    plainSettingKg: 0,
    printingWastageKg: 0,
    inputRolls: [{ barcode: 'RM-BC-100', consumedKg: 40, initialKg: 400 }],
    confirmFilmOverMass: true
  }));
  assert.equal(accepted.ok, true, accepted.errors?.join('\n'));
});
