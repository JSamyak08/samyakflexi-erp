import QRCode from 'qrcode';
import { codeKey, codeStartsWith, textFrom } from './barcodeCode.js';
import { generateSyncQrSvg } from './qrCodeSvg.js';
import { rollsEligibleForBarcodeLabel } from './scrapIdentity.js';
import { barcodeSheetFileBase, printFrameWithPdfName, printWithPdfName } from './pdfFileName.js';
import { isFinishedGoodsStock } from './finishedGoods.js';

/**
 * Escapes HTML characters to prevent XSS and malformed markup
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Resolves purchase rate per Kg or unit price by checking roll object,
 * inventory master, and inks catalog.
 */
export function resolveItemPurchaseRate(r, inventory = [], inks = []) {
  if (!r) return 0;

  // 1. Check explicit rate on roll/sticker object
  const directRate = Number(r.purchaseRatePerKg || r.purchaseRate || r.unitPrice || r.rate || r.ratePerKg || 0);
  if (directRate > 0) return directRate;

  // 2. Cross-reference with live inventory list
  const cleanId = String(r.itemId || r.id || r.itemCode || r.barcodeId || '').toLowerCase().trim();
  const strippedId = cleanId.replace(/^(lot|bc|bar-iss|bar|roll|inv|grn|item)[-_:]\s*/i, '').trim();

  const matchedItem = (inventory || []).find(i => {
    const iId = codeKey(i.id);
    const iCode = codeKey(i.itemCode);
    const pCode = codeKey(i.productCode);
    const lBatch = codeKey(i.lastBatch);
    const iName = codeKey(i.itemName);
    return iId === cleanId || iId === strippedId ||
      iCode === cleanId || iCode === strippedId ||
      pCode === cleanId || pCode === strippedId ||
      lBatch === cleanId || lBatch === strippedId ||
      (iName && (iName === cleanId || cleanId.includes(iName)));
  });

  if (matchedItem) {
    const invRate = Number(matchedItem.unitPrice || matchedItem.purchaseRatePerKg || matchedItem.pricePerKg || 0);
    if (invRate > 0) return invRate;
  }

  // 3. Cross-reference with inks master
  const matchedInk = (inks || []).find(ink => {
    const pCode = codeKey(ink.productCode);
    const inkId = codeKey(ink.id);
    const shade = codeKey(ink.shade);
    return pCode === cleanId || pCode === strippedId || inkId === cleanId || (shade && (shade === cleanId || cleanId.includes(shade)));
  });

  if (matchedInk) {
    const inkRate = Number(matchedInk.pricePerKg || matchedInk.unitPrice || 0);
    if (inkRate > 0) return inkRate;
  }

  return directRate;
}

const PIECE_UNITS = new Set([
  'pcs', 'pc', 'piece', 'pieces', 'nos', 'no', 'each', 'pkt', 'pkts', 'packet', 'packets', 'set', 'sets'
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanText(value) {
  return String(value ?? '').trim();
}

function positiveNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number;
}

function firstPositive(values) {
  for (const value of values) {
    const number = positiveNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function canonicalUnit(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  const key = raw.toLowerCase().replace(/\.$/, '');
  if (key === 'kg' || key === 'kgs' || key === 'kilogram' || key === 'kilograms') return 'Kg';
  if (PIECE_UNITS.has(key)) return 'Pcs';
  return raw;
}

/** Barcode printed on the sticker. A store row's batch code wins over a uuid primary key. */
export function stickerBarcode(record) {
  if (!record || typeof record !== 'object') return 'BC-2026-0000';
  const batch = textFrom(record.barcodeId, record.sfgBatchCode, record.itemCode);
  if (batch) return batch;
  const id = textFrom(record.id);
  if (id && !UUID_RE.test(id)) return id;
  return 'BC-2026-0000';
}

function matchingInventoryRoll(item, inventoryRolls) {
  const code = cleanText(textFrom(item?.barcodeId, item?.sfgBatchCode, item?.itemCode, item?.id)).toLowerCase();
  if (!code || UUID_RE.test(code)) return null;
  return (inventoryRolls || []).find((roll) => {
    const rollCode = cleanText(textFrom(roll?.barcodeId, roll?.id)).toLowerCase();
    return rollCode && rollCode === code;
  }) || null;
}

/**
 * Store Print Tag rows keep weight on availableKg / totalNetKg and meters on
 * the inventory roll (length_meters) or the batch (totalMeters). Copy those
 * onto the object the sticker renderer already understands.
 */
export function prepareStoreStickerRoll(item, inventoryRolls = []) {
  if (!item || typeof item !== 'object') return item;
  const match = matchingInventoryRoll(item, inventoryRolls);
  const code = textFrom(item.barcodeId, item.sfgBatchCode, item.itemCode);
  const meters = firstPositive([
    item.lengthMeters, item.meters, item.totalMeters,
    match?.lengthMeters, match?.meters, match?.totalMeters
  ]);
  const net = firstPositive([
    item.netWeightKg, item.availableWeightKg, item.availableKg, item.totalNetKg, item.balanceKg,
    match?.netWeightKg, match?.availableWeightKg, match?.availableKg
  ]);
  const gross = firstPositive([
    item.grossWeightKg, item.totalGrossKg, match?.grossWeightKg, match?.totalGrossKg
  ]);
  const identity = rollIdentity({ ...item, ...(match || {}), barcodeId: code || item.barcodeId, sfgBatchCode: item.sfgBatchCode || code });
  const kilogram = identity.isSFG || identity.isFG || identity.isRaw || identity.isBalance;
  return {
    ...item,
    barcodeId: code || stickerBarcode(item),
    sfgBatchCode: item.sfgBatchCode || code || item.barcodeId,
    netWeightKg: net ?? 0,
    availableWeightKg: firstPositive([item.availableWeightKg, item.availableKg, match?.availableWeightKg]) ?? net ?? 0,
    availableKg: firstPositive([item.availableKg, item.availableWeightKg, match?.availableWeightKg]) ?? net ?? 0,
    totalNetKg: firstPositive([item.totalNetKg, match?.totalNetKg]) ?? net ?? 0,
    grossWeightKg: gross ?? undefined,
    lengthMeters: meters,
    totalMeters: meters,
    rollType: item.rollType || match?.rollType || (identity.isFG ? 'FG' : identity.isRaw ? 'RAW_MATERIAL' : 'SFG'),
    category: item.category || match?.category || (identity.isFG ? 'Finished Goods (FG)' : identity.isRaw ? 'Raw Material (RM)' : 'Semi-Finished Goods (SFG)'),
    sfgType: item.sfgType || match?.sfgType,
    unit: kilogram ? 'Kg' : (canonicalUnit(item.unit || item.uom || match?.unit) || item.unit),
    uom: kilogram ? 'Kg' : (canonicalUnit(item.uom || item.unit || match?.uom) || item.uom),
    itemName: item.itemName || item.jobName || match?.itemName || match?.jobName || ''
  };
}

function rollIdentity(record) {
  const rollType = cleanText(record?.rollType).toUpperCase();
  const category = cleanText(record?.category).toLowerCase();
  const sfgType = cleanText(record?.sfgType || record?.fgType).toLowerCase();
  const code = cleanText(textFrom(record?.barcodeId, record?.sfgBatchCode, record?.itemCode, record?.id)).toUpperCase();
  const isFG = isFinishedGoodsStock({
    rollType: record?.rollType,
    sfgType: record?.sfgType || record?.fgType,
    category: record?.category,
    sfgBatchCode: textFrom(record?.barcodeId, record?.sfgBatchCode),
    barcodeId: record?.barcodeId
  });
  const isSFG = !isFG && (
    rollType === 'SFG' || rollType === 'SFG_PRINTED' || rollType === 'SFG_LAMINATED' || rollType === 'SEMI_FINISHED_GOODS'
    || category.includes('semi-finished') || category === 'sfg'
    || sfgType.includes('printed') || sfgType.includes('semi') || sfgType.includes('roll')
    || code.startsWith('SFG-')
  );
  const isBalance = code.endsWith('-BAL') || record?.balanceRoll === true;
  const isRaw = !isSFG && !isFG && (
    rollType === 'RAW_MATERIAL'
    || isBalance
    || category.includes('raw material')
    || category === 'film substrates'
    || code.startsWith('RM-')
  );
  return { isFG, isSFG, isBalance, isRaw };
}

/**
 * Categorizes the sticker item into film, non-film, SFG, FG, QC Hold.
 * Film, SFG, FG, and balance rolls are kilograms. Pieces are used only when
 * the item's own unit says so and the row is not one of those rolls.
 */
export function getStickerCategoryInfo(r) {
  if (!r) return {
    isSFG: false,
    isFG: false,
    isFilmItem: false,
    isRoll: false,
    isChemicalOrInk: false,
    isQCHold: false,
    displayUnit: 'Kg',
    displayQty: 0,
    tagLabel: 'STORE ITEM',
    barcodeCode: 'BC-2026-0000',
    grossKg: null,
    lengthMeters: null,
    lengthLabel: '-',
    showLength: false
  };

  const identity = rollIdentity(r);
  const { isSFG, isFG, isRaw, isBalance } = identity;

  const nonFilmCategories = [
    'Doctor Blades', 'Doctor Blades & Wipers', 'Inks & Solvents',
    'Printing Inks', 'Printing Inks & Toners', 'Chemicals & Solvents', 'Adhesives & Hardener',
    'Rollers & Sleeves', 'Machine Spare Parts', 'Lubricants & Oils',
    'Tapes & Consumables', 'Safety Gear (PPE)', 'General Store', 'CONSUMABLE_ITEM', 'Packaging & Cores'
  ];

  const itemNameLower = String(r.itemName || '').toLowerCase();
  const catLower = String(r.category || '').toLowerCase();

  const KNOWN_NON_FILM_KEYWORDS = [
    'acetate', 'solvent', 'ink', 'cyan', 'magenta', 'yellow', 'black', 'white',
    'blade', 'wiper', 'adhesive', 'hardener', 'tape', 'core', 'roller', 'sleeve',
    'lubricant', 'oil', 'gear', 'ppe', 'glove', 'mask', 'chemical', 'cylinder',
    'thinner', 'alcohol', 'toluene', 'varnish'
  ];

  const isNonFilmByKeyword = KNOWN_NON_FILM_KEYWORDS.some(kw => 
    itemNameLower.includes(kw) || catLower.includes(kw)
  );

  const isExplicitNonFilm = nonFilmCategories.includes(r.category) || 
    isNonFilmByKeyword ||
    r.rollType === 'CONSUMABLE_ITEM';

  const hasValidFilmSpecs = parseFloat(r.micron) > 0 && parseFloat(r.widthMm) > 0 && r.micron !== '-' && r.widthMm !== '-';

  const isFilmItem = !isExplicitNonFilm && 
    (r.rollType === 'RAW_MATERIAL' || r.category === 'Film Substrates') && 
    hasValidFilmSpecs;

  const catStr = codeKey(r.category);
  const isChemicalOrInk = catStr.includes('chemical') || catStr.includes('solvent') || catStr.includes('ink') || catStr.includes('adhesive') || catStr.includes('resin') || codeStartsWith(r.barcodeId, 'CON-BC') || codeStartsWith(r.barcodeId, 'RM-BC');
  const isRoll = isSFG || isFG || isRaw || isBalance || isFilmItem;
  const explicitUnit = canonicalUnit(r.unit || r.uom);
  const displayUnit = isRoll ? 'Kg' : (explicitUnit || (isChemicalOrInk ? 'Kg' : 'Pcs'));

  const displayQty = firstPositive([
    r.netWeightKg,
    r.availableWeightKg,
    r.availableKg,
    r.totalNetKg,
    r.balanceKg,
    r.weightKg,
    r.receivedQtyKg,
    r.availableQtyKg,
    r.qty
  ]) ?? 0;

  const grossKg = firstPositive([r.grossWeightKg, r.totalGrossKg, r.gross_weight_kg]);
  const lengthMeters = firstPositive([r.lengthMeters, r.length_meters, r.meters, r.totalMeters, r.total_meters]);
  const showLength = isRoll;
  const lengthLabel = lengthMeters === null ? '-' : `${lengthMeters} m`;

  const isQCHold = r.isQCHold || r.targetProcess === 'QC Hold Store' || r.status === 'QC_HOLD' || r.rollType === 'QC_HOLD' || r.isHold === true;

  let tagLabel = 'STORE ITEM';
  if (isQCHold) {
    tagLabel = '🚨 QC HOLD MATERIAL';
  } else if (isSFG) {
    tagLabel = 'SEMI-FINISHED GOODS (SFG)';
  } else if (isFG) {
    tagLabel = 'FINISHED GOODS (FG)';
  } else if (isFilmItem || isRaw || isBalance) {
    tagLabel = 'RAW MATERIAL (RM)';
  } else if (r.category && r.category !== 'CONSUMABLE_ITEM') {
    tagLabel = r.category.toUpperCase();
  }

  return {
    isSFG,
    isFG,
    isFilmItem,
    isRoll,
    isChemicalOrInk,
    isQCHold,
    displayUnit,
    displayQty,
    tagLabel,
    barcodeCode: stickerBarcode(r),
    grossKg,
    lengthMeters,
    lengthLabel,
    showLength
  };
}

function formatDateInKolkata24h(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const getPart = (type) => parts.find(p => p.type === type)?.value || '';
  const day = getPart('day');
  const month = getPart('month');
  const year = getPart('year');
  let hour = getPart('hour');
  if (hour === '24') hour = '00';
  const minute = getPart('minute');

  return `${day}/${month}/${year} ${hour}:${minute}`;
}

/**
 * Normalizes and formats date & time to a clear, simplified 24-hour timestamp
 * without seconds: "DD/MM/YYYY HH:mm" (or "DD/MM/YYYY" for date-only values).
 */
export function formatStickerDateTime(value, fallback = new Date()) {
  if (value === undefined || value === null || value === '') {
    value = fallback;
  }

  // If already a Date object
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateInKolkata24h(value);
  }

  const str = String(value).trim();
  if (!str) {
    return formatDateInKolkata24h(new Date());
  }

  // Case 1: matches DD/MM/YYYY with optional time and AM/PM
  // e.g. "27/10/2026, 4:08:28 pm" or "27/10/2026 16:08:28" or "27/10/2026 16:08"
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?)?$/i);
  if (dmyMatch) {
    const day = String(dmyMatch[1]).padStart(2, '0');
    const month = String(dmyMatch[2]).padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = '20' + year;

    let hour = dmyMatch[4];
    let minute = dmyMatch[5];
    const ampm = (dmyMatch[7] || '').toLowerCase();

    if (hour !== undefined && minute !== undefined) {
      let h = parseInt(hour, 10);
      const m = String(minute).padStart(2, '0');
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      const hStr = String(h).padStart(2, '0');
      return `${day}/${month}/${year} ${hStr}:${m}`;
    }
    return `${day}/${month}/${year}`;
  }

  // Case 2: ISO string or standard parseable string
  // e.g. "2026-10-29T10:38:28.123Z" or "2026-10-29 16:08:28" or "2026-10-29"
  try {
    const parsed = new Date(str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str);
    if (!Number.isNaN(parsed.getTime())) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [y, m, d] = str.split('-');
        return `${d}/${m}/${y}`;
      }
      return formatDateInKolkata24h(parsed);
    }
  } catch (e) {
    // ignore
  }

  // Fallback cleanup if string contains seconds or AM/PM: remove seconds
  return str.replace(/:(\d{2})(?::\d+)?(\s*[ap]m)?/i, (match, sec, ampm) => {
    return ampm ? ` ${ampm.trim().toUpperCase()}` : '';
  });
}

/**
 * Returns formatted 24-hour timestamp without seconds for sticker labels
 */
export function getStickerDisplayDate(r, fallbackDate = '') {
  if (!r) return formatStickerDateTime(fallbackDate);
  const raw = r.inwardDatetime || r.inward_datetime || r.dispatchDate || r.dispatch_date || r.date || r.createdAt || r.created_at || fallbackDate;
  return formatStickerDateTime(raw);
}

/**
 * Generates the clean HTML string for a single 4x4 thermal sticker
 */
export function generateSingleStickerHtml(r, company = {}, { inventory = [], inks = [], dateStr = '' } = {}) {
  const catInfo = getStickerCategoryInfo(r);
  const { isSFG, isFG, isFilmItem, isQCHold, displayUnit, displayQty, tagLabel, barcodeCode, grossKg, showLength, lengthLabel } = catInfo;

  const rateVal = resolveItemPurchaseRate(r, inventory, inks);
  const vendorStr = r.vendorName || r.supplier || r.partyName || '-';
  const batchStr = r.batchNo || r.heatNo || r.batch || '-';
  const barcodeCodeStr = barcodeCode || stickerBarcode(r);
  const displayDate = getStickerDisplayDate(r, dateStr);

  const qrSvg = generateSyncQrSvg(barcodeCodeStr, 1);

  return `
    <div class="thermal-label-sheet">
      <div class="thermal-label-card ${isQCHold ? 'qc-hold' : ''}">
        <!-- Header -->
        <div class="label-header">
          <div class="header-left">
            ${!r.hideBranding ? `
              <div class="company-name">${escapeHtml(company.name || 'SAMYAK INTERNATIONAL LTD.')}</div>
              <div class="company-gstin"><span class="gstin-label">GSTIN:</span> <strong class="gstin-val">${escapeHtml(company.gstin || '')}</strong></div>
              <div class="company-address">${escapeHtml(company.address || company.placeOfSupply || '')}</div>
            ` : `
              <div class="tag-title">IDENTIFICATION TAG</div>
            `}
          </div>
          <span class="badge ${isQCHold ? 'badge-qc' : (isSFG ? 'badge-sfg' : isFG ? 'badge-fg' : (isFilmItem ? 'badge-rm' : 'badge-store'))}">
            ${escapeHtml(tagLabel)}
          </span>
        </div>

        <!-- QC Hold Banner -->
        ${isQCHold ? `
          <div class="qc-banner">⚠️ QC HOLD MATERIAL — QUARANTINE ⚠️</div>
        ` : ''}

        <!-- 2D QR Barcode Traceability Box -->
        <div class="barcode-box">
          <div class="barcode-info">
            <div class="barcode-title">
              <svg class="qr-icon" viewBox="0 0 24 24" fill="none" stroke="#047857" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              2D QR BARCODE (TRACEABILITY)
            </div>
            <div class="barcode-code">${escapeHtml(barcodeCodeStr)}</div>
            <div class="barcode-meta">
              ${r.totalUnits > 1 ? `${escapeHtml(r.packagingType || 'Roll')} ${escapeHtml(r.unitNo || 1)} of ${escapeHtml(r.totalUnits)} &bull; ` : ''}Date: ${escapeHtml(displayDate)}
            </div>
          </div>
          <div class="qr-code-box">
            ${qrSvg}
          </div>
        </div>

        <!-- Core Specs Grid -->
        <div class="specs-grid">
          <div class="specs-left">
            <span class="specs-label">Item / Substrate</span>
            <div class="specs-title" title="${escapeHtml(r.itemName || r.jobName || '')}">${escapeHtml(r.itemName || r.jobName || '-')}</div>
            ${isFilmItem ? `
              <div class="specs-sub">Gauge: <strong>${escapeHtml(r.micron)}µ</strong> | Width: <strong>${escapeHtml(r.widthMm)}mm</strong></div>
            ` : `
              <div class="specs-sub">${r.substrateSpec ? `<strong>${escapeHtml(r.substrateSpec)}</strong>` : `Unit: ${escapeHtml(displayUnit)}`}</div>
            `}
          </div>
          <div class="specs-right">
            <span class="specs-label">Net Qty / Weight</span>
            <div class="qty-val">${escapeHtml(displayQty)} <span class="qty-unit">${escapeHtml(displayUnit)}</span></div>
            ${grossKg ? `
              <div class="qty-sub">Gross: ${escapeHtml(grossKg)} kg ${(r.tareWeightKg !== undefined || r.coreWeightKg !== undefined) ? `| Tare: ${escapeHtml(r.tareWeightKg ?? r.coreWeightKg)} kg` : ''}</div>
            ` : ''}
            ${showLength ? `
              <div class="len-sub">Len: ${escapeHtml(lengthLabel)}</div>
            ` : ''}
          </div>
        </div>

        <!-- Traceability & Costing Metadata Box -->
        <div class="meta-box">
          ${r.jobName ? `<div class="meta-line">Job Name: <strong>${escapeHtml(r.jobName)}</strong></div>` : ''}
          ${r.clientName ? `<div class="meta-line">Client: <strong>${escapeHtml(r.clientName)}</strong></div>` : ''}
          ${isFG ? `
            <div class="meta-line">Order Ref #: <strong>${escapeHtml(r.poNo || r.orderRefNo || r.orderId || r.batchNo || 'N/A')}</strong> ${r.invoiceNo ? `| Inv: ${escapeHtml(r.invoiceNo)}` : ''}</div>
          ` : `
            ${r.vendorRollNo ? `<div class="meta-line">Vendor ${escapeHtml(r.packagingType || 'Roll')} #: <strong style="color: #0284c7;">${escapeHtml(r.vendorRollNo)}</strong></div>` : ''}
            <div class="meta-row">
              <span>Vendor: <strong>${escapeHtml(vendorStr)}</strong></span>
              ${r.invoiceNo ? `<span style="color: #64748b;">Inv: <strong>${escapeHtml(r.invoiceNo)}</strong></span>` : ''}
            </div>
            <div class="meta-row">
              <span>Batch / Heat #: <strong>${escapeHtml(batchStr)}</strong></span>
              <span style="color: #047857; font-weight: 700;">Rate: <strong>${rateVal > 0 ? `₹${rateVal} / ${escapeHtml(displayUnit)}` : '₹-'}</strong></span>
            </div>
          `}
          ${r.inputBarcodeIds && r.inputBarcodeIds.length > 0 ? `
            <div class="meta-line" style="color: #4f46e5; font-weight: 600;">Input Roll Ref: ${escapeHtml(r.inputBarcodeIds.join(', '))}</div>
          ` : ''}
          ${r.holdReason ? `
            <div class="hold-reason">QC HOLD REASON: <strong>${escapeHtml(r.holdReason)}</strong></div>
          ` : ''}
          ${(r.itemRemarks || r.remarks || r.notes) ? `
            <div class="remarks-line">Remark: <strong>${escapeHtml(r.itemRemarks || r.remarks || r.notes)}</strong></div>
          ` : ''}
          <div class="footer-row">
            <span>Station: <strong>${escapeHtml(isFG ? 'Dispatch Main Dock' : (r.stationId || r.station_id || 'Dispatch Main Dock'))}</strong></span>
            <span>Date: <strong>${escapeHtml(displayDate)}</strong></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/** File name for a 4×4 barcode label sheet. One code, or a count and the IST date. */
export function thermalLabelFileBase(rolls, when = new Date()) {
  const codes = rollsEligibleForBarcodeLabel(rolls).map((roll) => stickerBarcode(roll));
  return barcodeSheetFileBase(codes, when);
}

/**
 * Generates the full HTML document for isolated thermal label printing
 */
export function generateThermalLabelsHtml(rollList = [], company = {}, { inventory = [], inks = [], documentTitle } = {}) {
  const eligible = rollsEligibleForBarcodeLabel(rollList);
  const stickersHtml = eligible.map(r => generateSingleStickerHtml(r, company, { inventory, inks })).join('\n');
  const title = documentTitle || thermalLabelFileBase(eligible);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: 4in 4in;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 4in;
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .thermal-label-sheet {
      width: 4in;
      height: 4in;
      max-width: 4in;
      max-height: 4in;
      box-sizing: border-box;
      padding: 0.1in;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      overflow: hidden;
      background: #ffffff;
    }
    .thermal-label-sheet:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
    .thermal-label-card {
      width: 3.8in;
      height: 3.8in;
      max-width: 3.8in;
      max-height: 3.8in;
      box-sizing: border-box;
      border: 2px solid #0f172a;
      border-radius: 4px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      background: #ffffff;
      color: #0f172a;
    }
    .thermal-label-card.qc-hold {
      border: 2.5px solid #dc2626;
      background: #fff5f5;
    }
    .label-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 4px;
      flex-shrink: 0;
    }
    .thermal-label-card.qc-hold .label-header {
      border-bottom: 2px solid #dc2626;
    }
    .header-left {
      flex: 1;
      min-width: 0;
      padding-right: 6px;
    }
    .company-name {
      font-weight: 900;
      font-size: 0.82rem;
      letter-spacing: -0.01em;
      line-height: 1.15;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .company-gstin {
      font-size: 0.65rem;
      color: #0f172a;
      font-weight: 700;
      margin-top: 1px;
      line-height: 1.2;
      letter-spacing: 0.02em;
    }
    .gstin-label {
      color: #475569;
      font-weight: 600;
    }
    .gstin-val {
      font-family: Consolas, Monaco, 'Courier New', monospace;
      font-weight: 800;
      color: #0f172a;
    }
    .company-address {
      font-size: 0.53rem;
      color: #475569;
      font-weight: 500;
      margin-top: 1px;
      line-height: 1.25;
      word-break: break-word;
      white-space: normal;
      overflow: visible;
    }
    .tag-title {
      font-weight: 900;
      font-size: 0.82rem;
      letter-spacing: 0.02em;
      color: #334155;
      text-transform: uppercase;
    }
    .badge {
      font-size: 0.62rem;
      font-weight: 900;
      padding: 2px 6px;
      border-radius: 3px;
      border: 1.5px solid currentColor;
      white-space: nowrap;
      margin-left: 6px;
      flex-shrink: 0;
    }
    .badge-rm {
      background: #dcfce7;
      color: #166534;
    }
    .badge-sfg {
      background: #e0e7ff;
      color: #3730a3;
    }
    .badge-fg {
      background: #fef3c7;
      color: #92400e;
    }
    .badge-store {
      background: #f0f9ff;
      color: #1e40af;
    }
    .badge-qc {
      background: #fee2e2;
      color: #991b1b;
      border-color: #dc2626;
      letter-spacing: 0.04em;
    }
    .qc-banner {
      background: #7f1d1d;
      color: #ffffff;
      font-weight: 900;
      font-size: 0.78rem;
      text-align: center;
      padding: 3px 6px;
      border-radius: 4px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      flex-shrink: 0;
      margin: 2px 0;
    }
    .barcode-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f8fafc;
      padding: 5px 8px;
      border-radius: 5px;
      border: 1.5px solid #0f172a;
      gap: 8px;
      flex-shrink: 0;
    }
    .barcode-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .barcode-title {
      font-size: 0.60rem;
      color: #64748b;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .qr-icon {
      width: 11px;
      height: 11px;
      flex-shrink: 0;
    }
    .barcode-code {
      font-family: Consolas, Monaco, 'Courier New', monospace;
      font-weight: 900;
      font-size: 0.92rem;
      color: #0f172a;
      letter-spacing: 0.03em;
      margin-top: 2px;
      word-break: break-all;
      line-height: 1.2;
    }
    .barcode-meta {
      font-size: 0.60rem;
      color: #475569;
      font-weight: 600;
      margin-top: 2px;
    }
    .qr-code-box {
      background: #ffffff;
      padding: 2px;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 78px;
      height: 78px;
    }
    .qr-code-box svg {
      width: 74px;
      height: 74px;
      display: block;
    }
    .specs-grid {
      display: grid;
      grid-template-columns: 1.6fr 1.4fr;
      gap: 6px;
      font-size: 0.78rem;
      background: #f8fafc;
      padding: 5px 7px;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
      flex-shrink: 0;
    }
    .specs-left {
      min-width: 0;
    }
    .specs-label {
      font-size: 0.58rem;
      color: #64748b;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      display: block;
    }
    .specs-title {
      font-weight: 800;
      font-size: 0.85rem;
      color: #0f172a;
      line-height: 1.2;
      margin-top: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .specs-sub {
      font-size: 0.68rem;
      color: #334155;
      margin-top: 1px;
      line-height: 1.2;
    }
    .specs-right {
      text-align: right;
      border-left: 1.5px solid #cbd5e1;
      padding-left: 6px;
      min-width: 0;
    }
    .qty-val {
      font-weight: 900;
      font-size: 1.12rem;
      color: #047857;
      line-height: 1.1;
      margin-top: 1px;
    }
    .qty-unit {
      font-size: 0.70rem;
    }
    .qty-sub {
      font-size: 0.62rem;
      color: #64748b;
      font-weight: 600;
      margin-top: 1px;
      line-height: 1.15;
    }
    .len-sub {
      font-size: 0.62rem;
      color: #0369a1;
      font-weight: 700;
      margin-top: 1px;
      line-height: 1.15;
    }
    .meta-box {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 0.68rem;
      color: #1e293b;
      background: #ffffff;
      padding: 4px 7px;
      border-radius: 4px;
      border: 1px dashed #94a3b8;
      flex-shrink: 0;
    }
    .meta-line {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hold-reason {
      color: #991b1b;
      font-weight: 800;
      font-size: 0.66rem;
      background: #fef2f2;
      padding: 2px 5px;
      border-radius: 3px;
      border: 1px solid #fca5a5;
      word-break: break-word;
    }
    .remarks-line {
      color: #0369a1;
      font-weight: 700;
      font-size: 0.66rem;
      border-top: 1px solid #e2e8f0;
      padding-top: 2px;
      word-break: break-word;
    }
    .footer-row {
      display: flex;
      justify-content: space-between;
      margin-top: 1px;
      font-size: 0.62rem;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
      padding-top: 2px;
    }
  </style>
</head>
<body>
  ${stickersHtml}
</body>
</html>`;
}

/**
 * Triggers printing of thermal barcode stickers inside an isolated iframe.
 * Completely isolates the thermal print layout from parent DOM, global stylesheets,
 * modals, and tables, ensuring zero text overlapping, crisp QR codes, and exact 4x4 inch bounds.
 */
export function printThermalBarcodeLabels({ rolls = [], company = {}, inventory = [], inks = [], onComplete } = {}) {
  const rollList = rollsEligibleForBarcodeLabel(rolls);
  if (rollList.length === 0) return;

  const fileBase = thermalLabelFileBase(rollList);
  const html = generateThermalLabelsHtml(rollList, company, { inventory, inks, documentTitle: fileBase });

  if (typeof document === 'undefined') return;

  // Remove existing thermal print iframe if present
  const existingFrame = document.getElementById('thermal-barcode-print-iframe');
  if (existingFrame) {
    try {
      existingFrame.remove();
    } catch (e) {
      // ignore
    }
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'thermal-barcode-print-iframe';
  iframe.setAttribute('style', 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden;z-index:-99999;');
  iframe.setAttribute('title', 'Thermal Barcode Print Frame');
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    console.error('Cannot access iframe document for printing');
    printWithPdfName(fileBase);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();
  doc.title = fileBase;

  const triggerPrint = () => {
    // Chrome names the saved PDF from the top-level document title, even when
    // the printed frame has its own title. Hold that title until the dialog closes.
    printFrameWithPdfName(iframe, fileBase).catch((err) => {
      console.warn('Iframe print failed, falling back to window.print():', err);
      printWithPdfName(fileBase);
    }).finally(() => {
      if (onComplete) onComplete();
    });
  };

  // Give the browser 250ms to parse DOM, render SVG, and calculate dimensions
  setTimeout(triggerPrint, 250);
}
