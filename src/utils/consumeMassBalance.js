/**
 * Mass balance for Consume Material for Process.
 *
 * Stages with an output section:
 *   balance kept = every input that stays in the product − stage scrap − net output.
 * A negative balance means output plus scrap is heavier than those inputs.
 * Confirmation stays blocked. There is no tolerance.
 *
 * Inputs that stay in the product, by stage:
 *   Lamination pass 1: printed film pulled from this lot, each substrate 2 roll's
 *     consumed kg (not the leftover that returns as a -BAL roll), and adhesive.
 *   Lamination pass 2: this lot, substrate 3 consumed kg, and pass-2 adhesive.
 *   Printing pass 2: this lot, plus ink solids that stay on the film.
 *     Solvent that evaporates is not an input.
 *   Slitting: this lot only. Trim and setting are scrap, not added mass.
 *   Pouching: this lot, plus zipper kilograms that stay in the pouch.
 * Adhesive, ink solids, and zipper are not scrap (see JOB_WASTAGE_FIELDS).
 *
 * The part of the balance that came from this lot returns to this lot.
 * Added film, adhesive, ink, and zipper are not written onto this lot.
 * Substrate leftovers stay on the -BAL roll (initial − consumed).
 *
 * Stages with no output section, including Dispatch Packing and QC Hold Store,
 * keep today's balance: available − consumed.
 *
 * Weights are rounded to 0.01 kg with the same round2 used for output rolls.
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

/**
 * Kilograms that join the primary lot inside the output.
 * Substrate kg is the consumed weight of the added rolls, not the full roll.
 */
export function consumeMassInputs({
  processName,
  primaryKg = 0,
  substrateKg = 0,
  adhesiveKg = 0,
  inkSolidsKg = 0,
  zipperKg = 0
} = {}) {
  const primary = round2(primaryKg);
  const name = String(processName || '');
  let added = 0;
  const lines = [{
    key: 'primary',
    label: name.startsWith('Lamination') ? 'Printed film' : 'Film',
    kg: primary
  }];
  if (name === 'Lamination (Pass 1)' || name === 'Lamination (Pass 2)') {
    const substrate = round2(kg(substrateKg));
    const adhesive = round2(kg(adhesiveKg));
    added = round2(substrate + adhesive);
    if (substrate > 0) {
      lines.push({
        key: 'substrate',
        label: name === 'Lamination (Pass 2)' ? 'Substrate 3' : 'Substrate 2',
        kg: substrate
      });
    }
    if (adhesive > 0) lines.push({ key: 'adhesive', label: 'Adhesive', kg: adhesive });
  } else if (name === 'Printing (Pass 2)') {
    const ink = round2(kg(inkSolidsKg));
    added = ink;
    if (ink > 0) lines.push({ key: 'ink', label: 'Ink solids', kg: ink });
  } else if (name === 'Pouching / Bag Making') {
    const zipper = round2(kg(zipperKg));
    added = zipper;
    if (zipper > 0) lines.push({ key: 'zipper', label: 'Zipper', kg: zipper });
  }
  return {
    lines,
    primaryKg: primary,
    addedInputKg: added,
    consumedKg: round2(primary + added)
  };
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
  outputNetKg = 0,
  addedInputKg = 0
} = {}) {
  const primary = round2(consumedKg);
  const added = round2(Math.max(0, Number(addedInputKg) || 0));
  const available = round2(availableKg);
  const outputStage = stageHasOutputSection(processName);

  if (!outputStage) {
    const lotAvailableKg = round2(Math.max(0, available - primary));
    return {
      mode: 'plain',
      consumedKg: primary,
      primaryConsumedKg: primary,
      addedInputKg: 0,
      scrapKg: 0,
      outputNetKg: 0,
      balanceKeptKg: null,
      lotKeptKg: null,
      unallocatedKg: 0,
      negative: false,
      lotAvailableKg,
      stockDeductedKg: primary,
      reasonRequired: false,
      toQcHold: false
    };
  }

  const scrap = round2(scrapKg);
  const output = round2(outputNetKg);
  const balanceKeptKg = round2(primary + added - scrap - output);
  const negative = balanceKeptKg < 0;
  const primaryPull = round2(Math.max(0, primary));
  const lotKeptKg = negative ? null : round2(Math.min(primaryPull, Math.max(0, balanceKeptKg)));
  const unallocatedKg = negative ? 0 : round2(Math.max(0, balanceKeptKg - primaryPull));
  const untouched = round2(Math.max(0, available - primaryPull));
  const stockDeductedKg = negative ? null : round2(primaryPull - lotKeptKg);
  const lotAvailableKg = negative ? null : round2(untouched + lotKeptKg);

  return {
    mode: 'output',
    consumedKg: round2(primary + added),
    primaryConsumedKg: primary,
    addedInputKg: added,
    scrapKg: scrap,
    outputNetKg: output,
    balanceKeptKg,
    lotKeptKg,
    unallocatedKg,
    negative,
    lotAvailableKg,
    stockDeductedKg,
    reasonRequired: balanceKeptKg > 0,
    toQcHold: false
  };
}

export function applyBalanceDisposition(balance, reason) {
  const kept = Number(balance?.lotKeptKg ?? balance?.balanceKeptKg) || 0;
  if (!balance || balance.mode !== 'output' || balance.negative || !(kept > 0)) {
    return balance;
  }
  if (reason !== BALANCE_REASON_QC_HOLD) {
    return { ...balance, toQcHold: false };
  }
  return {
    ...balance,
    toQcHold: true,
    lotAvailableKg: round2(Math.max(0, balance.lotAvailableKg - kept)),
    stockDeductedKg: round2(balance.stockDeductedKg + kept)
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
  const keptOnLot = Number(balance?.lotKeptKg ?? balance?.balanceKeptKg) || 0;
  if (balance?.mode === 'output' && keptOnLot > 0) {
    const where = balance.toQcHold ? 'sent to QC Hold' : 'kept on this lot';
    const detail = balanceReason === BALANCE_REASON_OTHER
      ? `${balanceReason}: ${String(balanceNote || '').trim()}`
      : balanceReason;
    parts.push(`Balance ${keptOnLot.toFixed(2)} kg ${where} (${detail}).`);
  }
  if (balance?.mode === 'output' && Number(balance.unallocatedKg) > 0) {
    parts.push(`${Number(balance.unallocatedKg).toFixed(2)} kg of added material was weighed above the output and scrap and was not added to this lot.`);
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
