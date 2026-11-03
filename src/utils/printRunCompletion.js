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
  const net = finite(row.netWeightKg ?? row.availableWeightKg ?? row.balanceKg);
  const consumed = finite(row.consumedWeightKg ?? row.consumedKg);
  const initial = finite(row.initialWeightKg ?? row.initialKg);
  const meters = finite(row.lengthMeters ?? row.meters);
  return {
    barcodeId,
    netWeightKg: net !== null && net > 0 ? net : null,
    consumedWeightKg: consumed !== null && consumed > 0 ? consumed : null,
    initialWeightKg: initial !== null && initial > 0 ? initial : null,
    lengthMeters: meters !== null && meters > 0 ? meters : null,
    filmType: text(row.filmType),
    itemName: text(row.itemName),
    rollType: text(row.rollType)
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

function balanceFromStock(order, inventoryRolls) {
  const found = [];
  (order?.inputRollsList || []).forEach((roll) => {
    const parent = rollBarcode(roll);
    if (!parent) return;
    const barcodeId = parent.endsWith('-BAL') ? parent : `${parent}-BAL`;
    const match = (inventoryRolls || []).find((item) => rollBarcode(item).toLowerCase() === barcodeId.toLowerCase());
    found.push(match ? { ...match, barcodeId } : { barcodeId, netWeightKg: null });
  });
  return normalizeList(found.filter((row) => row.netWeightKg));
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
  let balanceRolls = normalizeList(order?.balanceRolls);
  if (!balanceRolls.length) balanceRolls = normalizeList(lot?.runBalanceRolls);
  if (!balanceRolls.length) balanceRolls = balanceFromStock(order, inventoryRolls);
  let consumedRolls = normalizeList(order?.consumedRolls);
  if (!consumedRolls.length) consumedRolls = normalizeList(lot?.runConsumedRolls);
  if (!consumedRolls.length) consumedRolls = consumedFromInputs(order?.inputRollsList);
  const jobMeters = finite(order?.actualMetersPrinted);
  const lotMeters = finite(lot?.totalMeters);
  const meters = jobMeters !== null && jobMeters > 0 ? jobMeters : (lotMeters !== null && lotMeters > 0 ? lotMeters : null);
  if (printedRolls.length === 1 && !(printedRolls[0].lengthMeters > 0) && meters) {
    printedRolls = [{ ...printedRolls[0], lengthMeters: meters }];
  }
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

/** A roll the label printer can stick. Consumed parent rolls keep their old tag. */
export function labelRoll(row, context = {}) {
  const barcodeId = rollBarcode(row);
  const balance = barcodeId.endsWith('-BAL') || row?.rollType === 'RAW_MATERIAL';
  const weight = finite(row?.netWeightKg) || finite(row?.consumedWeightKg) || 0;
  return {
    id: barcodeId,
    barcodeId,
    netWeightKg: weight,
    availableWeightKg: weight,
    grossWeightKg: weight,
    lengthMeters: finite(row?.lengthMeters),
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
