import { parseOptionalKg } from './productionRecordQuality.js';
import { printingScrapId, PRINTING_SCRAP_SOURCE } from './printingScrap.js';

/** Order quantity is stored in kilograms on orders.order_qty_kg. Wastage is kilograms. No unit conversion. */
export const ORDER_QTY_UNIT = 'kg';
export const HIGH_SCRAP_THRESHOLD_PCT = 5;
export const HIGH_SCRAP_SOURCE = 'high-scrap-registry';

/**
 * Every wastage quantity recorded against a job.
 * Printing plain wastage and printing setting wastage are one stored field
 * (printingPlainSettingWastageKg, label "Printing Plain Setting").
 * Laminate wastage is one field shared by lamination pass 1 and pass 2.
 * slittingScrapKg is the sum of trim and slitting setting and is not a field of its own.
 * Consumables (adhesive, zipper, paper core, ink) and the job-card estimate
 * actualScrapWastageKg are not process wastage.
 */
export const JOB_WASTAGE_FIELDS = [
  {
    key: 'printingPlainSettingWastageKg',
    stage: 'Printing',
    type: 'Plain Setting',
    idKey: 'plain-setting',
    source: PRINTING_SCRAP_SOURCE
  },
  {
    key: 'printingWastageKg',
    stage: 'Printing',
    type: 'Printing Wastage',
    idKey: 'printing-wastage',
    source: PRINTING_SCRAP_SOURCE
  },
  {
    key: 'excessFilmWastageKg',
    stage: 'Printing',
    type: 'Film Trimming Wastage',
    idKey: 'film-trimming',
    source: PRINTING_SCRAP_SOURCE
  },
  {
    key: 'laminationPlainSubstrateWastageKg',
    stage: 'Lamination',
    type: 'Lamination Plain Substrate',
    idKey: 'lamination-plain-substrate',
    source: 'lamination'
  },
  {
    key: 'laminationPlainSubstrateWastageL2Kg',
    stage: 'Lamination',
    type: 'Lamination Plain Substrate (L2)',
    idKey: 'lamination-plain-substrate-l2',
    source: 'lamination'
  },
  {
    key: 'laminateWastageKg',
    stage: 'Lamination',
    type: 'Laminate Wastage',
    idKey: 'laminate-wastage',
    source: 'lamination'
  },
  {
    key: 'printedWastageKg',
    stage: 'Inspection',
    type: 'Printed Defect Wastage',
    idKey: 'printed-defect',
    source: 'inspection'
  },
  {
    key: 'trimWastageKg',
    stage: 'Slitting',
    type: 'Trim Wastage',
    idKey: 'trim-wastage',
    source: 'slitting'
  },
  {
    key: 'slittingSettingWastageKg',
    stage: 'Slitting',
    type: 'Slitting Setting Wastage',
    idKey: 'slitting-setting',
    source: 'slitting'
  },
  {
    key: 'pouchingScrapKg',
    stage: 'Pouching',
    type: 'Pouching Scrap',
    idKey: 'pouching-scrap',
    source: 'pouching'
  }
];

const COLUMN_KEYS = {
  printingPlainSettingWastageKg: 'printing_plain_setting_wastage_kg',
  printingWastageKg: 'printing_wastage_kg',
  laminationPlainSubstrateWastageKg: 'lamination_plain_substrate_wastage_kg',
  laminationPlainSubstrateWastageL2Kg: 'lamination_plain_substrate_wastage_l2_kg',
  laminateWastageKg: 'laminate_wastage_kg',
  printedWastageKg: 'printed_wastage_kg',
  trimWastageKg: 'trim_wastage_kg',
  pouchingScrapKg: 'pouching_scrap_kg'
};

export function jobWastageScrapId(orderId, field) {
  if (field.type === 'Plain Setting' || field.type === 'Printing Wastage') {
    return printingScrapId(orderId, field.type);
  }
  return printingScrapId(orderId, field.idKey);
}

export function highScrapRegistryId(orderId) {
  return `high-scrap:${String(orderId || '').trim()}`;
}

function present(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function readRaw(record, field) {
  if (present(record?.[field.key])) return record[field.key];
  const column = COLUMN_KEYS[field.key];
  if (column && present(record?.[column])) return record[column];
  const logs = record?.processLogs || record?.process_logs;
  if (logs && typeof logs === 'object' && present(logs[field.key])) return logs[field.key];
  return 0;
}

export function readWastageKg(record, field) {
  const qty = parseOptionalKg(readRaw(record, field));
  if (qty === null) {
    const error = new Error(`${field.type} (kg) cannot be negative.`);
    error.code = 'SCRAP_QTY';
    throw error;
  }
  return qty;
}

export function orderQuantityKg(order) {
  const candidates = [order?.orderQtyKg, order?.order_qty_kg, order?.quantityKg, order?.quantity];
  for (const candidate of candidates) {
    const qty = Number(candidate);
    if (Number.isFinite(qty) && qty > 0) return qty;
  }
  return 0;
}

export function wastagePctOfOrder(totalKg, orderQtyKg) {
  if (!(orderQtyKg > 0)) return null;
  return (totalKg / orderQtyKg) * 100;
}

export function isHighScrapPct(pct) {
  return pct !== null && pct >= HIGH_SCRAP_THRESHOLD_PCT;
}

function roundKg(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeRecord(record) {
  const logs = record?.processLogs || record?.process_logs || {};
  const normalized = {
    id: record?.id || '',
    orderId: record?.orderId || record?.order_id || '',
    jobName: record?.jobName || record?.job_name || '',
    jobCode: record?.jobCode || record?.job_code || record?.orderId || record?.order_id || '',
    clientName: record?.clientName || record?.client_name || '',
    filmType: record?.filmType || record?.film_type || '',
    micron: record?.micron ?? null,
    widthMm: record?.widthMm ?? record?.width_mm ?? null,
    dateFilled: record?.dateFilled || record?.date_filled || '',
    recordedAt: record?.recordedAt || record?.recorded_at || '',
    filledBy: record?.filledBy || record?.filled_by || record?.operatorName || record?.operator_name || '',
    operatorName: record?.operatorName || record?.operator_name || '',
    shift: record?.shift || '',
    processLogs: logs
  };
  JOB_WASTAGE_FIELDS.forEach((field) => {
    normalized[field.key] = readRaw(record, field);
  });
  return normalized;
}

function mergeRecords(records) {
  const sorted = [...records].sort((a, b) => String(b.recordedAt || '').localeCompare(String(a.recordedAt || '')));
  const merged = { ...sorted[0] };
  JOB_WASTAGE_FIELDS.forEach((field) => {
    merged[field.key] = roundKg(records.reduce((sum, record) => sum + readWastageKg(record, field), 0));
  });
  return merged;
}

function stageLines(record) {
  return JOB_WASTAGE_FIELDS.map((field) => ({
    field,
    qty: readWastageKg(record, field)
  }));
}

/**
 * One scrap-store row per order and wastage type, plus one high-scrap registry
 * row when total wastage is at least 5% of order quantity. Zero quantities and
 * jobs under 5% are returned as deletes so an edit removes the earlier row.
 */
export function planJobWastage({
  record = {},
  order = null,
  scrappedBy,
  date,
  timestamp
} = {}) {
  const normalized = normalizeRecord(record);
  const rolls = record?.inputRollsList || record?.input_rolls_list || [];
  const firstRoll = rolls[0] || {};
  const orderId = String(normalized.orderId || order?.id || '').trim();
  const lines = stageLines(normalized);
  const jobNo = normalized.jobCode || orderId;
  const recordedDate = date || normalized.dateFilled || '';
  const recordedAt = timestamp || normalized.recordedAt || '';
  const upserts = [];
  const deleteIds = [];

  lines.forEach(({ field, qty }) => {
    const id = jobWastageScrapId(orderId, field);
    if (!(qty > 0)) {
      deleteIds.push(id);
      return;
    }
    upserts.push({
      id,
      holdTagId: normalized.id || id,
      orderId,
      jobNo,
      jobCode: jobNo,
      jobName: normalized.jobName || order?.jobName || '',
      clientName: normalized.clientName || order?.clientName || '',
      filmType: normalized.filmType || order?.printFilmType || order?.filmType || firstRoll.filmType || '',
      micron: normalized.micron ?? order?.micron ?? firstRoll.micron ?? null,
      widthMm: normalized.widthMm ?? record?.printWidthMm ?? order?.printWidthMm ?? order?.widthMm ?? firstRoll.widthMm ?? null,
      scrapQtyKg: qty,
      defectCategory: field.type,
      type: field.type,
      stage: field.stage,
      source: field.source,
      productionRecordId: normalized.id || '',
      scrapReason: `${field.stage} / ${field.type} recorded for ${jobNo}`,
      scrappedBy: scrappedBy || normalized.filledBy || 'Operator',
      date: recordedDate,
      timestamp: recordedAt
    });
  });

  const totalWastageKg = roundKg(lines.reduce((sum, line) => sum + line.qty, 0));
  const orderQtyKg = orderQuantityKg(order);
  const pct = wastagePctOfOrder(totalWastageKg, orderQtyKg);
  const flagged = isHighScrapPct(pct);
  const registryId = orderId ? highScrapRegistryId(orderId) : '';
  const breakdown = lines
    .filter((line) => line.qty > 0)
    .map((line) => ({
      stage: line.field.stage,
      type: line.field.type,
      scrapQtyKg: line.qty
    }));

  let registryUpsert = null;
  let registryDeleteId = null;
  if (registryId && flagged) {
    registryUpsert = {
      id: registryId,
      orderId,
      jobNo,
      jobName: normalized.jobName || order?.jobName || '',
      clientName: normalized.clientName || order?.clientName || '',
      productionRecordId: normalized.id || '',
      orderQtyKg,
      orderQtyUnit: ORDER_QTY_UNIT,
      totalWastageKg,
      wastagePct: Number(pct.toFixed(2)),
      thresholdPct: HIGH_SCRAP_THRESHOLD_PCT,
      stages: breakdown,
      source: HIGH_SCRAP_SOURCE,
      operatorName: normalized.operatorName || normalized.filledBy || '',
      shift: normalized.shift || '',
      date: recordedDate,
      timestamp: recordedAt
    };
  } else if (registryId) {
    registryDeleteId = registryId;
  }

  return {
    scrap: { upserts, deleteIds },
    registry: { upsert: registryUpsert, deleteId: registryDeleteId },
    totalWastageKg,
    orderQtyKg,
    wastagePct: pct === null ? null : Number(pct.toFixed(2)),
    flagged
  };
}

export function formatStageBreakdown(stages) {
  return (stages || [])
    .map((stage) => `${stage.stage} / ${stage.type}: ${Number(stage.scrapQtyKg).toFixed(2)} kg`)
    .join('; ');
}

/** Dry-run plan for every job. Does not write. */
export function planBackfill({ orders = [], productionRecords = [] } = {}) {
  const ordersById = new Map();
  (orders || []).forEach((order) => {
    const id = String(order?.id || '').trim();
    if (id) ordersById.set(id, order);
  });
  const groups = new Map();
  (productionRecords || []).forEach((record) => {
    const normalized = normalizeRecord(record);
    const orderId = String(normalized.orderId || '').trim();
    if (!orderId) return;
    const list = groups.get(orderId) || [];
    list.push(normalized);
    groups.set(orderId, list);
  });

  const scrapUpserts = [];
  const scrapDeleteIds = [];
  const flaggedJobs = [];
  const registryDeletes = [];
  groups.forEach((records, orderId) => {
    const plan = planJobWastage({
      record: mergeRecords(records),
      order: ordersById.get(orderId) || null,
      date: records[0]?.dateFilled || '',
      timestamp: records[0]?.recordedAt || ''
    });
    scrapUpserts.push(...plan.scrap.upserts);
    scrapDeleteIds.push(...plan.scrap.deleteIds);
    if (plan.registry.upsert) flaggedJobs.push(plan.registry.upsert);
    if (plan.registry.deleteId) registryDeletes.push(plan.registry.deleteId);
  });
  flaggedJobs.sort((a, b) => b.wastagePct - a.wastagePct || String(a.orderId).localeCompare(String(b.orderId)));
  return { scrapUpserts, scrapDeleteIds, flaggedJobs, registryDeletes };
}

export function listHighScrapJobs(productionRecords, orders) {
  return planBackfill({ orders, productionRecords }).flaggedJobs;
}
