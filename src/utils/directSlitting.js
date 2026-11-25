/**
 * Direct slitting maths shared by the future screen and the unit tests.
 * The database function posts the document. These checks mirror it:
 * 0.50 kg mass tolerance, child metres from weight, warn above 8%, block above 25%.
 */

import { getFilmTypeCode, isMetalloceneEligibleFilm } from '../factoryStore.js';

export const DIRECT_SLIT_TOLERANCE_KG = 0.5;
export const DIRECT_SLIT_METRES_WARN_PCT = 8;
export const DIRECT_SLIT_METRES_BLOCK_PCT = 25;

export function roundKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

/** Same formula as calculateFilmRollLength. Density is the stock item's density. */
export function filmMetresFromKg({ kg, widthMm, micron, density } = {}) {
  const weight = Number(kg);
  const width = Number(widthMm);
  const thick = Number(micron);
  const dens = Number(density);
  if (!(weight > 0) || !(width > 0) || !(thick > 0) || !(dens > 0)) return 0;
  return Math.round((weight * 1000000) / (width * thick * dens));
}

export function exactFilmMetres({ kg, widthMm, micron, density } = {}) {
  const weight = Number(kg);
  const width = Number(widthMm);
  const thick = Number(micron);
  const dens = Number(density);
  if (!(weight > 0) || !(width > 0) || !(thick > 0) || !(dens > 0)) return 0;
  return (weight * 1000000) / (width * thick * dens);
}

/** Same CODE-width-micron pattern as formatFilmItemName, without loading the data client. */
export function directSlitItemName({ filmType, widthMm, micron, metallocenePct } = {}) {
  const code = getFilmTypeCode(filmType);
  const width = String(widthMm ?? '').replace(/[^0-9.]/g, '') || '0';
  const mic = String(micron ?? '').replace(/[^0-9.]/g, '') || '0';
  const pct = String(metallocenePct || '').trim();
  if (isMetalloceneEligibleFilm(filmType || code) && pct) {
    return `${code}-${width}-${mic}-${pct.endsWith('%') ? pct : `${pct}%`}`;
  }
  return `${code}-${width}-${mic}`;
}

function num(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Running length of the kilograms fed to the slitter.
 * A stored roll length is scaled by consumed / available. Otherwise metres come from weight.
 */
export function parentRunMetres(parent, density) {
  const consumed = num(parent?.consumedKg);
  const available = num(parent?.availableKg ?? parent?.availableWeightKg);
  const stored = num(parent?.lengthMeters ?? parent?.length_meters);
  const micron = num(parent?.micron);
  const width = num(parent?.widthMm);
  if (stored > 0 && available > 0 && consumed > 0) {
    return stored * (consumed / available);
  }
  return exactFilmMetres({ kg: consumed, widthMm: width, micron, density });
}

function laneOf(output, index) {
  const lane = Number(output?.lane ?? output?.laneNo);
  return Number.isFinite(lane) && lane > 0 ? lane : index + 1;
}

/**
 * Preview a document. Parents carry width, micron, available kilograms, and density.
 * Balance kilograms are the unslit remainder and are not part of the variance.
 */
export function assessDirectSlitting(doc = {}) {
  const errors = [];
  const parents = Array.isArray(doc.parents) ? doc.parents : [];
  const outputs = Array.isArray(doc.outputs) ? doc.outputs : [];
  const trim = roundKg(doc.trimScrapKg ?? doc.trimKg ?? 0);
  const setting = roundKg(doc.settingScrapKg ?? doc.settingKg ?? 0);
  if (trim < 0 || setting < 0) errors.push('Scrap kilograms cannot be negative.');
  if (parents.length === 0) errors.push('Scan at least one parent roll.');
  if (outputs.length === 0) errors.push('Enter at least one output roll.');

  const density = num(doc.density) || num(parents[0]?.density) || 0;
  const micron = num(doc.micron) || num(parents[0]?.micron) || 0;
  const parentWidth = num(doc.widthMm) || num(parents[0]?.widthMm) || 0;
  let consumed = 0;
  let balance = 0;
  parents.forEach((parent, index) => {
    const taken = roundKg(parent?.consumedKg);
    const available = num(parent?.availableKg ?? parent?.availableWeightKg);
    if (!(taken > 0)) errors.push(`Parent ${index + 1} needs kilograms consumed.`);
    if (available > 0 && taken > available + 0.001) {
      errors.push(`Parent ${index + 1} consumes more than the roll has in stock.`);
    }
    consumed = roundKg(consumed + taken);
    if (available > 0) balance = roundKg(balance + Math.max(0, available - taken));
  });

  let outputKg = 0;
  const lanes = new Map();
  const named = outputs.map((output, index) => {
    const net = roundKg(output?.netKg);
    const width = num(output?.widthMm);
    if (!(net > 0)) errors.push(`Output ${index + 1} needs a net weight.`);
    if (!(width > 0)) errors.push(`Output ${index + 1} needs a width.`);
    if (parentWidth > 0 && width > parentWidth + 0.01) {
      errors.push(`Output ${index + 1} is wider than the parent roll.`);
    }
    outputKg = roundKg(outputKg + net);
    const lane = laneOf(output, index);
    const metres = exactFilmMetres({ kg: net, widthMm: width, micron, density });
    lanes.set(lane, (lanes.get(lane) || 0) + metres);
    return {
      lane,
      netKg: net,
      widthMm: width,
      lengthMeters: filmMetresFromKg({ kg: net, widthMm: width, micron, density }),
      suggestedName: directSlitItemName({
        filmType: doc.filmType || parents[0]?.filmType,
        widthMm: width,
        micron,
        metallocenePct: doc.metallocenePct || parents[0]?.metallocenePct
      })
    };
  });

  const varianceKg = roundKg(consumed - outputKg - trim - setting);
  const massOut = Math.abs(varianceKg) > DIRECT_SLIT_TOLERANCE_KG;

  let parentArea = 0;
  let parentRun = 0;
  parents.forEach((parent) => {
    const run = parentRunMetres({
      ...parent,
      micron: parent?.micron ?? micron,
      widthMm: parent?.widthMm || parentWidth
    }, density);
    parentRun += run;
    parentArea += num(parent?.widthMm || parentWidth) * run;
  });
  let outputArea = 0;
  named.forEach((output) => {
    outputArea += exactFilmMetres({
      kg: output.netKg,
      widthMm: output.widthMm,
      micron,
      density
    }) * num(output.widthMm);
  });
  const scrapArea = micron > 0 && density > 0
    ? ((trim + setting) * 1000000) / (micron * density)
    : 0;
  const areaPct = parentArea > 0
    ? (Math.abs(outputArea + scrapArea - parentArea) / parentArea) * 100
    : 0;
  let lanePct = 0;
  if (parentRun > 0) {
    lanes.forEach((metres) => {
      const pct = (Math.abs(metres - parentRun) / parentRun) * 100;
      if (pct > lanePct) lanePct = pct;
    });
  }
  const metresPct = Math.max(areaPct, lanePct);
  let metresStatus = 'ok';
  if (metresPct > DIRECT_SLIT_METRES_BLOCK_PCT) metresStatus = 'block';
  else if (metresPct > DIRECT_SLIT_METRES_WARN_PCT) metresStatus = 'warn';

  return {
    ok: errors.length === 0,
    errors,
    consumedKg: consumed,
    outputKg,
    balanceKg: balance,
    trimScrapKg: trim,
    settingScrapKg: setting,
    varianceKg,
    metresPct: Math.round(metresPct * 100) / 100,
    metresStatus,
    overrideRequired: massOut || metresStatus === 'block',
    outputs: named
  };
}
