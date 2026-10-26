import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planPrintingFilmIssue,
  planLaminationFilmIssue,
  planSubstrateBalanceRolls,
  substrateRollsFromLog
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
