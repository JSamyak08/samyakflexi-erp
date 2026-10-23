import test from 'node:test';
import assert from 'node:assert/strict';
import { groupGrnLineItems, lineItemsForGrn, sanitizeGRN } from '../src/services/grnLineItems.js';

const packedMeta = {
  category: 'Film Substrates',
  filmType: 'PET',
  micron: 12,
  widthMm: 1000,
  rollsReceived: 2,
  purchaseRatePerKg: 145.5,
  batchNo: 'BATCH-PET-991',
  packagingType: 'Roll',
  grossWeightKg: 520,
  tareWeightKg: 20,
  itemsBreakdown: [
    { unitNo: 1, barcodeId: 'RM-BC-1', netWeightKg: 250, grossWeightKg: 260, tareWeightKg: 10, vendorRollNo: 'VR-01' },
    { unitNo: 2, barcodeId: 'RM-BC-2', netWeightKg: 250, grossWeightKg: 260, tareWeightKg: 10, vendorRollNo: 'VR-02' }
  ]
};

test('a packed single-item GRN keeps its header and gains one synthesized line', () => {
  const raw = {
    id: 'GRN-1',
    grn_number: 'GRN-1',
    item_name: `PET 12µ x 1000mm ||| ${JSON.stringify(packedMeta)}`,
    received_qty_kg: 500,
    status: 'Pending QC Approval'
  };

  const grn = sanitizeGRN(raw);
  assert.equal(grn.itemName, 'PET 12µ x 1000mm');
  assert.equal(grn.filmType, 'PET');
  assert.equal(grn.micron, 12);
  assert.equal(grn.widthMm, 1000);
  assert.equal(grn.netWeightKg, 500);
  assert.equal(grn.receivedQtyKg, 500);
  assert.equal(grn.purchaseRatePerKg, 145.5);
  assert.equal(grn.rollsReceived, 2);
  assert.equal(grn.itemsBreakdown.length, 2);
  assert.equal(grn.lineItems.length, 1);
  assert.equal(grn.lineItems[0].id, 'GRN-1-L1');
  assert.equal(grn.lineItems[0].itemName, 'PET 12µ x 1000mm');
  assert.equal(grn.lineItems[0].netWeightKg, 500);
  assert.equal(grn.lineItems[0].rolls.length, 2);
  assert.equal(grn.lineItems[0].rolls[0].vendorRollNo, 'VR-01');
  assert.equal(grn.lineItems[0].invoiceQtyKg, null);

  const again = sanitizeGRN(grn);
  assert.equal(again.itemName, grn.itemName);
  assert.equal(again.netWeightKg, grn.netWeightKg);
  assert.equal(again.filmType, grn.filmType);
  assert.equal(again.lineItems.length, 1);
  assert.equal(again.lineItems[0].rolls.length, 2);
  assert.equal(again.itemsBreakdown.length, 2);
});

test('stored line rows are used and the header summary is left as it was', () => {
  const stored = {
    id: 'GRN-9-L1',
    grn_id: 'GRN-9',
    line_no: 1,
    item_name: 'PET 12µ x 1000mm',
    film_type: 'PET',
    micron: 12,
    width_mm: 1000,
    purchase_rate: 145.5,
    batch_no: 'BATCH-PET-991',
    net_weight_kg: 500,
    rolls_received: 2,
    invoice_qty_kg: null,
    rolls: [
      { unitNo: 1, barcodeId: 'RM-BC-1', netWeightKg: 250, vendorRollNo: 'VR-01' }
    ]
  };
  const raw = {
    id: 'GRN-9',
    grn_number: 'GRN-9',
    item_name: `PET 12µ x 1000mm ||| ${JSON.stringify(packedMeta)}`,
    received_qty_kg: 500,
    lineItems: [stored]
  };

  const grn = sanitizeGRN(raw);
  assert.equal(grn.itemName, 'PET 12µ x 1000mm');
  assert.equal(grn.netWeightKg, 500);
  assert.equal(grn.lineItems.length, 1);
  assert.equal(grn.lineItems[0].id, 'GRN-9-L1');
  assert.equal(grn.lineItems[0].purchaseRate, 145.5);
  assert.equal(grn.lineItems[0].micron, 12);
  assert.equal(grn.lineItems[0].widthMm, 1000);
  assert.equal(grn.lineItems[0].rolls[0].barcodeId, 'RM-BC-1');
});

test('line rows group onto the matching receipt id', () => {
  const grouped = groupGrnLineItems([
    { id: 'GRN-2-L1', grn_id: 'GRN-2', line_no: 1, item_name: 'Solvent', net_weight_kg: 40, rolls: [] }
  ]);
  const rows = lineItemsForGrn(grouped, { id: 'GRN-2', grn_number: 'GRN-DOC-2' });
  assert.equal(rows.length, 1);
  const grn = sanitizeGRN({
    id: 'GRN-2',
    grn_number: 'GRN-DOC-2',
    item_name: 'Plain solvent',
    received_qty_kg: 40,
    lineItems: rows
  });
  assert.equal(grn.itemName, 'Plain solvent');
  assert.equal(grn.netWeightKg, 40);
  assert.equal(grn.lineItems[0].itemName, 'Solvent');
  assert.equal(grn.lineItems[0].netWeightKg, 40);
});
