/**
 * Order Management CSV reports.
 *
 * One row per order. When a job needs several raw materials, their figures
 * sit in the Raw Materials cell, separated by semicolons, so a planner can
 * read one order across one Excel row and still see every film, ink, and
 * adhesive. Short Materials repeats only the lines that are still short.
 *
 * Pending: not completed, dispatched, delivered, or cancelled. The same
 * closed set as orderIsClosedOrCancelled, plus a job whose production stage
 * is already Dispatched. Partially dispatched jobs stay pending.
 *
 * Overdue: a pending order whose committed delivery date is before today in
 * Asia/Kolkata. The committed date is the revised deadline when one is
 * saved, otherwise the commercial date (original, then target, then
 * delivery). That is the same clock as the printing-deadline reminder.
 * A due date of today is not overdue. An order with no date is not overdue.
 *
 * Raw material required kilograms come from the same requirement list Order
 * Management shows, including a saved printed-SFG reduction. Available stock
 * is usable on-hand stock: archived items are left out (isInventoryItemActive),
 * QC Hold / pending QC / rejected stock is left out, and deleted or
 * written-off barcodes are left out (findRetiredBarcode). When the item has
 * raw-material rolls, on-hand is the sum of rolls still In Stock. Otherwise
 * it is the item's availableQtyKg. Shortfall is the balance from
 * calculateOrderStockReservations, so an earlier delivery keeps the stock it
 * already reserved. Issued kilograms are reported beside that and are not
 * subtracted again, because on-hand stock is what remains after issues.
 * Issued kilograms are the production record's net consumed quantity when
 * that was recorded, otherwise the issued quantity. A store issue is used
 * only when the production record has no line for that material.
 */

import {
  calculateOrderStockReservations,
  getOrderMaterialRequirements,
  getOrderStageInfo,
  getOrderStatusInfo,
  presentRequirementStock,
} from '../factoryStore.js';
import { isInventoryItemActive } from '../services/inventoryArchive.js';
import { findRetiredBarcode } from '../utils/barcodeRegistry.js';
import { formatPlantDate } from './dbDates.js';
import {
  calendarDaysUntil,
  commercialDeadline,
  dateOnlyString,
  derivePrintingBlockers,
  orderIsClosedOrCancelled,
  plantCalendarDate,
} from './orderDeadlineReminder.js';
import { planPrintedSfgAllocation } from './printedSfgReuse.js';

export const PENDING_ORDER_CSV_HEADERS = [
  'Order No',
  'PO Ref',
  'Order Date',
  'Customer',
  'Job Name',
  'Job No',
  'Structure',
  'Size',
  'Order Qty',
  'Unit',
  'Delivery/Due Date',
  'Days Remaining',
  'Priority',
  'Current Status',
  'Current Stage',
  'Stage Qty Produced (kg)',
  'Stage Percent Complete',
  'Next Stage',
  'RM Status',
  'RM Required Kg',
  'RM Issued Kg',
  'RM Shortfall Kg',
  'Short Materials',
  'Raw Materials',
  'Blockers',
];

export const OVERDUE_ORDER_CSV_HEADERS = [
  ...PENDING_ORDER_CSV_HEADERS.slice(0, 12),
  'Days Overdue',
  ...PENDING_ORDER_CSV_HEADERS.slice(12),
];

const STOCKED_ROLL = new Set(['in stock', 'approved', 'available']);

function roundKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function roundPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return Math.round(number * 10) / 10;
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function linkedJobMaster(order, jobMasters) {
  return (jobMasters || []).find((job) => (
    (order?.jobMasterId && (job.id === order.jobMasterId || job.jobMasterId === order.jobMasterId))
    || String(job.jobName || '').trim().toLowerCase() === String(order?.jobName || '').trim().toLowerCase()
  )) || null;
}

export function orderStructureText(order, jobMasters = []) {
  if (order?.isCylinderOrder || order?.orderType === 'Rotogravure Cylinder' || order?.materialFormat === 'Rotogravure Cylinder') {
    return firstText(order.cylinderDetails?.description, order.structure, 'Rotogravure Cylinder Set');
  }
  const own = firstText(
    order?.structure && order.structure !== 'PET / PE' && order.structure !== '—' ? order.structure : '',
    order?.jobDetails?.structure && order.jobDetails.structure !== 'PET / PE' && order.jobDetails.structure !== '—' ? order.jobDetails.structure : ''
  );
  if (own) return own;
  const layers = Array.isArray(order?.layers) && order.layers.length
    ? order.layers
    : (Array.isArray(order?.jobDetails?.layers) ? order.jobDetails.layers : []);
  if (layers.length) {
    return layers.map((layer) => `${layer.filmType || ''} ${layer.micron || ''}µ`.trim()).filter(Boolean).join(' / ');
  }
  const job = linkedJobMaster(order, jobMasters);
  if (job?.structure && job.structure !== 'PET / PE' && job.structure !== '—') return job.structure;
  if (Array.isArray(job?.layers) && job.layers.length) {
    return job.layers.map((layer) => `${layer.filmType || ''} ${layer.micron || ''}µ`.trim()).filter(Boolean).join(' / ');
  }
  return '';
}

export function orderSizeText(order, jobMasters = []) {
  const job = linkedJobMaster(order, jobMasters);
  const direct = firstText(
    order?.pouchSize,
    order?.size,
    order?.sizeMm,
    order?.pouchDimensions,
    order?.jobDetails?.pouchSize,
    order?.jobDetails?.size,
    job?.pouchSize,
    job?.size,
    job?.sizeMm,
    job?.pouchDimensions
  );
  if (direct) return direct;
  const width = order?.pouchWidthMm || job?.pouchWidthMm;
  const length = order?.pouchLengthMm || job?.pouchLengthMm;
  if (width || length) return `${width || 0} x ${length || 0} mm`;
  const printWidth = order?.printWidthMm || order?.jobDetails?.printWidthMm || job?.printWidthMm;
  const repeat = order?.repeatLengthMm || order?.jobDetails?.repeatLengthMm || job?.repeatLengthMm;
  if (printWidth && repeat) return `${printWidth} x ${repeat} mm`;
  if (printWidth) return `${printWidth} mm`;
  return '';
}

export function committedDueDate(order) {
  return dateOnlyString(order?.revisedDeadline) || commercialDeadline(order);
}

export function isPendingOrder(order, stageInfo) {
  if (!order || orderIsClosedOrCancelled(order)) return false;
  return stageInfo?.stage !== 'Dispatched';
}

export function isOverdueOrder(order, stageInfo, today = new Date()) {
  if (!isPendingOrder(order, stageInfo)) return false;
  const days = calendarDaysUntil(committedDueDate(order), today);
  return days !== null && days < 0;
}

export function filterOrdersLikeManagement(orders, { searchTerm = '', statusFilter = 'ALL', structureOf } = {}) {
  const structureText = typeof structureOf === 'function' ? structureOf : ((order) => orderStructureText(order));
  return (orders || []).filter((order) => {
    if (!order) return false;
    const query = String(searchTerm || '').trim().toLowerCase();
    if (order.status === 'Completed' && statusFilter !== 'COMPLETED') return false;
    if (statusFilter === 'COMPLETED' && order.status !== 'Completed') return false;
    const structure = structureText(order);
    const matchesSearch = !query
      || String(order.jobName || '').toLowerCase().includes(query)
      || String(order.id || '').toLowerCase().includes(query)
      || String(order.clientName || '').toLowerCase().includes(query)
      || String(structure || '').toLowerCase().includes(query);
    if (!matchesSearch) return false;
    const statusInfo = getOrderStatusInfo(order);
    if (statusFilter === 'DELAYED' && !statusInfo.isOverdue) return false;
    if (statusFilter === 'NEARING_DEADLINE' && !statusInfo.isNearingDeadline) return false;
    if (statusFilter === 'ON_HOLD' && order.status !== 'On Hold') return false;
    if (statusFilter === 'PENDING_PO' && order.poIssued) return false;
    return true;
  });
}

function unusableStockText(value) {
  return /qc\s*hold|pending\s*qc|rejected|archived|written[\s-]*off|write[\s-]*off|\bvoid\b|\bdeleted\b/i.test(String(value || ''));
}

function rollBarcode(roll) {
  return roll?.barcodeId || roll?.barcode || roll?.id;
}

function isRawMaterialRoll(roll) {
  const type = String(roll?.rollType || 'RAW_MATERIAL').trim().toUpperCase();
  return type === 'RAW_MATERIAL' || type === 'RM';
}

function rollBelongsToItem(roll, item) {
  const rollItem = String(roll?.itemId || roll?.stockItemId || roll?.itemCode || '').trim();
  if (!rollItem) return false;
  const itemId = String(item?.id || '').trim();
  const itemCode = String(item?.itemCode || '').trim();
  return rollItem === itemId || (itemCode !== '' && rollItem === itemCode);
}

function rollIsOnHand(roll, retiredBarcodes) {
  if (!roll || findRetiredBarcode(retiredBarcodes, rollBarcode(roll))) return false;
  if (unusableStockText(roll.qcStatus) || unusableStockText(roll.location) || unusableStockText(roll.locationBay) || unusableStockText(roll.storeLocation)) {
    return false;
  }
  const status = String(roll.status || 'In Stock').trim().toLowerCase();
  if (unusableStockText(status)) return false;
  return STOCKED_ROLL.has(status);
}

/**
 * Usable kilograms for one inventory item.
 * Archived items, QC Hold, and retired barcodes contribute nothing.
 */
export function usableOnHandKg(item, rolls = [], retiredBarcodes = []) {
  if (!isInventoryItemActive(item)) return 0;
  if (unusableStockText(item.status) || unusableStockText(item.qcStatus) || unusableStockText(item.location) || unusableStockText(item.storeLocation)) {
    return 0;
  }
  if (findRetiredBarcode(retiredBarcodes, item.barcodeId || item.barcode)) return 0;
  const related = (rolls || []).filter((roll) => isRawMaterialRoll(roll) && rollBelongsToItem(roll, item));
  if (!related.length) {
    return roundKg(Math.max(0, Number(item.availableQtyKg ?? item.stockQtyKg ?? item.stock_qty_kg ?? 0) || 0));
  }
  return roundKg(related.reduce((sum, roll) => {
    if (!rollIsOnHand(roll, retiredBarcodes)) return sum;
    return sum + Math.max(0, Number(roll.availableWeightKg ?? roll.netWeightKg ?? 0) || 0);
  }, 0));
}

export function inventoryWithUsableStock(inventory = [], rolls = [], retiredBarcodes = []) {
  return (inventory || []).flatMap((item) => {
    if (!item || !isInventoryItemActive(item)) return [];
    if (unusableStockText(item.status) || unusableStockText(item.qcStatus) || unusableStockText(item.location) || unusableStockText(item.storeLocation)) {
      return [];
    }
    if (findRetiredBarcode(retiredBarcodes, item.barcodeId || item.barcode)) return [];
    const availableQtyKg = usableOnHandKg(item, rolls, retiredBarcodes);
    return [{ ...item, availableQtyKg, stockQtyKg: availableQtyKg }];
  });
}

function choiceFor(order, choices) {
  const draft = choices?.[order?.id];
  if (draft) return { mode: draft.mode || 'all', kg: draft.kg, explicit: true };
  if (order?.printedSfgUse) {
    return { mode: order.printedSfgUse.mode, kg: order.printedSfgUse.allocatedKg, explicit: false };
  }
  return { mode: 'all', explicit: true };
}

function requirementsFor(order, orders, context) {
  const stored = getOrderMaterialRequirements(order, context.jobMasters || []);
  const saved = order?.printedSfgUse;
  const base = saved?.printLineId && saved.baseQtyKg !== undefined && saved.baseQtyKg !== null
    ? stored.map((req) => (req.id === saved.printLineId ? { ...req, qtyKg: Number(saved.baseQtyKg) || 0 } : req))
    : stored;
  return planPrintedSfgAllocation({
    order,
    orders,
    sfgGoods: context.sfgGoods || [],
    requirements: base,
    choice: choiceFor(order, context.allocationChoices),
  }).requirements;
}

function cleanId(value) {
  return String(value || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
}

function recordMatchesOrder(record, order) {
  if (!record || !order) return false;
  const orderId = cleanId(order.id);
  const recordId = cleanId(record.orderId || record.order_id);
  if (orderId && recordId && orderId === recordId) return true;
  const orderCode = String(order.jobCode || '').trim().toLowerCase();
  const recordCode = String(record.jobCode || record.job_code || '').trim().toLowerCase();
  if (orderCode && recordCode && orderCode === recordCode) return true;
  const orderName = String(order.jobName || '').trim().toLowerCase();
  const recordName = String(record.jobName || record.job_name || '').trim().toLowerCase();
  return Boolean(orderName && recordName && (recordName === orderName || recordName.includes(orderName) || orderName.includes(recordName)));
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function producedKgOnRecord(record, stage) {
  if (stage === 'Printing (Pass 1)') {
    return positiveNumber(record.qtyFirstPassL1, record.qtyPrinting, record.stages?.printing?.outputKg, record.printedOutputKg);
  }
  if (stage === 'Lamination (Pass 1)') return positiveNumber(record.qtyLaminationL1, record.stages?.lamination?.outputKg);
  if (stage === 'Lamination (Pass 2)') return positiveNumber(record.qtySecondPassL2, record.stages?.laminationPass2?.outputKg);
  if (stage === 'Slitting & Rewinding') return positiveNumber(record.qtySlitting, record.stages?.slitting?.outputKg);
  if (stage === 'Pouching / Bag Making') return positiveNumber(record.qtyPouching, record.stages?.pouching?.outputKg);
  if (stage === 'Ready for Dispatch' || stage === 'Partially Dispatched' || stage === 'Dispatched') {
    return positiveNumber(record.qtyDispatch);
  }
  return 0;
}

function lotMatchesStage(lotStage, stage) {
  const text = String(lotStage || '').toLowerCase();
  if (stage === 'Lamination (Pass 2)') return text.includes('pass 2');
  if (stage === 'Lamination (Pass 1)') return text.includes('lamination') && !text.includes('pass 2');
  if (stage === 'Printing (Pass 1)') return text.includes('print');
  if (stage === 'Slitting & Rewinding') return text.includes('slit');
  if (stage === 'Pouching / Bag Making') return text.includes('pouch');
  return false;
}

function stageProgress(order, stageInfo, productionRecords) {
  const stage = stageInfo?.stage || '';
  const orderQty = Number(order?.orderQtyKg) || 0;
  let produced = (productionRecords || [])
    .filter((record) => recordMatchesOrder(record, order))
    .reduce((sum, record) => sum + producedKgOnRecord(record, stage), 0);
  if (!(produced > 0)) {
    if (stage === 'Ready for Dispatch') {
      produced = (stageInfo?.activeLots || [])
        .filter((lot) => lot.rollType === 'FG')
        .reduce((sum, lot) => sum + (Number(lot.totalNetKg) || 0), 0);
    } else if (stage === 'Partially Dispatched' || stage === 'Dispatched') {
      produced = Number(stageInfo?.totalDispatchedKg) || 0;
    } else {
      produced = (stageInfo?.activeLots || [])
        .filter((lot) => lotMatchesStage(lot.stage, stage))
        .reduce((sum, lot) => sum + (Number(lot.totalNetKg) || 0), 0);
    }
  }
  produced = roundKg(produced);
  const notStarted = stage === 'Pre-Production' || stage === 'Pending Engraver PO';
  if (notStarted && !(produced > 0)) return { qty: '', pct: '' };
  return {
    qty: produced,
    pct: orderQty > 0 ? roundPercent((produced / orderQty) * 100) : '',
  };
}

function nextStageLabel(stageInfo) {
  const steps = Array.isArray(stageInfo?.pipeline) ? stageInfo.pipeline : [];
  const upcoming = steps.find((step) => step?.isUpcoming);
  return upcoming?.label || '';
}

function materialKey(value) {
  return String(value || '').trim().toLowerCase();
}

function materialMatches(row, req) {
  const wanted = [req?.stockItemId, req?.itemId, req?.inventoryId].map((value) => String(value || '').trim()).filter(Boolean);
  const found = [row?.stockItemId, row?.itemId, row?.inventoryId, row?.itemCode].map((value) => String(value || '').trim()).filter(Boolean);
  if (wanted.length && found.some((id) => wanted.includes(id))) return true;
  const left = materialKey(req?.filmType || req?.itemName);
  const right = materialKey(row?.filmType || row?.itemName || row?.materialName);
  return Boolean(left && right && left === right);
}

function takenFromProduction(row) {
  const net = Number(row?.netConsumedQtyKg);
  if (Number.isFinite(net) && net > 0) return net;
  const issued = Number(row?.issueQtyKg);
  if (Number.isFinite(issued) && issued > 0) return issued;
  const consumed = Number(row?.consumedQtyKg);
  if (Number.isFinite(consumed) && consumed > 0) return consumed;
  return 0;
}

function issuedKgFor(order, req, productionRecords, storeIssues) {
  let fromRecord = 0;
  let sawRecordLine = false;
  (productionRecords || []).forEach((record) => {
    if (!recordMatchesOrder(record, order)) return;
    (record.materialsList || record.materials_list || []).forEach((row) => {
      if (!materialMatches(row, req)) return;
      sawRecordLine = true;
      fromRecord += takenFromProduction(row);
    });
  });
  if (sawRecordLine) return roundKg(fromRecord);
  const orderId = String(order?.id || '').trim().toLowerCase();
  const orderName = String(order?.jobName || '').trim().toLowerCase();
  let fromStore = 0;
  (storeIssues || []).forEach((row) => {
    if (!row || !materialMatches(row, req)) return;
    const job = String(row.jobName || row.orderId || '').trim().toLowerCase();
    const linked = String(row.orderId || '').trim().toLowerCase() === orderId || (job && (job === orderName || job === orderId));
    if (!linked) return;
    const qty = Number(row.qtyKg) || 0;
    fromStore += String(row.issueType || 'issue').toLowerCase() === 'return' ? -qty : qty;
  });
  return roundKg(Math.max(0, fromStore));
}

function materialLabel(req) {
  const name = firstText(req?.filmType, req?.itemName, 'Material');
  const micron = req?.micron && req.micron !== '-' ? `${req.micron}µ` : '';
  const width = req?.widthMm && req.widthMm !== '-' ? `${req.widthMm}mm` : '';
  const spec = [micron, width].filter(Boolean).join(' x ');
  return spec ? `${name} ${spec}` : name;
}

function rmSummary(lines) {
  if (!lines.length) {
    return { status: '', required: '', issued: '', shortfall: '', short: '', detail: '' };
  }
  const required = roundKg(lines.reduce((sum, line) => sum + line.required, 0));
  const issued = roundKg(lines.reduce((sum, line) => sum + line.issued, 0));
  const shortfall = roundKg(lines.reduce((sum, line) => sum + line.shortfall, 0));
  const detail = lines.map((line) => (
    `${line.label}: required ${line.required} kg, issued ${line.issued} kg, stock ${line.stock} kg, short ${line.shortfall} kg`
  )).join('; ');
  const short = lines
    .filter((line) => line.shortfall > 0)
    .map((line) => `${line.label} (${line.shortfall} kg)`)
    .join('; ');
  const needs = lines.some((line) => line.required > 0);
  let status = 'In Stock';
  if (needs && shortfall > 0) {
    const anyStock = lines.some((line) => line.stock > 0 || line.reserved > 0);
    status = anyStock ? 'Partially Available' : 'Short';
  }
  return { status, required, issued, shortfall, short, detail };
}

function poRefOf(order) {
  return firstText(
    order?.clientPoNumber,
    order?.clientPoNo,
    order?.customerPoNumber,
    order?.customerPo,
    order?.poRefNo,
    order?.poRef,
    order?.jobDetails?.clientPoNumber,
    order?.jobDetails?.customerPo,
    order?.jobDetails?.poRefNo,
    order?.jobDetails?.poRef,
    order?.poNumber,
    order?.jobDetails?.poNumber
  );
}

function jobNoOf(order, jobMasters) {
  const job = linkedJobMaster(order, jobMasters);
  return firstText(order?.jobCode, order?.skuCode, order?.jobDetails?.jobCode, order?.jobDetails?.skuCode, job?.jobCode, job?.skuCode, job?.jobNo);
}

function priorityOf(order) {
  return firstText(order?.priority, order?.jobDetails?.priority, order?.priorityTag);
}

function orderUnit(order) {
  return firstText(order?.orderUnit, order?.unit, order?.qtyUnit, order?.jobDetails?.unit) || 'kg';
}

function orderQty(order) {
  const number = Number(order?.orderQtyKg);
  return Number.isFinite(number) ? number : '';
}

function csvCell(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  const text = String(value);
  if (/^[=+\-@]/.test(text) || /[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function reportOrders(options) {
  const source = options.includeOrders || options.orders || [];
  return source.filter((order) => {
    if (!order) return false;
    const stageInfo = getOrderStageInfo(order, options.sfgGoods || [], options.productionRecords || []);
    if (options.kind === 'overdue') return isOverdueOrder(order, stageInfo, options.today);
    return isPendingOrder(order, stageInfo);
  });
}

export function buildOrderReportRows(options = {}) {
  const orders = options.orders || [];
  const jobMasters = options.jobMasters || [];
  const prepared = orders.filter(Boolean).map((order) => {
    const requirements = requirementsFor(order, orders, options);
    return { ...order, materialRequirements: requirements, rawMaterialRequirements: requirements };
  });
  const preparedById = new Map(prepared.map((order) => [String(order.id), order]));
  const stock = calculateOrderStockReservations(
    prepared,
    inventoryWithUsableStock(options.inventory || [], options.inventoryRolls || [], options.retiredBarcodes || []),
    jobMasters
  );
  const structureOf = typeof options.structureOf === 'function'
    ? options.structureOf
    : ((order) => orderStructureText(order, jobMasters));

  return reportOrders(options).map((order) => {
    const preparedOrder = preparedById.get(String(order.id)) || order;
    const stageInfo = getOrderStageInfo(order, options.sfgGoods || [], options.productionRecords || []);
    const progress = stageProgress(order, stageInfo, options.productionRecords || []);
    const due = committedDueDate(order);
    const daysRemaining = calendarDaysUntil(due, options.today);
    const requirements = preparedOrder.materialRequirements || [];
    const lines = requirements.map((req) => {
      const info = presentRequirementStock(req, stock.getReqStockInfo(req, order.id));
      return {
        label: materialLabel(req),
        required: roundKg(info.reqQty ?? req.qtyKg ?? 0),
        issued: issuedKgFor(order, req, options.productionRecords, options.storeIssues),
        stock: roundKg(info.totalInStock || 0),
        reserved: roundKg(info.reservedKg || 0),
        shortfall: roundKg(info.balanceKg || 0),
      };
    });
    const materials = rmSummary(lines);
    const blockers = derivePrintingBlockers(preparedOrder, options.blockerContext || {}).map((blocker) => blocker.label).join('; ');
    const row = {
      'Order No': firstText(order.id),
      'PO Ref': poRefOf(order),
      'Order Date': formatPlantDate(order.orderDate || order.jobDetails?.orderDate),
      Customer: firstText(order.clientName),
      'Job Name': firstText(order.jobName),
      'Job No': jobNoOf(order, jobMasters),
      Structure: structureOf(order) || '',
      Size: orderSizeText(order, jobMasters),
      'Order Qty': orderQty(order),
      Unit: orderUnit(order),
      'Delivery/Due Date': due ? formatPlantDate(due) : '',
      'Days Remaining': daysRemaining === null ? '' : daysRemaining,
      Priority: priorityOf(order),
      'Current Status': firstText(order.status, 'In Progress'),
      'Current Stage': stageInfo.stage || '',
      'Stage Qty Produced (kg)': progress.qty,
      'Stage Percent Complete': progress.pct,
      'Next Stage': nextStageLabel(stageInfo),
      'RM Status': materials.status,
      'RM Required Kg': materials.required,
      'RM Issued Kg': materials.issued,
      'RM Shortfall Kg': materials.shortfall,
      'Short Materials': materials.short,
      'Raw Materials': materials.detail,
      Blockers: blockers,
    };
    if (options.kind === 'overdue') {
      row['Days Overdue'] = daysRemaining === null ? '' : Math.abs(daysRemaining);
    }
    return row;
  });
}

export function orderCsvHeaders(kind) {
  return kind === 'overdue' ? OVERDUE_ORDER_CSV_HEADERS : PENDING_ORDER_CSV_HEADERS;
}

export function buildOrderCsv(options = {}) {
  const headers = orderCsvHeaders(options.kind);
  const lines = [
    headers.join(','),
    ...buildOrderReportRows(options).map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function orderCsvFileName(kind, today = new Date()) {
  const day = plantCalendarDate(today) || 'date';
  const prefix = kind === 'overdue' ? 'Overdue_Orders' : 'Pending_Orders';
  return `${prefix}_${day}.csv`;
}

export function downloadOrderCsvReport(options = {}) {
  const csv = buildOrderCsv(options);
  const filename = orderCsvFileName(options.kind, options.today);
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !document.body) {
    return { filename, csv };
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return { filename, csv };
}
