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

function packingLine(item, index) {
  const tare = finiteNumber(item?.tareWeightKg, item?.coreWeightKg);
  const net = finiteNumber(item?.netWeightKg);
  const grossDirect = finiteNumber(item?.grossWeightKg);
  const gross = grossDirect != null
    ? grossDirect
    : (net != null && tare != null ? Math.round((net + tare) * 10) / 10 : null);
  const unit = printableText(item?.unit) || 'Kg';
  return {
    key: `${printableText(item?.barcodeId) || printableText(item?.rollNo) || 'roll'}-${index}`,
    rollNo: printableText(item?.rollNo) || String(index + 1),
    barcode: printableText(item?.barcodeId),
    substrate: printableText(item?.substrateSpec || item?.structure, [...SUBSTRATE_FILLERS]),
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

export function buildPackingListPrintModel(shipment) {
  const source = shipment && typeof shipment === 'object' ? shipment : {};
  const items = Array.isArray(source.items) ? source.items : [];
  const lines = items.map(packingLine);
  const netFromLines = sumKnown(lines.map((line) => line.net));
  const grossFromLines = sumKnown(lines.map((line) => line.gross));
  return {
    docNo: printableText(source.dispatchId || source.id),
    when: formatPlantDateTime(source.dispatchDate || source.createdAt || ''),
    jobName: printableText(source.jobName, [...JOB_FILLERS]),
    customer: {
      name: printableText(source.clientName || source.customerName),
      address: printableText(source.clientAddress || source.customerAddress || source.address),
      gstin: printableText(source.clientGstin || source.customerGstin),
      orderId: printableText(source.orderId),
      poNo: printableText(source.poNo || source.customerPoNo),
    },
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
