import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planPrintingFilmIssue,
  planLaminationFilmIssue,
  planSubstrateBalanceRolls,
  substrateRollsFromLog,
  validateSingleInputFilmRoll,
  validateInputFilmRolls
} from '../src/utils/printingFilmIssue.js';

const filmA = { id: 'INVT-3005', category: 'Film Substrates', filmType: 'MATTEBOPP', micron: 18, widthMm: 730, availableQtyKg: 209.5 };
const filmB = { id: 'INVT-2029', category: 'Film Substrates', filmType: 'MATTEBOPP', micron: 18, widthMm: 730, availableQtyKg: 0 };
const adhesive = { id: 'INVT-3010', category: 'Adhesives', filmType: 'Bostik', micron: 0, widthMm: 0, availableQtyKg: 0 };

test('Nyra input roll writes one consumed ledger line and does not deduct an ambiguous film item', () => {
  const plan = planPrintingFilmIssue({
    orderId: 'ORD-2026-194',
    jobName: 'Nyra Original Outer',
    inputRolls: [{
      barcodeId: 'RM-BC-20261026-5662HWHQ',
      filmType: 'MATTEBOPP',
      micron: 18,
      widthMm: 730,
      itemId: 'INVT-3010',
      initialWeightKg: 253.5,
      consumedWeightKg: 247.5
    }],
    existingMaterials: [{ id: 'ink-1', filmType: 'Liquid Inks', netConsumedQtyKg: 2 }],
    inventoryItems: [filmA, filmB, adhesive]
  });

  assert.equal(plan.materialsList.length, 2);
  const line = plan.materialsList.find((row) => row.id === 'print-film:ORD-2026-194:RM-BC-20261026-5662HWHQ');
  assert.equal(line.netConsumedQtyKg, 247.5);
  assert.equal(line.issueQtyKg, 247.5);
  assert.equal(line.returnQtyKg, 6);
  assert.equal(line.appliedStockQtyKg, 247.5);
  assert.equal(line.stockItemId, '');
  assert.deepEqual(plan.rollUpdates, [{
    barcodeId: 'RM-BC-20261026-5662HWHQ',
    availableWeightKg: 0,
    status: 'Issued to Printing'
  }]);
  assert.equal(plan.inventoryAdjustments.length, 0);
  assert.equal(plan.materialsList[0].id, 'ink-1');
});

test('a CCPET roll posts to its item id even when the copied name is the json blob', () => {
  const plan = planPrintingFilmIssue({
    orderId: 'ORD-2026-210',
    jobName: 'Masti Atta 5 Kg',
    inputRolls: [{
      barcodeId: 'RM-BC-20261029-19450G7V',
      filmType: 'CCPET-680-12 ||| {"filmType":"CCPET","density":1.4}',
      micron: '12',
      widthMm: '680',
      itemId: 'INVT-0027',
      initialWeightKg: 279.08,
      consumedWeightKg: 279.08
    }],
    inventoryItems: [{
      id: 'INVT-0027',
      category: 'Film Substrates',
      filmType: 'CCPET',
      micron: 12,
      widthMm: 680,
      density: 1.4,
      itemName: 'CCPET-680-12 ||| {"density":1.4}'
    }]
  });
  assert.equal(plan.inventoryAdjustments.length, 1);
  assert.equal(plan.inventoryAdjustments[0].stockItemId, 'INVT-0027');
  assert.equal(plan.inventoryAdjustments[0].deltaKg, 279.08);
});

test('a second printing issue of the same roll does not deduct again', () => {
  const first = planPrintingFilmIssue({
    orderId: 'ORD-1',
    inputRolls: [{ barcodeId: 'RM-1', filmType: 'PET', micron: 12, widthMm: 500, itemId: 'PET-1', initialWeightKg: 100, consumedWeightKg: 80 }],
    inventoryItems: [{ id: 'PET-1', category: 'Film Substrates', filmType: 'PET', micron: 12, widthMm: 500 }]
  });
  assert.equal(first.inventoryAdjustments[0].deltaKg, 80);
  const second = planPrintingFilmIssue({
    orderId: 'ORD-1',
    inputRolls: [{ barcodeId: 'RM-1', filmType: 'PET', micron: 12, widthMm: 500, itemId: 'PET-1', initialWeightKg: 100, consumedWeightKg: 80 }],
    existingMaterials: first.materialsList,
    inventoryItems: [{ id: 'PET-1', category: 'Film Substrates', filmType: 'PET', micron: 12, widthMm: 500 }]
  });
  assert.equal(second.inventoryAdjustments.length, 0);
  assert.equal(second.materialsList.filter((row) => row.ledgerSource === 'printing-input-roll').length, 1);
});

test('one matching film item is deducted once and a blank consumption is skipped', () => {
  const plan = planPrintingFilmIssue({
    orderId: 'ORD-2',
    inputRolls: [
      { barcodeId: 'RM-2', filmType: 'PET', micron: 12, widthMm: 500, initialWeightKg: 50, consumedWeightKg: 50 },
      { barcodeId: '', filmType: 'PET', micron: 12, widthMm: 500, consumedWeightKg: 10 },
      { barcodeId: 'RM-0', filmType: 'PET', micron: 12, widthMm: 500, consumedWeightKg: 0 }
    ],
    inventoryItems: [{ id: 'PET-ONLY', category: 'Film', filmType: 'PET', micron: 12, widthMm: 500 }]
  });
  assert.equal(plan.materialsList.length, 1);
  assert.equal(plan.inventoryAdjustments.length, 1);
  assert.equal(plan.inventoryAdjustments[0].stockItemId, 'PET-ONLY');
  assert.equal(plan.inventoryAdjustments[0].deltaKg, 50);
});

test('lamination lines replace the same log and substrate leftovers become BAL rolls', () => {
  const rolls = substrateRollsFromLog({
    substrate2Rolls: [
      { barcode: 'LD-1', filmType: 'LD', micron: 35, widthMm: 530, initialKg: 40, consumedKg: 28 },
      { barcode: 'LD-2', filmType: 'LD', micron: 35, widthMm: 530, initialKg: 20, consumedKg: 20 }
    ],
    substrate3: { barcode: 'MET-1', filmType: 'METPET', micron: 12, widthMm: 520, initialKg: 15, consumedKg: 9 }
  });
  assert.equal(rolls.length, 3);
  const balances = planSubstrateBalanceRolls(rolls, { orderId: 'ORD-9', stage: 'Lamination (Pass 1)' });
  assert.equal(balances[0].availableWeightKg, 0);
  assert.equal(balances[0].balanceBarcodeId, 'LD-1-BAL');
  assert.equal(balances[0].balanceKg, 12);
  assert.equal(balances[1].balanceBarcodeId, '');
  const first = planLaminationFilmIssue({
    orderId: 'ORD-9',
    logId: 'SFG-LOG-1',
    stage: 'Lamination (Pass 1)',
    rolls,
    inventoryItems: [{ id: 'LD-ITEM', category: 'Film Substrates', filmType: 'LD', micron: 35, widthMm: 530 }]
  });
  assert.equal(first.materialsList.length, 3);
  assert.equal(first.materialsList[0].id, 'lam-film:ORD-9:SFG-LOG-1:LD-1');
  assert.equal(first.materialsList[0].micron, 35);
  const again = planLaminationFilmIssue({
    orderId: 'ORD-9',
    logId: 'SFG-LOG-1',
    stage: 'Lamination (Pass 1)',
    rolls,
    existingMaterials: first.materialsList,
    inventoryItems: [{ id: 'LD-ITEM', category: 'Film Substrates', filmType: 'LD', micron: 35, widthMm: 530 }]
  });
  assert.equal(again.materialsList.length, 3);
  assert.equal(again.inventoryAdjustments.length, 0);
});

test('validateSingleInputFilmRoll enforces mandatory barcode and stock lookup', () => {
  const stockRolls = [
    { barcodeId: 'RM-PET-100', filmType: 'PET', micron: 12, widthMm: 460, netWeightKg: 100, availableWeightKg: 100 }
  ];

  // 1. Missing barcode
  const missing = validateSingleInputFilmRoll({ barcodeId: '', consumedWeightKg: 50 }, stockRolls);
  assert.equal(missing.isValid, false);
  assert.match(missing.barcodeError, /Barcode ID is mandatory/i);

  // 2. Barcode not in stock
  const notFound = validateSingleInputFilmRoll({ barcodeId: 'RM-NONEXISTENT', consumedWeightKg: 50 }, stockRolls);
  assert.equal(notFound.isValid, false);
  assert.match(notFound.barcodeError, /not found in inventory stock/i);

  // 3. Matched in stock
  const matched = validateSingleInputFilmRoll({ barcodeId: 'RM-PET-100', consumedWeightKg: 80 }, stockRolls);
  assert.equal(matched.isValid, true);
  assert.equal(matched.barcodeError, null);
  assert.equal(matched.quantityError, null);
  assert.equal(matched.initWeight, 100);
  assert.equal(matched.consumedWeight, 80);
});

test('validateSingleInputFilmRoll enforces quantity validations', () => {
  const stockRolls = [
    { barcodeId: 'RM-PET-100', filmType: 'PET', micron: 12, widthMm: 460, netWeightKg: 100, availableWeightKg: 85 }
  ];

  // 1. Zero consumed weight
  const zeroCons = validateSingleInputFilmRoll({ barcodeId: 'RM-PET-100', consumedWeightKg: 0 }, stockRolls);
  assert.equal(zeroCons.isValid, false);
  assert.match(zeroCons.quantityError, /greater than 0 kg/i);

  // 2. Negative consumed weight
  const negCons = validateSingleInputFilmRoll({ barcodeId: 'RM-PET-100', consumedWeightKg: -10 }, stockRolls);
  assert.equal(negCons.isValid, false);
  assert.match(negCons.quantityError, /greater than 0 kg/i);

  // 3. Consumed exceeds initial weight
  const exceedsInit = validateSingleInputFilmRoll({ barcodeId: 'RM-PET-100', initialWeightKg: 100, consumedWeightKg: 105 }, stockRolls);
  assert.equal(exceedsInit.isValid, false);
  assert.match(exceedsInit.quantityError, /cannot exceed roll initial weight/i);

  // 4. Consumed exceeds available stock
  const exceedsAvail = validateSingleInputFilmRoll({ barcodeId: 'RM-PET-100', initialWeightKg: 100, consumedWeightKg: 90 }, stockRolls);
  assert.equal(exceedsAvail.isValid, false);
  assert.match(exceedsAvail.quantityError, /exceeds available stock weight/i);

  // 5. Valid consumed quantity
  const valid = validateSingleInputFilmRoll({ barcodeId: 'RM-PET-100', initialWeightKg: 100, consumedWeightKg: 80 }, stockRolls);
  assert.equal(valid.isValid, true);
  assert.equal(valid.quantityError, null);
});

test('validateInputFilmRolls blocks empty rolls, missing barcodes, and missing balance meters', () => {
  const stockRolls = [
    { barcodeId: 'RM-PET-100', filmType: 'PET', micron: 12, widthMm: 460, netWeightKg: 100, availableWeightKg: 100 },
    { barcodeId: 'RM-PET-200', filmType: 'PET', micron: 12, widthMm: 460, netWeightKg: 200, availableWeightKg: 200 }
  ];

  // 1. Empty list
  const emptyErrors = validateInputFilmRolls([], stockRolls);
  assert.equal(emptyErrors.length, 1);
  assert.match(emptyErrors[0], /At least one input film substrate roll is required/i);

  // 2. Roll missing barcode
  const noBarcode = validateInputFilmRolls([{ barcodeId: '', filmType: 'PET', micron: 12, widthMm: 460, initialWeightKg: 100, consumedWeightKg: 80 }], stockRolls);
  assert.equal(noBarcode.length, 1);
  assert.match(noBarcode[0], /Roll #1: Barcode ID is mandatory/i);

  // 3. Unused balance without balance length
  const noBalanceMeters = validateInputFilmRolls([{
    barcodeId: 'RM-PET-100',
    initialWeightKg: 100,
    consumedWeightKg: 80,
    balanceLengthMeters: ''
  }], stockRolls);
  assert.equal(noBalanceMeters.length, 1);
  assert.match(noBalanceMeters[0], /Balance length \(meters\) is required/i);

  // 4. Complete and valid input roll
  const validRolls = validateInputFilmRolls([{
    barcodeId: 'RM-PET-100',
    initialWeightKg: 100,
    consumedWeightKg: 80,
    balanceLengthMeters: 550
  }], stockRolls);
  assert.equal(validRolls.length, 0);

  // 5. Fully consumed roll does not require balance meters
  const fullyConsumed = validateInputFilmRolls([{
    barcodeId: 'RM-PET-100',
    initialWeightKg: 100,
    consumedWeightKg: 100
  }], stockRolls);
  assert.equal(fullyConsumed.length, 0);
});
