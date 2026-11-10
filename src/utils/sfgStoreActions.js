/**
 * SFG / FG Store row actions follow the dispatch steps.
 *
 * 1 Finished Goods → 2 Packing List → 3 Delivery Challan → 4 Dispatched
 *
 * Semi-finished and WIP rows keep Consume. Only finished goods can move
 * toward dispatch. A delivery challan is issued from a packing list, the
 * same way Issue DC works on the dispatch screen, so a ready roll offers
 * Create Packing List and not a challan. Once the list exists and no
 * challan is linked, the row says to generate the challan. After the
 * challan exists, the row says Dispatched.
 *
 * Consume stays available for an Admin rework of a finished roll that is
 * not yet on a packing list. The consume screen is still how a roll goes
 * back into lamination, slitting, or pouching. Dispatch Packing inside
 * that screen is unchanged; it is not the button operators use.
 */

import { listConsumptions } from './dispatchPacking.js';
import { DISPATCH_READY_DUST_KG, isFinishedGoodsStock, stockAvailableKg } from './finishedGoods.js';

export const DISPATCH_STEPS = [
  { number: 1, id: 'fg', label: 'Finished Goods' },
  { number: 2, id: 'packing', label: 'Packing List' },
  { number: 3, id: 'challan', label: 'Delivery Challan' },
  { number: 4, id: 'dispatched', label: 'Dispatched' }
];

function text(value) {
  return String(value || '').trim();
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function planHasAction(plan, id) {
  return (plan?.actions || []).some((action) => action.id === id);
}

export function rollIdentityCodes(item) {
  return [item?.sfgBatchCode, item?.barcodeId, item?.barcode, item?.id]
    .map(text)
    .filter(Boolean);
}

function shipmentIdentity(shipment) {
  return text(shipment?.dispatchId || shipment?.id);
}

export function shipmentContainsRoll(shipment, item) {
  const codes = new Set(rollIdentityCodes(item));
  if (!codes.size) return false;
  const items = Array.isArray(shipment?.items) ? shipment.items : [];
  for (const row of items) {
    if (codes.has(text(row?.sourceFgBarcode))) return true;
    if (codes.has(text(row?.sourceFgId))) return true;
    if (codes.has(text(row?.barcodeId))) return true;
  }
  for (const row of listConsumptions(shipment)) {
    if (codes.has(text(row?.barcode))) return true;
  }
  return false;
}

export function packingListIdsOnChallans(challans) {
  const ids = new Set();
  (challans || []).forEach((challan) => {
    const linked = Array.isArray(challan?.linkedPackingListIds)
      ? challan.linkedPackingListIds
      : (challan?.linkedPackingListId ? [challan.linkedPackingListId] : []);
    linked.forEach((id) => {
      const value = text(id);
      if (value) ids.add(value);
    });
    (challan?.items || []).forEach((row) => {
      const value = text(row?.packingListId);
      if (value) ids.add(value);
    });
  });
  return ids;
}

export function challanForPackingList(challans, packingListId) {
  const id = text(packingListId);
  if (!id) return null;
  return (challans || []).find((challan) => {
    const linked = Array.isArray(challan?.linkedPackingListIds)
      ? challan.linkedPackingListIds
      : (challan?.linkedPackingListId ? [challan.linkedPackingListId] : []);
    if (linked.map(text).includes(id)) return true;
    return (challan?.items || []).some((row) => text(row?.packingListId) === id);
  }) || null;
}

export function packingListsAwaitingChallan(shipments, challans) {
  const linked = packingListIdsOnChallans(challans);
  return (shipments || []).filter((shipment) => {
    const id = shipmentIdentity(shipment);
    return id && !linked.has(id);
  });
}

function locateRoll(item, shipments, challans) {
  const hits = (shipments || []).filter((shipment) => shipmentContainsRoll(shipment, item));
  const pending = hits.find((shipment) => !challanForPackingList(challans, shipmentIdentity(shipment)));
  const chosen = pending || hits[0] || null;
  if (!chosen) return { shipment: null, challan: null };
  const challan = challanForPackingList(challans, shipmentIdentity(chosen));
  return { shipment: chosen, challan };
}

function progressFor(shipment, challan) {
  const packingListId = shipmentIdentity(shipment);
  if (challan) {
    return {
      kind: 'dispatched',
      packingListId,
      challanId: text(challan.id),
      challanNo: text(challan.challanNo || challan.challan_no || challan.id)
    };
  }
  return {
    kind: 'packing-list',
    packingListId,
    challanId: '',
    challanNo: ''
  };
}

/**
 * Stage and actions for one store row.
 * context: { canConsume, canDispatch, canRework, shipments, challans }
 */
export function sfgStoreRowPlan(item, context = {}) {
  const canConsume = context.canConsume === true;
  const canDispatch = context.canDispatch === true;
  const canRework = context.canRework === true;
  const available = stockAvailableKg(item);

  if (!isFinishedGoodsStock(item)) {
    return {
      stage: 'wip',
      actions: canConsume ? [{ id: 'consume', enabled: available > 0 }] : [],
      progress: null
    };
  }

  const { shipment, challan } = locateRoll(item, context.shipments, context.challans);
  if (shipment && challan) {
    return {
      stage: 'fg-dispatched',
      actions: [],
      progress: progressFor(shipment, challan)
    };
  }
  if (shipment) {
    return {
      stage: 'fg-packed',
      actions: canDispatch ? [{ id: 'continue-dc', enabled: true }] : [],
      progress: progressFor(shipment, null)
    };
  }

  const dispatchedKg = Number(item?.dispatchedKg) || 0;
  const markedDispatched = item?.status === 'Dispatched'
    || (dispatchedKg > 0 && available <= DISPATCH_READY_DUST_KG);
  if (markedDispatched) {
    return {
      stage: 'fg-dispatched',
      actions: [],
      progress: {
        kind: 'dispatched',
        packingListId: '',
        challanId: '',
        challanNo: ''
      }
    };
  }
  if (available <= DISPATCH_READY_DUST_KG) {
    return { stage: 'fg-closed', actions: [], progress: null };
  }

  const actions = [];
  if (canDispatch) actions.push({ id: 'create-packing-list', enabled: true });
  if (canRework) actions.push({ id: 'rework', enabled: true });
  return { stage: 'fg-ready', actions, progress: null };
}

export function sfgProgressLabel(plan) {
  const progress = plan?.progress;
  if (!progress) return '';
  if (progress.kind === 'packing-list' && progress.packingListId) {
    return `In Packing List ${progress.packingListId} · Next: Generate DC`;
  }
  if (progress.kind === 'dispatched') {
    return progress.challanNo ? `Dispatched ${progress.challanNo}` : 'Dispatched';
  }
  return '';
}

function stepFromPlans(plans) {
  const active = (plans || []).filter((plan) => plan.stage !== 'fg-closed');
  if (!active.length || active.every((plan) => plan.stage === 'fg-dispatched')) {
    return { number: 4, id: 'dispatched', label: 'Dispatched', state: 'done' };
  }
  if (active.some((plan) => plan.stage === 'fg-ready')) {
    return { number: 2, id: 'packing', label: 'Packing List', state: 'current' };
  }
  if (active.some((plan) => plan.stage === 'fg-packed')) {
    return { number: 3, id: 'challan', label: 'Delivery Challan', state: 'current' };
  }
  return { number: 4, id: 'dispatched', label: 'Dispatched', state: 'done' };
}

/** Order header. Create Packing List only, and only when every roll is finished goods. */
export function sfgOrderHeaderPlan(items, context = {}) {
  const rows = items || [];
  const allFinishedGoods = rows.length > 0 && rows.every((item) => isFinishedGoodsStock(item));
  if (!allFinishedGoods) {
    return { allFinishedGoods: false, actions: [], step: null };
  }
  const plans = rows.map((item) => sfgStoreRowPlan(item, context));
  const actions = [];
  if (context.canDispatch === true && plans.some((plan) => planHasAction(plan, 'create-packing-list'))) {
    actions.push({ id: 'create-packing-list', enabled: true });
  }
  return { allFinishedGoods: true, actions, step: stepFromPlans(plans) };
}

/** Steps shown after a packing list is saved. The challan is the step still to do. */
export function packingSavedStepStates() {
  return DISPATCH_STEPS.map((step) => ({
    ...step,
    state: step.number < 3 ? 'done' : (step.number === 3 ? 'current' : 'upcoming')
  }));
}

export function packingListSavedSummary(shipment) {
  const items = Array.isArray(shipment?.items) ? shipment.items : [];
  const netFromItems = items.reduce((sum, row) => sum + (Number(row?.netWeightKg) || 0), 0);
  const grossFromItems = items.reduce((sum, row) => sum + (Number(row?.grossWeightKg) || 0), 0);
  const netKg = Number(shipment?.totalNetWeightKg) || netFromItems;
  const grossKg = Number(shipment?.totalGrossWeightKg) || grossFromItems;
  return {
    packingListId: shipmentIdentity(shipment),
    rollCount: items.length || Number(shipment?.totalRolls) || 0,
    netKg: round2(netKg),
    grossKg: round2(grossKg)
  };
}
