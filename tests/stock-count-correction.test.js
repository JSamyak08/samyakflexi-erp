import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStockKg,
  isCountableStockRoll,
  ledgerBalanceAfterCount,
  planStockCountCorrection,
  reconciliationLedgerFields,
  rollOnHandKg,
  rollReceiptKgAfterCorrections,
  stockCorrectionSummary,
  stockCorrectionType
} from '../src/services/stockCountCorrection.js';

const film = {
  id: 'INVT-QA-SCC',
  itemCode: 'INVT-QA-SCC',
  itemName: 'PET-333-12',
  category: 'Film Substrates',
  filmType: 'PET',
  micron: 12,
  widthMm: 333,
  availableQtyKg: 50,
  unit: 'Kg',
  subItems: [{
    id: 'INVT-QA-SCC',
    itemCode: 'INVT-QA-SCC',
    itemName: 'PET-333-12',
    category: 'Film Substrates',
    filmType: 'PET',
    micron: 12,
    widthMm: 333,
    availableQtyKg: 50
  }]
};

const rolls = [
  { barcodeId: 'RM-BC-QA-SCC-1', itemId: 'INVT-QA-SCC', status: 'In Stock (RM)', netWeightKg: 30, availableWeightKg: 30 },
  { barcodeId: 'RM-BC-QA-SCC-2', itemId: 'INVT-QA-SCC', status: 'In Stock (RM)', netWeightKg: 20, availableWeightKg: 20 },
  { barcodeId: 'RM-BC-QA-SCC-VOID', itemId: 'INVT-QA-SCC', status: 'Reversed', netWeightKg: 40, availableWeightKg: 0 }
];

function plan(overrides = {}) {
  return planStockCountCorrection({
    item: film,
    rolls,
    barcode: 'RM-BC-QA-SCC-1',
    countedKg: 26,
    reason: 'Weighbridge count',
    adjustedBy: 'QA Admin',
    now: new Date('2026-11-27T08:00:00.000Z'),
    ...overrides
  });
}

test('a short correction reduces the counted roll and the item by the same kilograms', () => {
  const result = plan();
  assert.equal(result.ok, true);
  assert.equal(result.systemKg, 30);
  assert.equal(result.diffKg, -4);
  assert.equal(result.nextRollKg, 26);
  assert.equal(result.nextOwnerKg, 46);
  assert.equal(result.nextItemKg, 46);
  assert.equal(result.adjustment.qtyKg, -4);
  assert.equal(result.adjustment.barcode, 'RM-BC-QA-SCC-1');
  assert.equal(result.adjustment.type, 'Stock correction: short (−4.00 kg)');
  assert.equal(result.adjustment.itemId, 'INVT-QA-SCC');
  assert.match(result.summary, /System stock 30\.00 kg, Counted 26\.00 kg, Difference: Short by 4\.00 kg \(will be reduced\)/);
});

test('an excess correction adds the same kilograms to the roll and the item', () => {
  const result = plan({ countedKg: 33 });
  assert.equal(result.ok, true);
  assert.equal(result.diffKg, 3);
  assert.equal(result.nextRollKg, 33);
  assert.equal(result.nextOwnerKg, 53);
  assert.equal(result.nextItemKg, 53);
  assert.equal(result.adjustment.type, 'Stock correction: excess (+3.00 kg)');
  assert.match(result.summary, /Excess by 3\.00 kg \(will be added\)/);
});

test('a shortfall cannot exceed the roll or the item, and a negative count is refused', () => {
  const over = plan({ countedKg: -1 });
  assert.equal(over.ok, false);
  assert.match(over.errors.join(' '), /cannot be negative/);

  const matched = plan({ countedKg: 30 });
  assert.equal(matched.ok, false);
  assert.match(matched.errors.join(' '), /matches the system/);

  const noReason = plan({ reason: '   ' });
  assert.equal(noReason.ok, false);
  assert.match(noReason.errors.join(' '), /reason/);

  const noRoll = plan({ barcode: '' });
  assert.equal(noRoll.ok, false);
  assert.match(noRoll.errors.join(' '), /roll barcode/);

  const wrongRoll = plan({ barcode: 'RM-BC-QA-SCC-VOID' });
  assert.equal(wrongRoll.ok, false);

  const thinItem = plan({
    countedKg: 10,
    item: { ...film, availableQtyKg: 5, subItems: [{ ...film.subItems[0], availableQtyKg: 5 }] }
  });
  assert.equal(thinItem.ok, false);
  assert.match(thinItem.errors.join(' '), /more than the available/);
});

test('an item with no rolls corrects the item total in kilograms', () => {
  const solvent = {
    id: 'INVT-SOL',
    itemCode: 'INVT-SOL',
    itemName: 'Ethyl Acetate',
    category: 'Chemicals & Solvents',
    availableQtyKg: 80,
    unit: 'Kg',
    subItems: [{ id: 'INVT-SOL', itemCode: 'INVT-SOL', itemName: 'Ethyl Acetate', category: 'Chemicals & Solvents', availableQtyKg: 80 }]
  };
  const result = planStockCountCorrection({
    item: solvent,
    rolls: [],
    countedKg: 75.5,
    reason: 'Drum count',
    now: new Date('2026-11-27T08:00:00.000Z')
  });
  assert.equal(result.ok, true);
  assert.equal(result.diffKg, -4.5);
  assert.equal(result.nextOwnerKg, 75.5);
  assert.equal(result.adjustment.barcode, '');
  assert.equal(result.adjustment.type, stockCorrectionType(-4.5));
});

test('a grouped film corrects the stock record that owns the roll', () => {
  const grouped = {
    ...film,
    availableQtyKg: 80,
    subItems: [
      { ...film.subItems[0], id: 'INVT-A', itemCode: 'INVT-A', availableQtyKg: 50 },
      { ...film.subItems[0], id: 'INVT-B', itemCode: 'INVT-B', availableQtyKg: 30 }
    ]
  };
  const result = plan({
    item: grouped,
    rolls: [{ barcodeId: 'RM-BC-B', itemId: 'INVT-B', status: 'In Stock (RM)', netWeightKg: 30, availableWeightKg: 30 }],
    barcode: 'RM-BC-B',
    countedKg: 28
  });
  assert.equal(result.ok, true);
  assert.equal(result.targetItemId, 'INVT-B');
  assert.equal(result.nextOwnerKg, 28);
  assert.equal(result.nextItemKg, 78);
  assert.equal(result.adjustment.barcode, 'RM-BC-B');
});

test('the ledger shows a correction once and keeps a running balance that matches the new stock', () => {
  const fields = reconciliationLedgerFields({
    type: 'Stock correction: short (−4.00 kg)',
    qtyKg: -4,
    reason: 'Weighbridge count'
  });
  assert.equal(fields.inwardQtyKg, 0);
  assert.equal(fields.outwardQtyKg, 0);
  assert.equal(fields.adjQtyKg, -4);
  assert.equal(fields.subRef, 'Weighbridge count');
  assert.equal(fields.subParty, 'Stock count correction');

  const stale = ledgerBalanceAfterCount({ itemKg: 50, priorNetMovement: 0, diffKg: -4, staleItemKg: 50 });
  assert.equal(stale.runningKg, 50);
  assert.equal(stale.itemKg, 46);

  const liveShort = ledgerBalanceAfterCount({ itemKg: 50, priorNetMovement: 0, diffKg: -4 });
  assert.equal(liveShort.openingKg, 50);
  assert.equal(liveShort.runningKg, 46);
  assert.equal(liveShort.runningKg, liveShort.itemKg);

  const liveExcess = ledgerBalanceAfterCount({ itemKg: 50, priorNetMovement: 0, diffKg: 3 });
  assert.equal(liveExcess.openingKg, 50);
  assert.equal(liveExcess.runningKg, 53);
  assert.equal(liveExcess.runningKg, liveExcess.itemKg);
});

test('a roll receipt stays at the original kilograms after a correction', () => {
  const roll = rolls[0];
  assert.equal(rollReceiptKgAfterCorrections(roll, []), 30);
  const afterShort = rollReceiptKgAfterCorrections(
    { ...roll, availableWeightKg: 26 },
    [{ type: 'Stock correction: short (−4.00 kg)', barcode: 'RM-BC-QA-SCC-1', qtyKg: -4 }]
  );
  assert.equal(afterShort, 30);
  const oldAuditDoesNotRewrite = rollReceiptKgAfterCorrections(
    { ...roll, availableWeightKg: 30 },
    [{ type: 'Physical Audit (-)', barcode: 'RM-BC-QA-SCC-1', qtyKg: -4 }]
  );
  assert.equal(oldAuditDoesNotRewrite, 30);
  assert.equal(rollOnHandKg({ availableWeightKg: 0, netWeightKg: 30 }), 0);
  assert.equal(isCountableStockRoll(rolls[2]), false);
  assert.match(formatStockKg(4), /4\.00/);
  assert.match(stockCorrectionSummary(30, 33), /Excess by 3\.00 kg/);
});
