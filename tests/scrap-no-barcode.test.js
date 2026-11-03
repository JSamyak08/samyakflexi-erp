import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planJobWastage } from '../src/utils/jobWastage.js';
import { planPrintingScrap } from '../src/utils/printingScrap.js';
import {
  findScrapForScan,
  isBarcodeShaped,
  legacyScrapBarcode,
  preserveLegacyScrapFields,
  rollsEligibleForBarcodeLabel,
  scrapInternalRef,
  scrapScanCard,
  withoutScrapBarcode
} from '../src/utils/scrapIdentity.js';
import { BARCODE_SOURCE, collectBarcodes } from '../src/utils/barcodeRegistry.js';

test('process wastage and printing scrap are stored without a barcode', () => {
  const order = { id: 'ORD-2026-194', jobName: 'Nyra Original Outer', orderQtyKg: 1000, unitPrice: 80 };
  const plan = planJobWastage({
    record: {
      id: 'REC-ORD-2026-194',
      orderId: 'ORD-2026-194',
      printingWastageKg: 4,
      trimWastageKg: 1.5,
      slittingSettingWastageKg: 0.5
    },
    order,
    date: '2026-10-26'
  });
  assert.equal(plan.scrap.upserts.length, 3);
  plan.scrap.upserts.forEach((row) => {
    assert.equal(row.barcode, undefined);
    assert.equal(row.barcodeId, undefined);
    assert.equal(row.holdTagId, undefined);
    assert.equal(isBarcodeShaped(row.id), false);
    assert.equal(isBarcodeShaped(row.internalRef), false);
    assert.equal(row.internalRef, row.id);
    assert.equal(row.sourceRecordId, 'REC-ORD-2026-194');
    assert.equal(row.ratePerKg, 80);
    assert.equal(row.defectCategory, row.type);
    assert.ok(row.scrapReason);
  });
  const printing = plan.scrap.upserts.find((row) => row.type === 'Printing Wastage');
  assert.equal(printing.scrapQtyKg, 4);
  assert.equal(printing.valueRs, 320);
  const rewinding = plan.scrap.upserts.find((row) => row.type === 'Trim Wastage');
  assert.equal(rewinding.stage, 'Slitting');
  assert.equal(rewinding.valueRs, 120);

  const printed = planPrintingScrap({
    orderId: 'ORD-2026-194',
    productionRecordId: 'REC-ORD-2026-194',
    plainSettingKg: 2,
    printingWastageKg: 0,
    ratePerKg: 50
  });
  assert.equal(printed.upserts.length, 1);
  assert.equal(printed.upserts[0].holdTagId, undefined);
  assert.equal(printed.upserts[0].sourceRecordId, 'REC-ORD-2026-194');
  assert.equal(printed.upserts[0].valueRs, 100);
  assert.equal(isBarcodeShaped(printed.upserts[0].id), false);
});

test('a new scrap payload drops a barcode-shaped tag and a re-save keeps an old one', () => {
  const fresh = withoutScrapBarcode({
    id: 'scrapref:100',
    holdTagId: 'QCHOLD-100001',
    scrapQtyKg: 3,
    sourceRecordId: 'QCHOLD-100001',
    defectCategory: 'Pinholes / Contamination / Spots',
    ratePerKg: 10
  });
  assert.equal(fresh.barcode, undefined);
  assert.equal(fresh.barcodeId, undefined);
  assert.equal(fresh.holdTagId, undefined);
  assert.equal(fresh.sourceRollBarcode, 'QCHOLD-100001');
  assert.equal(fresh.valueRs, 30);
  assert.equal(fresh.internalRef, 'scrapref:100');

  const kept = preserveLegacyScrapFields(fresh, {
    id: 'SCRAP-ITEM-9',
    holdTagId: 'QC-HOLD-211',
    barcode: 'SCRAP-OLD-9'
  });
  assert.equal(kept.holdTagId, 'QC-HOLD-211');
  assert.equal(kept.barcode, 'SCRAP-OLD-9');
  assert.equal(kept.scrapQtyKg, 3);
  assert.equal(legacyScrapBarcode(kept), 'SCRAP-OLD-9');
});

test('the barcode list keeps old scrap stickers and skips a scrap row that has none', () => {
  const rows = collectBarcodes({
    inventoryRolls: [
      { barcodeId: 'RM-BC-1', itemName: 'PET', rollType: 'RAW_MATERIAL' },
      { barcodeId: 'SFG-BC-1', rollType: 'SFG', itemName: 'Printed' },
      { barcodeId: 'RM-BC-1-BAL', itemName: 'Balance', rollType: 'RAW_MATERIAL' }
    ],
    scrapItems: [
      { id: 'print-scrap:ORD:printing-wastage', sourceRecordId: 'REC-1', scrapQtyKg: 4, holdTagId: 'REC-1' },
      { id: 'SCRAP-1', holdTagId: 'QCHOLD-100001', scrapQtyKg: 1 },
      { id: 'scrapref:2', sourceRecordId: 'hold-2', scrapQtyKg: 2, defectCategory: 'Other Rejection Defect' }
    ]
  });
  const codes = rows.map((row) => `${row.sourceModule}|${row.barcode}`);
  assert.ok(codes.includes(`${BARCODE_SOURCE.rm}|RM-BC-1`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.sfg}|SFG-BC-1`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.rm}|RM-BC-1-BAL`));
  assert.ok(codes.includes(`${BARCODE_SOURCE.scrap}|QCHOLD-100001`));
  assert.equal(codes.some((code) => code.endsWith('|REC-1')), false);
  assert.equal(codes.some((code) => code.includes('print-scrap')), false);
  assert.equal(codes.some((code) => code.includes('scrapref')), false);
});

test('labels still print for stock and balance rolls, and not for scrap', () => {
  const printable = rollsEligibleForBarcodeLabel([
    { id: 'RM-1', barcodeId: 'RM-BC-1', rollType: 'RAW_MATERIAL' },
    { id: 'SFG-1', barcodeId: 'SFG-BC-ORD-1', rollType: 'SFG' },
    { id: 'FG-1', barcodeId: 'FG-BC-ORD-1', rollType: 'FG' },
    { id: 'BAL-1', barcodeId: 'RM-BC-1-BAL' },
    { id: 'print-scrap:ORD:trim-wastage', scrapQtyKg: 2, stage: 'Slitting' },
    { id: 'scrapref:9', defectCategory: 'Wrinkles / Creases / Telescoping', scrapQtyKg: 1 },
    { id: 'QCHOLD-1', barcodeId: 'QCHOLD-1', isQCHold: true }
  ]);
  assert.deepEqual(printable.map((roll) => roll.id), ['RM-1', 'SFG-1', 'FG-1', 'BAL-1', 'QCHOLD-1']);
});

test('an old scrap barcode scans as scrap and does not ask for a new label', () => {
  const items = [
    {
      id: 'SCRAP-ITEM-9',
      holdTagId: 'QC-HOLD-211',
      scrapQtyKg: 5,
      ratePerKg: 12,
      jobName: 'Sonu Jaljeera',
      defectCategory: 'Delamination / Bonding Failure',
      scrapReason: 'QC hold wrinkle',
      sourceRecordId: 'QC-HOLD-211'
    },
    {
      id: 'print-scrap:ORD:printing-wastage',
      scrapQtyKg: 4,
      sourceRecordId: 'REC-1',
      type: 'Printing Wastage'
    }
  ];
  const old = findScrapForScan(items, 'qc-hold-211');
  assert.equal(old.id, 'SCRAP-ITEM-9');
  const card = scrapScanCard(old, { matchedLegacy: true });
  assert.equal(card.printable, false);
  assert.equal(card.notStock, true);
  assert.equal(card.type, 'SCRAP');
  assert.match(card.message, /no new barcode/i);
  assert.equal(card.code, 'ref:SCRAP-ITEM-9');
  assert.equal(card.properties.find((row) => row.label === 'Scrap weight').value, '5 kg');
  assert.equal(card.properties.find((row) => row.label === 'Value').value, '₹ 60');

  const current = findScrapForScan(items, 'print-scrap:ORD:printing-wastage');
  assert.equal(current.id, 'print-scrap:ORD:printing-wastage');
  const plain = scrapScanCard(current);
  assert.equal(plain.code, 'print-scrap:ORD:printing-wastage');
  assert.match(plain.message, /does not have a barcode/i);
  assert.equal(findScrapForScan(items, 'RM-BC-1'), null);
});

test('scrap screens do not offer a barcode, print tag, or scan on scrap rows', () => {
  const store = readFileSync(new URL('../src/components/ScrapStorePanel.jsx', import.meta.url), 'utf8');
  const tableStart = store.indexOf('<thead>');
  const table = store.slice(tableStart, store.indexOf('</thead>', tableStart));
  assert.match(table, /Internal Ref/);
  assert.doesNotMatch(table, /Barcode|Original Tag|Print Tag|Scan/);
  const remarks = table.indexOf('Defect Category / Remarks');
  const source = table.indexOf('Record Source & ID');
  assert.ok(remarks >= 0 && source > remarks);

  const analysis = readFileSync(new URL('../src/components/ScrapWastageAnalysis.jsx', import.meta.url), 'utf8');
  const start = analysis.indexOf('{/* Main Unified Registry Table */}');
  const unified = analysis.slice(start, analysis.indexOf('</table>', start));
  const thead = unified.slice(0, unified.indexOf('</thead>'));
  assert.ok(thead.indexOf('Record Source &amp; ID') > thead.indexOf('Defect Category / Remarks')
    || thead.indexOf('Record Source & ID') > thead.indexOf('Defect Category / Remarks'));
  assert.doesNotMatch(thead, /Barcode|Print Tag|Scan/);

  const send = readFileSync(new URL('../src/components/SFGStoreManagement.jsx', import.meta.url), 'utf8');
  const handlerStart = send.indexOf('const handleConfirmSendToScrap');
  const handler = send.slice(handlerStart, send.indexOf('const scrapContext', handlerStart));
  assert.match(handler, /withoutScrapBarcode/);
  assert.match(handler, /scrapref:/);
  assert.doesNotMatch(handler, /setSelectedRollForBarcodeModal|setBarcodePrintRolls|Print Tag/);
});

test('the dry-run scrap barcode list is not a migration', () => {
  const manual = readFileSync(new URL('../supabase/manual/20261103140000_list_scrap_barcodes_dry_run.sql', import.meta.url), 'utf8');
  assert.match(manual, /SELECT/);
  assert.doesNotMatch(manual, /^\s*(UPDATE|DELETE|INSERT|DROP|ALTER)\b/im);
  const migration = readFileSync(new URL('../supabase/migrations/20261103140000_scrap_not_a_barcode.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(migration, /sfg_scrap_items[\s\S]{0,80}\b(UPDATE|DELETE)\b/i);
  assert.doesNotMatch(migration, /\b(UPDATE|DELETE)\s+public\.sfg_scrap_items\b/i);
});
