import test from 'node:test';
import assert from 'node:assert/strict';
import {
  grnInwardLedgerEntries,
  grnQcDecision,
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

test('a multi-line GRN posts each line onto its own item under the inward barcodes', () => {
  const grn = {
    id: 'SIL/GRN/26-27/197',
    grnNo: 'SIL/GRN/26-27/197',
    status: 'Approved',
    qcStatus: 'Approved',
    stockItemId: 'INVT-0007',
    masterItemId: 'INVT-0007',
    itemName: 'PET-610-12 + 6 more',
    netWeightKg: 10443.32,
    invoiceNo: 'GST/26-27/1960',
    vendorName: 'Manish packaging',
    lineItems: [
      {
        id: 'SIL/GRN/26-27/197-L1',
        lineNo: 1,
        itemName: 'PET-610-12',
        stockItemId: 'INVT-0007',
        masterItemId: 'INVT-0007',
        netWeightKg: 500.74,
        purchaseRate: 146,
        batchNo: 'GST/26-27/1960',
        rolls: [
          { barcodeId: 'RM-BC-SIL/GRN/26-27/197-L1-R1', netWeightKg: 250.42 },
          { barcodeId: 'RM-BC-SIL/GRN/26-27/197-L1-R2', netWeightKg: 250.32 }
        ]
      },
      {
        id: 'SIL/GRN/26-27/197-L2',
        lineNo: 2,
        itemName: 'PET-650-12',
        stockItemId: 'INVT-0010',
        masterItemId: 'INVT-0010',
        netWeightKg: 1568.08,
        purchaseRate: 146,
        batchNo: 'GST/26-27/1960',
        rolls: [
          { barcodeId: 'RM-BC-SIL/GRN/26-27/197-L2-R1', netWeightKg: 264.93 },
          { barcodeId: 'RM-BC-SIL/GRN/26-27/197-L2-R2', netWeightKg: 253.63 }
        ]
      }
    ]
  };
  const rolls = [
    { barcodeId: 'RM-BC-SIL/GRN/26-27/197-L2-R2', grnId: 'SIL/GRN/26-27/197', grnNo: 'SIL/GRN/26-27/197', itemId: 'INVT-0010', itemName: 'PET-650-12', status: 'In Stock', netWeightKg: 253.63 }
  ];
  const pet610 = grnInwardLedgerEntries(grn, { id: 'INVT-0007', itemName: 'PET-610-12' }, rolls);
  const pet650 = grnInwardLedgerEntries(grn, { id: 'INVT-0010', itemName: 'PET-650-12' }, rolls);
  assert.equal(pet610.length, 1);
  assert.equal(pet610[0].qty, 500.74);
  assert.equal(pet610[0].addsUsableStock, true);
  assert.match(pet610[0].barcode, /197-L1-R1/);
  assert.doesNotMatch(pet610[0].barcode, /197-L2-R2/);
  assert.equal(pet650.length, 1);
  assert.equal(pet650[0].qty, 1568.08);
  assert.match(pet650[0].barcode, /RM-BC-SIL\/GRN\/26-27\/197-L2-R2/);
  assert.equal(pet650[0].batchNo, 'GST/26-27/1960');
  assert.equal(grnInwardLedgerEntries({ ...grn, status: 'Deleted', qcStatus: 'Deleted' }, { id: 'INVT-0010', itemName: 'PET-650-12' }, rolls).length, 0);
  const held = grnInwardLedgerEntries({ ...grn, status: 'QC Hold', qcStatus: 'Rejected' }, { id: 'INVT-0010', itemName: 'PET-650-12' }, rolls);
  assert.equal(held[0].decision, 'rejected');
  assert.equal(held[0].addsUsableStock, false);
  assert.equal(grnQcDecision({ status: 'Pending QC Approval' }), 'pending');
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

