/**
 * Read-side shape for one goods-receipt line.
 * Header fields on the GRN stay the summary the current screens already use.
 * lineItems is added beside them. A receipt with no stored lines is treated
 * as one line built from that summary.
 */

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function specMeasure(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (value === '-') return '-';
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

function normalizeRoll(roll, index) {
  if (!roll || typeof roll !== 'object') return null;
  return {
    unitNo: asNumber(roll.unitNo ?? roll.unit_no, index + 1) || index + 1,
    barcodeId: roll.barcodeId || roll.barcode_id || null,
    grossWeightKg: asNumber(roll.grossWeightKg ?? roll.gross_weight_kg, 0),
    tareWeightKg: asNumber(roll.tareWeightKg ?? roll.tare_weight_kg, 0),
    netWeightKg: asNumber(roll.netWeightKg ?? roll.net_weight_kg, 0),
    lengthMeters: asNumber(roll.lengthMeters ?? roll.length_meters, 0),
    vendorRollNo: roll.vendorRollNo || roll.vendor_roll_no || '',
    itemRemarks: roll.itemRemarks || roll.item_remarks || roll.notes || roll.remarks || ''
  };
}

export function normalizeGrnLineItem(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const rolls = (Array.isArray(raw.rolls) ? raw.rolls : [])
    .map((roll, rollIndex) => normalizeRoll(roll, rollIndex))
    .filter(Boolean);
  const purchaseRate = asNumber(
    raw.purchaseRate ?? raw.purchase_rate ?? raw.purchaseRatePerKg ?? raw.unitPrice,
    0
  );

  return {
    id: raw.id || `line-${index + 1}`,
    lineNo: asNumber(raw.lineNo ?? raw.line_no, index + 1) || index + 1,
    poLineId: raw.poLineId || raw.po_line_id || null,
    category: raw.category || 'Film Substrates',
    itemName: raw.itemName || raw.item_name || 'Item',
    filmType: raw.filmType || raw.film_type || '',
    micron: specMeasure(raw.micron),
    widthMm: specMeasure(raw.widthMm !== undefined ? raw.widthMm : raw.width_mm),
    metallocenePct: raw.metallocenePct || raw.metallocene_pct || '',
    unit: raw.unit || 'Kg',
    stockItemId: raw.stockItemId || raw.stock_item_id || '',
    masterItemId: raw.masterItemId || raw.master_item_id || '',
    purchaseRate,
    batchNo: raw.batchNo || raw.batch_no || '',
    packagingType: raw.packagingType || raw.packaging_type || 'Roll',
    remarks: raw.remarks || '',
    invoiceQtyKg: nullableNumber(
      raw.invoiceQtyKg !== undefined ? raw.invoiceQtyKg : raw.invoice_qty_kg
    ),
    rollsReceived: asNumber(raw.rollsReceived ?? raw.rolls_received, rolls.length),
    grossWeightKg: asNumber(raw.grossWeightKg ?? raw.gross_weight_kg, 0),
    tareWeightKg: asNumber(raw.tareWeightKg ?? raw.tare_weight_kg, 0),
    netWeightKg: asNumber(raw.netWeightKg ?? raw.net_weight_kg, 0),
    rolls
  };
}

export function synthesizeGrnLineItem(grn) {
  const source = grn && typeof grn === 'object' ? grn : {};
  const breakdown = Array.isArray(source.itemsBreakdown) ? source.itemsBreakdown : [];
  const rolls = breakdown.length > 0
    ? breakdown.map((item, index) => normalizeRoll(item, index)).filter(Boolean)
    : [normalizeRoll({
      unitNo: 1,
      barcodeId: source.barcodeId || null,
      grossWeightKg: source.grossWeightKg,
      tareWeightKg: source.tareWeightKg,
      netWeightKg: source.netWeightKg ?? source.receivedQtyKg,
      lengthMeters: 0,
      vendorRollNo: '',
      itemRemarks: source.itemRemarks || source.remarks || ''
    }, 0)];
  const idBase = source.id || source.grnNo || 'GRN';

  return {
    id: `${idBase}-L1`,
    lineNo: 1,
    poLineId: source.poLineId || null,
    category: source.category || 'Film Substrates',
    itemName: source.itemName || 'Item',
    filmType: source.filmType || '',
    micron: source.micron !== undefined && source.micron !== null && source.micron !== ''
      ? source.micron
      : '-',
    widthMm: source.widthMm !== undefined && source.widthMm !== null && source.widthMm !== ''
      ? source.widthMm
      : '-',
    metallocenePct: source.metallocenePct || '',
    unit: source.unit || 'Kg',
    stockItemId: source.stockItemId || '',
    masterItemId: source.masterItemId || '',
    purchaseRate: asNumber(source.purchaseRatePerKg ?? source.purchaseRate ?? source.unitPrice, 0),
    batchNo: source.batchNo || '',
    packagingType: source.packagingType || 'Roll',
    remarks: source.itemRemarks || source.remarks || '',
    invoiceQtyKg: null,
    rollsReceived: asNumber(source.rollsReceived, rolls.length),
    grossWeightKg: asNumber(source.grossWeightKg, 0),
    tareWeightKg: asNumber(source.tareWeightKg, 0),
    netWeightKg: asNumber(source.netWeightKg ?? source.receivedQtyKg, 0),
    rolls
  };
}

export function sanitizeGRN(rawGRN) {
  if (!rawGRN || typeof rawGRN !== 'object') return rawGRN;

  let rawName = String(rawGRN.itemName || rawGRN.item_name || '').trim();
  let meta = {};

  while (rawName.includes('|||')) {
    const idx = rawName.indexOf('|||');
    const jsonStr = rawName.substring(idx + 3).trim();
    rawName = rawName.substring(0, idx).trim();
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === 'object') {
          meta = { ...meta, ...parsed };
        }
      } catch (e) {}
    }
  }

  const metallocenePct = meta.metallocenePct || rawGRN.metallocene_pct || rawGRN.metallocenePct || '';
  const statusVal = rawGRN.status || meta.status || 'Pending QC Approval';
  const qcStatusVal = meta.qcStatus || rawGRN.qcStatus || rawGRN.qc_remarks || statusVal;
  const explicitLines = Array.isArray(rawGRN.lineItems) ? rawGRN.lineItems : [];
  const metaLines = Array.isArray(meta.lineItems) ? meta.lineItems : [];

  const sanitized = {
    ...rawGRN,
    ...meta,
    id: rawGRN.id || rawGRN.grn_number || rawGRN.grnNo,
    grnNo: rawGRN.grn_number || rawGRN.grnNo || rawGRN.id,
    vendorId: rawGRN.vendorId || rawGRN.vendor_id || meta.vendorId || '',
    vendorName: rawGRN.vendorName || meta.vendorName || (rawGRN.vendor_id && !rawGRN.vendor_id.startsWith('VEND-') ? rawGRN.vendor_id : 'General Vendor'),
    vendorAddress: meta.vendorAddress || rawGRN.vendorAddress || '',
    vendorGstin: meta.vendorGstin || rawGRN.vendorGstin || '',
    vendorEmail: meta.vendorEmail || rawGRN.vendorEmail || '',
    vendorPhone: meta.vendorPhone || rawGRN.vendorPhone || '',
    vendorContact: meta.vendorContact || rawGRN.vendorContact || '',
    poNumber: rawGRN.po_number || rawGRN.poNumber || meta.poNumber || '',
    invoiceNo: rawGRN.invoice_number || rawGRN.invoiceNo || meta.invoiceNo || '',
    receivedDate: rawGRN.received_date || rawGRN.receivedDate || meta.receivedDate || new Date().toISOString(),
    itemName: rawName || 'Item',
    category: meta.category || rawGRN.category || 'Film Substrates',
    stockItemId: meta.stockItemId || rawGRN.stockItemId || rawGRN.stock_item_id || '',
    filmType: meta.filmType || rawGRN.filmType || (rawName ? rawName.split(' ')[0] : 'PET'),
    micron: meta.micron !== undefined ? meta.micron : (rawGRN.micron !== undefined ? rawGRN.micron : '-'),
    widthMm: meta.widthMm !== undefined ? meta.widthMm : (rawGRN.widthMm !== undefined ? rawGRN.widthMm : '-'),
    metallocenePct: metallocenePct,
    metallocene_pct: metallocenePct,
    rollsReceived: Number(meta.rollsReceived ?? rawGRN.rollsReceived ?? 0) || 0,
    purchaseRatePerKg: Number(meta.purchaseRatePerKg ?? meta.unitPrice ?? rawGRN.purchaseRatePerKg ?? rawGRN.unitPrice ?? 0) || 0,
    purchaseRate: Number(meta.purchaseRatePerKg ?? meta.unitPrice ?? rawGRN.purchaseRatePerKg ?? rawGRN.unitPrice ?? 0) || 0,
    unitPrice: Number(meta.purchaseRatePerKg ?? meta.unitPrice ?? rawGRN.purchaseRatePerKg ?? rawGRN.unitPrice ?? 0) || 0,
    unit: meta.unit || rawGRN.unit || 'Kg',
    batchNo: meta.batchNo || rawGRN.batchNo || '',
    status: statusVal,
    qcStatus: qcStatusVal,
    qcNotes: rawGRN.qc_remarks || rawGRN.qcNotes || meta.qcNotes || '',
    inspectedBy: meta.inspectedBy || rawGRN.inspectedBy || '',
    storeManager: meta.storeManager || rawGRN.storeManager || '',
    receivedQtyKg: Number(rawGRN.received_qty_kg ?? rawGRN.receivedQtyKg ?? rawGRN.netWeightKg ?? 0) || 0,
    netWeightKg: Number(rawGRN.received_qty_kg ?? rawGRN.receivedQtyKg ?? rawGRN.netWeightKg ?? 0) || 0,
    grossWeightKg: Number(meta.grossWeightKg ?? rawGRN.grossWeightKg ?? 0) || 0,
    tareWeightKg: Number(meta.tareWeightKg ?? rawGRN.tareWeightKg ?? 0) || 0,
    packagingType: meta.packagingType || rawGRN.packagingType || 'Roll',
    itemsBreakdown: meta.itemsBreakdown || rawGRN.itemsBreakdown || [],
    barcodes: meta.barcodes || rawGRN.barcodes || [],
    barcodeId: meta.barcodeId || rawGRN.barcodeId || '',
    freightAmount: Number(meta.freightAmount ?? rawGRN.freightAmount ?? 0) || 0,
    transporterName: meta.transporterName || rawGRN.transporterName || 'Direct Dispatch / Self',
    itemRemarks: meta.itemRemarks || rawGRN.itemRemarks || rawGRN.remarks || meta.remarks || rawGRN.notes || '',
    remarks: meta.itemRemarks || rawGRN.itemRemarks || rawGRN.remarks || meta.remarks || rawGRN.notes || '',
    notes: meta.itemRemarks || rawGRN.itemRemarks || rawGRN.remarks || meta.remarks || rawGRN.notes || '',
    location: meta.location || rawGRN.location || 'Store Bay',
    storeLocation: meta.storeLocation || rawGRN.storeLocation || 'Store Bay'
  };

  return applyGrnLineItems(sanitized, explicitLines.length > 0 ? explicitLines : metaLines);
}

export function applyGrnLineItems(sanitized, rawLineItems) {
  const incoming = Array.isArray(rawLineItems) ? rawLineItems : [];
  const lineItems = incoming.length > 0
    ? incoming
      .map((line, index) => normalizeGrnLineItem(line, index))
      .filter(Boolean)
      .sort((a, b) => a.lineNo - b.lineNo)
    : [synthesizeGrnLineItem(sanitized)];

  return {
    ...sanitized,
    lineItems
  };
}

export function groupGrnLineItems(lineRows) {
  const grouped = new Map();
  (lineRows || []).forEach((line) => {
    const key = String(line?.grn_id || line?.grnId || '');
    if (!key) return;
    const list = grouped.get(key) || [];
    list.push(line);
    grouped.set(key, list);
  });
  return grouped;
}

export function lineItemsForGrn(grouped, grnRow) {
  const id = String(grnRow?.id || '');
  const number = String(grnRow?.grn_number || grnRow?.grnNo || '');
  if (id && grouped.has(id)) return grouped.get(id);
  if (number && grouped.has(number)) return grouped.get(number);
  return [];
}
