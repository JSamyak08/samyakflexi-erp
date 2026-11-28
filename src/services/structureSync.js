/**
 * Copy a Job Master change onto active orders that are linked by job master id.
 *
 * Reservations are not stored. Replacing the order's material lines is what
 * releases the old reservation and reserves the new one, the next time the
 * stock engine runs. Issued stock (inventory.allocated_qty_kg) and the item
 * ledger are never written here.
 *
 * A line that already has a purchase order is kept and marked superseded when
 * its film, micron or width is no longer in the structure. The PO flag moves
 * only when that same film is still in the structure. It never follows array
 * position. Superseded lines do not reserve stock and do not count toward
 * Gross Required or Balance Qty for PO.
 */

import { userHasAnyRole } from '../assignedRoles.js';
import {
  calculateJobRawMaterials,
  calculateOrderStockReservations,
  calculatePrintingScheduleMetrics,
  isSupersededMaterialLine,
  materialLinesMatch,
  requirementLineId,
} from '../factoryStore.js';
import { isCylinderOrder } from '../utils/orderAutoClose.js';

export const STRUCTURE_CHANGE_NOTICE_TYPE = 'STRUCTURE_CHANGED';

export const STRUCTURE_CHANGE_NOTICE_ROLES = [
  'Admin',
  'Sales Manager',
  'Production Manager',
  'Plant Manager',
  'Store Manager',
  'Purchase Manager',
];

/** Order statuses that must not be rewritten. Compared case-insensitively. */
export const CLOSED_ORDER_STATUSES = [
  'completed',
  'cancelled',
  'canceled',
  'dispatched',
  'delivered',
  'closed',
];

export const CLOSED_SCHEDULE_STATUSES = ['completed', 'cancelled', 'canceled', 'closed'];

const SUPERSEDED_STATUS = 'PO issued – superseded spec';

export function canSeeStructureChangeNotice(user) {
  return userHasAnyRole(user, STRUCTURE_CHANGE_NOTICE_ROLES);
}

export function isClosedOrderStatus(status) {
  return CLOSED_ORDER_STATUSES.includes(String(status || '').trim().toLowerCase());
}

export function isClosedScheduleStatus(status) {
  return CLOSED_SCHEDULE_STATUSES.includes(String(status || '').trim().toLowerCase());
}

function text(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function sameText(left, right) {
  return text(left) === text(right);
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : null;
}

function sameNumber(left, right) {
  return numberOrNull(left) === numberOrNull(right);
}

function flagOn(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function filmToken(line) {
  return text(line?.filmType || line?.itemName).toLowerCase();
}

function layerSignature(layers) {
  return (Array.isArray(layers) ? layers : []).map((layer) => [
    filmToken(layer),
    numberOrNull(layer?.micron),
    numberOrNull(layer?.widthMm ?? layer?.width),
    text(layer?.metallocenePct || layer?.metallocene).toLowerCase().replace('%', ''),
  ].join('~')).join(' / ');
}

function inksSignature(inks) {
  const list = Array.isArray(inks) ? inks : [];
  return JSON.stringify(list.map((station) => ({
    station: text(station?.stationNo ?? station?.station ?? station?.id),
    shade: text(station?.shadeName ?? station?.shade ?? station?.colorName),
    code: text(station?.productCode ?? station?.inkCode),
  })));
}

function structureText(layers, fallback) {
  if (Array.isArray(layers) && layers.length > 0) {
    return layers.map((layer) => `${layer.filmType} ${layer.micron}µ`).join(' / ');
  }
  return text(fallback);
}

function orderJobMasterId(order) {
  return text(order?.jobMasterId || order?.job_master_id || order?.jobDetails?.jobMasterId);
}

export function orderJobName(order) {
  return text(order?.jobName).split(' ||| ')[0].trim();
}

function lineHasPurchaseOrder(line) {
  return Boolean(line?.poIssued) || text(line?.poNumber) !== '';
}

function requirementList(order) {
  if (Array.isArray(order?.rawMaterialRequirements)) return order.rawMaterialRequirements;
  if (Array.isArray(order?.materialRequirements)) return order.materialRequirements;
  return [];
}

function defaultVendor(filmType) {
  return String(filmType || '').toLowerCase().includes('ld')
    ? 'Malwa Extrusions Pvt Ltd'
    : 'FlexiPoly Films Ltd';
}

function materialForm(record) {
  const raw = text(record?.materialForm || record?.orderType || record?.materialFormat).toLowerCase();
  if (!raw) return '';
  if (raw.includes('pouch')) return 'Pouching';
  return 'Reel';
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Fields that change film kilograms or the confirmed laminate.
 * Station inks, artwork and press marks are details: they update the order
 * and the notice, and they do not amend the OCN or rebuild material lines.
 */
export function diffJobMaster(previous, updated) {
  if (!previous || !updated) return [];
  const changes = [];
  const push = (field, from, to, kind) => {
    changes.push({ field, from, to, kind });
  };

  if (layerSignature(previous.layers) !== layerSignature(updated.layers)) {
    push('layers', structureText(previous.layers, previous.structure), structureText(updated.layers, updated.structure), 'structure');
  }
  ['printWidthMm', 'repeatLengthMm', 'faceLengthMm', 'pouchOpenWidth', 'pouchHeight', 'inkGsm', 'adhesiveGsm'].forEach((key) => {
    if (!sameNumber(previous[key], updated[key])) {
      push(key, numberOrNull(previous[key]), numberOrNull(updated[key]), 'structure');
    }
  });
  const previousForm = materialForm(previous);
  const updatedForm = materialForm(updated);
  if (previousForm && updatedForm && previousForm !== updatedForm) {
    push('materialForm', previousForm, updatedForm, 'structure');
  }

  if (!sameText(previous.jobName, updated.jobName)) push('jobName', text(previous.jobName), text(updated.jobName), 'detail');
  if (!sameText(previous.clientName, updated.clientName)) push('clientName', text(previous.clientName), text(updated.clientName), 'detail');
  if (!sameNumber(previous.colorsCount, updated.colorsCount)) {
    push('colorsCount', numberOrNull(previous.colorsCount), numberOrNull(updated.colorsCount), 'detail');
  }
  if (inksSignature(previous.stationWiseInks) !== inksSignature(updated.stationWiseInks)) {
    push('stationWiseInks', 'previous stations', 'updated stations', 'detail');
  }
  if (!sameText(previous.artworkUrl || previous.jobCardFileUrl, updated.artworkUrl || updated.jobCardFileUrl)) {
    push('artworkUrl', text(previous.artworkUrl || previous.jobCardFileUrl) ? 'artwork on file' : 'none', text(updated.artworkUrl || updated.jobCardFileUrl) ? 'artwork on file' : 'none', 'detail');
  }
  if (!sameText(previous.specialInstructions, updated.specialInstructions)) {
    push('specialInstructions', text(previous.specialInstructions), text(updated.specialInstructions), 'detail');
  }
  ['variant', 'printing', 'invoiceTo', 'shellSize', 'petSize', 'pouchType', 'cylinderSku'].forEach((key) => {
    if (!sameText(previous[key], updated[key])) push(key, text(previous[key]), text(updated[key]), 'detail');
  });
  ['silLogo', 'arcMark', 'slittingMark', 'trackerLine'].forEach((key) => {
    if (!sameText(previous[key], updated[key])) push(key, text(previous[key]), text(updated[key]), 'detail');
  });
  ['chkEyemark', 'chkBarcode', 'chkOrientation', 'chkClientApproval'].forEach((key) => {
    if (flagOn(previous[key]) !== flagOn(updated[key])) push(key, flagOn(previous[key]), flagOn(updated[key]), 'detail');
  });
  if (!sameNumber(previous.wastagePct, updated.wastagePct)) {
    push('wastagePct', numberOrNull(previous.wastagePct), numberOrNull(updated.wastagePct), 'detail');
  }
  return changes;
}

export function jobMasterSyncFingerprint(jobMaster) {
  if (!jobMaster) return '';
  return JSON.stringify(diffJobMaster({}, jobMaster).map((change) => [change.field, change.to]));
}

function numberFrom(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function describeKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0 kg';
  return `${Number(number.toFixed(2))} kg`;
}

function filmLabel(line) {
  if (!line) return 'film';
  const micron = line.micron === undefined || line.micron === null || line.micron === '-' ? '' : ` ${line.micron}µ`;
  const width = line.widthMm && line.widthMm !== '-' ? ` ${line.widthMm} mm` : '';
  return `${line.filmType || 'film'}${micron}${width}`.trim();
}

/**
 * Build the new requirement list for one order.
 * Matched films keep their id, vendor and PO flag. Unmatched PO lines are
 * appended as superseded. Unmatched lines with no PO are dropped.
 */
export function rebuildMaterialLines(order, jobMaster) {
  const existing = requirementList(order);
  const active = existing.filter((line) => line && !isSupersededMaterialLine(line));
  const alreadySuperseded = existing.filter((line) => isSupersededMaterialLine(line));
  const layers = Array.isArray(jobMaster?.layers) ? jobMaster.layers : [];
  const orderQtyKg = Number(order?.orderQtyKg || order?.quantityKg || order?.quantity) || 0;
  const form = materialForm(order) || materialForm(jobMaster) || 'Reel';
  const calc = calculateJobRawMaterials({
    jobName: orderJobName(order) || jobMaster?.jobName || 'Job',
    printWidthMm: numberFrom(jobMaster?.printWidthMm, numberFrom(order?.printWidthMm, 1000)),
    repeatLengthMm: numberFrom(jobMaster?.repeatLengthMm, numberFrom(order?.repeatLengthMm, 400)),
    orderQtyKg: orderQtyKg > 0 ? orderQtyKg : 1000,
    orderType: form === 'Pouching' ? 'Pouching' : 'Reel',
    inkGsm: numberFrom(jobMaster?.inkGsm, numberFrom(order?.inkGsm, 1.5)),
    adhesiveGsm: numberFrom(jobMaster?.adhesiveGsm, numberFrom(order?.adhesiveGsm, 1.5)),
    layers: layers.map((layer) => {
      const previous = active.find((line) => materialLinesMatch(line, layer));
      const rate = previous && (previous.rate !== undefined || previous.ratePerKg !== undefined)
        ? Number(previous.rate ?? previous.ratePerKg)
        : (layer.rate ?? layer.ratePerKg);
      return {
        ...layer,
        ...(Number.isFinite(rate) ? { rate, ratePerKg: rate, pricePerKg: rate } : {}),
      };
    }),
    stationWiseInks: jobMaster?.stationWiseInks || order?.stationWiseInks || [],
  });

  const consumed = new Set();
  const takenIds = new Set(existing.map((line) => text(line?.id)).filter(Boolean));
  const fresh = [];
  (calc?.layerResults || []).forEach((layer, index) => {
    const previous = active.find((line) => !consumed.has(line) && materialLinesMatch(line, layer) && !isInk(line));
    if (previous) consumed.add(previous);
    let id = text(previous?.id);
    if (!id) {
      id = requirementLineId(order?.id, index);
      if (takenIds.has(id)) id = `${id}-new`;
    }
    takenIds.add(id);
    fresh.push({
      id,
      filmType: layer.filmType,
      micron: layer.micron,
      widthMm: layer.widthMm,
      metallocenePct: layer.metallocenePct || previous?.metallocenePct || '',
      qtyKg: layer.grossKg || 0,
      rate: layer.pricePerKg,
      ratePerKg: layer.pricePerKg,
      preferredVendor: previous?.preferredVendor || defaultVendor(layer.filmType),
      assignedVendor: previous?.assignedVendor || '',
      poIssued: Boolean(previous?.poIssued),
      poNumber: previous?.poNumber || '',
      status: previous?.status && !String(previous.status).toLowerCase().includes('superseded') ? previous.status : 'Required',
      superseded: false,
    });
  });

  const ink = active.find((line) => line.filmType === 'Liquid Inks');
  if (ink && calc?.inkDetails && calc.inkDetails.grossKg > 0) {
    consumed.add(ink);
    fresh.push({
      ...ink,
      qtyKg: calc.inkDetails.grossKg,
      superseded: false,
      status: ink.status && !String(ink.status).toLowerCase().includes('superseded') ? ink.status : 'Required',
    });
  }
  const adhesive = active.find((line) => line.filmType === 'Solvent-less Adhesive');
  if (adhesive && calc?.adhesiveDetails && calc.adhesiveDetails.grossKg > 0) {
    consumed.add(adhesive);
    fresh.push({
      ...adhesive,
      qtyKg: calc.adhesiveDetails.grossKg,
      superseded: false,
      status: adhesive.status && !String(adhesive.status).toLowerCase().includes('superseded') ? adhesive.status : 'Required',
    });
  }

  const superseded = [];
  active.forEach((line) => {
    if (consumed.has(line) || !lineHasPurchaseOrder(line)) return;
    superseded.push({
      ...line,
      superseded: true,
      status: SUPERSEDED_STATUS,
      supersededReason: 'Job master structure changed',
    });
  });

  return {
    lines: [...fresh, ...superseded, ...alreadySuperseded.map((line) => ({ ...line, superseded: true }))],
    calc,
    superseded,
  };
}

function isInk(line) {
  const film = filmToken(line);
  return film === 'liquid inks' || film === 'solvent-less adhesive';
}

function copyDetail(updated, order, key, jobKey = key) {
  if (updated[key] === undefined || updated[key] === null) return order[jobKey];
  if (typeof updated[key] === 'string' && updated[key].trim() === '' && (order[jobKey] === undefined || order[jobKey] === null || order[jobKey] === '')) {
    return order[jobKey];
  }
  return updated[key];
}

export function applyJobMasterToOrder(order, jobMaster, { structureChanged, requirements, calculationDetails } = {}) {
  const layers = Array.isArray(jobMaster?.layers) ? jobMaster.layers.map((layer) => ({ ...layer })) : (order.layers || []);
  const structure = structureText(layers, jobMaster?.structure || order.structure);
  const requirementsNext = structureChanged ? requirements : requirementList(order);
  const artwork = jobMaster?.artworkUrl !== undefined || jobMaster?.jobCardFileUrl !== undefined
    ? (jobMaster.artworkUrl ?? jobMaster.jobCardFileUrl ?? '')
    : (order.artworkUrl || order.jobDetails?.artworkUrl || '');
  const next = {
    ...order,
    jobMasterId: jobMaster?.id || order.jobMasterId,
    jobName: text(jobMaster?.jobName) || order.jobName,
    clientName: text(jobMaster?.clientName) || order.clientName,
    structure,
    layers,
    printWidthMm: numberFrom(jobMaster?.printWidthMm, order.printWidthMm),
    repeatLengthMm: numberFrom(jobMaster?.repeatLengthMm, order.repeatLengthMm),
    faceLengthMm: numberFrom(jobMaster?.faceLengthMm, order.faceLengthMm),
    pouchOpenWidth: numberFrom(jobMaster?.pouchOpenWidth, order.pouchOpenWidth),
    pouchHeight: numberFrom(jobMaster?.pouchHeight, order.pouchHeight),
    pouchType: copyDetail(jobMaster, order, 'pouchType'),
    colorsCount: numberFrom(jobMaster?.colorsCount, order.colorsCount),
    inkGsm: numberFrom(jobMaster?.inkGsm, order.inkGsm),
    adhesiveGsm: numberFrom(jobMaster?.adhesiveGsm, order.adhesiveGsm),
    wastagePct: numberFrom(jobMaster?.wastagePct, order.wastagePct),
    cylinderSku: copyDetail(jobMaster, order, 'cylinderSku'),
    variant: copyDetail(jobMaster, order, 'variant'),
    printing: copyDetail(jobMaster, order, 'printing'),
    invoiceTo: copyDetail(jobMaster, order, 'invoiceTo'),
    shellSize: copyDetail(jobMaster, order, 'shellSize'),
    petSize: copyDetail(jobMaster, order, 'petSize'),
    artworkUrl: artwork,
    specialInstructions: jobMaster?.specialInstructions !== undefined ? jobMaster.specialInstructions : order.specialInstructions,
    stationWiseInks: Array.isArray(jobMaster?.stationWiseInks) ? jobMaster.stationWiseInks : order.stationWiseInks,
    cylinderColors: Array.isArray(jobMaster?.cylinderColors) ? jobMaster.cylinderColors : order.cylinderColors,
    silLogo: jobMaster?.silLogo !== undefined && jobMaster?.silLogo !== null ? jobMaster.silLogo : order.silLogo,
    arcMark: copyDetail(jobMaster, order, 'arcMark'),
    slittingMark: copyDetail(jobMaster, order, 'slittingMark'),
    trackerLine: copyDetail(jobMaster, order, 'trackerLine'),
    materialRequirements: requirementsNext,
    rawMaterialRequirements: requirementsNext,
    calculationDetails: structureChanged && calculationDetails ? calculationDetails : (order.calculationDetails || null),
    printedSfgUse: order.printedSfgUse || order.jobDetails?.printedSfgUse || null,
    jobDetails: {
      ...(order.jobDetails || {}),
      jobMasterId: jobMaster?.id || order.jobDetails?.jobMasterId || null,
      jobName: text(jobMaster?.jobName) || order.jobDetails?.jobName,
      clientName: text(jobMaster?.clientName) || order.jobDetails?.clientName,
      structure,
      layers,
      printWidthMm: numberFrom(jobMaster?.printWidthMm, order.jobDetails?.printWidthMm),
      repeatLengthMm: numberFrom(jobMaster?.repeatLengthMm, order.jobDetails?.repeatLengthMm),
      pouchOpenWidth: numberFrom(jobMaster?.pouchOpenWidth, order.jobDetails?.pouchOpenWidth),
      pouchHeight: numberFrom(jobMaster?.pouchHeight, order.jobDetails?.pouchHeight),
      colorsCount: numberFrom(jobMaster?.colorsCount, order.jobDetails?.colorsCount),
      inkGsm: numberFrom(jobMaster?.inkGsm, order.jobDetails?.inkGsm),
      adhesiveGsm: numberFrom(jobMaster?.adhesiveGsm, order.jobDetails?.adhesiveGsm),
      wastagePct: numberFrom(jobMaster?.wastagePct, order.jobDetails?.wastagePct),
      artworkUrl: artwork,
      specialInstructions: jobMaster?.specialInstructions !== undefined ? jobMaster.specialInstructions : order.jobDetails?.specialInstructions,
      stationWiseInks: Array.isArray(jobMaster?.stationWiseInks) ? jobMaster.stationWiseInks : order.jobDetails?.stationWiseInks,
      printedSfgUse: order.printedSfgUse || order.jobDetails?.printedSfgUse || null,
      variants: order.variants || order.jobDetails?.variants || [],
      hasVariants: Boolean(order.hasVariants || order.jobDetails?.hasVariants),
    },
  };
  return next;
}

export function nextScheduleCopy(schedule, order) {
  const layers = order?.layers || order?.jobDetails?.layers || [];
  const print = layers[0] || {};
  const filmType = text(print.filmType) || schedule.filmType || '';
  const micron = numberFrom(print.micron, Number(schedule.micron) || 12);
  const widthMm = numberFrom(order?.printWidthMm, numberFrom(print.widthMm, Number(schedule.widthMm) || 0));
  const metrics = calculatePrintingScheduleMetrics({
    orderQtyKg: Number(order?.orderQtyKg) || Number(schedule.orderQtyKg) || 0,
    widthMm: widthMm || Number(schedule.widthMm) || 0,
    micron,
    filmType: filmType || 'PET',
    maxSpeedMpm: schedule.maxSpeedMpm,
    repeatLengthMm: numberFrom(order?.repeatLengthMm, 400),
    customJobChangeoverMins: schedule.jobChangeoverMins,
  });
  const rollChangeoverMins = Number(schedule.rollChangeoverMins) || 0;
  const jobChangeoverMins = Number(schedule.jobChangeoverMins) || 0;
  return {
    ...schedule,
    jobName: orderJobName(order) || schedule.jobName,
    clientName: order?.clientName || schedule.clientName,
    orderQtyKg: Number(order?.orderQtyKg) || schedule.orderQtyKg,
    filmType,
    micron,
    widthMm,
    totalLengthMeters: metrics.totalLengthMeters,
    runTimeMins: metrics.runTimeMins,
    rollChangeoverMins,
    jobChangeoverMins,
    totalDurationMins: metrics.runTimeMins + rollChangeoverMins + jobChangeoverMins,
  };
}

export function scheduleCopyChanged(before, after) {
  if (!before || !after) return false;
  return !sameText(before.filmType, after.filmType)
    || !sameNumber(before.micron, after.micron)
    || !sameNumber(before.widthMm, after.widthMm)
    || !sameNumber(before.totalLengthMeters, after.totalLengthMeters)
    || !sameNumber(before.runTimeMins, after.runTimeMins)
    || !sameNumber(before.orderQtyKg, after.orderQtyKg)
    || !sameText(before.jobName, after.jobName)
    || !sameText(before.clientName, after.clientName);
}

function reservationRows(orders, inventory, reserve) {
  const stock = calculateOrderStockReservations(orders, inventory, [], { enabled: reserve === true });
  const rows = new Map();
  (orders || []).forEach((order) => {
    const lines = requirementList(order).filter((line) => line && !isSupersededMaterialLine(line));
    rows.set(order.id, lines.map((line) => {
      const info = stock.getReqStockInfo(line, order.id);
      return {
        id: line.id,
        label: filmLabel(line),
        gross: Number(info.grossKg) || 0,
        reserved: Number(info.reservedKg) || 0,
        balance: Number(info.balanceKg) || 0,
      };
    }));
  });
  return rows;
}

function confirmationsForOrder(order, confirmations) {
  const pointers = new Set(
    [order?.ocnNumber, order?.ocnId, order?.jobDetails?.ocnNumber, order?.jobDetails?.ocnId]
      .map((value) => text(value))
      .filter(Boolean)
  );
  return (confirmations || []).filter((ocn) => {
    if (!ocn) return false;
    const status = text(ocn.status).toLowerCase();
    if (status === 'cancelled' || status === 'canceled') return false;
    if (text(ocn.orderId) && text(ocn.orderId) === text(order.id)) return true;
    if (pointers.has(text(ocn.id)) || pointers.has(text(ocn.ocnNumber))) return true;
    return false;
  });
}

function moduleLine(module, detail) {
  return { module, detail };
}

function lineMovement(beforeLines, afterLines, superseded) {
  const parts = [];
  superseded.forEach((line) => {
    parts.push(`${filmLabel(line)} kept with ${line.poNumber || 'its PO'} and marked superseded (${describeKg(line.qtyKg)} no longer reserved)`);
  });
  afterLines.filter((line) => !isSupersededMaterialLine(line)).forEach((line) => {
    const previous = beforeLines.find((item) => text(item.id) === text(line.id) && !isSupersededMaterialLine(item));
    if (!previous) {
      parts.push(`Added ${filmLabel(line)} gross ${describeKg(line.qtyKg)}`);
      return;
    }
    if (Math.abs((Number(previous.qtyKg) || 0) - (Number(line.qtyKg) || 0)) > 0.02) {
      parts.push(`${filmLabel(line)} gross ${describeKg(previous.qtyKg)} → ${describeKg(line.qtyKg)}`);
    }
  });
  return parts;
}

/**
 * Plan the order, schedule, OCN and notice writes for one job master save.
 * This function does not write. Callers save orders through saveOrderToSupabase.
 */
export function planStructureSync({
  previousJm,
  updatedJm,
  orders = [],
  schedules = [],
  inventory = [],
  confirmations = [],
  actor = 'Staff',
  at = new Date().toISOString(),
  noticeId,
  stockReservationEnabled = false,
} = {}) {
  const empty = {
    changed: false,
    diff: [],
    structureChanged: false,
    orderWrites: [],
    scheduleWrites: [],
    ocnAmendments: [],
    notice: null,
    skipped: [],
    ignoredNameOnly: [],
    fingerprint: jobMasterSyncFingerprint(updatedJm),
  };
  if (!updatedJm || !text(updatedJm.id)) return empty;
  if (!previousJm) return { ...empty, reason: 'previous job master was not loaded' };

  const diff = diffJobMaster(previousJm, updatedJm);
  if (diff.length === 0) return { ...empty, fingerprint: jobMasterSyncFingerprint(updatedJm) };
  const structureChanged = diff.some((change) => change.kind === 'structure');
  const jobMasterId = text(updatedJm.id);
  const jobName = text(updatedJm.jobName);

  const linked = (orders || []).filter((order) => order && orderJobMasterId(order) === jobMasterId);
  const ignoredNameOnly = (orders || []).filter((order) => {
    if (!order || isClosedOrderStatus(order.status) || isCylinderOrder(order)) return false;
    if (orderJobMasterId(order)) return false;
    return jobName !== '' && orderJobName(order).toLowerCase() === jobName.toLowerCase();
  }).map((order) => ({
    orderId: order.id,
    jobName: orderJobName(order),
    reason: 'Matched the job name only. Job master id is empty, so the order was not changed.',
  }));

  const skipped = [];
  const targets = [];
  linked.forEach((order) => {
    if (isClosedOrderStatus(order.status)) {
      skipped.push({ orderId: order.id, status: order.status, reason: `${order.status} orders are not changed` });
      return;
    }
    if (isCylinderOrder(order)) {
      skipped.push({ orderId: order.id, status: order.status, reason: 'Cylinder engraving orders are not changed' });
      return;
    }
    targets.push(order);
  });

  const reserveStock = stockReservationEnabled === true;
  const beforeReservations = reservationRows(orders, inventory, reserveStock);
  const orderWrites = [];
  const ocnAmendments = [];
  const noticeOrders = [];

  targets.forEach((order) => {
    const rebuilt = structureChanged ? rebuildMaterialLines(order, updatedJm) : null;
    const next = applyJobMasterToOrder(order, updatedJm, {
      structureChanged,
      requirements: rebuilt?.lines,
      calculationDetails: rebuilt?.calc || null,
    });
    orderWrites.push(next);

    const modules = [];
    const detailText = diff.filter((change) => change.kind === 'detail').map((change) => `${change.field}: ${change.from || '—'} → ${change.to || '—'}`);
    const structureTextChange = diff.filter((change) => change.kind === 'structure').map((change) => `${change.field}: ${change.from ?? '—'} → ${change.to ?? '—'}`);
    modules.push(moduleLine('Order', structureTextChange.concat(detailText).join('; ') || 'Order details copied from the job master'));

    if (structureChanged) {
      const movement = lineMovement(requirementList(order), next.rawMaterialRequirements, rebuilt?.superseded || []);
      modules.push(moduleLine(
        'Material lines and reservations',
        movement.join('; ') || 'Material lines recalculated for the new structure'
      ));
      if ((rebuilt?.superseded || []).length > 0) {
        modules.push(moduleLine(
          'Superseded PO lines',
          rebuilt.superseded.map((line) => `${filmLabel(line)} ${line.poNumber || ''}`.trim()).join('; ')
            + '. These lines stay on the order and do not count toward Gross Required or Balance Qty for PO.'
        ));
      }
      const notes = confirmationsForOrder(order, confirmations);
      if (notes.length === 0) {
        modules.push(moduleLine('OCN amendment', 'No order confirmation is linked to this order. None was created.'));
      } else {
        notes.forEach((ocn) => {
          const reason = `Job master ${jobMasterId} structure changed. ${structureTextChange.join('; ') || structureText(updatedJm.layers, updatedJm.structure)}`;
          ocnAmendments.push({
            orderId: order.id,
            ocn,
            patch: {
              jobName: next.jobName,
              clientName: next.clientName,
              structure: next.structure,
              layers: next.layers,
              printWidthMm: next.printWidthMm,
              repeatLengthMm: next.repeatLengthMm,
              pouchOpenWidth: next.pouchOpenWidth,
              pouchHeight: next.pouchHeight,
              inkGsm: next.inkGsm,
              adhesiveGsm: next.adhesiveGsm,
              colorsCount: next.colorsCount,
              amendmentReason: reason,
            },
            amendedBy: actor,
          });
          modules.push(moduleLine('OCN amendment', `${ocn.ocnNumber || ocn.id} will be amended to the next revision. No email is sent.`));
        });
      }
      if (order.printedSfgUse || order.jobDetails?.printedSfgUse) {
        modules.push(moduleLine('Printed SFG reuse', 'The saved printed-SFG reuse was left on the order and was not moved onto a different film.'));
      }
      if (order.hasVariants || (Array.isArray(order.variants) && order.variants.length > 0)) {
        modules.push(moduleLine('Variants', 'Variant rows were left as stored. The order-level structure follows the job master.'));
      }
    }

    noticeOrders.push({
      orderId: order.id,
      jobName: orderJobName(order),
      status: order.status || '',
      printingStatus: order.printingStatus || order.jobDetails?.printingStatus || '',
      modules,
    });
  });

  const replaced = new Map(orderWrites.map((order) => [order.id, order]));
  const ordersAfter = (orders || []).map((order) => replaced.get(order.id) || order);
  const afterReservations = reservationRows(ordersAfter, inventory, reserveStock);

  noticeOrders.forEach((entry) => {
    const material = entry.modules.find((item) => item.module === 'Material lines and reservations');
    if (!material) return;
    const before = beforeReservations.get(entry.orderId) || [];
    const after = afterReservations.get(entry.orderId) || [];
    const bits = after.map((line) => {
      const prior = before.find((item) => item.id === line.id) || before.find((item) => item.label === line.label);
      const balance = prior ? `${describeKg(prior.balance)} → ${describeKg(line.balance)}` : describeKg(line.balance);
      if (!reserveStock) return `${line.label} balance for PO ${balance}`;
      const reserved = prior ? `${describeKg(prior.reserved)} → ${describeKg(line.reserved)}` : describeKg(line.reserved);
      return `${line.label} reserved ${reserved}, balance for PO ${balance}`;
    });
    if (bits.length) material.detail = `${material.detail}. ${bits.join('; ')}.`;
  });

  const reservationEffects = [];
  if (reserveStock) afterReservations.forEach((lines, orderId) => {
    if (replaced.has(orderId)) return;
    const before = beforeReservations.get(orderId) || [];
    const shifted = lines.filter((line) => {
      const prior = before.find((item) => item.id === line.id);
      return prior && Math.abs(prior.reserved - line.reserved) > 0.02;
    });
    if (shifted.length) {
      reservationEffects.push({
        orderId,
        detail: shifted.map((line) => `${line.label} reserved ${describeKg(before.find((item) => item.id === line.id)?.reserved)} → ${describeKg(line.reserved)}`).join('; '),
      });
    }
  });

  const scheduleWrites = [];
  orderWrites.forEach((order) => {
    (schedules || []).forEach((schedule) => {
      if (!schedule) return;
      const linkedSchedule = text(schedule.orderId) === text(order.id) || text(schedule.id) === `SCHED-${order.id}`;
      if (!linkedSchedule) return;
      if (isClosedScheduleStatus(schedule.status)) {
        const entry = noticeOrders.find((item) => item.orderId === order.id);
        entry?.modules.push(moduleLine('Printing scheduler', `${schedule.id} is ${schedule.status} and was left unchanged.`));
        return;
      }
      const next = nextScheduleCopy(schedule, order);
      if (!scheduleCopyChanged(schedule, next)) return;
      scheduleWrites.push(next);
      const entry = noticeOrders.find((item) => item.orderId === order.id);
      entry?.modules.push(moduleLine(
        'Printing scheduler',
        `${schedule.id} film ${schedule.filmType || '—'} ${schedule.micron || '—'}µ ${schedule.widthMm || '—'} mm → ${next.filmType} ${next.micron}µ ${next.widthMm} mm. Length ${schedule.totalLengthMeters || 0} → ${next.totalLengthMeters} m.`
      ));
    });
    const entry = noticeOrders.find((item) => item.orderId === order.id);
    if (entry && !entry.modules.some((item) => item.module === 'Printing scheduler')) {
      entry.modules.push(moduleLine('Printing scheduler', 'No open schedule row stores a film copy for this order. The press card reads the order.'));
    }
  });

  skipped.forEach((item) => {
    noticeOrders.push({
      orderId: item.orderId,
      status: item.status || '',
      printingStatus: '',
      modules: [moduleLine('Order', item.reason)],
      skipped: true,
    });
  });
  ignoredNameOnly.forEach((item) => {
    noticeOrders.push({
      orderId: item.orderId,
      jobName: item.jobName,
      modules: [moduleLine('Order', item.reason)],
      skipped: true,
    });
  });

  const wroteSomething = orderWrites.length > 0 || scheduleWrites.length > 0 || ignoredNameOnly.length > 0 || skipped.length > 0;
  if (!wroteSomething) return { ...empty, diff, fingerprint: jobMasterSyncFingerprint(updatedJm) };

  const notice = {
    id: noticeId || `STRUCT-${jobMasterId}-${Date.parse(at) || Date.now()}`,
    type: STRUCTURE_CHANGE_NOTICE_TYPE,
    title: structureChanged ? 'Job structure changed' : 'Job master details changed',
    message: `${updatedJm.jobName || jobMasterId} (${jobMasterId}) was saved by ${actor}. ${orderWrites.length} active order(s) updated. Completed, dispatched and cancelled orders were not changed.`,
    audience: STRUCTURE_CHANGE_NOTICE_ROLES,
    jobMasterId,
    sku: updatedJm.skuCode || updatedJm.cylinderSku || '',
    jobName: updatedJm.jobName || '',
    changedBy: actor,
    at,
    read: false,
    diff: diff.map(({ field, from, to }) => ({ field, from, to })),
    orders: noticeOrders,
    reservationEffects,
    timestamp: at,
  };

  return {
    changed: true,
    diff,
    structureChanged,
    orderWrites,
    scheduleWrites,
    ocnAmendments,
    notice,
    skipped,
    ignoredNameOnly,
    fingerprint: jobMasterSyncFingerprint(updatedJm),
  };
}

export function narrowPlan(plan, orderIds) {
  if (!plan) return plan;
  const keep = new Set((orderIds || []).map((id) => String(id)));
  const orderWrites = (plan.orderWrites || []).filter((order) => keep.has(String(order.id)));
  const scheduleWrites = (plan.scheduleWrites || []).filter((schedule) => keep.has(String(schedule.orderId)));
  const ocnAmendments = (plan.ocnAmendments || []).filter((item) => keep.has(String(item.orderId)));
  const orders = (plan.notice?.orders || []).filter((item) => keep.has(String(item.orderId)) || item.skipped);
  const changed = orderWrites.length > 0 || scheduleWrites.length > 0;
  return {
    ...plan,
    changed,
    orderWrites,
    scheduleWrites,
    ocnAmendments,
    notice: plan.notice ? { ...plan.notice, orders } : null,
  };
}

const chains = new Map();
const appliedSnapshots = new Map();
const progressByJob = new Map();
const rememberedOrders = new Map();
const rememberedSchedules = new Map();

export function jobMasterBaseForSync(id) {
  const snap = appliedSnapshots.get(text(id));
  return snap ? clone(snap) : null;
}

export function resetStructureSyncMemory() {
  chains.clear();
  appliedSnapshots.clear();
  progressByJob.clear();
  rememberedOrders.clear();
  rememberedSchedules.clear();
}

function withRememberedOrders(orders) {
  return (orders || []).map((order) => rememberedOrders.get(order?.id) || order);
}

function withRememberedSchedules(schedules) {
  return (schedules || []).map((schedule) => rememberedSchedules.get(schedule?.id) || schedule);
}

function rememberResult(result) {
  (result?.orders || []).forEach((order) => {
    if (order?.id) rememberedOrders.set(order.id, order);
  });
  (result?.schedules || []).forEach((schedule) => {
    if (schedule?.id) rememberedSchedules.set(schedule.id, schedule);
  });
}

async function runStructureSync(updatedJm, context) {
  const key = text(updatedJm?.id);
  const snapshot = appliedSnapshots.get(key);
  const previous = snapshot || context.previousJobMaster || null;
  const confirmations = Array.isArray(context.confirmations)
    ? context.confirmations
    : await (typeof context.loadConfirmations === 'function' ? context.loadConfirmations() : Promise.resolve([]));
  const plan = planStructureSync({
    previousJm: previous,
    updatedJm,
    orders: withRememberedOrders(context.orders),
    schedules: withRememberedSchedules(context.schedules),
    inventory: context.inventory,
    confirmations,
    actor: context.actor,
    at: context.at,
    noticeId: context.noticeId,
    stockReservationEnabled: context.stockReservationEnabled === true,
  });
  if (!plan.changed) {
    if (previous) appliedSnapshots.set(key, clone(updatedJm));
    return { changed: false, plan };
  }

  const progress = progressByJob.get(key);
  const fresh = !progress || progress.fingerprint !== plan.fingerprint;
  const done = fresh ? new Set() : progress.done;
  if (fresh) progressByJob.set(key, { fingerprint: plan.fingerprint, done });
  const remainingIds = plan.orderWrites.map((order) => order.id).filter((id) => !done.has(id));
  const narrowed = remainingIds.length === plan.orderWrites.length ? plan : narrowPlan(plan, remainingIds);
  if (!narrowed.changed) {
    appliedSnapshots.set(key, clone(updatedJm));
    return { changed: false, plan: narrowed };
  }

  const result = await context.apply(narrowed);
  rememberResult(result);
  (result?.orders || []).forEach((order) => done.add(order.id));
  const failures = result?.failures || [];
  if (failures.length === 0) appliedSnapshots.set(key, clone(updatedJm));
  return { changed: true, plan: narrowed, result, failures };
}

/**
 * Serialize syncs for one job master so the cylinder job card's second save
 * does not amend the OCN or rewrite the orders again.
 */
export function syncJobMasterStructure(updatedJm, context = {}) {
  const key = text(updatedJm?.id) || '__missing__';
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(() => runStructureSync(updatedJm, context));
  chains.set(key, run.then(() => {}, () => {}));
  return run;
}
