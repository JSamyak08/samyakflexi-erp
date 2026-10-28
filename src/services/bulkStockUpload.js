/**
 * Bulk stock CSV: one stock item per item name, one roll per film row.
 * Inventory ids are generated. They are never read from the file.
 */

import {
  calculateFilmRollLength,
  FILM_DENSITIES,
  generateBarcodeId,
  generateInventoryId
} from '../factoryStore.js';

export const BULK_STOCK_CATEGORIES = [
  'Film Substrates',
  'Printing Inks',
  'Chemicals & Solvents',
  'Adhesives & Hardener',
  'Doctor Blades & Wipers',
  'Rollers & Sleeves',
  'Machine Spare Parts',
  'Lubricants & Oils',
  'Tapes & Consumables',
  'Safety Gear (PPE)',
  'Packaging & Cores',
  'Other Raw Materials'
];

export const BULK_STOCK_CSV_COLUMNS = [
  'Category',
  'ItemName',
  'SubstrateOrGrade',
  'Micron',
  'WidthMm',
  'WeightKg',
  'Barcode',
  'UOM',
  'Location',
  'ReorderLevel',
  'LastVendor',
  'LastBatch',
  'UnitCostRs'
];

export const BULK_STOCK_SAMPLE_ROWS = [
  ['Film Substrates', 'PET 12 Micron 1000mm', 'PET', '12', '1000', '250.5', 'RM-BC-20261028-1001', 'Kg', 'Bay A - Rack 1', '500', 'FlexiPoly Films Ltd', 'BATCH-PET-101', '135'],
  ['Film Substrates', 'pet 12 micron 1000mm', 'PET', '12', '1000', '180', 'RM-BC-20261028-1002', 'Kg', 'Bay A - Rack 1', '500', 'FlexiPoly Films Ltd', 'BATCH-PET-101', '135'],
  ['Film Substrates', 'PET 12 Micron 1000mm', 'PET', '12', '1000', '95.25', '', 'Kg', 'Bay A - Rack 1', '500', 'FlexiPoly Films Ltd', 'BATCH-PET-101', '135'],
  ['Printing Inks', 'Cyan Solvent Printing Ink', 'Cyan Process Ink', '', '', '40', '', 'Kg', 'Ink Store Bay 1', '20', 'Siegwerk Inks Ltd', 'INK-CY-882', '240']
];

export const OPENING_RECEIPT_TYPE = 'Opening Stock Receipt (Bulk Upload)';

const FILM_CATEGORIES = new Set(['film substrates', 'film', 'lamination films']);

export function itemNameKey(name) {
  return String(name || '').trim().toLowerCase();
}

export function barcodeKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function isFilmCategory(category) {
  return FILM_CATEGORIES.has(String(category || '').trim().toLowerCase());
}

export function isOpeningStockReceipt(adjustment) {
  return String(adjustment?.type || '') === OPENING_RECEIPT_TYPE;
}

export function inventoryDbColumns(item = {}) {
  const category = item.category || 'Film Substrates';
  const isFilm = isFilmCategory(category);
  return {
    category,
    film_type: isFilm ? (item.filmType || null) : null,
    micron: numericOrNull(isFilm ? item.micron : null),
    width_mm: numericOrNull(isFilm ? item.widthMm : null),
    allocated_qty_kg: Number(item.allocatedQtyKg ?? 0) || 0,
    reorder_level_kg: Number(item.reorderLevelKg ?? 0) || 0,
    unit: item.unit || 'Kg',
    density: numericOrNull(item.density),
    location: item.location || null,
    last_vendor: item.lastVendor || null,
    last_batch: item.lastBatch || null
  };
}

function numericOrNull(value) {
  if (value === undefined || value === null || value === '' || value === '-') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function sampleBulkStockCsv() {
  return `\uFEFF${toCsv([BULK_STOCK_CSV_COLUMNS, ...BULK_STOCK_SAMPLE_ROWS])}`;
}

export function bulkErrorReportCsv(plan) {
  const header = ['Row', 'ItemName', 'Category', 'Barcode', 'WeightKg', 'Errors'];
  const lines = (plan?.rows || [])
    .filter((row) => row.errors && row.errors.length)
    .map((row) => [
      row.lineNumber,
      row.itemName || '',
      row.category || '',
      row.barcode || '',
      row.weightText || '',
      row.errors.join('; ')
    ]);
  return toCsv([header, ...lines]);
}

function parseCsvLine(lineStr, delim = ',') {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < lineStr.length; i += 1) {
    const ch = lineStr[i];
    if (ch === '"') {
      if (inQuotes && lineStr[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      cells.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim().replace(/^["']|["']$/g, ''));
  return cells;
}

function parseWeight(val) {
  if (val === undefined || val === null) return { ok: false, value: NaN, text: '' };
  const text = String(val).trim();
  if (!text) return { ok: false, value: NaN, text };
  let cleaned = text;
  if (cleaned.includes(',') && cleaned.includes('.')) cleaned = cleaned.replace(/,/g, '');
  else if (cleaned.includes(',') && !cleaned.includes('.')) {
    cleaned = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  }
  const numericOnly = cleaned.replace(/[^0-9.-]/g, '');
  if (!numericOnly || numericOnly === '-' || numericOnly === '.' || numericOnly === '-.') {
    return { ok: false, value: NaN, text };
  }
  const n = Number(numericOnly);
  if (!Number.isFinite(n)) return { ok: false, value: NaN, text };
  return { ok: true, value: round2(n), text };
}

function parseOptionalNumber(val) {
  const text = String(val ?? '').trim();
  if (!text) return { ok: true, value: null };
  const parsed = parseWeight(text);
  if (!parsed.ok) return { ok: false, value: null };
  return { ok: true, value: parsed.value };
}

function classifyHeader(cleanH) {
  if (!cleanH) return '';
  if (
    cleanH === 'id'
    || cleanH === 'inventoryid'
    || cleanH.includes('inventoryid')
    || cleanH.includes('itemcode')
    || cleanH.includes('stockid')
  ) return 'inventoryId';
  if (cleanH.includes('barcode') || cleanH === 'rollno' || cleanH.includes('rollbarcode')) return 'barcode';
  if (cleanH.includes('category')) return 'category';
  if (cleanH.includes('substrate') || cleanH.includes('grade') || cleanH.includes('filmtype') || cleanH.includes('polymer')) return 'substrate';
  if (cleanH.includes('micron') || cleanH.includes('gauge')) return 'micron';
  if (cleanH.includes('width')) return 'width';
  if (
    cleanH.includes('weight')
    || cleanH.includes('availableqty')
    || cleanH === 'qty'
    || cleanH.includes('quantity')
    || (cleanH.includes('stock') && !cleanH.includes('id') && !cleanH.includes('reorder'))
  ) return 'weight';
  if (
    cleanH.includes('unitcost')
    || cleanH.includes('unitprice')
    || cleanH.includes('purchaserate')
    || cleanH.includes('price')
    || cleanH.includes('cost')
    || (cleanH.includes('rate') && !cleanH.includes('substrate') && !cleanH.includes('grade') && !cleanH.includes('reorder'))
  ) return 'unitCost';
  if (
    cleanH === 'uom'
    || cleanH.includes('uom')
    || cleanH.includes('unitofmeasure')
    || (cleanH.includes('unit') && !cleanH.includes('cost') && !cleanH.includes('price') && !cleanH.includes('rate'))
  ) return 'uom';
  if (cleanH.includes('location') || cleanH.includes('bay') || cleanH.includes('rack') || cleanH.includes('store')) return 'location';
  if (cleanH.includes('reorder')) return 'reorder';
  if (cleanH.includes('vendor') || cleanH.includes('supplier')) return 'vendor';
  if (cleanH.includes('batch') || cleanH.includes('lot')) return 'batch';
  if (
    cleanH.includes('itemname')
    || cleanH === 'item'
    || cleanH.includes('title')
    || cleanH.includes('description')
    || (cleanH.includes('name') && !cleanH.includes('vendor') && !cleanH.includes('supplier'))
  ) return 'itemName';
  return '';
}

function looksLikeInventoryId(value) {
  return /^(invt|inv|sku|id)[-_\s]?\d+/i.test(String(value || '').trim());
}

function resolveCategory(rawCategory, { categories, categoryFallback, itemName, substrate }) {
  const allowed = categories && categories.length ? categories : BULK_STOCK_CATEGORIES;
  const text = String(rawCategory || '').trim();
  if (text) {
    const match = allowed.find((category) => category.toLowerCase() === text.toLowerCase());
    if (match) return { category: match, error: '' };
    return { category: text, error: `Unknown category "${text}". Use one of: ${allowed.join(', ')}.` };
  }
  const fallback = String(categoryFallback || '').trim();
  if (fallback && fallback !== 'ALL') {
    const match = allowed.find((category) => category.toLowerCase() === fallback.toLowerCase());
    if (match) return { category: match, error: '' };
  }
  const combo = `${itemName} ${substrate}`.toLowerCase();
  if (combo.trim()) {
    if (combo.includes('ink') || combo.includes('cyan') || combo.includes('magenta') || combo.includes('yellow')) {
      return { category: 'Printing Inks', error: '' };
    }
    if (combo.includes('acetate') || combo.includes('solvent') || combo.includes('toluene') || combo.includes('ipa')) {
      return { category: 'Chemicals & Solvents', error: '' };
    }
    if (combo.includes('adhesive') || combo.includes('hardener') || combo.includes('glue')) {
      return { category: 'Adhesives & Hardener', error: '' };
    }
    if (combo.includes('core') || combo.includes('carton') || combo.includes('box')) {
      return { category: 'Packaging & Cores', error: '' };
    }
    if (combo.includes('tape') || combo.includes('stretch')) return { category: 'Tapes & Consumables', error: '' };
  }
  return { category: '', error: 'Category is missing.' };
}

function fingerprintFor(row) {
  return [
    row.nameKey,
    round2(row.weight),
    row.givenBarcode ? barcodeKey(row.givenBarcode) : '',
    String(row.lastBatch || '').trim().toLowerCase(),
    String(row.lastVendor || '').trim().toLowerCase()
  ].join('|');
}

export function allocateUniqueInventoryId(existingItems = [], reserved = [], generateId = generateInventoryId) {
  const pool = [...(existingItems || [])];
  const taken = new Set((reserved || []).map((id) => String(id)));
  for (let attempt = 0; attempt < 100000; attempt += 1) {
    const candidate = String(generateId(pool) || '').trim();
    const clash = !candidate
      || taken.has(candidate)
      || pool.some((item) => String(item?.id || '') === candidate || String(item?.itemCode || '') === candidate);
    if (!clash) return candidate;
    pool.push({ id: candidate || `BLOCK-${attempt}` });
    if (candidate) taken.add(candidate);
  }
  throw new Error('Could not allocate a unique inventory id.');
}

function nextRollBarcode(taken, { now, generateBarcode, prefix }) {
  const generator = generateBarcode || generateBarcodeId;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const code = String(generator(prefix) || '').trim();
    const key = barcodeKey(code);
    if (key && code.toUpperCase().startsWith(`${prefix}-`) && !taken.has(key)) {
      taken.add(key);
      return code;
    }
  }
  const dateStr = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10).replace(/-/g, '');
  for (let n = 1; n < 100000; n += 1) {
    const code = `${prefix}-${dateStr}-${String(n).padStart(4, '0')}`;
    const key = barcodeKey(code);
    if (!taken.has(key)) {
      taken.add(key);
      return code;
    }
  }
  throw new Error('Could not generate a unique roll barcode.');
}

function existingNameIndex(inventory) {
  const map = new Map();
  (inventory || []).forEach((item) => {
    const key = itemNameKey(item?.itemName);
    if (!key || map.has(key)) return;
    map.set(key, item);
  });
  return map;
}

function existingBarcodeIndex(rolls) {
  const set = new Set();
  (rolls || []).forEach((roll) => {
    const key = barcodeKey(roll?.barcodeId || roll?.barcode_id || roll?.id);
    if (key) set.add(key);
  });
  return set;
}

function existingFingerprints(rolls, adjustments) {
  const set = new Set();
  (rolls || []).forEach((roll) => {
    const value = roll?.bulkUploadFingerprint || roll?.metadata?.bulkUploadFingerprint || '';
    if (value) set.add(String(value));
  });
  (adjustments || []).forEach((adjustment) => {
    if (adjustment?.bulkUploadFingerprint) set.add(String(adjustment.bulkUploadFingerprint));
    (Array.isArray(adjustment?.bulkUploadFingerprints) ? adjustment.bulkUploadFingerprints : [])
      .forEach((value) => {
        if (value) set.add(String(value));
      });
  });
  return set;
}

/**
 * Parse a stock CSV into grouped items and per-row errors.
 * Rows that share a trimmed, case-insensitive item name are one stock item.
 * An inventory row with that same name receives the new rolls.
 */
export function parseBulkStockCsv(text, {
  inventory = [],
  rolls = [],
  adjustments = [],
  categories = BULK_STOCK_CATEGORIES,
  categoryFallback = '',
  now = new Date(),
  generateBarcode,
  generateId
} = {}) {
  const notices = [];
  const source = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = source.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  if (rawLines.length === 0) {
    return { notices, rows: [], groups: [], importableCount: 0, error: 'CSV file is completely empty.' };
  }

  const headerLine = rawLines[0];
  let delim = ',';
  if (headerLine.includes('\t')) delim = '\t';
  else if (headerLine.includes(';') && headerLine.split(';').length > headerLine.split(',').length) delim = ';';

  const headerCells = parseCsvLine(headerLine, delim);
  const headerMap = {};
  headerCells.forEach((header, index) => {
    const field = classifyHeader(header.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (field && headerMap[field] === undefined) headerMap[field] = index;
  });

  const hasNamedHeaders = ['itemName', 'category', 'weight', 'barcode'].some((field) => headerMap[field] !== undefined);
  if (headerMap.inventoryId !== undefined) {
    notices.push('The Inventory ID column was ignored. Stock ids are generated automatically and are not taken from the file.');
  }

  const startIndex = hasNamedHeaders ? 1 : 0;
  const positionalShift = !hasNamedHeaders && looksLikeInventoryId(headerCells[0]);
  if (positionalShift) {
    notices.push('The first column looked like an Inventory ID and was ignored. Stock ids are generated automatically.');
  }

  const readCell = (cells, field, positionalIndex) => {
    if (hasNamedHeaders) {
      if (headerMap[field] === undefined) return '';
      return cells[headerMap[field]] || '';
    }
    const index = positionalIndex + (positionalShift ? 1 : 0);
    return cells[index] || '';
  };

  const draftRows = [];
  for (let i = startIndex; i < rawLines.length; i += 1) {
    const cells = parseCsvLine(rawLines[i], delim);
    if (cells.every((cell) => !String(cell || '').trim())) continue;
    const lineNumber = i + 1;
    const errors = [];
    const itemName = String(readCell(cells, 'itemName', 1) || '').trim();
    const substrate = String(readCell(cells, 'substrate', 2) || '').trim();
    const categoryResult = resolveCategory(readCell(cells, 'category', 0), {
      categories,
      categoryFallback,
      itemName,
      substrate
    });
    if (categoryResult.error) errors.push(categoryResult.error);
    if (!itemName) errors.push('Item name is missing.');

    const weight = parseWeight(readCell(cells, 'weight', 5));
    if (!weight.ok) errors.push(`Weight "${weight.text || readCell(cells, 'weight', 5) || ''}" is not a number.`.replace('Weight "" is not a number.', 'Weight is missing or not a number.'));
    else if (weight.value < 0) errors.push(`Weight ${weight.value} cannot be negative.`);
    else if (weight.value === 0) errors.push('Weight must be greater than zero.');

    const micron = parseOptionalNumber(readCell(cells, 'micron', 3));
    const width = parseOptionalNumber(readCell(cells, 'width', 4));
    if (!micron.ok) errors.push('Micron is not a number.');
    if (!width.ok) errors.push('Width is not a number.');

    const reorder = parseOptionalNumber(readCell(cells, 'reorder', 9));
    const unitCost = parseOptionalNumber(readCell(cells, 'unitCost', 12));
    if (!reorder.ok) errors.push('Reorder level is not a number.');
    if (!unitCost.ok) errors.push('Unit cost is not a number.');
    if (unitCost.ok && unitCost.value !== null && unitCost.value < 0) errors.push('Unit cost cannot be negative.');

    const givenBarcode = String(readCell(cells, 'barcode', 6) || '').trim();
    const category = categoryResult.category;
    const isRoll = isFilmCategory(category) && !categoryResult.error;
    if (!isRoll && givenBarcode && !categoryResult.error) {
      notices.push(`Row ${lineNumber}: barcode ${givenBarcode} was ignored because ${category || 'this item'} is not a film roll.`);
    }

    draftRows.push({
      lineNumber,
      itemName,
      nameKey: itemNameKey(itemName),
      category,
      substrateOrGrade: substrate || itemName,
      micron: micron.ok ? micron.value : null,
      widthMm: width.ok ? width.value : null,
      weight: weight.ok ? weight.value : null,
      weightText: weight.text || String(readCell(cells, 'weight', 5) || ''),
      givenBarcode: isRoll ? givenBarcode : '',
      barcode: isRoll ? givenBarcode : '',
      barcodeSource: isRoll && givenBarcode ? 'given' : 'none',
      unit: String(readCell(cells, 'uom', 7) || '').trim() || (isRoll ? 'Kg' : 'Kg'),
      location: String(readCell(cells, 'location', 8) || '').trim() || 'Main Factory Store',
      reorderLevel: reorder.ok && reorder.value !== null ? reorder.value : 1000,
      lastVendor: String(readCell(cells, 'vendor', 10) || '').trim() || 'Local Vendor',
      lastBatch: String(readCell(cells, 'batch', 11) || '').trim() || 'BULK-BATCH',
      unitPrice: unitCost.ok && unitCost.value !== null ? unitCost.value : 0,
      isRoll,
      errors,
      blocked: false
    });
  }

  const barcodeCounts = new Map();
  draftRows.forEach((row) => {
    const key = barcodeKey(row.givenBarcode);
    if (!key) return;
    barcodeCounts.set(key, (barcodeCounts.get(key) || 0) + 1);
  });
  const dbBarcodes = existingBarcodeIndex(rolls);
  draftRows.forEach((row) => {
    const key = barcodeKey(row.givenBarcode);
    if (!key) return;
    if ((barcodeCounts.get(key) || 0) > 1) {
      row.errors.push(`Barcode ${row.givenBarcode} is repeated in this file.`);
    }
    if (dbBarcodes.has(key)) {
      row.errors.push(`Barcode ${row.givenBarcode} already exists in stock.`);
    }
  });

  const takenBarcodes = new Set(dbBarcodes);
  draftRows.forEach((row) => {
    const key = barcodeKey(row.givenBarcode);
    if (key) takenBarcodes.add(key);
  });
  draftRows.forEach((row) => {
    if (!row.isRoll || row.givenBarcode || row.errors.length) return;
    const code = nextRollBarcode(takenBarcodes, { now, generateBarcode, prefix: 'RM-BC' });
    row.barcode = code;
    row.barcodeSource = 'auto';
  });

  const seenFingerprints = new Set(existingFingerprints(rolls, adjustments));
  const fileFingerprints = new Set();
  draftRows.forEach((row) => {
    if (row.errors.length || !row.nameKey || row.weight === null) return;
    row.bulkUploadFingerprint = fingerprintFor(row);
    if (seenFingerprints.has(row.bulkUploadFingerprint)) {
      row.errors.push('This row matches a roll or quantity that was already uploaded.');
      return;
    }
    if (fileFingerprints.has(row.bulkUploadFingerprint)) {
      row.errors.push('This row repeats another row in the file for the same item, weight, batch, and barcode.');
      return;
    }
    fileFingerprints.add(row.bulkUploadFingerprint);
  });

  draftRows.forEach((row) => {
    row.blocked = row.errors.length > 0;
  });

  const byName = new Map();
  const rows = [];
  draftRows.forEach((row) => {
    rows.push(row);
    if (!row.nameKey) return;
    if (!byName.has(row.nameKey)) byName.set(row.nameKey, []);
    byName.get(row.nameKey).push(row);
  });

  const nameIndex = existingNameIndex(inventory);
  const reservedIds = [];
  const groups = [];
  byName.forEach((groupRows) => {
    const firstNamed = groupRows.find((row) => row.itemName) || groupRows[0];
    const categoryRow = groupRows.find((row) => row.category && !row.errors.some((error) => error.startsWith('Unknown category') || error === 'Category is missing.'));
    const category = categoryRow?.category || firstNamed.category || '';
    groupRows.forEach((row) => {
      if (!row.blocked && category && row.category && row.category.toLowerCase() !== category.toLowerCase()) {
        row.errors.push(`Category "${row.category}" does not match the other rows named "${firstNamed.itemName}".`);
        row.blocked = true;
        row.isRoll = false;
      }
    });
    const importable = groupRows.filter((row) => !row.blocked);
    const sameName = (inventory || []).filter((item) => itemNameKey(item?.itemName) === firstNamed.nameKey);
    const existing = nameIndex.get(firstNamed.nameKey) || null;
    if (sameName.length > 1 && existing) {
      notices.push(`More than one inventory item is named "${firstNamed.itemName}". New rolls are added to ${existing.id}.`);
    }
    let plannedId = existing ? String(existing.id) : '';
    if (!existing && importable.length) {
      plannedId = allocateUniqueInventoryId(inventory, reservedIds, generateId || generateInventoryId);
      reservedIds.push(plannedId);
    }
    const importableRolls = importable.filter((row) => row.isRoll);
    const importableQty = importable.filter((row) => !row.isRoll);
    const addKg = round2([...importableRolls, ...importableQty].reduce((sum, row) => sum + (Number(row.weight) || 0), 0));
    const spec = importable[0] || firstNamed;
    groups.push({
      nameKey: firstNamed.nameKey,
      itemName: firstNamed.itemName,
      category: existing?.category || category,
      csvCategory: category,
      substrateOrGrade: spec.substrateOrGrade || firstNamed.itemName,
      micron: spec.micron,
      widthMm: spec.widthMm,
      unit: spec.unit || 'Kg',
      location: spec.location,
      reorderLevel: spec.reorderLevel,
      lastVendor: spec.lastVendor,
      lastBatch: spec.lastBatch,
      unitPrice: spec.unitPrice,
      existingItem: existing ? {
        id: existing.id,
        itemCode: existing.itemCode || existing.id,
        itemName: existing.itemName,
        category: existing.category || '',
        availableQtyKg: Number(existing.availableQtyKg ?? existing.availableQty ?? 0) || 0,
        unit: existing.unit || 'Kg'
      } : null,
      match: existing ? 'existing' : 'new',
      plannedId,
      rollCount: importableRolls.length,
      quantityRowCount: importableQty.length,
      totalKg: addKg,
      addKg,
      blockedCount: groupRows.filter((row) => row.blocked).length,
      rows: groupRows
    });
  });

  const importableCount = rows.filter((row) => !row.blocked).length;
  groups.forEach((group) => {
    const importable = group.rows.filter((row) => !row.blocked);
    const importableRolls = importable.filter((row) => row.isRoll);
    const importableQty = importable.filter((row) => !row.isRoll);
    group.rollCount = importableRolls.length;
    group.quantityRowCount = importableQty.length;
    group.totalKg = round2(importable.reduce((sum, row) => sum + (Number(row.weight) || 0), 0));
    group.addKg = group.totalKg;
    group.blockedCount = group.rows.filter((row) => row.blocked).length;
  });
  return {
    notices: [...new Set(notices)],
    rows,
    groups,
    importableCount,
    blockedCount: rows.length - importableCount,
    error: rows.length === 0 ? 'No inventory rows could be read from the CSV file.' : ''
  };
}

export function buildBulkImportPayload(plan, {
  inventory = [],
  now = new Date(),
  adjustedBy = 'Store Manager'
} = {}) {
  const stamp = now instanceof Date ? now : new Date(now);
  const nowIso = stamp.toISOString();
  const items = [];
  const rolls = [];
  const adjustments = [];
  let createdCount = 0;
  let updatedCount = 0;

  (plan?.groups || []).forEach((group) => {
    const importable = (group.rows || []).filter((row) => !row.blocked);
    if (!importable.length) return;
    const fullExisting = group.existingItem
      ? (inventory || []).find((item) => String(item.id) === String(group.existingItem.id)) || group.existingItem
      : null;
    const addKg = round2(importable.reduce((sum, row) => sum + (Number(row.weight) || 0), 0));
    const isFilm = isFilmCategory(fullExisting?.category || group.category);
    const category = fullExisting?.category || group.category;
    const itemId = fullExisting ? String(fullExisting.id) : group.plannedId;
    const itemName = fullExisting?.itemName || group.itemName;
    const spec = importable[0];
    const unitPrice = Number(spec.unitPrice) > 0
      ? Number(spec.unitPrice)
      : Number(fullExisting?.unitPrice || fullExisting?.purchaseRatePerKg || 0);
    const previousQty = Number(fullExisting?.availableQtyKg ?? fullExisting?.availableQty ?? 0) || 0;
    const nextQty = round2(previousQty + addKg);

    if (fullExisting) {
      items.push({
        ...fullExisting,
        availableQtyKg: nextQty,
        availableQty: nextQty,
        unitPrice: unitPrice || fullExisting.unitPrice || 0,
        purchaseRatePerKg: unitPrice || fullExisting.purchaseRatePerKg || 0,
        location: spec.location || fullExisting.location,
        reorderLevelKg: Number(spec.reorderLevel) > 0 ? Number(spec.reorderLevel) : (fullExisting.reorderLevelKg || fullExisting.reorderLevel || 1000),
        reorderLevel: Number(spec.reorderLevel) > 0 ? Number(spec.reorderLevel) : (fullExisting.reorderLevel || 1000),
        lastVendor: spec.lastVendor || fullExisting.lastVendor,
        vendor: spec.lastVendor || fullExisting.vendor,
        lastBatch: spec.lastBatch || fullExisting.lastBatch,
        category
      });
      updatedCount += 1;
    } else {
      const substrate = spec.substrateOrGrade || group.substrateOrGrade || itemName;
      items.push({
        id: itemId,
        itemCode: itemId,
        itemName,
        preserveItemName: true,
        category,
        substrateOrGrade: substrate,
        filmType: isFilm ? substrate : '',
        grade: isFilm ? substrate : '',
        micron: isFilm ? (spec.micron ?? 0) : '-',
        widthMm: isFilm ? (spec.widthMm ?? 0) : '-',
        density: FILM_DENSITIES[substrate] || (isFilm ? 1.4 : 1),
        unit: spec.unit || 'Kg',
        availableQtyKg: nextQty,
        availableQty: nextQty,
        allocatedQtyKg: 0,
        location: spec.location || 'Main Factory Store',
        reorderLevelKg: Number(spec.reorderLevel) || 1000,
        reorderLevel: Number(spec.reorderLevel) || 1000,
        lastVendor: spec.lastVendor || 'Local Vendor',
        vendor: spec.lastVendor || 'Local Vendor',
        lastBatch: spec.lastBatch || 'BULK-BATCH',
        unitPrice,
        purchaseRatePerKg: unitPrice,
        createdDate: nowIso
      });
      createdCount += 1;
    }

    importable.filter((row) => row.isRoll).forEach((row) => {
      const lengthMeters = isFilm
        ? calculateFilmRollLength(row.weight, row.widthMm, row.micron, row.substrateOrGrade || itemName)
        : '';
      rolls.push({
          id: row.barcode,
          barcodeId: row.barcode,
          rollType: 'RAW_MATERIAL',
          itemId,
          itemName,
          category,
          filmType: isFilm ? (row.substrateOrGrade || fullExisting?.filmType || '') : '',
          micron: row.micron || 0,
          widthMm: row.widthMm || 0,
          unit: row.unit || 'Kg',
          packagingType: 'Roll',
          inwardDatetime: nowIso,
          vendorName: row.lastVendor || '',
          batchNo: row.lastBatch || 'BULK-BATCH',
          grossWeightKg: row.weight,
          tareWeightKg: 0,
          netWeightKg: row.weight,
          availableWeightKg: row.weight,
          lengthMeters: lengthMeters || 0,
          purchaseRatePerKg: row.unitPrice || unitPrice || 0,
          unitPrice: row.unitPrice || unitPrice || 0,
          stationId: 'SCALE_1_INWARD',
          locationBay: row.location || 'Bay A',
          status: 'In Stock',
          qcStatus: 'Approved',
          bulkUploadFingerprint: row.bulkUploadFingerprint,
          itemRemarks: 'Opening stock receipt (bulk upload)',
          remarks: 'Opening stock receipt (bulk upload)'
        });
        adjustments.push({
          id: `BULK-RCPT-${row.barcode}`,
          itemId,
          itemCode: itemId,
          itemName,
          category,
          filmType: isFilm ? (row.substrateOrGrade || '') : '',
          micron: row.micron || '-',
          widthMm: row.widthMm || '-',
          date: nowIso,
          type: OPENING_RECEIPT_TYPE,
          qtyKg: row.weight,
          barcode: row.barcode,
          reason: 'Opening stock receipt (bulk upload)',
          adjustedBy,
          bulkUploadFingerprint: row.bulkUploadFingerprint
        });
    });
    const qtyRows = importable.filter((row) => !row.isRoll);
    if (qtyRows.length) {
      const qty = round2(qtyRows.reduce((sum, row) => sum + (Number(row.weight) || 0), 0));
      adjustments.push({
        id: `BULK-RCPT-${itemId}-${qtyRows[0].lineNumber}`,
        itemId,
        itemCode: itemId,
        itemName,
        category,
        date: nowIso,
        type: OPENING_RECEIPT_TYPE,
        qtyKg: qty,
        barcode: '',
        reason: 'Opening stock receipt (bulk upload)',
        adjustedBy,
        bulkUploadFingerprint: qtyRows.length === 1 ? qtyRows[0].bulkUploadFingerprint : '',
        bulkUploadFingerprints: qtyRows.map((row) => row.bulkUploadFingerprint).filter(Boolean)
      });
    }
  });

  return {
    items,
    rolls,
    adjustments,
    createdCount,
    updatedCount,
    importedRowCount: (plan?.rows || []).filter((row) => !row.blocked).length
  };
}
