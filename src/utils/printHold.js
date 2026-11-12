/**
 * Hold a running rotogravure job without marking it Completed.
 * Restart is a new run on the same order. Usable metres and kilograms
 * from earlier holds stay on the job and reduce what is still to print.
 */
import { assignedRolesOf } from '../assignedRoles.js';
import { balanceRollMeterErrors } from './printRunCompletion.js';

export const PRINT_HOLD_STATUS = 'Hold on Printing';

export const PRINT_HOLD_ROLES = [
  'Admin',
  'Plant Manager',
  'Production Manager',
  'Printing Operator',
  'Shop Floor Operator'
];

export const PRINT_HOLD_REASONS = [
  'Cylinder Chroming Issue',
  'Cylinder Damage Issue',
  'Machine Maintenance',
  'Urgent Job Changeover',
  'Rubber Roller Issue',
  'Raw Material Issue',
  'Other Reason'
];

export const PRINT_HOLD_OTHER = 'Other Reason';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return String(value || '').trim();
}

export function isHeldPrintJob(order) {
  const status = text(
    order?.printingStatus
    || order?.printing_status
    || order?.jobDetails?.printingStatus
  ).toLowerCase();
  return status === PRINT_HOLD_STATUS.toLowerCase();
}

export function holdHistoryOf(order) {
  const candidates = [order?.printHoldHistory, order?.jobDetails?.printHoldHistory];
  for (const list of candidates) {
    if (Array.isArray(list)) return list;
  }
  return [];
}

/**
 * Operators, plant managers, production managers, and admins.
 * Admin follows private.can_any and is not locked out by the matrix.
 * Any other allowed role needs printing_scheduler turned on.
 * A user with several roles is allowed when one of those roles is allowed.
 */
export function canHoldPrintJob(user, matrix) {
  const roles = assignedRolesOf(user).filter((role) => PRINT_HOLD_ROLES.includes(role));
  if (!roles.length) return false;
  if (roles.includes('Admin')) return true;
  if (!matrix || typeof matrix !== 'object') return true;
  return roles.some((role) => {
    const flag = matrix[role]?.printing_scheduler;
    return flag === true || flag === 'true';
  });
}

export function validatePrintHold({ reason, note, meters, printedKg, usable, inputRolls } = {}) {
  const chosen = text(reason);
  const typed = text(note);
  if (!PRINT_HOLD_REASONS.includes(chosen)) {
    return { ok: false, error: 'Choose a hold reason.' };
  }
  if (chosen === PRINT_HOLD_OTHER && !typed) {
    return { ok: false, error: 'Other Reason needs a note.' };
  }
  const metersNum = finite(meters);
  if (metersNum === null || metersNum <= 0) {
    return { ok: false, error: 'Enter the meters run before stop.' };
  }
  const kgNum = finite(printedKg);
  if (kgNum === null || kgNum <= 0) {
    return { ok: false, error: 'Enter the print quantity in kilograms.' };
  }
  if (usable !== true && usable !== false) {
    return { ok: false, error: 'Say whether the printed quantity is usable.' };
  }
  const rolls = Array.isArray(inputRolls) ? inputRolls : [];
  const consumed = rolls.reduce((sum, roll) => sum + (finite(roll?.consumedWeightKg ?? roll?.consumedKg) || 0), 0);
  if (consumed <= 0) {
    return { ok: false, error: 'Enter the consumed weight for at least one input roll.' };
  }
  const balanceErrors = balanceRollMeterErrors(rolls);
  if (balanceErrors.length) {
    return { ok: false, error: balanceErrors[0] };
  }
  return {
    ok: true,
    value: {
      reason: chosen,
      note: typed,
      meters: metersNum,
      printedKg: kgNum,
      usable
    }
  };
}

export function orderPrintRequirementKg(order) {
  const value = finite(order?.orderQtyKg ?? order?.quantityKg ?? order?.quantity);
  return value !== null && value > 0 ? value : 0;
}

export function usablePrintedKg(order) {
  return holdHistoryOf(order).reduce((sum, row) => {
    const usable = row?.usable === true || row?.printedUsable === true;
    if (!usable) return sum;
    const kg = finite(row?.printedKg ?? row?.printedOutputKg);
    return sum + (kg !== null && kg > 0 ? kg : 0);
  }, 0);
}

export function remainingPrintKg(order) {
  return Math.max(0, orderPrintRequirementKg(order) - usablePrintedKg(order));
}

/** Shown when an earlier hold put usable SFG into the store. */
export function balancePrintPrompt(order) {
  const usable = usablePrintedKg(order);
  if (usable <= 0) return '';
  const remaining = remainingPrintKg(order);
  const required = orderPrintRequirementKg(order);
  return `Usable printed SFG of ${usable.toFixed(2)} kg is already in the SFG store. Print only the balance quantity of ${remaining.toFixed(2)} kg (order ${required.toFixed(2)} kg).`;
}

export function isPressPrintingCompleted(order, productionRecord) {
  if (isHeldPrintJob(order)) return false;
  const end = order?.printingEndTime || order?.printing_end_time;
  const status = text(order?.printingStatus || order?.printing_status);
  return Boolean(
    end
    || status === 'Completed'
    || productionRecord?.stages?.printing?.status === 'Completed'
  );
}
