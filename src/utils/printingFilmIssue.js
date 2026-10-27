/** Printing and lamination film issues for the raw-material stock ledger. */

export const PRINTING_FILM_SOURCE = 'printing-input-roll';
export const LAMINATION_FILM_SOURCE = 'lamination-substrate';

export function roundFilmKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function printingFilmIssueId(orderId, barcode) {
  return `print-film:${String(orderId || '').trim()}:${String(barcode || '').trim()}`;
}

export function laminationFilmIssueId(orderId, logId, barcode) {
  return `lam-film:${String(orderId || '').trim()}:${String(logId || '').trim()}:${String(barcode || '').trim()}`;
}

function filmToken(value) {
  return String(value || '').toLowerCase().replace(/film/g, '').replace(/\s+/g, '').trim();
}

function isFilmStock(item) {
  const category = String(item?.category || '');
  return category === 'Film Substrates' || category === 'Film' || category === 'Raw Material (RM)' || category === 'Lamination Films';
}

function sameFilmSpec(left, right) {
  const film = filmToken(left?.filmType);
  if (!film || film !== filmToken(right?.filmType)) return false;
  const leftMicron = finite(left?.micron);
  const rightMicron = finite(right?.micron);
  const leftWidth = finite(left?.widthMm);
  const rightWidth = finite(right?.widthMm);
  if (leftMicron !== null && rightMicron !== null && leftMicron !== rightMicron) return false;
  if (leftWidth !== null && rightWidth !== null && leftWidth !== rightWidth) return false;
  return true;
}

/**
 * The roll's own item, when that item is this film.
 * Otherwise the only film item with the same type, micron and width.
 * Several lots of the same film are left alone so a different roll is not consumed.
 */
export function resolveFilmStockItem(roll, inventoryItems) {
  const items = Array.isArray(inventoryItems) ? inventoryItems : [];
  const itemId = roll?.itemId || roll?.stockItemId || '';
  if (itemId) {
    const linked = items.find((item) => item && (item.id === itemId || item.itemCode === itemId));
    if (linked && isFilmStock(linked) && sameFilmSpec(linked, roll)) return linked;
  }
  const matches = items.filter((item) => item && isFilmStock(item) && sameFilmSpec(item, roll));
  return matches.length === 1 ? matches[0] : null;
}

function filmLine({
  id,
  source,
  orderId,
  jobName,
  roll,
  consumed,
  balance,
  stockItemId,
  appliedStockQtyKg,
  logId,
  stage
}) {
  const barcode = String(roll.barcodeId || roll.barcode || '').trim();
  return {
    id,
    ledgerSource: source,
    orderId: orderId || '',
    jobName: jobName || '',
    logId: logId || '',
    stage: stage || '',
    category: 'Film Substrates',
    filmType: roll.filmType || '',
    micron: roll.micron ?? '',
    widthMm: roll.widthMm ?? '',
    itemName: `${roll.filmType || 'Film'} ${roll.micron ?? ''}µ (${roll.widthMm ?? ''} mm)`.replace(/\s+/g, ' ').trim(),
    barcode,
    unit: 'Kg',
    issueQtyKg: consumed,
    returnQtyKg: balance,
    netConsumedQtyKg: consumed,
    stockItemId: stockItemId || '',
    appliedStockQtyKg
  };
}

function isPrintingLineForOrder(material, orderId) {
  if (!material || material.ledgerSource !== PRINTING_FILM_SOURCE) return false;
  const prefix = `print-film:${String(orderId || '').trim()}:`;
  if (String(material.id || '').startsWith(prefix)) return true;
  return Boolean(orderId) && String(material.orderId || '') === String(orderId);
}

/**
 * One ledger line per input roll. The quantity is the consumed kg, not the
 * whole roll: the balance roll is the remainder and is not a second inward.
 * Parent available weight is set to 0 because that remainder lives on the BAL roll.
 * Calling this again with the same rolls does not deduct the stock item twice.
 */
export function planPrintingFilmIssue({
  orderId,
  jobName,
  inputRolls,
  existingMaterials,
  inventoryItems
} = {}) {
  const existing = Array.isArray(existingMaterials) ? existingMaterials : [];
  const previous = new Map();
  existing.forEach((material) => {
    if (isPrintingLineForOrder(material, orderId)) previous.set(material.id, material);
  });

  const lines = [];
  const rollUpdates = [];
  const inventoryAdjustments = [];
  const kept = new Set();

  (inputRolls || []).forEach((roll) => {
    const barcode = String(roll?.barcodeId || roll?.barcode || '').trim();
    const consumed = roundFilmKg(Math.max(0, finite(roll?.consumedWeightKg) || 0));
    if (!barcode || !(consumed > 0)) return;
    const initial = finite(roll?.initialWeightKg) ?? finite(roll?.netWeightKg) ?? consumed;
    const balance = roundFilmKg(Math.max(0, initial - consumed));
    const id = printingFilmIssueId(orderId, barcode);
    kept.add(id);
    const stock = resolveFilmStockItem(roll, inventoryItems);
    const prior = previous.get(id);
    const alreadyApplied = finite(prior?.appliedStockQtyKg) ?? 0;
    lines.push(filmLine({
      id,
      source: PRINTING_FILM_SOURCE,
      orderId,
      jobName,
      roll: { ...roll, barcodeId: barcode },
      consumed,
      balance,
      stockItemId: stock?.id || prior?.stockItemId || '',
      appliedStockQtyKg: consumed,
      stage: 'Printing'
    }));
    rollUpdates.push({
      barcodeId: barcode,
      availableWeightKg: 0,
      status: 'Issued to Printing'
    });
    if (stock) {
      const delta = roundFilmKg(consumed - alreadyApplied);
      if (delta !== 0) {
        inventoryAdjustments.push({ stockItemId: stock.id, deltaKg: delta, barcodeId: barcode });
      }
    }
  });

  previous.forEach((material, id) => {
    if (kept.has(id)) return;
    const alreadyApplied = finite(material.appliedStockQtyKg) ?? 0;
    if (material.stockItemId && alreadyApplied) {
      inventoryAdjustments.push({
        stockItemId: material.stockItemId,
        deltaKg: roundFilmKg(-alreadyApplied),
        barcodeId: material.barcode || ''
      });
    }
  });

  const materialsList = existing
    .filter((material) => !isPrintingLineForOrder(material, orderId))
    .concat(lines);

  return { materialsList, rollUpdates, inventoryAdjustments };
}

function isLaminationLineForLog(material, logId) {
  if (!material || material.ledgerSource !== LAMINATION_FILM_SOURCE) return false;
  return String(material.logId || '') === String(logId || '');
}

/**
 * One ledger line per substrate roll on this lamination run.
 * The same log id replaces its lines instead of adding them again.
 */
export function planLaminationFilmIssue({
  orderId,
  jobName,
  logId,
  stage,
  rolls,
  existingMaterials,
  inventoryItems
} = {}) {
  const existing = Array.isArray(existingMaterials) ? existingMaterials : [];
  const previous = new Map();
  existing.forEach((material) => {
    if (isLaminationLineForLog(material, logId)) previous.set(material.id, material);
  });

  const lines = [];
  const inventoryAdjustments = [];
  const kept = new Set();

  (rolls || []).forEach((roll) => {
    const barcode = String(roll?.barcode || roll?.barcodeId || '').trim();
    const consumed = roundFilmKg(Math.max(0, finite(roll?.consumedKg) ?? finite(roll?.consumedWeightKg) ?? 0));
    if (!barcode || !(consumed > 0)) return;
    const initial = finite(roll?.initialKg) ?? finite(roll?.initialWeightKg) ?? consumed;
    const balance = roundFilmKg(Math.max(0, initial - consumed));
    const id = laminationFilmIssueId(orderId, logId, barcode);
    kept.add(id);
    const stock = resolveFilmStockItem(roll, inventoryItems);
    const prior = previous.get(id);
    const alreadyApplied = finite(prior?.appliedStockQtyKg) ?? 0;
    lines.push(filmLine({
      id,
      source: LAMINATION_FILM_SOURCE,
      orderId,
      jobName,
      logId,
      stage,
      roll: { ...roll, barcodeId: barcode, filmType: roll.filmType, micron: roll.micron, widthMm: roll.widthMm },
      consumed,
      balance,
      stockItemId: stock?.id || prior?.stockItemId || '',
      appliedStockQtyKg: consumed
    }));
    if (stock) {
      const delta = roundFilmKg(consumed - alreadyApplied);
      if (delta !== 0) {
        inventoryAdjustments.push({ stockItemId: stock.id, deltaKg: delta, barcodeId: barcode });
      }
    }
  });

  const materialsList = existing
    .filter((material) => !isLaminationLineForLog(material, logId))
    .concat(lines);

  return { materialsList, inventoryAdjustments };
}

/**
 * Leftover substrate is a -BAL roll. The parent available weight becomes 0
 * so the remainder is not counted twice. A repeat of the same weights
 * writes the same BAL barcode and the same parent state.
 */
/** Substrate rolls on one lamination run, including extra substrate 2 and 3 rows. */
export function substrateRollsFromLog(logEntry) {
  const rolls = [];
  const push = (roll) => {
    if (!roll) return;
    const barcode = String(roll.barcode || roll.barcodeId || '').trim();
    if (!barcode) return;
    rolls.push({ ...roll, barcode, barcodeId: barcode });
  };
  if (Array.isArray(logEntry?.substrate2Rolls) && logEntry.substrate2Rolls.length > 0) {
    logEntry.substrate2Rolls.forEach(push);
  } else {
    push(logEntry?.substrate2);
  }
  if (Array.isArray(logEntry?.substrate3Rolls) && logEntry.substrate3Rolls.length > 0) {
    logEntry.substrate3Rolls.forEach(push);
  } else {
    push(logEntry?.substrate3);
  }
  return rolls;
}

export function planSubstrateBalanceRolls(rolls, { orderId, jobName, stage } = {}) {
  const balances = [];
  (rolls || []).forEach((roll) => {
    const barcode = String(roll?.barcode || roll?.barcodeId || '').trim();
    const consumed = roundFilmKg(Math.max(0, finite(roll?.consumedKg) ?? finite(roll?.consumedWeightKg) ?? 0));
    if (!barcode || !(consumed > 0)) return;
    const initial = finite(roll?.initialKg) ?? finite(roll?.initialWeightKg) ?? consumed;
    const balance = roundFilmKg(Math.max(0, initial - consumed));
    balances.push({
      parentBarcodeId: barcode,
      availableWeightKg: 0,
      status: 'Issued to Lamination',
      balanceKg: balance,
      balanceBarcodeId: balance > 0 ? `${barcode}-BAL` : '',
      filmType: roll.filmType || '',
      micron: roll.micron ?? null,
      widthMm: roll.widthMm ?? null,
      itemId: roll.itemId || '',
      orderId: orderId || '',
      jobName: jobName || '',
      stage: stage || ''
    });
  });
  return balances;
}
