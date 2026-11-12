/** Printed output an operator can label after a press run ends. */

import { printingSfgLotCode } from './printingSfgLot.js';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return String(value || '').trim();
}

/** Same barcode stem the press uses: job code, otherwise the order id. */
export function printBarcodeBase(jobCode, orderId) {
  const clean = text(jobCode || orderId || 'ORD-000').replace(/[^a-zA-Z0-9-]/g, '');
  return clean || 'ORD-000';
}

export function printedRollBarcode(jobCode, orderId, sequence) {
  return `SFG-BC-${printBarcodeBase(jobCode, orderId)}-${sequence}`;
}

function rollBarcode(row) {
  return text(row?.barcodeId || row?.barcode || row?.id);
}

export function normalizeCompletionRoll(row) {
  if (!row || typeof row !== 'object') return null;
  const barcodeId = rollBarcode(row);
  if (!barcodeId) return null;
  const net = finite(row.netWeightKg ?? row.availableWeightKg ?? row.balanceKg ?? row.availableKg ?? row.totalNetKg);
  const consumed = finite(row.consumedWeightKg ?? row.consumedKg);
  const initial = finite(row.initialWeightKg ?? row.initialKg);
  const meters = finite(row.lengthMeters ?? row.meters ?? row.totalMeters);
  const gross = finite(row.grossWeightKg ?? row.totalGrossKg);
  return {
    barcodeId,
    netWeightKg: net !== null && net > 0 ? net : null,
    grossWeightKg: gross !== null && gross > 0 ? gross : null,
    consumedWeightKg: consumed !== null && consumed > 0 ? consumed : null,
    initialWeightKg: initial !== null && initial > 0 ? initial : null,
    lengthMeters: meters !== null && meters > 0 ? meters : null,
    filmType: text(row.filmType),
    itemName: text(row.itemName || row.jobName),
    rollType: text(row.rollType),
    orderId: text(row.orderId)
  };
}

function normalizeList(rows) {
  const seen = new Set();
  const list = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const normalized = normalizeCompletionRoll(row);
    if (!normalized || seen.has(normalized.barcodeId)) return;
    seen.add(normalized.barcodeId);
    list.push(normalized);
  });
  return list;
}

function rollMeta(roll) {
  const meta = roll?.metadata;
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
}

/** Order that created the balance roll. Issuing a roll rewrites order_id, so that column is not used. */
function creatingOrderId(roll) {
  const meta = rollMeta(roll);
  return text(roll?.creatingOrderId || meta.orderId || meta.creatingOrderId);
}

function parentBarcodeOf(roll) {
  const meta = rollMeta(roll);
  return text(roll?.parentBarcodeId || roll?.parentBarcode || meta.parentBarcodeId || meta.parentBarcode);
}

function balanceStatusBlocked(roll) {
  const status = text(roll?.status).toLowerCase().replace(/[_-]+/g, ' ');
  return status === 'reversed' || status === 'void' || status === 'voided';
}

function explicitAvailableKg(roll) {
  if (!roll || typeof roll !== 'object') return null;
  if (roll.availableWeightKg !== undefined && roll.availableWeightKg !== null && roll.availableWeightKg !== '') {
    return finite(roll.availableWeightKg);
  }
  if (roll.availableKg !== undefined && roll.availableKg !== null && roll.availableKg !== '') {
    return finite(roll.availableKg);
  }
  return null;
}

function savedArray(source, key) {
  if (!source || typeof source !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(source, key)) return null;
  return Array.isArray(source[key]) ? source[key] : null;
}

/**
 * Legacy runs have no saved balance list. A leftover is the child whose
 * metadata names this order and one of this run's input barcodes as parent.
 * The run's own input, including a -BAL roll it consumed, is never a balance.
 */
function inferBalanceRolls(order, inventoryRolls) {
  const orderId = text(order?.id).toLowerCase();
  const inputs = new Set(
    (order?.inputRollsList || []).map((roll) => rollBarcode(roll).toLowerCase()).filter(Boolean)
  );
  const found = [];
  (inventoryRolls || []).forEach((item) => {
    const code = rollBarcode(item);
    if (!code || !code.toUpperCase().endsWith('-BAL')) return;
    if (inputs.has(code.toLowerCase())) return;
    if (balanceStatusBlocked(item)) return;
    const parent = parentBarcodeOf(item).toLowerCase();
    const creator = creatingOrderId(item).toLowerCase();
    if (!orderId || !parent || !creator) return;
    if (creator !== orderId || !inputs.has(parent)) return;
    const available = explicitAvailableKg(item);
    const weight = available !== null ? available : finite(item?.netWeightKg ?? item?.balanceKg);
    if (weight === null || weight <= 0) return;
    found.push({
      ...item,
      barcodeId: code,
      netWeightKg: weight,
      availableWeightKg: weight
    });
  });
  return normalizeList(found);
}

function sameOrder(roll, orderId) {
  return text(roll?.orderId).toLowerCase() === text(orderId).toLowerCase();
}

function printedFromInventory(orderId, inventoryRolls) {
  return normalizeList((inventoryRolls || []).filter((roll) => {
    if (!sameOrder(roll, orderId)) return false;
    const code = rollBarcode(roll).toUpperCase();
    if (!code || code.endsWith('-BAL')) return false;
    const type = text(roll.rollType).toUpperCase();
    return type === 'SEMI_FINISHED_GOODS' || type === 'SFG' || code.startsWith('SFG-');
  }));
}

function withInventoryFacts(rolls, inventoryRolls) {
  return (rolls || []).map((roll) => {
    const match = (inventoryRolls || []).find((item) => rollBarcode(item).toLowerCase() === text(roll.barcodeId).toLowerCase());
    if (!match) return roll;
    const meters = roll.lengthMeters > 0
      ? roll.lengthMeters
      : (finite(match.lengthMeters ?? match.meters ?? match.totalMeters) > 0
        ? finite(match.lengthMeters ?? match.meters ?? match.totalMeters)
        : null);
    const gross = finite(roll.grossWeightKg) > 0
      ? finite(roll.grossWeightKg)
      : (finite(match.grossWeightKg ?? match.totalGrossKg) > 0 ? finite(match.grossWeightKg ?? match.totalGrossKg) : null);
    const net = roll.netWeightKg > 0
      ? roll.netWeightKg
      : (finite(match.netWeightKg ?? match.availableWeightKg ?? match.availableKg) > 0
        ? finite(match.netWeightKg ?? match.availableWeightKg ?? match.availableKg)
        : roll.netWeightKg);
    return { ...roll, lengthMeters: meters, grossWeightKg: gross, netWeightKg: net };
  });
}

function consumedFromInputs(rolls) {
  return normalizeList((rolls || []).map((roll) => ({
    barcodeId: rollBarcode(roll),
    consumedWeightKg: finite(roll.consumedWeightKg ?? roll.consumedKg),
    initialWeightKg: finite(roll.initialWeightKg ?? roll.initialKg),
    filmType: roll.filmType
  })));
}

/**
 * Prefer the run that just ended. After a reload, the printed lot and the
 * stock rolls still carry the same barcodes.
 */
export function completionForOrder({ order, sfgGoods, inventoryRolls } = {}) {
  const orderId = text(order?.id);
  const lot = (sfgGoods || []).find((item) => text(item?.sfgBatchCode) === printingSfgLotCode(orderId));
  let printedRolls = normalizeList(order?.printedRolls);
  if (!printedRolls.length) printedRolls = normalizeList(lot?.childRolls);
  if (!printedRolls.length) printedRolls = printedFromInventory(orderId, inventoryRolls);
  const lotBalance = savedArray(lot, 'runBalanceRolls');
  const orderBalance = savedArray(order, 'balanceRolls');
  let balanceRolls = lotBalance !== null
    ? normalizeList(lotBalance)
    : (orderBalance !== null ? normalizeList(orderBalance) : inferBalanceRolls(order, inventoryRolls));
  let consumedRolls = normalizeList(order?.consumedRolls);
  if (!consumedRolls.length) consumedRolls = normalizeList(lot?.runConsumedRolls);
  if (!consumedRolls.length) consumedRolls = consumedFromInputs(order?.inputRollsList);
  const consumedIds = new Set(consumedRolls.map((roll) => text(roll.barcodeId).toLowerCase()).filter(Boolean));
  balanceRolls = balanceRolls.filter((roll) => !consumedIds.has(text(roll.barcodeId).toLowerCase()));
  const jobMeters = finite(order?.actualMetersPrinted);
  const lotMeters = finite(lot?.totalMeters);
  const meters = jobMeters !== null && jobMeters > 0 ? jobMeters : (lotMeters !== null && lotMeters > 0 ? lotMeters : null);
  printedRolls = withInventoryFacts(printedRolls, inventoryRolls);
  balanceRolls = withInventoryFacts(balanceRolls, inventoryRolls);
  return {
    orderId,
    jobName: text(order?.jobName || lot?.jobName),
    jobCode: text(order?.jobCode || lot?.jobCode || orderId),
    meters,
    printedRolls,
    balanceRolls,
    consumedRolls,
    outputRecorded: printedRolls.length > 0
  };
}

/** Balance stickers use the meters typed for that leftover roll. */
export function withEnteredBalanceMeters(balanceRolls, inputRolls) {
  return (Array.isArray(balanceRolls) ? balanceRolls : []).map((roll) => {
    const own = lengthForPrintedRoll(roll);
    if (own) return { ...roll, lengthMeters: own };
    const barcode = text(roll?.barcodeId || roll?.id).toLowerCase();
    const parent = text(roll?.parentBarcodeId || roll?.parentBarcode).toLowerCase();
    const source = (Array.isArray(inputRolls) ? inputRolls : []).find((item) => {
      const code = text(item?.barcodeId || item?.barcode).toLowerCase();
      return code && (code === parent || `${code}-bal` === barcode);
    });
    const entered = finite(source?.balanceLengthMeters);
    return { ...roll, lengthMeters: entered !== null && entered > 0 ? entered : null };
  });
}

/** Length the operator typed for this roll. A job total is never copied onto a roll. */
export function lengthForPrintedRoll(roll) {
  const own = finite(roll?.lengthMeters ?? roll?.meters);
  return own !== null && own > 0 ? own : null;
}

function positiveMeters(value) {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

/** Each weighed printed roll needs its own length. Blank, zero, and negative are rejected. */
export function printedRollMeterErrors(rolls) {
  const errors = [];
  (Array.isArray(rolls) ? rolls : []).forEach((roll, index) => {
    const weight = finite(roll?.netWeightKg);
    if (weight === null || weight <= 0) return;
    if (positiveMeters(roll?.lengthMeters) === null) {
      errors.push(`Printed roll ${index + 1} needs its own length in meters.`);
    }
  });
  return errors;
}

/** A leftover balance needs the meters measured on that balance roll, not a share of the job. */
export function balanceRollMeterErrors(rolls) {
  const errors = [];
  (Array.isArray(rolls) ? rolls : []).forEach((roll, index) => {
    const initial = finite(roll?.initialWeightKg ?? roll?.initialKg);
    const consumed = finite(roll?.consumedWeightKg ?? roll?.consumedKg);
    if (initial === null || consumed === null || !(initial > consumed) || !(consumed > 0)) return;
    if (positiveMeters(roll?.balanceLengthMeters ?? roll?.lengthMeters) === null) {
      errors.push(`Input roll ${index + 1} has leftover film and needs the balance length in meters.`);
    }
  });
  return errors;
}

/** A roll the label printer can stick. Consumed parent rolls keep their old tag. */
export function labelRoll(row, context = {}) {
  const barcodeId = rollBarcode(row);
  const balance = barcodeId.endsWith('-BAL') || row?.rollType === 'RAW_MATERIAL';
  const weight = finite(row?.netWeightKg) || finite(row?.availableWeightKg) || finite(row?.availableKg) || finite(row?.totalNetKg) || finite(row?.consumedWeightKg) || 0;
  const gross = finite(row?.grossWeightKg ?? row?.totalGrossKg);
  const meters = finite(row?.lengthMeters ?? row?.meters ?? row?.totalMeters);
  return {
    id: barcodeId,
    barcodeId,
    netWeightKg: weight,
    availableWeightKg: weight,
    grossWeightKg: gross !== null && gross > 0 ? gross : undefined,
    lengthMeters: meters !== null && meters > 0 ? meters : null,
    unit: 'Kg',
    uom: 'Kg',
    jobName: text(context.jobName),
    jobCode: text(context.jobCode),
    orderId: text(context.orderId),
    clientName: text(context.clientName),
    customerName: text(context.clientName),
    filmType: text(row?.filmType || context.filmType),
    micron: context.micron ?? null,
    widthMm: context.widthMm ?? null,
    rollType: balance ? 'RAW_MATERIAL' : 'SEMI_FINISHED_GOODS',
    category: balance ? 'Raw Material (RM)' : 'Semi-Finished Goods (SFG)',
    sfgType: balance ? '' : 'Printed Rolls',
    itemName: text(row?.itemName) || (balance ? `${barcodeId} balance roll` : text(context.jobName) || barcodeId),
    status: balance ? 'In Stock (RM)' : 'In Stock (SFG)'
  };
}
