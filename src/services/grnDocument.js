/**
 * Pure helpers for a goods receipt that can hold more than one item.
 * A receipt with one line keeps the same names, weights, and barcode shape
 * the store screen already uses.
 */

import {
  filmReceiptNameConflict,
  planReceiptStockLink,
  resolveQcStockTarget
} from './inventoryIdentity.js';

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value) {
  return Number(asNumber(value, 0).toFixed(2));
}

export function rollBarcode({
  isFilm = true,
  grnCode = '',
  lineCount = 1,
  lineNo = 1,
  rollIndex = 1,
  rollCount = 1,
  singleBarcode = ''
}) {
  const prefix = isFilm ? 'RM-BC' : 'CON-BC';
  if (lineCount > 1) return `${prefix}-${grnCode}-L${lineNo}-R${rollIndex}`;
  if (rollCount > 1) return `${prefix}-${grnCode}-${rollIndex}`;
  return singleBarcode || `${prefix}-${grnCode}-1`;
}

export function summarizeReceiptLines(lines) {
  const usable = (Array.isArray(lines) ? lines : []).filter(Boolean);
  const first = usable[0] || {};
  const net = round2(usable.reduce((sum, line) => sum + asNumber(line.netWeightKg), 0));
  const gross = round2(usable.reduce((sum, line) => sum + asNumber(line.grossWeightKg), 0));
  const tare = round2(usable.reduce((sum, line) => sum + asNumber(line.tareWeightKg), 0));
  const rollCount = usable.reduce((sum, line) => {
    if (Array.isArray(line.rolls) && line.rolls.length > 0) return sum + line.rolls.length;
    return sum + asNumber(line.rollsReceived);
  }, 0);
  const itemName = usable.length > 1
    ? `${first.itemName || 'Item'} + ${usable.length - 1} more`
    : (first.itemName || 'Item');
  const packagingValues = [...new Set(usable.map((line) => line.packagingType || 'Roll'))];
  const itemsBreakdown = usable.flatMap((line, index) => (
    (Array.isArray(line.rolls) ? line.rolls : []).map((roll) => ({
      ...roll,
      lineNo: line.lineNo || index + 1,
      lineItemId: line.id || null
    }))
  ));

  return {
    itemName,
    category: first.category || 'Film Substrates',
    filmType: first.filmType || '',
    micron: first.micron !== undefined ? first.micron : '-',
    widthMm: first.widthMm !== undefined ? first.widthMm : '-',
    metallocenePct: first.metallocenePct || '',
    unit: first.unit || 'Kg',
    batchNo: first.batchNo || '',
    packagingType: usable.length > 1 && packagingValues.length > 1
      ? 'Mixed'
      : (first.packagingType || 'Roll'),
    purchaseRatePerKg: asNumber(first.purchaseRate ?? first.purchaseRatePerKg ?? first.unitPrice),
    stockItemId: first.stockItemId || '',
    masterItemId: first.masterItemId || first.stockItemId || '',
    netWeightKg: net,
    grossWeightKg: gross,
    tareWeightKg: tare,
    receivedQtyKg: net,
    rollsReceived: rollCount,
    itemsBreakdown,
    lineCount: usable.length
  };
}

export function stampLineIds(grnId, lines) {
  const id = String(grnId || '').trim();
  return (Array.isArray(lines) ? lines : []).filter(Boolean).map((line, index) => {
    const lineNo = asNumber(line.lineNo, index + 1) || index + 1;
    if (!id) return { ...line, lineNo, id: '' };
    const existing = String(line.id || '');
    const lineId = existing.startsWith(`${id}-L`) ? existing : `${id}-L${lineNo}`;
    return { ...line, lineNo, id: lineId };
  });
}

/** Invoice numbers match once spaces, hyphens, and underscores are removed. */
export function normalizeInvoiceNo(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function grnIsCancelled(grn) {
  const blob = `${grn?.status || ''} ${grn?.qcStatus || ''}`.toLowerCase();
  return blob.includes('cancel');
}

export function findDuplicateInvoice(existing, candidate) {
  const invoiceNo = normalizeInvoiceNo(candidate?.invoiceNo || candidate?.invoice_number);
  const vendorName = String(candidate?.vendorName || '').trim().toLowerCase();
  if (!invoiceNo || !vendorName) return null;
  const ownIds = new Set(
    [candidate?.grnNo, candidate?.grnId, candidate?.id]
      .filter(Boolean)
      .map((value) => String(value))
  );
  return (existing || []).find((grn) => {
    if (grnIsCancelled(grn)) return false;
    const theirInvoice = normalizeInvoiceNo(grn?.invoiceNo || grn?.invoice_number);
    const theirVendor = String(grn?.vendorName || '').trim().toLowerCase();
    const theirIds = [grn?.grnNo, grn?.id, grn?.grn_number].filter(Boolean).map(String);
    const sameDocument = theirIds.some((value) => ownIds.has(value));
    return theirInvoice === invoiceNo && theirVendor === vendorName && !sameDocument;
  }) || null;
}

/** Phrases for a line whose category or stock item was never chosen. */
export function grnLineIdentityGaps(line) {
  const gaps = [];
  const category = String(line?.category ?? '').trim();
  if (!category) gaps.push('missing category');
  const stockId = String(line?.stockItemId ?? '').trim();
  const named = String(line?.itemName ?? line?.itemSearchTerm ?? '').trim();
  if (!stockId && !named) gaps.push('missing stock item');
  return gaps;
}

/**
 * A new receipt must not save until the store clerk has chosen a vendor,
 * a category, and a stock item (a typed custom name counts as the stock item).
 * An empty category is not treated as film.
 */
export function grnIdentityProblems({ vendor, lines } = {}) {
  const problems = [];
  if (!String(vendor ?? '').trim()) problems.push('Select a vendor.');
  const usable = Array.isArray(lines) ? lines.filter(Boolean) : [];
  usable.forEach((line, index) => {
    const labeled = usable.length > 1;
    const prefix = labeled ? `Item ${index + 1}: ` : '';
    grnLineIdentityGaps(line).forEach((gap) => {
      if (gap === 'missing category') {
        problems.push(`${prefix}${labeled ? 'select an item category.' : 'Select an item category.'}`);
      } else {
        problems.push(`${prefix}${labeled ? 'select or search a stock item.' : 'Select or search a stock item.'}`);
      }
    });
  });
  return problems;
}

export function validateCapturedLines(lines) {
  const errors = [];
  const usable = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (usable.length === 0) errors.push('Add at least one item.');
  const seenRolls = new Set();
  usable.forEach((line, index) => {
    const label = `Item ${index + 1}`;
    const isFilm = (line.category || 'Film Substrates') === 'Film Substrates';
    if (isFilm) {
      if (!String(line.filmType || '').trim()) errors.push(`${label} needs a film type.`);
      if (line.micron === '' || line.micron === null || line.micron === undefined) errors.push(`${label} needs a micron.`);
      if (line.widthMm === '' || line.widthMm === null || line.widthMm === undefined) errors.push(`${label} needs a width.`);
    } else if (!String(line.itemName || '').trim()) {
      errors.push(`${label} needs a description.`);
    }
    if (!String(line.batchNo || '').trim()) errors.push(`${label} needs a batch number.`);
    if (asNumber(line.purchaseRate) < 0) errors.push(`${label} has a negative rate.`);
    const rolls = Array.isArray(line.rolls) ? line.rolls : [];
    if (rolls.length === 0) errors.push(`${label} needs at least one roll.`);
    rolls.forEach((roll) => {
      if (asNumber(roll?.netWeightKg) <= 0) errors.push(`${label} has a roll without a net weight.`);
      const vendorRoll = String(roll?.vendorRollNo || '').trim().toLowerCase();
      if (!vendorRoll) return;
      if (seenRolls.has(vendorRoll)) errors.push(`Vendor roll number ${roll.vendorRollNo} is repeated on this invoice.`);
      seenRolls.add(vendorRoll);
    });
  });
  return errors;
}

function lineItemName(line, helpers) {
  const isFilm = (line.category || 'Film Substrates') === 'Film Substrates';
  const metallocene = (isFilm && helpers.isMetalloceneEligibleFilm?.(line.filmType))
    ? (line.metallocenePct || '')
    : '';
  if (isFilm && helpers.formatFilmItemName) {
    return helpers.formatFilmItemName(line.filmType, line.widthMm, line.micron, '', metallocene);
  }
  return String(line.itemName || '').trim().replace(/µ/g, 'Micron') || `${line.category || 'Item'} Inward Item`;
}

/** Link one captured receipt line by item id, or by one exact name. */
export function planCapturedReceiptLink(inventory, captured = {}, helpers = {}) {
  const isFilm = (captured.category || 'Film Substrates') === 'Film Substrates';
  const itemName = lineItemName(captured, helpers);
  const conflict = isFilm ? filmReceiptNameConflict(captured.itemName, itemName) : '';
  if (conflict) return { action: 'block', item: null, itemName, message: conflict };
  const plan = planReceiptStockLink(inventory, {
    stockItemId: captured.stockItemId,
    itemId: captured.itemId,
    masterItemId: captured.masterItemId,
    itemName,
    category: captured.category || 'Film Substrates',
    filmType: isFilm ? captured.filmType : (captured.category || ''),
    micron: isFilm ? (parseFloat(captured.micron) || 0) : '-',
    widthMm: isFilm ? (parseFloat(captured.widthMm) || 0) : '-'
  });
  return { ...plan, itemName };
}

export function receiptLinesLinkError(inventory, lines, helpers = {}) {
  const pool = [...(inventory || [])];
  for (const line of lines || []) {
    const plan = planCapturedReceiptLink(pool, line, helpers);
    if (plan.action === 'block') return plan.message;
    if (plan.action === 'create') {
      pool.push({
        id: `new-${pool.length}`,
        itemName: plan.itemName,
        category: line.category || 'Film Substrates',
        filmType: line.filmType,
        micron: line.micron,
        widthMm: line.widthMm
      });
    }
  }
  return '';
}

export function prepareMultiLineReceipt({
  header,
  capturedLines,
  grnNo,
  nowIso,
  inventory = [],
  poItems = [],
  generateBarcodeId,
  generateInventoryId,
  formatFilmItemName,
  calculateFilmRollLength,
  isMetalloceneEligibleFilm,
  idSources = []
}) {
  const helpers = { formatFilmItemName, calculateFilmRollLength, isMetalloceneEligibleFilm };
  const grnCode = String(grnNo || '').replace('GRN-', '');
  const pool = [...(inventory || [])];
  const touchedExisting = new Map();
  const lineCount = capturedLines.length;
  let builtLines;
  try {
  builtLines = capturedLines.map((captured, index) => {
    const lineNo = index + 1;
    const isFilm = (captured.category || 'Film Substrates') === 'Film Substrates';
    const isCylinder = captured.category === 'Rotogravure Cylinders';
    const metallocene = (isFilm && isMetalloceneEligibleFilm?.(captured.filmType))
      ? (captured.metallocenePct || '')
      : '';
    const itemName = lineItemName(captured, helpers);
    const sourceRolls = Array.isArray(captured.rolls) && captured.rolls.length > 0
      ? captured.rolls
      : [{ netWeightKg: captured.weightKg, grossWeightKg: captured.weightKg, tareWeightKg: 0 }];
    const rolls = sourceRolls.map((roll, rollIndex) => {
      const gross = asNumber(roll.grossWeightKg);
      const tare = asNumber(roll.tareWeightKg);
      const net = asNumber(roll.netWeightKg) || (gross > 0 ? Math.max(0, gross - tare) : 0);
      const length = asNumber(roll.lengthMeters)
        || (isFilm && calculateFilmRollLength ? calculateFilmRollLength(net, captured.widthMm, captured.micron, captured.filmType) : 0);
      return {
        unitNo: rollIndex + 1,
        barcodeId: rollBarcode({
          isFilm,
          grnCode,
          lineCount,
          lineNo,
          rollIndex: rollIndex + 1,
          rollCount: sourceRolls.length,
          singleBarcode: lineCount === 1 && sourceRolls.length === 1 && generateBarcodeId
            ? generateBarcodeId(isFilm ? 'RM-BC' : 'CON-BC')
            : ''
        }),
        grossWeightKg: gross,
        tareWeightKg: tare,
        netWeightKg: round2(net),
        lengthMeters: length > 0 ? length : 0,
        vendorRollNo: String(roll.vendorRollNo || '').trim(),
        itemRemarks: String(roll.itemRemarks || roll.notes || captured.remarks || '').trim()
      };
    });
    const net = round2(rolls.reduce((sum, roll) => sum + asNumber(roll.netWeightKg), 0));
    const gross = round2(rolls.reduce((sum, roll) => sum + asNumber(roll.grossWeightKg), 0));
    const tare = round2(rolls.reduce((sum, roll) => sum + asNumber(roll.tareWeightKg), 0));
    const category = captured.category || 'Film Substrates';
    const micron = isFilm ? (parseFloat(captured.micron) || 0) : '-';
    const widthMm = isFilm ? (parseFloat(captured.widthMm) || 0) : '-';
    const linked = planCapturedReceiptLink(pool, captured, helpers);
    if (linked.action === 'block') {
      const error = new Error(linked.message);
      error.linkError = linked.message;
      throw error;
    }
    const existing = linked.action === 'use' ? linked.item : null;
    let lotId;
    let createdLot = false;
    if (existing) {
      lotId = String(existing.id);
    } else {
      lotId = generateInventoryId
        ? generateInventoryId(pool, ...(idSources || []))
        : fallbackInventoryId(pool);
      createdLot = true;
      pool.push({
        id: lotId,
        itemCode: lotId,
        itemName,
        category,
        micron,
        widthMm
      });
    }
    const rate = asNumber(captured.purchaseRate);
    if (existing && isCylinder) {
      const idx = pool.findIndex((item) => String(item.id) === String(existing.id));
      if (idx >= 0) {
        const qty = round2((Number(pool[idx].availableQtyKg) || 0) + net);
        const price = rate > 0 ? rate : (Number(pool[idx].unitPrice) || 0);
        pool[idx] = {
          ...pool[idx],
          availableQtyKg: qty,
          unitPrice: price,
          purchaseRatePerKg: price,
          purchaseValuation: round2(qty * price),
          lastBatch: String(captured.batchNo || '').trim() || pool[idx].lastBatch
        };
        touchedExisting.set(String(existing.id), pool[idx]);
      }
    }
    const poLine = (poItems || []).find((item) => (
      captured.poLineId && String(item.id || item.lineId || '') === String(captured.poLineId)
    )) || (index === 0 ? (poItems || [])[0] : null);
    const poRate = asNumber(poLine?.rate);
    const poQty = asNumber(poLine?.qtyKg ?? poLine?.qty);
    const poTitle = String(poLine?.itemDesc || poLine?.itemName || '').trim();
    const hasRateVar = poRate > 0 && Math.abs(rate - poRate) > 0.05;
    const hasQtyVar = poQty > 0 && Math.abs(net - poQty) > 0.1;
    const hasItemVar = Boolean(poTitle && itemName && poTitle.toLowerCase() !== itemName.toLowerCase());
    return {
      id: `${grnNo}-L${lineNo}`,
      lineNo,
      poLineId: captured.poLineId || null,
      category: captured.category || 'Film Substrates',
      itemName,
      filmType: isFilm ? captured.filmType : (captured.category || ''),
      micron: isFilm ? (parseFloat(captured.micron) || 0) : '-',
      widthMm: isFilm ? (parseFloat(captured.widthMm) || 0) : '-',
      metallocenePct: metallocene,
      unit: isFilm ? 'Kg' : (isCylinder ? 'Set' : (captured.unit || 'Kg')),
      stockItemId: lotId,
      masterItemId: lotId,
      purchaseRate: rate,
      batchNo: String(captured.batchNo || '').trim(),
      packagingType: captured.packagingType || 'Roll',
      remarks: String(captured.remarks || '').trim(),
      invoiceQtyKg: captured.weightKg === '' || captured.weightKg === undefined || captured.weightKg === null
        ? null
        : asNumber(captured.weightKg),
      rollsReceived: rolls.length,
      grossWeightKg: gross,
      tareWeightKg: tare,
      netWeightKg: net,
      rolls,
      hasVariation: Boolean(hasRateVar || hasQtyVar || hasItemVar),
      isCylinder,
      lotId,
      rate,
      createdLot
    };
  });
  } catch (err) {
    if (err && err.linkError) {
      return { linkError: err.linkError, newGRN: null, inventoryLots: [], updatedItems: [], rolls: [] };
    }
    throw err;
  }

  const summary = summarizeReceiptLines(builtLines);
  const anyCylinder = builtLines.every((line) => line.isCylinder);
  const receivedAt = nowIso || new Date().toISOString();
  const newGRN = {
    id: grnNo,
    grnNo,
    poNumber: header.poNumber || '',
    vendorName: header.vendorName || '',
    vendorId: header.vendorId || null,
    vendorAddress: header.vendorAddress || '',
    vendorGstin: header.vendorGstin || '',
    vendorEmail: header.vendorEmail || '',
    vendorPhone: header.vendorPhone || '',
    vendorContact: header.vendorContact || '',
    invoiceNo: header.invoiceNo || '',
    receivedDate: receivedAt.split('T')[0],
    receivedTime: header.receivedTime || '',
    inwardTimestamp: receivedAt,
    createdAt: receivedAt,
    category: summary.category,
    itemName: summary.itemName,
    stockItemId: summary.stockItemId,
    masterItemId: summary.masterItemId,
    filmType: summary.filmType,
    micron: summary.micron,
    widthMm: summary.widthMm,
    metallocenePct: summary.metallocenePct,
    metallocene_pct: summary.metallocenePct,
    unit: summary.unit,
    packagingType: summary.packagingType,
    rollsReceived: summary.rollsReceived,
    netWeightKg: summary.netWeightKg,
    receivedQtyKg: summary.netWeightKg,
    grossWeightKg: summary.grossWeightKg,
    tareWeightKg: summary.tareWeightKg,
    itemsBreakdown: summary.itemsBreakdown,
    barcodes: summary.itemsBreakdown.map((roll) => roll.barcodeId),
    barcodeId: summary.itemsBreakdown.map((roll) => roll.barcodeId).join(', '),
    purchaseRatePerKg: summary.purchaseRatePerKg,
    purchaseRate: summary.purchaseRatePerKg,
    unitPrice: summary.purchaseRatePerKg,
    batchNo: summary.batchNo,
    freightAmount: asNumber(header.freightAmount),
    transporterName: header.transporterName || 'Direct Dispatch / Self',
    itemRemarks: header.remarks || builtLines[0]?.remarks || '',
    remarks: header.remarks || builtLines[0]?.remarks || '',
    notes: header.remarks || builtLines[0]?.remarks || '',
    status: anyCylinder ? 'Approved' : 'Pending QC Approval',
    qcStatus: anyCylinder ? 'Approved' : 'Pending QC Approval',
    storeManager: header.storeManager || 'Store Manager',
    lineItems: builtLines.map((line) => {
      const rest = { ...line };
      delete rest.isCylinder;
      delete rest.lotId;
      delete rest.rate;
      delete rest.createdLot;
      return rest;
    })
  };

  const inventoryLots = builtLines.filter((line) => line.createdLot).map((line) => ({
    id: line.lotId,
    itemCode: line.lotId,
    masterItemId: line.masterItemId,
    itemName: line.itemName,
    category: line.category,
    filmType: line.filmType,
    micron: line.micron,
    widthMm: line.widthMm,
    metallocenePct: line.metallocenePct,
    metallocene_pct: line.metallocenePct,
    unit: line.unit,
    availableQtyKg: line.isCylinder ? line.netWeightKg : 0,
    allocatedQtyKg: 0,
    unitPrice: line.rate,
    purchaseRatePerKg: line.rate,
    purchaseValuation: line.isCylinder ? round2(line.netWeightKg * line.rate) : 0,
    location: line.category === 'Film Substrates' ? 'Bay A - Inward Dock' : 'Consumables Store',
    reorderLevelKg: 100,
    lastVendor: header.vendorName || '',
    lastBatch: line.batchNo
  }));

  const rolls = builtLines.flatMap((line) => line.rolls.map((roll) => ({
    id: roll.barcodeId,
    barcodeId: roll.barcodeId,
    grnNo,
    grnId: grnNo,
    grnLineItemId: line.id,
    lineNo: line.lineNo,
    unitNo: roll.unitNo,
    totalUnits: line.rolls.length,
    rollType: line.category === 'Film Substrates' ? 'RAW_MATERIAL' : 'CONSUMABLE_ITEM',
    itemId: line.lotId,
    itemName: line.itemName,
    category: line.category,
    filmType: line.category === 'Film Substrates' ? line.filmType : '-',
    micron: line.category === 'Film Substrates' ? asNumber(line.micron) : 0,
    widthMm: line.category === 'Film Substrates' ? asNumber(line.widthMm) : 0,
    unit: line.unit,
    packagingType: line.packagingType,
    inwardDatetime: receivedAt,
    inwardTimestamp: receivedAt,
    createdAt: receivedAt,
    vendorName: header.vendorName || '',
    invoiceNo: header.invoiceNo || '',
    batchNo: line.batchNo,
    vendorRollNo: roll.vendorRollNo || null,
    grossWeightKg: roll.grossWeightKg > 0 ? roll.grossWeightKg : null,
    tareWeightKg: roll.tareWeightKg > 0 ? roll.tareWeightKg : null,
    netWeightKg: roll.netWeightKg,
    availableWeightKg: roll.netWeightKg,
    lengthMeters: roll.lengthMeters > 0 ? roll.lengthMeters : null,
    purchaseRatePerKg: line.rate,
    purchaseRate: line.rate,
    unitPrice: line.rate,
    stationId: 'SCALE_1_INWARD',
    locationBay: line.isCylinder ? 'Bay A' : 'Pending QC Store',
    status: line.isCylinder ? 'In Stock' : 'Pending QC',
    qcStatus: line.isCylinder ? 'Approved' : 'Pending QC',
    itemRemarks: roll.itemRemarks,
    remarks: roll.itemRemarks,
    notes: roll.itemRemarks
  })));

  return { newGRN, inventoryLots, updatedItems: [...touchedExisting.values()], rolls };
}

function fallbackInventoryId(pool) {
  let maxNum = 0;
  (pool || []).forEach((item) => {
    const match = String(item?.id || '').match(/(?:INVT|INV)[-_\s]*(\d+)/i);
    if (!match) return;
    const num = parseInt(match[1], 10);
    if (num > maxNum) maxNum = num;
  });
  return `INVT-${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * Add QC-approved kilograms to one ledger row per line.
 * A new inventory row is created only when nothing matches.
 */
export function applyQcApprovalStock(inventory, posts, { generateInventoryId, idSources = [] } = {}) {
  const working = [...(inventory || [])];
  const saved = [];
  (posts || []).forEach((post) => {
    const addKg = asNumber(post?.addKg);
    const rate = asNumber(post?.rate);
    const target = resolveQcStockTarget(working, post);
    if (target) {
      const index = working.findIndex((item) => String(item.id) === String(target.id));
      const item = working[index];
      const newAvailable = round2((Number(item.availableQtyKg) || 0) + addKg);
      const price = rate > 0 ? rate : (Number(item.unitPrice) || 0);
      const updated = {
        ...item,
        availableQtyKg: newAvailable,
        unitPrice: price,
        purchaseRatePerKg: price,
        purchaseValuation: round2(newAvailable * price),
        lastVendor: post.vendorName || item.lastVendor,
        lastBatch: post.batchNo || item.lastBatch,
        itemName: post.itemName || item.itemName,
        filmType: post.filmType || item.filmType,
        micron: post.micron !== undefined ? post.micron : item.micron,
        widthMm: post.widthMm !== undefined ? post.widthMm : item.widthMm,
        category: post.category || item.category,
        location: item.location
      };
      working[index] = updated;
      saved.push(updated);
      return;
    }
    const newId = generateInventoryId
      ? generateInventoryId(working, ...(idSources || []))
      : fallbackInventoryId(working);
    const created = {
      id: newId,
      itemCode: newId,
      itemName: post.itemName,
      category: post.category || 'Film Substrates',
      filmType: post.filmType,
      micron: post.micron,
      widthMm: post.widthMm,
      unit: 'Kg',
      availableQtyKg: addKg,
      allocatedQtyKg: 0,
      unitPrice: rate,
      purchaseRatePerKg: rate,
      purchaseValuation: round2(addKg * rate),
      location: post.isFilm ? 'Bay A - Inward Dock' : 'Consumables Store',
      reorderLevelKg: 100,
      lastVendor: post.vendorName || '',
      lastBatch: post.batchNo || ''
    };
    working.push(created);
    saved.push(created);
  });
  return { inventory: working, saved };
}

export function oneLineFromReceipt(grn) {
  const rolls = Array.isArray(grn?.itemsBreakdown) ? grn.itemsBreakdown : [];
  const idBase = grn?.id || grn?.grnNo || 'GRN';
  return {
    id: `${idBase}-L1`,
    lineNo: 1,
    poLineId: grn?.poLineId || null,
    category: grn?.category || 'Film Substrates',
    itemName: grn?.itemName || 'Item',
    filmType: grn?.filmType || '',
    micron: grn?.micron !== undefined ? grn.micron : '-',
    widthMm: grn?.widthMm !== undefined ? grn.widthMm : '-',
    metallocenePct: grn?.metallocenePct || '',
    unit: grn?.unit || 'Kg',
    stockItemId: grn?.stockItemId || '',
    masterItemId: grn?.masterItemId || grn?.stockItemId || '',
    purchaseRate: asNumber(grn?.purchaseRatePerKg ?? grn?.purchaseRate ?? grn?.unitPrice),
    batchNo: grn?.batchNo || '',
    packagingType: grn?.packagingType || 'Roll',
    remarks: grn?.itemRemarks || grn?.remarks || '',
    invoiceQtyKg: null,
    rollsReceived: asNumber(grn?.rollsReceived, rolls.length),
    grossWeightKg: asNumber(grn?.grossWeightKg),
    tareWeightKg: asNumber(grn?.tareWeightKg),
    netWeightKg: asNumber(grn?.netWeightKg ?? grn?.receivedQtyKg),
    rolls: rolls.map((roll, index) => ({
      unitNo: roll.unitNo || index + 1,
      barcodeId: roll.barcodeId || null,
      grossWeightKg: asNumber(roll.grossWeightKg),
      tareWeightKg: asNumber(roll.tareWeightKg),
      netWeightKg: asNumber(roll.netWeightKg),
      lengthMeters: asNumber(roll.lengthMeters),
      vendorRollNo: roll.vendorRollNo || '',
      itemRemarks: roll.itemRemarks || roll.notes || roll.remarks || ''
    }))
  };
}

export function linesForSave(grn) {
  const provided = Array.isArray(grn?.lineItems) ? grn.lineItems.filter(Boolean) : [];
  return provided.length > 0 ? provided : [oneLineFromReceipt(grn)];
}

function headerMatchesPendingItem(grn, item) {
  const isFilm = (item?.category || 'Film Substrates') === 'Film Substrates';
  return (grn?.stockItemId && String(grn.stockItemId) === String(item?.id))
    || (grn?.itemId && String(grn.itemId) === String(item?.id))
    || (grn?.itemName && item?.itemName && grn.itemName.trim().toLowerCase() === item.itemName.trim().toLowerCase())
    || (isFilm && grn?.filmType === item?.filmType && Number(grn?.micron) === Number(item?.micron) && Number(grn?.widthMm) === Number(item?.widthMm));
}

function lineMatchesStockItem(line, item) {
  const isFilm = (item?.category || 'Film Substrates') === 'Film Substrates';
  return (line?.stockItemId && String(line.stockItemId) === String(item?.id))
    || (line?.masterItemId && String(line.masterItemId) === String(item?.id))
    || (line?.itemName && item?.itemName && String(line.itemName).trim().toLowerCase() === String(item.itemName).trim().toLowerCase())
    || (isFilm && line?.filmType === item?.filmType && Number(line?.micron) === Number(item?.micron) && Number(line?.widthMm) === Number(item?.widthMm));
}

export function pendingQcKgForItem(item, grns) {
  let sum = 0;
  (grns || []).forEach((grn) => {
    const status = grn?.status || '';
    const lines = Array.isArray(grn?.lineItems) ? grn.lineItems : [];
    if (lines.length > 1) {
      if (!(status === 'Pending QC' || status === 'Pending' || status === 'Pending QC Approval')) return;
      lines.forEach((line) => {
        if (lineMatchesStockItem(line, item)) sum += asNumber(line.netWeightKg);
      });
      return;
    }
    if ((status === 'Pending QC' || status === 'Pending') && headerMatchesPendingItem(grn, item)) {
      sum += asNumber(grn.netWeightKg);
    }
  });
  return round2(sum);
}

export function qcDraftFromLine(line) {
  const rolls = Array.isArray(line?.rolls) ? line.rolls : [];
  return {
    filmType: line?.filmType || 'PET',
    category: line?.category || 'Film Substrates',
    itemName: line?.itemName || '',
    widthMm: line?.widthMm !== '-' && line?.widthMm !== undefined ? line.widthMm : '',
    micron: line?.micron !== '-' && line?.micron !== undefined ? line.micron : '',
    netWeightKg: line?.netWeightKg ?? '',
    grossWeightKg: line?.grossWeightKg ?? '',
    tareWeightKg: line?.tareWeightKg ?? '',
    rollsReceived: line?.rollsReceived || rolls.length || 1,
    batchNo: line?.batchNo || '',
    packagingType: line?.packagingType || 'Roll',
    itemsBreakdown: rolls.map((roll, index) => ({ ...roll, unitNo: roll.unitNo || index + 1 }))
  };
}

export function applyMultiLineQc({ grn, draftsByLineId, status, formatFilmItemName, isMetalloceneEligibleFilm, calculateFilmRollLength }) {
  const approved = status === 'Approved';
  const lines = Array.isArray(grn?.lineItems) ? grn.lineItems : [];
  const nextLines = lines.map((line) => {
    const draft = draftsByLineId?.[line.id] || qcDraftFromLine(line);
    const isFilm = (draft.category || line.category || 'Film Substrates') === 'Film Substrates';
    const filmType = isFilm ? (draft.filmType || line.filmType || 'PET') : (line.filmType || line.category);
    const micron = isFilm ? (parseFloat(draft.micron) || line.micron || '-') : (line.micron || '-');
    const widthMm = isFilm ? (parseFloat(draft.widthMm) || line.widthMm || '-') : (line.widthMm || '-');
    const metallocene = (isFilm && isMetalloceneEligibleFilm?.(filmType)) ? (line.metallocenePct || '') : '';
    const itemName = isFilm && formatFilmItemName
      ? formatFilmItemName(filmType, widthMm, micron, '', metallocene)
      : (draft.itemName || line.itemName || 'Item');
    const batchNo = String(draft.batchNo || line.batchNo || '').trim();
    const sourceRolls = Array.isArray(draft.itemsBreakdown) && draft.itemsBreakdown.length > 0
      ? draft.itemsBreakdown
      : (line.rolls || []);
    const rolls = sourceRolls.map((roll, index) => {
      const net = asNumber(roll.netWeightKg);
      return {
        ...roll,
        unitNo: roll.unitNo || index + 1,
        netWeightKg: net,
        grossWeightKg: asNumber(roll.grossWeightKg),
        tareWeightKg: asNumber(roll.tareWeightKg),
        lengthMeters: isFilm && calculateFilmRollLength
          ? calculateFilmRollLength(net, widthMm, micron, filmType)
          : asNumber(roll.lengthMeters)
      };
    });
    const net = rolls.length > 0
      ? round2(rolls.reduce((sum, roll) => sum + asNumber(roll.netWeightKg), 0))
      : asNumber(draft.netWeightKg, line.netWeightKg);
    return {
      ...line,
      category: draft.category || line.category,
      itemName,
      filmType,
      micron,
      widthMm,
      metallocenePct: metallocene,
      batchNo,
      packagingType: draft.packagingType || line.packagingType || 'Roll',
      rollsReceived: rolls.length || asNumber(draft.rollsReceived, line.rollsReceived),
      grossWeightKg: round2(rolls.reduce((sum, roll) => sum + asNumber(roll.grossWeightKg), 0)) || asNumber(draft.grossWeightKg, line.grossWeightKg),
      tareWeightKg: round2(rolls.reduce((sum, roll) => sum + asNumber(roll.tareWeightKg), 0)),
      netWeightKg: net,
      rolls
    };
  });
  const summary = summarizeReceiptLines(nextLines);
  const updatedGRN = {
    ...grn,
    ...summary,
    purchaseRate: summary.purchaseRatePerKg,
    unitPrice: summary.purchaseRatePerKg,
    metallocene_pct: summary.metallocenePct,
    lineItems: nextLines,
    status: approved ? 'Approved' : 'QC Hold',
    qcStatus: approved ? 'Approved' : 'Rejected'
  };
  const stockPosts = approved ? nextLines.map((line) => ({
    stockItemId: line.stockItemId || '',
    masterItemId: line.masterItemId || '',
    itemName: line.itemName,
    filmType: line.filmType,
    micron: line.micron,
    widthMm: line.widthMm,
    category: line.category,
    addKg: asNumber(line.netWeightKg),
    rate: asNumber(line.purchaseRate),
    batchNo: line.batchNo,
    isFilm: line.category === 'Film Substrates'
  })) : [];
  const rollPatches = nextLines.flatMap((line) => (line.rolls || []).map((roll) => ({
    barcodeId: roll.barcodeId,
    grnLineItemId: line.id,
    lineNo: line.lineNo,
    netWeightKg: roll.netWeightKg,
    grossWeightKg: roll.grossWeightKg,
    tareWeightKg: roll.tareWeightKg,
    lengthMeters: roll.lengthMeters,
    filmType: line.filmType,
    micron: line.micron,
    widthMm: line.widthMm,
    itemName: line.itemName,
    batchNo: line.batchNo,
    status: approved ? 'In Stock' : 'QC Hold',
    qcStatus: approved ? 'Approved' : 'Rejected',
    locationBay: approved
      ? (line.category === 'Film Substrates' ? 'Bay A' : 'Consumables Store')
      : 'QC Hold Store'
  })));
  return { updatedGRN, stockPosts, rollPatches };
}

export function pdfLinesFromGrn(grn) {
  const lines = Array.isArray(grn?.lineItems) && grn.lineItems.length > 0
    ? grn.lineItems
    : [oneLineFromReceipt(grn || {})];
  return lines.map((line, index) => ({
    lineNo: line.lineNo || index + 1,
    itemName: line.itemName || grn?.itemName || 'Item',
    micron: line.micron !== undefined ? line.micron : grn?.micron,
    widthMm: line.widthMm !== undefined ? line.widthMm : grn?.widthMm,
    rollsReceived: line.rollsReceived || (line.rolls || []).length || 0,
    netWeightKg: asNumber(line.netWeightKg ?? grn?.netWeightKg),
    purchaseRate: asNumber(line.purchaseRate ?? line.purchaseRatePerKg ?? grn?.unitPrice ?? grn?.purchaseRatePerKg),
    batchNo: line.batchNo || grn?.batchNo || '',
    category: line.category || grn?.category || '',
    packagingType: line.packagingType || grn?.packagingType || 'Roll',
    rolls: Array.isArray(line.rolls) && line.rolls.length > 0 ? line.rolls : (index === 0 ? (grn?.itemsBreakdown || []) : [])
  }));
}

export function taxableAmountFromLines(lines) {
  return round2((lines || []).reduce(
    (sum, line) => sum + asNumber(line.netWeightKg) * asNumber(line.purchaseRate ?? line.purchaseRatePerKg ?? line.unitPrice),
    0
  ));
}

export function mergeRollsIntoList(previous, saved) {
  const pending = new Map((saved || []).map((roll) => [String(roll.barcodeId || roll.id), roll]));
  const next = (previous || []).map((roll) => {
    const key = String(roll.barcodeId || roll.id);
    const match = pending.get(key);
    if (!match) return roll;
    pending.delete(key);
    return { ...roll, ...match };
  });
  return [...pending.values(), ...next];
}
