import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoGenerateColorTag,
  calculateSolidEquivalentRate,
  calculateStationInksMetrics,
  calculateRollMeters,
  calculateStageWastage,
  isStationActive
} from '../src/utils/inkStationCalculations.js';
import { calculateJobRawMaterials } from '../src/factoryStore.js';

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

  // Unassigned / empty / generic station labels return neutral badge
  const unassignedTag = autoGenerateColorTag('Station 6');
  assert.equal(unassignedTag.colorTag, '#94a3b8');
  assert.equal(unassignedTag.bg, '#f1f5f9');

  const emptyTag = autoGenerateColorTag('');
  assert.equal(emptyTag.colorTag, '#94a3b8');

  const selectTag = autoGenerateColorTag('-- Select from Ink Master --');
  assert.equal(selectTag.colorTag, '#94a3b8');
});

test('isStationActive accurately filters active assigned shades vs unassigned/reset placeholders', () => {
  assert.equal(isStationActive({ shade: 'Flint - SYNTH. GOLD (WCL4-A08)' }), true);
  assert.equal(isStationActive({ shadeName: 'HTI Process Cyan' }), true);
  assert.equal(isStationActive({ shade: '' }), false);
  assert.equal(isStationActive({ shade: '-- Select from Ink Master --' }), false);
  assert.equal(isStationActive({ shade: '-- Select --' }), false);
  assert.equal(isStationActive({ shade: 'Unassigned' }), false);
  assert.equal(isStationActive({ shade: 'Station 6' }), false);
  assert.equal(isStationActive({ shade: 'Station 6', itemCode: 'FW-55B' }), true);
  assert.equal(isStationActive(null), false);
  assert.equal(isStationActive(undefined), false);
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

test('calculateStationInksMetrics ignores unassigned stations and does not skew metrics', () => {
  // Simulates job with 8 stations: 5 assigned, 3 unassigned (matching user screenshot)
  const stations = [
    { stationNo: 1, shade: 'Flint - SYNTH. GOLD (WCL4-A08)', solidContentPct: 100, pricePerKg: 370 },
    { stationNo: 2, shade: 'Flint - PET LAM RED LACQUER', solidContentPct: 25, pricePerKg: 436 },
    { stationNo: 3, shade: 'Flint - PET LAM BLACK INK', solidContentPct: 21, pricePerKg: 238 },
    { stationNo: 4, shade: 'Flint - ARSR MAGENTA', solidContentPct: 24, pricePerKg: 432 },
    { stationNo: 5, shade: 'SPIINC ECOLAM VIOLET 001 CAC', solidContentPct: 24, pricePerKg: 325 },
    // 3 unassigned stations (must NOT be counted as active or dilute the averages)
    { stationNo: 6, shade: '', solidContentPct: '', pricePerKg: '', colorTag: { colorName: 'Station 6' } },
    { stationNo: 7, shade: '-- Select from Ink Master --', solidContentPct: '', pricePerKg: '' },
    { stationNo: 8, shade: '', itemCode: '', company: '' }
  ];

  const metrics = calculateStationInksMetrics(stations, 150);
  assert.equal(metrics.activeStationsCount, 5);
  assert.equal(metrics.totalStationsCount, 8);

  // Expected averages for the 5 active stations:
  // Solids: (100 + 25 + 21 + 24 + 24) / 5 = 194 / 5 = 38.8%
  assert.equal(metrics.avgSolidsPct, 38.8);

  // Solid equiv rates:
  // 1: 370 / 1.0 = 370.00
  // 2: 436 / 0.25 = 1744.00
  // 3: 238 / 0.21 = 1133.33
  // 4: 432 / 0.24 = 1800.00
  // 5: 325 / 0.24 = 1354.17
  // Sum = 6401.50 -> Avg = 1280.30
  assert.equal(metrics.avgSolidEquivalentRate, 1280.3);

  // Effective rate = 1280.30 + 150 = 1430.30
  assert.equal(metrics.effectiveDryInkRate, 1430.3);
});

test('calculateStationInksMetrics handles complete reset (0 active stations) cleanly without NaN and uses default fallback rate', () => {
  const resetStations = [
    { stationNo: 1, shade: '', solidContentPct: '', pricePerKg: '' },
    { stationNo: 2, shade: '', solidContentPct: '', pricePerKg: '' },
    { stationNo: 3, shade: '-- Select from Ink Master --', solidContentPct: '', pricePerKg: '' }
  ];

  // Default fallback rate from settings (1500)
  const metricsDefault = calculateStationInksMetrics(resetStations, 150);
  assert.equal(metricsDefault.activeStationsCount, 0);
  assert.equal(metricsDefault.avgSolidsPct, 0);
  assert.equal(metricsDefault.avgSolidEquivalentRate, 1500);
  assert.equal(metricsDefault.effectiveDryInkRate, 1500);
  assert.equal(metricsDefault.fallbackRateUsed, true);
  assert.equal(metricsDefault.stations.length, 0);

  // Custom fallback rate from settings (e.g. 1650)
  const metricsCustom = calculateStationInksMetrics(resetStations, 150, 1650);
  assert.equal(metricsCustom.activeStationsCount, 0);
  assert.equal(metricsCustom.effectiveDryInkRate, 1650);
  assert.equal(metricsCustom.fallbackRateUsed, true);

  // Explicit zero fallback rate
  const metricsZero = calculateStationInksMetrics(resetStations, 150, 0);
  assert.equal(metricsZero.activeStationsCount, 0);
  assert.equal(metricsZero.effectiveDryInkRate, 0);
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

test('calculateJobRawMaterials uses settings fallback rate when stationWiseInks are not entered, and uses formulated rate when entered', () => {
  const baseParams = {
    jobName: 'Test Job',
    printWidthMm: 1000,
    repeatLengthMm: 400,
    orderQtyKg: 1000,
    inkGsm: 1.5,
    adhesiveGsm: 1.5,
    layers: [
      { filmType: 'PET', micron: 12, rate: 150 }
    ],
    inkPrice: 1500, // settings fallback rate
    adhesivePrice: 270
  };

  // Case 1: Station-wise inks NOT entered (empty array or unassigned)
  const resultFallback = calculateJobRawMaterials({
    ...baseParams,
    stationWiseInks: []
  });
  assert.equal(resultFallback.inkDetails.rate, 1500);

  // Case 2: Station-wise inks ENTERED (e.g. 2 stations, formulated rate = 1188.10)
  const resultWithStations = calculateJobRawMaterials({
    ...baseParams,
    stationWiseInks: [
      { stationNo: 1, shade: 'Flint white 55-B', solidContentPct: 42, pricePerKg: 263 },
      { stationNo: 2, shade: 'HTI Process Cyan', solidContentPct: 20, pricePerKg: 290 }
    ],
    solventPricePerKg: 150
  });
  assert.equal(resultWithStations.inkDetails.rate, 1188.1);
});
