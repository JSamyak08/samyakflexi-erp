/**
 * Station-wise Inks & Roll Metering Calculations for Rotogravure Printing & Packaging.
 */

import { finiteNumber } from './productionRecordQuality.js';

/**
 * Automatically detects color family and generates badge styling from ink shade name.
 */
export function autoGenerateColorTag(shadeName = '') {
  const name = String(shadeName || '').toLowerCase().trim();

  let tagObj;
  if (/white|opaque|milky|blanc/i.test(name)) {
    tagObj = { colorName: 'White', hex: '#f8fafc', bg: '#f8fafc', text: '#0f172a', border: '#94a3b8' };
  } else if (/cyan|blue|azure|navy|process cyan/i.test(name)) {
    tagObj = { colorName: 'Cyan', hex: '#0284c7', bg: '#0284c7', text: '#ffffff', border: '#0369a1' };
  } else if (/magenta|pink|rubine|rhodamine|process mag/i.test(name)) {
    tagObj = { colorName: 'Magenta', hex: '#db2777', bg: '#db2777', text: '#ffffff', border: '#be185d' };
  } else if (/yellow|lemon|amber|process yel/i.test(name)) {
    tagObj = { colorName: 'Yellow', hex: '#eab308', bg: '#fef08a', text: '#854d0e', border: '#eab308' };
  } else if (/black|process black|carbon|jet/i.test(name)) {
    tagObj = { colorName: 'Black', hex: '#0f172a', bg: '#0f172a', text: '#ffffff', border: '#334155' };
  } else if (/red|warm red|scarlet|crimson/i.test(name)) {
    tagObj = { colorName: 'Red', hex: '#dc2626', bg: '#dc2626', text: '#ffffff', border: '#b91c1c' };
  } else if (/green|emerald|teal/i.test(name)) {
    tagObj = { colorName: 'Green', hex: '#16a34a', bg: '#16a34a', text: '#ffffff', border: '#15803d' };
  } else if (/orange|tangerine/i.test(name)) {
    tagObj = { colorName: 'Orange', hex: '#ea580c', bg: '#ea580c', text: '#ffffff', border: '#c2410c' };
  } else if (/violet|purple/i.test(name)) {
    tagObj = { colorName: 'Violet', hex: '#7c3aed', bg: '#7c3aed', text: '#ffffff', border: '#6d28d9' };
  } else if (/gold|bronze/i.test(name)) {
    tagObj = { colorName: 'Gold', hex: '#d97706', bg: '#fef3c7', text: '#92400e', border: '#d97706' };
  } else if (/silver|metallic|grey|gray/i.test(name)) {
    tagObj = { colorName: 'Silver', hex: '#64748b', bg: '#e2e8f0', text: '#334155', border: '#94a3b8' };
  } else {
    tagObj = { colorName: shadeName || 'Custom Color', hex: '#6366f1', bg: '#e0e7ff', text: '#3730a3', border: '#6366f1' };
  }

  return {
    ...tagObj,
    colorFamily: tagObj.colorName,
    colorTag: tagObj.hex,
    textColor: tagObj.text
  };
}

/**
 * Calculates 100% dry solid equivalent cost for a liquid ink:
 * Solid Equivalent Rate = Liquid Price / (Solid% / 100)
 */
export function calculateSolidEquivalentRate(liquidPricePerKg, solidContentPct) {
  const price = finiteNumber(liquidPricePerKg);
  const solids = finiteNumber(solidContentPct);
  if (!price || price <= 0 || !solids || solids <= 0) return 0;
  return Math.round(((price / (solids / 100)) + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates average solid %, average 100% solid rate, solvent addition, and effective cost.
 * Effective Rate = Average Solid Rate + Solvent Rate per kg
 */
export function calculateStationInksMetrics(stationWiseInks = [], solventPricePerKg = 150) {
  const solventRate = Math.max(0, finiteNumber(solventPricePerKg) ?? 150);
  const stations = Array.isArray(stationWiseInks) ? stationWiseInks : [];
  const activeStations = stations.filter(s => s && (s.shade || s.shadeName || s.name || s.itemCode || s.productCode || finiteNumber(s.pricePerKg) > 0));

  if (activeStations.length === 0) {
    return {
      activeStationsCount: 0,
      avgSolidsPct: 0,
      averageSolidPercentage: 0,
      avgSolidEquivalentRate: 0,
      averageSolidEquivalentRate: 0,
      solventPricePerKg: solventRate,
      effectiveDryInkRate: 0,
      avgLiquidPricePerKg: 0,
      averageLiquidPricePerKg: 0,
      stations: []
    };
  }

  let totalSolids = 0;
  let totalSolidEquivRate = 0;
  let totalLiquidRate = 0;

  const enrichedStations = activeStations.map((station, index) => {
    const solidsPct = finiteNumber(station.solidContentPct ?? station.solidPercentage ?? station.solids) ?? 25;
    const liquidRate = finiteNumber(station.pricePerKg ?? station.ratePerKg ?? station.rate) ?? 280;
    const solidEquivRate = calculateSolidEquivalentRate(liquidRate, solidsPct);
    const shadeName = station.shade || station.shadeName || station.name || `Color ${index + 1}`;
    const colorTagObj = typeof station.colorTag === 'object' ? station.colorTag : autoGenerateColorTag(shadeName);
    const colorTagHex = typeof station.colorTag === 'string' && station.colorTag ? station.colorTag : colorTagObj.hex;

    totalSolids += solidsPct;
    totalSolidEquivRate += solidEquivRate;
    totalLiquidRate += liquidRate;

    return {
      ...station,
      stationNo: station.stationNo || station.stationNumber || index + 1,
      stationNumber: station.stationNumber || station.stationNo || index + 1,
      shade: shadeName,
      shadeName: shadeName,
      solidContentPct: solidsPct,
      solidPercentage: solidsPct,
      pricePerKg: liquidRate,
      solidEquivalentRate: solidEquivRate,
      colorTag: colorTagHex,
      colorTagDetails: colorTagObj
    };
  });

  const count = enrichedStations.length;
  const avgSolidsPct = Math.round(((totalSolids / count) + Number.EPSILON) * 10) / 10;
  const avgSolidEquivalentRate = Math.round(((totalSolidEquivRate / count) + Number.EPSILON) * 100) / 100;
  const avgLiquidPricePerKg = Math.round(((totalLiquidRate / count) + Number.EPSILON) * 100) / 100;
  const effectiveDryInkRate = Math.round((avgSolidEquivalentRate + solventRate) * 100) / 100;

  return {
    activeStationsCount: count,
    avgSolidsPct,
    averageSolidPercentage: avgSolidsPct,
    avgSolidEquivalentRate,
    averageSolidEquivalentRate: avgSolidEquivalentRate,
    solventPricePerKg: solventRate,
    effectiveDryInkRate,
    avgLiquidPricePerKg,
    averageLiquidPricePerKg: avgLiquidPricePerKg,
    stations: enrichedStations
  };
}

/**
 * Calculates length in meters from weight (kg), width (mm), and GSM (or micron & density).
 * Meters = (Weight kg * 1000) / (GSM * (Width mm / 1000))
 */
export function calculateRollMeters({
  weightKg,
  widthMm,
  gsm,
  micron,
  density = 1.0,
  existingMeters
} = {}) {
  const manualMeters = finiteNumber(existingMeters);
  if (manualMeters !== null && manualMeters > 0) {
    return Math.round(manualMeters);
  }

  const kg = finiteNumber(weightKg);
  if (!kg || kg <= 0) return 0;

  const width = finiteNumber(widthMm) || 1000;
  const widthMeters = Math.max(0.01, width / 1000);

  let effectiveGsm = finiteNumber(gsm);
  if (!effectiveGsm || effectiveGsm <= 0) {
    const mic = finiteNumber(micron) || 12;
    const dens = finiteNumber(density) || 1.0;
    effectiveGsm = mic * dens;
  }
  if (!effectiveGsm || effectiveGsm <= 0) effectiveGsm = 20;

  const meters = (kg * 1000) / (effectiveGsm * widthMeters);
  return Math.round(meters);
}

/**
 * Calculates stage wastage in both kilograms and meters.
 */
export function calculateStageWastage({
  inputKg,
  outputKg,
  widthMm = 1000,
  gsm = 30,
  existingInputMeters,
  existingOutputMeters
} = {}) {
  const inKg = finiteNumber(inputKg) || 0;
  const outKg = finiteNumber(outputKg) || 0;
  const wasteKg = Math.max(0, Math.round((inKg - outKg + Number.EPSILON) * 100) / 100);

  const inMeters = calculateRollMeters({
    weightKg: inKg,
    widthMm,
    gsm,
    existingMeters: existingInputMeters
  });

  const outMeters = calculateRollMeters({
    weightKg: outKg,
    widthMm,
    gsm,
    existingMeters: existingOutputMeters
  });

  const wasteMeters = Math.max(0, inMeters - outMeters);
  const wastePct = inKg > 0 ? Math.round(((wasteKg / inKg) * 100 + Number.EPSILON) * 10) / 10 : 0;

  return {
    wasteKg,
    inMeters,
    outMeters,
    wasteMeters,
    wastePct
  };
}
