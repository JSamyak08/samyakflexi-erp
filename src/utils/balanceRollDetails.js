/**
 * Identity a leftover `-BAL` roll keeps from the roll it was split from.
 * The sticker barcode stays the `-BAL` code. FIFO age is not decided here:
 * this module never copies the parent's inward time onto the leftover's own
 * inward, production date, or origin fields.
 */

import { displayItemName } from '../services/inventoryIdentity.js';

function text(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '-' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'undefined') return '';
  return raw;
}

function finite(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value) {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

function metaOf(record) {
  const meta = record?.metadata;
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
}

export function barcodeOf(record) {
  return text(record?.barcodeId || record?.barcode || record?.sfgBatchCode || record?.id);
}

export function isBalanceSticker(record) {
  const code = barcodeOf(record);
  if (/-BAL$/i.test(code)) return true;
  if (record?.balanceRoll === true || record?.kind === 'balance') return true;
  return false;
}

/** One `-BAL` suffix. `RM-1-BAL-BAL` is the child of `RM-1-BAL`. */
export function immediateParentCode(record) {
  const explicit = text(
    record?.parentBarcodeId
    || record?.parentBarcode
    || metaOf(record).parentBarcodeId
    || metaOf(record).parentBarcode
  );
  if (explicit) return explicit;
  const code = barcodeOf(record);
  if (/-BAL$/i.test(code)) return code.slice(0, -4);
  return '';
}

export function isPlaceholderItemName(name) {
  const value = displayItemName(name);
  if (!value) return true;
  if (/remaining balance roll/i.test(value)) return true;
  if (/balance roll$/i.test(value)) return true;
  return false;
}

function rollKey(record) {
  return barcodeOf(record).toLowerCase();
}

function findRoll(code, rolls) {
  const key = text(code).toLowerCase();
  if (!key) return null;
  return (rolls || []).find((roll) => roll && rollKey(roll) === key) || null;
}

function findStock(itemId, inventory) {
  const key = text(itemId);
  if (!key) return null;
  return (inventory || []).find((item) => (
    text(item?.id) === key || text(item?.itemCode) === key
  )) || null;
}

/**
 * Walk parent links to the inward roll. A chain of leftovers stops at the
 * first roll that is not itself a balance, or after eight steps.
 */
export function rootRoll(record, rolls) {
  let current = record;
  const seen = new Set();
  for (let step = 0; step < 8; step += 1) {
    const code = barcodeOf(current);
    const key = code.toLowerCase();
    if (key && seen.has(key)) break;
    if (key) seen.add(key);
    const parentCode = immediateParentCode(current);
    const parent = findRoll(parentCode, rolls);
    if (!parent || parent === current) break;
    current = parent;
    if (!isBalanceSticker(parent)) break;
  }
  return current && current !== record ? current : null;
}

function nameFrom(record) {
  const value = displayItemName(record?.itemName || record?.item_name || '');
  return isPlaceholderItemName(value) ? '' : value;
}

function rateFrom(record) {
  return positive(
    record?.purchaseRatePerKg
    ?? record?.purchaseRate
    ?? record?.unitPrice
    ?? record?.ratePerKg
    ?? metaOf(record).purchaseRatePerKg
    ?? metaOf(record).unitPrice
    ?? metaOf(record).purchaseRate
  );
}

function originalNetFrom(record) {
  return positive(record?.originalNetWeightKg ?? record?.parentNetWeightKg ?? metaOf(record).parentNetWeightKg);
}

function grnFrom(record) {
  return text(record?.grnNo || record?.grn_no || metaOf(record).grnNo || metaOf(record).grn_no);
}

function inwardFrom(record) {
  return text(
    record?.parentInwardDatetime
    || metaOf(record).parentInwardDatetime
    || record?.inwardDatetime
    || record?.inward_datetime
    || record?.receivedDate
    || record?.dateReceived
  );
}

/**
 * Copy parent item, size, vendor, batch, rate, GRN, and original net weight
 * onto a balance roll. A roll that is not a balance sticker is returned as-is.
 * The leftover's own inwardDatetime is never replaced.
 */
export function inheritBalanceDetails(roll, { rolls = [], inventory = [] } = {}) {
  if (!roll || typeof roll !== 'object' || !isBalanceSticker(roll)) return roll;
  const list = Array.isArray(rolls) ? rolls : [];
  const parent = findRoll(immediateParentCode(roll), list);
  const root = parent ? (rootRoll(roll, list) || parent) : null;
  const source = root || parent;
  const stock = findStock(roll.itemId || source?.itemId || parent?.itemId, inventory);
  const itemName = nameFrom(roll) || nameFrom(parent) || nameFrom(source) || nameFrom(stock) || nameFrom({ itemName: stock?.itemName });
  const vendorName = text(roll.vendorName || roll.supplier || roll.partyName)
    || text(source?.vendorName || source?.supplier || parent?.vendorName || parent?.supplier)
    || text(stock?.lastVendor || stock?.vendorName);
  const batchNo = text(roll.batchNo || roll.heatNo || roll.batch)
    || text(source?.batchNo || source?.heatNo || source?.batch || parent?.batchNo || parent?.heatNo)
    || text(stock?.lastBatch || stock?.batchNo);
  const micron = positive(roll.micron) ?? positive(source?.micron) ?? positive(parent?.micron) ?? positive(stock?.micron);
  const widthMm = positive(roll.widthMm) ?? positive(source?.widthMm) ?? positive(parent?.widthMm) ?? positive(stock?.widthMm);
  const rate = rateFrom(roll) ?? rateFrom(source) ?? rateFrom(parent) ?? rateFrom(stock);
  const grnNo = grnFrom(roll) || grnFrom(source) || grnFrom(parent);
  const originalNet = originalNetFrom(roll)
    ?? (source && !isBalanceSticker(source) ? positive(source.netWeightKg ?? source.availableWeightKg) : null)
    ?? (parent && !isBalanceSticker(parent) ? positive(parent.netWeightKg ?? parent.availableWeightKg) : null);
  const parentInward = text(roll.parentInwardDatetime || metaOf(roll).parentInwardDatetime)
    || (source && !isBalanceSticker(source) ? text(source.inwardDatetime || source.inward_datetime || source.receivedDate) : '')
    || (parent && !isBalanceSticker(parent) ? text(parent.inwardDatetime || parent.inward_datetime || parent.receivedDate) : '');
  const parentBarcodeId = text(parent?.barcodeId || parent?.id) || immediateParentCode(roll);

  return {
    ...roll,
    balanceRoll: true,
    parentBarcodeId,
    itemName: itemName || displayItemName(roll.itemName || ''),
    itemId: text(roll.itemId) || text(parent?.itemId) || text(source?.itemId) || text(stock?.id),
    filmType: text(roll.filmType) || text(source?.filmType) || text(parent?.filmType) || text(stock?.filmType),
    vendorName,
    supplier: roll.supplier || vendorName,
    batchNo,
    heatNo: text(roll.heatNo) || batchNo,
    micron: micron ?? roll.micron ?? null,
    widthMm: widthMm ?? roll.widthMm ?? null,
    purchaseRatePerKg: rate ?? roll.purchaseRatePerKg,
    unitPrice: rate ?? roll.unitPrice,
    grnNo,
    invoiceNo: text(roll.invoiceNo) || text(source?.invoiceNo) || text(parent?.invoiceNo),
    vendorRollNo: text(roll.vendorRollNo) || text(source?.vendorRollNo) || text(parent?.vendorRollNo),
    originalNetWeightKg: originalNet ?? undefined,
    parentNetWeightKg: originalNet ?? roll.parentNetWeightKg,
    parentInwardDatetime: parentInward
  };
}

export function balanceOriginView(record) {
  if (!isBalanceSticker(record)) return null;
  const itemName = nameFrom(record);
  return {
    parentBarcode: immediateParentCode(record),
    itemName,
    micron: positive(record?.micron),
    widthMm: positive(record?.widthMm),
    grnNo: grnFrom(record),
    grnDate: text(record?.parentInwardDatetime || metaOf(record).parentInwardDatetime),
    originalNetKg: originalNetFrom(record),
    vendor: text(record?.vendorName || record?.supplier || record?.partyName),
    batch: text(record?.batchNo || record?.heatNo || record?.batch),
    rate: rateFrom(record)
  };
}
