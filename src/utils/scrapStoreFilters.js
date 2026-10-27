import { JOB_WASTAGE_FIELDS, listHighScrapJobs } from './jobWastage.js';

/** Scrap entry dates are plant calendar days in Asia/Kolkata. */
export const SCRAP_TIME_ZONE = 'Asia/Kolkata';

export const SCRAP_SOURCE = {
  process: 'process',
  qc: 'qc',
  other: 'other'
};

export const SCRAP_SOURCE_LABEL = {
  process: 'Process wastage',
  qc: 'QC hold',
  other: 'Other'
};

const PROCESS_SOURCES = ['printing', 'lamination', 'inspection', 'slitting', 'pouching'];
const PROCESS_SOURCE_SET = new Set(PROCESS_SOURCES);

export const QC_DEFECT_CATEGORIES = [
  'Delamination / Bonding Failure',
  'Shade / Color Variation',
  'Wrinkles / Creases / Telescoping',
  'Misregistration / Print Shift',
  'Scuffing / Scratches / Ink Flaking',
  'Pinholes / Contamination / Spots',
  'Substrate Defects / Gauge Variation',
  'Other Rejection Defect'
];

export const SCRAP_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'fy', label: 'This financial year' },
  { id: 'custom', label: 'Custom' }
];

const PRESET_IDS = new Set(SCRAP_PRESETS.map((preset) => preset.id));

export const EMPTY_SCRAP_FILTERS = {
  preset: '',
  from: '',
  to: '',
  stage: '',
  type: '',
  source: '',
  orderId: '',
  jobMasterId: '',
  customer: '',
  machine: '',
  operator: '',
  material: '',
  kgMin: '',
  kgMax: '',
  high: false,
  status: '',
  q: '',
  page: 1
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function isoDate(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function istDateParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCRAP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [year, month, day] = fmt.format(now).split('-').map(Number);
  return { year, month, day };
}

function addDays(parts, days) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day) + days * 86400000;
  const date = new Date(utc);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function weekday(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function addIsoDays(iso, days) {
  const [year, month, day] = String(iso || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  return isoDate(addDays({ year, month, day }, days));
}

export function rangeForPreset(preset, now = new Date()) {
  const today = istDateParts(now);
  if (preset === 'today') {
    const iso = isoDate(today);
    return { from: iso, to: iso };
  }
  if (preset === 'yesterday') {
    const iso = isoDate(addDays(today, -1));
    return { from: iso, to: iso };
  }
  if (preset === 'week') {
    const delta = weekday(today) === 0 ? -6 : 1 - weekday(today);
    const start = addDays(today, delta);
    return { from: isoDate(start), to: isoDate(addDays(start, 6)) };
  }
  if (preset === 'month') {
    const start = { year: today.year, month: today.month, day: 1 };
    const end = addDays({ year: today.year, month: today.month + 1, day: 1 }, -1);
    return { from: isoDate(start), to: isoDate(end) };
  }
  if (preset === 'last-month') {
    const firstThis = { year: today.year, month: today.month, day: 1 };
    const end = addDays(firstThis, -1);
    return { from: isoDate({ year: end.year, month: end.month, day: 1 }), to: isoDate(end) };
  }
  if (preset === 'fy') {
    const startYear = today.month >= 4 ? today.year : today.year - 1;
    return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
  }
  return { from: '', to: '' };
}

export function formatIsoDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

function numericFilter(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return '';
  return String(number);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

export function normalizeScrapFilters(input = {}, now = new Date()) {
  const requested = cleanText(input.preset);
  let preset = PRESET_IDS.has(requested) ? requested : '';
  if (!preset && (cleanText(input.from) || cleanText(input.to))) preset = 'custom';
  let from = '';
  let to = '';
  if (preset && preset !== 'custom') {
    const range = rangeForPreset(preset, now);
    from = range.from;
    to = range.to;
  } else if (preset === 'custom') {
    from = /^\d{4}-\d{2}-\d{2}$/.test(cleanText(input.from)) ? cleanText(input.from) : '';
    to = /^\d{4}-\d{2}-\d{2}$/.test(cleanText(input.to)) ? cleanText(input.to) : '';
    if (from && to && from > to) {
      const swap = from;
      from = to;
      to = swap;
    }
  }
  const page = Math.max(1, parseInt(input.page, 10) || 1);
  return {
    preset,
    from,
    to,
    stage: cleanText(input.stage),
    type: cleanText(input.type),
    source: Object.prototype.hasOwnProperty.call(SCRAP_SOURCE, cleanText(input.source)) ? cleanText(input.source) : '',
    orderId: cleanText(input.orderId),
    jobMasterId: cleanText(input.jobMasterId),
    customer: cleanText(input.customer),
    machine: cleanText(input.machine),
    operator: cleanText(input.operator),
    material: cleanText(input.material),
    kgMin: numericFilter(input.kgMin),
    kgMax: numericFilter(input.kgMax),
    high: input.high === true || input.high === '1' || input.high === 'true',
    status: cleanText(input.status),
    q: cleanText(input.q),
    page
  };
}

export function scrapFiltersFromQuery(params = {}, now = new Date()) {
  return normalizeScrapFilters({
    preset: params.preset,
    from: params.from,
    to: params.to,
    stage: params.stage,
    type: params.type,
    source: params.source,
    orderId: params.orderId,
    jobMasterId: params.jobMasterId,
    customer: params.customer,
    machine: params.machine,
    operator: params.operator,
    material: params.material,
    kgMin: params.kgMin,
    kgMax: params.kgMax,
    high: params.high,
    status: params.status,
    q: params.q,
    page: params.page
  }, now);
}

export function scrapFiltersToQuery(filters) {
  const out = {};
  if (filters.preset && filters.preset !== 'custom') out.preset = filters.preset;
  if (filters.preset === 'custom') {
    out.preset = 'custom';
    if (filters.from) out.from = filters.from;
    if (filters.to) out.to = filters.to;
  }
  if (filters.stage) out.stage = filters.stage;
  if (filters.type) out.type = filters.type;
  if (filters.source) out.source = filters.source;
  if (filters.orderId) out.orderId = filters.orderId;
  if (filters.jobMasterId) out.jobMasterId = filters.jobMasterId;
  if (filters.customer) out.customer = filters.customer;
  if (filters.machine) out.machine = filters.machine;
  if (filters.operator) out.operator = filters.operator;
  if (filters.material) out.material = filters.material;
  if (filters.kgMin !== '') out.kgMin = filters.kgMin;
  if (filters.kgMax !== '') out.kgMax = filters.kgMax;
  if (filters.high) out.high = '1';
  if (filters.status) out.status = filters.status;
  if (filters.q) out.q = filters.q;
  if (filters.page > 1) out.page = String(filters.page);
  return out;
}

export function patchScrapFilters(current, patch = {}, now = new Date()) {
  const merged = { ...current, ...patch };
  if (patch.preset && patch.preset !== 'custom') {
    merged.from = '';
    merged.to = '';
  }
  if ((patch.from !== undefined || patch.to !== undefined) && patch.preset === undefined) {
    merged.preset = 'custom';
  }
  const resetsPage = Object.keys(patch).some((key) => key !== 'page');
  if (resetsPage && patch.page === undefined) merged.page = 1;
  return normalizeScrapFilters(merged, now);
}

export function hasActiveScrapFilters(filters) {
  if (!filters) return false;
  return Boolean(
    filters.preset
    || filters.from
    || filters.to
    || filters.stage
    || filters.type
    || filters.source
    || filters.orderId
    || filters.jobMasterId
    || filters.customer
    || filters.machine
    || filters.operator
    || filters.material
    || filters.kgMin !== ''
    || filters.kgMax !== ''
    || filters.high
    || filters.status
    || filters.q
  );
}

export function scrapEntryDate(item) {
  const raw = item?.date || item?.timestamp || item?.createdAt || '';
  const text = cleanText(raw);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(text)) {
    const parsed = new Date(text.includes(' ') ? text.replace(' ', 'T') : text);
    if (!Number.isNaN(parsed.getTime())) return isoDate(istDateParts(parsed));
  }
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = Number(slash[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad(month)}-${pad(day)}`;
  }
  return '';
}

export function scrapSourceKind(item) {
  const source = cleanText(item?.source).toLowerCase();
  if (source === 'qc' || source === 'qc-hold' || source === 'qc_hold' || source === 'qchold') return SCRAP_SOURCE.qc;
  if (PROCESS_SOURCE_SET.has(source)) return SCRAP_SOURCE.process;
  if (cleanText(item?.stage)) return SCRAP_SOURCE.process;
  if (!source) return SCRAP_SOURCE.qc;
  return SCRAP_SOURCE.other;
}

export function scrapSourceLabel(kind) {
  return SCRAP_SOURCE_LABEL[kind] || SCRAP_SOURCE_LABEL.other;
}

export function scrapStageLabel(item) {
  const stage = cleanText(item?.stage);
  if (stage) return stage;
  if (scrapSourceKind(item) === SCRAP_SOURCE.qc) return 'QC Hold';
  return 'Other';
}

export function scrapStatus(item) {
  const raw = cleanText(item?.status);
  if (!raw) return 'In stock';
  const lower = raw.toLowerCase();
  if (lower === 'in stock' || lower === 'instock' || lower === 'in_stock') return 'In stock';
  if (lower === 'sold') return 'Sold';
  if (lower === 'disposed' || lower === 'disposal') return 'Disposed';
  return raw;
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
}

function namedMachine(value, machines) {
  const machine = (machines || []).find((item) => String(item?.id) === String(value) || String(item?.name) === String(value));
  return machine?.name || '';
}

export function buildScrapFilterContext({
  orders = [],
  jobMasters = [],
  productionRecords = [],
  machines = [],
  registryRows = []
} = {}) {
  const ordersById = new Map();
  (orders || []).forEach((order) => {
    const id = cleanText(order?.id);
    if (id) ordersById.set(id, order);
  });
  const jobMastersById = new Map();
  (jobMasters || []).forEach((job) => {
    const id = cleanText(job?.id);
    if (id) jobMastersById.set(id, job);
  });
  const recordsById = new Map();
  const recordsByOrder = new Map();
  (productionRecords || []).forEach((record) => {
    const id = cleanText(record?.id);
    if (id) recordsById.set(id, record);
    const orderId = cleanText(record?.orderId || record?.order_id);
    if (orderId && !recordsByOrder.has(orderId)) recordsByOrder.set(orderId, record);
  });
  const highScrapOrderIds = new Set();
  (registryRows || []).forEach((row) => {
    const orderId = cleanText(row?.orderId || row?.order_id || row?.payload?.orderId);
    if (orderId) highScrapOrderIds.add(orderId);
  });
  try {
    listHighScrapJobs(productionRecords || [], orders || []).forEach((job) => {
      const orderId = cleanText(job?.orderId);
      if (orderId) highScrapOrderIds.add(orderId);
    });
  } catch {
    /* a bad production row must not blank the scrap store */
  }
  return {
    orders: orders || [],
    jobMasters: jobMasters || [],
    productionRecords: productionRecords || [],
    machines: machines || [],
    ordersById,
    jobMastersById,
    recordsById,
    recordsByOrder,
    highScrapOrderIds
  };
}

function resolveJobMaster(item, order, context) {
  const explicit = cleanText(item?.jobMasterId || order?.jobMasterId || order?.jobDetails?.jobMasterId);
  if (explicit && context.jobMastersById.has(explicit)) return context.jobMastersById.get(explicit);
  const name = cleanText(item?.jobName || order?.jobName).toLowerCase();
  if (!name) return null;
  return (context.jobMasters || []).find((job) => cleanText(job?.jobName).toLowerCase() === name) || null;
}

function resolveMachine(item, order, context) {
  const record = context.recordsById.get(cleanText(item?.productionRecordId))
    || context.recordsByOrder.get(cleanText(item?.orderId));
  const direct = firstText(item?.machineName, item?.machine, item?.machineId);
  if (direct) return namedMachine(direct, context.machines) || direct;
  const fromOrder = firstText(order?.machineName, order?.machine, order?.machineId, order?.jobDetails?.machineId);
  if (fromOrder) return namedMachine(fromOrder, context.machines) || fromOrder;
  const fromRecord = firstText(record?.machineName, record?.machine, record?.machineId);
  if (fromRecord) return namedMachine(fromRecord, context.machines) || fromRecord;
  return '';
}

export function describeScrapRow(item, context) {
  const order = context.ordersById.get(cleanText(item?.orderId)) || null;
  const jobMaster = resolveJobMaster(item, order, context);
  const sourceKind = scrapSourceKind(item);
  return {
    ...item,
    entryDate: scrapEntryDate(item),
    stageLabel: scrapStageLabel(item),
    typeLabel: firstText(item?.type, item?.defectCategory),
    sourceKind,
    sourceLabel: scrapSourceLabel(sourceKind),
    customer: firstText(item?.clientName, item?.customerName, order?.clientName),
    jobMasterId: jobMaster?.id || '',
    jobMasterName: jobMaster?.jobName || '',
    machineLabel: resolveMachine(item, order, context),
    operatorLabel: firstText(item?.scrappedBy, item?.operatorName, item?.filledBy),
    materialLabel: firstText(item?.filmType, item?.substrate, item?.itemName, item?.category, item?.itemCategory),
    statusLabel: scrapStatus(item),
    barcode: firstText(item?.holdTagId, item?.barcodeId, item?.barcode),
    notes: firstText(item?.scrapReason, item?.notes, item?.remarks),
    orderNo: firstText(item?.orderId, item?.jobNo, item?.jobCode),
    highScrap: context.highScrapOrderIds.has(cleanText(item?.orderId))
  };
}

function includesText(haystack, needle) {
  return cleanText(haystack).toLowerCase().includes(needle);
}

function equalsText(left, right) {
  return cleanText(left).toLowerCase() === cleanText(right).toLowerCase();
}

function rowMatches(row, filters, context) {
  if (filters.from && (!row.entryDate || row.entryDate < filters.from)) return false;
  if (filters.to && (!row.entryDate || row.entryDate > filters.to)) return false;
  if (filters.stage && row.stageLabel !== filters.stage) return false;
  if (filters.type && row.typeLabel !== filters.type && cleanText(row.defectCategory) !== filters.type && cleanText(row.type) !== filters.type) return false;
  if (filters.source && row.sourceKind !== filters.source) return false;
  if (filters.orderId) {
    const needle = filters.orderId.toLowerCase();
    const hit = [row.orderId, row.jobNo, row.jobCode, row.orderNo].some((value) => includesText(value, needle));
    if (!hit) return false;
  }
  if (filters.jobMasterId && String(row.jobMasterId) !== String(filters.jobMasterId)) return false;
  if (filters.customer && !equalsText(row.customer, filters.customer)) return false;
  if (filters.machine) {
    const machine = (context.machines || []).find((item) => String(item?.id) === String(filters.machine) || String(item?.name) === String(filters.machine));
    const names = new Set([filters.machine, machine?.id, machine?.name].map((value) => cleanText(value)).filter(Boolean));
    if (!names.has(row.machineLabel) && ![...names].some((name) => equalsText(name, row.machineLabel))) return false;
  }
  if (filters.operator) {
    const needle = filters.operator.toLowerCase();
    const hit = [row.operatorLabel, row.scrappedBy, row.operatorName].some((value) => includesText(value, needle));
    if (!hit) return false;
  }
  if (filters.material) {
    const hit = [row.materialLabel, row.filmType, row.substrate, row.itemName, row.category, row.itemCategory]
      .some((value) => equalsText(value, filters.material));
    if (!hit) return false;
  }
  const kg = Number(row.scrapQtyKg);
  const weight = Number.isFinite(kg) ? kg : 0;
  if (filters.kgMin !== '' && !(weight >= Number(filters.kgMin))) return false;
  if (filters.kgMax !== '' && !(weight <= Number(filters.kgMax))) return false;
  if (filters.high && !row.highScrap) return false;
  if (filters.status && row.statusLabel !== filters.status) return false;
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const hay = [row.orderId, row.jobNo, row.jobCode, row.jobName, row.barcode, row.holdTagId, row.barcodeId, row.notes, row.scrapReason]
      .map((value) => cleanText(value).toLowerCase())
      .join(' ');
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export function applyScrapFilters(items, filters, context = buildScrapFilterContext()) {
  const normalized = normalizeScrapFilters(filters || {});
  const described = (items || []).map((item) => describeScrapRow(item, context));
  const rows = described.filter((row) => rowMatches(row, normalized, context));
  rows.sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate)) || String(b.timestamp || '').localeCompare(String(a.timestamp || '')) || String(a.id).localeCompare(String(b.id)));
  return { rows, summary: summarizeScrapRows(rows) };
}

export function summarizeScrapRows(rows) {
  const jobs = new Set();
  const stages = new Map();
  let totalKg = 0;
  (rows || []).forEach((row) => {
    const kg = Number(row.scrapQtyKg);
    const weight = Number.isFinite(kg) ? kg : 0;
    totalKg += weight;
    const jobKey = cleanText(row.orderId || row.jobNo || row.jobCode);
    if (jobKey) jobs.add(jobKey);
    const stage = row.stageLabel || scrapStageLabel(row);
    const bucket = stages.get(stage) || { stage, kg: 0, count: 0 };
    bucket.kg += weight;
    bucket.count += 1;
    stages.set(stage, bucket);
  });
  return {
    totalKg: Math.round((totalKg + Number.EPSILON) * 100) / 100,
    rowCount: (rows || []).length,
    jobCount: jobs.size,
    byStage: [...stages.values()]
      .map((bucket) => ({ ...bucket, kg: Math.round((bucket.kg + Number.EPSILON) * 100) / 100 }))
      .sort((a, b) => b.kg - a.kg || a.stage.localeCompare(b.stage))
  };
}

export function paginateScrapRows(rows, page, pageSize = 25) {
  const size = pageSize > 0 ? pageSize : 25;
  const total = (rows || []).length;
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(Math.max(1, page || 1), pages);
  const start = (current - 1) * size;
  return {
    page: current,
    pageSize: size,
    pages,
    total,
    rows: (rows || []).slice(start, start + size)
  };
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function scrapFilterOptions({ rows = [], orders = [], jobMasters = [], machines = [], productionRecords = [] } = {}) {
  const described = rows.map((row) => (row.stageLabel ? row : describeScrapRow(row, buildScrapFilterContext({ orders, jobMasters, machines, productionRecords }))));
  const stages = uniqueSorted([
    ...JOB_WASTAGE_FIELDS.map((field) => field.stage),
    'QC Hold',
    ...described.map((row) => row.stageLabel)
  ]);
  const types = uniqueSorted([
    ...JOB_WASTAGE_FIELDS.map((field) => field.type),
    ...QC_DEFECT_CATEGORIES,
    ...described.map((row) => row.typeLabel || row.type || row.defectCategory)
  ]);
  const customers = uniqueSorted([
    ...orders.map((order) => order?.clientName),
    ...described.map((row) => row.customer || row.clientName)
  ]);
  const materials = uniqueSorted([
    ...orders.map((order) => order?.printFilmType || order?.filmType),
    ...described.map((row) => row.filmType || row.substrate || row.itemName || row.category)
  ]);
  const operators = uniqueSorted([
    ...productionRecords.map((record) => record?.operatorName || record?.filledBy),
    ...described.map((row) => row.operatorLabel || row.scrappedBy)
  ]);
  const statuses = uniqueSorted(['In stock', 'Sold', 'Disposed', ...described.map((row) => row.statusLabel || scrapStatus(row))]);
  return {
    stages,
    types,
    sources: [
      { value: SCRAP_SOURCE.process, label: SCRAP_SOURCE_LABEL.process },
      { value: SCRAP_SOURCE.qc, label: SCRAP_SOURCE_LABEL.qc },
      { value: SCRAP_SOURCE.other, label: SCRAP_SOURCE_LABEL.other }
    ],
    customers,
    jobMasters: [...(jobMasters || [])]
      .map((job) => ({ value: String(job.id), label: job.jobName || job.skuCode || String(job.id) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    machines: [...(machines || [])]
      .map((machine) => ({ value: String(machine.id || machine.name), label: machine.name || String(machine.id) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    materials,
    operators,
    statuses
  };
}

function orLiteral(value) {
  const text = String(value ?? '');
  if (/^[A-Za-z0-9_-]+$/.test(text)) return text;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function searchToken(value) {
  return String(value ?? '').replace(/[%*,.():"\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function ilikeClause(column, token) {
  return `${column}.ilike.%${token}%`;
}

function orderIdsForJobMaster(jobMasterId, context) {
  const job = context.jobMastersById.get(String(jobMasterId));
  const name = cleanText(job?.jobName).toLowerCase();
  const ids = [];
  (context.orders || []).forEach((order) => {
    const id = cleanText(order?.id);
    if (!id) return;
    const linked = cleanText(order?.jobMasterId || order?.jobDetails?.jobMasterId) === String(jobMasterId);
    const named = name && cleanText(order?.jobName).toLowerCase() === name;
    if (linked || named) ids.push(id);
  });
  return ids;
}

function orderIdsForMachine(machineValue, context) {
  const machine = (context.machines || []).find((item) => String(item?.id) === String(machineValue) || String(item?.name) === String(machineValue));
  const id = cleanText(machine?.id || machineValue);
  const name = cleanText(machine?.name || machineValue);
  const ids = new Set();
  (context.orders || []).forEach((order) => {
    const orderId = cleanText(order?.id);
    if (!orderId) return;
    const machineId = cleanText(order?.machineId || order?.jobDetails?.machineId);
    const machineName = cleanText(order?.machineName || order?.machine);
    if ((id && machineId === id) || (name && (machineName === name || machineId === name))) ids.add(orderId);
  });
  (context.productionRecords || []).forEach((record) => {
    const orderId = cleanText(record?.orderId || record?.order_id);
    if (!orderId) return;
    const machineId = cleanText(record?.machineId);
    const machineName = cleanText(record?.machineName || record?.machine);
    if ((id && machineId === id) || (name && (machineName === name || machineId === name))) ids.add(orderId);
  });
  return { ids: [...ids], id, name };
}

/**
 * Server predicates that narrow sfg_scrap_items. Each OR group is one
 * PostgREST `or` argument so a second `.or()` cannot overwrite the first.
 * The browser still applies the same filters, so a wider server result is safe.
 */
export function planScrapServerQuery(filters, context = buildScrapFilterContext()) {
  const steps = [];
  const orGroups = [];
  let orderConstraint = null;
  const constrainOrders = (ids) => {
    const next = new Set(ids.map(String));
    orderConstraint = orderConstraint
      ? new Set([...orderConstraint].filter((id) => next.has(id)))
      : next;
  };
  if (filters.high) {
    const ids = [...context.highScrapOrderIds];
    if (!ids.length) return { empty: true, narrowed: true, steps: [] };
    if (ids.length <= 100) constrainOrders(ids);
  }
  if (filters.jobMasterId) {
    const ids = orderIdsForJobMaster(filters.jobMasterId, context);
    if (ids.length > 0 && ids.length <= 100) constrainOrders(ids);
  }
  if (orderConstraint) {
    if (!orderConstraint.size) return { empty: true, narrowed: true, steps: [] };
    steps.push(['in', 'payload->>orderId', [...orderConstraint]]);
  }
  if (filters.from) steps.push(['gte', 'payload->>date', addIsoDays(filters.from, -1)]);
  if (filters.to) steps.push(['lte', 'payload->>date', `${addIsoDays(filters.to, 1)}T23:59:59.999Z`]);
  if (filters.stage && filters.stage !== 'QC Hold') steps.push(['eq', 'payload->>stage', filters.stage]);
  if (filters.source === SCRAP_SOURCE.process) steps.push(['in', 'payload->>source', PROCESS_SOURCES]);
  if (filters.type) {
    const literal = orLiteral(filters.type);
    orGroups.push([`payload->>type.eq.${literal}`, `payload->>defectCategory.eq.${literal}`]);
  }
  const orderToken = searchToken(filters.orderId);
  if (orderToken) {
    orGroups.push(['payload->>orderId', 'payload->>jobNo', 'payload->>jobCode'].map((column) => ilikeClause(column, orderToken)));
  }
  const queryToken = searchToken(filters.q);
  if (queryToken) {
    orGroups.push(['payload->>orderId', 'payload->>jobName', 'payload->>jobNo', 'payload->>holdTagId', 'payload->>barcodeId', 'payload->>scrapReason', 'payload->>notes']
      .map((column) => ilikeClause(column, queryToken)));
  }
  if (filters.customer) {
    const literal = orLiteral(filters.customer);
    orGroups.push([`payload->>clientName.ilike.${literal}`, `payload->>customerName.ilike.${literal}`]);
  }
  const operatorToken = searchToken(filters.operator);
  if (operatorToken) {
    orGroups.push([ilikeClause('payload->>scrappedBy', operatorToken), ilikeClause('payload->>operatorName', operatorToken)]);
  }
  if (filters.material) {
    const literal = orLiteral(filters.material);
    orGroups.push(['filmType', 'substrate', 'itemName', 'category', 'itemCategory']
      .map((field) => `payload->>${field}.ilike.${literal}`));
  }
  if (filters.machine) {
    const machine = orderIdsForMachine(filters.machine, context);
    if (machine.ids.length <= 40) {
      const parts = [];
      machine.ids.forEach((id) => parts.push(`payload->>orderId.eq.${orLiteral(id)}`));
      if (machine.name) parts.push(`payload->>machineName.ilike.${orLiteral(machine.name)}`, `payload->>machine.ilike.${orLiteral(machine.name)}`);
      if (machine.id) parts.push(`payload->>machineId.eq.${orLiteral(machine.id)}`);
      if (parts.length) orGroups.push(parts);
    }
  }
  if (filters.status) {
    if (filters.status === 'In stock') {
      orGroups.push(['payload->>status.is.null', 'payload->>status.eq.', `payload->>status.ilike.${orLiteral('In stock')}`, `payload->>status.ilike.${orLiteral('In Stock')}`]);
    } else {
      orGroups.push([`payload->>status.ilike.${orLiteral(filters.status)}`]);
    }
  }
  if (orGroups.length === 1) steps.push(['or', orGroups[0].join(',')]);
  else if (orGroups.length > 1) {
    const nested = orGroups.map((group) => (group.length === 1 ? group[0] : `or(${group.join(',')})`));
    steps.push(['or', `and(${nested.join(',')})`]);
  }
  return { empty: false, narrowed: steps.length > 0, steps };
}

export function applyScrapServerPlan(query, plan) {
  let next = query;
  (plan?.steps || []).forEach(([method, column, value]) => {
    if (method === 'or') next = next.or(column);
    else if (method === 'in') next = next.in(column, value);
    else next = next[method](column, value);
  });
  return next;
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function scrapStoreCsv(rows) {
  const headers = [
    'Date',
    'Order No',
    'Job No',
    'Job Name',
    'Customer',
    'Job Master',
    'Stage',
    'Wastage Type',
    'Source',
    'Material',
    'Micron',
    'Width (mm)',
    'Scrap Kg',
    'Machine',
    'Recorded By',
    'Status',
    'Barcode',
    'Notes',
    'High Scrap'
  ];
  const lines = [headers.join(',')];
  (rows || []).forEach((row) => {
    const kg = Number(row.scrapQtyKg);
    lines.push([
      row.entryDate || row.date || '',
      row.orderId || '',
      row.jobNo || row.jobCode || '',
      row.jobName || '',
      row.customer || row.clientName || '',
      row.jobMasterName || '',
      row.stageLabel || '',
      row.typeLabel || '',
      row.sourceLabel || '',
      row.materialLabel || row.filmType || '',
      row.micron ?? '',
      row.widthMm ?? '',
      Number.isFinite(kg) ? kg.toFixed(2) : '',
      row.machineLabel || '',
      row.operatorLabel || row.scrappedBy || '',
      row.statusLabel || '',
      row.barcode || row.holdTagId || '',
      row.notes || row.scrapReason || '',
      row.highScrap ? 'Yes' : 'No'
    ].map(csvCell).join(','));
  });
  return `\uFEFF${lines.join('\n')}`;
}

export function downloadScrapStoreCsv(rows, now = new Date()) {
  const csv = scrapStoreCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `Scrap_Store_${isoDate(istDateParts(now))}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function scrapStoreE2eFixture(now = new Date('2026-10-27T08:00:00+05:30')) {
  void now;
  const orders = [
    {
      id: 'ORD-2026-210',
      jobName: 'Nyra Original Outer',
      clientName: 'Nyra Foods',
      jobMasterId: 'JM-NYRA',
      machineId: 'MAC-ROTO-1',
      orderQtyKg: 400,
      filmType: 'PET'
    },
    {
      id: 'ORD-2026-211',
      jobName: 'Sonu Jaljeera',
      clientName: 'Samyak International',
      jobMasterId: 'JM-SONU',
      machineId: 'MAC-LAM-1',
      orderQtyKg: 800,
      filmType: 'METPET'
    }
  ];
  const jobMasters = [
    { id: 'JM-NYRA', jobName: 'Nyra Original Outer', skuCode: 'NYRA-OUTER' },
    { id: 'JM-SONU', jobName: 'Sonu Jaljeera', skuCode: 'SONU-JAL' }
  ];
  const machines = [
    { id: 'MAC-ROTO-1', name: 'Expert 1000 Rotogravure Press' },
    { id: 'MAC-LAM-1', name: 'Solventless Laminator' }
  ];
  const productionRecords = [
    {
      id: 'REC-210',
      orderId: 'ORD-2026-210',
      jobName: 'Nyra Original Outer',
      clientName: 'Nyra Foods',
      operatorName: 'Ravi Patel',
      dateFilled: '2026-10-20',
      printingWastageKg: 24,
      printingPlainSettingWastageKg: 8,
      machineId: 'MAC-ROTO-1'
    },
    {
      id: 'REC-211',
      orderId: 'ORD-2026-211',
      jobName: 'Sonu Jaljeera',
      clientName: 'Samyak International',
      operatorName: 'Asha Rao',
      dateFilled: '2026-10-12',
      laminateWastageKg: 6,
      machineId: 'MAC-LAM-1'
    }
  ];
  const rows = [
    {
      id: 'print-scrap:ORD-2026-210:printing-wastage',
      holdTagId: 'REC-210',
      orderId: 'ORD-2026-210',
      jobNo: 'ORD-2026-210',
      jobCode: 'ORD-2026-210',
      jobName: 'Nyra Original Outer',
      clientName: 'Nyra Foods',
      filmType: 'PET',
      micron: 12,
      widthMm: 820,
      scrapQtyKg: 24,
      type: 'Printing Wastage',
      defectCategory: 'Printing Wastage',
      stage: 'Printing',
      source: 'printing',
      productionRecordId: 'REC-210',
      scrapReason: 'Printing wastage recorded for ORD-2026-210',
      scrappedBy: 'Ravi Patel',
      date: '2026-10-20',
      timestamp: '2026-10-20T09:00:00+05:30'
    },
    {
      id: 'print-scrap:ORD-2026-210:plain-setting',
      holdTagId: 'REC-210',
      orderId: 'ORD-2026-210',
      jobNo: 'ORD-2026-210',
      jobName: 'Nyra Original Outer',
      clientName: 'Nyra Foods',
      filmType: 'PET',
      micron: 12,
      widthMm: 820,
      scrapQtyKg: 8,
      type: 'Plain Setting',
      defectCategory: 'Plain Setting',
      stage: 'Printing',
      source: 'printing',
      productionRecordId: 'REC-210',
      scrapReason: 'Plain setting recorded for ORD-2026-210',
      scrappedBy: 'Ravi Patel',
      date: '2026-10-20',
      timestamp: '2026-10-20T08:30:00+05:30'
    },
    {
      id: 'print-scrap:ORD-2026-210:trim-wastage',
      holdTagId: 'REC-210',
      orderId: 'ORD-2026-210',
      jobNo: 'ORD-2026-210',
      jobName: 'Nyra Original Outer',
      clientName: 'Nyra Foods',
      filmType: 'PET',
      micron: 12,
      widthMm: 820,
      scrapQtyKg: 3,
      type: 'Trim Wastage',
      defectCategory: 'Trim Wastage',
      stage: 'Slitting',
      source: 'slitting',
      scrapReason: 'Slit trim barcode NYRA-TRIM-210',
      scrappedBy: 'Ravi Patel',
      date: '2026-10-22',
      timestamp: '2026-10-22T16:00:00+05:30'
    },
    {
      id: 'print-scrap:ORD-2026-211:laminate-wastage',
      holdTagId: 'REC-211',
      orderId: 'ORD-2026-211',
      jobNo: 'ORD-2026-211',
      jobName: 'Sonu Jaljeera',
      clientName: 'Samyak International',
      filmType: 'METPET',
      micron: 12,
      widthMm: 700,
      scrapQtyKg: 6,
      type: 'Laminate Wastage',
      defectCategory: 'Laminate Wastage',
      stage: 'Lamination',
      source: 'lamination',
      productionRecordId: 'REC-211',
      scrapReason: 'Laminate wastage for Sonu Jaljeera',
      scrappedBy: 'Asha Rao',
      date: '2026-10-12',
      timestamp: '2026-10-12T11:00:00+05:30'
    },
    {
      id: 'SCRAP-ITEM-QC-211',
      holdTagId: 'QC-HOLD-211',
      orderId: 'ORD-2026-211',
      jobCode: 'SONU-JAL',
      jobName: 'Sonu Jaljeera',
      clientName: 'Samyak International',
      filmType: 'METPET',
      micron: 12,
      widthMm: 700,
      scrapQtyKg: 5,
      defectCategory: 'Delamination / Bonding Failure',
      scrapReason: 'QC hold wrinkle on barcode QC-HOLD-211',
      scrappedBy: 'QC Inspector',
      date: '2026-10-05',
      timestamp: '2026-10-05T14:00:00+05:30'
    },
    {
      id: 'print-scrap:ORD-2026-199:film-trimming',
      holdTagId: 'OLD-199',
      orderId: 'ORD-2026-199',
      jobNo: 'ORD-2026-199',
      jobName: 'Archive Tea Pouch',
      clientName: 'Old Client',
      filmType: 'BOPP',
      micron: 20,
      widthMm: 500,
      scrapQtyKg: 2,
      type: 'Film Trimming Wastage',
      defectCategory: 'Film Trimming Wastage',
      stage: 'Printing',
      source: 'printing',
      scrapReason: 'Sold off after last month trim',
      scrappedBy: 'Store Keeper',
      status: 'Disposed',
      date: '2026-09-18',
      timestamp: '2026-09-18T10:00:00+05:30'
    }
  ];
  return { orders, jobMasters, machines, productionRecords, rows };
}

export function readE2eScrapStorePreview() {
  const stub = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_E2E_STUB_AUTH === '1';
  if (!stub || typeof window === 'undefined') return null;
  try {
    if (new URLSearchParams(window.location.search).get('e2e') !== 'scrap-store') return null;
  } catch {
    return null;
  }
  return scrapStoreE2eFixture();
}
