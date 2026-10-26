import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyQuotationLineDescription,
  quotationLineDescription
} from '../src/utils/quotationLineDescription.js';

function roundTrip(item) {
  const saved = applyQuotationLineDescription(item);
  return JSON.parse(JSON.stringify(saved));
}

test('a line description is kept on the item and survives a JSON save', () => {
  const stored = roundTrip({
    jobTitle: 'Amrit Premium Besan 500gm',
    structure: 'PET 12µ / Natural LD',
    materialFormat: 'Roll Form',
    quantity: 500,
    ratePerUom: 248,
    taxableAmount: 124000,
    lineDescription: '  Eye-mark and barcode on the reverse.  '
  });

  assert.equal(stored.lineDescription, 'Eye-mark and barcode on the reverse.');
  assert.equal(stored.taxableAmount, 124000);
  assert.equal(stored.jobTitle, 'Amrit Premium Besan 500gm');
});

test('a blank description is omitted and an older item is otherwise unchanged', () => {
  const older = {
    jobTitle: 'Amrit Premium Besan 1kg',
    structure: 'PET 12µ / Natural LD',
    description: undefined,
    quantity: 500,
    ratePerUom: 246,
    taxableAmount: 123000
  };
  const stored = roundTrip({ ...older, lineDescription: '   \n  ' });
  const untouched = roundTrip(older);

  assert.equal(Object.hasOwn(stored, 'lineDescription'), false);
  assert.equal(Object.hasOwn(untouched, 'lineDescription'), false);
  assert.equal(stored.taxableAmount, older.taxableAmount);
  assert.equal(stored.structure, older.structure);
  assert.equal(quotationLineDescription(undefined), '');
  assert.equal(quotationLineDescription(null), '');
});

test('amend and edit copies keep the description, and cylinder specs stay separate', () => {
  const original = roundTrip({
    jobTitle: '8 colour cylinder set',
    materialFormat: 'Rotogravure Cylinder',
    description: 'Circumference 420mm, width 1050mm',
    structure: 'Circumference 420mm, width 1050mm',
    lineDescription: 'Proof to be approved before engraving.'
  });
  const amended = { ...original, id: 'QTN-REV' };

  assert.equal(amended.lineDescription, 'Proof to be approved before engraving.');
  assert.equal(amended.description, 'Circumference 420mm, width 1050mm');
  assert.equal(quotationLineDescription(amended.description), 'Circumference 420mm, width 1050mm');
  assert.notEqual(quotationLineDescription(amended.description), amended.lineDescription);
});
