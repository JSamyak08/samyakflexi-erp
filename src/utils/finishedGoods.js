/**
 * Finished goods are the only stock that can be dispatched.
 * "Semi-Finished" contains the word "Finished", so a substring check
 * treats printed, laminated, and other WIP as ready for dispatch.
 * An SFG roll type or an SFG- barcode is never finished goods.
 */

export const DISPATCH_READY_DUST_KG = 0.05;

const SFG_ROLL_TYPES = new Set([
  'SFG',
  'SEMI_FINISHED_GOODS',
  'SFG_PRINTED',
  'SFG_LAMINATED'
]);

const FG_ROLL_TYPES = new Set([
  'FG',
  'FINISHED_GOODS',
  'FG_DISPATCH'
]);

function text(value) {
  return String(value || '').trim();
}

function rollTypeOf(item) {
  return text(item?.rollType || item?.roll_type).toUpperCase().replace(/[\s-]+/g, '_');
}

function batchCodeOf(item) {
  const coded = text(
    item?.sfgBatchCode
    || item?.sfg_batch_code
    || item?.barcodeId
    || item?.barcode_id
    || item?.barcode
  );
  if (coded) return coded;
  const id = text(item?.id);
  return /^(SFG|FG)-/i.test(id) ? id : '';
}

function describe(item) {
  return `${text(item?.sfgType || item?.sfg_type)} ${text(item?.category)}`.toLowerCase();
}

export function isFinishedGoodsStock(item) {
  if (!item || typeof item !== 'object') return false;
  const rollType = rollTypeOf(item);
  const code = batchCodeOf(item);
  const described = describe(item);
  const explicitSfg = SFG_ROLL_TYPES.has(rollType) || /^SFG-/i.test(code);
  const explicitFg = FG_ROLL_TYPES.has(rollType) || /^FG-/i.test(code);
  const semiText = /semi[-\s]?finished/.test(described);
  const finishedText = /finished goods/.test(described) && !semiText;

  if (explicitSfg) return false;
  if (semiText && !explicitFg) return false;
  return explicitFg || finishedText;
}

export function stockAvailableKg(item) {
  if (item?.availableKg !== undefined && item?.availableKg !== null && item?.availableKg !== '') {
    const value = Number(item.availableKg);
    return Number.isFinite(value) ? value : 0;
  }
  if (item?.availableWeightKg !== undefined && item?.availableWeightKg !== null && item?.availableWeightKg !== '') {
    const value = Number(item.availableWeightKg);
    return Number.isFinite(value) ? value : 0;
  }
  const net = Number(item?.totalNetKg ?? item?.netWeightKg ?? 0) || 0;
  const consumed = Number(item?.consumedKg ?? 0) || 0;
  const dispatched = Number(item?.dispatchedKg ?? 0) || 0;
  return Math.max(0, net - consumed - dispatched);
}

/** Lots a packing list may select. SFG, printed WIP, and balance rolls are excluded. */
export function dispatchSelectableLots(items) {
  return (items || []).filter((item) => (
    isFinishedGoodsStock(item) && stockAvailableKg(item) > DISPATCH_READY_DUST_KG
  ));
}
