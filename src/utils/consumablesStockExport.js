/**
 * Excel export for the consumables stock store.
 * Rows are the filtered list the screen already sorted. The file is every
 * matching row, not the page on screen.
 */

import * as XLSX from 'xlsx';
import { formatPlantDate } from './dbDates.js';

export const CONSUMABLES_STOCK_SHEET = 'Consumables Stock';

export const CONSUMABLES_STOCK_HEADERS = [
  'Item Code',
  'Item Description',
  'Category',
  'Unit',
  'Current Stock',
  'Min Reserve Level',
  'Status',
  'Assigned Machine',
  'Location Bin',
  'Last Restocked',
];

const NUMBER_HEADERS = new Set(['Current Stock', 'Min Reserve Level']);

function stockNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value) {
  return String(value ?? '').trim();
}

/**
 * Same status wording as the stock table. Healthy rows include the reserve
 * percentage shown on the badge. Quantities stay numbers.
 */
export function mapConsumableStockRow(item) {
  const currentStock = stockNumber(item?.currentStock);
  const minReserve = stockNumber(item?.minReserve);
  let status = '';
  if (currentStock != null && minReserve != null) {
    if (currentStock <= minReserve) {
      status = 'Below Reserve (Reorder Needed)';
    } else {
      const ratio = (currentStock / (minReserve || 1)) * 100;
      status = `Stock Healthy (${Math.round(ratio)}%)`;
    }
  }
  return {
    'Item Code': text(item?.itemCode),
    'Item Description': text(item?.name),
    'Category': text(item?.category),
    'Unit': text(item?.unit),
    'Current Stock': currentStock,
    'Min Reserve Level': minReserve,
    Status: status,
    'Assigned Machine': text(item?.assignedMachine),
    'Location Bin': text(item?.location),
    'Last Restocked': formatPlantDate(item?.lastRestocked),
  };
}

export function consumablesStockFileName(today = new Date()) {
  const date = today instanceof Date ? today : new Date(today);
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(Number.isNaN(date.getTime()) ? new Date() : date);
  return `Consumables_Stock_${day}.xlsx`;
}

export function buildConsumablesStockSheet(items) {
  const rows = (items || []).filter(Boolean).map(mapConsumableStockRow);
  return [CONSUMABLES_STOCK_HEADERS, ...rows.map((row) => CONSUMABLES_STOCK_HEADERS.map((header) => {
    const value = row[header];
    return value == null ? '' : value;
  }))];
}

export function buildConsumablesStockWorkbook(items) {
  const sheet = XLSX.utils.aoa_to_sheet(buildConsumablesStockSheet(items));
  sheet['!cols'] = CONSUMABLES_STOCK_HEADERS.map((header) => ({
    wch: NUMBER_HEADERS.has(header) ? 18 : Math.max(header.length + 2, 16),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, CONSUMABLES_STOCK_SHEET);
  return workbook;
}

export function downloadConsumablesStockWorkbook(items, today = new Date()) {
  const filename = consumablesStockFileName(today);
  const workbook = buildConsumablesStockWorkbook(items);
  XLSX.writeFile(workbook, filename);
  return filename;
}
