import { formatPlantDateTime } from './dbDates.js';

const EMPTY_MARKS = new Set([
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'tbd',
  'xxx',
  '-',
  '—',
  '–',
]);

const SUBSTRATE_FILLERS = new Set([
  'flexible laminate',
  'laminated film',
  'laminated film / pouch',
]);

const JOB_FILLERS = new Set([
  'finished goods job',
]);

const SCALE_FILLERS = new Set([
  'dispatch main dock',
]);

function normalized(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Blank when the packing list has no real value.
 * Known stand-ins written by the dispatch form (N/A, Flexible Laminate, …)
 * are treated as empty so the PDF does not print them.
 */
export function printableText(value, fillers = []) {
  const text = normalized(value);
  if (!text) return '';
  const key = text.toLowerCase();
  if (EMPTY_MARKS.has(key)) return '';
  if (fillers.some((filler) => filler === key)) return '';
  return text;
}

export function finiteNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function formatPackingKg(value) {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return Number(value).toFixed(1);
}

function sumKnown(values) {
  const numbers = values.filter((value) => value != null && Number.isFinite(value));
  if (!numbers.length) return null;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) * 10) / 10;
}

function exactText(value) {
  return String(value ?? '').trim();
}

function exactKey(value) {
  return exactText(value).toLowerCase();
}

function realSubstrate(...values) {
  for (const value of values) {
    const text = printableText(value, [...SUBSTRATE_FILLERS]);
    if (text) return text;
  }
  return '';
}

/**
 * # column on the packing list screen and on the PDF.
 * Row order, starting at 1. Deleting a roll does not leave a gap.
 */
export function displayRollNumber(index) {
  const number = Number(index);
  if (!Number.isInteger(number) || number < 0) return '';
  return number + 1;
}

const GENERATED_BARCODE = /^FG-DISP-(\d+)-(\d+)$/i;

/**
 * Suffix already used on this row.
 * Generated barcodes are FG-DISP-<stamp>-<suffix>. An FG batch code used as
 * the barcode is not a suffix. rollNo stores the suffix that was issued,
 * including when the barcode is a batch code. String roll numbers count.
 */
export function packingBarcodeSuffix(roll) {
  const rollNo = Number(roll?.rollNo);
  const fromRoll = Number.isInteger(rollNo) && rollNo > 0 ? rollNo : null;
  const match = GENERATED_BARCODE.exec(exactText(roll?.barcodeId));
  const fromBarcode = match ? Number(match[2]) : null;
  const values = [fromRoll, fromBarcode].filter((value) => value != null);
  if (!values.length) return null;
  return Math.max(...values);
}

/** Highest suffix still on this packing list, plus one. An empty list starts at 1. */
export function nextBarcodeSuffix(rolls) {
  const list = Array.isArray(rolls) ? rolls : [];
  const highest = list.reduce((max, roll) => {
    const suffix = packingBarcodeSuffix(roll);
    return suffix != null && suffix > max ? suffix : max;
  }, 0);
  return highest + 1;
}

export function matchPackingOrder(orders, { orderId, jobName } = {}) {
  const list = Array.isArray(orders) ? orders : [];
  const id = exactText(orderId);
  if (id && exactKey(id) !== 'n/a') {
    const byId = list.find((order) => order && String(order.id) === id);
    if (byId) return byId;
  }
  const name = exactText(jobName);
  if (!name) return null;
  return list.find((order) => order && exactText(order.jobName) === name) || null;
}

export function matchJobMaster(jobMasters, { jobMasterId, jobName } = {}) {
  const list = Array.isArray(jobMasters) ? jobMasters : [];
  const id = exactText(jobMasterId);
  if (id) {
    const byId = list.find((job) => job && String(job.id) === id);
    if (byId) return byId;
  }
  const name = exactText(jobName);
  if (!name) return null;
  return list.find((job) => job && exactText(job.jobName) === name) || null;
}

/**
 * Structure the job master screen shows: layers when present, otherwise
 * the structure text. Fillers such as Flexible Laminate are not a structure.
 */
export function jobMasterStructure(jobMaster) {
  if (!jobMaster || typeof jobMaster !== 'object') return '';
  const layers = Array.isArray(jobMaster.layers) ? jobMaster.layers : [];
  if (layers.length > 0) {
    const built = layers.map((layer) => {
      const film = exactText(layer?.filmType);
      const micron = exactText(layer?.micron);
      if (!film && !micron) return '';
      if (!micron) return film;
      if (!film) return `${micron}µ`;
      return `${film} ${micron}µ`;
    }).filter(Boolean).join(' / ');
    const fromLayers = printableText(built, [...SUBSTRATE_FILLERS]);
    if (fromLayers) return fromLayers;
  }
  return printableText(
    jobMaster.structure
      || jobMaster.filmStructure
      || jobMaster.film_structure
      || jobMaster.specification
      || jobMaster.substrateSpec,
    [...SUBSTRATE_FILLERS]
  );
}

/**
 * Substrate saved on a new packing-list roll.
 * Order (by id, then job name), then the job master's structure, then the
 * FG roll film type. Never the Flexible Laminate filler.
 */
export function resolvePackingSubstrate({ orders, jobMasters, orderId, jobName, filmType } = {}) {
  const order = matchPackingOrder(orders, { orderId, jobName });
  const fromOrder = realSubstrate(order?.structure, order?.substrateSpec, order?.jobDetails?.structure);
  if (fromOrder) return fromOrder;
  const jobMaster = matchJobMaster(jobMasters, {
    jobMasterId: order?.jobMasterId,
    jobName: jobName || order?.jobName,
  });
  const fromJob = jobMasterStructure(jobMaster);
  if (fromJob) return fromJob;
  return realSubstrate(filmType);
}

/** Keep a real saved substrate. Replace an empty or filler value before saving. */
export function substrateToStore(roll, context = {}) {
  const saved = realSubstrate(roll?.substrateSpec, roll?.structure);
  if (saved) return saved;
  return resolvePackingSubstrate({
    orders: context.orders,
    jobMasters: context.jobMasters,
    orderId: roll?.orderId || context.orderId,
    jobName: roll?.jobName || context.jobName,
    filmType: roll?.filmType || context.filmType,
  });
}

/** Printed substrate. A saved filler is replaced from the job master, not left blank. */
export function substrateForPrint(item, { jobMasters, jobName, order } = {}) {
  const saved = realSubstrate(item?.substrateSpec, item?.structure);
  if (saved) return saved;
  const jobMaster = matchJobMaster(jobMasters, {
    jobMasterId: item?.jobMasterId || order?.jobMasterId,
    jobName: item?.jobName || jobName || order?.jobName,
  });
  return jobMasterStructure(jobMaster);
}

export const CUSTOMER_NOT_AVAILABLE = 'Not Available';

function directoryValue(value) {
  return printableText(value) || CUSTOMER_NOT_AVAILABLE;
}

function clientIdFromOrder(order) {
  const details = order?.calculationDetails || order?.jobDetails?.calculationDetails;
  if (!details || typeof details !== 'object') return '';
  const nested = details.clientDetails && typeof details.clientDetails === 'object'
    ? details.clientDetails
    : null;
  return exactText(nested?.id || details.clientId || details.client_id);
}

/**
 * Client directory row for a packing list.
 * Id comes from the shipment or from the order's calculation details
 * (clientDetails.id). Otherwise the match is the exact name, ignoring case.
 */
export function matchPackingClient({ clients, shipment, order } = {}) {
  const list = Array.isArray(clients) ? clients : [];
  const id = exactText(shipment?.clientId || clientIdFromOrder(order));
  if (id) {
    const byId = list.find((client) => client && String(client.id) === id);
    if (byId) return byId;
  }
  const name = exactKey(
    shipment?.clientName
      || shipment?.customerName
      || order?.clientName
      || order?.customerName
  );
  if (!name) return null;
  return list.find((client) => {
    if (!client) return false;
    return exactKey(client.name || client.companyName || client.clientName) === name;
  }) || null;
}

export function packingCustomerDetails(shipment, { clients, order } = {}) {
  const source = shipment && typeof shipment === 'object' ? shipment : {};
  const client = matchPackingClient({ clients, shipment: source, order });
  return {
    name: printableText(client?.name || source.clientName || source.customerName),
    address: directoryValue(client?.address),
    email: directoryValue(client?.email),
    mobile: directoryValue(client?.phone),
    gstin: directoryValue(client?.gstin),
    orderId: printableText(source.orderId),
    poNo: printableText(source.poNo || source.customerPoNo),
  };
}

function packingLine(item, index, context = {}) {
  const tare = finiteNumber(item?.tareWeightKg, item?.coreWeightKg);
  const net = finiteNumber(item?.netWeightKg);
  const grossDirect = finiteNumber(item?.grossWeightKg);
  const gross = grossDirect != null
    ? grossDirect
    : (net != null && tare != null ? Math.round((net + tare) * 10) / 10 : null);
  const unit = printableText(item?.unit) || 'Kg';
  return {
    key: `${printableText(item?.barcodeId) || 'roll'}-${index}`,
    rollNo: String(displayRollNumber(index)),
    barcode: printableText(item?.barcodeId),
    substrate: substrateForPrint(item, context),
    tare,
    coreSize: printableText(item?.coreSize),
    gross,
    net,
    unit,
  };
}

export function printableScale(shipment) {
  return printableText(
    shipment?.weighingScaleStation
      || shipment?.weighingScale
      || shipment?.scaleStation
      || shipment?.scaleName,
    [...SCALE_FILLERS]
  );
}

export function buildPackingListPrintModel(shipment, context = {}) {
  const source = shipment && typeof shipment === 'object' ? shipment : {};
  const items = Array.isArray(source.items) ? source.items : [];
  const order = matchPackingOrder(context.orders, { orderId: source.orderId, jobName: source.jobName });
  const lineContext = {
    jobMasters: context.jobMasters,
    jobName: source.jobName,
    order,
  };
  const lines = items.map((item, index) => packingLine(item, index, lineContext));
  const netFromLines = sumKnown(lines.map((line) => line.net));
  const grossFromLines = sumKnown(lines.map((line) => line.gross));
  return {
    docNo: printableText(source.dispatchId || source.id),
    when: formatPlantDateTime(source.dispatchDate || source.createdAt || ''),
    jobName: printableText(source.jobName, [...JOB_FILLERS]),
    customer: packingCustomerDetails(source, { clients: context.clients, order }),
    logistics: {
      invoice: printableText(source.invoiceNo),
      vehicle: printableText(source.vehicleNo),
      lr: printableText(source.lrNo),
      transporter: printableText(source.transporterName),
      scale: printableScale(source),
    },
    lines,
    rollCount: Array.isArray(source.items)
      ? lines.length
      : (finiteNumber(source.totalRolls) ?? lines.length),
    totals: {
      tare: sumKnown(lines.map((line) => line.tare)),
      gross: grossFromLines != null ? grossFromLines : finiteNumber(source.totalGrossWeightKg),
      net: netFromLines != null ? netFromLines : finiteNumber(source.totalNetWeightKg),
    },
  };
}
