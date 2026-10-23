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
  'QC Chemist',
  'Shop Floor Operator'
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

export function findPelletInventoryItem(inventory) {
  const items = Array.isArray(inventory) ? inventory : [];
  const matches = items.filter((item) => {
    const blob = `${item?.itemName || ''} ${item?.category || ''} ${item?.itemCode || ''}`.toLowerCase();
    return blob.includes('pellet') || blob.includes('biofuel') || blob.includes('boiler fuel');
  });
  matches.sort((a, b) => {
    const score = (item) => {
      const category = String(item?.category || '').toLowerCase();
      const name = String(item?.itemName || '').toLowerCase();
      if (name.includes('pellet')) return 0;
      if (category.includes('pellet') || category.includes('fuel')) return 1;
      return 2;
    };
    return score(a) - score(b);
  });
  return matches[0] || null;
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
    isPelletFuel: true
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
