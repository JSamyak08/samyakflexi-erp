/**
 * HSN for an ink master and for purchase-order lines.
 * The ink form saves hsnCode. The database column is hsn_code.
 * Older shapes may carry hsn, hsnSac, hsn_sac, or a notes object.
 */

const DIRECT_KEYS = ['hsnCode', 'hsn_code', 'hsn', 'hsnSac', 'hsn_sac'];

function textCode(value) {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return '';
  return value.trim();
}

function hsnFromNotes(notes) {
  if (!notes) return '';
  if (typeof notes === 'object') {
    for (const key of DIRECT_KEYS) {
      const text = textCode(notes[key]);
      if (text) return text;
    }
    return '';
  }
  if (typeof notes !== 'string') return '';
  const trimmed = notes.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const fromJson = hsnFromNotes(parsed);
        if (fromJson) return fromJson;
      }
    } catch {
      // Plain notes text.
    }
  }
  const labeled = trimmed.match(/\bHSN(?:\s*CODE|\s*\/\s*SAC)?\s*[:#-]?\s*([0-9]{4,8})\b/i);
  return labeled ? labeled[1] : '';
}

export function readHsnCode(record) {
  if (!record || typeof record !== 'object') return '';
  for (const key of DIRECT_KEYS) {
    const text = textCode(record[key]);
    if (text) return text;
  }
  return hsnFromNotes(record.notes);
}

export function purchaseLineHsn(item, fallback = '') {
  return readHsnCode(item) || fallback;
}

export function joinMissingFields(fields) {
  const unique = [];
  for (const field of fields || []) {
    const name = String(field || '').trim();
    if (!name || unique.includes(name)) continue;
    unique.push(name);
  }
  return unique.join(', ');
}

export function missingInkCommercialFields(ink) {
  const missing = [];
  if (!String(ink?.manufacturer || '').trim()) missing.push('manufacturer');
  if (!readHsnCode(ink)) missing.push('HSN');
  const solids = Number(ink?.solidContentPct);
  if (!Number.isFinite(solids) || solids <= 0) missing.push('solid content');
  const variation = Number(ink?.solidVariationPct);
  if (!Number.isFinite(variation) || variation < 0) missing.push('solid variation');
  const rate = Number(ink?.pricePerKg ?? ink?.rate);
  if (!Number.isFinite(rate) || rate <= 0) missing.push('rate');
  return missing;
}

export function inkPurchaseBlockMessage(ink) {
  const missing = missingInkCommercialFields(ink);
  if (!missing.length) return '';
  const name = String(ink?.productCode || ink?.shade || 'An ink').trim() || 'An ink';
  const list = joinMissingFields(missing);
  return `${name} is missing ${list}. Set ${list} on the ink before raising a purchase order.`;
}

export function buildInkPoLine(ink, settings = { minPoQtyKg: 100, defaultReorderLevelKg: 50 }) {
  const message = inkPurchaseBlockMessage(ink);
  if (message) return { error: message };
  const minPoQtyKg = Number(settings?.minPoQtyKg);
  const defaultReorderLevelKg = Number(settings?.defaultReorderLevelKg);
  if (!Number.isFinite(minPoQtyKg) || minPoQtyKg < 0 || !Number.isFinite(defaultReorderLevelKg) || defaultReorderLevelKg < 0) {
    return { error: 'Ink purchase quantity settings are missing. Set minPoQtyKg and defaultReorderLevelKg in Document Settings before raising a purchase order.' };
  }
  const hasReorder = ink.reorderLevelKg !== '' && ink.reorderLevelKg != null && Number.isFinite(Number(ink.reorderLevelKg));
  const reorder = hasReorder ? Number(ink.reorderLevelKg) : defaultReorderLevelKg;
  const stock = Number(ink.stockQtyKg) || 0;
  return {
    item: {
      id: ink.id,
      productCode: ink.productCode,
      shade: ink.shade,
      inkType: ink.inkType,
      solidContentPct: Number(ink.solidContentPct),
      solidVariationPct: Number(ink.solidVariationPct),
      manufacturer: String(ink.manufacturer).trim(),
      hsnCode: readHsnCode(ink),
      qtyKg: Math.max(minPoQtyKg, Math.ceil((reorder * 2) - stock)),
      rate: Number(ink.pricePerKg),
    },
  };
}

export function mapInkRowToMaster(row) {
  if (!row) return null;
  return {
    id: row.id,
    productCode: row.product_code,
    shade: row.shade,
    inkType: row.ink_type || 'Reverse Ink',
    manufacturer: row.manufacturer,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    solidContentPct: parseFloat(row.solid_content_pct) || 40,
    solidVariationPct: parseFloat(row.solid_variation_pct) || 2,
    pricePerKg: parseFloat(row.price_per_kg) || 0,
    stockQtyKg: parseFloat(row.stock_qty_kg) || 0,
    reorderLevelKg: parseFloat(row.reorder_level_kg) || 0,
    unit: row.unit || 'Kg',
    solventType: row.solvent_type || '',
    notes: row.notes || '',
    hsnCode: readHsnCode(row),
    priceHistory: row.price_history || [],
    createdAt: row.created_at,
    lastUpdated: row.last_updated,
  };
}

export function mapInkMasterToRow(ink) {
  const payload = {
    id: ink.id,
    product_code: ink.productCode,
    shade: ink.shade,
    ink_type: ink.inkType || 'Reverse Ink',
    manufacturer: ink.manufacturer || '',
    supplier_id: ink.supplierId || null,
    supplier_name: ink.supplierName || '',
    solid_content_pct: parseFloat(ink.solidContentPct) || 40,
    solid_variation_pct: parseFloat(ink.solidVariationPct) || 2,
    price_per_kg: parseFloat(ink.pricePerKg) || 0,
    stock_qty_kg: parseFloat(ink.stockQtyKg) || 0,
    reorder_level_kg: parseFloat(ink.reorderLevelKg) || 0,
    unit: ink.unit || 'Kg',
    solvent_type: ink.solventType || '',
    notes: ink.notes || '',
    price_history: ink.priceHistory || [],
  };
  const hsn = readHsnCode(ink);
  if (hsn) payload.hsn_code = hsn;
  return payload;
}
