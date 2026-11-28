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
    action: 'updated',
    reason: reasonText,
    systemQtyKg: systemKg,
    countedQtyKg: counted,
    itemKgBefore: itemKg,
    itemKgAfter: roundStockKg(itemKg + diff) || 0,
    rollKgBefore: roll ? systemKg : itemKg,
    rollKgAfter: roll ? counted : (roundStockKg(itemKg + diff) || 0),
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

export function addedRollCorrectionType(kg, barcode, unit = 'kg') {
  return `${STOCK_CORRECTION_PREFIX} excess (+${formatStockKg(kg)} ${unit || 'kg'}), new roll ${barcode}`;
}

export function removedRollCorrectionType(kg, barcode, unit = 'kg') {
  return `${STOCK_CORRECTION_PREFIX} short (−${formatStockKg(kg)} ${unit || 'kg'}), roll ${barcode} removed`;
}

export const CORRECTION_ACTION_LABELS = {
  updated: 'Updated',
  added: 'Added roll',
  removed: 'Removed roll',
  legacy: 'Legacy adjustment'
};

export function classifyStockCorrection(row) {
  const stored = String(row?.action || '').trim().toLowerCase();
  const type = String(row?.type || '');
  if (stored === 'added' || /new roll\s+/i.test(type)) return 'added';
  if (stored === 'removed' || /removed\s*$/i.test(type)) return 'removed';
  if (stored === 'updated' || isStockCountCorrection(row)) return 'updated';
  return 'legacy';
}

export function correctionActionLabel(row) {
  return CORRECTION_ACTION_LABELS[classifyStockCorrection(row)] || CORRECTION_ACTION_LABELS.legacy;
}

/** A roll already issued to a job cannot be written off from the count. */
export function rollRemovalBlock(roll) {
  if (!roll) return 'Choose the roll that is missing.';
  const status = String(roll.status || '').trim();
  if (/^issued to /i.test(status)) {
    return `This roll is ${status}. Return it from the job before removing it from the count.`;
  }
  if (/pending qc/i.test(status) || /qc hold/i.test(status)) {
    return `This roll is ${status || 'in QC'} and cannot be removed from the count.`;
  }
  if (CLOSED_ROLL.test(status)) return 'This roll is already closed.';
  if (!(rollOnHandKg(roll) > 0)) return 'This roll has no available kilograms to remove.';
  if (!rollBarcode(roll)) return 'This roll has no barcode.';
  return '';
}

function correctionStamp(now) {
  const when = now instanceof Date ? now : new Date(now || Date.now());
  const stamp = Number.isFinite(when.getTime()) ? when.getTime() : Date.now();
  return { when, stamp };
}

function filmSpecs(item) {
  return {
    filmType: item?.filmType || '',
    category: item?.category || 'Film Substrates',
    itemName: item?.itemName || '',
    itemCode: item?.itemCode || item?.id || ''
  };
}

/**
 * Excess film with no barcode becomes a new RM-BC roll.
 * The item total increases by the same kilograms.
 */
export function planAddFilmRoll({
  item,
  kg,
  micron,
  widthMm,
  lengthMeters,
  reason = '',
  barcode = '',
  adjustedBy = '',
  now = new Date()
} = {}) {
  const errors = [];
  const reasonText = String(reason || '').trim();
  if (!reasonText) errors.push('Enter a reason for this stock count correction.');
  if (!isFilmStockItem(item)) errors.push('A new roll barcode can be added for a film item.');
  const countedBlank = kg === undefined || kg === null || String(kg).trim() === '';
  const counted = countedBlank ? null : roundStockKg(kg);
  if (countedBlank || counted == null) errors.push('Enter the kilograms on the new roll.');
  else if (counted <= 0) errors.push('The new roll must be more than 0 kg.');
  const mic = Number(micron);
  const width = Number(widthMm);
  if (!(mic > 0)) errors.push('Enter the micron.');
  if (!(width > 0)) errors.push('Enter the width in mm.');
  const code = String(barcode || '').trim();
  if (!/^RM-BC-/i.test(code)) errors.push('A new RM-BC barcode is required.');
  const lengthNumber = Number(lengthMeters);
  const length = Number.isFinite(lengthNumber) && lengthNumber > 0 ? Math.round(lengthNumber) : null;

  const owner = ownerRow(item, item?.primaryId || item?.id);
  const ownerKg = roundStockKg(owner?.availableQtyKg) || 0;
  const itemKg = roundStockKg(item?.availableQtyKg) || 0;
  const nextOwnerKg = counted == null ? null : roundStockKg(ownerKg + counted);
  const nextItemKg = counted == null ? null : roundStockKg(itemKg + counted);
  const base = {
    ok: false,
    errors,
    countedKg: counted,
    diffKg: counted,
    systemKg: 0,
    summary: counted == null ? '' : `System stock 0.00 kg, Counted ${formatStockKg(counted)} kg, Difference: Excess by ${formatStockKg(counted)} kg (will be added)`,
    owner,
    barcode: code
  };
  if (errors.length || counted == null || counted <= 0 || nextOwnerKg == null) return base;

  const { when, stamp } = correctionStamp(now);
  const specs = filmSpecs(owner || item);
  const adjustment = {
    id: `ADJ-${stamp}`,
    action: 'added',
    itemId: String(owner?.id || item?.id || ''),
    itemCode: specs.itemCode,
    itemName: specs.itemName,
    category: specs.category,
    filmType: specs.filmType,
    micron: mic,
    widthMm: width,
    lengthMeters: length,
    date: when.toISOString(),
    type: addedRollCorrectionType(counted, code, 'kg'),
    qtyKg: counted,
    barcode: code,
    reason: reasonText,
    systemQtyKg: 0,
    countedQtyKg: counted,
    itemKgBefore: itemKg,
    itemKgAfter: nextItemKg,
    rollKgBefore: 0,
    rollKgAfter: counted,
    adjustedBy: String(adjustedBy || '').trim()
  };
  return {
    ...base,
    ok: true,
    errors: [],
    adjustment,
    targetItemId: adjustment.itemId,
    nextOwnerKg,
    nextItemKg,
    micron: mic,
    widthMm: width,
    lengthMeters: length
  };
}

/**
 * A missing roll is written off. The row stays, with no available kilograms.
 */
export function planRemoveFilmRoll({
  item,
  roll,
  reason = '',
  adjustedBy = '',
  now = new Date()
} = {}) {
  const errors = [];
  const reasonText = String(reason || '').trim();
  if (!reasonText) errors.push('Enter a reason for this stock count correction.');
  const block = rollRemovalBlock(roll);
  if (block) errors.push(block);
  const code = rollBarcode(roll);
  const systemKg = roll ? rollOnHandKg(roll) : 0;
  const owner = ownerRow(item, roll?.itemId || roll?.item_id || item?.id);
  const ownerKg = roundStockKg(owner?.availableQtyKg) || 0;
  const itemKg = roundStockKg(item?.availableQtyKg) || 0;
  const diff = systemKg > 0 ? -systemKg : null;
  const nextOwnerKg = diff == null ? null : roundStockKg(ownerKg + diff);
  const nextItemKg = diff == null ? null : roundStockKg(itemKg + diff);
  if (diff != null && nextOwnerKg != null && nextOwnerKg < -0.001) {
    errors.push(`Removing ${formatStockKg(systemKg)} kg is more than the available ${formatStockKg(ownerKg)} kg on ${owner?.itemCode || owner?.id || 'this stock item'}.`);
  }
  if (diff != null && nextItemKg != null && nextItemKg < -0.001) {
    errors.push(`Removing ${formatStockKg(systemKg)} kg is more than the item's available ${formatStockKg(itemKg)} kg.`);
  }
  const base = {
    ok: false,
    errors,
    roll,
    systemKg,
    countedKg: 0,
    diffKg: diff,
    summary: systemKg > 0
      ? `System stock ${formatStockKg(systemKg)} kg, Counted 0.00 kg, Difference: Short by ${formatStockKg(systemKg)} kg (will be reduced)`
      : '',
    owner
  };
  if (errors.length || diff == null || nextOwnerKg == null || nextOwnerKg < 0) return base;

  const { when, stamp } = correctionStamp(now);
  const specs = filmSpecs(owner || item);
  const adjustment = {
    id: `ADJ-${stamp}`,
    action: 'removed',
    itemId: String(owner?.id || roll?.itemId || item?.id || ''),
    itemCode: specs.itemCode,
    itemName: specs.itemName,
    category: specs.category || roll?.category || '',
    filmType: specs.filmType || roll?.filmType || '',
    micron: roll?.micron ?? owner?.micron,
    widthMm: roll?.widthMm ?? owner?.widthMm,
    date: when.toISOString(),
    type: removedRollCorrectionType(systemKg, code, 'kg'),
    qtyKg: diff,
    barcode: code,
    reason: reasonText,
    systemQtyKg: systemKg,
    countedQtyKg: 0,
    itemKgBefore: itemKg,
    itemKgAfter: nextItemKg,
    rollKgBefore: systemKg,
    rollKgAfter: 0,
    adjustedBy: String(adjustedBy || '').trim()
  };
  return {
    ...base,
    ok: true,
    errors: [],
    adjustment,
    targetItemId: adjustment.itemId,
    nextOwnerKg,
    nextItemKg
  };
}

function dayBound(value, end) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      end ? 23 : 0,
      end ? 59 : 0,
      end ? 59 : 0,
      end ? 999 : 0
    );
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function filterStockCorrections(rows, filters = {}) {
  const from = dayBound(filters.from, false);
  const to = dayBound(filters.to, true);
  const itemQuery = String(filters.item || '').trim().toLowerCase();
  const category = String(filters.category || '').trim().toLowerCase();
  const action = String(filters.action || 'all');
  const direction = String(filters.direction || 'all');
  const userQuery = String(filters.user || '').trim().toLowerCase();
  const barcodeQuery = String(filters.barcode || '').trim().toLowerCase();
  return (rows || []).filter((row) => {
    const when = new Date(row?.date || row?.created_at || 0);
    if (from && (!Number.isFinite(when.getTime()) || when < from)) return false;
    if (to && (!Number.isFinite(when.getTime()) || when > to)) return false;
    if (itemQuery) {
      const blob = `${row?.itemName || ''} ${row?.itemCode || ''} ${row?.itemId || ''}`.toLowerCase();
      if (!blob.includes(itemQuery)) return false;
    }
    if (category) {
      const blob = `${row?.category || ''} ${row?.filmType || ''}`.toLowerCase();
      if (!blob.includes(category)) return false;
    }
    if (action !== 'all' && classifyStockCorrection(row) !== action) return false;
    const qty = Number(row?.qtyKg) || 0;
    if (direction === 'short' && !(qty < 0)) return false;
    if (direction === 'excess' && !(qty > 0)) return false;
    if (userQuery && !String(row?.adjustedBy || '').toLowerCase().includes(userQuery)) return false;
    if (barcodeQuery && !String(row?.barcode || '').toLowerCase().includes(barcodeQuery)) return false;
    return true;
  }).sort((a, b) => new Date(b?.date || b?.created_at || 0) - new Date(a?.date || a?.created_at || 0));
}

export function correctionTotals(rows) {
  return (rows || []).reduce((totals, row) => {
    const qty = roundStockKg(row?.qtyKg) || 0;
    if (qty < 0) totals.shortKg = roundStockKg(totals.shortKg + Math.abs(qty)) || 0;
    if (qty > 0) totals.excessKg = roundStockKg(totals.excessKg + qty) || 0;
    return totals;
  }, { shortKg: 0, excessKg: 0 });
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function stockCorrectionsCsv(rows) {
  const header = [
    'Date', 'Item', 'Item code', 'Roll barcode', 'Action', 'System kg', 'Counted kg',
    'Difference kg', 'Reason', 'Done by', 'Item kg before', 'Item kg after',
    'Roll kg before', 'Roll kg after'
  ];
  const lines = (rows || []).map((row) => [
    row.date || '',
    row.itemName || '',
    row.itemCode || row.itemId || '',
    row.barcode || '',
    correctionActionLabel(row),
    row.systemQtyKg ?? '',
    row.countedQtyKg ?? '',
    row.qtyKg ?? '',
    row.reason || '',
    row.adjustedBy || '',
    row.itemKgBefore ?? '',
    row.itemKgAfter ?? '',
    row.rollKgBefore ?? '',
    row.rollKgAfter ?? ''
  ].map(csvCell).join(','));
  return [header.join(','), ...lines].join('\n');
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
