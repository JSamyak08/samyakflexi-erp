/**
 * Checked Supabase writes.
 * A failed write must not be presented as saved. When an earlier row in the
 * same action did save, the message names exactly what did not.
 */

import { describeSaveError } from './businessRecords.js';

export class PartialSaveError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PartialSaveError';
    this.completed = details.completed || '';
    this.failed = details.failed || [];
  }
}

export function unsavedItemsMessage({ completed, failed }) {
  const lines = (failed || []).map((item) => {
    const reason = describeSaveError(item.error);
    return `• ${item.label} was NOT saved (${reason}).`;
  });
  return [
    completed,
    'These were NOT saved. They are not shown as saved. Retry the failed save:',
    ...lines
  ].filter((line) => line !== undefined && line !== null && line !== '').join('\n');
}

/**
 * Run a write, and if it throws or returns a Supabase `{ error }`, try again.
 * The last error is thrown. A successful call returns the write result.
 */
export const WRITE_ATTEMPTS = 2;

export async function writeWithRetry(writeFn, { attempts = WRITE_ATTEMPTS } = {}) {
  const tries = Math.max(1, Number(attempts) || 1);
  let lastError = null;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const result = await writeFn();
      if (result && result.error) {
        lastError = result.error;
        continue;
      }
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(describeSaveError(lastError));
}

export function applyCommittedByIndex(original, committedByIndex) {
  const rows = Array.isArray(original) ? original : [];
  if (!committedByIndex || committedByIndex.size === 0) return rows.slice();
  return rows.map((row, index) => (committedByIndex.has(index) ? committedByIndex.get(index) : row));
}

export function mergeCommitted(...maps) {
  const merged = new Map();
  maps.forEach((map) => {
    if (!map) return;
    map.forEach((value, key) => merged.set(key, value));
  });
  return merged;
}

/**
 * Save planned row updates in order. A failed row is left out of `committed`
 * and blocks a later update of the same index, so a second deduction is not
 * stored on top of a deduction that never landed.
 */
export async function commitSequentialUpdates(updates, saveFn, { attempts = WRITE_ATTEMPTS } = {}) {
  const committed = new Map();
  const failed = [];
  const blocked = new Set();
  for (const update of updates || []) {
    const index = update.index;
    if (blocked.has(index)) {
      failed.push({
        label: update.label,
        error: new Error('Skipped because an earlier save for this record failed'),
        update
      });
      continue;
    }
    try {
      await writeWithRetry(() => saveFn(update.after), { attempts });
      committed.set(index, update.after);
    } catch (error) {
      blocked.add(index);
      failed.push({ label: update.label, error, update });
    }
  }
  return { committed, failed };
}

export function assertAllSaved(completed, failed) {
  if (!failed || failed.length === 0) return;
  throw new PartialSaveError(unsavedItemsMessage({ completed, failed }), { completed, failed });
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function withDispatchHistory(current, shipment, weightKg) {
  const updatedHistory = Array.isArray(current.consumptionHistory) ? [...current.consumptionHistory] : [];
  updatedHistory.push({
    date: shipment.dispatchDate || new Date().toISOString(),
    type: 'DISPATCH',
    dispatchId: shipment.dispatchId || shipment.id,
    weightKg,
    vehicleNo: shipment.vehicleNo || '',
    note: `Dispatched ${weightKg} kg in Packing List ${shipment.dispatchId || shipment.id}`
  });
  return updatedHistory;
}

function deductSfg(current, shipment, weightKg) {
  const prevDispatched = Number(current.dispatchedKg) || 0;
  const newDispatched = round2(prevDispatched + weightKg);
  const totalNet = Number(current.totalNetKg) || 0;
  const newAvailable = Math.max(0, round2(totalNet - newDispatched));
  const newStatus = newAvailable <= 0.05 ? 'Dispatched' : 'Partially Dispatched';
  return {
    ...current,
    availableKg: newAvailable,
    dispatchedKg: newDispatched,
    status: newStatus,
    consumptionHistory: withDispatchHistory(current, shipment, weightKg)
  };
}

function isFinishedGood(row) {
  return row.rollType === 'FG'
    || (row.sfgType || '').includes('Finished')
    || (row.category || '').includes('Finished')
    || (row.sfgBatchCode || '').startsWith('FG-');
}

/**
 * Plan the SFG / FG balance rows a packing list should reduce.
 * The returned `after` rows are what to write. Nothing here changes the screen.
 */
export function planDispatchSfgDeductions(sfgGoods, shipment) {
  const source = Array.isArray(sfgGoods) ? sfgGoods : [];
  const shipmentItems = Array.isArray(shipment?.items) ? shipment.items : [];
  const totalDispatchNetKg = Number(shipment?.totalNetWeightKg)
    || shipmentItems.reduce((sum, item) => sum + (Number(item.netWeightKg) || 0), 0);
  const shipJobName = (shipment?.jobName || '').trim().toLowerCase();
  const shipOrderId = shipment?.orderId;
  const working = source.map((row) => ({ ...row }));
  const updates = [];
  let remainingNetToDeduct = totalDispatchNetKg;

  for (const item of shipmentItems) {
    const targetBarcode = (item.sourceFgBarcode || item.barcodeId || '').trim();
    const targetId = (item.sourceFgId || '').trim();
    const itemNetKg = Number(item.netWeightKg) || 0;
    if (itemNetKg <= 0) continue;

    const foundIdx = working.findIndex((row) => (
      (targetId && (row.id === targetId || row.sfgBatchCode === targetId))
      || (targetBarcode && (row.sfgBatchCode === targetBarcode || row.id === targetBarcode))
    ));
    if (foundIdx < 0) continue;

    const after = deductSfg(working[foundIdx], shipment, itemNetKg);
    working[foundIdx] = after;
    remainingNetToDeduct = Math.max(0, remainingNetToDeduct - itemNetKg);
    updates.push({
      index: foundIdx,
      before: source[foundIdx],
      after,
      label: `SFG balance for ${after.sfgBatchCode || after.id} (reduce available stock by ${itemNetKg} kg)`
    });
  }

  if (remainingNetToDeduct > 0.01) {
    for (let index = 0; index < working.length && remainingNetToDeduct > 0.01; index += 1) {
      const row = working[index];
      const isJobMatch = (shipJobName && (row.jobName || '').trim().toLowerCase() === shipJobName)
        || (shipOrderId && String(row.orderId) === String(shipOrderId));
      const available = Number(row.availableKg) || 0;
      if (!isJobMatch || !isFinishedGood(row) || available <= 0) continue;

      const deductKg = Math.min(available, remainingNetToDeduct);
      const after = deductSfg(row, shipment, deductKg);
      working[index] = after;
      remainingNetToDeduct = Math.max(0, remainingNetToDeduct - deductKg);
      updates.push({
        index,
        before: source[index],
        after,
        label: `SFG balance for ${after.sfgBatchCode || after.id} (reduce available stock by ${deductKg} kg)`
      });
    }
  }

  return { updates, remainingNetToDeduct, totalDispatchNetKg };
}

function isInventoryFinishedGood(row) {
  return row.rollType === 'FINISHED_GOODS'
    || row.rollType === 'FG'
    || (row.sfgType || '').includes('Finished')
    || (row.barcodeId || '').startsWith('FG-');
}

/**
 * Plan inventory-roll balance changes for a packing list.
 * Barcode matches do not consume the leftover job-level weight, matching the
 * previous screen calculation.
 */
export function planDispatchRollDeductions(rolls, shipment) {
  const source = Array.isArray(rolls) ? rolls : [];
  const shipmentItems = Array.isArray(shipment?.items) ? shipment.items : [];
  const totalDispatchNetKg = Number(shipment?.totalNetWeightKg)
    || shipmentItems.reduce((sum, item) => sum + (Number(item.netWeightKg) || 0), 0);
  const shipJobName = (shipment?.jobName || '').trim().toLowerCase();
  const shipOrderId = shipment?.orderId;
  let remainingToDeduct = totalDispatchNetKg;
  const updates = [];

  source.forEach((roll, index) => {
    const itemMatch = shipmentItems.find((item) => (
      (item.barcodeId && (roll.barcodeId === item.barcodeId || roll.id === item.barcodeId))
      || (item.sourceFgBarcode && (roll.barcodeId === item.sourceFgBarcode || roll.id === item.sourceFgBarcode))
    ));

    if (itemMatch) {
      const weightKg = Number(itemMatch.netWeightKg) || 0;
      const prevDispatched = Number(roll.dispatchedKg) || 0;
      const newDispatched = round2(prevDispatched + weightKg);
      const netWeight = Number(roll.netWeightKg) || 0;
      const newAvailable = Math.max(0, round2(netWeight - newDispatched));
      updates.push({
        index,
        before: roll,
        after: {
          ...roll,
          availableWeightKg: newAvailable,
          dispatchedKg: newDispatched,
          status: newAvailable <= 0.05 ? 'Dispatched' : 'Partially Dispatched'
        },
        label: `inventory roll ${roll.barcodeId || roll.id} (reduce available stock by ${weightKg} kg)`
      });
      return;
    }

    const isJobMatch = (shipJobName && (roll.jobName || '').trim().toLowerCase() === shipJobName)
      || (shipOrderId && String(roll.orderId) === String(shipOrderId));
    const available = Number(roll.availableWeightKg ?? roll.netWeightKg) || 0;
    if (isJobMatch && isInventoryFinishedGood(roll) && available > 0 && remainingToDeduct > 0.01) {
      const weightKg = Math.min(available, remainingToDeduct);
      remainingToDeduct -= weightKg;
      const prevDispatched = Number(roll.dispatchedKg) || 0;
      const newDispatched = round2(prevDispatched + weightKg);
      const netWeight = Number(roll.netWeightKg) || 0;
      const newAvailable = Math.max(0, round2(netWeight - newDispatched));
      updates.push({
        index,
        before: roll,
        after: {
          ...roll,
          availableWeightKg: newAvailable,
          dispatchedKg: newDispatched,
          status: newAvailable <= 0.05 ? 'Dispatched' : 'Partially Dispatched'
        },
        label: `inventory roll ${roll.barcodeId || roll.id} (reduce available stock by ${weightKg} kg)`
      });
    }
  });

  return { updates, totalDispatchNetKg };
}
