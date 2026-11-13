import { codeKey, codeStartsWith, codeText } from './barcodeCode.js';
import { formatPlantDateTime } from './dbDates.js';

export const EMPTY_TRACE_MESSAGE = 'No consumption records linked';

const PLACEHOLDER_GRN = new Set([
  'grn-store',
  'grn-2026-store',
  'grn-ink-store',
  'passed & approved'
]);

function blank(value) {
  const text = codeText(value);
  if (!text) return '';
  if (/^(n\/a|na|null|undefined|-)$/i.test(text)) return '';
  if (PLACEHOLDER_GRN.has(text.toLowerCase())) return '';
  return text;
}

function same(left, right) {
  const a = codeKey(left);
  const b = codeKey(right);
  return Boolean(a) && a === b;
}

function cleanJob(value) {
  return blank(String(value ?? '').split('|||')[0]);
}

function normJob(value) {
  return codeKey(cleanJob(value));
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codeText(value));
}

function pushCode(list, value) {
  const text = blank(value);
  if (!text || looksLikeUuid(text)) return;
  list.push(text);
}

function uniqueCodes(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((value) => {
    const text = blank(value);
    const key = codeKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

/** Screen text for a stored date. Display strings that are already readable stay as stored. */
export function readablePlantDate(value) {
  if (value === undefined || value === null || value === '') return '';
  let text = String(value).trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text)) text = text.replace(' ', 'T');
  return formatPlantDateTime(text) || '';
}

export function shipmentVehicle(shipment) {
  return blank(shipment?.vehicleNo)
    || blank(shipment?.vehicle_no)
    || blank(shipment?.vehicleNumber)
    || blank(shipment?.vehicle_number)
    || blank(shipment?.truckNo)
    || '';
}

export function shipmentLr(shipment) {
  return blank(shipment?.lrNo)
    || blank(shipment?.lr_no)
    || blank(shipment?.lrNumber)
    || blank(shipment?.lr_number)
    || blank(shipment?.waybillNo)
    || blank(shipment?.waybill)
    || '';
}

export function shipmentDispatchDate(shipment) {
  return readablePlantDate(shipment?.dispatchDate || shipment?.dispatch_date);
}

export function qcStatusTone(status) {
  const text = codeKey(status);
  if (!text || text === 'n/a') return { color: '#475569', background: '#f1f5f9' };
  if (/reject|hold|fail/.test(text)) return { color: '#b91c1c', background: '#fef2f2' };
  if (/pending|progress/.test(text)) return { color: '#b45309', background: '#fffbeb' };
  if (/pass|approv/.test(text)) return { color: '#047857', background: '#ecfdf5' };
  return { color: '#1d4ed8', background: '#eff6ff' };
}

function grnKeys(grn) {
  return [grn?.id, grn?.grnNo, grn?.grn_number, grn?.grnNumber, grn?.grn_no]
    .map(codeKey)
    .filter(Boolean);
}

/** Exact GRN id or number only. A material name or category never selects a receipt. */
export function exactGrnMatch(grns, ...ids) {
  const wanted = new Set(ids.map(codeKey).filter(Boolean));
  if (!wanted.size) return null;
  return (grns || []).find((grn) => grnKeys(grn).some((key) => wanted.has(key))) || null;
}

function rollMeta(roll) {
  const meta = roll?.metadata;
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
}

function parentBarcode(roll) {
  const meta = rollMeta(roll);
  return blank(roll?.parentBarcodeId || roll?.parentBarcode || meta.parentBarcodeId || meta.parentBarcode);
}

export function grnForRoll(grns, roll) {
  if (!roll) return null;
  const meta = rollMeta(roll);
  const direct = exactGrnMatch(grns, roll.grnId, roll.grn_id, roll.grnNo, roll.grn_no, meta.grnNo);
  if (direct) return direct;
  const invoice = codeKey(roll.invoiceNo || roll.invoice_no);
  if (!invoice) return null;
  const matches = (grns || []).filter((grn) => codeKey(grn.invoiceNo || grn.invoice_number || grn.invoiceNumber) === invoice);
  return matches.length === 1 ? matches[0] : null;
}

function rollBarcode(roll) {
  return blank(roll?.barcodeId || roll?.barcode || roll?.id);
}

function isBalanceRoll(roll) {
  if (!roll) return false;
  const code = codeKey(rollBarcode(roll));
  if (code.endsWith('-bal')) return true;
  if (rollMeta(roll).balanceRoll === true) return true;
  const parent = parentBarcode(roll);
  if (!parent) return false;
  const name = codeKey(roll.itemName || roll.item_name);
  return name.includes('balance roll') || name.includes('remaining balance');
}

function isProducedRoll(roll) {
  if (!roll) return false;
  const type = codeKey(roll.rollType || roll.roll_type || roll.sfgType);
  const category = codeKey(roll.category);
  const code = rollBarcode(roll);
  if (type.includes('semi') || type === 'sfg' || type.includes('finish') || type === 'fg' || type === 'fg_dispatch') return true;
  if (category.includes('semi-finished') || category.includes('finished goods')) return true;
  if (codeStartsWith(code, 'SFG-') || codeStartsWith(code, 'FG-')) return true;
  return false;
}

function isRawInward(roll) {
  if (!roll || isBalanceRoll(roll) || isProducedRoll(roll)) return false;
  const type = codeKey(roll.rollType || roll.roll_type);
  const category = codeKey(roll.category);
  const code = rollBarcode(roll);
  if (type === 'raw_material' || type === 'rm' || type === 'consumable_item') return true;
  if (category.includes('film') || category.includes('raw material') || category.includes('ink') || category.includes('solvent') || category.includes('adhesive') || category.includes('chemical')) return true;
  if (codeStartsWith(code, 'RM-') || codeStartsWith(code, 'CON-BC')) return true;
  return Boolean(blank(roll.grnId || roll.grn_id || roll.grnNo || roll.grn_no || rollMeta(roll).grnNo));
}

function indexRolls(rolls) {
  const map = new Map();
  (rolls || []).forEach((roll) => {
    [roll?.barcodeId, roll?.barcode, roll?.id].forEach((value) => {
      const key = codeKey(value);
      if (key && !map.has(key)) map.set(key, roll);
    });
  });
  return map;
}

function asIssue(row) {
  if (!row || typeof row !== 'object') return null;
  const kind = codeKey(row.entryKind || row.entry_kind);
  if (kind && kind !== 'issue') return null;
  const barcode = blank(row.barcode || row.barcodeId);
  if (!barcode) return null;
  return {
    barcode,
    orderId: blank(row.orderId || row.order_id),
    jobName: cleanJob(row.jobName || row.job_name),
    productionRecordId: blank(row.productionRecordId || row.production_record_id),
    itemName: blank(row.itemName || row.item_name),
    category: blank(row.category),
    vendorName: blank(row.vendorName || row.vendor_name || row.vendor),
    invoiceNo: blank(row.invoiceNo || row.invoice_no || row.invoiceNumber),
    batchNo: blank(row.batchNo || row.batch_no || row.lotNo),
    grnNo: blank(row.grnNo || row.grn_no || row.grnNumber),
    filmType: blank(row.filmType || row.film_type),
    micron: row.micron
  };
}

function rootRoll(roll, rollIndex) {
  let current = roll;
  const seen = new Set();
  for (let hop = 0; hop < 8 && current; hop += 1) {
    const key = codeKey(rollBarcode(current));
    if (key) seen.add(key);
    const parentKey = codeKey(parentBarcode(current));
    if (!parentKey || seen.has(parentKey)) break;
    const parent = rollIndex.get(parentKey);
    if (!parent) break;
    current = parent;
  }
  return current;
}

function filmLabel(row) {
  if (!row) return '';
  const film = blank(row.filmType || row.film_type);
  const micron = Number(row.micron);
  if (film && Number.isFinite(micron) && micron > 0) return `${film} ${micron}µ`;
  return film;
}

function materialRow(roll, ctx, issue) {
  const meta = rollMeta(roll);
  let grn = grnForRoll(ctx.grns, roll);
  if (!grn && issue) grn = exactGrnMatch(ctx.grns, issue.grnNo);
  const name = blank(roll?.itemName || roll?.item_name) || blank(issue?.itemName) || filmLabel(roll) || filmLabel(issue) || 'Material';
  const barcode = rollBarcode(roll) || blank(issue?.barcode);
  const displayName = barcode && !name.includes(barcode) ? `${name} · ${barcode}` : name;
  const storedGrn = blank(roll?.grnNo || roll?.grn_no || meta.grnNo);
  const documentGrn = blank(grn?.grnNo || grn?.grn_number || grn?.grnNumber || grn?.id);
  const grnNo = documentGrn || storedGrn || 'N/A';
  const vendor = blank(roll?.vendorName || roll?.vendor)
    || blank(issue?.vendorName)
    || blank(grn?.vendorName || grn?.vendor_name)
    || 'N/A';
  const invoice = blank(roll?.invoiceNo || roll?.invoice_no)
    || blank(issue?.invoiceNo)
    || blank(grn?.invoiceNo || grn?.invoice_number || grn?.invoiceNumber)
    || 'N/A';
  const batch = blank(roll?.batchNo || roll?.lotNo || roll?.batch_no)
    || blank(issue?.batchNo)
    || blank(grn?.batchNo || grn?.batch_no)
    || 'N/A';
  const received = readablePlantDate(roll?.inwardDatetime || roll?.inward_datetime || roll?.productionDate || roll?.production_date)
    || readablePlantDate(issue?.receivedDate || issue?.inwardDate)
    || readablePlantDate(grn?.received_date || grn?.receivedDate)
    || 'N/A';
  const qc = blank(roll?.qcStatus || roll?.qc_status)
    || blank(grn?.qcStatus || grn?.qc_status)
    || 'N/A';
  const category = blank(roll?.category) || blank(issue?.category) || blank(grn?.category) || 'N/A';
  return {
    name: displayName,
    category,
    grnNo,
    vendorName: vendor,
    invoiceNo: invoice,
    batchNo: batch,
    receivedDate: received,
    qcStatus: qc,
    barcode
  };
}

function outputCodes(record) {
  const codes = [];
  [record?.outputRolls, record?.rollsBreakdown].forEach((list) => {
    (list || []).forEach((row) => pushCode(codes, row?.barcodeId || row?.barcode));
  });
  (record?.sfgConsumptions || []).forEach((log) => {
    pushCode(codes, log?.outputRoll?.barcode || log?.outputRoll?.barcodeId);
    pushCode(codes, log?.sfgBatchCode);
  });
  return codes;
}

function recordMentions(record, identity) {
  return outputCodes(record).some((code) => identity.has(codeKey(code)));
}

function logOutputCode(log) {
  return codeKey(log?.outputRoll?.barcode || log?.outputRoll?.barcodeId);
}

function logLotCode(log) {
  return codeKey(log?.sfgBatchCode || log?.sfg_batch_code);
}

function logReverted(log) {
  return /^reverted$/i.test(blank(log?.status));
}

function substratesFromLog(log) {
  const codes = [];
  ['substrate', 'substrate1', 'substrate2', 'substrate3'].forEach((key) => {
    const part = log?.[key];
    if (typeof part === 'string') pushCode(codes, part);
    else if (part && typeof part === 'object') pushCode(codes, part.barcode || part.barcodeId);
  });
  ['substrate2Rolls', 'substrate3Rolls', 'inputRolls', 'runConsumedRolls'].forEach((key) => {
    (log?.[key] || []).forEach((row) => pushCode(codes, row?.barcode || row?.barcodeId));
  });
  return codes;
}

function inputRollCodes(record) {
  const codes = [];
  (record?.inputRollsList || record?.input_rolls_list || []).forEach((row) => {
    pushCode(codes, row?.barcodeId || row?.barcode);
  });
  return codes;
}

function materialBarcodes(record) {
  const codes = [];
  (record?.materialsList || record?.materials_list || []).forEach((row) => {
    if (!row || typeof row !== 'object') return;
    pushCode(codes, row.barcode || row.barcodeId);
    if (!row.barcode && !row.barcodeId) {
      const id = blank(row.id);
      const print = id.match(/^print-film:[^:]+:(.+)$/i);
      const lam = id.match(/^lam-film:[^:]+:[^:]+:(.+)$/i);
      pushCode(codes, print?.[1] || lam?.[1]);
    }
  });
  return codes;
}

function candidateRecords(records, subject) {
  const all = Array.isArray(records) ? records : [];
  const mentioned = all.filter((record) => recordMentions(record, subject.identity));
  if (subject.orderId) {
    const byOrder = all.filter((record) => same(record?.orderId || record?.order_id, subject.orderId));
    const mentionedOnOrder = byOrder.filter((record) => recordMentions(record, subject.identity));
    const chosen = mentionedOnOrder.length ? mentionedOnOrder : byOrder;
    const extra = mentioned.filter((record) => {
      const orderId = blank(record?.orderId || record?.order_id);
      return !orderId || same(orderId, subject.orderId);
    });
    return uniqueRecords([...chosen, ...extra]);
  }
  if (mentioned.length) return mentioned;
  if (subject.jobName) {
    return all.filter((record) => normJob(record?.jobName || record?.job_name) === normJob(subject.jobName));
  }
  return [];
}

function uniqueRecords(records) {
  const seen = new Set();
  const out = [];
  records.forEach((record) => {
    const key = blank(record?.id) || `job:${normJob(record?.jobName)}:${codeKey(record?.orderId)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(record);
  });
  return out;
}

function relatedGoods(goods, subject) {
  return (goods || []).filter((good) => {
    const lot = codeKey(good?.sfgBatchCode || good?.id);
    if (lot && subject.identity.has(lot)) return true;
    if ((good?.childRolls || []).some((row) => subject.identity.has(codeKey(row?.barcodeId || row?.barcode)))) return true;
    if ((good?.consumptionHistory || []).some((log) => {
      const output = logOutputCode(log);
      const lotCode = logLotCode(log);
      return (output && subject.identity.has(output)) || (lotCode && subject.identity.has(lotCode));
    })) return true;
    return false;
  });
}

function issueBelongs(issue, subject, records) {
  if (subject.orderId && issue.orderId && same(issue.orderId, subject.orderId)) return true;
  if (issue.productionRecordId && records.some((record) => same(record?.id, issue.productionRecordId))) return true;
  if (issue.jobName && subject.jobName && normJob(issue.jobName) === normJob(subject.jobName)) return true;
  return false;
}

function consumptionPlan(ctx, subject, records) {
  const logs = [];
  records.forEach((record) => {
    (record?.sfgConsumptions || record?.sfg_consumptions || []).forEach((log) => {
      if (!logReverted(log)) logs.push(log);
    });
  });
  relatedGoods(ctx.sfgGoods, subject).forEach((good) => {
    (good?.consumptionHistory || []).forEach((log) => {
      if (!logReverted(log)) logs.push(log);
    });
  });

  const outputHits = logs.filter((log) => {
    const output = logOutputCode(log);
    return output && subject.identity.has(output);
  });
  const lotHits = outputHits.length
    ? outputHits
    : logs.filter((log) => {
      const lot = logLotCode(log);
      return lot && subject.identity.has(lot);
    });

  const specificCodes = [];
  lotHits.forEach((log) => specificCodes.push(...substratesFromLog(log)));
  if (lotHits.length) {
    records.forEach((record) => {
      if (outputCodes(record).some((code) => subject.identity.has(codeKey(code)) && !codeKey(code).startsWith('sfg-lot-'))) {
        specificCodes.push(...inputRollCodes(record));
      }
    });
    relatedGoods(ctx.sfgGoods, subject).forEach((good) => {
      (good?.runConsumedRolls || []).forEach((row) => pushCode(specificCodes, row?.barcodeId || row?.barcode));
    });
  }

  const otherLogCodes = new Set();
  if (lotHits.length) {
    const kept = new Set(specificCodes.map(codeKey));
    logs.forEach((log) => {
      if (lotHits.includes(log)) return;
      substratesFromLog(log).forEach((code) => {
        const key = codeKey(code);
        if (key && !kept.has(key)) otherLogCodes.add(key);
      });
    });
  }

  const codes = [...specificCodes];
  if (!lotHits.length) {
    records.forEach((record) => {
      codes.push(...inputRollCodes(record));
      codes.push(...materialBarcodes(record));
      (record?.sfgConsumptions || []).forEach((log) => {
        if (!logReverted(log)) codes.push(...substratesFromLog(log));
      });
    });
    relatedGoods(ctx.sfgGoods, subject).forEach((good) => {
      (good?.runConsumedRolls || []).forEach((row) => pushCode(codes, row?.barcodeId || row?.barcode));
      (good?.inputBarcodeIds || []).forEach((code) => pushCode(codes, code));
    });
    (subject.roll?.inputBarcodeIds || []).forEach((code) => pushCode(codes, code));
  } else {
    (subject.roll?.inputBarcodeIds || []).forEach((code) => {
      if (!codeKey(code).startsWith('sfg-lot-')) pushCode(codes, code);
    });
  }

  ctx.issues.forEach((issue) => {
    if (!issueBelongs(issue, subject, records)) return;
    const key = codeKey(issue.barcode);
    if (lotHits.length && otherLogCodes.has(key)) return;
    pushCode(codes, issue.barcode);
  });

  return uniqueCodes(codes).filter((code) => !subject.identity.has(codeKey(code)));
}

function buildSubject(ctx, barcode, explicit = {}) {
  const identityValues = [
    barcode,
    explicit.barcode,
    explicit.dispatchItem?.barcodeId,
    explicit.dispatchItem?.id,
    explicit.dispatchItem?.sourceFgBarcode,
    explicit.dispatchItem?.sourceFgId,
    explicit.roll?.barcodeId,
    explicit.roll?.id
  ];
  const identity = new Set();
  identityValues.forEach((value) => {
    const text = blank(value);
    if (!text || looksLikeUuid(text)) return;
    identity.add(codeKey(text));
  });
  let roll = explicit.roll || null;
  if (!roll) {
    for (const key of identity) {
      if (ctx.rollIndex.has(key)) {
        roll = ctx.rollIndex.get(key);
        break;
      }
    }
  } else {
    const indexed = ctx.rollIndex.get(codeKey(rollBarcode(roll)));
    if (indexed) roll = indexed;
  }
  (roll?.inputBarcodeIds || []).forEach((code) => {
    const key = codeKey(code);
    if (key.startsWith('sfg-lot-')) identity.add(key);
  });
  const orderId = blank(roll?.orderId || roll?.order_id)
    || blank(explicit.dispatchItem?.orderId)
    || blank(explicit.shipment?.orderId || explicit.shipment?.order_id)
    || blank(explicit.orderId);
  const jobName = cleanJob(roll?.jobName || roll?.job_name)
    || cleanJob(explicit.dispatchItem?.jobName)
    || cleanJob(explicit.shipment?.jobName || explicit.shipment?.job_name)
    || cleanJob(explicit.jobName);
  return { identity, roll, orderId, jobName };
}

function printDateFor(records, subject) {
  const mentioned = records.filter((record) => recordMentions(record, subject.identity));
  const pool = mentioned.length ? mentioned : (records.length === 1 ? records : []);
  for (const record of pool) {
    const formatted = readablePlantDate(
      record?.printingStartTime
      || record?.printingEndTime
      || record?.dateFilled
      || record?.date_filled
      || record?.recordedAt
    );
    if (formatted) return formatted;
  }
  return null;
}

function rowsForCode(code, ctx, depth, seen) {
  const key = codeKey(code);
  if (!key || seen.has(key) || depth > 5) return [];
  seen.add(key);
  const roll = ctx.rollIndex.get(key) || null;
  const issue = ctx.issueIndex.get(key) || null;
  if (roll && isProducedRoll(roll) && !isBalanceRoll(roll)) {
    const nested = buildSubject(ctx, rollBarcode(roll), { roll });
    const records = candidateRecords(ctx.productionRecords, nested);
    const children = consumptionPlan(ctx, nested, records).filter((child) => codeKey(child) !== key);
    const nestedRows = children.flatMap((child) => rowsForCode(child, ctx, depth + 1, seen));
    if (nestedRows.length) return nestedRows;
    return [];
  }
  if (roll) {
    const traced = isBalanceRoll(roll) ? rootRoll(roll, ctx.rollIndex) : roll;
    if (traced && isProducedRoll(traced) && !isBalanceRoll(traced)) return [];
    return [materialRow(traced, ctx, ctx.issueIndex.get(codeKey(rollBarcode(traced))) || issue)];
  }
  if (issue) return [materialRow(null, ctx, issue)];
  return [];
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  rows.forEach((row) => {
    const key = codeKey(row?.barcode) || `${codeKey(row?.grnNo)}|${codeKey(row?.name)}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(row);
  });
  return out;
}

/**
 * Raw-material rows for one scanned barcode.
 * Uses that barcode's consumption, store issue, ledger issue, and parent-roll lineage.
 * Never borrows the first GRNs, and never matches a receipt by material name.
 */
export function resolveBarcodeMaterials(input = {}) {
  const rolls = input.inventoryRolls || [];
  const issues = []
    .concat(input.storeIssues || [], input.ledgerEntries || [])
    .map(asIssue)
    .filter(Boolean);
  const ctx = {
    grns: input.grns || [],
    productionRecords: input.productionRecords || [],
    sfgGoods: input.sfgGoods || [],
    rolls,
    rollIndex: indexRolls(rolls),
    issues,
    issueIndex: new Map(issues.map((issue) => [codeKey(issue.barcode), issue]))
  };
  const subject = buildSubject(ctx, input.barcode, input);
  if (subject.roll && isBalanceRoll(subject.roll)) {
    const root = rootRoll(subject.roll, ctx.rollIndex);
    const row = root ? materialRow(root, ctx, ctx.issueIndex.get(codeKey(rollBarcode(root)))) : null;
    return {
      materialsUsed: row ? [row] : [],
      dateOfPrinting: null,
      jobName: subject.jobName,
      orderId: subject.orderId,
      traceabilityChecked: true
    };
  }
  if (subject.roll && isRawInward(subject.roll)) {
    return {
      materialsUsed: [materialRow(subject.roll, ctx, ctx.issueIndex.get(codeKey(rollBarcode(subject.roll))))],
      dateOfPrinting: null,
      jobName: subject.jobName,
      orderId: subject.orderId,
      traceabilityChecked: true
    };
  }
  const records = candidateRecords(ctx.productionRecords, subject);
  const codes = consumptionPlan(ctx, subject, records);
  const seen = new Set();
  const materialsUsed = dedupeRows(codes.flatMap((code) => rowsForCode(code, ctx, 0, seen)));
  return {
    materialsUsed,
    dateOfPrinting: printDateFor(records, subject),
    jobName: subject.jobName,
    orderId: subject.orderId,
    traceabilityChecked: true
  };
}
