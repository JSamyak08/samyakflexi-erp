/**
 * Read-only comparison of finished child rolls weighed at slitting or pouching
 * against the same rolls weighed on a dispatch packing list and issued on a
 * delivery challan.
 *
 * Matching is by roll barcode. A packing-list line matches a slitted roll when
 * sourceFgBarcode, or otherwise barcodeId, is that roll's FG/SFG barcode.
 * FG-DISP- codes are packing-list labels, not slitting barcodes.
 * A matched line is Dispatched when its packing list id (dispatchId or id) is
 * on a delivery challan (linkedPackingListIds, linkedPackingListId, or an item
 * packingListId). Otherwise it is still on the packing list. A slitted roll
 * with no packing-list line is still at the factory.
 *
 * Balance rolls (barcode ending -BAL, or a balance-roll type) are leftover
 * stock, not finished child rolls, so they are listed and left out of the
 * totals. Scrap is wastage with no dispatch barcode and is left out entirely.
 * Kg kept on the parent lot (balanceKeptKg) is the same kind of leftover.
 *
 * When no packing-list line for the job carries a slitting barcode, totals
 * fall back to the packing-list weights and per-roll status is not invented.
 *
 * Final loss or gain is dispatched net minus slitted net once any of the job
 * is on a delivery challan. Until then it is weighed net minus slitted net.
 * Positive is a gain. The difference is within tolerance when it is inside
 * ±SLIT_DISPATCH_TOLERANCE_KG or inside ±SLIT_DISPATCH_TOLERANCE_PCT.
 */

import { codeKey, codeText } from './barcodeCode.js';
import { isFinishedGoodsStock } from './finishedGoods.js';

export const SLIT_DISPATCH_TOLERANCE_PCT = 0.5;
export const SLIT_DISPATCH_TOLERANCE_KG = 0.5;

export const ROLL_STATUS = {
  DISPATCHED: 'dispatched',
  ON_PACKING_LIST: 'on_packing_list',
  PENDING_FACTORY: 'pending_factory',
  UNMATCHED_PACKING_LIST: 'unmatched_packing_list',
  JOB_TOTALS: 'job_totals',
  NO_ROLL_BARCODE: 'no_roll_barcode'
};

const STATUS_LABEL = {
  [ROLL_STATUS.DISPATCHED]: 'Dispatched',
  [ROLL_STATUS.ON_PACKING_LIST]: 'On packing list, not dispatched',
  [ROLL_STATUS.PENDING_FACTORY]: 'Pending at factory, not weighed',
  [ROLL_STATUS.UNMATCHED_PACKING_LIST]: 'On packing list, no slitted roll',
  [ROLL_STATUS.JOB_TOTALS]: 'Not matched individually',
  [ROLL_STATUS.NO_ROLL_BARCODE]: 'No roll barcode — job totals only'
};

export function toleranceStatement(tolerancePct = SLIT_DISPATCH_TOLERANCE_PCT, toleranceKg = SLIT_DISPATCH_TOLERANCE_KG) {
  const pct = Number(tolerancePct);
  const kg = Number(toleranceKg);
  return `Within tolerance when the difference is within ±${kg} kg or within ±${pct}%.`;
}

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function formatSignedKg(value) {
  const number = round2(value);
  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(2)} kg`;
}

export function formatSignedPct(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const number = round2(value);
  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(2)}%`;
}

export function withinSlitDispatchTolerance(differenceKg, differencePct, tolerancePct = SLIT_DISPATCH_TOLERANCE_PCT, toleranceKg = SLIT_DISPATCH_TOLERANCE_KG) {
  if (Math.abs(round2(differenceKg)) <= Number(toleranceKg)) return true;
  if (differencePct != null && Number.isFinite(Number(differencePct)) && Math.abs(round2(differencePct)) <= Number(tolerancePct)) {
    return true;
  }
  return false;
}

function cleanId(value) {
  return codeText(value).replace(/^PR-/i, '').replace(/^REC-/i, '').trim().toLowerCase();
}

function jobKeysFrom(source, keys) {
  if (!source || typeof source !== 'object') return;
  [source.id, source.orderId, source.order_id].forEach((value) => {
    const id = cleanId(value);
    if (id && id !== 'n/a') keys.ids.add(id);
  });
  const code = codeText(source.jobCode || source.job_code).toLowerCase();
  if (code) keys.codes.add(code);
  const name = codeText(source.jobName || source.job_name).toLowerCase();
  if (name) keys.names.add(name);
}

function buildJobKeys(record, order) {
  const keys = { ids: new Set(), codes: new Set(), names: new Set() };
  jobKeysFrom(record, keys);
  jobKeysFrom(order, keys);
  return keys;
}

function rowIdentity(row) {
  const id = cleanId(row?.orderId || row?.order_id);
  const code = codeText(row?.jobCode || row?.job_code).toLowerCase();
  const name = codeText(row?.jobName || row?.job_name).toLowerCase();
  return { id, code, name, hasIdentity: Boolean((id && id !== 'n/a') || code || name) };
}

function matchesJob(row, keys) {
  const identity = rowIdentity(row);
  if (!identity.hasIdentity) return false;
  if (identity.id && identity.id !== 'n/a') return keys.ids.has(identity.id);
  if (identity.code && keys.codes.has(identity.code)) return true;
  if (identity.name && keys.names.has(identity.name)) return true;
  return false;
}

export function orderForRecord(record, orders = []) {
  if (!record) return null;
  return (orders || []).find((order) => (
    (record.orderId && String(order?.id) === String(record.orderId))
    || (record.jobCode && codeText(order?.jobCode).toUpperCase() === codeText(record.jobCode).toUpperCase() && codeText(record.jobCode))
    || (record.jobName && codeText(order?.jobName).toLowerCase() === codeText(record.jobName).toLowerCase() && codeText(record.jobName))
  )) || null;
}

function isKgUnit(unit) {
  const value = codeText(unit || 'Kg').toLowerCase();
  return value === 'kg' || value === 'kgs' || value === 'kilogram' || value === 'kilograms' || value === '';
}

export function isBalanceRoll(row) {
  if (!row || typeof row !== 'object') return false;
  const code = codeText(row.sfgBatchCode || row.barcodeId || row.barcode || row.sfg_batch_code || row.barcode_id);
  if (/-BAL$/i.test(code) || row.balanceRoll === true) return true;
  const type = `${row.sfgType || ''} ${row.sfg_type || ''} ${row.rollType || ''} ${row.roll_type || ''} ${row.category || ''}`.toLowerCase();
  return type.includes('balance roll') || type.includes('balance_roll');
}

export function isScrapRoll(row) {
  if (!row || typeof row !== 'object') return false;
  const id = codeText(row.id || row.sfgBatchCode || row.barcodeId).toLowerCase();
  if (id.startsWith('scrapref:') || id.startsWith('scrap-') || id.startsWith('scrap_')) return true;
  const type = `${row.sfgType || ''} ${row.sfg_type || ''} ${row.category || ''} ${row.rollType || ''} ${row.roll_type || ''} ${row.status || ''}`.toLowerCase();
  return type.includes('scrap');
}

function isDispatchLabel(row) {
  const type = codeText(row?.rollType || row?.roll_type).toUpperCase().replace(/[\s-]+/g, '_');
  if (type === 'FG_DISPATCH') return true;
  const code = codeText(row?.sfgBatchCode || row?.barcodeId || row?.barcode || row?.sfg_batch_code);
  return /^FG-DISP-/i.test(code);
}

export function isMatchableRollBarcode(code) {
  const text = codeText(code);
  if (!text) return false;
  if (/^FG-DISP-/i.test(text)) return false;
  if (/-BAL$/i.test(text)) return false;
  if (/^scrap/i.test(text)) return false;
  return /^(FG|SFG)-/i.test(text);
}

export function packingItemRollBarcode(item) {
  const source = codeText(item?.sourceFgBarcode || item?.source_fg_barcode);
  if (isMatchableRollBarcode(source)) return source;
  const id = codeText(item?.barcodeId || item?.barcode || item?.sfgBatchCode || item?.sfg_batch_code);
  if (isMatchableRollBarcode(id)) return id;
  return '';
}

function stageBlob(row) {
  return `${row?.stage || ''} ${row?.targetProcess || ''} ${row?.notes || ''} ${row?.notesText || ''} ${row?.remarks || ''}`.toLowerCase();
}

function producedAtSlitOrPouch(row) {
  const stage = codeText(row?.stage || row?.targetProcess).toLowerCase();
  const blob = stageBlob(row);
  const mentionsSlit = blob.includes('slitting') || blob.includes('pouching');
  if (stage && !mentionsSlit) return false;
  if (!stage && (blob.includes('lamination') || blob.includes('printing')) && !mentionsSlit) return false;
  return true;
}

function stageLabelOf(row) {
  const stage = codeText(row?.stage || row?.targetProcess);
  if (stage) return stage;
  const blob = stageBlob(row);
  if (blob.includes('pouching')) return 'Pouching / Bag Making';
  if (blob.includes('slitting')) return 'Slitting & Rewinding';
  return 'Finished goods';
}

function finiteOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? round2(number) : null;
}

function slitNetKg(row) {
  const net = finiteOrNull(row?.totalNetKg ?? row?.total_net_kg);
  if (net != null) return net;
  const alt = finiteOrNull(row?.netWeightKg ?? row?.net_weight_kg);
  if (alt != null) return alt;
  return 0;
}

function itemNetKg(item) {
  const net = finiteOrNull(item?.netWeightKg);
  if (net != null) return net;
  const snake = finiteOrNull(item?.net_weight_kg);
  if (snake != null) return snake;
  if (isKgUnit(item?.unit || item?.uom || 'Kg')) {
    const qty = finiteOrNull(item?.quantity);
    if (qty != null) return qty;
  }
  return 0;
}

function rollBarcodeOf(row) {
  return codeText(row?.sfgBatchCode || row?.sfg_batch_code || row?.barcodeId || row?.barcode_id || row?.barcode);
}

function isFgChild(row) {
  if (!row || isScrapRoll(row) || isBalanceRoll(row) || isDispatchLabel(row)) return false;
  if (!isFinishedGoodsStock(row)) return false;
  return producedAtSlitOrPouch(row);
}

function challanLabel(dc) {
  return codeText(dc?.challanNo || dc?.challan_no || dc?.dcNo || dc?.id);
}

function packingListRefs(dc) {
  const refs = [];
  if (Array.isArray(dc?.linkedPackingListIds)) refs.push(...dc.linkedPackingListIds);
  if (dc?.linkedPackingListId) refs.push(dc.linkedPackingListId);
  (dc?.items || []).forEach((item) => {
    if (item?.packingListId) refs.push(item.packingListId);
    if (item?.packing_list_id) refs.push(item.packing_list_id);
  });
  return refs.map((value) => codeText(value).toLowerCase()).filter(Boolean);
}

function buildChallanIndex(deliveryChallans) {
  const index = new Map();
  (deliveryChallans || []).forEach((dc) => {
    const label = challanLabel(dc);
    packingListRefs(dc).forEach((ref) => {
      const existing = index.get(ref) || [];
      if (label && !existing.includes(label)) existing.push(label);
      index.set(ref, existing);
    });
  });
  return index;
}

function shipmentRefKeys(shipment) {
  return [shipment?.dispatchId, shipment?.dispatch_id, shipment?.id]
    .map((value) => codeText(value).toLowerCase())
    .filter(Boolean);
}

function challansForShipment(shipment, index) {
  const labels = [];
  shipmentRefKeys(shipment).forEach((key) => {
    (index.get(key) || []).forEach((label) => {
      if (!labels.includes(label)) labels.push(label);
    });
  });
  return labels;
}

function outputRollsFromLog(log) {
  if (Array.isArray(log?.outputRolls) && log.outputRolls.length > 0) return log.outputRolls.filter(Boolean);
  if (log?.outputRoll) return [log.outputRoll];
  return [];
}

function harvestLogs(parent, keys, addCandidate) {
  const logs = [
    ...(Array.isArray(parent?.consumptionHistory) ? parent.consumptionHistory : []),
    ...(Array.isArray(parent?.sfgConsumptions) ? parent.sfgConsumptions : [])
  ];
  logs.forEach((log) => {
    const stage = codeText(log?.targetProcess || log?.stage);
    if (!/slitting|pouching/i.test(stage)) return;
    const parentMatches = matchesJob(parent, keys) || matchesJob(log, keys);
    if (!parentMatches) return;
    outputRollsFromLog(log).forEach((out) => {
      addCandidate({
        sfgBatchCode: out.barcode || out.barcodeId,
        barcodeId: out.barcode || out.barcodeId,
        totalNetKg: out.netWeightKg,
        netWeightKg: out.netWeightKg,
        stage: out.stage || stage,
        orderId: out.orderId || log.orderId || parent.orderId,
        jobCode: out.jobCode || log.jobCode || parent.jobCode,
        jobName: out.jobName || log.jobName || parent.jobName,
        rollType: 'FG',
        sfgType: 'Finished Goods (FG)',
        category: 'Finished Goods (FG)',
        notes: `Finished Goods derived from ${stage}`
      }, 'log');
    });
  });
}

function collectSlitRolls({ record, order, sfgGoods, inventoryRolls, keys }) {
  const byBarcode = new Map();
  const balanceByBarcode = new Map();
  const balanceKept = [];
  const scrapKeys = new Set();
  const rank = { log: 1, inventory: 2, sfg: 3 };

  const addCandidate = (row, source) => {
    if (!row || typeof row !== 'object') return;
    if (isScrapRoll(row)) {
      if (matchesJob(row, keys)) scrapKeys.add(codeKey(rollBarcodeOf(row) || row.id || source));
      return;
    }
    const belongs = matchesJob(row, keys);
    if (!belongs && source !== 'log') return;
    if (isBalanceRoll(row)) {
      if (!belongs) return;
      const barcode = rollBarcodeOf(row) || '(balance roll)';
      if (!balanceByBarcode.has(codeKey(barcode))) {
        balanceByBarcode.set(codeKey(barcode), {
          barcode,
          netKg: slitNetKg(row),
          reason: 'Leftover balance roll, not a finished child roll'
        });
      }
      return;
    }
    if (!isFgChild(row)) return;
    const barcode = rollBarcodeOf(row);
    if (!isMatchableRollBarcode(barcode)) return;
    const key = codeKey(barcode);
    const next = {
      barcode,
      slittedNetKg: slitNetKg(row),
      stage: stageLabelOf(row),
      source
    };
    const current = byBarcode.get(key);
    if (!current || rank[source] >= rank[current.source]) {
      byBarcode.set(key, next);
    }
  };

  (sfgGoods || []).forEach((row) => {
    addCandidate(row, 'sfg');
    const kept = finiteOrNull(row?.balanceKeptKg);
    if (kept != null && kept > 0 && matchesJob(row, keys) && !isFgChild(row) && !isScrapRoll(row)) {
      balanceKept.push({
        barcode: rollBarcodeOf(row) || '(parent lot)',
        netKg: kept,
        reason: codeText(row.balanceReason) || 'Kept on the parent lot'
      });
    }
    harvestLogs(row, keys, addCandidate);
  });
  (inventoryRolls || []).forEach((row) => addCandidate(row, 'inventory'));
  harvestLogs(record, keys, addCandidate);
  harvestLogs(order, keys, addCandidate);

  return {
    rolls: Array.from(byBarcode.values()).sort((a, b) => a.barcode.localeCompare(b.barcode)),
    balanceRolls: Array.from(balanceByBarcode.values()),
    balanceKept,
    scrapExcludedCount: scrapKeys.size
  };
}

function collectPackingItems(shipments, keys, challanIndex) {
  const items = [];
  (shipments || []).forEach((shipment) => {
    const shipmentMatches = matchesJob(shipment, keys);
    const labels = challansForShipment(shipment, challanIndex);
    const dispatched = labels.length > 0;
    const packingListId = codeText(shipment?.dispatchId || shipment?.dispatch_id || shipment?.id);
    const lines = Array.isArray(shipment?.items) ? shipment.items : [];
    if (lines.length === 0) {
      if (!shipmentMatches) return;
      items.push({
        headerOnly: true,
        barcode: '',
        displayBarcode: '',
        netKg: finiteOrNull(shipment?.totalNetWeightKg ?? shipment?.total_net_weight_kg) || 0,
        rollCount: Number(shipment?.totalRolls || shipment?.total_rolls) || 0,
        packingListId,
        challanNo: labels.join(', '),
        dispatched,
        shipment
      });
      return;
    }
    lines.forEach((line) => {
      const lineHasIdentity = rowIdentity(line).hasIdentity;
      const include = lineHasIdentity ? matchesJob(line, keys) : shipmentMatches;
      if (!include) return;
      const barcode = packingItemRollBarcode(line);
      items.push({
        headerOnly: false,
        barcode,
        displayBarcode: barcode || codeText(line?.barcodeId || line?.barcode || line?.sourceFgBarcode),
        netKg: itemNetKg(line),
        rollCount: 1,
        packingListId,
        challanNo: labels.join(', '),
        dispatched,
        noRollBarcode: !barcode
      });
    });
  });
  return items;
}

function chooseLine(lines) {
  const dispatched = lines.filter((line) => line.dispatched);
  return (dispatched.length ? dispatched : lines)[0];
}

function differencePct(differenceKg, baseKg) {
  if (!(baseKg > 0)) return null;
  return round2((differenceKg / baseKg) * 100);
}

function directionOf(differenceKg) {
  const number = round2(differenceKg);
  if (number > 0) return 'gain';
  if (number < 0) return 'loss';
  return 'even';
}

function rowFromSlit(slit, line) {
  if (!line) {
    return {
      barcode: slit.barcode,
      status: ROLL_STATUS.PENDING_FACTORY,
      statusLabel: STATUS_LABEL[ROLL_STATUS.PENDING_FACTORY],
      slittedNetKg: slit.slittedNetKg,
      packingNetKg: null,
      varianceKg: null,
      packingListId: '',
      challanNo: '',
      stage: slit.stage,
      noRollBarcode: false
    };
  }
  const status = line.dispatched ? ROLL_STATUS.DISPATCHED : ROLL_STATUS.ON_PACKING_LIST;
  return {
    barcode: slit.barcode,
    status,
    statusLabel: STATUS_LABEL[status],
    slittedNetKg: slit.slittedNetKg,
    packingNetKg: line.netKg,
    varianceKg: round2(line.netKg - slit.slittedNetKg),
    packingListId: line.packingListId,
    challanNo: line.challanNo,
    stage: slit.stage,
    noRollBarcode: false,
    duplicateWeighCount: line.duplicateWeighCount || 1
  };
}

export function reconciliationBadge(result) {
  if (!result?.hasAlarm) return null;
  if (result.missedWhileOthersDispatched) return { tone: 'danger', label: 'Dispatch gap' };
  if (result.pendingAtFactoryCount > 0 && result.dispatchedCount === 0) {
    return { tone: 'warn', label: 'Pending dispatch' };
  }
  if (!result.withinTolerance) {
    return { tone: result.direction === 'gain' ? 'warn' : 'danger', label: result.direction === 'gain' ? 'Weight gain' : 'Weight loss' };
  }
  if (result.unmatchedCount > 0) return { tone: 'warn', label: 'Unmatched roll' };
  return { tone: 'warn', label: 'Check rolls' };
}

export function reconcileSlitDispatch({
  record = null,
  order = null,
  sfgGoods = [],
  inventoryRolls = [],
  shipments = [],
  deliveryChallans = [],
  tolerancePct = SLIT_DISPATCH_TOLERANCE_PCT,
  toleranceKg = SLIT_DISPATCH_TOLERANCE_KG
} = {}) {
  const keys = buildJobKeys(record, order);
  const collected = collectSlitRolls({ record, order, sfgGoods, inventoryRolls, keys });
  const challanIndex = buildChallanIndex(deliveryChallans);
  const packingItems = collectPackingItems(shipments, keys, challanIndex);
  const lineItems = packingItems.filter((item) => !item.headerOnly);
  const headerItems = packingItems.filter((item) => item.headerOnly);
  const barcodedLines = lineItems.filter((item) => item.barcode);
  const jobTotals = barcodedLines.length === 0 && (lineItems.length > 0 || headerItems.length > 0);
  const matchMode = barcodedLines.length > 0 ? 'barcode' : (jobTotals ? 'job_totals' : 'none');

  const linesByBarcode = new Map();
  barcodedLines.forEach((line) => {
    const key = codeKey(line.barcode);
    const group = linesByBarcode.get(key) || [];
    group.push(line);
    linesByBarcode.set(key, group);
  });

  const usedLineKeys = new Set();
  let rows = [];

  if (matchMode === 'barcode') {
    collected.rolls.forEach((slit) => {
      const group = linesByBarcode.get(codeKey(slit.barcode)) || [];
      if (group.length === 0) {
        rows.push(rowFromSlit(slit, null));
        return;
      }
      const chosen = chooseLine(group);
      usedLineKeys.add(codeKey(slit.barcode));
      rows.push(rowFromSlit(slit, { ...chosen, duplicateWeighCount: group.length }));
    });
    linesByBarcode.forEach((group, key) => {
      if (usedLineKeys.has(key)) return;
      const chosen = chooseLine(group);
      rows.push({
        barcode: chosen.barcode,
        status: ROLL_STATUS.UNMATCHED_PACKING_LIST,
        statusLabel: STATUS_LABEL[ROLL_STATUS.UNMATCHED_PACKING_LIST],
        slittedNetKg: null,
        packingNetKg: chosen.netKg,
        varianceKg: null,
        packingListId: chosen.packingListId,
        challanNo: chosen.challanNo,
        stage: '',
        noRollBarcode: false,
        duplicateWeighCount: group.length
      });
    });
    lineItems.filter((item) => item.noRollBarcode).forEach((item) => {
      rows.push({
        barcode: item.displayBarcode || '(no roll barcode)',
        status: ROLL_STATUS.UNMATCHED_PACKING_LIST,
        statusLabel: STATUS_LABEL[ROLL_STATUS.UNMATCHED_PACKING_LIST],
        slittedNetKg: null,
        packingNetKg: item.netKg,
        varianceKg: null,
        packingListId: item.packingListId,
        challanNo: item.challanNo,
        stage: '',
        noRollBarcode: true
      });
    });
  } else if (matchMode === 'job_totals') {
    rows = collected.rolls.map((slit) => ({
      barcode: slit.barcode,
      status: ROLL_STATUS.JOB_TOTALS,
      statusLabel: STATUS_LABEL[ROLL_STATUS.JOB_TOTALS],
      slittedNetKg: slit.slittedNetKg,
      packingNetKg: null,
      varianceKg: null,
      packingListId: '',
      challanNo: '',
      stage: slit.stage,
      noRollBarcode: false
    }));
    lineItems.forEach((item) => {
      rows.push({
        barcode: item.displayBarcode || '(no roll barcode)',
        status: ROLL_STATUS.NO_ROLL_BARCODE,
        statusLabel: STATUS_LABEL[ROLL_STATUS.NO_ROLL_BARCODE],
        slittedNetKg: null,
        packingNetKg: item.netKg,
        varianceKg: null,
        packingListId: item.packingListId,
        challanNo: item.dispatched ? item.challanNo : '',
        stage: '',
        noRollBarcode: true
      });
    });
  } else {
    rows = collected.rolls.map((slit) => rowFromSlit(slit, null));
  }

  const slittedNetKg = round2(collected.rolls.reduce((sum, roll) => sum + roll.slittedNetKg, 0));
  const slittedRollCount = collected.rolls.length;

  let weighedNetKg = 0;
  let weighedRollCount = 0;
  let dispatchedNetKg = 0;
  let dispatchedRollCount = 0;

  if (matchMode === 'barcode') {
    rows.forEach((row) => {
      if (row.packingNetKg == null) return;
      weighedNetKg += row.packingNetKg;
      weighedRollCount += 1;
      const issued = row.status === ROLL_STATUS.DISPATCHED
        || (row.status === ROLL_STATUS.UNMATCHED_PACKING_LIST && row.challanNo);
      if (issued) {
        dispatchedNetKg += row.packingNetKg;
        dispatchedRollCount += 1;
      }
    });
  } else if (lineItems.length > 0) {
    lineItems.forEach((item) => {
      weighedNetKg += item.netKg;
      weighedRollCount += item.rollCount || 1;
      if (item.dispatched) {
        dispatchedNetKg += item.netKg;
        dispatchedRollCount += item.rollCount || 1;
      }
    });
  } else {
    headerItems.forEach((item) => {
      weighedNetKg += item.netKg;
      weighedRollCount += item.rollCount || 0;
      if (item.dispatched) {
        dispatchedNetKg += item.netKg;
        dispatchedRollCount += item.rollCount || 0;
      }
    });
  }
  weighedNetKg = round2(weighedNetKg);
  dispatchedNetKg = round2(dispatchedNetKg);

  const anyDispatched = dispatchedNetKg > 0 || dispatchedRollCount > 0;
  const comparisonBasis = anyDispatched ? 'dispatched' : 'weighed';
  const comparisonNetKg = comparisonBasis === 'dispatched' ? dispatchedNetKg : weighedNetKg;
  const differenceKg = round2(comparisonNetKg - slittedNetKg);
  const pct = differencePct(differenceKg, slittedNetKg);
  const withinTolerance = withinSlitDispatchTolerance(differenceKg, pct, tolerancePct, toleranceKg);
  const direction = directionOf(differenceKg);

  const paired = rows.filter((row) => row.slittedNetKg != null && row.packingNetKg != null && row.status !== ROLL_STATUS.UNMATCHED_PACKING_LIST);
  const scaleBase = round2(paired.reduce((sum, row) => sum + row.slittedNetKg, 0));
  const scaleDifferenceKg = paired.length ? round2(paired.reduce((sum, row) => sum + (row.packingNetKg - row.slittedNetKg), 0)) : null;
  const scaleDifferencePct = scaleDifferenceKg == null ? null : differencePct(scaleDifferenceKg, scaleBase);

  const pendingAtFactoryCount = rows.filter((row) => row.status === ROLL_STATUS.PENDING_FACTORY).length;
  const onPackingListCount = rows.filter((row) => row.status === ROLL_STATUS.ON_PACKING_LIST).length;
  const dispatchedCount = rows.filter((row) => row.status === ROLL_STATUS.DISPATCHED).length;
  const unmatchedCount = matchMode === 'barcode'
    ? rows.filter((row) => row.status === ROLL_STATUS.UNMATCHED_PACKING_LIST).length
    : 0;

  const missedWhileOthersDispatched = dispatchedRollCount > 0 && (
    pendingAtFactoryCount > 0
    || onPackingListCount > 0
    || (matchMode === 'job_totals' && slittedRollCount > weighedRollCount)
  );

  const alarms = [];
  if (missedWhileOthersDispatched) {
    alarms.push('Some child rolls are still at the factory or not on a delivery challan, while other rolls of this job were dispatched.');
  } else if (pendingAtFactoryCount > 0) {
    alarms.push('Child rolls are pending at the factory and have not been weighed for dispatch.');
  }
  if (unmatchedCount > 0) {
    alarms.push('A packing-list roll does not match a slitted child roll. Check the barcode before the roll leaves.');
  }
  if (!withinTolerance && (slittedNetKg > 0 || comparisonNetKg > 0)) {
    const side = comparisonBasis === 'dispatched' ? 'Dispatched' : 'Weighed';
    alarms.push(`${side} net differs from slitted net by ${formatSignedKg(differenceKg)} (${formatSignedPct(pct)}), outside ±${toleranceKg} kg and ±${tolerancePct}%.`);
  }
  if (matchMode === 'job_totals' && slittedRollCount > weighedRollCount && !missedWhileOthersDispatched) {
    alarms.push('Packing lists have no roll barcodes, and the weighed roll count is below the slitted roll count. Some child rolls may still be at the factory.');
  }

  const hasWork = slittedRollCount > 0 || weighedRollCount > 0 || weighedNetKg > 0;
  const hasAlarm = hasWork && alarms.length > 0;

  let jobTotalsReason = '';
  if (matchMode === 'job_totals') {
    jobTotalsReason = lineItems.length > 0
      ? 'Packing list items for this job do not carry roll barcodes, so slitting and dispatch are compared as job totals. Per-roll status is not available.'
      : 'This packing list has no itemised rolls, so slitting and dispatch are compared from the packing-list totals.';
  }

  return {
    tolerancePct: Number(tolerancePct),
    toleranceKg: Number(toleranceKg),
    toleranceText: toleranceStatement(tolerancePct, toleranceKg),
    matchMode,
    jobTotalsReason,
    slittedNetKg,
    slittedRollCount,
    weighedNetKg,
    weighedRollCount,
    dispatchedNetKg,
    dispatchedRollCount,
    comparisonBasis,
    comparisonNetKg,
    differenceKg,
    differencePct: pct,
    direction,
    withinTolerance,
    scaleDifferenceKg,
    scaleDifferencePct,
    scaleRollCount: paired.length,
    rows,
    balanceRolls: collected.balanceRolls,
    balanceKept: collected.balanceKept,
    balanceKeptKg: round2(collected.balanceKept.reduce((sum, row) => sum + row.netKg, 0)),
    scrapExcludedCount: collected.scrapExcludedCount,
    pendingAtFactoryCount,
    onPackingListCount,
    dispatchedCount,
    unmatchedCount,
    missedWhileOthersDispatched,
    hasAlarm,
    alarms
  };
}
