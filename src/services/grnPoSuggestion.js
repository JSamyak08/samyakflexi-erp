/**
 * Purchase-order suggestions for a new goods receipt.
 * Picking a vendor never fills the form. The receipt stays blank until
 * the user confirms a PO, and clearing that PO drops only the fields it wrote.
 */

import { findInventoryItemById } from './inventoryIdentity.js';
import { isInventoryItemActive } from './inventoryArchive.js';

export function planVendorPick(matchingPoNumbers) {
  const suggestedPoNumbers = (matchingPoNumbers || []).filter(Boolean);
  return {
    fillForm: false,
    suggestedPoNumbers
  };
}

export function planPoSelection(selectedPoNumber) {
  if (selectedPoNumber === '__MANUAL__') {
    return { action: 'manual', fillForm: false, clearAppliedFields: true, poNumber: '' };
  }
  if (!selectedPoNumber) {
    return { action: 'clear', fillForm: false, clearAppliedFields: true, poNumber: '' };
  }
  return {
    action: 'confirm',
    fillForm: true,
    clearAppliedFields: true,
    poNumber: String(selectedPoNumber)
  };
}

export function blankPoFilledGrnFields() {
  return {
    poNumber: '',
    category: '',
    purchaseRate: '',
    filmType: 'PET',
    micron: '',
    widthMm: '',
    itemName: '',
    itemSearchTerm: '',
    stockItemId: '',
    weightKg: ''
  };
}

function qtyLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function describePoForSuggestion(po, deliveryInfo = {}) {
  const items = Array.isArray(po?.items) ? po.items : [];
  const first = items[0] || {};
  const itemsSummary = items
    .map((item) => item.itemDesc || item.description || item.itemName || item.filmType || 'Item')
    .filter(Boolean)
    .join(', ') || 'Item not specified';
  const totalQty = Number(deliveryInfo.totalQty ?? po?.totalPoQty ?? first.qtyKg ?? first.qty ?? 0) || 0;
  const pendingQty = Number(deliveryInfo.pendingQty ?? totalQty) || 0;
  const inwardQty = Number(deliveryInfo.inwardQty) || 0;
  const status = deliveryInfo.status || 'Awaiting Delivery';
  const rateNumber = first.rate === '' || first.rate === undefined || first.rate === null
    ? null
    : Number(first.rate);
  const rateText = rateNumber == null || Number.isNaN(rateNumber)
    ? ''
    : `₹${rateNumber.toLocaleString('en-IN')} / kg`;
  const promised = po?.promisedDeliveryDate ? String(po.promisedDeliveryDate) : '';

  return {
    poNumber: po?.poNumber || '',
    category: po?.category || 'Raw Material',
    itemsSummary,
    itemCount: items.length,
    statusText: status === 'Partially Received'
      ? `Partly received, ${qtyLabel(inwardQty)} of ${qtyLabel(totalQty)} kg in`
      : `Awaiting delivery, ${qtyLabel(totalQty)} kg`,
    qtyText: `${qtyLabel(pendingQty)} kg still to receive`,
    rateText,
    promisedText: promised ? `Promised ${promised}` : ''
  };
}

export function filmStockIdForPoItem(inventory, item) {
  if (!item) return '';
  const explicit = String(item.itemId || item.stockItemId || '').trim();
  if (explicit) {
    const picked = findInventoryItemById(inventory, explicit);
    if (picked && isInventoryItemActive(picked)) return String(picked.id || picked.itemCode || '');
    return '';
  }
  const filmType = String(item.filmType || '').trim().toUpperCase();
  const micron = item.micron;
  const width = item.widthMm;
  if (!filmType || micron === '' || micron === null || micron === undefined || width === '' || width === null || width === undefined) {
    return '';
  }
  const matches = (inventory || []).filter((row) => {
    if (!isInventoryItemActive(row)) return false;
    if (String(row.category || '').toLowerCase() !== 'film substrates') return false;
    if (String(row.filmType || '').trim().toUpperCase() !== filmType) return false;
    if (String(row.micron) !== String(micron)) return false;
    if (String(row.widthMm) !== String(width)) return false;
    return true;
  });
  if (matches.length !== 1) return '';
  return String(matches[0].id || matches[0].itemCode || '');
}

function present(value) {
  return value !== undefined && value !== null && value !== '' && value !== '-';
}

export function grnFieldsFromPo(po, { pendingQty = 0, filmStockId = '', formatFilmItemName } = {}) {
  const blank = blankPoFilledGrnFields();
  if (!po) return blank;

  const firstItem = (po.items || [])[0];
  const category = po.category || '';
  if (!firstItem) {
    return { ...blank, poNumber: po.poNumber || '', category };
  }

  const activeCat = category || 'Film Substrates';
  const isFilm = activeCat === 'Film Substrates' || Boolean(firstItem.filmType);
  const nameFilm = typeof formatFilmItemName === 'function'
    ? formatFilmItemName
    : (filmType, widthMm, micron) => [filmType || 'PET', micron ? `${micron}µ` : '', widthMm ? `${widthMm}mm` : ''].filter(Boolean).join(' ');

  let filmType = blank.filmType;
  let micron = '';
  let widthMm = '';
  let itemName = '';
  let stockItemId = '';

  if (isFilm) {
    filmType = firstItem.filmType || 'PET';
    micron = present(firstItem.micron) ? firstItem.micron : '';
    widthMm = present(firstItem.widthMm) ? firstItem.widthMm : '';
    itemName = nameFilm(firstItem.filmType || 'PET', firstItem.widthMm || 1000, firstItem.micron || 12);
    const lineId = String(firstItem.itemId || firstItem.stockItemId || '').trim();
    stockItemId = lineId || filmStockId || '';
  } else {
    itemName = firstItem.itemDesc || firstItem.description || firstItem.itemName || '';
    stockItemId = firstItem.itemId || firstItem.stockItemId || '';
  }

  const qty = Number(pendingQty) || Number(firstItem.qtyKg) || Number(firstItem.qty) || 0;
  const rate = firstItem.rate === '' || firstItem.rate === undefined || firstItem.rate === null
    ? ''
    : firstItem.rate;

  return {
    poNumber: po.poNumber || '',
    category,
    purchaseRate: rate,
    filmType,
    micron,
    widthMm,
    itemName,
    itemSearchTerm: itemName,
    stockItemId,
    weightKg: qty > 0 ? qty : ''
  };
}
