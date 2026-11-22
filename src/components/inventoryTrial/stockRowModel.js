import { displayItemName } from '../../services/inventoryIdentity.js';
import { isInventoryItemActive } from '../../services/inventoryArchive.js';
import { fifosForItemIds, openBarcodeIsOverAged } from '../../utils/barcodeFifo.js';

export function stockItemIds(item) {
  const ids = item?.allInventoryIds?.length ? item.allInventoryIds : [item?.id];
  return [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
}

/**
 * Display fields for one stock-register row. The quantities use the same
 * expressions as the current table. formatFilmItemName is passed in so this
 * file does not load the Supabase client.
 */
export function presentStockRow(item, {
  formatFilmItemName,
  reservedKg = 0,
  pendingQcQty = 0,
  inventoryRolls,
  rollFifoIndex,
  ageingSettings,
  selectedIds,
} = {}) {
  if (!item) return null;
  const isLow = (item.availableQtyKg ?? 0) <= (item.reorderLevelKg ?? 100);
  const isFilm = (item.category || 'Film Substrates') === 'Film Substrates';
  const title = (isFilm && !item.preserveItemName)
    ? formatFilmItemName(item.filmType, item.widthMm, item.micron, displayItemName(item.itemName))
    : (item.itemName ? displayItemName(item.itemName) : (item.category || item.filmType || 'Stock Item'));
  const unitStr = item.unit || 'kg';
  const rate = parseFloat(item.unitPrice || item.purchaseRatePerKg) || 0;
  const availQty = parseFloat(item.availableQtyKg) || 0;
  const itemValuation = availQty * rate;
  const subGrade = item.substrateOrGrade || item.substrateGrade || item.filmType || item.grade || item.subType || '-';
  const barcodeFifos = fifosForItemIds(item.allInventoryIds || [item.id], inventoryRolls, rollFifoIndex);
  const isOverAged = barcodeFifos.some(({ roll, fifo }) => openBarcodeIsOverAged(fifo, item.category || roll.category, ageingSettings));
  const allocatedForOrders = Number(reservedKg) || 0;
  const effectiveAllocated = Number(((item.allocatedQtyKg || 0) + allocatedForOrders).toFixed(2));
  const usableFreeStock = Math.max(0, Number(((item.availableQtyKg || 0) - allocatedForOrders).toFixed(2)));
  const rowIds = stockItemIds(item);
  const selected = selectedIds || new Set();
  const rowSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const rowArchived = (item.subItems || [item]).every((sub) => !isInventoryItemActive(sub));
  const pending = Number(pendingQcQty) || 0;
  let status = 'IN STOCK';
  if (availQty === 0 && pending > 0) status = 'GRN Inward (Pending QC)';
  else if (isLow) status = 'LOW STOCK';
  const specs = isFilm
    ? `${item.micron} Micron × ${item.widthMm}mm`
    : (item.widthMm && item.widthMm !== '-' ? `${item.widthMm}mm` : '-');
  const freeStockColor = (usableFreeStock ?? 0) === 0
    ? (availQty === 0 && pending > 0 ? '#d97706' : '#ef4444')
    : (isLow ? '#d97706' : '#047857');

  return {
    id: item.id,
    title,
    itemCode: item.itemCode || '',
    primaryId: item.primaryId || item.id,
    extraLots: item.subItems && item.subItems.length > 1 ? item.subItems.length - 1 : 0,
    category: item.category || 'Film Substrates',
    subGrade,
    specs,
    unitStr,
    usableFreeStock,
    onHand: item.availableQtyKg ?? 0,
    allocatedForOrders,
    pendingQcQty: pending,
    rate,
    itemValuation,
    effectiveAllocated,
    location: item.location,
    lastVendor: item.lastVendor,
    lastBatch: item.lastBatch,
    isLow,
    isOverAged,
    rowArchived,
    rowIds,
    rowSelected,
    availQty,
    status,
    freeStockColor,
  };
}
