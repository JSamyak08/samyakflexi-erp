import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoMapCylinderCsvHeaders,
  costsFromCsvRow,
  expectedCylinderCosts,
  formatInrAmount,
  parseInrAmount,
  reconcileCylinderCosts,
  unfoldHundredFold
} from '../src/utils/cylinderCost.js';

const SONU = {
  sku: 'SKU-CYL-518',
  jobName: 'Sonu gold mango mirchi',
  colorsCount: 7,
  faceLengthMm: 730,
  circumferenceMm: 440,
  rate: 1.6,
  cylinderCost: '₹ 35,973.00',
  costPerCylinder: '₹ 6,85,40,000.00'
};

test('currency text keeps the decimal point and Indian grouping', () => {
  assert.equal(parseInrAmount('₹ 5,139.00'), 5139);
  assert.equal(parseInrAmount('₹ 35,973.00'), 35973);
  assert.equal(parseInrAmount('₹ 6,85,40,000.00'), 68540000);
  assert.equal(parseInrAmount('5,139.20'), 5139.2);
  assert.equal(parseInrAmount(5544), 5544);
  assert.equal(parseInrAmount(''), null);

  const formatted = formatInrAmount(5139);
  assert.equal(parseInrAmount(formatted), 5139);
  assert.equal(parseInrAmount(formatInrAmount(parseInrAmount(formatted))), 5139);
  assert.notEqual(Number(String(formatted).replace(/[^0-9]/g, '')), 5139);
});

test('area is mm × mm / 100 and the set total is the rounded per-cylinder cost times colours', () => {
  const quote = expectedCylinderCosts({
    faceLengthMm: 730,
    circumferenceMm: 440,
    rate: 1.6,
    colorsCount: 7
  });
  assert.equal(quote.areaSqCm, 3212);
  assert.equal(quote.costPerCylinder, 5139);
  assert.equal(quote.totalSetCost, 35973);

  const zain = expectedCylinderCosts({
    faceLengthMm: 550,
    circumferenceMm: 560,
    rate: 1.8,
    colorsCount: 7
  });
  assert.equal(zain.areaSqCm, 3080);
  assert.equal(zain.costPerCylinder, 5544);
  assert.equal(zain.totalSetCost, 38808);
});

test('SKU-CYL-518 keeps the sane set total and replaces the inflated per-cylinder amount', () => {
  const costs = reconcileCylinderCosts(SONU);
  assert.equal(costs.areaSqCm, 3212);
  assert.equal(costs.totalSetCost, 35973);
  assert.equal(costs.costPerCylinder, 5139);
  assert.equal(costs.perCorrected, true);
  assert.equal(costs.totalCorrected, false);
  assert.equal(parseInrAmount(costs.costPerCylinderText), 5139);
  assert.equal(parseInrAmount(costs.cylinderCostText), 35973);
});

test('a consistent per-cylinder price is kept when it matches the set total', () => {
  const costs = reconcileCylinderCosts({
    faceLengthMm: 550,
    circumferenceMm: 560,
    colorsCount: 7,
    rate: 1.8,
    cylinderCost: '₹ 38,808.00',
    costPerCylinder: '₹ 5,544.00'
  });
  assert.equal(costs.costPerCylinder, 5544);
  assert.equal(costs.totalSetCost, 38808);
  assert.equal(costs.perCorrected, false);
  assert.equal(costs.totalCorrected, false);
});

test('decimal stripping is undone without wiping a nearby manual price', () => {
  assert.equal(unfoldHundredFold(513900, 5139), 5139);
  assert.equal(unfoldHundredFold(600000, 5139), 6000);
  assert.equal(unfoldHundredFold(68540000, 5139), null);

  const inflatedManual = reconcileCylinderCosts({
    faceLengthMm: 730,
    circumferenceMm: 440,
    colorsCount: 7,
    rate: 1.6,
    cylinderCost: '₹ 42,00,000.00',
    costPerCylinder: '₹ 6,00,000.00'
  });
  assert.equal(inflatedManual.costPerCylinder, 6000);
  assert.equal(inflatedManual.totalSetCost, 42000);

  const openedTwice = reconcileCylinderCosts({
    faceLengthMm: 730,
    circumferenceMm: 440,
    colorsCount: 7,
    rate: 1.6,
    cylinderCost: formatInrAmount(3597300),
    costPerCylinder: formatInrAmount(513900)
  });
  assert.equal(openedTwice.costPerCylinder, 5139);
  assert.equal(openedTwice.totalSetCost, 35973);
});

test('blank costs stay blank instead of being invented', () => {
  const costs = reconcileCylinderCosts({
    faceLengthMm: 730,
    circumferenceMm: 440,
    colorsCount: 7,
    rate: 1.6
  });
  assert.equal(costs.costPerCylinder, null);
  assert.equal(costs.totalSetCost, null);
  assert.equal(costs.areaSqCm, 3212);
});

test('CSV headers map rate and the two cost columns separately, field key to header', () => {
  const headers = [
    'SKU Code',
    'Job Name',
    'Face Length (mm)',
    'Circumference (mm)',
    'Rate (₹/sq cm)',
    'Cost Per Cylinder',
    'Total Cylinder Cost',
    'Colours'
  ];
  const mapping = autoMapCylinderCsvHeaders(headers);
  assert.equal(mapping.sku, 'SKU Code');
  assert.equal(mapping.jobName, 'Job Name');
  assert.equal(mapping.faceLengthMm, 'Face Length (mm)');
  assert.equal(mapping.circumferenceMm, 'Circumference (mm)');
  assert.equal(mapping.rate, 'Rate (₹/sq cm)');
  assert.equal(mapping.costPerCylinder, 'Cost Per Cylinder');
  assert.equal(mapping.cylinderCost, 'Total Cylinder Cost');
  assert.equal(mapping.colorsCount, 'Colours');
  assert.equal(mapping['Rate (₹/sq cm)'], undefined);
});

test('CSV import parses money and uses the same area formula when a cost cell is empty', () => {
  const fromRaw = costsFromCsvRow({
    faceLengthMm: '730',
    circumferenceMm: '440',
    rate: '1.60',
    colorsCount: '7',
    cylinderCost: '₹ 35,973.00',
    costPerCylinder: '₹ 6,85,40,000.00'
  });
  assert.equal(fromRaw.costPerCylinder, 5139);
  assert.equal(fromRaw.totalSetCost, 35973);

  const computed = costsFromCsvRow({
    faceLengthMm: '730',
    circumferenceMm: '440',
    rate: '1.6',
    colorsCount: '7'
  });
  assert.equal(computed.costPerCylinder, 5139);
  assert.equal(computed.totalSetCost, 35973);
  assert.equal(parseInrAmount(computed.cylinderCostText), 35973);
});
