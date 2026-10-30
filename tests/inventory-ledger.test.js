import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInventoryId } from '../src/factoryStore.js';
import {
  applyQcApprovalStock,
  findDuplicateInvoice,
  prepareMultiLineReceipt
} from '../src/services/grnDocument.js';
import { planManualStockSave, resolveReceiptItem } from '../src/services/inventoryIdentity.js';

const formatFilmItemName = () => 'METBOPP-570-18';

function receipt(overrides = {}) {
  return prepareMultiLineReceipt({
    header: { vendorName: 'Acme', invoiceNo: 'INV-1', storeManager: 'Store' },
    capturedLines: [{
      category: 'Film Substrates',
      filmType: 'METBOPP',
      micron: 18,
      widthMm: 570,
      stockItemId: 'INVT-0150',
      purchaseRate: 205,
      batchNo: 'LOT-A',
      rolls: [{ netWeightKg: 100, grossWeightKg: 110, tareWeightKg: 10, vendorRollNo: 'V1' }]
    }],
    grnNo: 'SIL/GRN/26-27/200',
    nowIso: '2026-10-30T08:00:00.000Z',
    inventory: [{
      id: 'INVT-0150',
      itemCode: 'INVT-0150',
      itemName: 'METBOPP-570-18',
      category: 'Film Substrates',
      micron: 18,
      widthMm: 570,
      availableQtyKg: 26,
      unitPrice: 209,
      location: 'Bay A'
    }],
    generateInventoryId: () => {
      throw new Error('a matching item must not allocate a new inventory id');
    },
    formatFilmItemName,
    isMetalloceneEligibleFilm: () => false,
    ...overrides
  });
}

test('a GRN for an existing item keeps that ledger and puts the lot on the rolls', () => {
  const { newGRN, inventoryLots, rolls } = receipt();
  assert.equal(inventoryLots.length, 0);
  assert.equal(newGRN.lineItems.length, 1);
  assert.equal(newGRN.lineItems[0].stockItemId, 'INVT-0150');
  assert.equal(newGRN.lineItems[0].masterItemId, 'INVT-0150');
  assert.equal(newGRN.stockItemId, 'INVT-0150');
  assert.equal(rolls.length, 1);
  assert.equal(rolls[0].itemId, 'INVT-0150');
  assert.equal(rolls[0].batchNo, 'LOT-A');
  assert.equal(rolls[0].status, 'Pending QC');
  assert.equal(newGRN.status, 'Pending QC Approval');
});

test('a GRN with no picked id still matches the normalised name, category, micron, and width', () => {
  const { inventoryLots, rolls } = receipt({
    capturedLines: [{
      category: 'Film Substrates',
      filmType: 'METBOPP',
      micron: '18',
      widthMm: '570',
      itemName: '  metbopp-570-18 ',
      purchaseRate: 205,
      batchNo: 'LOT-B',
      rolls: [{ netWeightKg: 40, vendorRollNo: 'V2' }]
    }]
  });
  assert.equal(inventoryLots.length, 0);
  assert.equal(rolls[0].itemId, 'INVT-0150');
});

test('the picked master wins when another row shares the spec', () => {
  const inventory = [
    { id: 'INVT-0150', itemName: 'METBOPP-570-18', category: 'Film Substrates', micron: 18, widthMm: 570 },
    { id: 'INVT-2031', itemName: 'METBOPP-570-18', category: 'Film Substrates', micron: 18, widthMm: 570 }
  ];
  assert.equal(resolveReceiptItem(inventory, { stockItemId: 'INVT-2031', itemName: 'METBOPP-570-18', category: 'Film Substrates', micron: 18, widthMm: 570 }).id, 'INVT-2031');
  assert.equal(resolveReceiptItem(inventory, { itemName: 'METBOPP-570-18', category: 'Film Substrates', micron: 18, widthMm: 570 }).id, 'INVT-0150');
});

test('two lines of a new spec share one new inventory id', () => {
  let calls = 0;
  const { inventoryLots, rolls } = prepareMultiLineReceipt({
    header: { vendorName: 'Acme', invoiceNo: 'INV-2' },
    capturedLines: [
      {
        category: 'Film Substrates', filmType: 'PET', micron: 12, widthMm: 650,
        purchaseRate: 155, batchNo: 'B1',
        rolls: [{ netWeightKg: 10, vendorRollNo: 'A' }]
      },
      {
        category: 'Film Substrates', filmType: 'PET', micron: 12, widthMm: 650,
        purchaseRate: 155, batchNo: 'B2',
        rolls: [{ netWeightKg: 12, vendorRollNo: 'B' }]
      }
    ],
    grnNo: 'SIL/GRN/26-27/201',
    nowIso: '2026-10-30T08:00:00.000Z',
    inventory: [],
    generateInventoryId: (items) => {
      calls += 1;
      return `INVT-${String(items.length + 1).padStart(4, '0')}`;
    },
    formatFilmItemName: () => 'PET-650-12',
    isMetalloceneEligibleFilm: () => false
  });
  assert.equal(calls, 1);
  assert.equal(inventoryLots.length, 1);
  assert.equal(inventoryLots[0].availableQtyKg, 0);
  assert.equal(rolls[0].itemId, rolls[1].itemId);
  assert.equal(rolls[0].itemId, inventoryLots[0].id);
});

test('QC approval posts onto the master item and does not create a lot row', () => {
  const inventory = [
    { id: 'INVT-0150', itemName: 'METBOPP-570-18', category: 'Film Substrates', micron: 18, widthMm: 570, availableQtyKg: 26, unitPrice: 209, location: 'Bay A' },
    { id: 'INVT-2031', itemName: 'METBOPP-570-18', category: 'Film Substrates', micron: 18, widthMm: 570, availableQtyKg: 0, unitPrice: 205, location: 'Bay A - Inward Dock' }
  ];
  const { inventory: next, saved } = applyQcApprovalStock(inventory, [{
    stockItemId: 'INVT-2031',
    masterItemId: 'INVT-0150',
    itemName: 'METBOPP-570-18',
    category: 'Film Substrates',
    micron: 18,
    widthMm: 570,
    addKg: 151.68,
    rate: 205,
    isFilm: true
  }]);
  assert.equal(next.length, 2);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'INVT-0150');
  assert.equal(saved[0].availableQtyKg, 177.68);
  assert.equal(saved[0].location, 'Bay A');
  assert.equal(next.find((item) => item.id === 'INVT-2031').availableQtyKg, 0);
});

test('QC approval matches by spec when the master id is blank', () => {
  const { saved } = applyQcApprovalStock([
    { id: 'INVT-0011', itemName: 'PET-670-12', category: 'Film Substrates', micron: 12, widthMm: 670, availableQtyKg: 55.6, unitPrice: 184, location: 'Bay A' }
  ], [{
    stockItemId: 'INVT-2028',
    itemName: 'PET-670-12',
    category: 'Film Substrates',
    micron: 12,
    widthMm: 670,
    addKg: 10,
    rate: 155,
    isFilm: true
  }]);
  assert.equal(saved[0].id, 'INVT-0011');
  assert.equal(saved[0].availableQtyKg, 65.6);
});

test('inventory ids are max-ever-used and are not reused from a gap or a deleted row', () => {
  assert.equal(generateInventoryId([
    { id: 'INVT-0001' },
    { id: 'INVT-0003' }
  ]), 'INVT-0004');
  assert.equal(generateInventoryId(
    [{ id: 'INVT-0010', itemCode: 'INVT-0010' }],
    [{ id: 'SIL/GRN/25-26/124', invoiceNo: 'K32', stockItemId: 'INVT-2032', lineItems: [{ stockItemId: 'INVT-2032' }] }],
    [{ itemId: 'INVT-2028', barcodeId: 'RM-BC-1' }]
  ), 'INVT-2033');
});

test('duplicate invoices ignore trailing and embedded spaces, hyphens, and underscores', () => {
  const existing = [
    { id: 'GRN-166', grnNo: 'SIL/GRN/26-27/166', invoiceNo: '2526008783', vendorName: 'Cosmo Films' },
    { id: 'GRN-OLD', grnNo: 'SIL/GRN/26-27/9', invoiceNo: 'INV-9', vendorName: 'Acme', status: 'Cancelled' }
  ];
  assert.equal(findDuplicateInvoice(existing, {
    invoiceNo: '2526008783__',
    vendorName: 'Cosmo Films',
    grnNo: 'SIL/GRN/26-27/171'
  }).id, 'GRN-166');
  assert.equal(findDuplicateInvoice(existing, {
    invoiceNo: '2526 008-783_',
    vendorName: 'cosmo films',
    grnNo: 'SIL/GRN/26-27/172'
  }).id, 'GRN-166');
  assert.equal(findDuplicateInvoice(existing, {
    invoiceNo: '2526008783',
    vendorName: 'Cosmo Films',
    grnNo: 'SIL/GRN/26-27/166'
  }), null);
  assert.equal(findDuplicateInvoice(existing, {
    invoiceNo: 'INV-9',
    vendorName: 'Acme',
    grnNo: 'SIL/GRN/26-27/10'
  }), null);
});

test('manual add stock offers the existing row and keeps its location', () => {
  const inventory = [{
    id: 'INVT-0150',
    itemName: 'METBOPP-570-18',
    category: 'Film Substrates',
    micron: 18,
    widthMm: 570,
    availableQtyKg: 26,
    unitPrice: 209,
    location: 'Bay A'
  }];
  const draft = {
    id: 'INVT-2040',
    itemName: 'metbopp-570-18',
    category: 'Film Substrates',
    micron: 18,
    widthMm: 570,
    availableQtyKg: 10,
    unitPrice: 205,
    location: 'Bay A - Inward Dock'
  };
  const blocked = planManualStockSave(inventory, draft);
  assert.equal(blocked.action, 'duplicate');
  assert.equal(blocked.existing.id, 'INVT-0150');
  const added = planManualStockSave(inventory, draft, { confirmAdd: true });
  assert.equal(added.action, 'add');
  assert.equal(added.item.id, 'INVT-0150');
  assert.equal(added.item.availableQtyKg, 36);
  assert.equal(added.item.location, 'Bay A');
  assert.equal(added.item.unitPrice, 207.89);
});
