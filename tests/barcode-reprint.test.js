import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  generateSingleStickerHtml,
  getStickerCategoryInfo,
} from '../src/utils/thermalBarcodePrinter.js';
import { isReprintableBarcodeRow, reprintStickerForRow } from '../src/utils/barcodeReprint.js';

const company = { name: 'SAMYAK INTERNATIONAL LTD.', gstin: '23AABCM3526F1ZY' };

function row(barcode, extra = {}) {
  return { barcode, sourceModule: 'Raw material / GRN', sourceTable: 'inventory_rolls', sourceColumn: 'barcode_id', ...extra };
}

function info(sticker) {
  return getStickerCategoryInfo(sticker);
}

test('an inward RM roll reprints its own barcode, kilograms, meters, and film specs', () => {
  const roll = {
    barcodeId: 'RM-BC-20261021-6490FR56',
    itemName: 'PET-800-12',
    rollType: 'RAW_MATERIAL',
    category: 'Film Substrates',
    filmType: 'PET',
    micron: 12,
    widthMm: 800,
    netWeightKg: 20,
    grossWeightKg: 20.5,
    tareWeightKg: 0.5,
    lengthMeters: 1488,
    vendorName: 'Film Vendor',
    batchNo: 'QA-BATCH-2',
    purchaseRatePerKg: 184,
    stationId: 'SCALE_1_INWARD',
  };
  const sources = { inventoryRolls: [roll] };
  const before = JSON.stringify(sources);
  const sticker = reprintStickerForRow(row(roll.barcodeId), sources);
  assert.equal(JSON.stringify(sources), before);
  assert.equal(sticker.barcodeId, 'RM-BC-20261021-6490FR56');
  const stickerInfo = info(sticker);
  assert.equal(stickerInfo.tagLabel, 'RAW MATERIAL (RM)');
  assert.equal(stickerInfo.displayQty, 20);
  assert.equal(stickerInfo.displayUnit, 'Kg');
  assert.equal(stickerInfo.lengthLabel, '1488 m');
  const html = generateSingleStickerHtml(sticker, company);
  assert.match(html, /RM-BC-20261021-6490FR56/);
  assert.match(html, /20/);
  assert.match(html, /1488 m/);
  assert.match(html, /12µ/);
  assert.match(html, /800mm/);
  assert.match(html, /Film Vendor/);
  assert.doesNotMatch(html, /RM-BC-20261021-6490FR56-BAL/);
});

test('a saved roll length wins over a different length still sitting on the GRN line', () => {
  const sticker = reprintStickerForRow(row('RM-BC-20261021-803807E1'), {
    inventoryRolls: [{
      barcodeId: 'RM-BC-20261021-803807E1',
      itemName: 'PET-1000-12',
      rollType: 'RAW_MATERIAL',
      category: 'Film Substrates',
      micron: 12,
      widthMm: 1000,
      netWeightKg: 25,
      lengthMeters: 1488,
    }],
    grns: [{
      grnNo: 'SIL/GRN/26-27/104',
      vendorName: 'SIL Vendor',
      lineItems: [{
        itemName: 'PET-1000-12',
        micron: 12,
        widthMm: 1000,
        rolls: [{ barcodeId: 'RM-BC-20261021-803807E1', netWeightKg: 25, lengthMeters: 60739 }],
      }],
    }],
  });
  assert.equal(info(sticker).lengthLabel, '1488 m');
  assert.equal(sticker.vendorName, 'SIL Vendor');
  assert.equal(sticker.barcodeId, 'RM-BC-20261021-803807E1');
});

test('meters missing on the roll are taken from the GRN line, and a blank length prints as a dash', () => {
  const withGrn = reprintStickerForRow(row('RM-QA-PW-GRN-1'), {
    inventoryRolls: [{
      barcodeId: 'RM-QA-PW-GRN-1',
      itemName: 'QA PW QC Film',
      rollType: 'RAW_MATERIAL',
      category: 'Film Substrates',
      micron: 12,
      widthMm: 460,
      netWeightKg: 10,
      lengthMeters: 0,
    }],
    grns: [{
      vendorName: 'QA Vendor',
      lineItems: [{
        rolls: [{ barcodeId: 'RM-QA-PW-GRN-1', netWeightKg: 10, lengthMeters: 1294, grossWeightKg: 10.5, tareWeightKg: 0.5 }],
      }],
    }],
  });
  assert.equal(info(withGrn).lengthLabel, '1294 m');
  assert.equal(info(withGrn).displayQty, 10);

  const blank = reprintStickerForRow(row('RM-QA95-A1'), {
    inventoryRolls: [{
      barcodeId: 'RM-QA95-A1',
      itemName: 'QA95 PET roll A',
      rollType: 'RAW_MATERIAL',
      category: 'Film Substrates',
      micron: 12,
      widthMm: 1000,
      netWeightKg: 20,
      lengthMeters: null,
    }],
  });
  assert.equal(info(blank).lengthLabel, '-');
  assert.match(generateSingleStickerHtml(blank, company), /Len: -/);
  assert.doesNotMatch(generateSingleStickerHtml(blank, company), /Len: 0/);
});

test('a remaining-balance roll reprints the same -BAL code with its own kilograms and meters', () => {
  const sticker = reprintStickerForRow(row('RM-QA95-A1-BAL', {
    description: 'PET roll - Remaining Balance Roll',
    sourceModule: 'Raw material / GRN',
  }), {
    inventoryRolls: [{
      barcodeId: 'RM-QA95-A1-BAL',
      itemName: 'PET roll - Remaining Balance Roll',
      rollType: 'RAW_MATERIAL',
      netWeightKg: 11.6,
      lengthMeters: 640,
      jobName: 'QA95 Meter Print Job',
      orderId: 'ORD-QA95-PRINT',
    }],
  });
  assert.equal(sticker.barcodeId, 'RM-QA95-A1-BAL');
  const stickerInfo = info(sticker);
  assert.equal(stickerInfo.tagLabel, 'RAW MATERIAL (RM)');
  assert.equal(stickerInfo.displayQty, 11.6);
  assert.equal(stickerInfo.displayUnit, 'Kg');
  assert.equal(stickerInfo.lengthLabel, '640 m');
  const html = generateSingleStickerHtml(sticker, company);
  assert.match(html, /RM-QA95-A1-BAL/);
  assert.match(html, /Len: 640 m/);
  assert.doesNotMatch(html, /RM-QA95-A1-BAL-2/);

  const unmeasured = reprintStickerForRow(row('RM-QA-S5-BAL'), {
    inventoryRolls: [{
      barcodeId: 'RM-QA-S5-BAL',
      itemName: 'PET balance roll',
      rollType: 'RAW_MATERIAL',
      netWeightKg: 8.5,
      lengthMeters: null,
    }],
  });
  assert.equal(info(unmeasured).lengthLabel, '-');
  assert.match(generateSingleStickerHtml(unmeasured, company), /Len: -/);
});

test('a printed SFG roll reprints its own barcode and meters, not the lot total or a new code', () => {
  const lot = {
    sfgBatchCode: 'SFG-LOT-ORD-QA95-PRINT',
    isPrintedLot: true,
    jobName: 'QA95 Meter Print Job',
    orderId: 'ORD-QA95-PRINT',
    totalMeters: 9000,
    totalNetKg: 12.2,
    childRolls: [
      { barcodeId: 'SFG-BC-QA95-PRINT-2', rollNo: 2, netWeightKg: 4, lengthMeters: 80 },
    ],
  };
  const sources = {
    inventoryRolls: [{
      barcodeId: 'SFG-BC-QA95-PRINT-2',
      itemName: 'QA95 Meter Print Job - Printed SFG Roll 2',
      rollType: 'SEMI_FINISHED_GOODS',
      netWeightKg: 4,
      lengthMeters: 80,
      orderId: 'ORD-QA95-PRINT',
      jobName: 'QA95 Meter Print Job',
      parentSfgBatchCode: 'SFG-LOT-ORD-QA95-PRINT',
    }],
    sfgGoods: [lot],
    customBarcodes: [{
      id: 'SFG-BC-QA95-PRINT-2',
      barcode: 'SFG-BC-QA95-PRINT-2',
      kind: 'printed_sfg',
      itemName: 'QA95 Meter Print Job - Printed SFG Roll 2',
      orderId: 'ORD-QA95-PRINT',
    }],
  };
  const before = JSON.stringify(sources);
  const fromRoll = reprintStickerForRow(row('SFG-BC-QA95-PRINT-2', {
    sourceModule: 'Consume child rolls',
    sourceTable: 'inventory_rolls',
    sourceColumn: 'barcode_id',
  }), sources);
  const fromPrint = reprintStickerForRow(row('SFG-BC-QA95-PRINT-2', {
    sourceModule: 'Barcode print',
    sourceTable: 'custom_barcodes',
    sourceColumn: 'payload',
    description: 'QA95 Meter Print Job - Printed SFG Roll 2',
  }), sources);
  assert.equal(JSON.stringify(sources), before);
  for (const sticker of [fromRoll, fromPrint]) {
    assert.equal(sticker.barcodeId, 'SFG-BC-QA95-PRINT-2');
    const stickerInfo = info(sticker);
    assert.equal(stickerInfo.tagLabel, 'SEMI-FINISHED GOODS (SFG)');
    assert.equal(stickerInfo.displayQty, 4);
    assert.equal(stickerInfo.displayUnit, 'Kg');
    assert.equal(stickerInfo.lengthLabel, '80 m');
    const html = generateSingleStickerHtml(sticker, company);
    assert.match(html, /SFG-BC-QA95-PRINT-2/);
    assert.match(html, /Len: 80 m/);
    assert.doesNotMatch(html, /9000/);
    assert.doesNotMatch(html, /SFG-BC-QA95-PRINT-3/);
  }
  assert.equal(reprintStickerForRow(row('SFG-LOT-ORD-QA95-PRINT', {
    sourceModule: 'SFG rolls',
    sourceTable: 'sfg_goods',
    sourceColumn: 'sfg_batch_code',
  }), sources), null);
});

test('a printed SFG child that lives only on the lot still uses that child, not the lot header', () => {
  const sticker = reprintStickerForRow(row('SFG-BC-SKU-CYL-418-1', {
    sourceModule: 'Barcode print',
    sourceTable: 'custom_barcodes',
    sourceColumn: 'payload',
    description: 'Darshan Nana Mint Inner - Printed SFG Roll 1',
  }), {
    sfgGoods: [{
      sfgBatchCode: 'SFG-LOT-ORD-2026-157',
      isPrintedLot: true,
      jobName: 'Darshan Nana Mint Inner',
      orderId: 'ORD-2026-157',
      totalMeters: 5000,
      totalNetKg: 40,
      childRolls: [{ barcodeId: 'SFG-BC-SKU-CYL-418-1', rollNo: 1, netWeightKg: 18.5, lengthMeters: null }],
    }],
    customBarcodes: [{ barcode: 'SFG-BC-SKU-CYL-418-1', kind: 'printed_sfg', itemName: 'Darshan Nana Mint Inner - Printed SFG Roll 1' }],
  });
  assert.equal(sticker.barcodeId, 'SFG-BC-SKU-CYL-418-1');
  assert.equal(info(sticker).displayQty, 18.5);
  assert.equal(info(sticker).lengthLabel, '-');
  assert.match(generateSingleStickerHtml(sticker, company), /Len: -/);
  assert.doesNotMatch(generateSingleStickerHtml(sticker, company), /5000/);
});

test('rows that are not physical stickers do not reprint', () => {
  const sources = {
    inventoryRolls: [{ barcodeId: 'RM-BC-PARENT', itemName: 'PET', rollType: 'RAW_MATERIAL', netWeightKg: 10, lengthMeters: 100 }],
    cylinders: [{ id: 'CYL-1', sku: 'SKU-CYL-1', jobName: 'Job' }],
    scrapItems: [{ barcodeId: 'SCRAP-OLD-1', itemName: 'Trim' }],
  };
  assert.equal(reprintStickerForRow(row('RM-BC-PARENT', {
    sourceModule: 'Production records',
    sourceTable: 'production_records',
    sourceColumn: 'materials_list',
  }), sources), null);
  assert.equal(reprintStickerForRow(row('RM-BC-PARENT', {
    sourceModule: 'Raw material / GRN',
    sourceTable: 'inventory_rolls',
    sourceColumn: 'input_barcode_ids',
  }), sources), null);
  assert.equal(reprintStickerForRow(row('SKU-CYL-1', {
    sourceModule: 'Cylinders',
    sourceTable: 'cylinders',
    sourceColumn: 'sku',
  }), sources), null);
  assert.equal(reprintStickerForRow(row('SCRAP-OLD-1', {
    sourceModule: 'SFG scrap',
    sourceTable: 'sfg_scrap_items',
    sourceColumn: 'payload',
  }), sources), null);
  assert.equal(reprintStickerForRow(row('RM-BC-PARENT', { status: 'Deleted' }), sources), null);
  assert.equal(reprintStickerForRow(row('FG-DISP-1', {
    sourceModule: 'Dispatch / challans',
    sourceTable: 'delivery_challans',
    sourceColumn: 'payload',
  }), sources), null);
  assert.equal(reprintStickerForRow(row('CON-BC-INK-1', {
    sourceModule: 'Inventory items',
    sourceTable: 'inventory',
    sourceColumn: 'barcode',
  }), sources), null);
  assert.equal(reprintStickerForRow(row('BAR-TX-1', {
    sourceModule: 'Stock adjustments',
    sourceTable: 'stock_adjustments',
    sourceColumn: 'payload',
  }), sources), null);
  assert.equal(isReprintableBarcodeRow(row('SFG-LOT-ORD-1', { sourceTable: 'sfg_goods', sourceModule: 'SFG rolls' })), false);
});

test('a dispatch packing roll and a QC hold tag reprint the saved sticker', () => {
  const dispatch = reprintStickerForRow(row('FG-DISP-100001-1', {
    sourceModule: 'Dispatch / challans',
    sourceTable: 'dispatch_shipments',
    sourceColumn: 'items',
  }), {
    dispatchShipments: [{
      dispatchId: 'PL-1',
      items: [{
        barcodeId: 'FG-DISP-100001-1',
        rollType: 'FG_DISPATCH',
        jobName: 'Finished pouch',
        clientName: 'Acme',
        netWeightKg: 22,
        grossWeightKg: 23,
        poNo: 'PO-9',
        stationId: 'Dispatch Main Dock',
      }],
    }],
  });
  assert.equal(dispatch.barcodeId, 'FG-DISP-100001-1');
  assert.equal(info(dispatch).displayQty, 22);
  assert.equal(info(dispatch).tagLabel, 'FINISHED GOODS (FG)');
  assert.match(generateSingleStickerHtml(dispatch, company), /FG-DISP-100001-1/);

  const hold = reprintStickerForRow(row('QCHOLD-184221', {
    sourceModule: 'SFG QC hold',
    sourceTable: 'sfg_qc_hold_items',
    sourceColumn: 'payload',
  }), {
    qcHoldItems: [{
      barcodeId: 'QCHOLD-184221',
      isQCHold: true,
      jobName: 'Hold job',
      totalHoldKg: 6.5,
      holdReason: 'Gauge out',
    }],
  });
  assert.equal(hold.barcodeId, 'QCHOLD-184221');
  assert.equal(info(hold).isQCHold, true);
  assert.equal(info(hold).displayQty, 6.5);
  assert.match(generateSingleStickerHtml(hold, company), /QCHOLD-184221/);
  assert.match(generateSingleStickerHtml(hold, company), /Gauge out/);
});

test('an FG batch and a non-lot SFG batch reprint as their own stickers', () => {
  const fg = reprintStickerForRow(row('FG-BC-ORD-6740', {
    sourceModule: 'FG rolls',
    sourceTable: 'sfg_goods',
    sourceColumn: 'sfg_batch_code',
  }), {
    sfgGoods: [{
      sfgBatchCode: 'FG-BC-ORD-6740',
      sfgType: 'Finished Goods (FG)',
      rollType: 'FG',
      category: 'Finished Goods (FG)',
      jobName: 'Revert QA Block',
      totalNetKg: 40,
      availableKg: 40,
      totalMeters: 0,
    }],
  });
  assert.equal(fg.barcodeId, 'FG-BC-ORD-6740');
  assert.equal(info(fg).tagLabel, 'FINISHED GOODS (FG)');
  assert.equal(info(fg).displayQty, 40);
  assert.equal(info(fg).displayUnit, 'Kg');
  assert.equal(info(fg).lengthLabel, '-');

  const sfg = reprintStickerForRow(row('SFG-MB-PRT-1', {
    sourceModule: 'SFG rolls',
    sourceTable: 'inventory_rolls',
    sourceColumn: 'barcode_id',
  }), {
    inventoryRolls: [{
      barcodeId: 'SFG-MB-PRT-1',
      itemName: 'Mass Balance Printing',
      rollType: 'SEMI_FINISHED_GOODS',
      netWeightKg: 120,
      lengthMeters: null,
      jobName: 'Mass Balance Printing',
    }],
  });
  assert.equal(sfg.barcodeId, 'SFG-MB-PRT-1');
  assert.equal(info(sfg).tagLabel, 'SEMI-FINISHED GOODS (SFG)');
  assert.equal(info(sfg).displayQty, 120);
  assert.equal(info(sfg).lengthLabel, '-');
});

test('reprint does not mint a barcode and the list only prints sticker rows', () => {
  const source = fs.readFileSync('src/utils/barcodeReprint.js', 'utf8');
  const registry = fs.readFileSync('src/components/BarcodeRegistry.jsx', 'utf8');
  const modal = fs.readFileSync('src/components/BarcodePrinterModal.jsx', 'utf8');
  assert.doesNotMatch(source, /printedRollBarcode|Date\.now|supabase|saveInventoryRoll/);
  assert.match(registry, /reprintStickerForRow/);
  assert.match(registry, /data-testid="barcode-reprint"/);
  assert.match(registry, /variant="reprint"/);
  const overlay = modal.slice(modal.indexOf('barcode-printer-modal-root'), modal.indexOf('<style>'));
  assert.doesNotMatch(overlay, /onClick=\{onClose\}/);
  assert.match(modal, /onClick=\{onClose\}/);
  assert.match(modal, /useModalDismiss/);
  assert.match(modal, /variant === 'reprint'/);
});
