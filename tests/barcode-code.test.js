import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  barcodeIdentityKey,
  codeKey,
  codeStartsWith,
  codesEqual,
  findDispatchRollByScan,
  findInventoryRollByScan
} from '../src/utils/barcodeCode.js';

const rolls = [
  { barcodeId: 8901234567890, id: 11, itemName: 'Numeric PET', batchNo: 44021 },
  { barcodeId: null, id: 42, itemName: 'Id only solvent' },
  { barcodeId: '   ', id: 77, itemName: 'Blank barcode' },
  { barcodeId: '  RM-BC-2024-009  ', id: 'roll-9', itemName: 'String film' },
  { barcodeId: 'RM-1', id: 100, itemName: 'Prefers barcode' }
];

test('raw barcode identity trim throws when barcodeId is numeric', () => {
  const t = rolls[0];
  assert.throws(
    () => (t.barcodeId || t.id || '').trim(),
    /trim is not a function/
  );
});

test('scan lookup matches numeric barcodeId and numeric id without throwing', () => {
  assert.equal(findInventoryRollByScan(rolls, '8901234567890').itemName, 'Numeric PET');
  assert.equal(findInventoryRollByScan(rolls, 8901234567890).id, 11);
  assert.equal(findInventoryRollByScan(rolls, '42').itemName, 'Id only solvent');
  assert.equal(barcodeIdentityKey({ id: 42 }), '42');
  assert.equal(codeKey(8901234567890), '8901234567890');
});

test('string barcodes still match case-insensitively, and barcodeId wins over id', () => {
  assert.equal(findInventoryRollByScan(rolls, 'rm-bc-2024-009').id, 'roll-9');
  assert.equal(findInventoryRollByScan(rolls, 'RM-1').itemName, 'Prefers barcode');
  assert.equal(findInventoryRollByScan(rolls, '100'), null);
  assert.equal(codesEqual(' AbC ', 'abc'), true);
  assert.equal(codesEqual(1001, '1001'), true);
  assert.equal(codesEqual('', 'abc'), false);
});

test('a numeric row earlier in the list does not block a later string match', () => {
  const hit = findInventoryRollByScan(rolls, 'RM-BC-2024-009');
  assert.equal(hit.itemName, 'String film');
});

test('whitespace-only barcodeId does not fall through to a numeric id', () => {
  assert.equal(findInventoryRollByScan(rolls, '77'), null);
  assert.equal(barcodeIdentityKey({ barcodeId: '   ', id: 77 }), '');
});

test('numeric batch numbers match, short queries do not partial-match', () => {
  assert.equal(findInventoryRollByScan([{ barcodeId: 'OTHER', batchNo: 44021 }], '44021').batchNo, 44021);
  assert.equal(findInventoryRollByScan([{ barcodeId: 8901234567890 }], '890'), null);
  const partial = findInventoryRollByScan([{ barcodeId: 8901234567890, id: 3 }], '890123');
  assert.equal(partial.id, 3);
});

test('dispatch scan matches numeric line ids and keeps partial rules', () => {
  const documents = [{
    id: 'DC-1',
    items: [{ barcodeId: 555000111, id: 9, jobName: 'Pouch' }]
  }];
  assert.equal(findDispatchRollByScan(documents, '555000111').item.jobName, 'Pouch');
  assert.equal(findDispatchRollByScan(documents, '555000').parent.id, 'DC-1');

  const shortCode = [{ items: [{ barcodeId: 'RM-BC-1', id: 1 }] }];
  assert.equal(findDispatchRollByScan(shortCode, 'xx-rm-bc-1-yy').item.id, 1);
  assert.equal(findInventoryRollByScan([{ barcodeId: 'RM-BC-1', id: 1 }], 'xx-rm-bc-1-yy'), null);
});

test('prefix checks do not throw on numeric barcodes and stay case-sensitive', () => {
  assert.equal(codeStartsWith(12345, 'FG-DISP-'), false);
  assert.equal(codeStartsWith('FG-DISP-9', 'FG-DISP-'), true);
  assert.equal(codeStartsWith('rm-bc-1', 'RM-BC'), false);
  assert.equal(codeStartsWith('RM-BC-1', 'RM-BC'), true);
});

test('scanner source uses the shared lookup instead of raw trim on barcode identity', () => {
  const src = fs.readFileSync(new URL('../src/components/UniversalBarcodeScannerModal.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\.barcodeId\s*\|\|\s*[^;\n]*\.id[^;\n]*\)\.trim/);
  assert.match(src, /findInventoryRollByScan/);
  assert.match(src, /findDispatchRollByScan/);
});
