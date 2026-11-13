/**
 * Rules for reverting one SFG/FG consumption.
 * The database function is the authority at save time. This module is the
 * same maths for the button, the confirmation text, and the unit tests.
 * A reverted log stays on the roll. Reports skip it.
 */

import { userHasAnyRole } from '../assignedRoles.js';

export const REVERT_CONSUMPTION_ROLES = ['Admin', 'Production Manager', 'Plant Manager'];
export const REVERT_WINDOW_DAYS = 7;
export const REVERT_WINDOW_MS = REVERT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const REVERT_WINDOW_CLOSED = 'Revert window (7 days) has passed';

const STOCK_BALANCE_STATUSES = new Set([
  'in stock (rm)',
  'in stock',
  'in stock (sfg)',
  'in stock (wip)',
  'ready for dispatch',
  'available',
  'qc approved',
  'approved'
]);

const OUTPUT_MOVED_STATUSES = new Set([
  'fully consumed',
  'partially consumed',
  'consumed',
  'dispatched',
  'partially dispatched',
  'written off',
  'deleted',
  'void'
]);

export function roundKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function isRevertedConsumption(log) {
  if (!log || typeof log !== 'object') return false;
  if (String(log.status || '').trim().toLowerCase() === 'reverted') return true;
  if (log.reverted === true) return true;
  return Boolean(String(log.revertedAt || '').trim());
}

/** Kilograms this log took off the source lot. Older logs have no stockDeductedKg. */
export function consumptionStockKg(log) {
  if (!log || typeof log !== 'object') return 0;
  const hasDeducted = log.stockDeductedKg !== undefined && log.stockDeductedKg !== null && log.stockDeductedKg !== '';
  const raw = hasDeducted ? log.stockDeductedKg : log.consumedKg;
  return roundKg(raw);
}

export function consumptionInstant(log) {
  const timestamp = Date.parse(log?.timestamp || '');
  if (Number.isFinite(timestamp)) return timestamp;
  const day = Date.parse(log?.date || '');
  return Number.isFinite(day) ? day : null;
}

/** True through the instant that is exactly 7 days after the consumption. */
export function revertWindowOpen(log, now = Date.now()) {
  const at = consumptionInstant(log);
  if (at === null) return false;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) return false;
  return nowMs - at <= REVERT_WINDOW_MS;
}

export function canRevertConsumption(user) {
  return userHasAnyRole(user, REVERT_CONSUMPTION_ROLES);
}

export function outputBarcodesOf(log) {
  const rolls = [];
  if (Array.isArray(log?.outputRolls) && log.outputRolls.length > 0) rolls.push(...log.outputRolls);
  else if (log?.outputRoll && typeof log.outputRoll === 'object') rolls.push(log.outputRoll);
  const codes = [];
  rolls.forEach((roll) => {
    const code = String(roll?.barcode || roll?.barcodeId || '').trim();
    if (code && !codes.includes(code)) codes.push(code);
  });
  return codes;
}

export function substrateRollsOf(log) {
  const rolls = [];
  const push = (roll) => {
    if (!roll || typeof roll !== 'object') return;
    const barcode = String(roll.barcode || roll.barcodeId || '').trim();
    if (!barcode) return;
    const consumedKg = roundKg(roll.consumedKg ?? roll.consumedWeightKg);
    if (!(consumedKg > 0)) return;
    const initialKg = roundKg(roll.initialKg ?? roll.initialWeightKg ?? consumedKg);
    const balanceKg = roundKg(Math.max(0, initialKg - consumedKg));
    rolls.push({
      barcode,
      consumedKg,
      initialKg,
      balanceKg,
      balanceBarcode: balanceKg > 0 ? `${barcode}-BAL` : ''
    });
  };
  if (Array.isArray(log?.substrate2Rolls) && log.substrate2Rolls.length > 0) log.substrate2Rolls.forEach(push);
  else push(log?.substrate2);
  if (Array.isArray(log?.substrate3Rolls) && log.substrate3Rolls.length > 0) log.substrate3Rolls.forEach(push);
  else push(log?.substrate3);
  return rolls;
}

function scrapLines(log) {
  const scrap = log?.scrapBreakdown || {};
  const stage = String(log?.targetProcess || '');
  const lines = [];
  const add = (field, label, kg) => {
    const amount = roundKg(kg);
    if (amount > 0) lines.push({ field, label, kg: amount });
  };
  if (stage === 'Lamination (Pass 1)') {
    add('laminationPlainSubstrateWastageKg', 'lamination plain substrate wastage', scrap.laminationPlainSubstrateWastageKg);
    add('laminateWastageKg', 'laminate wastage', scrap.laminateWastageKg);
    add('adhesiveConsumedL1Kg', 'pass 1 adhesive', scrap.adhesiveConsumedL1Kg);
  } else if (stage === 'Lamination (Pass 2)') {
    add('laminationPlainSubstrateWastageL2Kg', 'lamination plain substrate wastage (pass 2)', scrap.laminationPlainSubstrateWastageL2Kg);
    add('laminateWastageKg', 'laminate wastage', scrap.laminateWastageKg);
    add('adhesiveConsumedL2Kg', 'pass 2 adhesive', scrap.adhesiveConsumedL2Kg);
  } else if (stage === 'Printing (Pass 2)') {
    add('printingPlainSettingWastageKg', 'printing plain setting wastage', scrap.printingPlainSettingWastageKg);
    add('printingWastageKg', 'printing wastage', scrap.printingWastageKg);
  } else if (stage === 'Slitting & Rewinding') {
    add('trimWastageKg', 'slitting trim', scrap.slittingTrimScrapKg);
    add('slittingSettingWastageKg', 'slitting setting wastage', scrap.slittingSettingWastageKg);
  } else if (stage === 'Pouching / Bag Making') {
    add('pouchingScrapKg', 'pouching scrap', scrap.pouchingScrapKg);
    add('zipperConsumedKg', 'zipper', scrap.zipperConsumedKg);
  }
  return lines;
}

function outputNetKg(log) {
  const rolls = [];
  if (Array.isArray(log?.outputRolls) && log.outputRolls.length > 0) rolls.push(...log.outputRolls);
  else if (log?.outputRoll) rolls.push(log.outputRoll);
  return roundKg(rolls.reduce((sum, roll) => sum + (Number(roll?.netWeightKg) || 0), 0));
}

function isFinishedSource(source = {}, log = {}) {
  const batch = String(source.sfgBatchCode || log.sfgBatchCode || '');
  const described = `${source.sfgType || ''} ${source.category || ''}`.toLowerCase();
  if (/^sfg-/i.test(batch)) return false;
  if (/semi[-\s]?finished/.test(described) && !/^fg-/i.test(batch)) return false;
  return /^fg-/i.test(batch) || source.rollType === 'FG' || (/finished goods/.test(described) && !/semi/.test(described));
}

export function restoredSourceBalances(source, log) {
  const restoredKg = consumptionStockKg(log);
  const consumedBefore = roundKg(source?.consumedKg);
  const availableBefore = roundKg(source?.availableKg);
  const consumedAfter = roundKg(Math.max(0, consumedBefore - restoredKg));
  const availableAfter = roundKg(availableBefore + restoredKg);
  let statusAfter = source?.status || 'In Stock (WIP)';
  if (consumedAfter <= 0) statusAfter = isFinishedSource(source, log) ? 'Ready for Dispatch' : 'In Stock (WIP)';
  else if (availableAfter <= 0) statusAfter = 'Fully Consumed';
  else statusAfter = 'Partially Consumed';
  return { restoredKg, consumedBefore, availableBefore, consumedAfter, availableAfter, statusAfter };
}

function laterUseOf(code, snapshot) {
  const wanted = String(code || '').trim().toLowerCase();
  if (!wanted) return null;
  const logs = Array.isArray(snapshot?.allLogs) ? snapshot.allLogs : [];
  return logs.find((log) => {
    if (!log || isRevertedConsumption(log)) return false;
    if (String(log.id || '') === String(snapshot?.log?.id || '')) return false;
    return String(log.sfgBatchCode || log.barcode || '').trim().toLowerCase() === wanted
      && consumptionStockKg(log) > 0;
  }) || null;
}

/**
 * @returns {{ ok: boolean, blocks: string[], restoredKg: number, source: object, substrates: object[], outputs: object[], scrap: object[], lines: string[] }}
 */
export function assessConsumptionRevert(snapshot = {}) {
  const log = snapshot.log || {};
  const blocks = [];
  if (snapshot.actor && !canRevertConsumption(snapshot.actor)) {
    blocks.push('Only Admin, Plant Manager, and Production Manager can revert a consumption.');
  }
  if (isRevertedConsumption(log)) {
    blocks.push('This consumption has already been reverted.');
  }
  const restored = restoredSourceBalances(snapshot.source || {}, log);
  if (!(restored.restoredKg > 0)) {
    blocks.push('This entry did not remove stock, so there is nothing to revert.');
  }
  if (!revertWindowOpen(log, snapshot.now ?? Date.now())) {
    blocks.push(consumptionInstant(log) === null
      ? 'This consumption has no timestamp, so it cannot be reverted.'
      : `${REVERT_WINDOW_CLOSED}.`);
  }
  if (snapshot.apply && !String(snapshot.reason || '').trim()) {
    blocks.push('A reason is required to revert a consumption.');
  }

  const outputs = outputBarcodesOf(log).map((barcode) => {
    const row = (snapshot.outputs || []).find((item) => String(item.barcode || item.sfgBatchCode || '').trim() === barcode) || { barcode };
    return { ...row, barcode };
  });
  outputs.forEach((output) => {
    const code = output.barcode;
    const consumed = roundKg(output.consumedKg);
    const dispatched = roundKg(output.dispatchedKg);
    const status = String(output.status || '').trim().toLowerCase();
    const later = laterUseOf(code, snapshot);
    if (consumed > 0 || later) {
      const where = later?.targetProcess ? ` (${later.targetProcess})` : '';
      blocks.push(`Output roll ${code} has already been consumed${where}. Revert that consumption first.`);
    } else if (dispatched > 0 || status === 'dispatched' || status === 'partially dispatched') {
      blocks.push(`Output roll ${code} has been dispatched. Reverse that dispatch before reverting this consumption.`);
    } else if (output.packingListId) {
      blocks.push(`Output roll ${code} is on packing list ${output.packingListId}. Revert that packing consumption first.`);
    } else if (status && OUTPUT_MOVED_STATUSES.has(status)) {
      blocks.push(`Output roll ${code} is ${output.status}. Revert that later step first.`);
    } else if (status && !STOCK_BALANCE_STATUSES.has(status) && status !== 'reverted') {
      blocks.push(`Output roll ${code} is ${output.status}. Revert that later step before this consumption.`);
    }
  });

  const substrates = substrateRollsOf(log).map((roll) => {
    const live = (snapshot.substrates || []).find((item) => String(item.barcode || '').trim() === roll.barcode) || {};
    return { ...roll, ...live, barcode: roll.barcode, consumedKg: roll.consumedKg, initialKg: roll.initialKg, balanceKg: roll.balanceKg, balanceBarcode: roll.balanceBarcode };
  });
  substrates.forEach((roll) => {
    const parentAvailable = roundKg(roll.parentAvailableKg ?? roll.availableWeightKg ?? 0);
    if (parentAvailable > 0.02) {
      blocks.push(`Substrate roll ${roll.barcode} is no longer fully issued (available ${parentAvailable.toFixed(2)} kg). Revert the later movement first.`);
    }
    if (!roll.balanceBarcode) return;
    const later = laterUseOf(roll.balanceBarcode, snapshot);
    const balanceKnown = roll.balanceAvailableKg !== undefined && roll.balanceAvailableKg !== null && roll.balanceAvailableKg !== '';
    const balanceAvailable = roundKg(roll.balanceAvailableKg);
    const balanceNet = roundKg(roll.balanceNetKg ?? (balanceKnown ? roll.balanceKg : 0));
    const balanceStatus = String(roll.balanceStatus || '').trim().toLowerCase();
    if (later || (balanceKnown && balanceNet > 0 && balanceAvailable + 0.02 < balanceNet) || (balanceStatus && !STOCK_BALANCE_STATUSES.has(balanceStatus))) {
      blocks.push(`Balance roll ${roll.balanceBarcode} from substrate ${roll.barcode} has already moved. Revert that later use first.`);
    }
  });

  (snapshot.qcHolds || []).forEach((hold) => {
    const approved = roundKg(hold.approvedKg);
    const scrapped = roundKg(hold.scrappedKg);
    const remaining = roundKg(hold.remainingHoldKg);
    const total = roundKg(hold.totalHoldKg);
    const status = String(hold.status || 'QC_HOLD').toUpperCase();
    if (approved > 0 || scrapped > 0 || (total > 0 && remaining + 0.02 < total) || (status && status !== 'QC_HOLD')) {
      blocks.push(`QC hold ${hold.id || hold.barcodeId || ''} from this consumption has already been approved or scrapped. Clear that hold movement before reverting.`);
    }
  });

  const packing = snapshot.packing || null;
  if (packing?.id) {
    const status = String(packing.status || packing.packingStatus || 'Open');
    const packed = roundKg(packing.packedNetKg ?? packing.totalNetWeightKg);
    const items = Number(packing.itemCount ?? (Array.isArray(packing.items) ? packing.items.length : 0)) || 0;
    if (status !== 'Open' || packed > 0 || items > 0) {
      blocks.push(`This consumption is on packing list ${packing.packingListId || packing.id}, which has already moved on. Revert that packing list first.`);
    }
  }

  const scrap = scrapLines(log);
  const batch = String(snapshot.source?.sfgBatchCode || log.sfgBatchCode || '').trim();
  const lines = [];
  if (restored.restoredKg > 0 && batch) {
    lines.push(`Return ${restored.restoredKg.toFixed(2)} kg to ${batch} (available ${restored.availableBefore.toFixed(2)} kg → ${restored.availableAfter.toFixed(2)} kg).`);
  }
  substrates.forEach((roll) => {
    const balance = roll.balanceBarcode ? ` Remove balance roll ${roll.balanceBarcode} (${roll.balanceKg.toFixed(2)} kg).` : '';
    lines.push(`Return substrate ${roll.barcode} to ${roll.initialKg.toFixed(2)} kg available and add ${roll.consumedKg.toFixed(2)} kg back to its raw-material stock.${balance}`);
  });
  outputs.forEach((output) => {
    const net = roundKg(output.totalNetKg ?? output.netWeightKg ?? outputNetKg(log));
    lines.push(`Remove output roll ${output.barcode}${net > 0 ? ` (${net.toFixed(2)} kg)` : ''}.`);
  });
  scrap.forEach((row) => {
    lines.push(`Remove ${row.kg.toFixed(2)} kg of ${row.label} from the job.`);
  });
  (snapshot.qcHolds || []).forEach((hold) => {
    if (roundKg(hold.approvedKg) || roundKg(hold.scrappedKg)) return;
    lines.push(`Remove QC hold ${hold.id || hold.barcodeId} (${roundKg(hold.totalHoldKg).toFixed(2)} kg).`);
  });
  if (packing?.id && String(packing.status || packing.packingStatus || 'Open') === 'Open') {
    lines.push(`Remove this consumption from open packing list ${packing.packingListId || packing.id}.`);
  }

  return {
    ok: blocks.length === 0,
    blocks,
    restoredKg: restored.restoredKg,
    source: { barcode: batch, ...restored },
    substrates,
    outputs,
    scrap,
    outputNetKg: outputNetKg(log),
    lines
  };
}
