/**
 * Plain substrate print target.
 *
 * What needs to be printed is the order's required printed quantity after
 * any existing printed SFG balance reused from earlier jobs. The print
 * target is that base plus extra_print_percent (default 3). Kilograms and
 * metres both use the extra. Metres use the existing film conversion
 * (weight, width, micron, density).
 *
 * Substrate planning keeps the existing requirement math and then uses this
 * target as the print-film quantity. Other films, inks, and adhesives stay
 * as they were.
 */

import { calculateFilmRollLength, getOrderMaterialRequirements } from '../factoryStore.js';
import { roundFilmKg } from './printingFilmIssue.js';
import { planPrintedSfgAllocation } from './printedSfgReuse.js';

export const EXTRA_PRINT_PERCENT_SETTING = 'extra_print_percent';
export const DEFAULT_EXTRA_PRINT_PERCENT = 3;
export const EXTRA_PRINT_PERCENT_MAX = 100;

export function normalizeExtraPrintPercent(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_EXTRA_PRINT_PERCENT;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return DEFAULT_EXTRA_PRINT_PERCENT;
  const capped = Math.min(EXTRA_PRINT_PERCENT_MAX, number);
  return Math.round(capped * 100) / 100;
}

export function formatExtraPrintPercent(value) {
  const number = normalizeExtraPrintPercent(value);
  return Number.isInteger(number) ? String(number) : String(number);
}

export function extraPrintRuleLabel(value) {
  return `+${formatExtraPrintPercent(value)}% extra print rule`;
}

export function extraPrintIncludedNote(value) {
  return `(incl. ${formatExtraPrintPercent(value)}% extra)`;
}

function finiteKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, number);
}

function metresForKg(kg, spec) {
  if (!(kg > 0)) return 0;
  const metres = calculateFilmRollLength(kg, spec?.widthMm, spec?.micron, spec?.filmType);
  if (metres === '' || metres === null || metres === undefined) return null;
  const number = Number(metres);
  return Number.isFinite(number) ? number : null;
}

/**
 * requiredPrintedKg is the print quantity before the SFG deduction.
 * sfgBalanceKg is the printed balance reused on this order.
 * base = required − SFG. target = base × (1 + percent/100).
 */
export function planExtraPrint({
  requiredPrintedKg = 0,
  sfgBalanceKg = 0,
  percent = DEFAULT_EXTRA_PRINT_PERCENT,
  widthMm,
  micron,
  filmType
} = {}) {
  const percentValue = normalizeExtraPrintPercent(percent);
  const requiredKg = roundFilmKg(finiteKg(requiredPrintedKg));
  const sfgKg = roundFilmKg(Math.min(requiredKg, finiteKg(sfgBalanceKg)));
  const baseKg = roundFilmKg(Math.max(0, requiredKg - sfgKg));
  const extraKg = roundFilmKg(baseKg * percentValue / 100);
  const targetKg = roundFilmKg(baseKg + extraKg);
  const spec = { widthMm, micron, filmType };
  return {
    percent: percentValue,
    label: extraPrintRuleLabel(percentValue),
    requiredKg,
    sfgBalanceKg: sfgKg,
    baseKg,
    extraKg,
    targetKg,
    baseMeters: metresForKg(baseKg, spec),
    extraMeters: metresForKg(extraKg, spec),
    targetMeters: metresForKg(targetKg, spec),
    widthMm: widthMm ?? '',
    micron: micron ?? '',
    filmType: filmType || '',
    blocks: false
  };
}

export function isPlainPrintFilmLine(req) {
  if (!req) return false;
  const film = String(req.filmType || '');
  if (/ink|adhesive|solvent/i.test(film)) return false;
  if (req.widthMm === '-' || req.micron === '-') return false;
  return true;
}

function lineAfterSfgKg(line) {
  if (line?.qtyBeforeExtraKg !== undefined && line?.qtyBeforeExtraKg !== null && line?.qtyBeforeExtraKg !== '') {
    return finiteKg(line.qtyBeforeExtraKg);
  }
  return finiteKg(line?.qtyKg);
}

export function applyExtraPrintToRequirements(requirements, { percent } = {}) {
  const list = Array.isArray(requirements) ? requirements.map((req) => ({ ...req })) : [];
  const index = list.findIndex(isPlainPrintFilmLine);
  if (index < 0) {
    return {
      requirements: list,
      extraPrint: { ...planExtraPrint({ percent }), hasPrintLine: false }
    };
  }
  const line = list[index];
  const afterSfg = lineAfterSfgKg(line);
  const required = line.qtyBeforePrintedSfgKg !== undefined && line.qtyBeforePrintedSfgKg !== null && line.qtyBeforePrintedSfgKg !== ''
    ? finiteKg(line.qtyBeforePrintedSfgKg)
    : afterSfg;
  const plan = planExtraPrint({
    requiredPrintedKg: required,
    sfgBalanceKg: Math.max(0, required - afterSfg),
    percent,
    widthMm: line.widthMm,
    micron: line.micron,
    filmType: line.filmType
  });
  list[index] = {
    ...line,
    qtyBeforeExtraKg: plan.baseKg,
    qtyKg: plan.targetKg,
    extraPrint: { ...plan, hasPrintLine: true }
  };
  return { requirements: list, extraPrint: { ...plan, hasPrintLine: true } };
}

function restorePrintBase(order, requirements) {
  const saved = order?.printedSfgUse;
  if (!saved?.printLineId || saved.baseQtyKg === undefined || saved.baseQtyKg === null) return requirements || [];
  return (requirements || []).map((req) => (
    req?.id === saved.printLineId ? { ...req, qtyKg: Number(saved.baseQtyKg) || 0 } : req
  ));
}

function savedChoice(order) {
  if (order?.printedSfgUse) {
    return { mode: order.printedSfgUse.mode, kg: order.printedSfgUse.allocatedKg, explicit: false };
  }
  return { mode: 'all', explicit: true };
}

/**
 * Existing SFG allocation, then the print-film line quantity becomes the target.
 * baseRequirements is the pre-extra list and is what gets stored.
 */
export function planOrderExtraPrint({
  order,
  orders = [],
  sfgGoods = [],
  jobMasters = [],
  percent = DEFAULT_EXTRA_PRINT_PERCENT,
  choice,
  requirements
} = {}) {
  const stored = Array.isArray(requirements)
    ? requirements
    : restorePrintBase(order, getOrderMaterialRequirements(order, jobMasters));
  const sfgPlan = planPrintedSfgAllocation({
    order,
    orders,
    sfgGoods,
    requirements: stored,
    choice: choice || savedChoice(order)
  });
  const applied = applyExtraPrintToRequirements(sfgPlan.requirements, { percent });
  return {
    ...sfgPlan,
    baseRequirements: sfgPlan.requirements,
    requirements: applied.requirements,
    extraPrint: applied.extraPrint
  };
}

function recordedNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Warning only. below is true when a recorded kg or metre is under the target.
 * blocks is always false.
 */
export function extraPrintShortfall({ plan, printedKg, printedMeters } = {}) {
  const empty = { below: false, shortKg: 0, shortMeters: 0, blocks: false, label: plan?.label || extraPrintRuleLabel() };
  if (!plan?.hasPrintLine && !(plan && plan.targetKg > 0)) return empty;
  const kg = recordedNumber(printedKg);
  const metres = recordedNumber(printedMeters);
  const kgRecorded = kg !== null && kg > 0;
  const metresRecorded = metres !== null && metres > 0;
  if (!kgRecorded && !metresRecorded) return empty;
  const shortKg = !kgRecorded ? 0 : roundFilmKg(Math.max(0, (Number(plan.targetKg) || 0) - kg));
  const targetMetres = plan.targetMeters === null || plan.targetMeters === undefined ? null : Number(plan.targetMeters);
  const shortMeters = metres === null || targetMetres === null ? 0 : Math.max(0, Math.round(targetMetres - metres));
  const belowKg = kgRecorded && (Number(plan.targetKg) || 0) > 0 && kg + 0.009 < Number(plan.targetKg);
  const belowMeters = metresRecorded && targetMetres !== null && targetMetres > 0 && metres < targetMetres;
  return {
    below: belowKg || belowMeters,
    shortKg: belowKg ? shortKg : (kgRecorded ? 0 : null),
    shortMeters: belowMeters ? shortMeters : (metresRecorded ? 0 : null),
    blocks: false,
    label: plan.label || extraPrintRuleLabel(plan.percent),
    percent: plan.percent
  };
}
