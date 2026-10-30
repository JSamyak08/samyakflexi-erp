/**
 * One stock ledger per item spec.
 * The key is the display name, category, micron, and width.
 * A goods receipt uses the item the store user picked when that row exists.
 */

export function displayItemName(name) {
  const raw = String(name || '');
  const cut = raw.includes('|||') ? raw.slice(0, raw.indexOf('|||')) : raw;
  return cut.replace(/µ/g, 'Micron').replace(/\s+/g, ' ').trim();
}

export function normalizeItemName(name) {
  return displayItemName(name).toLowerCase();
}

/** Same missing-measure token as the database guard (null micron/width → -1). */
export function specMeasureKey(value) {
  if (value === null || value === undefined || value === '' || value === '-') return '-1';
  const n = Number(value);
  if (!Number.isFinite(n)) return '-1';
  return String(n);
}

export function inventorySpecKey(item = {}) {
  return [
    normalizeItemName(item.itemName || item.item_name),
    String(item.category || '').trim().toLowerCase(),
    specMeasureKey(item.micron),
    specMeasureKey(item.widthMm !== undefined ? item.widthMm : item.width_mm)
  ].join('|');
}

export function inventorySerial(id) {
  const match = String(id || '').match(/(?:INVT|INV)[-_\s]*(\d+)/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const num = parseInt(match[1], 10);
  return Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER;
}

function byOriginalId(a, b) {
  return inventorySerial(a?.id) - inventorySerial(b?.id) || String(a?.id || '').localeCompare(String(b?.id || ''));
}

export function preferMasterItem(items) {
  const list = (items || []).filter(Boolean);
  if (list.length === 0) return null;
  return [...list].sort(byOriginalId)[0];
}

export function findInventoryItemById(inventory, id) {
  const key = String(id || '').trim();
  if (!key) return null;
  return (inventory || []).find((item) => (
    String(item?.id || '') === key || String(item?.itemCode || item?.item_code || '') === key
  )) || null;
}

/**
 * Rows that share a normalised name, category, micron, and width.
 * When several exist, the earliest inventory id is the master.
 */
export function findInventoryItemBySpec(inventory, spec) {
  const name = inventorySpecKey(spec).split('|')[0];
  if (!name) return null;
  const key = inventorySpecKey(spec);
  const matches = (inventory || []).filter((item) => inventorySpecKey(item) === key);
  if (matches.length === 0) return null;
  return preferMasterItem(matches);
}

/**
 * The item a receipt line should post to.
 * The row the user picked wins. Otherwise the spec match. Otherwise null.
 */
export function resolveReceiptItem(inventory, spec = {}) {
  const picked = findInventoryItemById(inventory, spec.stockItemId || spec.masterItemId);
  if (picked) return picked;
  return findInventoryItemBySpec(inventory, spec);
}

/**
 * QC posts onto the master the user picked, then a spec match, then the lot id.
 * Historical receipts stored the new lot as stockItemId and the picked row as masterItemId.
 */
export function resolveQcStockTarget(inventory, post = {}) {
  const master = findInventoryItemById(inventory, post.masterItemId);
  if (master) return master;
  const spec = findInventoryItemBySpec(inventory, post);
  if (spec) return spec;
  return findInventoryItemById(inventory, post.stockItemId || post.itemId);
}

function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

/**
 * Manual Add Stock. A matching spec is not saved as a second row.
 * confirmAdd folds the quantity into the existing row and keeps its location.
 * Rate is the quantity-weighted average.
 */
export function planManualStockSave(inventory, draft, { confirmAdd = false } = {}) {
  const existing = findInventoryItemBySpec(inventory, draft);
  const sameRow = existing && String(existing.id) === String(draft?.id || '');
  if (!existing || sameRow || draft?.isEdit) {
    return { action: 'save', item: draft, existing: sameRow ? existing : null };
  }
  if (!confirmAdd) return { action: 'duplicate', existing };
  const qty = Number(existing.availableQtyKg) || 0;
  const add = Number(draft.availableQtyKg) || 0;
  const oldRate = Number(existing.unitPrice ?? existing.purchaseRatePerKg) || 0;
  const newRate = Number(draft.unitPrice ?? draft.purchaseRatePerKg) || 0;
  const total = round2(qty + add);
  const rate = total > 0 ? round2(((qty * oldRate) + (add * newRate)) / (qty + add)) : oldRate;
  return {
    action: 'add',
    existing,
    item: {
      ...existing,
      availableQtyKg: total,
      unitPrice: rate,
      purchaseRatePerKg: rate,
      purchaseValuation: round2(total * rate),
      location: existing.location,
      lastVendor: draft.lastVendor || existing.lastVendor,
      lastBatch: draft.lastBatch || existing.lastBatch,
      lastUpdated: draft.lastUpdated || existing.lastUpdated
    }
  };
}
