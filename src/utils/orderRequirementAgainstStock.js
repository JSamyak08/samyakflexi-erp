/**
 * Requirement Against Orders.
 *
 * For one stock item, this is the still-unconsumed requirement on active
 * customer orders. It is informational. It does not reserve stock, reduce
 * usable quantity, or create a barcode.
 *
 * An order is active when orderIsClosedOrCancelled is false. That closed set
 * is completed, cancelled, canceled, closed, dispatched, and delivered.
 * On hold, scheduled, and in-production orders stay in the sum.
 *
 * For each active order, the requirement is the sum of that order's material
 * lines that match this stock item. A saved printed-SFG allocation reduces
 * the print-film line the same way Order Management does. Quantity already
 * issued or consumed for that order and item is subtracted. A fully consumed
 * line (nothing left) is left out of the list.
 *
 * Consumption uses the posted roll ledger when that order and item has one
 * (net consumed kilograms). A movement belongs to this item the same way the
 * stock ledger does: by stock item id, or by an exact item name when the row
 * has no item id. Film, micron, and width are not consumption identifiers, so
 * a neighbouring width is not treated as already used. Production-record
 * lines for the same barcode, or without a barcode once a roll issue exists,
 * are not added again. Otherwise the production record's net consumed
 * quantity is used, or the issued quantity when net was not recorded. A store
 * issue is used only when neither the roll ledger nor a production line covers
 * that order and item. A store return reduces that store quantity.
 */

import { getOrderMaterialRequirements, matchRequirementToInventoryItem } from '../factoryStore.js';
import { ledgerRowLink } from '../services/inventoryLedgerMatch.js';
import { orderIsClosedOrCancelled } from './orderDeadlineReminder.js';
import { planPrintedSfgAllocation } from './printedSfgReuse.js';

export const ACTIVE_ORDER_RULE = 'orderIsClosedOrCancelled';

export function roundRequirementKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(2));
}

export function isActiveOrderForRequirement(order) {
  return Boolean(order) && !orderIsClosedOrCancelled(order);
}

function itemIds(item) {
  const ids = new Set();
  const add = (row) => {
    if (!row) return;
    [row.id, row.itemCode, row.primaryId].forEach((value) => {
      const text = String(value || '').trim();
      if (text) ids.add(text);
    });
    (row.allInventoryIds || []).forEach((id) => {
      const text = String(id || '').trim();
      if (text) ids.add(text);
    });
  };
  add(item);
  (item?.subItems || []).forEach(add);
  return ids;
}

function stockCandidates(item) {
  const subs = Array.isArray(item?.subItems) ? item.subItems.filter(Boolean) : [];
  return [item, ...subs].filter(Boolean);
}

export function requirementMatchesStockItem(req, item) {
  if (!req || !item) return false;
  const ids = itemIds(item);
  const direct = [req.stockItemId, req.itemId, req.inventoryId, req.itemCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (direct.some((id) => ids.has(id))) return true;
  const film = String(req.filmType || req.itemName || '').trim();
  if (!film) return false;
  return Boolean(matchRequirementToInventoryItem(req, stockCandidates(item)));
}

function recordMatchesOrder(record, order) {
  if (!record || !order) return false;
  const orderId = String(order.id || '').trim().toLowerCase();
  const recordOrderId = String(record.orderId || record.order_id || '').trim().toLowerCase();
  // A saved order id wins. A shared job code must not move one order's
  // consumption onto another order of the same product.
  if (recordOrderId) return Boolean(orderId) && recordOrderId === orderId;
  const orderName = String(order.jobName || '').trim().toLowerCase();
  const recordName = String(record.jobName || record.job_name || '').trim().toLowerCase();
  return Boolean(orderName && recordName && orderName === recordName);
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

function rowMatchesStockItem(row, item) {
  return ledgerRowLink(row, item).include;
}

function rollEntryMatchesItem(entry, item) {
  return ledgerRowLink({
    stockItemId: entry?.stockItemId,
    itemId: entry?.itemId,
    itemCode: entry?.itemCode,
    itemName: entry?.itemName
  }, item).include;
}

function rollEntryForOrder(entry, order, productionRecords) {
  const entryOrder = String(entry?.orderId || '').trim();
  const orderId = String(order?.id || '').trim();
  if (entryOrder && orderId && entryOrder.toLowerCase() === orderId.toLowerCase()) return true;
  if (entryOrder) return false;
  const recordId = String(entry?.productionRecordId || '').trim();
  if (!recordId) return false;
  const record = (productionRecords || []).find((row) => String(row?.id || '') === recordId);
  return recordMatchesOrder(record, order);
}

function consumedFromRollEntry(entry) {
  const consumed = Number(entry?.consumedKg);
  if (Number.isFinite(consumed) && consumed > 0) return consumed;
  const qty = Number(entry?.qtyKg);
  if (Number.isFinite(qty) && qty > 0) return qty;
  return 0;
}

function storeIssueMatchesOrder(row, order) {
  const orderId = String(order?.id || '').trim().toLowerCase();
  const orderName = String(order?.jobName || '').trim().toLowerCase();
  const linkedId = String(row?.orderId || '').trim().toLowerCase();
  const job = String(row?.jobName || row?.orderId || '').trim().toLowerCase();
  if (linkedId && orderId && linkedId === orderId) return true;
  return Boolean(job && (job === orderName || job === orderId));
}

function requirementsForOrder(order, orders, jobMasters, sfgGoods) {
  const stored = getOrderMaterialRequirements(order, jobMasters);
  if (!order?.printedSfgUse) return stored;
  return planPrintedSfgAllocation({
    order,
    orders,
    sfgGoods: sfgGoods || [],
    requirements: stored,
    choice: {
      mode: order.printedSfgUse.mode,
      kg: order.printedSfgUse.allocatedKg,
      explicit: false
    }
  }).requirements || stored;
}

function consumedKgForOrderItem(order, item, context) {
  const productionRecords = context.productionRecords || [];
  const rollEntries = (context.rollLedgerEntries || []).filter((entry) => {
    const kind = entry?.entryKind || entry?.entry_kind || 'issue';
    return kind === 'issue'
      && rollEntryMatchesItem(entry, item)
      && rollEntryForOrder(entry, order, productionRecords);
  });
  const rollBarcodes = new Set(
    rollEntries.map((entry) => String(entry.barcode || '').trim().toLowerCase()).filter(Boolean)
  );
  const rollKg = rollEntries.reduce((sum, entry) => sum + consumedFromRollEntry(entry), 0);

  let productionKg = 0;
  let sawProduction = false;
  productionRecords.forEach((record) => {
    if (!recordMatchesOrder(record, order)) return;
    (record.materialsList || record.materials_list || []).forEach((row) => {
      if (!rowMatchesStockItem(row, item)) return;
      const barcode = String(row?.barcode || row?.barcodeId || row?.barcode_id || '').trim().toLowerCase();
      if (barcode && rollBarcodes.has(barcode)) return;
      if (!barcode && rollKg > 0) return;
      sawProduction = true;
      productionKg += takenFromProduction(row);
    });
  });

  if (rollKg > 0 || sawProduction) {
    return roundRequirementKg(Math.max(0, rollKg + productionKg));
  }

  let storeKg = 0;
  (context.storeIssues || []).forEach((row) => {
    if (!row || !rowMatchesStockItem(row, item) || !storeIssueMatchesOrder(row, order)) return;
    const qty = Number(row.qtyKg) || 0;
    storeKg += String(row.issueType || 'issue').toLowerCase() === 'return' ? -qty : qty;
  });
  return roundRequirementKg(Math.max(0, storeKg));
}

/**
 * Unconsumed requirement of one stock item on current active orders.
 * rows are the orders that still need some of this item. totalKg is their sum.
 */
export function requirementAgainstOrders({
  item,
  orders = [],
  jobMasters = [],
  productionRecords = [],
  storeIssues = [],
  rollLedgerEntries = [],
  sfgGoods = []
} = {}) {
  const context = { productionRecords, storeIssues, rollLedgerEntries };
  const rows = [];
  (orders || []).forEach((order) => {
    if (!isActiveOrderForRequirement(order)) return;
    const requirements = requirementsForOrder(order, orders, jobMasters, sfgGoods);
    const requiredKg = (requirements || []).reduce((sum, req) => {
      if (!requirementMatchesStockItem(req, item)) return sum;
      return sum + (Number(req?.qtyKg) || 0);
    }, 0);
    if (!(requiredKg > 0)) return;
    const consumedKg = consumedKgForOrderItem(order, item, context);
    const unconsumedKg = roundRequirementKg(Math.max(0, requiredKg - consumedKg));
    if (!(unconsumedKg > 0)) return;
    rows.push({
      orderId: String(order.id || ''),
      jobName: String(order.jobName || ''),
      requiredKg: roundRequirementKg(requiredKg),
      consumedKg,
      unconsumedKg
    });
  });
  rows.sort((a, b) => a.orderId.localeCompare(b.orderId, undefined, { numeric: true }));
  const totalKg = roundRequirementKg(rows.reduce((sum, row) => sum + row.unconsumedKg, 0));
  return { rows, totalKg, activeOrderRule: ACTIVE_ORDER_RULE };
}
