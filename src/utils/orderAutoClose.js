/**
 * Order close rules.
 * Auto-close only when dispatched FG is within ±10% of the order quantity,
 * a challan or shipment exists, and no SFG or undispatched FG remains.
 * There is no 110% cap on SFG or FG quantity that may be produced.
 * A manual Admin close is sticky: auto-close must not reopen it or replace it.
 */

export const ORDER_CLOSE_TOLERANCE_PCT = 10;
export const ORDER_AUTO_CLOSE_SETTING = 'order_auto_close_enabled';
export const ORDER_CLOSE_TOLERANCE_SETTING = 'order_close_tolerance_pct';
export const STOCK_DUST_KG = 0.05;
export const ORDER_CLOSED_STOCK_FLAG = 'Order closed';

export function isAdminRole(role) {
  return String(role || '').trim() === 'Admin';
}

export function cleanJobName(name) {
  return String(name || '').split(' ||| ')[0].trim().toLowerCase();
}

export function normalizeAutoCloseSettings(raw) {
  const source = raw || {};
  const enabledRaw = source.enabled !== undefined ? source.enabled : source[ORDER_AUTO_CLOSE_SETTING];
  const toleranceRaw = source.tolerancePct !== undefined ? source.tolerancePct : source[ORDER_CLOSE_TOLERANCE_SETTING];
  const enabled = enabledRaw === undefined || enabledRaw === null || enabledRaw === ''
    ? true
    : !(enabledRaw === false || enabledRaw === 'false' || enabledRaw === 0 || enabledRaw === '0');
  const toleranceNumber = Number(toleranceRaw);
  return {
    enabled,
    tolerancePct: Number.isFinite(toleranceNumber) && toleranceNumber > 0 ? toleranceNumber : ORDER_CLOSE_TOLERANCE_PCT
  };
}

export function isCylinderOrder(order) {
  return Boolean(
    order?.isCylinderOrder
    || order?.orderType === 'Rotogravure Cylinder'
    || order?.materialFormat === 'Rotogravure Cylinder'
  );
}

function isCancelled(doc) {
  const status = String(doc?.status || doc?.payload?.status || '').toLowerCase();
  return status === 'cancelled' || status === 'canceled' || doc?.cancelled === true || doc?.isCancelled === true;
}

function countsAsDispatchDocument(doc) {
  if (!doc || isCancelled(doc)) return false;
  const status = doc.packingStatus || doc.payload?.packingStatus || doc.packing_status;
  if (status === 'Open') return false;
  return true;
}

function itemKg(item) {
  if (!item) return 0;
  const unit = String(item.unit || 'Kg').trim().toLowerCase();
  const quantity = Number(item.quantity ?? item.qtyKg);
  const net = Number(item.netWeightKg);
  const kgUnit = unit === 'kg' || unit === 'kgs' || unit === 'kilogram' || unit === 'kilograms' || unit === '';
  if (kgUnit && Number.isFinite(quantity)) return quantity;
  if (Number.isFinite(net)) return net;
  return 0;
}

export function documentDispatchKg(doc) {
  if (!countsAsDispatchDocument(doc)) return 0;
  const items = doc.items || doc.payload?.items || [];
  if (Array.isArray(items) && items.length > 0) {
    const fromItems = items.reduce((sum, item) => sum + itemKg(item), 0);
    if (fromItems > 0) return fromItems;
  }
  const total = Number(doc.totalNetWeightKg ?? doc.payload?.totalNetWeightKg);
  return Number.isFinite(total) ? total : 0;
}

function matchesOrder(order, doc) {
  const orderId = String(order?.id || '').trim().toLowerCase();
  const docOrder = String(doc?.orderId || doc?.payload?.orderId || '').trim().toLowerCase();
  if (orderId && docOrder && orderId === docOrder) return true;
  const orderName = cleanJobName(order?.jobName);
  const docName = cleanJobName(doc?.jobName || doc?.payload?.jobName || '');
  return Boolean(orderName && docName && orderName === docName);
}

export function dispatchedKgForOrder(order, challans = [], shipments = []) {
  const eligibleChallans = (challans || []).filter(countsAsDispatchDocument);
  const eligibleShipments = (shipments || []).filter(countsAsDispatchDocument);
  const challanKg = eligibleChallans
    .filter((doc) => matchesOrder(order, doc))
    .reduce((sum, doc) => sum + documentDispatchKg(doc), 0);
  const shipmentKg = eligibleShipments
    .filter((doc) => matchesOrder(order, doc))
    .reduce((sum, doc) => sum + documentDispatchKg(doc), 0);
  const hasChallan = eligibleChallans.some((doc) => matchesOrder(order, doc));
  const hasShipment = eligibleShipments.some((doc) => matchesOrder(order, doc));
  let kg = 0;
  if (challanKg > 0 && shipmentKg > 0) kg = Math.max(challanKg, shipmentKg);
  else kg = challanKg + shipmentKg;
  return { kg, hasDocument: hasChallan || hasShipment };
}

function isFgLot(item) {
  const type = String(item?.sfgType || item?.category || '');
  const code = String(item?.sfgBatchCode || item?.barcodeId || '');
  return item?.rollType === 'FG' || /finish/i.test(type) || code.startsWith('FG-');
}

function availableKg(item) {
  if (item?.availableKg !== undefined && item?.availableKg !== null && item?.availableKg !== '') {
    const value = Number(item.availableKg);
    return Number.isFinite(value) ? value : 0;
  }
  const net = Number(item?.totalNetKg ?? item?.netWeightKg ?? 0) || 0;
  const consumed = Number(item?.consumedKg ?? 0) || 0;
  return Math.max(0, net - consumed);
}

function stockMatches(order, item) {
  const orderId = String(order?.id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
  const itemOrder = String(item?.orderId || item?.order_id || '').replace(/^PR-/, '').replace(/^REC-/, '').trim().toLowerCase();
  if (orderId && itemOrder && orderId === itemOrder) return true;
  const orderCode = String(order?.jobCode || '').trim().toLowerCase();
  const itemCode = String(item?.jobCode || item?.job_code || '').trim().toLowerCase();
  if (orderCode && itemCode && orderCode === itemCode) return true;
  const orderName = cleanJobName(order?.jobName);
  const itemName = cleanJobName(item?.jobName || item?.job_name);
  return Boolean(orderName && itemName && orderName === itemName);
}

export function remainingStockForOrder(order, sfgGoods = []) {
  let sfgKg = 0;
  let fgKg = 0;
  (sfgGoods || []).forEach((item) => {
    if (!stockMatches(order, item)) return;
    const kg = availableKg(item);
    if (isFgLot(item)) fgKg += kg;
    else sfgKg += kg;
  });
  return {
    sfgKg,
    fgKg,
    hasLeftover: sfgKg > STOCK_DUST_KG || fgKg > STOCK_DUST_KG
  };
}

export function readyForDispatchLots(stageInfo) {
  return (stageInfo?.activeLots || []).filter((lot) => lot.rollType === 'FG' && Number(lot.availableKg) > STOCK_DUST_KG);
}

function unchanged(order, reason) {
  return { action: 'none', changed: false, order, audit: null, reason };
}

function sameClose(order, next) {
  return order.status === next.status
    && (order.closeMode || null) === (next.closeMode || null)
    && (order.overDispatchWarning || null) === (next.overDispatchWarning || null)
    && (order.closedBy || null) === (next.closedBy || null);
}

export function evaluateOrderAutoClose({
  order,
  challans = [],
  shipments = [],
  sfgGoods = [],
  settings,
  now = new Date().toISOString()
} = {}) {
  if (!order) return unchanged(null, 'missing');
  const config = normalizeAutoCloseSettings(settings);
  if (isCylinderOrder(order)) return unchanged(order, 'cylinder');
  if (!config.enabled) return unchanged(order, 'disabled');
  if (order.closeMode === 'manual' || order.close_mode === 'manual') {
    return unchanged(order, 'manual-close');
  }
  if (order.status === 'Cancelled') return unchanged(order, 'cancelled');
  if (order.status === 'Completed' && order.closeMode !== 'auto') {
    return unchanged(order, 'completed-not-auto');
  }

  const orderQty = Number(order.orderQtyKg) || 0;
  const dispatched = dispatchedKgForOrder(order, challans, shipments);
  const stock = remainingStockForOrder(order, sfgGoods);
  const low = 1 - (config.tolerancePct / 100);
  const high = 1 + (config.tolerancePct / 100);
  const ratio = orderQty > 0 ? dispatched.kg / orderQty : null;
  const inBand = ratio !== null && ratio + 1e-9 >= low && ratio - 1e-9 <= high;
  const qualifies = Boolean(dispatched.hasDocument && inBand && !stock.hasLeftover && orderQty > 0);

  if (qualifies) {
    const next = {
      ...order,
      status: 'Completed',
      closeMode: 'auto',
      closedBy: 'auto-close',
      closedAt: order.closeMode === 'auto' && order.closedAt ? order.closedAt : now,
      closeReason: `Dispatched ${dispatched.kg} kg is within ±${config.tolerancePct}% of order quantity ${orderQty} kg, with no SFG or FG left on the order.`,
      overDispatchWarning: null
    };
    if (sameClose(order, next)) return unchanged(order, 'already-auto-closed');
    return {
      action: 'close',
      changed: true,
      order: next,
      audit: `Auto-closed order ${order.id}. ${next.closeReason}`,
      reason: 'in-band'
    };
  }

  if (order.status === 'Completed' && order.closeMode === 'auto') {
    const nextStatus = dispatched.kg > 0 ? 'Partially Dispatched' : 'In Production';
    const next = {
      ...order,
      status: nextStatus,
      closeMode: null,
      closedBy: null,
      closedAt: null,
      closeReason: null,
      overDispatchWarning: ratio !== null && ratio > high
        ? `Dispatched ${dispatched.kg} kg is above ${config.tolerancePct}% of order quantity ${orderQty} kg. The order stays open.`
        : null
    };
    return {
      action: 'reopen',
      changed: true,
      order: next,
      audit: `Reopened auto-closed order ${order.id} because it no longer matches the ±${config.tolerancePct}% rule.`,
      reason: 'auto-no-longer-qualifies'
    };
  }

  if (ratio !== null && ratio > high && dispatched.hasDocument) {
    const warning = `Dispatched ${dispatched.kg} kg is above ${config.tolerancePct}% of order quantity ${orderQty} kg. The order stays open.`;
    const next = { ...order, overDispatchWarning: warning };
    if ((order.overDispatchWarning || null) === warning) return unchanged(order, 'over-dispatch-already');
    return {
      action: 'over-dispatch',
      changed: true,
      order: next,
      audit: `Over-dispatch warning on order ${order.id}. ${warning}`,
      reason: 'over-dispatch'
    };
  }

  if (dispatched.kg > 0 && orderQty > 0 && ratio < low && order.status !== 'Partially Dispatched' && order.status !== 'On Hold') {
    const next = { ...order, status: 'Partially Dispatched', overDispatchWarning: null };
    return {
      action: 'partial',
      changed: true,
      order: next,
      audit: `Order ${order.id} stays open as Partially Dispatched (${dispatched.kg} kg of ${orderQty} kg).`,
      reason: 'below-band'
    };
  }

  if (order.overDispatchWarning && !(ratio > high)) {
    return {
      action: 'clear-warning',
      changed: true,
      order: { ...order, overDispatchWarning: null },
      audit: null,
      reason: 'warning-cleared'
    };
  }

  return unchanged(order, stock.hasLeftover ? 'leftover-stock' : 'outside-band-or-no-document');
}

export function planAutoCloseUpdates(orders, context) {
  return (orders || [])
    .map((order) => evaluateOrderAutoClose({ order, ...context }))
    .filter((decision) => decision.changed);
}

export function buildManualClose(order, { user, reason, now = new Date().toISOString() } = {}) {
  if (!isAdminRole(user?.role)) {
    return { ok: false, error: 'Only Admin can manually close an order.' };
  }
  const text = String(reason || '').trim();
  if (!text) return { ok: false, error: 'A reason is required to close an order.' };
  if (!order?.id) return { ok: false, error: 'Order is missing.' };
  const closedBy = user.name || user.fullName || user.email || 'Admin';
  const next = {
    ...order,
    status: 'Completed',
    closeMode: 'manual',
    closedBy,
    closedAt: now,
    closeReason: text,
    overDispatchWarning: null
  };
  return {
    ok: true,
    order: next,
    audit: `Admin ${closedBy} manually closed order ${order.id}. Reason: ${text}`
  };
}

export function buildManualReopen(order, { user, reason, now = new Date().toISOString() } = {}) {
  if (!isAdminRole(user?.role)) {
    return { ok: false, error: 'Only Admin can reopen an order.' };
  }
  const text = String(reason || '').trim();
  if (!text) return { ok: false, error: 'A reason is required to reopen an order.' };
  if (!order?.id) return { ok: false, error: 'Order is missing.' };
  const actor = user.name || user.fullName || user.email || 'Admin';
  const next = {
    ...order,
    status: 'In Production',
    closeMode: null,
    closedBy: null,
    closedAt: null,
    closeReason: null,
    reopenedBy: actor,
    reopenedAt: now,
    reopenReason: text
  };
  return {
    ok: true,
    order: next,
    audit: `Admin ${actor} reopened order ${order.id}. Reason: ${text}`
  };
}

export function manualCloseGuard(previous, next, user) {
  if (!next) return 'Order is missing.';
  const admin = isAdminRole(user?.role);
  const nextManual = next.closeMode === 'manual';
  const prevManual = previous?.closeMode === 'manual';
  if (nextManual && !prevManual && !admin) return 'Only Admin can manually close an order.';
  if (prevManual && !nextManual && !admin) return 'Only Admin can reopen a manually closed order.';
  if (previous?.closeMode === 'manual' && previous?.status === 'Completed' && next.status !== 'Completed' && !admin) {
    return 'Only Admin can reopen a manually closed order.';
  }
  return '';
}

export function orderClosedStockLabel(order) {
  return order?.status === 'Completed' ? ORDER_CLOSED_STOCK_FLAG : '';
}
