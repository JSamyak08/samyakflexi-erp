import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStickerCategoryInfo,
  generateSingleStickerHtml,
  generateThermalLabelsHtml,
  prepareStoreStickerRoll
} from '../src/utils/thermalBarcodePrinter.js';
import { completionForOrder, labelRoll } from '../src/utils/printRunCompletion.js';
import { rollsEligibleForBarcodeLabel } from '../src/utils/scrapIdentity.js';

function stickerOf(row) {
  return getStickerCategoryInfo(row);
}

test('an SFG store lot uses available kilograms, the batch code, and the SFG label', () => {
  const storeRow = {
    id: '8f1c2a40-1111-4111-8111-111111111111',
    sfgBatchCode: 'SFG-BC-ORD-2026-2259-1',
    jobName: 'Naretive Systemic Fungicide 1kg',
    orderId: 'ORD-2026-2259',
    sfgType: 'Printed Rolls',
    availableKg: 45.9,
    totalNetKg: 45.9,
    totalGrossKg: 46.4,
    totalMeters: 0
  };
  const prepared = prepareStoreStickerRoll(storeRow, [{
    barcodeId: 'SFG-BC-ORD-2026-2259-1',
    lengthMeters: 4100,
    grossWeightKg: 46.4,
    netWeightKg: 45.9
  }]);
  const info = stickerOf(prepared);
  assert.equal(info.tagLabel, 'SEMI-FINISHED GOODS (SFG)');
  assert.equal(info.displayQty, 45.9);
  assert.equal(info.displayUnit, 'Kg');
  assert.equal(info.grossKg, 46.4);
  assert.equal(info.lengthMeters, 4100);
  assert.equal(info.lengthLabel, '4100 m');
  assert.equal(info.barcodeCode, 'SFG-BC-ORD-2026-2259-1');
  assert.equal(info.showLength, true);

  const html = generateSingleStickerHtml(prepared, { name: 'SAMYAK INTERNATIONAL LTD.' });
  assert.match(html, /SEMI-FINISHED GOODS \(SFG\)/);
  assert.match(html, /45\.9/);
  assert.match(html, /Unit: Kg/);
  assert.match(html, /Gross: 46\.4 kg/);
  assert.match(html, /Len: 4100 m/);
  assert.match(html, /SFG-BC-ORD-2026-2259-1/);
  assert.doesNotMatch(html, /STORE ITEM/);
  assert.doesNotMatch(html, /0 Pcs/);
  assert.match(html, /Batch \/ Heat #: <strong>-<\/strong>/);
  assert.match(html, /₹-/);
  const reprint = generateThermalLabelsHtml([prepared], { name: 'SAMYAK INTERNATIONAL LTD.' });
  assert.match(reprint, /45\.9/);
  assert.match(reprint, /Unit: Kg/);
  assert.match(reprint, /Len: 4100 m/);
});

test('a store row with no inventory length shows a dash instead of 0 meters', () => {
  const prepared = prepareStoreStickerRoll({
    sfgBatchCode: 'SFG-BC-ORD-2026-2259-1',
    jobName: 'Naretive Systemic Fungicide 1kg',
    rollType: 'SFG',
    availableKg: 45.9,
    totalMeters: 0,
    lengthMeters: 0
  });
  const info = stickerOf(prepared);
  assert.equal(info.displayQty, 45.9);
  assert.equal(info.displayUnit, 'Kg');
  assert.equal(info.lengthMeters, null);
  assert.equal(info.lengthLabel, '-');
  const html = generateSingleStickerHtml(prepared, {});
  assert.match(html, /Len: -/);
  assert.doesNotMatch(html, /Len: 0/);
});

test('a printed child roll keeps its own kilograms and meters', () => {
  const tag = labelRoll({
    barcodeId: 'SFG-BC-JOB-1-1',
    netWeightKg: 36,
    lengthMeters: 1200,
    itemName: 'Snack roll'
  }, { jobName: 'Snack roll', orderId: 'ORD-1' });
  const info = stickerOf(tag);
  assert.equal(info.tagLabel, 'SEMI-FINISHED GOODS (SFG)');
  assert.equal(info.displayQty, 36);
  assert.equal(info.displayUnit, 'Kg');
  assert.equal(info.lengthLabel, '1200 m');
  assert.equal(info.barcodeCode, 'SFG-BC-JOB-1-1');
});

test('a completion summary roll is kilograms even when the row was stamped Pcs', () => {
  const tag = labelRoll({
    barcodeId: 'SFG-BC-CYL-2026-176-1',
    netWeightKg: 127.4,
    grossWeightKg: 127.4,
    lengthMeters: null,
    unit: 'Pcs',
    rollType: 'SEMI_FINISHED_GOODS',
    itemName: 'Tashibo Love Inner'
  }, { jobName: 'Tashibo Love Inner' });
  const info = stickerOf(tag);
  assert.equal(info.displayQty, 127.4);
  assert.equal(info.displayUnit, 'Kg');
  assert.equal(info.grossKg, 127.4);
  assert.equal(info.lengthLabel, '-');
  assert.equal(info.tagLabel, 'SEMI-FINISHED GOODS (SFG)');
  const html = generateSingleStickerHtml(tag, {});
  assert.match(html, /127\.4 <span class="qty-unit">Kg<\/span>/);
  assert.match(html, /Unit: Kg/);
  assert.match(html, /Gross: 127\.4 kg/);
  assert.match(html, /Len: -/);
  assert.doesNotMatch(html, /Pcs/);

  const poisoned = stickerOf({
    barcodeId: 'SFG-BC-CYL-2026-176-1',
    rollType: 'SEMI_FINISHED_GOODS',
    category: 'Semi-Finished Goods (SFG)',
    unit: 'Pcs',
    netWeightKg: 127.4,
    grossWeightKg: 127.4,
    lengthMeters: 0
  });
  assert.equal(poisoned.displayUnit, 'Kg');
  assert.equal(poisoned.displayQty, 127.4);
  assert.equal(poisoned.lengthLabel, '-');
});

test('a balance roll is a raw-material kilogram tag and does not invent meters', () => {
  const tag = labelRoll({
    barcodeId: 'RM-1-BAL',
    netWeightKg: 40,
    rollType: 'RAW_MATERIAL'
  }, { jobName: 'Snack roll' });
  const info = stickerOf(tag);
  assert.equal(info.tagLabel, 'RAW MATERIAL (RM)');
  assert.equal(info.displayQty, 40);
  assert.equal(info.displayUnit, 'Kg');
  assert.equal(info.grossKg, null);
  assert.equal(info.lengthLabel, '-');
  assert.equal(info.showLength, true);
  const html = generateSingleStickerHtml(tag, {});
  assert.match(html, /RAW MATERIAL \(RM\)/);
  assert.match(html, /Len: -/);
  assert.doesNotMatch(html, /Pcs/);
});

test('a store item whose real unit is pieces stays in pieces and has no length line', () => {
  const info = stickerOf({
    barcodeId: 'CON-BC-100',
    itemName: 'Doctor Blade',
    category: 'Doctor Blades',
    rollType: 'CONSUMABLE_ITEM',
    unit: 'Pcs',
    qty: 12
  });
  assert.equal(info.displayUnit, 'Pcs');
  assert.equal(info.displayQty, 12);
  assert.equal(info.isSFG, false);
  assert.equal(info.isRoll, false);
  assert.equal(info.showLength, false);
  assert.equal(info.tagLabel, 'DOCTOR BLADES');
  const html = generateSingleStickerHtml({
    barcodeId: 'CON-BC-100',
    itemName: 'Doctor Blade',
    category: 'CONSUMABLE_ITEM',
    rollType: 'CONSUMABLE_ITEM',
    unit: 'Pcs',
    qty: 8
  }, {});
  assert.match(html, /STORE ITEM/);
  assert.match(html, /8 <span class="qty-unit">Pcs<\/span>/);
  assert.doesNotMatch(html, /Len:/);
});

test('completed-job history uses the inventory roll weight and meters, including a balance roll', () => {
  const summary = completionForOrder({
    order: { id: 'ORD-9', jobName: 'Tashibo Love Inner', actualMetersPrinted: 0 },
    sfgGoods: [],
    inventoryRolls: [
      {
        barcodeId: 'SFG-BC-ORD-9-1',
        orderId: 'ORD-9',
        rollType: 'SEMI_FINISHED_GOODS',
        itemName: 'Tashibo Love Inner',
        netWeightKg: 127.4,
        grossWeightKg: 128,
        lengthMeters: 5600,
        unit: 'Pcs'
      },
      {
        barcodeId: 'RM-9-BAL',
        orderId: 'ORD-9',
        rollType: 'RAW_MATERIAL',
        netWeightKg: 14.2
      }
    ]
  });
  assert.equal(summary.printedRolls[0].netWeightKg, 127.4);
  assert.equal(summary.printedRolls[0].lengthMeters, 5600);
  assert.equal(summary.printedRolls[0].grossWeightKg, 128);
  assert.equal(summary.balanceRolls[0].barcodeId, 'RM-9-BAL');
  assert.equal(summary.balanceRolls[0].lengthMeters, null);

  const printed = stickerOf(labelRoll(summary.printedRolls[0], summary));
  assert.equal(printed.displayUnit, 'Kg');
  assert.equal(printed.displayQty, 127.4);
  assert.equal(printed.lengthLabel, '5600 m');
  assert.equal(printed.grossKg, 128);
  const balance = stickerOf(labelRoll(summary.balanceRolls[0], summary));
  assert.equal(balance.displayUnit, 'Kg');
  assert.equal(balance.displayQty, 14.2);
  assert.equal(balance.lengthLabel, '-');
  assert.equal(balance.tagLabel, 'RAW MATERIAL (RM)');
});

test('scrap still produces no sticker', () => {
  const scrap = { id: 'print-scrap:1', scrap: true, rollType: 'SFG', netWeightKg: 3, barcodeId: 'SFG-BC-SCRAP-1' };
  assert.equal(rollsEligibleForBarcodeLabel([scrap]).length, 0);
  const html = generateThermalLabelsHtml([scrap], {});
  assert.doesNotMatch(html, /<div class="thermal-label/);
  assert.doesNotMatch(html, /SFG-BC-SCRAP-1/);
});
