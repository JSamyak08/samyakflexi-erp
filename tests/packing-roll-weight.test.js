import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePackingRollWeight } from '../src/utils/packingRollWeight.js';

const liveScale = (netWeight, extra = {}) => ({
  isConnected: true,
  isSimulated: true,
  netWeight,
  ...extra
});

test('Add Roll/Box records the live scale net, not a stale 0 in the Net Qty field', () => {
  const weights = resolvePackingRollWeight({
    fieldNetKg: 0,
    tareKg: 0,
    unit: 'Kg',
    scaleStatus: liveScale(54.7)
  });
  assert.equal(weights.source, 'scale');
  assert.equal(weights.netKg, 54.7);
  assert.equal(weights.grossKg, 54.7);
  assert.notEqual(weights.netKg, 0);
});

test('a stale typed 50 is not kept while the scale reads 54.70 kg', () => {
  // Screenshot: Net Qty showed 050 / the button said 50 Kg, header said 54.70 kg.
  const weights = resolvePackingRollWeight({
    fieldNetKg: 50,
    tareKg: 0,
    unit: 'Kg',
    scaleStatus: liveScale(54.7)
  });
  assert.equal(weights.netKg, 54.7);
  assert.equal(weights.grossKg, 54.7);
  assert.notEqual(weights.netKg, 0);
  assert.notEqual(weights.netKg, 50);
  assert.notEqual(weights.netKg, 4.7);
});

test('a connected scale that truly reads zero is recorded as 0 kg', () => {
  const weights = resolvePackingRollWeight({
    fieldNetKg: 50,
    tareKg: 2,
    unit: 'Kg',
    scaleStatus: liveScale(0)
  });
  assert.equal(weights.source, 'scale');
  assert.equal(weights.netKg, 0);
  assert.equal(weights.grossKg, 2);
});

test('gross weight is the scale net plus the form core / package tare', () => {
  const weights = resolvePackingRollWeight({
    fieldNetKg: 0,
    tareKg: 4.5,
    unit: 'Kg',
    scaleStatus: liveScale(54.7)
  });
  assert.equal(weights.netKg, 54.7);
  assert.equal(weights.tareKg, 4.5);
  assert.equal(weights.grossKg, 59.2);
});

test('without a connected scale the typed net is kept, including zero', () => {
  const typed = resolvePackingRollWeight({
    fieldNetKg: '050',
    tareKg: 0,
    unit: 'Kg',
    scaleStatus: { isConnected: false, netWeight: 54.7 }
  });
  assert.equal(typed.source, 'manual');
  assert.equal(typed.netKg, 50);
  assert.equal(typed.grossKg, 50);

  const empty = resolvePackingRollWeight({
    fieldNetKg: 0,
    tareKg: 1,
    unit: 'Kg',
    scaleStatus: { isConnected: false, netWeight: 0 }
  });
  assert.equal(empty.netKg, 0);
  assert.equal(empty.grossKg, 1);
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
