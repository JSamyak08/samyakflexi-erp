/**
 * One stock ledger per item spec.
 * A goods receipt links by the stock item id from the PO line or the row
 * the store user picked. A name is used only when it matches one active item
 * of a compatible category exactly. Similar grades are different SKUs.
 */

import { isInventoryItemActive } from './inventoryArchive.js';

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

function categoryKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function categoryFamily(value) {
  const key = categoryKey(value);
  if (['film substrates', 'film', 'lamination films'].includes(key)) return 'film';
  if (['printing inks', 'inks', 'ink'].includes(key)) return 'ink';
  return key;
}

export function categoriesCompatible(left, right) {
  const a = categoryFamily(left);
  const b = categoryFamily(right);
  if (!a || !b) return true;
  if (a === 'raw materials' || a === 'raw material' || b === 'raw materials' || b === 'raw material') return true;
  return a === b;
}

function isFilmCategory(value) {
  return categoryFamily(value) === 'film';
}

function finiteMeasure(value) {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function filmToken(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** CODE-width-micron, optionally with a metallocene percent. Free text is not a SKU code. */
export function canonicalSkuName(name) {
  const text = displayItemName(name).toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9]+-\d+(?:\.\d+)?-\d+(?:\.\d+)?(?:-\d+%)?$/.test(text)) return '';
  return text;
}

function explicitIds(spec = {}) {
  const seen = new Set();
  const ids = [];
  [spec.stockItemId, spec.itemId, spec.masterItemId].forEach((value) => {
    const id = String(value || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

function filmTypesDisagree(spec, item) {
  if (!isFilmCategory(spec.category) && !isFilmCategory(item.category)) return false;
  const left = filmToken(spec.filmType);
  const right = filmToken(item.filmType);
  if (!left || !right) return false;
  return left !== right;
}

function filmMeasuresDisagree(spec, item) {
  if (!isFilmCategory(spec.category) && !isFilmCategory(item.category)) return false;
  const pairs = [
    [spec.micron, item.micron],
    [spec.widthMm !== undefined ? spec.widthMm : spec.width_mm, item.widthMm !== undefined ? item.widthMm : item.width_mm]
  ];
  return pairs.some(([left, right]) => {
    const a = finiteMeasure(left);
    const b = finiteMeasure(right);
    if (a === null || b === null) return false;
    return a !== b;
  });
}

function canonicalNamesDisagree(spec, item) {
  const wanted = canonicalSkuName(spec.itemName || spec.item_name);
  const got = canonicalSkuName(item.itemName || item.item_name);
  if (!wanted || !got) return false;
  return wanted !== got;
}

/**
 * The picked row is a different SKU than this receipt.
 * Grade, thickness, width, and category are not interchangeable.
 */
export function explicitLinkMismatch(spec, item) {
  if (!item) return '';
  const label = displayItemName(item.itemName) || item.id;
  if (!categoriesCompatible(spec.category, item.category)) {
    return `This receipt cannot be saved on "${label}" (${item.category || 'another category'}). Pick the stock item. Ink and film are different SKUs.`;
  }
  if (filmTypesDisagree(spec, item)) {
    return `This receipt is ${spec.filmType}, not ${item.filmType || label}. Pick the stock item. PET, METPET, and METBOPP do not match each other.`;
  }
  if (filmMeasuresDisagree(spec, item)) {
    return `This receipt does not match the thickness and width of "${label}". Pick the stock item. PET-410-12 and PET-410-13 are different SKUs.`;
  }
  if (canonicalNamesDisagree(spec, item)) {
    return `This receipt is for "${displayItemName(spec.itemName)}" but the linked stock item is "${label}" (${item.id}). Pick the item. A similar name is not the same SKU.`;
  }
  if (!isFilmCategory(spec.category) && !isFilmCategory(item.category)) {
    const wanted = normalizeItemName(spec.itemName || spec.item_name);
    const got = normalizeItemName(item.itemName || item.item_name);
    if (wanted && got && wanted !== got) {
      return `This receipt is for "${displayItemName(spec.itemName)}" but the linked stock item is "${label}" (${item.id}). Pick the item.`;
    }
  }
  return '';
}

export function filmReceiptNameConflict(typedName, formattedName) {
  const typed = normalizeItemName(typedName);
  const formatted = normalizeItemName(formattedName);
  if (!typed || !formatted || typed === formatted) return '';
  return `"${displayItemName(typedName)}" is not ${displayItemName(formattedName)}. Pick the stock item. A different grade, thickness, or width is not the same SKU.`;
}

function nameMatchPool(inventory, spec) {
  const wanted = normalizeItemName(spec.itemName || spec.item_name);
  if (!wanted) return { wanted, named: [], active: [] };
  const named = (inventory || []).filter((item) => normalizeItemName(item?.itemName || item?.item_name) === wanted);
  const active = named.filter((item) => (
    isInventoryItemActive(item)
    && categoriesCompatible(spec.category, item.category)
    && !filmTypesDisagree(spec, item)
    && !filmMeasuresDisagree(spec, item)
    && !canonicalNamesDisagree(spec, item)
  ));
  return { wanted, named, active };
}

/**
 * How a receipt line may be linked.
 * action "use" is one exact item. "create" means no existing SKU has this name.
 * "block" means the save must stop and ask the user to pick the item.
 */
function chooseNamedItem(spec, active) {
  if (active.length === 1) return { action: 'use', item: active[0], message: '' };
  if (active.length < 2) return null;
  const keys = new Set(active.map((item) => inventorySpecKey(item)));
  if (keys.size === 1) return { action: 'use', item: preferMasterItem(active), message: '' };
  return {
    action: 'block',
    item: null,
    message: `More than one active stock item is named "${displayItemName(spec.itemName)}". Pick the item before saving this receipt.`
  };
}

export function planReceiptStockLink(inventory, spec = {}) {
  const ids = explicitIds(spec);
  let mismatch = '';
  let archived = '';
  let sawExistingId = false;
  for (const id of ids) {
    const picked = findInventoryItemById(inventory, id);
    if (!picked) continue;
    sawExistingId = true;
    const problem = explicitLinkMismatch(spec, picked);
    if (problem) {
      mismatch = mismatch || problem;
      continue;
    }
    if (!isInventoryItemActive(picked)) {
      archived = archived || `Stock item "${displayItemName(picked.itemName) || id}" is archived. Pick an active item before saving this receipt.`;
      continue;
    }
    return { action: 'use', item: picked, message: '' };
  }
  if (mismatch) return { action: 'block', item: null, message: mismatch };
  if (archived) return { action: 'block', item: null, message: archived };

  const { wanted, named, active } = nameMatchPool(inventory, spec);
  if (!wanted) {
    if (ids.length) {
      return {
        action: 'block',
        item: null,
        message: `Stock item ${ids[0]} was not found. Pick the item before saving this receipt.`
      };
    }
    return { action: 'block', item: null, message: 'Pick a stock item before saving this receipt.' };
  }
  const chosen = chooseNamedItem(spec, active);
  if (chosen) return chosen;
  if (named.length > 0) {
    return {
      action: 'block',
      item: null,
      message: `No single active stock item matches "${displayItemName(spec.itemName)}". Pick the item. A different grade, thickness, width, or category (ink and film, for example) is not the same SKU.`
    };
  }
  if (ids.length && !sawExistingId) {
    return {
      action: 'block',
      item: null,
      message: `Stock item ${ids[0]} was not found. Pick the item before saving this receipt.`
    };
  }
  return { action: 'create', item: null, message: '' };
}

/**
 * The item a receipt line should post to.
 * The PO line or selected item id wins when that row is the same SKU.
 * Otherwise one exact active name. Never a different grade.
 */
export function resolveReceiptItem(inventory, spec = {}) {
  const plan = planReceiptStockLink(inventory, spec);
  return plan.action === 'use' ? plan.item : null;
}

/**
 * QC posts onto the master the user picked when that row is still this SKU,
 * then one exact name, then the lot id. A different grade is not a target.
 * Historical receipts stored the new lot as stockItemId and the picked row as masterItemId.
 */
export function resolveQcStockTarget(inventory, post = {}) {
  const master = findInventoryItemById(inventory, post.masterItemId);
  if (master && isInventoryItemActive(master) && !explicitLinkMismatch(post, master)) return master;
  const byName = planReceiptStockLink(inventory, {
    itemName: post.itemName,
    category: post.category,
    filmType: post.filmType,
    micron: post.micron,
    widthMm: post.widthMm
  });
  if (byName.action === 'use') return byName.item;
  const lot = findInventoryItemById(inventory, post.stockItemId || post.itemId);
  if (lot && isInventoryItemActive(lot) && !explicitLinkMismatch(post, lot)) return lot;
  return null;
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
