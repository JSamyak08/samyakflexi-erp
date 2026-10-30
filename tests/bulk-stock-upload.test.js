import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BULK_STOCK_CSV_COLUMNS,
  allocateUniqueInventoryId,
  buildBulkImportPayload,
  reassignNewInventoryIds,
  bulkErrorRowsCsv,
  stockUploadErrorFileName,
  inventoryDbColumns,
  parseBulkStockCsv,
  sampleBulkStockCsv
} from '../src/services/bulkStockUpload.js';
import fs from 'node:fs';
import { generateInventoryId } from '../src/factoryStore.js';

const NOW = new Date('2026-10-28T08:00:00.000Z');

function csv(rows) {
  return [BULK_STOCK_CSV_COLUMNS.join(','), ...rows].join('\n');
}

function filmRow(name, weight, barcode = '') {
  return `Film Substrates,${name},PET,12,1000,${weight},,,,${barcode},Kg,Bay A,500,FlexiPoly,BATCH-PET,135`;
}

test('sample CSV has no Inventory ID and shows one film with three rolls plus a non-roll item', () => {
  const text = sampleBulkStockCsv();
  assert.equal(text.includes('InventoryID'), false);
  assert.equal(text.includes('Inventory ID'), false);
  const plan = parseBulkStockCsv(text, { now: NOW, generateBarcode: () => 'RM-BC-20261028-AUTO' });
  assert.equal(plan.groups.length, 2);
  const film = plan.groups.find((group) => group.itemName.toLowerCase().includes('pet'));
  assert.equal(film.rollCount, 3);
  assert.equal(film.totalKg, 528.75);
  assert.equal(film.match, 'new');
  const barcodes = film.rows.map((row) => ({ barcode: row.barcode, source: row.barcodeSource, weight: row.weight }));
  assert.deepEqual(barcodes.map((row) => row.source), ['given', 'given', 'auto']);
  assert.equal(barcodes[2].barcode, 'RM-BC-20261028-AUTO');
  assert.deepEqual(barcodes.map((row) => row.weight), [251.5, 181, 96.25]);
  assert.equal(film.rows[2].netSource, 'computed');
  assert.equal(film.rows[0].grossWeightKg, 254);
  assert.equal(film.rows[0].tareWeightKg, 2.5);
  assert.equal(film.rows[0].coreWeightKg, 1);
  const ink = plan.groups.find((group) => group.category === 'Printing Inks');
  assert.equal(ink.rollCount, 0);
  assert.equal(ink.totalKg, 40);
  const payload = buildBulkImportPayload(plan, { now: NOW });
  assert.equal(payload.rolls.length, 3);
  assert.equal(payload.items.find((item) => item.category === 'Printing Inks').availableQtyKg, 40);
  assert.equal(payload.rolls.some((roll) => roll.barcodeId === 'RM-BC-20261028-AUTO'), true);
  const computedRoll = payload.rolls.find((roll) => roll.barcodeId === 'RM-BC-20261028-AUTO');
  assert.equal(computedRoll.netWeightKg, 96.25);
  assert.equal(computedRoll.availableWeightKg, 96.25);
  assert.equal(computedRoll.grossWeightKg, 98);
  assert.equal(computedRoll.tareWeightKg, 1.75);
  assert.equal(computedRoll.coreWeightKg, 1);
});

test('rows with the same item name group into one item and an existing name receives the rolls', () => {
  const text = csv([
    filmRow('PET 12 Micron 1000mm', '100', 'RM-BC-20261028-0001'),
    filmRow('  pet 12 micron 1000mm ', '40', 'RM-BC-20261028-0002')
  ]);
  const inventory = [{
    id: 'INVT-0004',
    itemCode: 'INVT-0004',
    itemName: 'PET 12 Micron 1000mm',
    category: 'Film Substrates',
    availableQtyKg: 15,
    unit: 'Kg'
  }];
  const plan = parseBulkStockCsv(text, { inventory, now: NOW });
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0].match, 'existing');
  assert.equal(plan.groups[0].plannedId, 'INVT-0004');
  assert.equal(plan.groups[0].rollCount, 2);
  assert.equal(plan.groups[0].totalKg, 140);
  const payload = buildBulkImportPayload(plan, { inventory, now: NOW });
  assert.equal(payload.createdCount, 0);
  assert.equal(payload.updatedCount, 1);
  assert.equal(payload.items[0].id, 'INVT-0004');
  assert.equal(payload.items[0].availableQtyKg, 155);
  assert.equal(payload.rolls.length, 2);
  payload.rolls.forEach((roll) => {
    assert.equal(roll.itemId, 'INVT-0004');
    assert.equal(roll.status, 'In Stock');
    assert.equal(roll.qcStatus, 'Approved');
    assert.equal(roll.availableWeightKg, roll.netWeightKg);
    assert.equal(roll.rollType, 'RAW_MATERIAL');
    assert.equal(roll.category, 'Film Substrates');
  });
  assert.equal(payload.adjustments.length, 2);
  assert.deepEqual(payload.adjustments.map((row) => row.barcode).sort(), ['RM-BC-20261028-0001', 'RM-BC-20261028-0002']);
});

test('generated inventory ids ignore the CSV column and stay unique in the file and against stock', () => {
  const text = [
    'InventoryID,Category,ItemName,WeightKg,Barcode',
    'INVT-9999,Film Substrates,New Film Alpha,10,RM-BC-20261028-A',
    'INVT-9999,Film Substrates,New Film Beta,12,RM-BC-20261028-B',
    'INVT-0001,Printing Inks,Fresh Cyan Ink,5,'
  ].join('\n');
  const inventory = [
    { id: 'INVT-0005', itemName: 'Already There', category: 'Printing Inks', availableQtyKg: 1 },
    { id: 'INVT-0008', itemCode: 'INVT-0008', itemName: 'Code Clash', category: 'Other Raw Materials', availableQtyKg: 1 }
  ];
  const plan = parseBulkStockCsv(text, { inventory, now: NOW });
  assert.ok(plan.notices.some((notice) => notice.includes('Inventory ID')));
  const ids = plan.groups.map((group) => group.plannedId);
  assert.deepEqual(ids.sort(), ['INVT-0009', 'INVT-0010', 'INVT-0011']);
  assert.equal(ids.includes('INVT-9999'), false);
  assert.equal(new Set(ids).size, 3);
  ids.forEach((id) => {
    assert.equal(inventory.some((item) => item.id === id || item.itemCode === id), false);
  });
  const again = allocateUniqueInventoryId(inventory, ids, generateInventoryId);
  assert.equal(ids.includes(again), false);
  assert.equal(again, 'INVT-0012');
});

test('blank barcodes are generated in the roll format and duplicates in the file or the database are blocked', () => {
  let n = 0;
  const text = csv([
    filmRow('Auto Film', '10', ''),
    filmRow('Auto Film', '11', ''),
    filmRow('Dup Film', '12', 'RM-BC-20261028-DUP'),
    filmRow('Dup Film', '13', 'rm-bc-20261028-dup'),
    filmRow('Known Film', '14', 'RM-BC-DB-1')
  ]);
  const plan = parseBulkStockCsv(text, {
    now: NOW,
    rolls: [{ barcodeId: 'RM-BC-DB-1', itemName: 'Old' }],
    generateBarcode: () => {
      n += 1;
      return n === 1 ? 'RM-BC-20261028-AUTO' : 'RM-BC-20261028-AUTO';
    }
  });
  const autos = plan.rows.filter((row) => row.barcodeSource === 'auto');
  assert.equal(autos.length, 2);
  assert.equal(autos[0].barcode, 'RM-BC-20261028-AUTO');
  assert.match(autos[1].barcode, /^RM-BC-20261028-\d{4}$/);
  assert.notEqual(autos[0].barcode.toLowerCase(), autos[1].barcode.toLowerCase());
  const dupes = plan.rows.filter((row) => row.itemName === 'Dup Film');
  assert.equal(dupes.every((row) => row.blocked), true);
  assert.match(dupes[0].errors.join(' '), /Duplicate barcode in file \(also row/i);
  const known = plan.rows.find((row) => row.itemName === 'Known Film');
  assert.match(known.errors.join(' '), /already exists in stock/i);
  const payload = buildBulkImportPayload(plan, { now: NOW });
  const saved = payload.rolls.map((roll) => roll.barcodeId);
  assert.equal(saved.includes('RM-BC-20261028-DUP'), false);
  assert.equal(saved.includes('RM-BC-DB-1'), false);
  assert.deepEqual(saved.sort(), [autos[0].barcode, autos[1].barcode].sort());
  const report = bulkErrorRowsCsv(plan);
  assert.match(report, /Duplicate barcode in file/);
  assert.match(report, /already exists in stock/);
});

test('missing names, bad weights, and unknown categories are blocked and a repeat upload is flagged', () => {
  const text = csv([
    filmRow('Good Film', '20', 'RM-BC-20261028-GOOD'),
    'Film Substrates,,PET,12,1000,15,,,,RM-BC-20261028-NONAME,Kg,Bay A,500,FlexiPoly,BATCH-PET,135',
    filmRow('Bad Weight', 'minus', 'RM-BC-20261028-BAD'),
    filmRow('Negative Film', '-4', 'RM-BC-20261028-NEG'),
    'Not A Category,Mystery Item,Grade,,,8,,,,,Kg,Bay,10,Vendor,BATCH,1'
  ]);
  const plan = parseBulkStockCsv(text, { now: NOW });
  const byName = (name) => plan.rows.filter((row) => row.itemName === name);
  assert.match(plan.rows.find((row) => !row.itemName).errors.join(' '), /Item name is missing/);
  assert.match(byName('Bad Weight')[0].errors.join(' '), /NetWeightKg must be a positive number/);
  assert.match(byName('Negative Film')[0].errors.join(' '), /NetWeightKg must be a positive number/);
  assert.match(byName('Mystery Item')[0].errors.join(' '), /Unknown category/);
  const payload = buildBulkImportPayload(plan, { now: NOW });
  assert.equal(payload.rolls.length, 1);
  assert.equal(payload.rolls[0].barcodeId, 'RM-BC-20261028-GOOD');
  assert.equal(payload.items.length, 1);

  const second = parseBulkStockCsv(text, {
    now: NOW,
    inventory: payload.items,
    rolls: payload.rolls,
    adjustments: payload.adjustments
  });
  const good = second.rows.find((row) => row.barcode === 'RM-BC-20261028-GOOD');
  assert.equal(good.blocked, true);
  assert.match(good.errors.join(' '), /already exists|already uploaded/);
  assert.equal(second.importableCount < plan.importableCount, true);
  const secondPayload = buildBulkImportPayload(second, { inventory: payload.items, now: NOW });
  assert.equal(secondPayload.rolls.some((roll) => roll.barcodeId === 'RM-BC-20261028-GOOD'), false);
});

test('re-uploading the same file flags film rolls and a non-roll quantity', () => {
  const text = sampleBulkStockCsv();
  const plan = parseBulkStockCsv(text, { now: NOW, generateBarcode: () => 'RM-BC-20261028-AUTO' });
  const payload = buildBulkImportPayload(plan, { now: NOW });
  const again = parseBulkStockCsv(text, {
    now: NOW,
    inventory: payload.items,
    rolls: payload.rolls,
    adjustments: payload.adjustments,
    generateBarcode: () => 'RM-BC-20261028-NEXT'
  });
  assert.equal(again.importableCount, 0);
  assert.equal(again.rows.every((row) => row.blocked), true);
});

test('blocked rows download as the original upload columns plus an Error column and can be fixed and uploaded again', () => {
  const header = BULK_STOCK_CSV_COLUMNS.join(',');
  const text = [
    header,
    'Film Substrates,Keep Film,PET,12,1000,25,,,,RM-BC-KEEP-1,Kg,Bay A,500,Vendor,BATCH,10',
    'Film Substrates,Bad Film,PET,12,1000,abc,,,,,Kg,"Bay A, Rack",500,Vendor,BATCH,10',
    'Nope,Mystery,Grade,,,8,,,,,Kg,Bay,10,Vendor,BATCH,1',
    'Film Substrates,Dup One,PET,12,500,8,,,,RM-BC-DUP,Kg,Bay A,100,Vendor,BATCH,10',
    'Film Substrates,Dup Two,PET,12,500,9,,,,RM-BC-DUP,Kg,Bay A,100,Vendor,BATCH,10'
  ].join('\n');
  const plan = parseBulkStockCsv(text, { now: NOW, generateBarcode: () => 'RM-BC-20261028-AUTO' });
  const payload = buildBulkImportPayload(plan, { now: NOW });
  assert.equal(payload.rolls.map((roll) => roll.barcodeId).join(','), 'RM-BC-KEEP-1');

  const downloaded = bulkErrorRowsCsv(plan);
  assert.equal(downloaded.charCodeAt(0), 0xFEFF);
  const body = downloaded.slice(1);
  const [downloadedHeader, ...downloadedRows] = body.split('\n');
  assert.equal(downloadedHeader, `${header},Error`);
  assert.equal(downloadedRows.length, 4);
  assert.match(downloadedRows[0], /^Film Substrates,Bad Film,PET,12,1000,abc,,,,,Kg,"Bay A, Rack",500,Vendor,BATCH,10,Row 3: NetWeightKg must be a positive number$/);
  assert.match(downloadedRows[1], /^Nope,Mystery,Grade,,,8,,,,,Kg,Bay,10,Vendor,BATCH,1,"Row 4: /);
  assert.match(downloadedRows[1], /Unknown category ""Nope""/);
  assert.match(downloadedRows[2], /Row 5: Duplicate barcode in file \(also row 6\)/);
  assert.match(downloadedRows[3], /Row 6: Duplicate barcode in file \(also row 5\)/);
  assert.equal(downloaded.includes('RM-BC-20261028-AUTO'), false);
  assert.equal(stockUploadErrorFileName(NOW), 'stock-upload-errors-20261028-1330.csv');

  const fixed = [
    header,
    'Film Substrates,Keep Film,PET,12,1000,25,,,,RM-BC-KEEP-1,Kg,Bay A,500,Vendor,BATCH,10',
    'Film Substrates,Bad Film,PET,12,1000,12,,,,,Kg,Bay A,500,Vendor,BATCH,10',
    'Printing Inks,Mystery,Grade,,,8,,,,RM-BC-FIX-1,Kg,Bay,10,Vendor,BATCH,1',
    'Film Substrates,Dup One,PET,12,500,8,,,,RM-BC-NEW-1,Kg,Bay A,100,Vendor,BATCH,10',
    'Film Substrates,Dup Two,PET,12,500,9,,,,RM-BC-NEW-2,Kg,Bay A,100,Vendor,BATCH,10'
  ].join('\n');
  const again = parseBulkStockCsv(fixed, {
    now: NOW,
    inventory: payload.items,
    rolls: payload.rolls,
    adjustments: payload.adjustments,
    generateBarcode: () => 'RM-BC-20261028-FIXED'
  });
  assert.equal(again.rows.find((row) => row.itemName === 'Keep Film').blocked, true);
  assert.match(again.rows.find((row) => row.itemName === 'Keep Film').errors.join(' '), /already exists in stock/);
  const repaired = buildBulkImportPayload(again, { inventory: payload.items, now: NOW });
  assert.deepEqual(repaired.rolls.map((roll) => roll.barcodeId).sort(), ['RM-BC-20261028-FIXED', 'RM-BC-NEW-1', 'RM-BC-NEW-2']);
  assert.equal(repaired.items.some((item) => item.itemName === 'Mystery' && item.category === 'Printing Inks'), true);
  assert.equal(repaired.rolls.some((roll) => roll.barcodeId === 'RM-BC-KEEP-1'), false);

  const withErrorColumn = [
    `${header},Error`,
    'Film Substrates,Fresh Corrected Film,PET,12,700,16,,,,RM-BC-LEFT-1,Kg,Bay A,100,Vendor,BATCH,12,Row 9: old message',
    'Printing Inks,Fresh Ink,Cyan,,,6,,,,,Kg,Ink Store,5,Vendor,INK,20,Row 10: old message'
  ].join('\n');
  const kept = parseBulkStockCsv(withErrorColumn, { now: NOW });
  assert.ok(kept.notices.some((notice) => notice.includes('Error column was ignored')));
  assert.equal(kept.blockedCount, 0);
  assert.equal(kept.importableCount, 2);
  const keptPayload = buildBulkImportPayload(kept, { now: NOW });
  assert.equal(keptPayload.rolls[0].barcodeId, 'RM-BC-LEFT-1');
  assert.equal(keptPayload.items.find((item) => item.itemName === 'Fresh Ink').availableQtyKg, 6);
});

test('roll weights follow the GRN rule that net equals gross minus tare', () => {
  const oldFile = [
    'Category,ItemName,WeightKg,Barcode',
    'Film Substrates,Old Header Film,22,RM-BC-OLD-1'
  ].join('\n');
  const oldPlan = parseBulkStockCsv(oldFile, { now: NOW });
  assert.equal(oldPlan.blockedCount, 0);
  assert.equal(oldPlan.rows[0].weight, 22);
  assert.equal(oldPlan.rows[0].tareWeightKg, 0);
  assert.equal(oldPlan.rows[0].coreWeightKg, 0);
  const oldPayload = buildBulkImportPayload(oldPlan, { now: NOW });
  assert.equal(oldPayload.rolls[0].netWeightKg, 22);
  assert.equal(oldPayload.rolls[0].availableWeightKg, 22);
  assert.equal(oldPayload.rolls[0].grossWeightKg, 22);
  assert.equal(oldPayload.rolls[0].tareWeightKg, 0);

  const computed = parseBulkStockCsv([
    BULK_STOCK_CSV_COLUMNS.join(','),
    'Film Substrates,Computed Film,PET,12,800,,110,4.5,1.5,RM-BC-CALC-1,Kg,Bay A,100,Vendor,BATCH,10'
  ].join('\n'), { now: NOW });
  assert.equal(computed.rows[0].blocked, false);
  assert.equal(computed.rows[0].netSource, 'computed');
  assert.equal(computed.rows[0].weight, 105.5);
  assert.equal(computed.rows[0].sourceCells.NetWeightKg, '');

  const mismatch = parseBulkStockCsv([
    BULK_STOCK_CSV_COLUMNS.join(','),
    'Film Substrates,Mismatch Film,PET,12,800,90,110,4.5,1.5,RM-BC-MIS-1,Kg,Bay A,100,Vendor,BATCH,10'
  ].join('\n'), { now: NOW });
  assert.equal(mismatch.rows[0].blocked, true);
  assert.match(mismatch.rows[0].errors.join(' '), /does not match Gross − Tare \(105\.5\)/);

  const short = parseBulkStockCsv([
    BULK_STOCK_CSV_COLUMNS.join(','),
    'Film Substrates,Short Gross,PET,12,800,10,12,8,6,RM-BC-SHORT-1,Kg,Bay A,100,Vendor,BATCH,10'
  ].join('\n'), { now: NOW });
  assert.equal(short.rows[0].blocked, true);
  assert.match(short.rows[0].errors.join(' '), /less than TareWeightKg \+ CoreWeightKg \(14\)/);

  const ink = parseBulkStockCsv([
    BULK_STOCK_CSV_COLUMNS.join(','),
    'Printing Inks,Plain Ink,Cyan,,,18,,,,,Kg,Ink Store,5,Vendor,INK,20'
  ].join('\n'), { now: NOW });
  assert.equal(ink.blockedCount, 0);
  assert.equal(ink.rows[0].isRoll, false);
  assert.equal(ink.rows[0].weight, 18);
  const inkPayload = buildBulkImportPayload(ink, { now: NOW });
  assert.equal(inkPayload.rolls.length, 0);
  assert.equal(inkPayload.adjustments[0].qtyKg, 18);

  const spaced = parseBulkStockCsv([
    'Category,ItemName,Micron,WidthMm,NetWeightKg',
    'Film Substrates,PET  Film,12,1000,10'
  ].join('\n'), {
    now: NOW,
    inventory: [{ id: 'INVT-0007', itemName: 'PET Film', category: 'Film Substrates', micron: 12, widthMm: 1000, availableQtyKg: 4 }]
  });
  assert.equal(spaced.groups[0].match, 'existing');
  assert.equal(spaced.groups[0].plannedId, 'INVT-0007');
});

test('a saved bulk film keeps its typed name and writes category onto the inventory columns', () => {
  const plan = parseBulkStockCsv(csv([filmRow('PET 12 Micron 1000mm', '10', 'RM-BC-20261028-KEEP')]), { now: NOW });
  const payload = buildBulkImportPayload(plan, { now: NOW });
  const item = payload.items[0];
  assert.equal(item.itemName, 'PET 12 Micron 1000mm');
  assert.equal(item.preserveItemName, true);
  assert.equal(item.category, 'Film Substrates');
  const columns = inventoryDbColumns(item);
  assert.equal(columns.category, 'Film Substrates');
  assert.equal(columns.film_type, 'PET');
  assert.equal(Number(columns.micron), 12);
  assert.equal(Number(columns.width_mm), 1000);
  const source = fs.readFileSync(new URL('../src/services/supabaseDataService.js', import.meta.url), 'utf8');
  assert.match(source, /inventoryDbColumns\(clean\)/);
  assert.match(source, /preserveItemName === true \|\| cleanRaw\.preserveItemName === true/);
});

test('a new inventory id that already exists in the database is replaced before save', () => {
  const plan = parseBulkStockCsv(csv([filmRow('Fresh Gauge Film', '10', 'RM-BC-FRESH-1')]), {
    now: NOW,
    inventory: []
  });
  const payload = buildBulkImportPayload(plan, { now: NOW });
  assert.equal(payload.items[0].id, 'INVT-0001');
  reassignNewInventoryIds(payload, {
    existingIds: ['INVT-0001', 'INVT-0002', 'invt-0003'],
    updatingIds: []
  });
  assert.equal(payload.items[0].id, 'INVT-0004');
  assert.equal(payload.items[0].itemCode, 'INVT-0004');
  assert.equal(payload.rolls[0].itemId, 'INVT-0004');
  assert.equal(payload.adjustments[0].itemId, 'INVT-0004');
  assert.equal(payload.adjustments[0].itemCode, 'INVT-0004');

  const existingPlan = parseBulkStockCsv(csv([filmRow('PET Film', '8', 'RM-BC-EXISTING-1')]), {
    now: NOW,
    inventory: [{ id: 'INVT-0007', itemName: 'PET Film', category: 'Film Substrates', micron: 12, widthMm: 1000, availableQtyKg: 4 }]
  });
  const existingPayload = buildBulkImportPayload(existingPlan, {
    now: NOW,
    inventory: [{ id: 'INVT-0007', itemName: 'PET Film', category: 'Film Substrates', micron: 12, widthMm: 1000, availableQtyKg: 4 }]
  });
  reassignNewInventoryIds(existingPayload, {
    existingIds: ['INVT-0007'],
    updatingIds: ['INVT-0007']
  });
  assert.equal(existingPayload.items[0].id, 'INVT-0007');
  assert.equal(existingPayload.rolls[0].itemId, 'INVT-0007');
});
