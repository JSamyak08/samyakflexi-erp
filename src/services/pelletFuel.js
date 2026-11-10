/**
 * Pellet fuel stock helpers.
 * Shifts are not stored in system settings, so the operating list lives here
 * and every pellet screen reads this one constant.
 */

export const PELLET_FUEL_SHIFTS = [
  { value: 'Shift A: Day (08:00 - 20:00)', label: 'Shift A (Day)' },
  { value: 'Shift B: Night (20:00 - 08:00)', label: 'Shift B (Night)' },
  { value: 'Full Day 24h', label: 'Full Day 24h' }
];

export const PELLET_FUEL_ROLES = [
  'Admin',
  'Plant Manager',
  'HR & Payroll Manager',
  'Production Manager',
  'Store Manager',
  'Purchase Manager',
  'QC Chemist'
];

export function fuelActorName(user) {
  const candidates = [user?.name, user?.full_name, user?.username];
  for (const candidate of candidates) {
    const name = String(candidate || '').trim();
    if (name && name !== 'User') return name;
  }
  return String(user?.email || '').trim();
}

export function countActiveLoggingDays(consumptions, year, month) {
  const days = new Set();
  (consumptions || []).forEach((item) => {
    if (!item?.consumptionDate) return;
    const date = new Date(item.consumptionDate);
    if (Number.isNaN(date.getTime())) return;
    if (date.getFullYear() === year && date.getMonth() === month) {
      days.add(item.consumptionDate);
    }
  });
  return days.size;
}

function payloadObject(row) {
  const payload = row?.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return payload;
}

function hasBusinessFields(payload, fields) {
  if (!payload) return false;
  return fields.some((field) => payload[field] !== undefined && payload[field] !== null && payload[field] !== '');
}

export function pelletInwardFromRow(row) {
  if (!row || typeof row !== 'object') return row;
  const payload = payloadObject(row);
  const fromColumns = {
    id: row.id,
    grnNo: row.grn_no ?? row.grnNo ?? '',
    inwardDate: row.inward_date ?? row.inwardDate ?? '',
    inwardQtyKg: row.inward_qty_kg ?? row.inwardQtyKg ?? 0,
    unitCostPerKg: row.unit_cost_per_kg ?? row.unitCostPerKg ?? 0,
    totalAmount: row.total_amount ?? row.totalAmount ?? 0,
    vehicleNo: row.vehicle_no ?? row.vehicleNo ?? '',
    vendorName: row.vendor_name ?? row.vendorName ?? '',
    vendorId: row.vendor_id ?? row.vendorId ?? '',
    invoiceNo: row.invoice_no ?? row.invoiceNo ?? '',
    storageLocation: row.storage_location ?? row.storageLocation ?? '',
    receivedBy: row.received_by ?? row.receivedBy ?? '',
    remarks: row.notes ?? row.remarks ?? ''
  };
  if (!hasBusinessFields(payload, ['inwardQtyKg', 'grnNo', 'vendorName', 'id', 'vehicleNo'])) {
    return fromColumns;
  }
  return {
    ...fromColumns,
    ...payload,
    id: payload.id || fromColumns.id,
    grnNo: payload.grnNo || fromColumns.grnNo,
    inwardDate: payload.inwardDate || fromColumns.inwardDate,
    inwardQtyKg: payload.inwardQtyKg ?? fromColumns.inwardQtyKg,
    unitCostPerKg: payload.unitCostPerKg ?? fromColumns.unitCostPerKg,
    totalAmount: payload.totalAmount ?? fromColumns.totalAmount,
    vehicleNo: payload.vehicleNo || fromColumns.vehicleNo || ''
  };
}

export function pelletConsumptionFromRow(row) {
  if (!row || typeof row !== 'object') return row;
  const payload = payloadObject(row);
  const fromColumns = {
    id: row.id,
    consumptionDate: row.consumption_date ?? row.consumptionDate ?? '',
    consumedQtyKg: row.consumed_qty_kg ?? row.consumedQtyKg ?? 0,
    operatingHours: row.operating_hours ?? row.operatingHours ?? 0,
    referencePrintingDoneKg: row.reference_printing_done_kg ?? row.referencePrintingDoneKg ?? 0
  };
  if (!hasBusinessFields(payload, ['consumedQtyKg', 'consumptionDate', 'id', 'machineName'])) {
    return fromColumns;
  }
  return {
    ...fromColumns,
    ...payload,
    id: payload.id || fromColumns.id,
    consumptionDate: payload.consumptionDate || fromColumns.consumptionDate,
    consumedQtyKg: payload.consumedQtyKg ?? fromColumns.consumedQtyKg,
    operatingHours: payload.operatingHours ?? fromColumns.operatingHours,
    referencePrintingDoneKg: payload.referencePrintingDoneKg ?? fromColumns.referencePrintingDoneKg
  };
}

export const PELLET_FUEL_CATEGORY = 'Boiler Pellets / Fuel';
export const CANONICAL_PELLET_ITEM_ID = 'INVT-PELLET-FUEL';
export const CANONICAL_PELLET_ITEM_NAME = 'Boiler Pellet Fuel';

const FILM_CATEGORY_KEYS = new Set(['', 'film', 'film substrates', 'lamination films']);

function normPelletText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/µ/g, 'micron')
    .replace(/[_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pelletMeta(item) {
  const meta = item?.metadata;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return meta;
}

export function pelletFuelBlob(item) {
  if (!item || typeof item !== 'object') return '';
  const meta = pelletMeta(item);
  return normPelletText([
    item.itemName,
    item.item_name,
    item.name,
    item.category,
    meta.category,
    meta.itemName,
    item.itemCode,
    item.item_code,
    meta.itemCode,
    item.isPelletFuel === true || meta.isPelletFuel === true ? 'pellet' : ''
  ].filter((part) => part !== undefined && part !== null && String(part).trim() !== '').join(' '));
}

function strongPelletScore(name, blob) {
  let score = 0;
  if (name.includes('pellet') || blob.includes('pellet')) score += 80;
  if (blob.includes('biofuel') || blob.includes('bio fuel')) score += 50;
  if (blob.includes('boiler fuel')) score += 50;
  if (blob.includes('boiler pellet')) score += 10;
  return score;
}

function similarPelletScore(name) {
  if (name.includes('white coal')) return 12;
  if (name.includes('briquette')) return 11;
  if (name.includes('biomass')) return 10;
  if (name.includes('rice husk') || name.includes('agro waste')) return 9;
  return 0;
}

export function scorePelletInventoryItem(item) {
  if (!item || typeof item !== 'object') return 0;
  const name = normPelletText(item.itemName || item.item_name || item.name);
  const blob = pelletFuelBlob(item);
  const category = normPelletText(item.category || pelletMeta(item).category);
  let score = strongPelletScore(name, blob);
  if (item.isPelletFuel === true || pelletMeta(item).isPelletFuel === true) score += 100;
  if (category.includes('boiler pellet')) score += 30;
  if (score === 0) score = similarPelletScore(name);
  if (item.isActive === false || item.is_active === false) score -= 500;
  return score;
}

export function rankPelletInventoryItems(inventory) {
  return (Array.isArray(inventory) ? inventory : [])
    .map((item) => ({ item, score: scorePelletInventoryItem(item) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const qty = (Number(b.item?.availableQtyKg ?? b.item?.stock_qty_kg) || 0)
        - (Number(a.item?.availableQtyKg ?? a.item?.stock_qty_kg) || 0);
      if (qty !== 0) return qty;
      return String(a.item?.id || '').localeCompare(String(b.item?.id || ''));
    });
}

/**
 * The stock item a pellet GRN should increase.
 * A clear pellet, biofuel, or boiler-fuel item wins. One similar name
 * (white coal, briquette, biomass, rice husk) is used so a second item
 * is not created. Several equally similar names are left for the operator
 * to pick. Archived items are ignored.
 */
export function findPelletInventoryItem(inventory) {
  const ranked = rankPelletInventoryItems(inventory);
  if (!ranked.length) return null;
  if (ranked[0].score >= 20) return ranked[0].item;
  const top = ranked[0].score;
  const tied = ranked.filter((row) => row.score === top);
  return tied.length === 1 ? tied[0].item : null;
}

export function ambiguousPelletInventoryItems(inventory) {
  const ranked = rankPelletInventoryItems(inventory);
  if (!ranked.length || ranked[0].score >= 20) return [];
  const top = ranked[0].score;
  const tied = ranked.filter((row) => row.score === top);
  return tied.length > 1 ? tied.map((row) => row.item) : [];
}

export function pelletItemById(inventory, id) {
  const key = String(id || '').trim();
  if (!key) return null;
  return (Array.isArray(inventory) ? inventory : []).find((item) => (
    String(item?.id || '') === key || String(item?.itemCode || item?.item_code || '') === key
  )) || null;
}

/**
 * Film rows default to category "Film Substrates". Sanitizing those rows
 * rewrites the name into a film code such as BOILER-1000-12 and the word
 * "pellet" disappears, so the GRN screen thinks no fuel item exists.
 * Pellet, biofuel, and boiler-fuel names keep the words the store typed.
 */
export function pelletNameShouldBePreserved(raw) {
  if (!raw || typeof raw !== 'object') return false;
  const name = normPelletText(raw.itemName || raw.item_name || raw.name);
  const category = normPelletText(raw.category);
  const code = normPelletText(raw.itemCode || raw.item_code);
  const blob = normPelletText(`${name} ${category} ${code}`);
  if (raw.isPelletFuel === true) return true;
  if (strongPelletScore(name, blob) > 0) return true;
  return FILM_CATEGORY_KEYS.has(category) && similarPelletScore(name) > 0;
}

export function resolvePelletCategory(rawCategory) {
  const category = String(rawCategory || '').trim();
  if (FILM_CATEGORY_KEYS.has(normPelletText(category))) return PELLET_FUEL_CATEGORY;
  return category;
}

export function canonicalPelletInventoryItem() {
  return {
    id: CANONICAL_PELLET_ITEM_ID,
    itemCode: CANONICAL_PELLET_ITEM_ID,
    itemName: CANONICAL_PELLET_ITEM_NAME,
    category: PELLET_FUEL_CATEGORY,
    unit: 'Kg',
    availableQtyKg: 0,
    allocatedQtyKg: 0,
    reorderLevelKg: 0,
    unitPrice: 0,
    location: 'Pellet Store',
    preserveItemName: true,
    isPelletFuel: true,
    isActive: true
  };
}

export function nextPelletStockQty(currentQty, delta) {
  const next = (Number(currentQty) || 0) + (Number(delta) || 0);
  return Math.round(Math.max(0, next) * 1000) / 1000;
}

/**
 * A new receipt posts its full weight. A later edit of that same receipt
 * posts only the change. An older receipt that never posted from this screen
 * is left for QC, so approving it does not add the kilograms twice.
 */
export function pelletInventoryQtyDelta(previous, nextQty) {
  const next = Number(nextQty) || 0;
  if (!previous) return { delta: next, inventoryQtyPosted: true };
  if (previous.inventoryQtyPosted === true) {
    return {
      delta: next - (Number(previous.inwardQtyKg) || 0),
      inventoryQtyPosted: true
    };
  }
  return { delta: 0, inventoryQtyPosted: false };
}

export function pelletReceiptAlreadyPosted(grn) {
  return grn?.isPelletFuel === true && (grn?.inventoryQtyPosted === true || grn?.inventory_qty_posted === true);
}

export function buildPelletCompanionGrn(pellet, inventoryItem) {
  if (!inventoryItem?.id || !String(inventoryItem.itemName || '').trim()) {
    throw new Error('A pellet fuel item must exist in inventory before this GRN can be saved.');
  }
  if (!pellet?.vendorId || !String(pellet.vendorName || '').trim()) {
    throw new Error('Select the pellet supplier from the vendor list.');
  }
  const itemName = String(inventoryItem.itemName).trim();
  const meta = {
    category: inventoryItem.category || '',
    stockItemId: inventoryItem.id,
    unit: inventoryItem.unit || 'Kg',
    purchaseRatePerKg: Number(pellet.unitCostPerKg) || 0,
    unitPrice: Number(pellet.unitCostPerKg) || 0,
    storeManager: pellet.receivedBy || '',
    storeLocation: pellet.storageLocation || '',
    location: pellet.storageLocation || '',
    vendorName: pellet.vendorName,
    vendorId: pellet.vendorId,
    invoiceNo: pellet.invoiceNo || '',
    receivedDate: pellet.inwardDate,
    status: pellet.status || 'Pending QC',
    qcStatus: pellet.qcStatus || pellet.status || 'Pending QC',
    remarks: pellet.remarks || '',
    itemRemarks: pellet.remarks || '',
    notes: pellet.remarks || '',
    vehicleNo: pellet.vehicleNo || '',
    isPelletFuel: true,
    inventoryQtyPosted: pellet.inventoryQtyPosted === true
  };
  return {
    id: pellet.id,
    grnNo: pellet.grnNo,
    vendorId: pellet.vendorId,
    vendorName: pellet.vendorName,
    invoiceNo: pellet.invoiceNo || '',
    receivedDate: pellet.inwardDate,
    itemName: `${itemName} ||| ${JSON.stringify(meta)}`,
    plainItemName: itemName,
    stockItemId: inventoryItem.id,
    category: inventoryItem.category || '',
    unit: inventoryItem.unit || 'Kg',
    receivedQtyKg: Number(pellet.inwardQtyKg) || 0,
    status: pellet.status || 'Pending QC',
    qcNotes: pellet.qcNotes || '',
    vehicleNo: pellet.vehicleNo || '',
    isPelletFuel: true
  };
}
