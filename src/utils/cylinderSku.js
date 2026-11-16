/**
 * Cylinder SKU codes of the form SKU-CYL-515.
 *
 * New codes are issued only by the database (allocate_cylinder_sku).
 * This module does not count a maximum or build the next code.
 * SKU-CYL-, SKU-2026-, and CYL-2026- share one trailing-number series, so a
 * typed code can be flagged when that number is already stored under another
 * prefix. Job master ids and other formats are not part of the series.
 */

export function normalizeCylinderSku(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function skuCylSerial(value) {
  const match = normalizeCylinderSku(value).match(/^sku-cyl-(\d+)$/);
  if (!match) return null;
  const serial = Number(match[1]);
  return Number.isSafeInteger(serial) ? serial : null;
}

/** Trailing number of SKU-CYL-N, SKU-2026-N, or CYL-2026-N. Leading zeros count as the same number. */
export function cylinderCodeSerial(value) {
  const match = normalizeCylinderSku(value).match(/^(?:sku-cyl|sku-2026|cyl-2026)-(\d+)$/);
  if (!match) return null;
  const serial = Number(match[1]);
  return Number.isSafeInteger(serial) ? serial : null;
}

export function formatSkuCyl(serial) {
  return `SKU-CYL-${String(serial).padStart(3, '0')}`;
}

function skuValues(row) {
  if (row == null) return [];
  if (typeof row === 'string' || typeof row === 'number') return [row];
  return [row.sku, row.skuCode, row.sku_code, row.cylinderSku, row.cylinder_sku];
}

export function cylinderSkuTaken(sku, rows, ignoreId) {
  const code = normalizeCylinderSku(sku);
  if (!code) return false;
  return (rows || []).some((row) => {
    if (!row || typeof row !== 'object') return false;
    if (ignoreId != null && row.id != null && String(row.id) === String(ignoreId)) return false;
    return skuValues(row).some((value) => normalizeCylinderSku(value) === code);
  });
}

function serialUsedByOtherCode(sku, rows) {
  const serial = cylinderCodeSerial(sku);
  if (serial == null) return false;
  const own = normalizeCylinderSku(sku);
  return (rows || []).some((row) => skuValues(row).some((value) => {
    const code = normalizeCylinderSku(value);
    if (!code || code === own) return false;
    return cylinderCodeSerial(value) === serial;
  }));
}

/**
 * Plan SKUs for a CSV import.
 * A blank cell is left empty and marked generated so the database can issue
 * SKU-CYL-NNN at save time. A cell whose code, or whose trailing number, is
 * already on a cylinder or earlier in this file is flagged and kept as typed.
 */
export function planBulkCylinderSkus(rawSkus, existingRows) {
  const planned = [];
  (rawSkus || []).forEach((raw) => {
    const typed = String(raw ?? '').trim();
    if (!typed) {
      planned.push({
        sku: '',
        generated: true,
        collision: false,
        message: ''
      });
      return;
    }
    const accepted = planned.filter((item) => !item.collision && item.sku).map((item) => ({ sku: item.sku }));
    const blockedByFile = accepted.some((item) => normalizeCylinderSku(item.sku) === normalizeCylinderSku(typed));
    const blockedByTable = cylinderSkuTaken(typed, existingRows);
    const blockedByNumber = serialUsedByOtherCode(typed, [...(existingRows || []), ...accepted]);
    if (blockedByFile || blockedByTable || blockedByNumber) {
      planned.push({
        sku: typed,
        generated: false,
        collision: true,
        message: blockedByNumber && !blockedByFile && !blockedByTable
          ? `SKU number ${cylinderCodeSerial(typed)} is already used by another cylinder code.`
          : `SKU Code "${typed}" already exists for another cylinder set.`
      });
      return;
    }
    planned.push({ sku: typed, generated: false, collision: false, message: '' });
  });
  return planned;
}
