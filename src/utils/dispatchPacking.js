import { toDatabaseTimestamp } from './dbDates.js';
import { rawRoleNames } from '../assignedRoles.js';

export const DISPATCH_PACKING_PROCESS = 'Dispatch Packing';
export const GAIN_LOSS_THRESHOLD_SETTING = 'dispatch_packing_gain_loss_threshold_pct';
export const DEFAULT_GAIN_LOSS_THRESHOLD_PCT = 2;
export const PACKING_STATUS_OPEN = 'Open';
export const PACKING_STATUS_FINALISED = 'Finalised';
export const GAIN_LOSS_ALERT_TYPE = 'PACKING_GAIN_LOSS';

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function isDispatchPacking(processName) {
  return String(processName || '').trim() === DISPATCH_PACKING_PROCESS;
}

export function canSeePackingGainLoss(roleOrUser) {
  return rawRoleNames(roleOrUser).includes('Admin');
}

export function packingListStatus(shipment) {
  const status = shipment?.packingStatus || shipment?.packing_status || shipment?.payload?.packingStatus || '';
  if (status === PACKING_STATUS_OPEN) return PACKING_STATUS_OPEN;
  return PACKING_STATUS_FINALISED;
}

export function isOpenPackingList(shipment) {
  return packingListStatus(shipment) === PACKING_STATUS_OPEN;
}

export function listConsumptions(shipment) {
  const rows = shipment?.dispatchConsumptions || shipment?.dispatch_consumptions || shipment?.payload?.dispatchConsumptions;
  return Array.isArray(rows) ? rows : [];
}

export function isKgUnit(unit) {
  const value = String(unit || 'Kg').trim().toLowerCase();
  return value === 'kg' || value === 'kgs' || value === 'kilogram' || value === 'kilograms' || value === '';
}

export function packedNetKgFromItems(items) {
  return round2((items || []).reduce((sum, item) => {
    if (!item || !isKgUnit(item.unit || item.uom || 'Kg')) return sum;
    return sum + (Number(item.netWeightKg) || 0);
  }, 0));
}

export function consumedKgForList(shipment) {
  return round2(listConsumptions(shipment).reduce((sum, row) => sum + (Number(row?.consumedKg) || 0), 0));
}

/**
 * Packed net minus FG consumed into Dispatch Packing.
 * A positive difference is a gain. A negative difference is a loss.
 * Percent is that difference divided by the consumed weight.
 */
export function packingGainLoss({ consumedKg = 0, packedNetKg = 0 } = {}) {
  const consumed = round2(consumedKg);
  const packed = round2(packedNetKg);
  const differenceKg = round2(packed - consumed);
  const differencePct = consumed > 0 ? round2((differenceKg / consumed) * 100) : null;
  const direction = differenceKg > 0 ? 'gain' : differenceKg < 0 ? 'loss' : 'even';
  return { consumedKg: consumed, packedNetKg: packed, differenceKg, differencePct, direction };
}

export function gainLossForShipment(shipment, items = shipment?.items) {
  return packingGainLoss({
    consumedKg: consumedKgForList(shipment),
    packedNetKg: packedNetKgFromItems(items)
  });
}

export function normalizeThresholdPct(value) {
  if (value && typeof value === 'object' && value.thresholdPct !== undefined) {
    return normalizeThresholdPct(value.thresholdPct);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return DEFAULT_GAIN_LOSS_THRESHOLD_PCT;
  return round2(number);
}

/**
 * Alert once saved packages exist, or the list is finalised with nothing packed.
 * An open list with no packages yet is a running gap, not an alert.
 * The threshold is exclusive: exactly 2% does not alert.
 */
export function shouldAlertGainLoss(gainLoss, thresholdPct, { packageCount = 0, packingStatus = PACKING_STATUS_FINALISED } = {}) {
  if (gainLoss?.differencePct == null) return false;
  const packed = Number(gainLoss.packedNetKg) || 0;
  const started = Number(packageCount) > 0 || packed > 0 || packingStatus === PACKING_STATUS_FINALISED;
  const weighedOrClosed = packed > 0 || packingStatus === PACKING_STATUS_FINALISED;
  if (!started || !weighedOrClosed) return false;
  return Math.abs(Number(gainLoss.differencePct)) > normalizeThresholdPct(thresholdPct);
}

export function formatGainLossKg(value) {
  const number = round2(value);
  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(2)} kg`;
}

export function formatGainLossPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const number = round2(value);
  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(2)}%`;
}

export function gainLossAlertId(packingListId) {
  return `PACKING-GAIN-LOSS-${packingListId}`;
}

export function consumptionFromLog(logEntry, extras = {}) {
  return {
    id: String(logEntry?.id || '').trim(),
    barcode: String(logEntry?.sfgBatchCode || logEntry?.barcode || '').trim(),
    jobName: String(extras.jobName || logEntry?.jobName || '').trim(),
    jobCode: String(logEntry?.jobCode || '').trim(),
    orderId: String(extras.orderId || logEntry?.orderId || '').trim(),
    consumedKg: round2(logEntry?.consumedKg),
    operatorName: String(logEntry?.operatorName || '').trim(),
    consumedBy: String(extras.consumedBy || logEntry?.operatorName || '').trim(),
    consumedAt: toDatabaseTimestamp(logEntry?.timestamp || logEntry?.consumedAt || extras.now),
    targetProcess: DISPATCH_PACKING_PROCESS,
    notes: String(logEntry?.notes || '').trim(),
    shift: String(logEntry?.shift || '').trim(),
    targetMachine: String(logEntry?.targetMachine || '').trim(),
    clientName: String(extras.clientName || logEntry?.clientName || '').trim(),
    poNo: String(extras.poNo || '').trim(),
    suggestedDispatchId: extras.suggestedDispatchId || null
  };
}

export function findOpenPackingList(shipments, { orderId, jobName } = {}) {
  const order = String(orderId || '').trim();
  const job = String(jobName || '').trim().toLowerCase();
  return (shipments || []).find((shipment) => {
    if (!isOpenPackingList(shipment)) return false;
    if (order && String(shipment.orderId || '').trim() === order) return true;
    if (!order && job && String(shipment.jobName || '').trim().toLowerCase() === job) return true;
    return false;
  }) || null;
}

export function findShipmentByConsumption(shipments, consumptionId) {
  const id = String(consumptionId || '').trim();
  if (!id) return null;
  return (shipments || []).find((shipment) => listConsumptions(shipment).some((row) => String(row?.id) === id)) || null;
}

export function applyDispatchPackingConsumption({
  shipments = [],
  entry,
  now = new Date().toISOString()
} = {}) {
  if (!entry?.id) {
    throw new Error('consumption id is required');
  }
  if (!(Number(entry.consumedKg) > 0)) {
    throw new Error('consumed weight must be greater than 0 kg');
  }
  if (!entry.orderId && !entry.jobName) {
    throw new Error('order or job is required');
  }
  const existing = findShipmentByConsumption(shipments, entry.id);
  if (existing) {
    return { shipment: existing, shipments, created: false, idempotent: true };
  }
  const open = findOpenPackingList(shipments, entry);
  if (open) {
    const shipment = {
      ...open,
      packingStatus: PACKING_STATUS_OPEN,
      dispatchConsumptions: [...listConsumptions(open), entry],
      stockApplied: true
    };
    return {
      shipment,
      created: false,
      idempotent: false,
      shipments: shipments.map((row) => (
        (row.id && row.id === open.id) || (row.dispatchId && row.dispatchId === open.dispatchId) ? shipment : row
      ))
    };
  }
  const dispatchId = entry.suggestedDispatchId || `PL-${String(now).slice(0, 4)}-${String(entry.id).replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`;
  const consumedAt = entry.consumedAt || now;
  const shipment = {
    id: `DISP-PL-${entry.id}`,
    dispatchId,
    orderId: entry.orderId || '',
    jobName: entry.jobName || 'Finished Goods Job',
    jobCode: entry.jobCode || '',
    clientName: entry.clientName || '',
    vehicleNo: '',
    lrNo: '',
    transporterName: '',
    poNo: entry.poNo || '',
    invoiceNo: '',
    dispatchDate: consumedAt,
    createdAt: consumedAt,
    packingStatus: PACKING_STATUS_OPEN,
    totalRolls: 0,
    totalNetWeightKg: 0,
    totalGrossWeightKg: 0,
    items: [],
    dispatchConsumptions: [entry],
    source: DISPATCH_PACKING_PROCESS,
    stockApplied: true
  };
  return { shipment, created: true, idempotent: false, shipments: [shipment, ...shipments] };
}

export function shipmentWithoutGainLoss(shipment) {
  if (!shipment || typeof shipment !== 'object') return shipment;
  const stored = { ...shipment };
  delete stored.differenceKg;
  delete stored.differencePct;
  delete stored.gainLoss;
  delete stored.overThreshold;
  delete stored.thresholdPct;
  return stored;
}

export function mapConsumptionRecord(row) {
  if (!row) return null;
  if (row.consumedKg !== undefined && (row.packingListId || row.id) && row.barcode !== undefined && !row.packing_list_id) {
    return row;
  }
  return {
    id: row.id,
    packingListId: row.packing_list_id || row.packingListId,
    orderId: row.order_id || row.orderId || '',
    jobName: row.job_name || row.jobName || '',
    jobCode: row.job_code || row.jobCode || '',
    barcode: row.barcode || '',
    consumedKg: Number(row.consumed_kg ?? row.consumedKg) || 0,
    operatorName: row.operator_name || row.operatorName || '',
    consumedBy: row.consumed_by || row.consumedBy || '',
    consumedAt: row.consumed_at || row.consumedAt,
    shift: row.shift || '',
    targetMachine: row.target_machine || row.targetMachine || '',
    notes: row.notes || '',
    targetProcess: DISPATCH_PACKING_PROCESS
  };
}

export function mergeConsumptionsIntoShipments(shipments, rows) {
  const grouped = new Map();
  (rows || []).forEach((raw) => {
    const row = mapConsumptionRecord(raw);
    if (!row?.id || !row.packingListId) return;
    const key = String(row.packingListId);
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  });
  return (shipments || []).map((shipment) => {
    const key = String(shipment.dispatchId || shipment.id || '');
    const fromTable = grouped.get(key) || [];
    const byId = new Map();
    [...listConsumptions(shipment), ...fromTable].forEach((row) => {
      if (!row?.id) return;
      byId.set(String(row.id), { ...byId.get(String(row.id)), ...row });
    });
    const columnStatus = shipment.packing_status || shipment.packingStatus;
    const packingStatus = columnStatus === PACKING_STATUS_OPEN
      ? PACKING_STATUS_OPEN
      : (columnStatus === PACKING_STATUS_FINALISED ? PACKING_STATUS_FINALISED : packingListStatus(shipment));
    return {
      ...shipment,
      packingStatus,
      dispatchConsumptions: Array.from(byId.values()).sort((a, b) => String(a.consumedAt || '').localeCompare(String(b.consumedAt || '')))
    };
  });
}

function filterTime(value, endOfDay = false) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).getTime();
  }
  const parsed = new Date(text).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function buildGainLossReport(shipments, filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase();
  const status = filters.status && filters.status !== 'all' ? filters.status : '';
  const from = filterTime(filters.from, false);
  const to = filterTime(filters.to, true);
  const threshold = normalizeThresholdPct(filters.thresholdPct);
  return (shipments || [])
    .map((shipment) => {
      const gain = gainLossForShipment(shipment);
      const statusName = packingListStatus(shipment);
      const packageCount = Array.isArray(shipment.items) ? shipment.items.length : 0;
      return {
        packingListId: shipment.dispatchId || shipment.id,
        orderId: shipment.orderId || '',
        jobName: shipment.jobName || '',
        clientName: shipment.clientName || '',
        packingStatus: statusName,
        fgConsumedKg: gain.consumedKg,
        packedNetKg: gain.packedNetKg,
        differenceKg: gain.differenceKg,
        differencePct: gain.differencePct,
        thresholdPct: threshold,
        overThreshold: shouldAlertGainLoss(gain, threshold, { packageCount, packingStatus: statusName })
          || (gain.differencePct != null && Math.abs(gain.differencePct) > threshold && gain.consumedKg > 0),
        alerted: shouldAlertGainLoss(gain, threshold, { packageCount, packingStatus: statusName }),
        openedAt: shipment.createdAt || shipment.dispatchDate || null,
        updatedAt: shipment.updatedAt || shipment.dispatchDate || shipment.createdAt || null,
        hasConsumption: listConsumptions(shipment).length > 0
      };
    })
    .filter((row) => row.hasConsumption && row.fgConsumedKg > 0)
    .filter((row) => {
      if (status && row.packingStatus !== status) return false;
      if (filters.onlyOver && !(row.differencePct != null && Math.abs(row.differencePct) > threshold)) return false;
      if (search) {
        const haystack = `${row.packingListId} ${row.orderId} ${row.jobName} ${row.clientName}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      const stamp = new Date(row.openedAt || 0).getTime();
      if (from != null && !(stamp >= from)) return false;
      if (to != null && !(stamp <= to)) return false;
      return true;
    });
}

export function nextDispatchQuantity(previousKg, history, shipment) {
  const key = String(shipment?.dispatchId || shipment?.id || '');
  const packed = round2(shipment?.totalNetWeightKg);
  const rows = Array.isArray(history) ? history : [];
  const existing = rows.find((row) => String(row?.dispatchId || '') === key);
  const prior = existing ? round2(existing.netWeightKg) : 0;
  const entry = {
    dispatchId: key,
    date: shipment?.dispatchDate || new Date().toISOString(),
    netWeightKg: packed,
    vehicleNo: shipment?.vehicleNo || '',
    clientName: shipment?.clientName || '',
    totalRolls: Array.isArray(shipment?.items) ? shipment.items.length : (Number(shipment?.totalRolls) || 0)
  };
  return {
    qtyDispatch: round2((Number(previousKg) || 0) + packed - prior),
    deltaKg: round2(packed - prior),
    dispatchHistory: existing
      ? rows.map((row) => (String(row?.dispatchId || '') === key ? { ...row, ...entry } : row))
      : [entry, ...rows]
  };
}
