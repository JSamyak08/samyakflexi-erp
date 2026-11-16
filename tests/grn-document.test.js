import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyMultiLineQc,
  qcApprovalFallbackRolls,
  singleLineQcRollUpdates,
  findDuplicateInvoice,
  grnIdentityProblems,
  grnLineIdentityGaps,
  mergeRollsIntoList,
  oneLineFromReceipt,
  pdfLinesFromGrn,
  pendingQcKgForItem,
  prepareMultiLineReceipt,
  rollBarcode,
  summarizeReceiptLines,
  taxableAmountFromLines
} from '../src/services/grnDocument.js';

test('one line keeps the item name and a single roll uses the supplied barcode', () => {
  const summary = summarizeReceiptLines([{
    itemName: 'PET 12µ x 1000mm',
    netWeightKg: 500,
    purchaseRate: 145.5,
    rolls: [{ barcodeId: 'RM-BC-ONCE', netWeightKg: 500 }]
  }]);
  assert.equal(summary.itemName, 'PET 12µ x 1000mm');
  assert.equal(summary.netWeightKg, 500);
  assert.equal(summary.lineCount, 1);
  assert.equal(rollBarcode({
    isFilm: true,
    grnCode: 'SIL/GRN/26-27/104',
    lineCount: 1,
    rollCount: 1,
    rollIndex: 1,
    singleBarcode: 'RM-BC-ONCE'
  }), 'RM-BC-ONCE');
  assert.equal(rollBarcode({
    isFilm: true,
    grnCode: 'SIL/GRN/26-27/104',
    lineCount: 1,
    rollCount: 2,
    rollIndex: 2
  }), 'RM-BC-SIL/GRN/26-27/104-2');
});

test('several lines sum the weight, suffix the name, and keep roll barcodes apart', () => {
  const summary = summarizeReceiptLines([
    { id: 'G-L1', lineNo: 1, itemName: 'PET 12µ', netWeightKg: 300, purchaseRate: 100, rolls: [{ netWeightKg: 300 }] },
    { id: 'G-L2', lineNo: 2, itemName: 'LDPE 50µ', netWeightKg: 200, purchaseRate: 80, rolls: [{ netWeightKg: 200 }] }
  ]);
  assert.equal(summary.itemName, 'PET 12µ + 1 more');
  assert.equal(summary.netWeightKg, 500);
  assert.equal(summary.receivedQtyKg, 500);
  assert.equal(summary.purchaseRatePerKg, 100);
  assert.equal(summary.itemsBreakdown[1].lineItemId, 'G-L2');
  assert.equal(rollBarcode({
    isFilm: false,
    grnCode: '104',
    lineCount: 2,
    lineNo: 2,
    rollIndex: 1
  }), 'CON-BC-104-L2-R1');
});

test('the same supplier and invoice is a duplicate, a different supplier is not', () => {
  const existing = [
    { id: 'GRN-1', grnNo: 'SIL/GRN/26-27/1', invoiceNo: 'INV-9', vendorName: 'Acme' }
  ];
  assert.equal(findDuplicateInvoice(existing, {
    invoiceNo: 'INV-9',
    vendorName: 'Acme',
    grnNo: 'SIL/GRN/26-27/2'
  }).id, 'GRN-1');
  assert.equal(findDuplicateInvoice(existing, {
    invoiceNo: 'INV-9',
    vendorName: 'Other Mills',
    grnNo: 'SIL/GRN/26-27/2'
  }), null);
  assert.equal(findDuplicateInvoice(existing, {
    invoiceNo: 'INV-9',
    vendorName: 'Acme',
    grnNo: 'SIL/GRN/26-27/1'
  }), null);
});

test('a multi-line save builds one lot and one roll set per line', () => {
  let barcodes = 0;
  let lots = 0;
  const { newGRN, inventoryLots, rolls } = prepareMultiLineReceipt({
    header: { vendorName: 'Acme', invoiceNo: 'INV-1', poNumber: 'PO-1', storeManager: 'Store' },
    capturedLines: [
      {
        category: 'Film Substrates',
        filmType: 'PET',
        micron: 12,
        widthMm: 1000,
        purchaseRate: 100,
        batchNo: 'B1',
        rolls: [{ grossWeightKg: 110, tareWeightKg: 10, netWeightKg: 100, vendorRollNo: 'V1' }]
      },
      {
        category: 'Chemicals & Solvents',
        itemName: 'Ethyl Acetate',
        unit: 'Kg',
        purchaseRate: 50,
        batchNo: 'B2',
        rolls: [{ netWeightKg: 40, vendorRollNo: 'V2' }]
      }
    ],
    grnNo: 'SIL/GRN/26-27/200',
    nowIso: '2026-10-24T05:00:00.000Z',
    inventory: [],
    generateBarcodeId: () => `SINGLE-${barcodes += 1}`,
    generateInventoryId: (items) => {
      lots += 1;
      return `INVT-${String(items.length + 1).padStart(4, '0')}`;
    },
    formatFilmItemName: (film, width, micron) => `${film} ${micron} x ${width}`,
    isMetalloceneEligibleFilm: () => false
  });
  assert.equal(newGRN.itemName, 'PET 12 x 1000 + 1 more');
  assert.equal(newGRN.netWeightKg, 140);
  assert.equal(newGRN.receivedQtyKg, 140);
  assert.equal(newGRN.lineItems.length, 2);
  assert.equal(newGRN.lineItems[0].id, 'SIL/GRN/26-27/200-L1');
  assert.equal(newGRN.lineItems[1].itemName, 'Ethyl Acetate');
  assert.equal(inventoryLots.length, 2);
  assert.equal(inventoryLots[0].availableQtyKg, 0);
  assert.equal(inventoryLots[1].availableQtyKg, 0);
  assert.notEqual(inventoryLots[0].id, inventoryLots[1].id);
  assert.equal(rolls.length, 2);
  assert.equal(rolls[0].barcodeId, 'RM-BC-SIL/GRN/26-27/200-L1-R1');
  assert.equal(rolls[1].barcodeId, 'CON-BC-SIL/GRN/26-27/200-L2-R1');
  assert.equal(rolls[0].grnLineItemId, 'SIL/GRN/26-27/200-L1');
  assert.equal(rolls[1].grnId, 'SIL/GRN/26-27/200');
  assert.equal(rolls[0].vendorRollNo, 'V1');
  assert.equal(lots, 2);
});

test('a stored single-line receipt still prints and posts like one item', () => {
  const grn = {
    id: 'GRN-1',
    grnNo: 'GRN-1',
    itemName: 'PET 12µ x 1000mm',
    netWeightKg: 500,
    unitPrice: 145.5,
    purchaseRatePerKg: 145.5,
    rollsReceived: 1,
    itemsBreakdown: [{ barcodeId: 'RM-BC-1', netWeightKg: 500 }],
    lineItems: [oneLineFromReceipt({
      id: 'GRN-1',
      itemName: 'PET 12µ x 1000mm',
      netWeightKg: 500,
      purchaseRatePerKg: 145.5,
      rollsReceived: 1,
      itemsBreakdown: [{ barcodeId: 'RM-BC-1', netWeightKg: 500 }]
    })]
  };
  const lines = pdfLinesFromGrn(grn);
  assert.equal(lines.length, 1);
  assert.equal(taxableAmountFromLines(lines), 72750);
  assert.equal(lines[0].itemName, 'PET 12µ x 1000mm');

  const pending = pendingQcKgForItem(
    { id: 'INV-1', category: 'Film Substrates', filmType: 'PET', micron: 12, widthMm: 1000, itemName: 'PET' },
    [{
      status: 'Pending QC',
      filmType: 'PET',
      micron: 12,
      widthMm: 1000,
      netWeightKg: 500,
      lineItems: grn.lineItems
    }]
  );
  assert.equal(pending, 500);
});

test('QC posts each line onto its own stock item', () => {
  const grn = {
    id: 'G',
    grnNo: 'G',
    itemName: 'PET + 1 more',
    netWeightKg: 140,
    lineItems: [
      {
        id: 'G-L1',
        lineNo: 1,
        category: 'Film Substrates',
        itemName: 'PET',
        filmType: 'PET',
        micron: 12,
        widthMm: 1000,
        stockItemId: 'LOT-1',
        purchaseRate: 100,
        batchNo: 'B1',
        netWeightKg: 100,
        rolls: [{ barcodeId: 'R1', netWeightKg: 100 }]
      },
      {
        id: 'G-L2',
        lineNo: 2,
        category: 'Chemicals & Solvents',
        itemName: 'Solvent',
        stockItemId: 'LOT-2',
        purchaseRate: 50,
        batchNo: 'B2',
        netWeightKg: 40,
        rolls: [{ barcodeId: 'R2', netWeightKg: 40 }]
      }
    ]
  };
  const { updatedGRN, stockPosts, rollPatches } = applyMultiLineQc({
    grn,
    draftsByLineId: {
      'G-L1': { ...grn.lineItems[0], itemsBreakdown: [{ barcodeId: 'R1', netWeightKg: 98 }] },
      'G-L2': { ...grn.lineItems[1], itemsBreakdown: [{ barcodeId: 'R2', netWeightKg: 40 }] }
    },
    status: 'Approved',
    formatFilmItemName: () => 'PET verified',
    isMetalloceneEligibleFilm: () => false,
    calculateFilmRollLength: () => 10
  });
  assert.equal(stockPosts.length, 2);
  assert.equal(stockPosts[0].stockItemId, 'LOT-1');
  assert.equal(stockPosts[0].addKg, 98);
  assert.equal(stockPosts[1].stockItemId, 'LOT-2');
  assert.equal(stockPosts[1].addKg, 40);
  assert.equal(updatedGRN.receivedQtyKg, 138);
  assert.equal(rollPatches[0].itemName, 'PET verified');
  assert.equal(rollPatches[1].itemName, 'Solvent');
  assert.notEqual(rollPatches[0].filmType, rollPatches[1].itemName);
});

test('a new receipt starts with no vendor, category, or stock item', () => {
  assert.deepEqual(grnIdentityProblems({
    vendor: '',
    lines: [{ category: '', itemName: '', itemSearchTerm: '', stockItemId: '' }]
  }), [
    'Select a vendor.',
    'Select an item category.',
    'Select or search a stock item.'
  ]);
  assert.deepEqual(grnLineIdentityGaps({ category: '', filmType: 'PET', micron: 12, widthMm: 1000 }), [
    'missing category',
    'missing stock item'
  ]);
  assert.deepEqual(grnIdentityProblems({
    vendor: 'Aksh Impex',
    lines: [{ category: 'Printing Inks', itemName: 'Flint Process cyan', stockItemId: 'WCL4-50JK-01FW' }]
  }), []);
  assert.deepEqual(grnIdentityProblems({
    vendor: 'Agroha Marketing',
    lines: [
      { category: 'Film Substrates', itemName: 'METPET 12µ x 910mm', stockItemId: 'INVT-0147' },
      { category: '', itemName: '', stockItemId: '' }
    ]
  }), [
    'Item 2: select an item category.',
    'Item 2: select or search a stock item.'
  ]);
  assert.deepEqual(grnIdentityProblems({
    vendor: 'Aksh Impex',
    lines: [{ category: 'Film Substrates', itemName: 'METPET 12µ x 910mm', stockItemId: '' }]
  }), []);
});

test('the new GRN form does not preselect the first vendor or category', () => {
  const source = fs.readFileSync(new URL('../src/components/InventoryManagement.jsx', import.meta.url), 'utf8');
  assert.match(source, /const \[grnVendor, setGrnVendor\] = useState\(''\)/);
  assert.match(source, /const \[grnCategory, setGrnCategory\] = useState\(''\)/);
  assert.doesNotMatch(source, /useState\(vendors\[0\]/);
  assert.match(source, /placeholder="Select or search vendor"/);
  assert.match(source, /placeholder="Select item category"/);
  assert.match(source, /placeholder="Select or search stock item"/);
  const opener = source.slice(source.indexOf('const openNewGRNModal'), source.indexOf('const filteredStockItemsForGrn'));
  assert.match(opener, /setGrnVendor\(''\)/);
  assert.match(opener, /setGrnCategory\(''\)/);
  assert.match(opener, /setGrnSelectedStockItemId\(''\)/);
  assert.doesNotMatch(opener, /handleSelectPoForGrn/);
  assert.doesNotMatch(opener, /setGrnCategory\('Film Substrates'\)/);
  const blank = source.slice(source.indexOf('const blankGrnLineFields'), source.indexOf('const handleAddAnotherGrnItem'));
  assert.match(blank, /setGrnCategory\(''\)/);
  assert.match(blank, /setGrnSelectedStockItemId\(''\)/);
  assert.doesNotMatch(blank, /setGrnVendor/);
});

test('new roll barcodes are inserted into the on-screen list', () => {
  const merged = mergeRollsIntoList(
    [{ barcodeId: 'OLD', netWeightKg: 1 }],
    [{ barcodeId: 'OLD', netWeightKg: 2 }, { barcodeId: 'NEW', netWeightKg: 3 }]
  );
  assert.deepEqual(merged.map((roll) => roll.barcodeId), ['NEW', 'OLD']);
  assert.equal(merged.find((roll) => roll.barcodeId === 'OLD').netWeightKg, 2);
});

test('the QC fallback does not select a balance roll that shares the GRN line', () => {
  const lineId = 'SIL/GRN/26-27/205-L1';
  const grn = { id: 'SIL/GRN/26-27/205', grnNo: 'SIL/GRN/26-27/205' };
  const parentBarcode = 'RM-BC-SIL/GRN/26-27/205-L1-R2';
  const balanceBarcode = 'RM-BC-SIL/GRN/26-27/205-L1-R2-BAL';
  const patches = [
    { barcodeId: balanceBarcode, grnLineItemId: lineId, netWeightKg: 158.08 },
    { barcodeId: parentBarcode, grnLineItemId: lineId, netWeightKg: 200.5 }
  ];
  const parent = {
    barcodeId: parentBarcode,
    grnId: grn.id,
    grnLineItemId: lineId,
    netWeightKg: 180,
    availableWeightKg: 180
  };
  const lineOnly = {
    barcodeId: 'RM-BC-SIL/GRN/26-27/205-L1-R9',
    grnId: grn.id,
    grnLineItemId: lineId,
    netWeightKg: 10,
    availableWeightKg: 10
  };
  const balance = {
    barcodeId: balanceBarcode,
    grnId: grn.id,
    grnNo: grn.grnNo,
    grnLineItemId: lineId,
    netWeightKg: 158.08,
    availableWeightKg: 158.08,
    balanceRoll: true
  };
  const flagged = {
    barcodeId: 'RM-BC-SIL/GRN/26-27/205-L1-R3',
    balanceRoll: true,
    grnId: grn.id,
    grnLineItemId: lineId,
    netWeightKg: 40,
    availableWeightKg: 40
  };
  const updated = qcApprovalFallbackRolls([parent, lineOnly, balance, flagged], patches, grn);
  assert.deepEqual(updated.map((roll) => roll.barcodeId), [parentBarcode, parentBarcode]);
  assert.ok(updated.every((roll) => roll.availableWeightKg === 200.5 && roll.netWeightKg === 200.5));
  assert.equal(updated.some((roll) => /-BAL$/i.test(String(roll.barcodeId || '')) || roll.balanceRoll === true), false);
  assert.equal(balance.barcodeId, balanceBarcode);
  assert.equal(balance.netWeightKg, 158.08);
  assert.equal(balance.availableWeightKg, 158.08);
  assert.equal(flagged.netWeightKg, 40);
  assert.equal(flagged.availableWeightKg, 40);
});

test('a single-line QC approval leaves the balance roll untouched and keeps R1 to R3 on their own weights', () => {
  const grnNo = 'SIL/GRN/26-27/310';
  const codes = [1, 2, 3].map((n) => `RM-BC-${grnNo}-R${n}`);
  const balanceCode = `RM-BC-${grnNo}-R2-BAL`;
  const weights = [111.11, 222.22, 333.33];
  const breakdown = [
    { barcodeId: codes[0], netWeightKg: weights[0], grossWeightKg: 114.11, tareWeightKg: 3, lengthMeters: 1000 },
    { barcodeId: codes[1], netWeightKg: weights[1], grossWeightKg: 225.22, tareWeightKg: 3, lengthMeters: 2000 },
    { barcodeId: balanceCode, netWeightKg: 158.08, grossWeightKg: 161.08, tareWeightKg: 3, lengthMeters: 1500 },
    { barcodeId: codes[2], netWeightKg: weights[2], grossWeightKg: 336.33, tareWeightKg: 3, lengthMeters: 3000 }
  ];
  const rolls = [
    { barcodeId: codes[0], grnNo, netWeightKg: 10, availableWeightKg: 10 },
    { barcodeId: codes[1], grnNo, netWeightKg: 20, availableWeightKg: 20 },
    { barcodeId: balanceCode, grnNo, netWeightKg: 158.08, availableWeightKg: 158.08 },
    { barcodeId: codes[2], grnNo, netWeightKg: 30, availableWeightKg: 30 }
  ];
  const balance = rolls[2];
  const updated = singleLineQcRollUpdates({
    inventoryRolls: rolls,
    grn: { id: grnNo, grnNo, invoiceNo: 'GST-310', category: 'Film Substrates', itemsBreakdown: breakdown },
    breakdown,
    verifiedNetWeight: 666.66,
    verifiedGrossWeight: 675.66,
    verifiedTareWeight: 9,
    verifiedWidth: 650,
    verifiedMicron: 12,
    verifiedFilmType: 'PET',
    verifiedItemName: 'PET-650-12',
    verifiedBatchNo: 'GST-310',
    isFilm: true,
    isApproved: true,
    finalStatus: 'Approved',
    finalQcStatus: 'Approved',
    category: 'Film Substrates',
    inspectorName: 'QC Chemist',
    calculateFilmRollLength: () => {
      throw new Error('index assignment should use the receipt roll length');
    }
  });
  assert.deepEqual(updated.map((roll) => roll.barcodeId), codes);
  assert.deepEqual(updated.map((roll) => roll.netWeightKg), weights);
  assert.deepEqual(updated.map((roll) => roll.availableWeightKg), weights);
  assert.deepEqual(updated.map((roll) => roll.lengthMeters), [1000, 2000, 3000]);
  assert.equal(updated.some((roll) => /-BAL$/i.test(String(roll.barcodeId || ''))), false);
  assert.equal(balance.barcodeId, balanceCode);
  assert.equal(balance.netWeightKg, 158.08);
  assert.equal(balance.availableWeightKg, 158.08);
});
