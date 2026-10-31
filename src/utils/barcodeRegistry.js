/**
 * One list of barcodes already stored by the plant.
 * Reads the records each module already keeps. It does not mint a new copy.
 *
 * Pellet fuel has no barcode column, so those receipts are not listed.
 */

import { codeKey, codeText } from './barcodeCode';

export const BARCODE_SOURCE = {
  rm: 'Raw material / GRN',
  sfg: 'SFG rolls',
  fg: 'FG rolls',
  child: 'Consume child rolls',
  dispatch: 'Dispatch / challans',
  print: 'Barcode print',
  adjust: 'Stock adjustments',
  inventory: 'Inventory items',
  cylinders: 'Cylinders',
  production: 'Production records',
  hold: 'SFG QC hold',
  scrap: 'SFG scrap',
  store: 'SFG / FG store',
  input: 'Linked input barcodes',
  issues: 'Store issues',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLANK = new Set(['null', 'undefined', 'n/a', 'na', '-']);

function plain(...values) {
  for (const value of values) {
    if (value == null || typeof value === 'object') continue;
    const text = String(value).trim();
    if (!text || BLANK.has(text.toLowerCase())) continue;
    return text;
  }
  return '';
}

function barcodeText(value) {
  const text = plain(value);
  if (!text || UUID_RE.test(text)) return '';
  return text;
}

/** Same labels as public.barcode_source_module. GRN -R roll indexes stay raw material. */
export function sourceModuleForCode(code, fallback = BARCODE_SOURCE.input) {
  const text = barcodeText(code);
  if (!text) return fallback;
  if (/^FG-DISP-/i.test(text)) return BARCODE_SOURCE.dispatch;
  if (/^(SFG|FG)-/i.test(text) && /-R\d+$/i.test(text)) return BARCODE_SOURCE.child;
  if (/^FG-/i.test(text)) return BARCODE_SOURCE.fg;
  if (/^SFG-/i.test(text)) return BARCODE_SOURCE.sfg;
  if (/^(QCHOLD|SCRAP)-/i.test(text)) return BARCODE_SOURCE.hold;
  if (/^(RM|CON)-/i.test(text)) return BARCODE_SOURCE.rm;
  if (/^(ADJ|BAR)-/i.test(text)) return BARCODE_SOURCE.adjust;
  if (/^(CYL-|SKU-CYL)/i.test(text)) return BARCODE_SOURCE.cylinders;
  return fallback;
}

function sourceForRoll(roll, code) {
  const parent = plain(
    roll?.parentSfgBatchCode,
    roll?.parentBarcode,
    roll?.metadata?.parentSfgBatchCode
  );
  if (parent) return BARCODE_SOURCE.child;
  if (/^FG-DISP-/i.test(code)) return BARCODE_SOURCE.dispatch;
  const typed = plain(roll?.rollType).toUpperCase();
  if ((typed === 'FG' || /^FG-/i.test(code)) && /-R\d+$/i.test(code)) return BARCODE_SOURCE.child;
  if (typed === 'FG' || /^FG-/i.test(code)) return BARCODE_SOURCE.fg;
  if ((typed === 'SFG' || /^SFG-/i.test(code)) && /-R\d+$/i.test(code)) return BARCODE_SOURCE.child;
  if (typed === 'SFG' || /^SFG-/i.test(code)) return BARCODE_SOURCE.sfg;
  return BARCODE_SOURCE.rm;
}

function sourceForSfg(item, code) {
  if (plain(item?.parentSfgBatchCode, item?.parentBarcode)) return BARCODE_SOURCE.child;
  if (/^FG-DISP-/i.test(code)) return BARCODE_SOURCE.dispatch;
  if (/^(SFG|FG)-/i.test(code) && /-R\d+$/i.test(code)) return BARCODE_SOURCE.child;
  const kind = `${plain(item?.sfgType)} ${plain(item?.rollType)} ${plain(item?.category)}`;
  if (/^FG-/i.test(code) || /finish/i.test(kind) || plain(item?.rollType).toUpperCase() === 'FG') {
    return BARCODE_SOURCE.fg;
  }
  return BARCODE_SOURCE.sfg;
}

function rowKey(sourceModule, barcode) {
  return `${sourceModule}|${codeKey(barcode)}`;
}

function remember(map, row) {
  const barcode = barcodeText(row?.barcode);
  const sourceModule = plain(row?.sourceModule);
  if (!barcode || !sourceModule) return;
  const key = rowKey(sourceModule, barcode);
  const existing = map.get(key);
  const next = {
    barcode,
    sourceModule,
    description: plain(row.description),
    referenceNo: plain(row.referenceNo),
    createdAt: plain(row.createdAt),
    status: plain(row.status),
    location: plain(row.location),
    sourceTable: plain(row.sourceTable),
    sourceColumn: plain(row.sourceColumn),
    deletedReason: plain(row.deletedReason, row.deleted_reason),
    deletedAt: plain(row.deletedAt, row.deleted_at),
    deletedBy: plain(row.deletedBy, row.deleted_by),
  };
  if (!existing || (isRetiredBarcode(next) && !isRetiredBarcode(existing))) {
    map.set(key, next);
  }
}

function addItem(map, item, fallback, depth = 0) {
  if (item == null || depth > 3) return;
  if (typeof item !== 'object') {
    remember(map, { ...fallback, barcode: item });
    return;
  }
  const barcode = barcodeText(
    item.barcodeId
    || item.barcode_id
    || item.barcode
    || item.sfgBatchCode
    || item.sfg_batch_code
    || item.fgBatchCode
    || item.fg_batch_code
    || item.holdTagId
  );
  remember(map, {
    ...fallback,
    barcode,
    description: plain(item.itemName, item.item_name, item.jobName, item.filmType, item.description, fallback.description),
    referenceNo: plain(item.orderId, item.grnNo, item.grn_no, item.dispatchId, item.challanNo, fallback.referenceNo),
    createdAt: plain(item.createdAt, item.inwardDatetime, item.productionDate, item.date, item.recordedAt, fallback.createdAt),
    status: plain(item.status, item.qcStatus, fallback.status),
    location: plain(item.locationBay, item.storageBay, item.location, item.location_bay, fallback.location),
  });
  [item.substrate2?.barcode, item.substrate3?.barcode, item.outputRoll?.barcodeId, item.outputRoll?.barcode]
    .forEach((code) => remember(map, { ...fallback, barcode: code }));
  ['outputRolls', 'rolls', 'inputRollsList', 'itemsBreakdown'].forEach((key) => {
    if (Array.isArray(item[key])) {
      item[key].forEach((child) => addItem(map, child, fallback, depth + 1));
    }
  });
}

function addList(map, list, fallback) {
  (Array.isArray(list) ? list : []).forEach((item) => addItem(map, item, fallback));
}

/**
 * Union every stored barcode. The same code in two modules stays as two rows
 * so each source remains visible. A repeated code inside one module is one row.
 */
export function collectBarcodes(sources = {}) {
  const map = new Map();

  (sources.inventoryRolls || []).forEach((roll) => {
    const code = barcodeText(roll?.barcodeId || roll?.barcode || roll?.id);
    const sourceModule = sourceForRoll(roll, code);
    remember(map, {
      barcode: code,
      sourceModule,
      description: plain(roll?.itemName, roll?.filmType, roll?.jobName),
      referenceNo: plain(roll?.orderId, roll?.grnNo, roll?.jobName, roll?.batchNo),
      createdAt: plain(roll?.inwardDatetime, roll?.productionDate, roll?.createdAt),
      status: plain(roll?.status, roll?.qcStatus),
      location: plain(roll?.locationBay, roll?.location),
      sourceTable: 'inventory_rolls',
      sourceColumn: 'barcode_id',
    });
    const printed = barcodeText(roll?.barcode);
    if (printed && codeKey(printed) !== codeKey(code)) {
      remember(map, {
        barcode: printed,
        sourceModule: sourceForRoll(roll, printed),
        description: plain(roll?.itemName, roll?.filmType),
        referenceNo: plain(roll?.orderId, roll?.grnNo),
        createdAt: plain(roll?.inwardDatetime, roll?.productionDate),
        status: plain(roll?.status),
        location: plain(roll?.locationBay),
        sourceTable: 'inventory_rolls',
        sourceColumn: 'barcode',
      });
    }
    (Array.isArray(roll?.inputBarcodeIds) ? roll.inputBarcodeIds : []).forEach((entry) => {
      const inputCode = typeof entry === 'object'
        ? barcodeText(entry?.barcodeId || entry?.barcode)
        : barcodeText(entry);
      if (!inputCode) return;
      remember(map, {
        barcode: inputCode,
        sourceModule: sourceModuleForCode(inputCode),
        description: plain(roll?.itemName),
        referenceNo: plain(code, roll?.orderId),
        createdAt: plain(roll?.inwardDatetime),
        status: plain(roll?.status),
        location: plain(roll?.locationBay),
        sourceTable: 'inventory_rolls',
        sourceColumn: 'input_barcode_ids',
      });
    });
  });

  (sources.sfgGoods || []).forEach((item) => {
    const code = barcodeText(item?.sfgBatchCode || item?.sfg_batch_code);
    remember(map, {
      barcode: code,
      sourceModule: sourceForSfg(item, code),
      description: plain(item?.jobName, item?.filmType, item?.sfgType),
      referenceNo: plain(item?.orderId, item?.jobCode, item?.jobName),
      createdAt: plain(item?.createdAt, item?.productionDate),
      status: plain(item?.status),
      location: plain(item?.storageBay),
      sourceTable: 'sfg_goods',
      sourceColumn: 'sfg_batch_code',
    });
    addList(map, item?.consumptionHistory, {
      sourceModule: BARCODE_SOURCE.child,
      description: plain(item?.jobName),
      referenceNo: plain(code, item?.orderId),
      createdAt: plain(item?.createdAt),
      status: plain(item?.status),
      location: plain(item?.storageBay),
      sourceTable: 'sfg_goods',
      sourceColumn: 'consumption_history',
    });
  });

  (sources.fgGoods || []).forEach((item) => {
    const code = barcodeText(item?.fgBatchCode || item?.fg_batch_code || item?.sfgBatchCode);
    remember(map, {
      barcode: code,
      sourceModule: sourceModuleForCode(code, BARCODE_SOURCE.fg),
      description: plain(item?.jobName, item?.fgType),
      referenceNo: plain(item?.orderId, item?.jobName),
      createdAt: plain(item?.createdAt, item?.productionDate),
      status: plain(item?.status),
      location: plain(item?.storageBay),
      sourceTable: 'fg_goods',
      sourceColumn: 'fg_batch_code',
    });
  });

  (sources.grns || []).forEach((grn) => {
    const fallback = {
      sourceModule: BARCODE_SOURCE.rm,
      description: plain(grn?.itemName, grn?.item_name),
      referenceNo: plain(grn?.grnNo, grn?.grn_number, grn?.id),
      createdAt: plain(grn?.receivedDate, grn?.createdAt, grn?.created_at),
      status: plain(grn?.status, grn?.qcStatus),
      location: plain(grn?.location, grn?.storeLocation),
      sourceTable: 'grn_line_items',
      sourceColumn: 'rolls',
    };
    remember(map, { ...fallback, barcode: grn?.barcodeId, sourceTable: 'grns', sourceColumn: 'barcode_id' });
    (Array.isArray(grn?.barcodes) ? grn.barcodes : []).forEach((code) => {
      remember(map, { ...fallback, barcode: code, sourceTable: 'grns', sourceColumn: 'barcodes' });
    });
    addList(map, grn?.lineItems, fallback);
    addList(map, grn?.itemsBreakdown, fallback);
  });

  (sources.dispatchShipments || []).forEach((shipment) => {
    addList(map, shipment?.items, {
      sourceModule: BARCODE_SOURCE.dispatch,
      description: plain(shipment?.jobName, shipment?.clientName),
      referenceNo: plain(shipment?.dispatchId, shipment?.orderId, shipment?.id),
      createdAt: plain(shipment?.dispatchDate, shipment?.createdAt),
      status: plain(shipment?.challanNature, shipment?.status),
      location: plain(shipment?.vehicleNo),
      sourceTable: 'dispatch_shipments',
      sourceColumn: 'items',
    });
  });

  (sources.deliveryChallans || []).forEach((challan) => {
    const body = challan?.payload && typeof challan.payload === 'object' ? challan.payload : challan;
    addList(map, body?.items, {
      sourceModule: BARCODE_SOURCE.dispatch,
      description: plain(body?.jobName, body?.clientName, body?.partyName),
      referenceNo: plain(body?.challanNo, body?.orderId, body?.id),
      createdAt: plain(body?.createdDate, body?.dispatchDateTime, challan?.created_at),
      status: plain(body?.returnStatus, body?.challanNature),
      location: plain(body?.vehicleNo),
      sourceTable: 'delivery_challans',
      sourceColumn: 'payload',
    });
  });

  (sources.productionRecords || []).forEach((record) => {
    const fallback = {
      sourceModule: BARCODE_SOURCE.production,
      description: plain(record?.jobName),
      referenceNo: plain(record?.orderId, record?.id, record?.jobName),
      createdAt: plain(record?.recordedAt, record?.dateFilled),
      status: plain(record?.status),
      location: '',
      sourceTable: 'production_records',
      sourceColumn: 'materials_list',
    };
    addList(map, record?.materialsList, fallback);
    addList(map, record?.inputRollsList, { ...fallback, sourceColumn: 'input_rolls_list' });
    addList(map, record?.outputRolls, { ...fallback, sourceColumn: 'output_rolls' });
    addList(map, record?.rollsBreakdown, { ...fallback, sourceColumn: 'rolls_breakdown' });
    addList(map, record?.createdBalanceRolls, { ...fallback, sourceColumn: 'created_balance_rolls' });
    addList(map, record?.sfgConsumptions, { ...fallback, sourceColumn: 'sfg_consumptions' });
    const printing = record?.stages?.printing || record?.processLogs?.stages?.printing;
    addList(map, printing?.inputRollsList, { ...fallback, sourceColumn: 'process_logs' });
    addList(map, printing?.outputRolls, { ...fallback, sourceColumn: 'process_logs' });
  });

  (sources.inventory || []).forEach((item) => {
    remember(map, {
      barcode: item?.barcode,
      sourceModule: BARCODE_SOURCE.inventory,
      description: plain(item?.itemName, item?.item_name, item?.filmType),
      referenceNo: plain(item?.itemCode, item?.item_code, item?.id),
      createdAt: plain(item?.lastUpdated, item?.inwardDate, item?.last_updated),
      status: plain(item?.category),
      location: plain(item?.location),
      sourceTable: 'inventory',
      sourceColumn: 'barcode',
    });
  });

  (sources.cylinders || []).forEach((cylinder) => {
    const sku = barcodeText(cylinder?.sku || cylinder?.cylinderSku || cylinder?.cylinder_sku);
    const id = barcodeText(cylinder?.id);
    const code = sku || id;
    remember(map, {
      barcode: code,
      sourceModule: BARCODE_SOURCE.cylinders,
      description: plain(cylinder?.jobName, cylinder?.job_name, 'Cylinder'),
      referenceNo: plain(cylinder?.jobMasterId, cylinder?.job_master_id, id),
      createdAt: plain(cylinder?.createdAt, cylinder?.created_at),
      status: plain(cylinder?.status),
      location: plain(cylinder?.rackLocation, cylinder?.rack_location, cylinder?.assignedPress, cylinder?.assigned_press),
      sourceTable: 'cylinders',
      sourceColumn: sku ? 'sku' : 'id',
    });
    if (id && sku && codeKey(id) !== codeKey(sku)) {
      remember(map, {
        barcode: id,
        sourceModule: BARCODE_SOURCE.cylinders,
        description: plain(cylinder?.jobName, cylinder?.job_name, 'Cylinder'),
        referenceNo: plain(sku),
        createdAt: plain(cylinder?.createdAt, cylinder?.created_at),
        status: plain(cylinder?.status),
        location: plain(cylinder?.assignedPress, cylinder?.assigned_press),
        sourceTable: 'cylinders',
        sourceColumn: 'id',
      });
    }
  });

  const customRows = Array.isArray(sources.customBarcodes)
    ? sources.customBarcodes
    : Object.entries(sources.customBarcodes || {}).map(([id, barcode]) => (
      typeof barcode === 'object' ? { ...barcode, id } : { id, barcode }
    ));
  customRows.forEach((row) => {
    remember(map, {
      barcode: row?.barcode || row?.barcodeId,
      sourceModule: BARCODE_SOURCE.print,
      description: plain(row?.itemName, row?.description, 'Printed barcode'),
      referenceNo: plain(row?.id),
      createdAt: plain(row?.createdAt, row?.created_at),
      status: '',
      location: '',
      sourceTable: 'custom_barcodes',
      sourceColumn: 'payload',
    });
  });

  (sources.stockAdjustments || []).forEach((row) => {
    remember(map, {
      barcode: row?.barcode,
      sourceModule: BARCODE_SOURCE.adjust,
      description: plain(row?.itemName, row?.reason),
      referenceNo: plain(row?.itemId, row?.id),
      createdAt: plain(row?.date, row?.createdAt),
      status: plain(row?.type),
      location: '',
      sourceTable: 'stock_adjustments',
      sourceColumn: 'payload',
    });
  });

  (sources.qcHoldItems || []).forEach((item) => {
    remember(map, {
      barcode: item?.barcodeId || item?.sfgBatchCode || item?.holdTagId,
      sourceModule: BARCODE_SOURCE.hold,
      description: plain(item?.itemName, item?.jobName, 'QC hold'),
      referenceNo: plain(item?.orderId, item?.parentSfgBatchCode, item?.id),
      createdAt: plain(item?.createdAt, item?.date),
      status: plain(item?.status, 'QC Hold'),
      location: plain(item?.storageBay),
      sourceTable: 'sfg_qc_hold_items',
      sourceColumn: 'payload',
    });
  });

  (sources.scrapItems || []).forEach((item) => {
    remember(map, {
      barcode: item?.holdTagId || item?.barcodeId || item?.sfgBatchCode,
      sourceModule: BARCODE_SOURCE.scrap,
      description: plain(item?.itemName, item?.jobName, 'Scrap'),
      referenceNo: plain(item?.orderId, item?.id),
      createdAt: plain(item?.createdAt, item?.date),
      status: plain(item?.status, 'Scrap'),
      location: plain(item?.storageBay),
      sourceTable: 'sfg_scrap_items',
      sourceColumn: 'payload',
    });
  });

  (sources.storeIssues || []).forEach((row) => {
    remember(map, {
      barcode: row?.barcode || row?.barcodeId,
      sourceModule: BARCODE_SOURCE.issues,
      description: plain(row?.itemName, row?.description),
      referenceNo: plain(row?.id),
      createdAt: plain(row?.date, row?.createdAt),
      status: plain(row?.status),
      location: plain(row?.location),
      sourceTable: 'store_issue_transactions',
      sourceColumn: 'payload',
    });
  });

  (sources.deletedBarcodes || []).forEach((row) => {
    remember(map, {
      barcode: row?.barcode,
      sourceModule: plain(row?.sourceModule, row?.source_module) || sourceModuleForCode(row?.barcode, BARCODE_SOURCE.rm),
      description: plain(row?.description, row?.itemName),
      referenceNo: plain(row?.referenceNo, row?.reference_no),
      createdAt: plain(row?.createdAt, row?.created_at),
      status: 'Deleted',
      location: plain(row?.location),
      sourceTable: 'deleted_barcodes',
      sourceColumn: 'barcode',
      deletedReason: plain(row?.deletedReason, row?.deleted_reason),
      deletedAt: plain(row?.deletedAt, row?.deleted_at),
      deletedBy: plain(row?.deletedBy, row?.deleted_by),
    });
  });

  return [...map.values()].sort((left, right) => {
    const byDate = String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
    if (byDate) return byDate;
    return left.barcode.localeCompare(right.barcode);
  });
}

export function barcodeDisposition(row) {
  const status = String(row?.status || '').trim().toLowerCase();
  if (status === 'deleted') return 'deleted';
  if (status === 'written off' || status === 'void' || status === 'written off / void') return 'written_off';
  return '';
}

export function isDeletedBarcode(row) {
  return barcodeDisposition(row) === 'deleted';
}

export function isWrittenOffBarcode(row) {
  return barcodeDisposition(row) === 'written_off';
}

/** Deleted and written-off barcodes are not stock and cannot be used again. */
export function isRetiredBarcode(row) {
  return Boolean(barcodeDisposition(row));
}

export function findDeletedBarcode(rows, query) {
  const key = codeKey(query);
  if (!key) return null;
  return (rows || []).find((row) => isDeletedBarcode(row) && codeKey(row.barcode) === key) || null;
}

export function findRetiredBarcode(rows, query) {
  const key = codeKey(query);
  if (!key) return null;
  return (rows || []).find((row) => isRetiredBarcode(row) && codeKey(row.barcode) === key) || null;
}

export function deletedBarcodeMessage(row) {
  const code = plain(row?.barcode) || 'This barcode';
  const reason = plain(row?.deletedReason, row?.deleted_reason) || 'No reason recorded';
  const who = plain(row?.deletedBy, row?.deleted_by);
  const when = plain(row?.deletedAt, row?.deleted_at);
  const whoWhen = [who ? `by ${who}` : '', when ? `at ${when}` : ''].filter(Boolean).join(' ');
  const label = isWrittenOffBarcode(row) ? 'Written Off' : 'Deleted';
  return `${code} is ${label}${whoWhen ? ` (${whoWhen})` : ''}. Reason: ${reason}. It is not stock and cannot be received, issued, or consumed.`;
}

export function mergeBarcodeRows(...lists) {
  const map = new Map();
  lists.flat().forEach((row) => {
    const barcode = barcodeText(row?.barcode);
    const sourceModule = plain(row?.sourceModule);
    if (!barcode || !sourceModule) return;
    const key = rowKey(sourceModule, barcode);
    const existing = map.get(key);
    const next = { ...row, barcode, sourceModule };
    if (!existing || (isRetiredBarcode(next) && !isRetiredBarcode(existing))) {
      map.set(key, next);
    }
  });
  return [...map.values()].sort((left, right) => {
    const byDate = String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
    if (byDate) return byDate;
    return String(left.barcode).localeCompare(String(right.barcode));
  });
}

export function filterBarcodeRows(rows, { query = '', sourceModule = '' } = {}) {
  const needle = codeText(query).toLowerCase();
  return (rows || []).filter((row) => {
    if (sourceModule && row?.sourceModule !== sourceModule) return false;
    if (!needle) return true;
    return [row.barcode, row.description, row.referenceNo, row.status, row.location, row.sourceModule, row.sourceTable, row.deletedReason, row.deletedBy]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  });
}

export function barcodeSourceModules(rows) {
  return [...new Set((rows || []).map((row) => row?.sourceModule).filter(Boolean))].sort();
}
