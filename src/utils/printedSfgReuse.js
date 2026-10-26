/**
 * Printed SFG reused on the next order of the same product.
 *
 * Same-product key, matching Order Management's job-master lookup:
 * primary key is jobMasterId (order.jobMasterId, or jobDetails.jobMasterId).
 * That id is the job master row id, or the job master's own jobMasterId.
 * When either side has no job master id, the fallback is an exact
 * trimmed, case-insensitive job name. Names are not fuzzy-matched.
 *
 * Allocating reserves kilograms on the new order. Another open order
 * cannot take the same kilograms. None leaves the existing PO quantities.
 */

import { isReusablePrintedLot } from './printingSfgLot.js';
import { roundFilmKg } from './printingFilmIssue.js';

export const SAME_PRODUCT_KEY = 'jobMasterId';

export function productJobMasterId(record) {
  return String(record?.jobMasterId || record?.jobDetails?.jobMasterId || record?.jobId || '').trim();
}

export function sameProduct(left, right) {
  const leftId = productJobMasterId(left);
  const rightId = productJobMasterId(right);
  if (leftId && rightId) return leftId === rightId;
  const leftName = String(left?.jobName || '').trim().toLowerCase();
  const rightName = String(right?.jobName || '').trim().toLowerCase();
  return Boolean(leftName && rightName && leftName === rightName);
}

function isPrintFilmLine(req) {
  if (!req) return false;
  const film = String(req.filmType || '');
  if (/ink|adhesive|solvent/i.test(film)) return false;
  if (req.widthMm === '-' || req.micron === '-') return false;
  return true;
}

function sourceOrder(lot, orders) {
  return (orders || []).find((order) => String(order?.id || '') === String(lot?.orderId || '')) || null;
}

function reservedByOthers(lotCode, orders, orderId) {
  let kg = 0;
  (orders || []).forEach((order) => {
    if (!order || String(order.id) === String(orderId)) return;
    if (String(order.status || '') === 'Cancelled') return;
    (order.printedSfgUse?.sources || []).forEach((source) => {
      if (String(source?.sfgBatchCode || '') === String(lotCode)) kg += Number(source.kg) || 0;
    });
  });
  return roundFilmKg(kg);
}

function lotAvailableKg(lot) {
  if (lot?.availableKg !== undefined && lot?.availableKg !== null && lot?.availableKg !== '') {
    const value = Number(lot.availableKg);
    if (Number.isFinite(value)) return roundFilmKg(Math.max(0, value));
  }
  const net = Number(lot?.totalNetKg) || 0;
  const consumed = Number(lot?.consumedKg) || 0;
  return roundFilmKg(Math.max(0, net - consumed));
}

function metersForKg(lot, kg) {
  const basis = Number(lot?.totalNetKg) || lotAvailableKg(lot);
  const meters = Number(lot?.totalMeters) || 0;
  if (!(basis > 0) || !(meters > 0) || !(kg > 0)) return 0;
  return roundFilmKg(meters * (kg / basis));
}

export function printedSfgOffers({ order, orders = [], sfgGoods = [] } = {}) {
  if (!order?.id) return [];
  return (sfgGoods || [])
    .filter((lot) => isReusablePrintedLot(lot) && String(lot.orderId || '') !== String(order.id))
    .map((lot) => {
      const source = sourceOrder(lot, orders);
      const identity = {
        jobMasterId: productJobMasterId(lot) || productJobMasterId(source),
        jobName: lot.jobName || source?.jobName || ''
      };
      return { lot, source, identity };
    })
    .filter((entry) => sameProduct(order, entry.identity))
    .map(({ lot, source }) => {
      const availableKg = lotAvailableKg(lot);
      const heldByOthers = reservedByOthers(lot.sfgBatchCode, orders, order.id);
      const freeKg = roundFilmKg(Math.max(0, availableKg - heldByOthers));
      const own = (order.printedSfgUse?.sources || []).find((sourceRow) => sourceRow.sfgBatchCode === lot.sfgBatchCode);
      return {
        sfgBatchCode: lot.sfgBatchCode,
        sourceOrderId: lot.orderId || '',
        sourceJobName: lot.jobName || source?.jobName || '',
        jobMasterId: productJobMasterId(lot) || productJobMasterId(source),
        availableKg,
        freeKg,
        totalMeters: Number(lot.totalMeters) || 0,
        metersForFreeKg: metersForKg(lot, freeKg),
        childBarcodes: (lot.childRolls || []).map((roll) => roll.barcodeId).filter(Boolean),
        inputBarcodeIds: lot.inputBarcodeIds || [],
        ownReservedKg: Number(own?.kg) || 0,
        status: lot.status || ''
      };
    })
    .filter((offer) => offer.freeKg > 0.05 || offer.ownReservedKg > 0);
}

function restoreBaseRequirements(requirements, saved) {
  if (!saved?.printLineId || saved.baseQtyKg === undefined || saved.baseQtyKg === null) return requirements || [];
  return (requirements || []).map((req) => (
    req?.id === saved.printLineId ? { ...req, qtyKg: Number(saved.baseQtyKg) || 0 } : req
  ));
}

/**
 * choice.explicit false keeps a saved reservation even after the lot is later consumed.
 * An explicit all / part / none choice is capped by the kilograms still free.
 */
export function planPrintedSfgAllocation({
  order,
  orders = [],
  sfgGoods = [],
  requirements = [],
  choice
} = {}) {
  const offers = printedSfgOffers({ order, orders, sfgGoods });
  const saved = order?.printedSfgUse || null;
  const baseRequirements = restoreBaseRequirements(requirements, saved);
  const printLine = baseRequirements.find(isPrintFilmLine) || null;
  const baseQty = printLine ? roundFilmKg(Number(printLine.qtyKg) || 0) : 0;
  const freeKg = roundFilmKg(offers.reduce((sum, offer) => sum + (Number(offer.freeKg) || 0), 0));
  const explicit = Boolean(choice?.explicit);
  const mode = choice?.mode || saved?.mode || (freeKg > 0 ? 'all' : 'none');

  let allocatedKg = 0;
  if (!explicit && saved && (saved.mode === 'all' || saved.mode === 'part' || saved.mode === 'none')) {
    allocatedKg = roundFilmKg(Math.min(baseQty, Math.max(0, Number(saved.allocatedKg) || 0)));
  } else if (mode === 'none' || !printLine) {
    allocatedKg = 0;
  } else if (mode === 'part') {
    const asked = Number(choice?.kg ?? saved?.allocatedKg);
    allocatedKg = roundFilmKg(Math.min(baseQty, freeKg, Math.max(0, Number.isFinite(asked) ? asked : 0)));
  } else {
    allocatedKg = roundFilmKg(Math.min(baseQty, freeKg));
  }

  let sources = [];
  let appliedKg = 0;
  if (!explicit && saved) {
    appliedKg = allocatedKg;
    sources = appliedKg > 0 ? (saved.sources || []) : [];
  } else {
    let remaining = allocatedKg;
    offers.forEach((offer) => {
      if (!(remaining > 0)) return;
      const take = roundFilmKg(Math.min(remaining, Math.max(offer.freeKg, 0)));
      if (!(take > 0)) return;
      const lot = (sfgGoods || []).find((item) => item.sfgBatchCode === offer.sfgBatchCode);
      sources.push({
        sfgBatchCode: offer.sfgBatchCode,
        sourceOrderId: offer.sourceOrderId,
        sourceJobName: offer.sourceJobName,
        jobMasterId: offer.jobMasterId,
        kg: take,
        meters: metersForKg(lot, take),
        childBarcodes: offer.childBarcodes
      });
      remaining = roundFilmKg(remaining - take);
    });
    appliedKg = roundFilmKg(sources.reduce((sum, source) => sum + source.kg, 0));
  }
  const nextRequirements = baseRequirements.map((req) => {
    if (!printLine || req.id !== printLine.id) return req;
    return {
      ...req,
      qtyKg: roundFilmKg(Math.max(0, baseQty - appliedKg)),
      qtyBeforePrintedSfgKg: baseQty
    };
  });

  return {
    offers,
    requirements: nextRequirements,
    printLineId: printLine?.id || '',
    printQtyBefore: baseQty,
    printQtyAfter: roundFilmKg(Math.max(0, baseQty - appliedKg)),
    allocatedKg: appliedKg,
    allocatedMeters: roundFilmKg(sources.reduce((sum, source) => sum + (Number(source.meters) || 0), 0)),
    freeKg,
    use: {
      mode: appliedKg > 0 ? (mode === 'none' ? 'part' : mode) : 'none',
      allocatedKg: appliedKg,
      printLineId: printLine?.id || '',
      baseQtyKg: baseQty,
      sources: appliedKg > 0 ? sources : []
    }
  };
}
