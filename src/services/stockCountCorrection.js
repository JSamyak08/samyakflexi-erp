/**
 * Stock count correction for the item ledger.
 *
 * The store weighs what is physically there and enters that weight.
 * The difference against system stock is a short (reduce) or an excess (add).
 * Kilograms are the stock unit. Metres and roll counts are not adjusted.
 */

export const STOCK_CORRECTION_ACTION = 'Stock Count Correction';
export const STOCK_CORRECTION_PREFIX = 'Stock correction:';

const CLOSED_ROLL = /void|written\s*off|deleted|reversed|rejected/i;

export function roundStockKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function formatStockKg(value) {
  const number = roundStockKg(value) || 0;
  return number.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function isStockCountCorrection(adjustment) {
  return String(adjustment?.type || '').startsWith(STOCK_CORRECTION_PREFIX);
}

export function correctionUnit(item) {
  const unit = String(item?.unit || 'kg').trim();
  if (!unit || /^kgs?$/i.test(unit)) return 'kg';
  return unit;
}

export function stockCorrectionType(diffKg, unit = 'kg') {
  const abs = formatStockKg(Math.abs(diffKg));
  const unitText = unit || 'kg';
  if (diffKg < 0) return `${STOCK_CORRECTION_PREFIX} short (−${abs} ${unitText})`;
  return `${STOCK_CORRECTION_PREFIX} excess (+${abs} ${unitText})`;
}

export function stockCorrectionSummary(systemKg, countedKg, unit = 'kg') {
  const system = roundStockKg(systemKg) || 0;
  const counted = roundStockKg(countedKg);
  if (counted == null) return '';
  const diff = roundStockKg(counted - system) || 0;
  const unitText = unit || 'kg';
  const base = `System stock ${formatStockKg(system)} ${unitText}, Counted ${formatStockKg(counted)} ${unitText}, Difference: `;
  if (Math.abs(diff) < 0.005) return `${base}none`;
  if (diff < 0) return `${base}Short by ${formatStockKg(Math.abs(diff))} ${unitText} (will be reduced)`;
  return `${base}Excess by ${formatStockKg(diff)} ${unitText} (will be added)`;
}

export function isFilmStockItem(item) {
  const category = String(item?.category || '');
  return category === 'Film Substrates' || category === 'Film' || category === 'Lamination Films';
}

export function rollOnHandKg(roll) {
  if (!roll || typeof roll !== 'object') return 0;
  if (roll.availableWeightKg !== undefined && roll.availableWeightKg !== null && roll.availableWeightKg !== '') {
    return roundStockKg(roll.availableWeightKg) || 0;
  }
  return roundStockKg(roll.netWeightKg) || 0;
}

export function rollBarcode(roll) {
  return String(roll?.barcodeId || roll?.barcode || roll?.id || '').trim();
}

export function isCountableStockRoll(roll) {
  if (!roll) return false;
  const code = rollBarcode(roll);
  if (!code) return false;
  const status = String(roll.status || '').trim();
  if (!status) return true;
  if (CLOSED_ROLL.test(status)) return false;
  if (/pending qc/i.test(status)) return false;
  if (/qc hold/i.test(status)) return false;
  if (/^issued to /i.test(status)) return false;
  return true;
}

/**
 * Inward kilograms a roll receipt should keep showing.
 * A stock count correction changes available kg, not the original receipt.
 * Older audit rows are left out so historical receipts stay as they were.
 */
export function rollReceiptKgAfterCorrections(roll, adjustments = []) {
  const available = rollOnHandKg(roll);
  const code = rollBarcode(roll).toLowerCase();
  const corrected = (adjustments || []).reduce((sum, row) => {
    if (!isStockCountCorrection(row)) return sum;
    if (String(row?.barcode || '').trim().toLowerCase() !== code) return sum;
    return sum + (Number(row.qtyKg) || 0);
  }, 0);
  return roundStockKg(available - corrected) || 0;
}

/**
 * Opening-plug ledger. A stale item total cancels the correction,
 * so the running balance must use the stock after the correction.
 */
export function ledgerBalanceAfterCount({ itemKg, priorNetMovement = 0, diffKg, staleItemKg = null } = {}) {
  const diff = roundStockKg(diffKg) || 0;
  const nextItem = roundStockKg((Number(itemKg) || 0) + diff) || 0;
  const target = staleItemKg == null ? nextItem : (roundStockKg(staleItemKg) || 0);
  const net = roundStockKg((Number(priorNetMovement) || 0) + diff) || 0;
  const opening = Math.max(0, roundStockKg(target - net) || 0);
  const running = roundStockKg(opening + net) || 0;
  return { openingKg: opening, runningKg: running, itemKg: nextItem };
}

function ownerRow(item, itemId) {
  const rows = Array.isArray(item?.subItems) && item.subItems.length ? item.subItems : [item];
  return rows.find((row) => String(row?.id) === String(itemId)) || rows[0] || item;
}

/**
 * Plan one correction. Films with in-stock rolls correct that roll and the
 * item total by the same kilograms. Items with no rolls correct the item total.
 */
export function planStockCountCorrection({
  item,
  rolls = [],
  barcode = '',
  countedKg,
  reason = '',
  adjustedBy = '',
  now = new Date()
} = {}) {
  const errors = [];
  const reasonText = String(reason || '').trim();
  if (!reasonText) errors.push('Enter a reason for this stock count correction.');

  const countedBlank = countedKg === undefined || countedKg === null || String(countedKg).trim() === '';
  const counted = countedBlank ? null : roundStockKg(countedKg);
  if (countedBlank || counted == null) errors.push('Enter the physical stock counted.');
  else if (counted < 0) errors.push('Counted stock cannot be negative.');

  const countable = (rolls || []).filter(isCountableStockRoll);
  const film = isFilmStockItem(item);
  const code = String(barcode || '').trim();
  let roll = null;
  if (film && countable.length > 0) {
    if (!code) errors.push('Choose the roll barcode that was counted.');
    else {
      roll = countable.find((row) => rollBarcode(row).toLowerCase() === code.toLowerCase()) || null;
      if (!roll) errors.push('That barcode is not an in-stock roll of this item.');
    }
  }

  const unit = correctionUnit(item);
  const itemKg = roundStockKg(item?.availableQtyKg) || 0;
  const systemKg = roll ? rollOnHandKg(roll) : itemKg;
  let diff = null;
  if (counted != null && counted >= 0 && errors.length === 0) {
    diff = roundStockKg(counted - systemKg) || 0;
    if (Math.abs(diff) < 0.005) {
      errors.push('Counted stock matches the system. Nothing to correct.');
    } else if (diff < 0) {
      const short = Math.abs(diff);
      if (short - systemKg > 0.001) {
        errors.push(`A shortfall of ${formatStockKg(short)} kg is more than the available ${formatStockKg(systemKg)} kg.`);
      }
      if (short - itemKg > 0.001) {
        errors.push(`A shortfall of ${formatStockKg(short)} kg is more than the item's available ${formatStockKg(itemKg)} kg.`);
      }
    }
  }

  const targetItemId = String((roll && (roll.itemId || roll.item_id)) || item?.id || '');
  const owner = ownerRow(item, targetItemId);
  const ownerKg = roundStockKg(owner?.availableQtyKg) || 0;
  const nextOwnerKg = diff == null ? null : roundStockKg(ownerKg + diff);
  if (diff != null && diff < 0 && nextOwnerKg != null && nextOwnerKg < -0.001) {
    errors.push(`A shortfall of ${formatStockKg(Math.abs(diff))} kg is more than the available ${formatStockKg(ownerKg)} kg on ${owner?.itemCode || owner?.id || 'this stock item'}.`);
  }

  const base = {
    ok: false,
    errors,
    systemKg,
    countedKg: counted,
    diffKg: diff,
    roll,
    itemKg,
    summary: counted == null ? '' : stockCorrectionSummary(systemKg, counted, unit),
    unit
  };
  if (errors.length || diff == null || Math.abs(diff) < 0.005 || nextOwnerKg == null || nextOwnerKg < 0) {
    return base;
  }

  const when = now instanceof Date ? now : new Date(now);
  const stamp = Number.isFinite(when.getTime()) ? when.getTime() : Date.now();
  const adjustment = {
    id: `ADJ-${stamp}`,
    itemId: String(owner?.id || targetItemId),
    itemCode: owner?.itemCode || owner?.id || item?.itemCode || item?.id || '',
    itemName: owner?.itemName || item?.itemName || '',
    category: owner?.category || item?.category || '',
    filmType: owner?.filmType || item?.filmType || '',
    micron: owner?.micron ?? item?.micron,
    widthMm: owner?.widthMm ?? item?.widthMm,
    date: when.toISOString(),
    type: stockCorrectionType(diff, unit),
    qtyKg: diff,
    barcode: roll ? rollBarcode(roll) : '',
    reason: reasonText,
    systemQtyKg: systemKg,
    countedQtyKg: counted,
    adjustedBy: String(adjustedBy || '').trim()
  };

  return {
    ...base,
    ok: true,
    errors: [],
    owner,
    targetItemId: adjustment.itemId,
    nextOwnerKg,
    nextItemKg: roundStockKg(itemKg + diff) || 0,
    nextRollKg: roll ? counted : null,
    adjustment
  };
}

/** Ledger columns for one correction. The kilograms appear once, in the correction column. */
export function reconciliationLedgerFields(adjustment) {
  const qty = roundStockKg(adjustment?.qtyKg) || 0;
  const correction = isStockCountCorrection(adjustment);
  return {
    category: 'reconciliation',
    type: adjustment?.type || stockCorrectionType(qty),
    inwardQtyKg: 0,
    outwardQtyKg: 0,
    adjQtyKg: qty,
    subRef: adjustment?.reason || adjustment?.type || STOCK_CORRECTION_ACTION,
    subParty: correction ? 'Stock count correction' : 'Physical Inventory Audit',
    notes: adjustment?.reason || (correction ? 'Stock count correction' : 'Physical stock count')
  };
}
