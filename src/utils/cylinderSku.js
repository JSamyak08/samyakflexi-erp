/**
 * Cylinder SKU codes of the form SKU-CYL-515.
 *
 * The next code is one past the highest SKU-CYL serial in the whole cylinder
 * list, then stepped forward while that code is already taken. Gaps below the
 * max are left alone. CYL-2026-xxx, job-master ids, and other number formats
 * are not part of this series.
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

/**
 * Issue `count` SKU-CYL codes from rows already stored plus any codes passed
 * in `reserved`. Each issued code is treated as taken for the next one.
 */
export function allocateCylinderSkuSeries(rows, count = 1, reserved = []) {
  const wanted = Math.max(0, parseInt(count, 10) || 0);
  const takenSerials = new Set();
  let maxSerial = 0;
  const note = (value) => {
    const serial = skuCylSerial(value);
    if (serial == null) return;
    takenSerials.add(serial);
    if (serial > maxSerial) maxSerial = serial;
  };
  (rows || []).forEach((row) => skuValues(row).forEach(note));
  (reserved || []).forEach(note);

  const issued = [];
  let serial = maxSerial;
  let guard = 0;
  while (issued.length < wanted) {
    serial += 1;
    guard += 1;
    if (guard > 100000) break;
    if (takenSerials.has(serial)) continue;
    takenSerials.add(serial);
    issued.push(formatSkuCyl(serial));
  }
  return issued;
}

export function nextCylinderSku(rows, reserved = []) {
  return allocateCylinderSkuSeries(rows, 1, reserved)[0] || '';
}

/**
 * Assign SKUs for a CSV import.
 * A blank cell receives the next SKU-CYL code. A cell whose normalized code
 * is already on a cylinder, or earlier in this file, is flagged and kept as
 * typed so the operator can see the collision. It is not renamed.
 */
export function planBulkCylinderSkus(rawSkus, existingRows) {
  const planned = [];
  (rawSkus || []).forEach((raw) => {
    const typed = String(raw ?? '').trim();
    if (!typed) {
      const sku = nextCylinderSku(existingRows, planned.filter((item) => !item.collision).map((item) => item.sku));
      planned.push({
        sku,
        generated: true,
        collision: false,
        message: ''
      });
      return;
    }
    const blockedByFile = planned.some((item) => !item.collision && normalizeCylinderSku(item.sku) === normalizeCylinderSku(typed));
    const blockedByTable = cylinderSkuTaken(typed, existingRows);
    if (blockedByFile || blockedByTable) {
      planned.push({
        sku: typed,
        generated: false,
        collision: true,
        message: `SKU Code "${typed}" already exists for another cylinder set.`
      });
      return;
    }
    planned.push({ sku: typed, generated: false, collision: false, message: '' });
  });
  return planned;
}
