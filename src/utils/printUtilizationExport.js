/**
 * Excel and PDF downloads for print run and idle time.
 * The file contains every segment in the selected view, not the page on screen.
 */
import * as XLSX from 'xlsx';
import { formatDurationMinutes, formatIstStamp } from './printingShifts.js';
import { buildSimplePdf } from './simplePdf.js';

export const PRINT_UTILIZATION_SHEET = 'Runs and gaps';
export const PRINT_UTILIZATION_SUMMARY_SHEET = 'Summary';

export const PRINT_UTILIZATION_HEADERS = [
  'Machine',
  'Kind',
  'Shift',
  'Job / gap',
  'Order',
  'Operator',
  'Start (IST)',
  'End (IST)',
  'Duration (minutes)',
  'Duration'
];

function roundMinutes(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

export function printUtilizationFileBase({ mode = 'daily', fromDate = '', toDate = '' } = {}) {
  const view = String(mode || 'daily').toLowerCase();
  const from = fromDate || 'range';
  const to = toDate && toDate !== fromDate ? `_to_${toDate}` : '';
  return `Print_Run_Idle_${view}_${from}${to}`;
}

function segmentRow(segment) {
  return {
    Machine: segment.machineLabel || '',
    Kind: segment.kind === 'idle' ? 'Idle' : 'Run',
    Shift: segment.shiftName || '',
    'Job / gap': segment.jobName || '',
    Order: segment.orderId || '',
    Operator: segment.operatorName || '',
    'Start (IST)': formatIstStamp(segment.start),
    'End (IST)': formatIstStamp(segment.end),
    'Duration (minutes)': roundMinutes(segment.durationMinutes),
    Duration: formatDurationMinutes(segment.durationMinutes)
  };
}

export function buildPrintUtilizationSheet(report) {
  const rows = (report?.segments || []).map(segmentRow);
  return [
    PRINT_UTILIZATION_HEADERS,
    ...rows.map((row) => PRINT_UTILIZATION_HEADERS.map((header) => row[header] ?? ''))
  ];
}

export function buildPrintUtilizationSummary(report, meta = {}) {
  const longest = report?.longestIdle;
  return [
    ['View', meta.label || meta.mode || ''],
    ['From (IST)', meta.fromDate || ''],
    ['To (IST)', meta.toDate || ''],
    ['Run minutes', roundMinutes(report?.runMinutes)],
    ['Idle minutes', roundMinutes(report?.idleMinutes)],
    ['Run %', report?.runPercent ?? 0],
    ['Idle %', report?.idlePercent ?? 0],
    ['Runs', report?.runCount ?? 0],
    ['Idle gaps', report?.gapCount ?? 0],
    ['Longest idle (minutes)', longest ? roundMinutes(longest.durationMinutes) : 0],
    ['Longest idle machine', longest?.machineLabel || ''],
    ['Longest idle after', longest ? `${longest.afterJob} (${longest.afterOrderId})` : ''],
    ['Longest idle before', longest ? `${longest.beforeJob} (${longest.beforeOrderId})` : ''],
    ['Longest idle start (IST)', longest ? formatIstStamp(longest.start) : ''],
    ['Longest idle end (IST)', longest ? formatIstStamp(longest.end) : ''],
    ['Rows', (report?.segments || []).length]
  ];
}

export function buildPrintUtilizationWorkbook(report, meta = {}) {
  const summary = XLSX.utils.aoa_to_sheet(buildPrintUtilizationSummary(report, meta));
  const sheet = XLSX.utils.aoa_to_sheet(buildPrintUtilizationSheet(report));
  sheet['!cols'] = PRINT_UTILIZATION_HEADERS.map((header) => ({ wch: Math.max(header.length + 2, 18) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summary, PRINT_UTILIZATION_SUMMARY_SHEET);
  XLSX.utils.book_append_sheet(workbook, sheet, PRINT_UTILIZATION_SHEET);
  return workbook;
}

export function downloadPrintUtilizationWorkbook(report, meta = {}) {
  const filename = `${printUtilizationFileBase(meta)}.xlsx`;
  const workbook = buildPrintUtilizationWorkbook(report, meta);
  XLSX.writeFile(workbook, filename);
  return filename;
}

export function printUtilizationPdfLines(report, meta = {}) {
  const longest = report?.longestIdle;
  const lines = [
    `View: ${meta.label || meta.mode || ''}`,
    `Range (IST): ${meta.fromDate || ''} to ${meta.toDate || ''}`,
    `Run: ${formatDurationMinutes(report?.runMinutes)} (${report?.runPercent ?? 0}%)`,
    `Idle: ${formatDurationMinutes(report?.idleMinutes)} (${report?.idlePercent ?? 0}%)`,
    `Runs: ${report?.runCount ?? 0}    Idle gaps: ${report?.gapCount ?? 0}`,
    longest
      ? `Longest idle: ${formatDurationMinutes(longest.durationMinutes)} on ${longest.machineLabel} after ${longest.afterJob} (${longest.afterOrderId}) before ${longest.beforeJob} (${longest.beforeOrderId})`
      : 'Longest idle: none',
    'Idle is the gap from the end of one run to the start of the next run on the same machine.',
    ''
  ];
  (report?.segments || []).forEach((segment, index) => {
    lines.push(
      `${index + 1}. ${segment.kind === 'idle' ? 'Idle' : 'Run'} | ${segment.shiftName} | ${segment.machineLabel} | ${segment.jobName} | ${segment.orderId} | ${segment.operatorName || '-'} | ${formatIstStamp(segment.start)} -> ${formatIstStamp(segment.end)} | ${formatDurationMinutes(segment.durationMinutes)}`
    );
  });
  if (!(report?.segments || []).length) lines.push('No runs or idle gaps in this range.');
  return lines;
}

export function buildPrintUtilizationPdf(report, meta = {}) {
  return buildSimplePdf(printUtilizationPdfLines(report, meta), {
    title: `Printing machine run and idle — ${meta.label || meta.mode || 'report'}`
  });
}

export function downloadPrintUtilizationPdf(report, meta = {}) {
  const filename = `${printUtilizationFileBase(meta)}.pdf`;
  const bytes = buildPrintUtilizationPdf(report, meta);
  if (typeof document !== 'undefined') {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  return { filename, bytes };
}
