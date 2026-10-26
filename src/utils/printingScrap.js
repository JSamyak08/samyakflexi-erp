import { parseOptionalKg } from './productionRecordQuality.js';

export const PRINTING_SCRAP_SOURCE = 'printing';
export const PLAIN_SETTING_TYPE = 'Plain Setting';
export const PRINTING_WASTAGE_TYPE = 'Printing Wastage';

const TYPE_KEY = {
  [PLAIN_SETTING_TYPE]: 'plain-setting',
  [PRINTING_WASTAGE_TYPE]: 'printing-wastage'
};

/** Stable scrap-store id: one row per job and scrap type, so End Job retry updates it. */
export function printingScrapId(orderId, type) {
  const job = String(orderId || '').trim();
  const kind = TYPE_KEY[type] || String(type || '').trim().toLowerCase().replace(/\s+/g, '-');
  return `print-scrap:${job}:${kind}`;
}

/**
 * Rows for sfg_scrap_items. A zero quantity is not inserted.
 * Its stable id is returned in deleteIds so a retry that clears the quantity
 * removes the earlier row instead of leaving a duplicate.
 */
export function planPrintingScrap({
  orderId,
  productionRecordId,
  jobName,
  jobCode,
  clientName,
  filmType,
  micron,
  widthMm,
  plainSettingKg,
  printingWastageKg,
  scrappedBy,
  date,
  timestamp
} = {}) {
  const quantities = [
    { type: PLAIN_SETTING_TYPE, qty: parseOptionalKg(plainSettingKg) },
    { type: PRINTING_WASTAGE_TYPE, qty: parseOptionalKg(printingWastageKg) }
  ];
  const invalid = quantities.find((entry) => entry.qty === null);
  if (invalid) {
    const error = new Error(`${invalid.type} (kg) cannot be negative.`);
    error.code = 'SCRAP_QTY';
    throw error;
  }

  const jobNo = jobCode || orderId || '';
  const upserts = [];
  const deleteIds = [];
  quantities.forEach((entry) => {
    const id = printingScrapId(orderId, entry.type);
    if (!(entry.qty > 0)) {
      deleteIds.push(id);
      return;
    }
    upserts.push({
      id,
      holdTagId: productionRecordId || id,
      orderId: orderId || '',
      jobNo,
      jobCode: jobNo,
      jobName: jobName || '',
      clientName: clientName || '',
      filmType: filmType || '',
      micron: micron ?? null,
      widthMm: widthMm ?? null,
      scrapQtyKg: entry.qty,
      defectCategory: entry.type,
      type: entry.type,
      source: PRINTING_SCRAP_SOURCE,
      productionRecordId: productionRecordId || '',
      scrapReason: `${entry.type} recorded at printing for ${jobNo}`,
      scrappedBy: scrappedBy || 'Operator',
      date: date || '',
      timestamp: timestamp || ''
    });
  });
  return { upserts, deleteIds };
}
