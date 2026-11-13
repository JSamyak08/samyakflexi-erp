/**
 * One Sale of Goods delivery challan per job order, and packing-list edits
 * that update the challan already linked to that list.
 *
 * A second shipment for a Balance Dispatch Pending order is not issued.
 * The existing challan and its packing list can be edited. Returnable and
 * job-work challans are not part of this rule.
 *
 * Scale #4 records net weight. Core/package tare is typed. Gross is net plus
 * tare. Editing tare keeps the net and recalculates gross.
 */

import { round2 } from './dispatchPacking.js';
import { cleanJobName } from './orderAutoClose.js';

export const SALE_OF_GOODS = 'Sale of Goods';

export function isCancelledChallan(doc) {
  const status = String(doc?.status || doc?.payload?.status || '').toLowerCase();
  return status === 'cancelled' || status === 'canceled' || doc?.cancelled === true || doc?.isCancelled === true;
}

export function challanNature(doc) {
  return String(doc?.challanNature || doc?.movementType || doc?.natureOfMovement || SALE_OF_GOODS);
}

export function isSaleOfGoodsChallan(doc) {
  return challanNature(doc) === SALE_OF_GOODS && !isCancelledChallan(doc);
}

function usableId(value) {
  const text = String(value || '').trim();
  if (!text || text.toLowerCase() === 'n/a') return '';
  return text;
}

export function packingListIdsOf(challan) {
  const ids = [];
  if (Array.isArray(challan?.linkedPackingListIds)) ids.push(...challan.linkedPackingListIds);
  if (challan?.linkedPackingListId) ids.push(challan.linkedPackingListId);
  (challan?.items || []).forEach((item) => {
    if (item?.packingListId) ids.push(item.packingListId);
  });
  return [...new Set(ids.map((id) => String(id)).filter(Boolean))];
}

export function shipmentKeys(shipment) {
  return [...new Set([shipment?.dispatchId, shipment?.id].map((value) => String(value || '').trim()).filter(Boolean))];
}

export function challanLinksShipment(challan, shipment) {
  const keys = new Set(shipmentKeys(shipment));
  return packingListIdsOf(challan).some((id) => keys.has(String(id)));
}

function rememberId(set, value) {
  const id = usableId(value);
  if (id) set.add(id.toLowerCase());
}

function rememberName(set, value) {
  const name = cleanJobName(value);
  if (name) set.add(name);
}

export function identityOnShipment(shipment) {
  const ids = new Set();
  const names = new Set();
  rememberId(ids, shipment?.orderId);
  rememberName(names, shipment?.jobName);
  (shipment?.items || []).forEach((item) => {
    rememberId(ids, item?.orderId);
    rememberName(names, item?.jobName);
  });
  return { ids, names };
}

export function ordersOnShipment(shipment, orders = []) {
  const { ids, names } = identityOnShipment(shipment);
  return (orders || []).filter((order) => {
    const id = usableId(order?.id).toLowerCase();
    return (id && ids.has(id)) || names.has(cleanJobName(order?.jobName));
  });
}

function shipmentMatchesKeys(shipment, keys) {
  return shipmentKeys(shipment).some((key) => keys.has(key));
}

export function ordersCoveredByChallan(challan, orders = [], shipments = []) {
  if (!challan) return [];
  const ids = new Set();
  const names = new Set();
  rememberId(ids, challan.orderId);
  rememberName(names, challan.jobName);
  (challan.items || []).forEach((item) => {
    rememberId(ids, item?.orderId);
    rememberName(names, item?.jobName);
  });
  const linked = new Set(packingListIdsOf(challan));
  (shipments || []).forEach((shipment) => {
    if (!shipmentMatchesKeys(shipment, linked)) return;
    const found = identityOnShipment(shipment);
    found.ids.forEach((id) => ids.add(id));
    found.names.forEach((name) => names.add(name));
  });
  return (orders || []).filter((order) => {
    const id = usableId(order?.id).toLowerCase();
    return (id && ids.has(id)) || names.has(cleanJobName(order?.jobName));
  });
}

export function activeSaleChallansForOrder(order, challans = [], shipments = [], { exceptChallanId = '' } = {}) {
  const skip = String(exceptChallanId || '');
  return (challans || []).filter((challan) => {
    if (!isSaleOfGoodsChallan(challan)) return false;
    if (skip && String(challan.id) === skip) return false;
    return ordersCoveredByChallan(challan, [order], shipments).length > 0;
  });
}

/**
 * Block a new Sale of Goods challan when any of these orders already has one.
 * Pass exceptChallanId while editing that challan so it does not block itself.
 */
export function saleChallanConflicts(orders, challans = [], shipments = [], options = {}) {
  const conflicts = [];
  (orders || []).forEach((order) => {
    const existing = activeSaleChallansForOrder(order, challans, shipments, options);
    if (!existing.length) return;
    const challan = existing[0];
    conflicts.push({
      orderId: order.id,
      jobName: cleanJobName(order.jobName) || order.jobName || order.id,
      challanNo: challan.challanNo || challan.id,
      challanId: challan.id,
    });
  });
  return conflicts;
}

export function formatSaleChallanConflicts(conflicts) {
  if (!conflicts?.length) return '';
  const lines = conflicts.map((row) => `${row.orderId} (${row.jobName}) already has ${row.challanNo}`);
  return `A Sale of Goods delivery challan already exists for ${lines.join('; ')}. Edit that challan or its packing list. A second challan is not issued for the same job order.`;
}

/**
 * Net stays as weighed. Tare is the editable core/package weight.
 * Gross is net plus tare.
 */
export function rollWithTare(roll, tareInput) {
  const tare = Number(tareInput);
  const safeTare = Number.isFinite(tare) && tare >= 0 ? round2(tare) : 0;
  const net = round2(Number(roll?.netWeightKg) || 0);
  return {
    ...roll,
    tareWeightKg: safeTare,
    coreWeightKg: safeTare,
    netWeightKg: net,
    grossWeightKg: round2(net + safeTare),
  };
}

export function tareEditSummary(previous, next) {
  const lines = [];
  (next?.items || []).forEach((roll) => {
    const before = (previous?.items || []).find((row) => row?.barcodeId && row.barcodeId === roll?.barcodeId);
    if (!before) return;
    const oldTare = Number(before.tareWeightKg ?? before.coreWeightKg);
    const newTare = Number(roll.tareWeightKg ?? roll.coreWeightKg);
    if (!Number.isFinite(oldTare) || !Number.isFinite(newTare) || oldTare === newTare) return;
    lines.push(`${roll.barcodeId}: core/tare ${oldTare} kg → ${newTare} kg (net ${roll.netWeightKg} kg, gross ${roll.grossWeightKg} kg)`);
  });
  return lines;
}

function rateForGroup(jobName, plId, existingItems, rateFor) {
  const found = (existingItems || []).find((item) => (
    String(item?.packingListId || '') === String(plId)
    && (item.jobName === jobName || String(item.description || '').startsWith(`${jobName} `) || String(item.description || '').startsWith(jobName))
  ));
  const kept = Number(found?.rate);
  if (Number.isFinite(kept) && kept > 0) return kept;
  if (typeof rateFor === 'function') {
    const next = Number(rateFor(jobName));
    if (Number.isFinite(next) && next > 0) return next;
  }
  return 185;
}

export function itemsForShipment(shipment, { existingItems = [], rateFor } = {}) {
  const plId = shipment?.dispatchId || shipment?.id;
  const rolls = Array.isArray(shipment?.items) ? shipment.items : [];
  const groups = new Map();
  const add = (jobName, orderId, net, gross) => {
    const name = jobName || shipment?.jobName || 'Printed Roll Job';
    const key = `${usableId(orderId).toLowerCase()}|||${name}`;
    const group = groups.get(key) || { jobName: name, orderId: usableId(orderId), net: 0, gross: 0, count: 0 };
    group.net += Number(net) || 0;
    group.gross += Number(gross) || 0;
    group.count += 1;
    groups.set(key, group);
  };
  if (rolls.length > 0) {
    rolls.forEach((roll) => add(roll.jobName, roll.orderId || shipment?.orderId, roll.netWeightKg, roll.grossWeightKg));
  } else {
    const net = Number(shipment?.totalNetWeightKg) || 0;
    const gross = Number(shipment?.totalGrossWeightKg) || net;
    add(shipment?.jobName, shipment?.orderId, net, gross);
  }
  return [...groups.values()].map((group, index) => {
    const netKg = round2(group.net);
    const grossKg = round2(group.gross);
    const rate = rateForGroup(group.jobName, plId, existingItems, rateFor);
    return {
      id: `dc-item-${plId}-${index + 1}`,
      hsnSac: '3923',
      description: `${group.jobName} - Printed Laminated Film Rolls (Packing List: ${plId} | ${group.count} Reels | Net: ${netKg} Kg | Gross: ${grossKg} Kg)`,
      itemDetails: `Linked Packing List: ${plId}`,
      jobName: group.jobName,
      orderId: group.orderId || undefined,
      quantity: netKg,
      unit: 'Kg',
      grossWeightKg: grossKg,
      rollCount: group.count,
      packingListId: plId,
      rate,
      amount: round2(netKg * rate),
    };
  });
}

export function replacePackingListOnChallan(challan, shipment, options = {}) {
  const plId = String(shipment?.dispatchId || shipment?.id || '');
  const kept = (challan?.items || []).filter((item) => String(item?.packingListId || '') !== plId);
  const built = itemsForShipment(shipment, { existingItems: challan?.items, rateFor: options.rateFor });
  const items = [...kept, ...built];
  const subtotal = round2(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
  const freight = Number(challan?.freightCharges) || 0;
  const linked = new Set(packingListIdsOf(challan).filter((id) => id !== plId));
  if (plId) linked.add(plId);
  const jobNames = [...new Set(items.map((item) => item.jobName).filter(Boolean))];
  return {
    ...challan,
    items,
    subtotalAmount: subtotal,
    taxableSubtotal: round2(subtotal + freight),
    linkedPackingListIds: [...linked],
    jobName: jobNames.join(', ') || challan?.jobName || '',
  };
}

export function challansLinkedToShipment(shipment, challans = []) {
  return (challans || []).filter((challan) => challanLinksShipment(challan, shipment) && isSaleOfGoodsChallan(challan));
}

export function syncChallansForShipment(shipment, challans = [], options = {}) {
  return challansLinkedToShipment(shipment, challans).map((challan) => (
    replacePackingListOnChallan(challan, shipment, options)
  ));
}
