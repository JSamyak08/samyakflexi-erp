// PRODUCTION: No seed cylinder data. All cylinders come from Supabase or user input.
export const initialCylinders = [];

function normText(value) {
  return String(value || '').trim().toLowerCase();
}

function sameId(left, right) {
  if (left === undefined || left === null || left === '') return false;
  if (right === undefined || right === null || right === '') return false;
  return String(left) === String(right);
}

/**
 * Keep a real GSM, including 0. Use the fallback only when the field was never set
 * or is not a number. `|| fallback` would also replace a valid 0.
 */
export function parseGsmValue(value, fallback = 1.5) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = typeof value === 'number' ? value : parseFloat(String(value).trim());
  return Number.isFinite(num) ? num : fallback;
}

export const calculateUtilisation = (printedQtyKg, limit = 10000) => {
  const qty = parseFloat(printedQtyKg);
  const cap = parseFloat(limit);
  if (!Number.isFinite(qty) || !Number.isFinite(cap) || cap <= 0) return '0.0';
  const percentage = (qty / cap) * 100;
  return Math.min(Math.max(percentage, 0), 100).toFixed(1);
};

/**
 * First positive print quantity on a production record.
 * qtyFirstPassL1 is the printing pass; later fields cover records that only
 * stored gross or printed output.
 */
export function productionRecordPrintedKg(record) {
  if (!record) return 0;
  const candidates = [
    record.qtyFirstPassL1,
    record.printedOutputKg,
    record.totalProductionQtyKg,
    record.grossProductionKg
  ];
  for (const raw of candidates) {
    if (raw === undefined || raw === null || raw === '') continue;
    const num = parseFloat(raw);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
}

function productionRecordMatchesCylinder(record, cylinder) {
  if (!record || !cylinder) return false;
  const targetId = cylinder.id;
  const targetJmId = cylinder.jobMasterId;
  const targetSku = normText(cylinder.sku || cylinder.skuCode);
  const targetJobName = normText(cylinder.jobName);
  return (
    (record.cylinderId && sameId(record.cylinderId, targetId)) ||
    (record.orderId && sameId(record.orderId, targetId)) ||
    (targetJmId && sameId(record.jobMasterId, targetJmId)) ||
    (targetSku && normText(record.skuCode || record.jobCode) === targetSku) ||
    (targetJobName && normText(record.jobName) === targetJobName)
  );
}

function orderMatchesCylinder(order, cylinder) {
  if (!order || !cylinder) return false;
  const targetId = cylinder.id;
  const targetJmId = cylinder.jobMasterId;
  const targetSku = normText(cylinder.sku || cylinder.skuCode);
  const targetJobName = normText(cylinder.jobName);
  return (
    (order.cylinderId && sameId(order.cylinderId, targetId)) ||
    (order.id && sameId(order.id, targetId)) ||
    (targetJmId && sameId(order.jobMasterId, targetJmId)) ||
    (targetSku && normText(order.skuCode || order.jobCode) === targetSku) ||
    (targetJobName && normText(order.jobName) === targetJobName)
  );
}

/**
 * Printed kilograms for a cylinder. Production records and order output win.
 * Stored cylinder columns are used only when no actual print quantity exists,
 * which is the cylinder-directory behaviour.
 */
export function getCylinderPrintedQtyKg(cylinder, productionRecords = [], orders = []) {
  if (!cylinder) return 0;

  let totalKg = 0;
  let foundProd = false;

  (productionRecords || []).forEach((record) => {
    if (!productionRecordMatchesCylinder(record, cylinder)) return;
    foundProd = true;
    totalKg += productionRecordPrintedKg(record);
  });

  (orders || []).forEach((order) => {
    if (!orderMatchesCylinder(order, cylinder)) return;
    if (!(parseFloat(order.printedOutputKg) > 0 || parseFloat(order.actualMetersPrinted) > 0)) return;
    const alreadyRecorded = (productionRecords || []).some((record) => (
      sameId(record.orderId, order.id) || sameId(record.id, order.id)
    ));
    if (alreadyRecorded) return;
    foundProd = true;
    totalKg += parseFloat(order.printedOutputKg || 0) || 0;
  });

  if (foundProd && totalKg > 0) {
    return Math.round(totalKg * 100) / 100;
  }

  return parseFloat(cylinder.layer1PrintedQtyKg) || parseFloat(cylinder.dispatchedQty) || 0;
}

function orderBelongsToJob(order, job, cylinder) {
  if (!order || !job) return false;
  const sku = normText(job.skuCode || job.cylinderSku);
  const jobName = normText(job.jobName);
  return (
    sameId(order.jobMasterId, job.id) ||
    (sku && normText(order.skuCode || order.jobCode || order.sku) === sku) ||
    (jobName && normText(order.jobName) === jobName) ||
    orderMatchesCylinder(order, cylinder)
  );
}

function productionRecordBelongsToJob(record, job, cylinder, linkedOrderIds) {
  if (!record || !job) return false;
  const sku = normText(job.skuCode || job.cylinderSku);
  const jobName = normText(job.jobName);
  return (
    sameId(record.jobMasterId, job.id) ||
    (sku && normText(record.skuCode || record.jobCode || record.sku) === sku) ||
    (jobName && normText(record.jobName) === jobName) ||
    (record.orderId && linkedOrderIds.has(String(record.orderId))) ||
    (record.id && linkedOrderIds.has(String(record.id))) ||
    productionRecordMatchesCylinder(record, cylinder)
  );
}

/**
 * Printed kilograms for a job profile, from production records and orders.
 * Stored cylinder quantities are left out so a repeated placeholder does not
 * stand in for print history.
 */
export function getJobPrintedQtyKg(job, { productionRecords = [], orders = [], cylinder = null } = {}) {
  if (!job) return 0;

  const linkedOrderIds = new Set();
  (orders || []).forEach((order) => {
    if (orderBelongsToJob(order, job, cylinder) && order.id) {
      linkedOrderIds.add(String(order.id));
    }
  });

  let totalKg = 0;
  const coveredOrderIds = new Set();
  (productionRecords || []).forEach((record) => {
    if (!productionRecordBelongsToJob(record, job, cylinder, linkedOrderIds)) return;
    totalKg += productionRecordPrintedKg(record);
    if (record.orderId) coveredOrderIds.add(String(record.orderId));
    if (record.id) coveredOrderIds.add(String(record.id));
  });

  (orders || []).forEach((order) => {
    if (!orderBelongsToJob(order, job, cylinder)) return;
    if (!(parseFloat(order.printedOutputKg) > 0)) return;
    if (coveredOrderIds.has(String(order.id))) return;
    const alreadyRecorded = (productionRecords || []).some((record) => (
      sameId(record.orderId, order.id) || sameId(record.id, order.id)
    ));
    if (alreadyRecorded) return;
    totalKg += parseFloat(order.printedOutputKg) || 0;
  });

  return Math.round(totalKg * 100) / 100;
}
