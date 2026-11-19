import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePackingRollWeight } from '../src/utils/packingRollWeight.js';

const liveScale = (weight, extra = {}) => ({
  isConnected: true,
  isSimulated: true,
  grossWeight: weight,
  currentWeight: weight,
  netWeight: weight,
  ...extra
});

test('Add Roll/Box records the live scale gross, not a stale 0 in the field', () => {
  const weights = resolvePackingRollWeight({
    fieldNetKg: 0,
    tareKg: 0,
    unit: 'Kg',
    scaleStatus: liveScale(54.7)
  });
  assert.equal(weights.source, 'scale');
  assert.equal(weights.grossKg, 54.7);
  assert.equal(weights.netKg, 54.7);
  assert.notEqual(weights.grossKg, 0);
});

test('a stale typed 50 is not kept while the scale reads 54.70 kg', () => {
  const weights = resolvePackingRollWeight({
    fieldNetKg: 50,
    tareKg: 0,
    unit: 'Kg',
    scaleStatus: liveScale(54.7)
  });
  assert.equal(weights.grossKg, 54.7);
  assert.equal(weights.netKg, 54.7);
  assert.notEqual(weights.grossKg, 50);
});

test('a connected scale that truly reads zero is recorded as 0 kg gross and 0 kg net', () => {
  const weights = resolvePackingRollWeight({
    fieldNetKg: 50,
    tareKg: 2,
    unit: 'Kg',
    scaleStatus: liveScale(0)
  });
  assert.equal(weights.source, 'scale');
  assert.equal(weights.grossKg, 0);
  assert.equal(weights.netKg, 0);
  assert.equal(weights.tareKg, 2);
});

test('Gross weight is the scale reading, and net is gross minus core tare: Gross - Tare = Net', () => {
  const weights = resolvePackingRollWeight({
    fieldNetKg: 0,
    tareKg: 4.5,
    unit: 'Kg',
    scaleStatus: liveScale(54.7)
  });
  assert.equal(weights.grossKg, 54.7);
  assert.equal(weights.tareKg, 4.5);
  assert.equal(weights.netKg, 50.2); // 54.7 - 4.5 = 50.2
});

test('user screenshot scenario: scale reads 28.77 kg, core tare 0.60 kg -> gross 28.77 kg, net 28.17 kg', () => {
  const weights = resolvePackingRollWeight({
    fieldNetKg: 0,
    tareKg: 0.6,
    unit: 'Kg',
    scaleStatus: liveScale(28.77)
  });
  assert.equal(weights.grossKg, 28.77);
  assert.equal(weights.tareKg, 0.6);
  assert.equal(weights.netKg, 28.17); // 28.77 - 0.60 = 28.17
});

test('without a connected scale the typed gross is kept, and net is gross minus tare', () => {
  const typed = resolvePackingRollWeight({
    fieldNetKg: '50',
    tareKg: 5,
    unit: 'Kg',
    scaleStatus: { isConnected: false, grossWeight: 54.7 }
  });
  assert.equal(typed.source, 'manual');
  assert.equal(typed.grossKg, 50);
  assert.equal(typed.tareKg, 5);
  assert.equal(typed.netKg, 45); // 50 - 5 = 45

  const empty = resolvePackingRollWeight({
    fieldNetKg: 0,
    tareKg: 1,
    unit: 'Kg',
    scaleStatus: { isConnected: false, grossWeight: 0 }
  });
  assert.equal(empty.grossKg, 0);
  assert.equal(empty.tareKg, 1);
  assert.equal(empty.netKg, 0);
});

test('a piece count is not replaced by the kilogram reading', () => {
  const weights = resolvePackingRollWeight({
    fieldNetKg: 12,
    tareKg: 0.2,
    unit: 'Pcs',
    scaleStatus: liveScale(54.7)
  });
  assert.equal(weights.source, 'manual');
  assert.equal(weights.netKg, 12);
  assert.equal(weights.grossKg, 12.2);
});

test('the packing list Add Roll handler reads the scale instead of only the field', () => {
  const source = fs.readFileSync(new URL('../src/components/DispatchManagement.jsx', import.meta.url), 'utf8');
  const addStart = source.indexOf('const createPackingRoll');
  const addEnd = source.indexOf('const handleLoadFgToScale4');
  assert.ok(addStart > 0 && addEnd > addStart);
  const addFn = source.slice(addStart, addEnd);
  const directBranch = addFn.indexOf('if (directFgItem)');
  const scaleRead = addFn.indexOf('resolvePackingRollWeight(');
  assert.ok(directBranch > 0, 'finished-goods shortcut stays in front of the scale path');
  assert.ok(scaleRead > directBranch, 'scale weight is applied on the Add Roll/Box path');
  assert.match(addFn, /weighingScaleService\.getStatus\(\)/);
  assert.doesNotMatch(addFn, /const netW = Number\(currentPktNetWeight\)/);
  assert.match(source, /pendingPackingWeight\.netKg/);
});
