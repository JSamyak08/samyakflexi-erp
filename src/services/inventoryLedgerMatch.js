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
