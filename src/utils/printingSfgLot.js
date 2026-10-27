/** One printed SFG lot per job. Child roll barcodes stay inside the lot. */

import { roundFilmKg } from './printingFilmIssue.js';

export function printingSfgLotCode(orderId) {
  return `SFG-LOT-${String(orderId || '').trim()}`;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Stock is the lot total. Individual output barcodes are children, not extra stock.
 * A later End Job retry replaces the child list and the total. Kilograms already
 * consumed from the lot stay consumed, and the balance carries forward.
 */
export function planPrintingSfgLot({
  orderId,
  jobName,
  jobCode,
  jobMasterId,
  clientName,
  filmType,
  micron,
  widthMm,
  outputRolls,
  inputRolls,
  meters,
  existingLot
} = {}) {
  const children = [];
  (outputRolls || []).forEach((roll, index) => {
    const barcodeId = String(roll?.barcodeId || roll?.id || '').trim();
    const netWeightKg = roundFilmKg(finite(roll?.netWeightKg) || 0);
    if (!barcodeId || !(netWeightKg > 0)) return;
    children.push({
      barcodeId,
      rollNo: roll.rollNo || index + 1,
      netWeightKg,
      lengthMeters: finite(roll.lengthMeters)
    });
  });

  const totalNetKg = roundFilmKg(children.reduce((sum, roll) => sum + roll.netWeightKg, 0));
  const consumedKg = roundFilmKg(Math.max(0, finite(existingLot?.consumedKg) || 0));
  const availableKg = roundFilmKg(Math.max(0, totalNetKg - consumedKg));
  const meterValue = finite(meters);
  const childMeters = children.reduce((sum, roll) => sum + (roll.lengthMeters || 0), 0);
  const totalMeters = roundFilmKg(meterValue !== null && meterValue > 0 ? meterValue : childMeters);
  const inputBarcodeIds = [];
  (inputRolls || []).forEach((roll) => {
    const barcode = String(roll?.barcodeId || roll?.barcode || '').trim();
    if (barcode && !inputBarcodeIds.includes(barcode)) inputBarcodeIds.push(barcode);
  });

  let status = 'In Stock (WIP)';
  if (consumedKg > 0) status = availableKg <= 0 ? 'Fully Consumed' : 'Partially Consumed';

  return {
    sfgBatchCode: printingSfgLotCode(orderId),
    sfgType: 'Printed Rolls',
    isPrintedLot: true,
    orderId: orderId || '',
    jobName: jobName || '',
    jobCode: jobCode || orderId || '',
    clientName: clientName || '',
    filmType: filmType || '',
    micron: finite(micron) || 0,
    widthMm: finite(widthMm) || 0,
    totalNetKg,
    consumedKg,
    availableKg,
    totalMeters,
    rollsCount: children.length,
    inputBarcodeIds,
    childRolls: children,
    jobMasterId: jobMasterId || existingLot?.jobMasterId || '',
    jobId: jobMasterId || existingLot?.jobMasterId || existingLot?.jobId || '',
    printedAllocations: Array.isArray(existingLot?.printedAllocations) ? existingLot.printedAllocations : [],
    status
  };
}

/** A job-level printed lot. Closing the order does not remove it. */
export function isReusablePrintedLot(item) {
  if (!item) return false;
  if (item.isPrintedLot) return true;
  return String(item.sfgBatchCode || '').startsWith('SFG-LOT-');
}

/** Child barcodes and older per-roll stock rows that now belong to a lot. */
export function printedLotChildCodes(sfgGoods) {
  const codes = new Set();
  (sfgGoods || []).forEach((item) => {
    if (!item?.isPrintedLot && !String(item?.sfgBatchCode || '').startsWith('SFG-LOT-')) return;
    (item.childRolls || []).forEach((roll) => {
      const barcode = String(roll?.barcodeId || roll?.id || '').trim();
      if (barcode) codes.add(barcode);
    });
  });
  return codes;
}

export function isPrintedLotChild(roll, sfgGoods) {
  const barcode = String(roll?.barcodeId || roll?.id || roll?.sfgBatchCode || '').trim();
  const parent = String(roll?.parentSfgBatchCode || '').trim();
  const lots = (sfgGoods || []).filter((item) => isReusablePrintedLot(item));
  if (parent && lots.some((item) => item.sfgBatchCode === parent)) return true;
  return Boolean(barcode) && printedLotChildCodes(sfgGoods).has(barcode);
}

/** Stock rows that would double-count a lot's child barcodes. The lot itself stays. */
export function omitPrintedLotChildren(items) {
  const childCodes = printedLotChildCodes(items);
  return (items || []).filter((item) => {
    const code = String(item?.sfgBatchCode || item?.barcodeId || '').trim();
    if (isReusablePrintedLot(item)) return true;
    if (isPrintedLotChild(item, items)) return false;
    if (code && childCodes.has(code)) return false;
    return true;
  });
}
