/**
 * Stock-ledger membership.
 * A row is included when one of its item ids is this item.
 * A row with no item id may match an exact normalised name and is marked legacy.
 * Film, micron, width, and category words are not identifiers.
 */

const ITEM_ID_FIELDS = [
  'stockItemId',
  'stock_item_id',
  'itemId',
  'item_id',
  'masterItemId',
  'master_item_id',
  'itemCode',
  'item_code',
  'inventoryId',
  'inventory_id'
];

const RATE_FIELDS = [
  'purchaseRatePerKg',
  'purchase_rate_per_kg',
  'purchaseRate',
  'purchase_rate',
  'unitPricePerKg',
  'unit_price_per_kg',
  'unitPrice',
  'unit_price',
  'ratePerKg',
  'rate_per_kg',
  'pricePerKg',
  'price_per_kg'
];

export function normalizeLedgerItemName(value) {
  return String(value || '')
    .split('|||')[0]
    .replace(/µ/gi, ' micron ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function pointerValue(value) {
  const text = String(value ?? '').trim();
  return text || '';
}

/** Item ids stored on the row. The row's own primary key is not an item id. */
export function ledgerItemPointers(candidate) {
  if (!candidate || typeof candidate !== 'object') return [];
  const seen = new Set();
  const pointers = [];
  ITEM_ID_FIELDS.forEach((field) => {
    const text = pointerValue(candidate[field]);
    if (!text || seen.has(text)) return;
    seen.add(text);
    pointers.push(text);
  });
  return pointers;
}

function targetIdentities(target) {
  const rows = [];
  const push = (entry) => {
    if (!entry || typeof entry !== 'object') return;
    rows.push(entry);
  };
  push(target);
  (target?.subItems || []).forEach(push);
  const ids = new Set();
  const names = new Set();
  rows.forEach((entry) => {
    [entry.id, entry.itemCode, entry.item_code].forEach((value) => {
      const text = pointerValue(value);
      if (text) ids.add(text);
    });
    const name = normalizeLedgerItemName(entry.itemName || entry.item_name);
    if (name) names.add(name);
  });
  (target?.allInventoryIds || []).forEach((value) => {
    const text = pointerValue(value);
    if (text) ids.add(text);
  });
  return { ids, names };
}

/**
 * @returns {{ include: boolean, legacy: boolean }}
 * legacy is true only for a name match on a row that has no item id.
 */
export function ledgerRowLink(candidate, target) {
  if (!candidate || !target) return { include: false, legacy: false };
  const { ids, names } = targetIdentities(target);
  const pointers = ledgerItemPointers(candidate);
  if (pointers.length > 0) {
    return {
      include: pointers.some((id) => ids.has(id)),
      legacy: false
    };
  }
  const name = normalizeLedgerItemName(candidate.itemName || candidate.item_name);
  if (name && names.has(name)) return { include: true, legacy: true };
  return { include: false, legacy: false };
}

/** The row's own positive rate. The parent item rate is only the fallback. */
export function ledgerRowRate(row, fallback = 0) {
  for (const field of RATE_FIELDS) {
    if (!row || !Object.prototype.hasOwnProperty.call(row, field)) continue;
    const raw = row[field];
    if (raw === undefined || raw === null || raw === '') continue;
    const rate = Number(raw);
    if (Number.isFinite(rate) && rate > 0) return rate;
  }
  const fallbackRate = Number(fallback);
  return Number.isFinite(fallbackRate) ? fallbackRate : 0;
}

export function rollBelongsOnItemLedger(roll, item) {
  if (!roll || String(roll.status || '').trim().toLowerCase() === 'deleted') {
    return { include: false, legacy: false };
  }
  return ledgerRowLink({
    itemId: roll.itemId ?? roll.item_id,
    stockItemId: roll.stockItemId ?? roll.stock_item_id,
    masterItemId: roll.masterItemId ?? roll.master_item_id,
    itemCode: roll.itemCode ?? roll.item_code,
    inventoryId: roll.inventoryId ?? roll.inventory_id,
    itemName: roll.itemName ?? roll.item_name
  }, item);
}

function decisionBlob(grn) {
  return `${grn?.status || ''} ${grn?.qcStatus || grn?.qc_status || ''}`.toLowerCase();
}

/**
 * approved: usable stock.
 * rejected: QC hold / rejected, not usable stock.
 * pending: still in the lab.
 * deleted: the receipt is gone and must not appear.
 */
export function grnQcDecision(grn) {
  const blob = decisionBlob(grn);
  if (blob.includes('delet')) return 'deleted';
  if (blob.includes('hold') || blob.includes('reject')) return 'rejected';
  if (blob.includes('approved') && !blob.includes('pending')) return 'approved';
  return 'pending';
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function linePointers(line) {
  return ledgerItemPointers({
    stockItemId: line?.stockItemId ?? line?.stock_item_id,
    masterItemId: line?.masterItemId ?? line?.master_item_id,
    itemId: line?.itemId ?? line?.item_id,
    itemCode: line?.itemCode ?? line?.item_code,
    itemName: line?.itemName ?? line?.item_name
  });
}

function lineQty(line, grn, soleLine) {
  const own = positive(line?.netWeightKg ?? line?.net_weight_kg);
  if (own > 0) return own;
  if (!soleLine) return 0;
  return positive(grn?.netWeightKg ?? grn?.receivedQtyKg ?? grn?.received_qty_kg);
}

function pushCode(codes, value) {
  const text = String(value || '').trim();
  if (!text || codes.includes(text)) return;
  codes.push(text);
}

function barcodesForLine(line, grn, rolls) {
  const wanted = [];
  (line?.rolls || []).forEach((roll) => pushCode(wanted, roll?.barcodeId || roll?.barcode_id || roll?.barcode));
  const wantedSet = new Set(wanted);
  const grnKeys = new Set([grn?.id, grn?.grnNo, grn?.grn_number].filter(Boolean).map((value) => String(value)));
  const matched = (rolls || []).filter((roll) => {
    const code = String(roll?.barcodeId || roll?.barcode || roll?.id || '').trim();
    const lineId = String(roll?.grnLineItemId || roll?.grn_line_item_id || '');
    const gid = String(roll?.grnId || roll?.grn_id || roll?.grnNo || roll?.grn_no || '');
    if (wantedSet.size > 0) return wantedSet.has(code) || (line?.id && lineId === String(line.id));
    return Boolean(gid) && grnKeys.has(gid) && (!line?.id || !lineId || lineId === String(line.id));
  });
  const codes = [];
  matched.forEach((roll) => pushCode(codes, roll?.barcodeId || roll?.barcode || roll?.id));
  wanted.forEach((code) => pushCode(codes, code));
  const listedRolls = Number(line?.rollsReceived ?? line?.rolls_received) || 0;
  return {
    barcode: codes.join(', '),
    rollCount: matched.length || wanted.length || listedRolls
  };
}

/**
 * One ledger row per receipt line that belongs to this item.
 * A multi-line GRN is not one lump on the first line's item: each line's
 * kilograms and inward barcodes stay on that line's stock item.
 * Rejected and QC-hold lines are returned so the ledger can show them,
 * and they do not add usable stock. A deleted receipt returns nothing.
 */
export function grnInwardLedgerEntries(grn, item, rolls = []) {
  if (!grn || !item) return [];
  const decision = grnQcDecision(grn);
  if (decision === 'deleted') return [];
  const stored = Array.isArray(grn.lineItems) ? grn.lineItems.filter(Boolean) : [];
  const selected = [];
  if (stored.length > 1) {
    stored.forEach((line) => {
      if (ledgerRowLink(line, item).include) selected.push({ line, legacy: ledgerRowLink(line, item).legacy });
    });
  } else if (stored.length === 1) {
    const line = stored[0];
    const link = ledgerRowLink(line, item);
    const header = ledgerRowLink(grn, item);
    if (link.include || (linePointers(line).length === 0 && header.include)) {
      selected.push({ line, legacy: link.include ? link.legacy : header.legacy });
    }
  } else if (ledgerRowLink(grn, item).include) {
    selected.push({
      line: {
        id: `${grn.id || grn.grnNo || 'GRN'}-L1`,
        lineNo: 1,
        itemName: grn.itemName,
        netWeightKg: grn.netWeightKg ?? grn.receivedQtyKg,
        batchNo: grn.batchNo,
        purchaseRate: grn.purchaseRatePerKg ?? grn.purchaseRate ?? grn.unitPrice,
        rolls: Array.isArray(grn.itemsBreakdown) ? grn.itemsBreakdown : [],
        remarks: grn.itemRemarks || grn.remarks || ''
      },
      legacy: ledgerRowLink(grn, item).legacy
    });
  }

  return selected.map(({ line, legacy }) => {
    const codes = barcodesForLine(line, grn, rolls);
    const rate = positive(line.purchaseRate ?? line.purchaseRatePerKg ?? line.purchase_rate ?? line.unitPrice);
    return {
      lineId: line.id || '',
      lineNo: Number(line.lineNo ?? line.line_no) || 1,
      lineCount: Math.max(stored.length, 1),
      itemName: line.itemName || line.item_name || grn.itemName || '',
      qty: lineQty(line, grn, stored.length <= 1),
      barcode: codes.barcode,
      rollCount: codes.rollCount,
      batchNo: line.batchNo || line.batch_no || grn.batchNo || '',
      rate,
      remarks: line.remarks || line.itemRemarks || '',
      decision,
      addsUsableStock: decision === 'approved',
      legacy: Boolean(legacy)
    };
  }).filter((entry) => entry.qty > 0 || entry.barcode);
}
