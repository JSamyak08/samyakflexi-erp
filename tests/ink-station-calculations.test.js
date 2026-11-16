import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoGenerateColorTag,
  calculateSolidEquivalentRate,
  calculateStationInksMetrics,
  calculateRollMeters,
  calculateStageWastage
} from '../src/utils/inkStationCalculations.js';

test('autoGenerateColorTag correctly identifies color families and returns proper styles', () => {
  const whiteTag = autoGenerateColorTag('Flint Super White 55-B');
  assert.equal(whiteTag.colorFamily, 'White');
  assert.equal(whiteTag.colorTag, '#f8fafc');
  assert.equal(whiteTag.textColor, '#0f172a');

  const cyanTag = autoGenerateColorTag('HTI Process Cyan');
  assert.equal(cyanTag.colorFamily, 'Cyan');
  assert.equal(cyanTag.colorTag, '#0284c7');
  assert.equal(cyanTag.textColor, '#ffffff');

  const magentaTag = autoGenerateColorTag('Process Magenta Special');
  assert.equal(magentaTag.colorFamily, 'Magenta');
  assert.equal(magentaTag.colorTag, '#db2777');

  const yellowTag = autoGenerateColorTag('Lemon Yellow 2G');
  assert.equal(yellowTag.colorFamily, 'Yellow');
  assert.equal(yellowTag.colorTag, '#eab308');

  const blackTag = autoGenerateColorTag('Process Black Dense');
  assert.equal(blackTag.colorFamily, 'Black');
  assert.equal(blackTag.colorTag, '#0f172a');

  const goldTag = autoGenerateColorTag('Rich Pale Gold');
  assert.equal(goldTag.colorFamily, 'Gold');
  assert.equal(goldTag.colorTag, '#d97706');
});

test('calculateSolidEquivalentRate calculates 100% solid equivalent rate correctly', () => {
  // Flint white 55-B costs Rs. 263/kg with 42% solids -> 263 / 0.42 = 626.19
  const whiteRate = calculateSolidEquivalentRate(263, 42);
  assert.equal(whiteRate, 626.19);

  // HTI Process Cyan costs Rs. 290/kg with 20% solids -> 290 / 0.20 = 1450.00
  const cyanRate = calculateSolidEquivalentRate(290, 20);
  assert.equal(cyanRate, 1450);

  // Zero / invalid inputs return 0
  assert.equal(calculateSolidEquivalentRate(0, 42), 0);
  assert.equal(calculateSolidEquivalentRate(263, 0), 0);
  assert.equal(calculateSolidEquivalentRate(-10, 20), 0);
});

test('calculateStationInksMetrics aggregates stations and adds solvent cost per kg', () => {
  const stations = [
    {
      stationNumber: 1,
      shadeName: 'Flint white 55-B',
      itemCode: 'INK-WH-01',
      company: 'Flint',
      solidPercentage: 42,
      pricePerKg: 263
    },
    {
      stationNumber: 2,
      shadeName: 'HTI Process Cyan',
      itemCode: 'INK-CY-01',
      company: 'HTI',
      solidPercentage: 20,
      pricePerKg: 290
    }
  ];

  const solventPrice = 150;
  const metrics = calculateStationInksMetrics(stations, solventPrice);

  assert.equal(metrics.activeStationsCount, 2);
  // Average solids: (42 + 20) / 2 = 31%
  assert.equal(metrics.averageSolidPercentage, 31);
  // Solid equivalent rates: White = 626.19, Cyan = 1450. Avg = (626.19 + 1450) / 2 = 1038.10
  assert.equal(metrics.averageSolidEquivalentRate, 1038.1);
  // Effective dry ink rate = Average solid equivalent rate (1038.10) + Solvent (150) = 1188.10
  assert.equal(metrics.effectiveDryInkRate, 1188.1);
  // Solvent rate per kg preserved
  assert.equal(metrics.solventPricePerKg, 150);
});

test('calculateRollMeters calculates meters from weight, width, and GSM correctly', () => {
  // If meters already recorded, prioritize entered meters
  assert.equal(calculateRollMeters({ existingMeters: 2500 }), 2500);

  // Weight 100 kg, GSM 20 g/m², Width 1000 mm:
  // Meters = (100 * 1000) / (20 * (1000 / 1000)) = 100000 / 20 = 5000 meters
  const meters1 = calculateRollMeters({
    weightKg: 100,
    widthMm: 1000,
    gsm: 20
  });
  assert.equal(meters1, 5000);

  // Weight 200 kg, PET 12 micron (density 1.4 -> GSM = 16.8), Width 500 mm:
  // Width in meters = 0.5 m
  // GSM = 16.8
  // Meters = (200 * 1000) / (16.8 * 0.5) = 200000 / 8.4 = 23809.52 -> 23810
  const meters2 = calculateRollMeters({
    weightKg: 200,
    widthMm: 500,
    micron: 12,
    density: 1.4
  });
  assert.equal(meters2, 23810);
});

test('calculateStageWastage calculates stage loss in kg and meters correctly', () => {
  const wastage = calculateStageWastage({
    inputKg: 500,
    outputKg: 480,
    widthMm: 1000,
    gsm: 20
  });

  assert.equal(wastage.wasteKg, 20);
  assert.equal(wastage.wastePct, 4);
  // 20 kg waste at GSM 20 and width 1000 mm -> 1000 meters
  assert.equal(wastage.wasteMeters, 1000);
});
