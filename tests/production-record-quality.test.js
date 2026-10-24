import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOT_RECORDED,
  NO_JOB_SPEC,
  isPlaceholderText,
  classifyMeasure,
  computeDryInkSolids,
  compareSubstrate,
  resolveJobSpec,
  assessFormMeasures,
  assertPersistableMeasures,
  filmTypeToken
} from '../src/utils/productionRecordQuality.js';

test('placeholder tokens are rejected and PET is a real film', () => {
  assert.equal(isPlaceholderText('N/A'), true);
  assert.equal(isPlaceholderText('dummy'), true);
  assert.equal(isPlaceholderText('[object Object]'), true);
  assert.equal(isPlaceholderText('—'), true);
  assert.equal(isPlaceholderText('PET'), false);
  assert.equal(isPlaceholderText(''), false);
  assert.equal(filmTypeToken('MGP 55µ (1010mm) (12µm × 1010mm)'), 'MGP');
});

test('dry ink solids are the dried weight gain and ignore a 0.20 factor', () => {
  const result = computeDryInkSolids({ inputKg: 100, outputKg: 105, meters: 36431, printWidthMm: 530 });
  assert.equal(result.dryInkSolidsKg, 5);
  assert.ok(Math.abs(result.gsm - 0.26) < 0.02);
  assert.notEqual(result.dryInkSolidsKg, 1);
});

test('missing print input is not treated as zero ink gain', () => {
  const result = computeDryInkSolids({ inputKg: null, outputKg: 975.6, meters: 1000, printWidthMm: 710 });
  assert.equal(result.status, NOT_RECORDED);
  assert.equal(result.dryInkSolidsKg, null);
});

test('trim is removed only when both widths are recorded and the input is wider', () => {
  const result = computeDryInkSolids({
    inputKg: 395.4,
    outputKg: 392.5,
    inputWidthMm: 730,
    printWidthMm: 720,
    meters: 32175
  });
  assert.ok(Math.abs(result.dryInkSolidsKg - 2.52) < 0.05);
});

test('substrate match uses the job spec and does not invent PET or 460 mm', () => {
  const spec = resolveJobSpec({
    layers: [{ filmType: 'MATTEBOPP', micron: 18, widthMm: 710 }]
  });
  const match = compareSubstrate({
    spec,
    actual: { filmType: 'METBOPP', micron: 18, widthMm: 710 }
  });
  assert.equal(match.typeMatch, false);
  assert.equal(match.sizeMatch, true);
  assert.equal(match.micronMatch, true);
  assert.equal(resolveJobSpec({}), null);
  const missing = compareSubstrate({ spec: null, actual: {} });
  assert.equal(missing.specStatus, NO_JOB_SPEC);
  assert.equal(missing.actualStatus, NOT_RECORDED);
});

test('form blocks blank, zero and impossible ink GSM and warns on unusual values', () => {
  const blank = assessFormMeasures({ actualInkGsm: '' });
  assert.ok(blank.blocks.some((line) => /Ink GSM/.test(line)));
  const zero = classifyMeasure('inkGsm', 0, { mode: 'form' });
  assert.equal(zero.level, 'block');
  const impossible = classifyMeasure('inkGsm', 13, { mode: 'form' });
  assert.equal(impossible.level, 'block');
  const unusual = classifyMeasure('inkGsm', 5, { mode: 'form' });
  assert.equal(unusual.level, 'warn');
  assert.match(unusual.message, /looks wrong/);
});

test('service saves still allow 0 and null and block negatives and wastage over 100', () => {
  assert.doesNotThrow(() => assertPersistableMeasures({ actualInkGsm: 0, wastagePercentage: 0 }));
  assert.doesNotThrow(() => assertPersistableMeasures({ actualInkGsm: null, printedOutputKg: null }));
  assert.throws(() => assertPersistableMeasures({ wastagePercentage: 101 }), /Wastage/);
  assert.throws(() => assertPersistableMeasures({ printedOutputKg: -1 }), /Roll weight/);
  assert.throws(() => assertPersistableMeasures({
    inputRollsList: [{ filmType: 'dummy', consumedWeightKg: 10 }]
  }), /placeholder/);
});

test('width within 5 mm matches and a wider film warns', () => {
  const spec = resolveJobSpec({ printWidthMm: 720, printFilmType: 'PET', micron: 12 });
  const close = compareSubstrate({ spec, actual: { filmType: 'PET', widthMm: 724, micron: 12 } });
  assert.equal(close.sizeMatch, true);
  assert.equal(close.typeMatch, true);
  const wide = compareSubstrate({ spec, actual: { filmType: 'PET', widthMm: 730, micron: 12 } });
  assert.equal(wide.sizeMatch, false);
  assert.ok(wide.warnings.length > 0);
});
