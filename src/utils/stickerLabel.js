/**
 * Field list for the 4×4 barcode sticker.
 * The on-screen label and the TSC TSPL label both read this so the words match.
 * Thermal fonts cannot draw emoji, so the hold banner uses the same words without the icon.
 */

import { codeKey, codeStartsWith, textFrom } from './barcodeCode';

const NON_FILM_CATEGORIES = [
  'Doctor Blades', 'Doctor Blades & Wipers', 'Inks & Solvents',
  'Printing Inks', 'Printing Inks & Toners', 'Chemicals & Solvents', 'Adhesives & Hardener',
  'Rollers & Sleeves', 'Machine Spare Parts', 'Lubricants & Oils',
  'Tapes & Consumables', 'Safety Gear (PPE)', 'General Store', 'CONSUMABLE_ITEM', 'Packaging & Cores',
];

const NON_FILM_KEYWORDS = [
  'acetate', 'solvent', 'ink', 'cyan', 'magenta', 'yellow', 'black', 'white',
  'blade', 'wiper', 'adhesive', 'hardener', 'tape', 'core', 'roller', 'sleeve',
  'lubricant', 'oil', 'gear', 'ppe', 'glove', 'mask', 'chemical', 'cylinder',
  'thinner', 'alcohol', 'toluene', 'varnish',
];

function text(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function purchaseRate(roll, inventory = [], inks = []) {
  const directRate = Number(roll.purchaseRatePerKg || roll.purchaseRate || roll.unitPrice || roll.rate || roll.ratePerKg || 0);
  if (directRate > 0) return directRate;

  const cleanId = String(roll.itemId || roll.id || roll.itemCode || roll.barcodeId || '').toLowerCase().trim();
  const strippedId = cleanId.replace(/^(lot|bc|bar-iss|bar|roll|inv|grn|item)[-_:]\s*/i, '').trim();
  const matchedItem = (inventory || []).find((item) => {
    const candidates = [item.id, item.itemCode, item.productCode, item.lastBatch, item.itemName].map((value) => codeKey(value));
    return candidates.some((value) => value && (value === cleanId || value === strippedId || cleanId.includes(value)));
  });
  if (matchedItem) {
    const invRate = Number(matchedItem.unitPrice || matchedItem.purchaseRatePerKg || matchedItem.pricePerKg || 0);
    if (invRate > 0) return invRate;
  }

  const matchedInk = (inks || []).find((ink) => {
    const product = codeKey(ink.productCode);
    const inkId = codeKey(ink.id);
    const shade = codeKey(ink.shade);
    return product === cleanId || product === strippedId || inkId === cleanId || (shade && (shade === cleanId || cleanId.includes(shade)));
  });
  if (matchedInk) {
    const inkRate = Number(matchedInk.pricePerKg || matchedInk.unitPrice || 0);
    if (inkRate > 0) return inkRate;
  }
  return directRate;
}

export function describeSticker(roll, { company = {}, inventory = [], inks = [], rate } = {}) {
  const r = roll || {};
  const isSfg = r.rollType === 'SFG_PRINTED' || r.rollType === 'SFG_LAMINATED' || r.rollType === 'SFG';
  const isFg = r.rollType === 'FG_DISPATCH' || r.rollType === 'FG';
  const itemNameLower = String(r.itemName || '').toLowerCase();
  const catLower = String(r.category || '').toLowerCase();
  const isNonFilmByKeyword = NON_FILM_KEYWORDS.some((word) => itemNameLower.includes(word) || catLower.includes(word));
  const isExplicitNonFilm = NON_FILM_CATEGORIES.includes(r.category) || isNonFilmByKeyword || r.rollType === 'CONSUMABLE_ITEM';
  const hasValidFilmSpecs = parseFloat(r.micron) > 0 && parseFloat(r.widthMm) > 0 && r.micron !== '-' && r.widthMm !== '-';
  const isFilm = !isExplicitNonFilm && (r.rollType === 'RAW_MATERIAL' || r.category === 'Film Substrates') && hasValidFilmSpecs;
  const catStr = codeKey(r.category);
  const isChemicalOrInk = catStr.includes('chemical') || catStr.includes('solvent') || catStr.includes('ink') || catStr.includes('adhesive') || catStr.includes('resin') || codeStartsWith(r.barcodeId, 'CON-BC') || codeStartsWith(r.barcodeId, 'RM-BC');
  const unit = r.unit || r.uom || (isFilm || isChemicalOrInk ? 'Kg' : 'Pcs');
  const qty = (r.netWeightKg !== undefined && r.netWeightKg !== null && Number(r.netWeightKg) > 0)
    ? Number(r.netWeightKg)
    : ((r.availableWeightKg !== undefined && r.availableWeightKg !== null && Number(r.availableWeightKg) > 0)
      ? Number(r.availableWeightKg)
      : Number(r.qty ?? r.weightKg ?? r.receivedQtyKg ?? 0));
  const rateVal = rate != null ? Number(rate) : purchaseRate(r, inventory, inks);
  const vendor = r.vendorName || r.supplier || r.partyName || '-';
  const batch = r.batchNo || r.heatNo || r.batch || '-';
  const barcode = textFrom(r.barcodeId, r.id) || 'BC-2026-0000';
  const qcHold = Boolean(r.isQCHold || r.targetProcess === 'QC Hold Store' || r.status === 'QC_HOLD' || r.rollType === 'QC_HOLD' || r.isHold === true);
  const hideBranding = Boolean(r.hideBranding);

  let badge = 'STORE ITEM';
  if (qcHold) badge = 'QC HOLD MATERIAL';
  else if (isSfg) badge = 'SEMI-FINISHED (SFG)';
  else if (isFg) badge = 'FINISHED GOODS (FG)';
  else if (isFilm) badge = 'RAW MATERIAL (RM)';
  else if (r.category && r.category !== 'CONSUMABLE_ITEM') badge = String(r.category).toUpperCase();

  const itemTitle = text(r.itemName || r.jobName) || 'Item';
  let specLine = r.substrateSpec ? String(r.substrateSpec) : `Unit: ${unit}`;
  if (isFilm) {
    const rollCount = r.totalUnits > 1 ? ` | ${r.packagingType || 'Roll'} ${r.unitNo || 1} of ${r.totalUnits}` : '';
    specLine = `Gauge: ${r.micron}µ | Width: ${r.widthMm}mm${rollCount}`;
  }

  const grossLine = r.grossWeightKg
    ? `Gross: ${r.grossWeightKg} kg${(r.tareWeightKg !== undefined || r.coreWeightKg !== undefined) ? ` | Core/Pkg Tare: ${r.tareWeightKg ?? r.coreWeightKg} kg` : ''}`
    : '';
  const lengthLine = r.lengthMeters ? `Len: ${r.lengthMeters} m` : '';
  const station = isFg ? 'Dispatch Main Dock' : (r.stationId || r.station_id || 'Dispatch Main Dock');
  const date = r.inwardDatetime || r.dispatchDate || r.date || new Date().toLocaleDateString('en-IN');

  const details = [];
  if (r.jobName) details.push({ tone: 'plain', text: `Job Name: ${r.jobName}` });
  if (r.clientName) details.push({ tone: 'plain', text: `Client: ${r.clientName}` });
  if (isFg) {
    details.push({ tone: 'plain', text: `Order Ref #: ${r.poNo || r.orderRefNo || r.orderId || r.batchNo || 'N/A'}${r.invoiceNo ? ` | Inv: ${r.invoiceNo}` : ''}` });
  } else {
    if (r.vendorRollNo) details.push({ tone: 'plain', text: `Vendor ${r.packagingType || 'Roll'} #: ${r.vendorRollNo}` });
    details.push({ tone: 'plain', text: `Vendor: ${vendor}${r.invoiceNo ? ` | Inv: ${r.invoiceNo}` : ''}` });
    details.push({ tone: 'plain', text: `Batch / Heat #: ${batch}` });
    details.push({ tone: 'money', text: `Purchase Rate: ${rateVal > 0 ? `₹${rateVal} / ${unit}` : '₹-'}` });
  }
  if (Array.isArray(r.inputBarcodeIds) && r.inputBarcodeIds.length > 0) {
    details.push({ tone: 'plain', text: `Input Roll Ref: ${r.inputBarcodeIds.join(', ')}` });
  }
  if (r.holdReason) details.push({ tone: 'hold', text: `QC HOLD REASON: ${r.holdReason}` });
  const remark = r.itemRemarks || r.remarks || r.notes;
  if (remark) details.push({ tone: 'note', text: `Remark: ${remark}` });
  details.push({ tone: 'meta', text: `Station: ${station}` });
  details.push({ tone: 'meta', text: `Date: ${date}` });

  return {
    isSfg,
    isFg,
    isFilm,
    qcHold,
    hideBranding,
    companyName: hideBranding ? 'IDENTIFICATION TAG' : text(company.name),
    companyMeta: hideBranding ? '' : `${text(company.placeOfSupply)} • GSTIN: ${text(company.gstin)}`,
    badge,
    holdBanner: qcHold ? 'QC HOLD MATERIAL — QUARANTINE' : '',
    barcode,
    itemTitle,
    specLine,
    qty,
    unit,
    qtyText: `${qty} ${unit}`,
    grossLine,
    lengthLine,
    vendor,
    batch,
    rate: rateVal,
    details,
  };
}

function tsplQuote(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\\/g, '/').replace(/"/g, "'").trim();
}

function wrapDots(value, width = 42) {
  const clean = tsplQuote(value);
  if (!clean) return [];
  const lines = [];
  let rest = clean;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(' ', width);
    if (cut < 12) cut = width;
    lines.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) lines.push(rest);
  return lines;
}

/**
 * Raw TSPL2 for a TSC TE244 (203 dpi) 4×4 inch label.
 * SIZE is 4 inch by 4 inch. GAP is millimetres of liner gap and must match the stock.
 */
export function buildTsplLabel(sticker, { gapMm = 3 } = {}) {
  const gap = Number(gapMm);
  const gapText = Number.isFinite(gap) && gap >= 0 && gap <= 20 ? gap : 3;
  const commands = [
    `SIZE 4,4`,
    `GAP ${gapText} mm,0 mm`,
    'DIRECTION 1',
    'REFERENCE 0,0',
    'DENSITY 8',
    'SPEED 4',
    'CLS',
    'CODEPAGE 1252',
  ];
  let y = 16;
  const write = (value, font = '2', scale = 1) => {
    wrapDots(value, scale > 1 ? 28 : 42).forEach((line) => {
      commands.push(`TEXT 16,${y},"${font}",0,${scale},${scale},"${line}"`);
      y += scale > 1 ? 36 : 24;
    });
  };

  write(sticker.companyName, '3', 1);
  if (sticker.companyMeta) write(sticker.companyMeta, '1', 1);
  write(sticker.badge, '2', 1);
  if (sticker.holdBanner) write(sticker.holdBanner, '2', 1);
  write(sticker.barcode, '3', 1);
  write(sticker.itemTitle, '2', 1);
  write(sticker.specLine, '1', 1);
  write(`Net Qty / Weight: ${sticker.qtyText}`, '2', 1);
  if (sticker.grossLine) write(sticker.grossLine, '1', 1);
  if (sticker.lengthLine) write(sticker.lengthLine, '1', 1);
  sticker.details.forEach((line) => write(line.text, '1', 1));

  const qrY = 16;
  commands.push(`QRCODE 560,${qrY},M,4,A,0,"${tsplQuote(sticker.barcode)}"`);
  commands.push(`BARCODE 16,700,"128",70,1,0,2,2,"${tsplQuote(sticker.barcode)}"`);
  commands.push('PRINT 1,1');
  return `${commands.join('\r\n')}\r\n`;
}

export function buildTestTspl({ gapMm = 3, printerName = 'TSC TE244' } = {}) {
  return buildTsplLabel({
    companyName: 'Samyak sticker test',
    companyMeta: printerName,
    badge: 'TEST',
    holdBanner: '',
    barcode: 'QZ-TEST',
    itemTitle: 'TSC TE244 4x4 test',
    specLine: `Gap ${gapMm} mm`,
    qtyText: '1 Pcs',
    grossLine: '',
    lengthLine: '',
    details: [{ text: 'If this label feeds, gap and size are calibrated.' }],
  }, { gapMm });
}
