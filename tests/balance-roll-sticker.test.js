import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSingleStickerHtml,
  getStickerCategoryInfo
} from '../src/utils/thermalBarcodePrinter.js';
import { labelRoll } from '../src/utils/printRunCompletion.js';
import { barcodeOriginDate, rollsByBarcode } from '../src/utils/barcodeFifo.js';
import { inheritBalanceDetails } from '../src/utils/balanceRollDetails.js';
import { rollLedgerTransactions, mapRollLedgerRow } from '../src/utils/rollLedger.js';

const company = { name: 'SAMYAK INTERNATIONAL LTD.', gstin: '23AABCM3526F1ZY' };

const parent = {
  barcodeId: 'RM-BC-SIL/GRN/26-27/197-L5-R2',
  itemName: 'PET-750-12',
  itemId: 'INVT-PET-750-12',
  filmType: 'PET',
  micron: 12,
  widthMm: 750,
  vendorName: 'Cosmo Films',
  batchNo: 'HEAT-197',
  invoiceNo: 'INV-197',
  grnNo: 'SIL/GRN/26-27/197',
  purchaseRatePerKg: 186,
  netWeightKg: 210.4,
  availableWeightKg: 0,
  inwardDatetime: '2026-10-21T08:30:00.000Z',
  rollType: 'RAW_MATERIAL'
};

const stock = {
  id: 'INVT-PET-750-12',
  itemName: 'PET-750-12',
  unitPrice: 186,
  lastVendor: 'Cosmo Films',
  lastBatch: 'HEAT-197',
  micron: 12,
  widthMm: 750
};

test('a balance sticker keeps the -BAL code and shows the parent roll', () => {
  const tag = labelRoll({
    barcodeId: 'RM-BC-SIL/GRN/26-27/197-L5-R2-BAL',
    itemName: 'PET roll - Remaining Balance Roll',
    netWeightKg: 152.05,
    grossWeightKg: 152.55,
    lengthMeters: 12071,
    micron: 12,
    widthMm: 750,
    rollType: 'RAW_MATERIAL',
    parentBarcodeId: parent.barcodeId,
    inwardDatetime: '2026-11-13T17:15:00.000Z'
  }, {
    jobName: 'Darshan Toffils Mini Outer',
    orderId: 'ORD-2026-184',
    inventoryRolls: [parent],
    inventory: [stock]
  });

  assert.equal(tag.barcodeId, 'RM-BC-SIL/GRN/26-27/197-L5-R2-BAL');
  assert.equal(tag.itemName, 'PET-750-12');
  assert.equal(tag.micron, 12);
  assert.equal(tag.widthMm, 750);
  assert.equal(tag.vendorName, 'Cosmo Films');
  assert.equal(tag.batchNo, 'HEAT-197');
  assert.equal(tag.grnNo, 'SIL/GRN/26-27/197');
  assert.equal(tag.originalNetWeightKg, 210.4);
  assert.equal(tag.purchaseRatePerKg, 186);
  assert.equal(tag.inwardDatetime, '2026-11-13T17:15:00.000Z');
  assert.notEqual(tag.inwardDatetime, parent.inwardDatetime);

  const info = getStickerCategoryInfo(tag);
  assert.equal(info.barcodeCode, 'RM-BC-SIL/GRN/26-27/197-L5-R2-BAL');
  assert.equal(info.displayQty, 152.05);
  assert.equal(info.displayUnit, 'Kg');
  assert.equal(info.lengthLabel, '12071 m');
  assert.equal(info.isBalance, true);

  const html = generateSingleStickerHtml(tag, company);
  assert.match(html, /class="barcode-code">RM-BC-SIL\/GRN\/26-27\/197-L5-R2-BAL</);
  assert.match(html, /PET-750-12/);
  assert.match(html, /Size: <strong>750 mm<\/strong>/);
  assert.match(html, /Micron: <strong>12 µ<\/strong>/);
  assert.match(html, /Split from: <strong>RM-BC-SIL\/GRN\/26-27\/197-L5-R2<\/strong>/);
  assert.match(html, /SIL\/GRN\/26-27\/197/);
  assert.match(html, /Cosmo Films/);
  assert.match(html, /HEAT-197/);
  assert.match(html, /Original net: <strong>210.4 kg<\/strong>/);
  assert.match(html, /₹186/);
  assert.match(html, /Len: 12071 m/);
  assert.doesNotMatch(html, /Remaining Balance Roll/);
  assert.doesNotMatch(html, /class="barcode-code">RM-BC-SIL\/GRN\/26-27\/197-L5-R2</);
});

test('an SFG leftover uses the same parent block and does not restart FIFO age', () => {
  const sfgParent = {
    barcodeId: 'SFG-BC-ORD-184-1',
    itemName: 'Darshan Toffils Mini Outer',
    filmType: 'PET',
    micron: 12,
    widthMm: 750,
    vendorName: 'In-house print',
    batchNo: 'PRT-184',
    netWeightKg: 40,
    inwardDatetime: '2026-11-01T04:00:00.000Z',
    rollType: 'SEMI_FINISHED_GOODS'
  };
  const child = inheritBalanceDetails({
    barcodeId: 'SFG-BC-ORD-184-1-BAL',
    itemName: 'Film - Remaining Balance Roll',
    netWeightKg: 11.5,
    lengthMeters: 400,
    inwardDatetime: '2026-11-13T17:20:00.000Z',
    rollType: 'SEMI_FINISHED_GOODS',
    balanceRoll: true
  }, { rolls: [sfgParent] });

  assert.equal(child.itemName, 'Darshan Toffils Mini Outer');
  assert.equal(child.parentBarcodeId, 'SFG-BC-ORD-184-1');
  assert.equal(child.micron, 12);
  assert.equal(child.widthMm, 750);
  assert.equal(child.vendorName, 'In-house print');
  assert.equal(child.batchNo, 'PRT-184');
  assert.equal(child.originalNetWeightKg, 40);
  assert.equal(child.inwardDatetime, '2026-11-13T17:20:00.000Z');

  const rolls = rollsByBarcode([sfgParent, child]);
  const origin = barcodeOriginDate(child, { rollsByCode: rolls });
  assert.equal(origin.toISOString(), '2026-11-01T04:00:00.000Z');

  const html = generateSingleStickerHtml(labelRoll(child, {
    jobName: 'Darshan Toffils Mini Outer',
    inventoryRolls: [sfgParent]
  }), company);
  assert.match(html, /class="barcode-code">SFG-BC-ORD-184-1-BAL</);
  assert.match(html, /Split from: <strong>SFG-BC-ORD-184-1<\/strong>/);
  assert.match(html, /Size: <strong>750 mm<\/strong>/);
  assert.match(html, /Micron: <strong>12 µ<\/strong>/);
  assert.doesNotMatch(html, /Remaining Balance Roll/);
});

test('a balance receipt ledger line keeps the parent batch, vendor, and item', () => {
  const row = mapRollLedgerRow({
    id: 'roll-return:1',
    entry_kind: 'balance_receipt',
    barcode: 'RM-1-BAL',
    parent_barcode: 'RM-1',
    qty_kg: 12,
    order_id: 'ORD-1',
    job_name: 'Snack roll',
    stage: 'Printing',
    item_name: 'PET-750-12',
    vendor_name: 'Cosmo Films',
    batch_no: 'HEAT-197',
    purchase_rate: 186,
    grn_no: 'SIL/GRN/26-27/197',
    parent_net_kg: 210.4,
    occurred_at: '2026-11-13T17:15:01.000Z'
  });
  const [line] = rollLedgerTransactions([row]);
  assert.equal(line.barcode, 'RM-1-BAL');
  assert.equal(line.batchNo, 'HEAT-197');
  assert.equal(line.itemName, 'PET-750-12');
  assert.equal(line.ratePerKg, 186);
  assert.match(line.notes, /Split from RM-1/);
  assert.match(line.notes, /PET-750-12/);
  assert.match(line.notes, /SIL\/GRN\/26-27\/197/);
  assert.match(line.notes, /Original net 210.4 kg/);
  assert.match(line.subParty, /Cosmo Films/);
  assert.match(line.subParty, /HEAT-197/);
});
