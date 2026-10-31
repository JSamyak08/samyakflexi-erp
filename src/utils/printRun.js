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
  'nextProcess',
  'jobMasterId'
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

export function applyPrintRunResult(order, result) {
  const current = order || {};
  const saved = result || {};
  const printingStatus = saved.printingStatus || current.printingStatus || null;
  const printingStartTime = Object.prototype.hasOwnProperty.call(saved, 'printingStartTime')
    ? saved.printingStartTime
    : (current.printingStartTime ?? null);
  const printingEndTime = Object.prototype.hasOwnProperty.call(saved, 'printingEndTime')
    ? saved.printingEndTime
    : (current.printingEndTime ?? null);
  const isPrintingCompleted = saved.isPrintingCompleted === true || printingStatus === 'Completed';
  const closeMode = closeModeFromResult(current, saved);
  const inputRollsList = Object.prototype.hasOwnProperty.call(saved, 'inputRollsList')
    ? saved.inputRollsList
    : current.inputRollsList;
  const nextProcess = Object.prototype.hasOwnProperty.call(saved, 'nextProcess')
    ? saved.nextProcess
    : current.nextProcess;
  return {
    ...current,
    status: saved.status || current.status,
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
    nextProcess,
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
      closeMode
    }
  };
}
