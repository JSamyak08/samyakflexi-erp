/**
 * A print run records press progress. It is not an order close or reopen.
 * Patches sent to the database keep only press fields.
 */

const PATCH_KEYS = [
  'machineId',
  'printingStartTime',
  'printingEndTime',
  'printingDurationMinutes',
  'printingDurationFormatted',
  'actualMetersPrinted',
  'printedOutputKg',
  'inkGsmInSpeed',
  'printingNotes',
  'inputRollsList',
  'outputRolls',
  'nextProcess',
  'jobMasterId',
  'jobCode',
  'clientName',
  'operatorName',
  'shift',
  'machineName',
  'filmType',
  'micron',
  'widthMm',
  'orderQtyKg',
  'printingPlainSettingWastageKg',
  'printingWastageKg',
  'excessFilmWastageKg',
  'storageBay',
  'holdReason',
  'holdNote',
  'printedUsable',
  'outputSegmentId'
];

export function buildPrintRunPatch(fields) {
  const source = fields && typeof fields === 'object' ? fields : {};
  const patch = {};
  PATCH_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      patch[key] = source[key];
    }
  });
  return patch;
}

function closeModeFromResult(order, result) {
  if (result && Object.prototype.hasOwnProperty.call(result, 'closeMode')) {
    return result.closeMode || null;
  }
  return order?.closeMode ?? order?.jobDetails?.closeMode ?? null;
}

/**
 * A print or production write that only flips the order back to
 * In Production must leave a dispatch status in place.
 */
export function preserveDispatchStatus(currentStatus, incomingStatus) {
  const sticky = currentStatus === 'Completed'
    || currentStatus === 'Balance Dispatch Pending'
    || currentStatus === 'Partially Dispatched';
  if (sticky && incomingStatus === 'In Production') return currentStatus;
  return incomingStatus || currentStatus || null;
}

export function applyPrintRunResult(order, result) {
  const current = order || {};
  const saved = result || {};
  const printingStatus = saved.printingStatus || current.printingStatus || null;
  const held = String(printingStatus || '').trim().toLowerCase() === 'hold on printing';
  const printingStartTime = Object.prototype.hasOwnProperty.call(saved, 'printingStartTime')
    ? saved.printingStartTime
    : (current.printingStartTime ?? null);
  const printingEndTime = Object.prototype.hasOwnProperty.call(saved, 'printingEndTime')
    ? saved.printingEndTime
    : (current.printingEndTime ?? null);
  const isPrintingCompleted = !held && (saved.isPrintingCompleted === true || printingStatus === 'Completed');
  const printHoldHistory = Array.isArray(saved.printHoldHistory)
    ? saved.printHoldHistory
    : (Array.isArray(current.printHoldHistory) ? current.printHoldHistory : (current.jobDetails?.printHoldHistory || []));
  const holdReason = Object.prototype.hasOwnProperty.call(saved, 'holdReason')
    ? (saved.holdReason || '')
    : (current.holdReason || current.jobDetails?.holdReason || '');
  const closeMode = closeModeFromResult(current, saved);
  const inputRollsList = Object.prototype.hasOwnProperty.call(saved, 'inputRollsList')
    ? saved.inputRollsList
    : current.inputRollsList;
  const nextProcess = Object.prototype.hasOwnProperty.call(saved, 'nextProcess')
    ? saved.nextProcess
    : current.nextProcess;
  return {
    ...current,
    status: preserveDispatchStatus(current.status, saved.status),
    closeMode,
    printingStatus,
    printingStartTime,
    printingEndTime,
    isPrintingCompleted,
    machineId: saved.machineId ?? current.machineId ?? null,
    actualMetersPrinted: saved.actualMetersPrinted ?? current.actualMetersPrinted,
    printedOutputKg: saved.printedOutputKg ?? current.printedOutputKg,
    inkGsmInSpeed: saved.inkGsmInSpeed ?? current.inkGsmInSpeed,
    printingNotes: saved.printingNotes ?? current.printingNotes,
    inputRollsList,
    printHoldHistory,
    holdReason,
    nextProcess,
    balanceRolls: Array.isArray(saved.balanceRolls) ? saved.balanceRolls : (current.balanceRolls || []),
    printedRolls: Object.prototype.hasOwnProperty.call(saved, 'printedRolls')
      ? (Array.isArray(saved.printedRolls) ? saved.printedRolls : [])
      : (current.printedRolls || []),
    consumedRolls: Object.prototype.hasOwnProperty.call(saved, 'consumedRolls')
      ? (Array.isArray(saved.consumedRolls) ? saved.consumedRolls : [])
      : (current.consumedRolls || []),
    jobDetails: {
      ...(current.jobDetails || {}),
      printingStatus,
      printingStartTime,
      printingEndTime,
      isPrintingCompleted,
      machineId: saved.machineId ?? current.machineId ?? null,
      inputRollsList,
      actualMetersPrinted: saved.actualMetersPrinted ?? current.jobDetails?.actualMetersPrinted,
      printedOutputKg: saved.printedOutputKg ?? current.jobDetails?.printedOutputKg,
      inkGsmInSpeed: saved.inkGsmInSpeed ?? current.jobDetails?.inkGsmInSpeed,
      printingNotes: saved.printingNotes ?? current.jobDetails?.printingNotes,
      nextProcess,
      closeMode,
      printHoldHistory,
      holdReason
    }
  };
}
