import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ledgerRowLink,
  ledgerRowRate,
  rollBelongsOnItemLedger
} from '../src/services/inventoryLedgerMatch.js';

const pet = {
  id: 'INVT-0010',
  itemCode: 'INVT-0010',
  itemName: 'PET-650-12',
  category: 'Film Substrates',
  filmType: 'PET',
  micron: 12,
  widthMm: 650,
  unitPrice: 155
};

const metpet = {
  id: 'INVT-0038',
  itemCode: 'INVT-0038',
  itemName: 'METPET-650-12',
  category: 'Film Substrates',
  filmType: 'METPET',
  micron: 12,
  widthMm: 650,
  unitPrice: 210
};

test('a PET ledger does not take a METPET roll with the same gauge and width', () => {
  const roll = {
    id: 'RM-BC-20261029-1945F8BH',
    barcodeId: 'RM-BC-20261029-1945F8BH',
    itemId: 'INVT-0038',
    itemName: 'METPET-650-12',
    filmType: 'METPET',
    micron: 12,
    widthMm: 650,
    purchaseRatePerKg: 210,
    status: 'In Stock'
  };
  assert.deepEqual(rollBelongsOnItemLedger(roll, pet), { include: false, legacy: false });
  assert.deepEqual(rollBelongsOnItemLedger(roll, metpet), { include: true, legacy: false });
  assert.equal(ledgerRowRate(roll, pet.unitPrice), 210);
});

test('an item id for a missing or different item never falls through to the name', () => {
  assert.deepEqual(ledgerRowLink({
    itemId: 'INVT-0099',
    itemName: 'PET-650-12',
    filmType: 'PET',
    micron: 12,
    widthMm: 650
  }, pet), { include: false, legacy: false });
  assert.deepEqual(ledgerRowLink({
    stockItemId: 'INVT-0038',
    itemName: 'PET-650-12'
  }, pet), { include: false, legacy: false });
});

test('a row with no item id matches only an exact normalised name and is legacy', () => {
  assert.deepEqual(ledgerRowLink({
    itemName: '  pet-650-12 ||| {"micron":12}  '
  }, pet), { include: true, legacy: true });
  assert.deepEqual(ledgerRowLink({
    itemName: 'METPET-650-12',
    filmType: 'METPET',
    micron: 12,
    widthMm: 650
  }, pet), { include: false, legacy: false });
  assert.deepEqual(ledgerRowLink({
    filmType: 'PET',
    micron: 12,
    widthMm: 650
  }, pet), { include: false, legacy: false });
  assert.deepEqual(ledgerRowLink({
    itemName: 'Cyan ink',
    category: 'Printing Inks'
  }, {
    id: 'INVT-0200',
    itemName: 'Black ink',
    category: 'Printing Inks'
  }), { include: false, legacy: false });
});

test('a deleted roll is not ledger stock, and a row keeps its own rate', () => {
  assert.deepEqual(rollBelongsOnItemLedger({
    itemId: 'INVT-0010',
    itemName: 'PET-650-12',
    status: 'Deleted',
    purchaseRatePerKg: 180
  }, pet), { include: false, legacy: false });
  assert.equal(ledgerRowRate({ unitPrice: 180 }, 155), 180);
  assert.equal(ledgerRowRate({ reason: 'count' }, 155), 155);
});

