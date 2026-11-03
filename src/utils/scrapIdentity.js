import { codeKey } from './barcodeCode.js';

/**
 * Scrap from SFG/FG is a weight record, not a labelled roll.
 * A new scrap row keeps its id, source, weight, rate, and remarks.
 * It does not receive a barcode, a sticker, or a registry row.
 * Codes already stored on older scrap rows are left in place.
 */

const BARCODE_FIELDS = ['barcode', 'barcodeId', 'barcode_id', 'sfgBatchCode', 'sfg_batch_code', 'fgBatchCode', 'fg_batch_code'];

const BARCODE_SHAPED = /^(sfg|fg|rm|con|qchold|qc-hold|scrap|adj|bar|cyl|sku-cyl|fg-disp)-/i;

export function isBarcodeShaped(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (BARCODE_SHAPED.test(text)) return true;
  return /-bal$/i.test(text);
}

export function finiteRate(...values) {
  for (const value of values) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return Math.round((number + Number.EPSILON) * 100) / 100;
  }
  return null;
}

export function scrapValueRs(qty, rate) {
  const kg = Number(qty);
  if (rate == null || !Number.isFinite(kg)) return null;
  return Math.round((kg * rate + Number.EPSILON) * 100) / 100;
}

/** Identifier shown for a scrap row. New ids are not barcode-shaped. */
export function scrapInternalRef(item) {
  const id = String(item?.id || '').trim();
  const explicit = String(item?.internalRef || '').trim();
  const chosen = explicit || id;
  if (!chosen) return '';
  if (!isBarcodeShaped(chosen)) return chosen;
  return `ref:${chosen}`;
}

export function scrapSourceRecordId(item) {
  const candidates = [
    item?.sourceRecordId,
    item?.productionRecordId,
    item?.parentSfgId,
    item?.parentQcHoldId,
    item?.holdTagId
  ];
  for (const value of candidates) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

/** Barcode already stored on an older scrap row. Never invented. */
export function legacyScrapBarcode(item) {
  if (!item || typeof item !== 'object') return '';
  for (const key of [...BARCODE_FIELDS, 'holdTagId']) {
    const text = String(item[key] ?? '').trim();
    if (text && isBarcodeShaped(text)) return text;
  }
  return '';
}

/**
 * Payload for a new or updated scrap row.
 * Barcode fields are omitted. An older barcode-shaped hold tag is kept
 * only as the source roll reference, not as a new scrap barcode.
 */
export function withoutScrapBarcode(entry = {}) {
  const next = { ...entry };
  BARCODE_FIELDS.forEach((key) => {
    delete next[key];
  });
  const hold = String(next.holdTagId || '').trim();
  if (hold) {
    if (!next.sourceRecordId) next.sourceRecordId = hold;
    if (isBarcodeShaped(hold) && !String(next.sourceRollBarcode || '').trim()) next.sourceRollBarcode = hold;
    delete next.holdTagId;
  }
  const rate = finiteRate(next.ratePerKg);
  const value = next.valueRs == null || next.valueRs === ''
    ? scrapValueRs(next.scrapQtyKg, rate)
    : finiteRate(next.valueRs);
  next.ratePerKg = rate;
  next.valueRs = value;
  next.internalRef = scrapInternalRef(next);
  if (!next.sourceRecordId) {
    const source = scrapSourceRecordId(next);
    if (source) next.sourceRecordId = source;
  }
  return next;
}

/** Re-saving a scrap row must not wipe a barcode that was already stored. */
export function preserveLegacyScrapFields(next, existing) {
  const fresh = withoutScrapBarcode(next);
  if (!existing || typeof existing !== 'object') return fresh;
  const kept = { ...fresh };
  for (const key of [...BARCODE_FIELDS, 'holdTagId']) {
    const previous = existing[key];
    if (previous != null && String(previous).trim() !== '') kept[key] = previous;
  }
  if (!kept.sourceRollBarcode && isBarcodeShaped(existing.sourceRollBarcode)) {
    kept.sourceRollBarcode = existing.sourceRollBarcode;
  }
  return kept;
}

export function findScrapForScan(items, query) {
  const key = codeKey(query);
  if (!key) return null;
  const list = Array.isArray(items) ? items : [];
  const legacy = list.find((item) => codeKey(legacyScrapBarcode(item)) === key);
  if (legacy) return legacy;
  return list.find((item) => {
    const keys = [item?.id, item?.internalRef, scrapInternalRef(item)]
      .map((value) => codeKey(value))
      .filter(Boolean);
    return keys.includes(key);
  }) || null;
}

export function scrapScanCard(item, { matchedLegacy = false } = {}) {
  const ref = scrapInternalRef(item);
  const kg = Number(item?.scrapQtyKg);
  const rate = finiteRate(item?.ratePerKg);
  const value = item?.valueRs == null || item?.valueRs === ''
    ? scrapValueRs(kg, rate)
    : finiteRate(item?.valueRs);
  const legacy = legacyScrapBarcode(item);
  return {
    type: 'SCRAP',
    scrap: true,
    printable: false,
    notStock: true,
    entityCategory: 'Scrap store',
    badgeColor: '#b91c1c',
    badgeBg: '#fef2f2',
    title: item?.jobName || item?.defectCategory || 'Scrap',
    code: ref || String(item?.id || ''),
    message: matchedLegacy
      ? 'This sticker was printed for scrap before scrap stopped using barcodes. The scrap record is still in the store. It is not a stock roll, and no new barcode is printed.'
      : 'This is a scrap record. Scrap does not have a barcode. It is not a stock roll.',
    properties: [
      { label: 'Internal reference', value: ref || '—', isCode: true },
      { label: 'Source record', value: scrapSourceRecordId(item) || '—' },
      { label: 'Scrap weight', value: Number.isFinite(kg) ? `${kg} kg` : '—', isHighlight: true },
      { label: 'Rate', value: rate == null ? '—' : `₹ ${rate} / kg` },
      { label: 'Value', value: value == null ? '—' : `₹ ${value}` },
      { label: 'Defect / remarks', value: String(item?.defectCategory || item?.type || item?.scrapReason || '—') },
      { label: 'Legacy sticker', value: matchedLegacy && legacy ? legacy : 'None' }
    ]
  };
}

export function isScrapLabelCandidate(roll) {
  if (!roll || typeof roll !== 'object') return false;
  if (roll.scrap === true || roll.isScrap === true) return true;
  if (roll.printable === false && roll.type === 'SCRAP') return true;
  const id = String(roll.id || '');
  if (
    id.startsWith('print-scrap:')
    || id.startsWith('scrapref:')
    || id.startsWith('SCRAP-ITEM-')
    || id.startsWith('SCRAP-LOG-')
    || id.startsWith('ref:SCRAP-')
  ) return true;
  if (String(roll.sourceModule || '') === 'SFG scrap') return true;
  const kind = `${roll.rollType || ''} ${roll.category || ''} ${roll.sfgType || ''} ${roll.source || ''}`.toLowerCase();
  if (/\bscrap\b/.test(kind) && !String(roll.barcodeId || roll.sfgBatchCode || '').trim()) return true;
  return false;
}

/** Raw-material rolls, SFG/FG batches, and balance (-BAL) rolls stay. Scrap does not. */
export function rollsEligibleForBarcodeLabel(rolls) {
  return (Array.isArray(rolls) ? rolls : (rolls ? [rolls] : [])).filter((roll) => roll && !isScrapLabelCandidate(roll));
}
