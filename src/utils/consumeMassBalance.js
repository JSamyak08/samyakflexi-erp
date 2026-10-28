/**
 * Mass balance for Consume Material for Process.
 *
 * Stages with an output section (lamination, printing pass 2, slitting, pouching):
 *   balance kept = actual consumed − stage scrap/wastage − net of every output roll.
 * A positive balance stays on the same SFG lot. Output rolls are new stock.
 * Scrap kilograms stay on the production record and are written to sfg_scrap_items
 * by the existing wastage sync. They are not deducted a second time.
 *
 * Scrap counted here is process wastage only. Adhesive and zipper are consumables
 * added to the job (see JOB_WASTAGE_FIELDS) and are not taken off the consumed lot.
 * Slitting uses trim + setting once. slittingScrapKg is that same sum and is not added again.
 * Lamination counts plain-substrate scrap and laminate scrap. Printing counts plain
 * setting wastage and printing wastage.
 *
 * Stages with no output section, including Dispatch Packing and QC Hold Store,
 * keep today's balance: available − consumed.
 *
 * Weights are rounded to 0.01 kg with the same round2 used for output rolls.
 * There is no extra tolerance. A negative cent means output plus scrap exceeds
 * consumed, and confirmation is blocked.
 */

import { round2 } from './consumeRollEntries.js';

export const BALANCE_REASON_QC_HOLD = 'QC Hold / Issue';
export const BALANCE_REASON_KEEP = 'Extra quantity kept in stock';
export const BALANCE_REASON_OTHER = 'Other';

export const BALANCE_REASONS = [
  BALANCE_REASON_QC_HOLD,
  BALANCE_REASON_KEEP,
  BALANCE_REASON_OTHER
];

const OUTPUT_STAGES = new Set([
  'Lamination (Pass 1)',
  'Lamination (Pass 2)',
  'Printing (Pass 2)',
  'Slitting & Rewinding',
  'Pouching / Bag Making'
]);

export function stageHasOutputSection(processName) {
  return OUTPUT_STAGES.has(String(processName || ''));
}

function kg(value) {
  return Math.max(0, Number(value) || 0);
}

export function stageScrapKg(processName, scrap = {}) {
  switch (processName) {
    case 'Lamination (Pass 1)':
      return round2(kg(scrap.laminationPlainSubstrateWastageKg) + kg(scrap.laminateWastageKg));
    case 'Lamination (Pass 2)':
      return round2(kg(scrap.laminationPlainSubstrateWastageL2Kg) + kg(scrap.laminateWastageKg));
    case 'Printing (Pass 2)':
      return round2(kg(scrap.printingPlainSettingWastageKg) + kg(scrap.printingWastageKg));
    case 'Slitting & Rewinding':
      return round2(kg(scrap.slittingTrimScrapKg) + kg(scrap.slittingSettingWastageKg));
    case 'Pouching / Bag Making':
      return round2(kg(scrap.pouchingScrapKg));
    default:
      return 0;
  }
}

export function computeConsumeStockBalance({
  processName,
  consumedKg = 0,
  availableKg = 0,
  scrapKg = 0,
  outputNetKg = 0
} = {}) {
  const consumed = round2(consumedKg);
  const available = round2(availableKg);
  const outputStage = stageHasOutputSection(processName);

  if (!outputStage) {
    const lotAvailableKg = round2(Math.max(0, available - consumed));
    return {
      mode: 'plain',
      consumedKg: consumed,
      scrapKg: 0,
      outputNetKg: 0,
      balanceKeptKg: null,
      negative: false,
      lotAvailableKg,
      stockDeductedKg: consumed,
      reasonRequired: false,
      toQcHold: false
    };
  }

  const scrap = round2(scrapKg);
  const output = round2(outputNetKg);
  const balanceKeptKg = round2(consumed - scrap - output);
  const negative = balanceKeptKg < 0;
  const untouched = round2(Math.max(0, available - consumed));
  const stockDeductedKg = negative ? null : round2(scrap + output);
  const lotAvailableKg = negative ? null : round2(untouched + Math.max(0, balanceKeptKg));

  return {
    mode: 'output',
    consumedKg: consumed,
    scrapKg: scrap,
    outputNetKg: output,
    balanceKeptKg,
    negative,
    lotAvailableKg,
    stockDeductedKg,
    reasonRequired: balanceKeptKg > 0,
    toQcHold: false
  };
}

export function applyBalanceDisposition(balance, reason) {
  if (!balance || balance.mode !== 'output' || balance.negative || !(balance.balanceKeptKg > 0)) {
    return balance;
  }
  if (reason !== BALANCE_REASON_QC_HOLD) {
    return { ...balance, toQcHold: false };
  }
  return {
    ...balance,
    toQcHold: true,
    lotAvailableKg: round2(Math.max(0, balance.lotAvailableKg - balance.balanceKeptKg)),
    stockDeductedKg: round2(balance.stockDeductedKg + balance.balanceKeptKg)
  };
}

export function balanceSaveError(balance, { reason = '', note = '' } = {}) {
  if (!balance || balance.mode !== 'output') return '';
  if (balance.negative) {
    const over = round2(Math.abs(balance.balanceKeptKg));
    return `Output plus scrap exceeds the consumed weight by ${over.toFixed(2)} kg. Correct the weights before recording.`;
  }
  if (balance.reasonRequired && !BALANCE_REASONS.includes(reason)) {
    return 'Select a reason for the balance kept in stock.';
  }
  if (reason === BALANCE_REASON_OTHER && !String(note || '').trim()) {
    return 'Enter a note for the balance reason.';
  }
  return '';
}

export function composeConsumeNotes({
  targetProcess,
  holdReason = '',
  notes = '',
  balance,
  balanceReason = '',
  balanceNote = ''
} = {}) {
  if (targetProcess === 'QC Hold Store') return `QC Hold: ${holdReason}`;
  const parts = [];
  if (String(notes || '').trim()) parts.push(String(notes).trim());
  if (balance?.mode === 'output' && balance.balanceKeptKg > 0) {
    const where = balance.toQcHold ? 'sent to QC Hold' : 'kept on this lot';
    const detail = balanceReason === BALANCE_REASON_OTHER
      ? `${balanceReason}: ${String(balanceNote || '').trim()}`
      : balanceReason;
    parts.push(`Balance ${Number(balance.balanceKeptKg).toFixed(2)} kg ${where} (${detail}).`);
  }
  return parts.join(' ');
}

/**
 * Input-roll weights on a production record.
 * Older logs have no stockDeductedKg, so consumed + remaining is unchanged.
 * A mass-balance log deducts only the kilograms that left good stock.
 */
export function inputRollWeightsFromLog(log) {
  const processKg = parseFloat(log?.consumedKg) || 0;
  const hasDeducted = log && log.stockDeductedKg !== undefined && log.stockDeductedKg !== null && log.stockDeductedKg !== '';
  const deducted = hasDeducted ? (parseFloat(log.stockDeductedKg) || 0) : processKg;
  const remaining = parseFloat(log?.remainingBalanceKg) || 0;
  return {
    initialWeightKg: round2(deducted + remaining),
    consumedWeightKg: round2(deducted)
  };
}
