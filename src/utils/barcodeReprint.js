/**
 * Reprint a sticker that was already printed.
 * The barcode on the label is the one already stored. This does not mint a
 * code and it does not write a roll, a lot, or stock.
 */

import { codeKey, codeText } from './barcodeCode.js';
import { BARCODE_SOURCE, isRetiredBarcode } from './barcodeRegistry.js';
import { isFinishedGoodsStock } from './finishedGoods.js';
import { labelRoll } from './printRunCompletion.js';
import { isReusablePrintedLot } from './printingSfgLot.js';
import { isScrapLabelCandidate } from './scrapIdentity.js';
import { prepareStoreStickerRoll } from './thermalBarcodePrinter.js';

function text(value) {
  const raw = codeText(value);
  if (!raw || raw === '-' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'undefined') return '';
  return raw;
}

function positive(value) {
  if (value === undefined || value === null || value === '' || value === '-') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number;
}

function sameCode(left, right) {
  const key = codeKey(left);
  return Boolean(key) && key === codeKey(right);
}

export function isLotHeaderBarcode(code) {
  return /^SFG-LOT-/i.test(text(code));
}

function listing(row) {
  return {
    table: text(row?.sourceTable),
    column: text(row?.sourceColumn),
    module: text(row?.sourceModule),
    barcode: text(row?.barcode),
  };
}

/**
 * A list row that is a physical sticker. Lot headers, cylinder ids, scrap,
 * and barcodes that are only mentioned on another document are not.
 */
export function isReprintableBarcodeRow(row) {
  const { table, column, module, barcode } = listing(row);
  if (!barcode || isRetiredBarcode(row) || isLotHeaderBarcode(barcode)) return false;
  if (module === BARCODE_SOURCE.scrap || table === 'sfg_scrap_items') return false;
  if (module === BARCODE_SOURCE.cylinders || table === 'cylinders') return false;
  if (module === BARCODE_SOURCE.production || table === 'production_records') return false;
  if (module === BARCODE_SOURCE.input || column === 'input_barcode_ids') return false;
  if (module === BARCODE_SOURCE.issues || table === 'store_issue_transactions') return false;
  if (module === BARCODE_SOURCE.adjust || table === 'stock_adjustments') return false;
  if (module === BARCODE_SOURCE.inventory || table === 'inventory') return false;
  if (table === 'delivery_challans' || column === 'consumption_history') return false;

  if (table === 'inventory_rolls') return column === 'barcode_id' || column === 'barcode' || column === '';
  if (table === 'sfg_goods' || table === 'fg_goods' || table === 'sfg_fg_store') return true;
  if (table === 'grn_line_items') return true;
  if (table === 'grns') return column === 'barcodes' || column === 'barcode_id' || column === 'rolls';
  if (table === 'custom_barcodes') return true;
  if (table === 'dispatch_shipments') return true;
  if (table === 'sfg_qc_hold_items') return true;

  if (!table) {
    return [
      BARCODE_SOURCE.rm,
      BARCODE_SOURCE.sfg,
      BARCODE_SOURCE.fg,
      BARCODE_SOURCE.child,
      BARCODE_SOURCE.print,
      BARCODE_SOURCE.dispatch,
      BARCODE_SOURCE.hold,
      BARCODE_SOURCE.store,
    ].includes(module);
  }
  return false;
}

function findRoll(barcode, rolls) {
  return (rolls || []).find((roll) => (
    sameCode(roll?.barcodeId, barcode) || sameCode(roll?.id, barcode) || sameCode(roll?.barcode, barcode)
  )) || null;
}

function findGrnRoll(barcode, grns) {
  for (const grn of grns || []) {
    const lines = Array.isArray(grn?.lineItems) && grn.lineItems.length
      ? grn.lineItems
      : [{ rolls: grn?.itemsBreakdown || grn?.rolls || [], itemName: grn?.itemName, ...grn }];
    for (const line of lines) {
      for (const roll of Array.isArray(line?.rolls) ? line.rolls : []) {
        const code = text(roll?.barcodeId || roll?.barcode);
        if (sameCode(code, barcode)) return { grn, line, roll };
      }
    }
  }
  return null;
}

function findBatch(barcode, goods) {
  return (goods || []).find((item) => {
    if (!item || isReusablePrintedLot(item) || isLotHeaderBarcode(item.sfgBatchCode || item.fgBatchCode)) return false;
    return sameCode(item.sfgBatchCode, barcode) || sameCode(item.fgBatchCode, barcode);
  }) || null;
}

function findChild(barcode, goods) {
  for (const lot of goods || []) {
    const children = [
      ...(Array.isArray(lot?.childRolls) ? lot.childRolls.map((roll) => ({ roll, balance: false })) : []),
      ...(Array.isArray(lot?.runBalanceRolls) ? lot.runBalanceRolls.map((roll) => ({ roll, balance: true })) : []),
    ];
    for (const entry of children) {
      if (sameCode(entry.roll?.barcodeId || entry.roll?.id || entry.roll?.barcode, barcode)) {
        return { lot, ...entry };
      }
    }
  }
  return null;
}

function findDispatch(barcode, shipments) {
  for (const shipment of shipments || []) {
    const items = Array.isArray(shipment?.items) ? shipment.items : [];
    const item = items.find((row) => sameCode(row?.barcodeId || row?.barcode || row?.sfgBatchCode, barcode));
    if (item) return { shipment, item };
  }
  return null;
}

function findHold(barcode, items) {
  return (items || []).find((item) => (
    sameCode(item?.barcodeId, barcode)
    || sameCode(item?.sfgBatchCode, barcode)
    || sameCode(item?.holdTagId, barcode)
    || sameCode(item?.barcode, barcode)
  )) || null;
}

function findCustom(barcode, rows) {
  const list = Array.isArray(rows) ? rows : Object.values(rows || {});
  return list.find((row) => (
    row && (sameCode(row.barcode, barcode) || sameCode(row.barcodeId, barcode) || sameCode(row.id, barcode))
  )) || null;
}

function metersOf(record, barcode) {
  if (!record || typeof record !== 'object') return null;
  const own = positive(record.lengthMeters ?? record.meters);
  if (own !== null) return own;
  if (isReusablePrintedLot(record) || isLotHeaderBarcode(record.sfgBatchCode)) return null;
  const code = text(record.sfgBatchCode || record.fgBatchCode || record.barcodeId || record.barcode);
  if (barcode && sameCode(code, barcode)) return positive(record.totalMeters);
  return null;
}

function weightOf(record) {
  if (!record || typeof record !== 'object') return null;
  return positive(record.netWeightKg)
    ?? positive(record.availableWeightKg)
    ?? positive(record.availableKg)
    ?? positive(record.totalNetKg)
    ?? positive(record.totalHoldKg)
    ?? positive(record.remainingHoldKg);
}

function fillGaps(primary, extras, barcode) {
  const next = { ...primary };
  extras.filter(Boolean).forEach((extra) => {
    if (!text(next.itemName)) next.itemName = text(extra.itemName || extra.jobName || extra.description);
    if (!text(next.jobName)) next.jobName = text(extra.jobName);
    if (!text(next.jobCode)) next.jobCode = text(extra.jobCode);
    if (!text(next.orderId)) next.orderId = text(extra.orderId);
    if (!text(next.clientName)) next.clientName = text(extra.clientName || extra.customerName);
    if (!text(next.filmType)) next.filmType = text(extra.filmType);
    if (!text(next.vendorName)) next.vendorName = text(extra.vendorName || extra.supplier);
    if (!text(next.invoiceNo)) next.invoiceNo = text(extra.invoiceNo);
    if (!text(next.batchNo)) next.batchNo = text(extra.batchNo || extra.heatNo);
    if (!text(next.category)) next.category = text(extra.category);
    if (!text(next.vendorRollNo)) next.vendorRollNo = text(extra.vendorRollNo);
    if (!text(next.itemRemarks)) next.itemRemarks = text(extra.itemRemarks || extra.remarks || extra.notes);
    if (!text(next.holdReason)) next.holdReason = text(extra.holdReason);
    if (positive(next.micron) === null && positive(extra.micron) !== null) next.micron = extra.micron;
    if (positive(next.widthMm) === null && positive(extra.widthMm) !== null) next.widthMm = extra.widthMm;
    if (weightOf(next) === null && weightOf(extra) !== null) next.netWeightKg = weightOf(extra);
    if (positive(next.grossWeightKg) === null && positive(extra.grossWeightKg ?? extra.totalGrossKg) !== null) {
      next.grossWeightKg = extra.grossWeightKg ?? extra.totalGrossKg;
    }
    if ((next.tareWeightKg === undefined || next.tareWeightKg === null || next.tareWeightKg === '')
      && extra.tareWeightKg !== undefined && extra.tareWeightKg !== null && extra.tareWeightKg !== '') {
      next.tareWeightKg = extra.tareWeightKg;
    }
    if (metersOf(next, barcode) === null && metersOf(extra, barcode) !== null) next.lengthMeters = metersOf(extra, barcode);
    if (positive(next.purchaseRatePerKg) === null && positive(extra.purchaseRatePerKg ?? extra.purchaseRate ?? extra.unitPrice) !== null) {
      next.purchaseRatePerKg = extra.purchaseRatePerKg ?? extra.purchaseRate ?? extra.unitPrice;
    }
    if (!next.unitNo && extra.unitNo) next.unitNo = extra.unitNo;
    if (!next.inwardDatetime && !next.createdAt) next.inwardDatetime = extra.inwardDatetime || extra.createdAt || extra.receivedDate || extra.date || '';
  });
  return next;
}

function fromChild(found, barcode) {
  const { lot, roll, balance } = found;
  const rollNo = roll?.rollNo || roll?.unitNo;
  const named = text(roll?.itemName);
  const itemName = named || (balance
    ? `${text(roll?.filmType || lot?.filmType) || 'Film'} roll - Remaining Balance Roll`
    : (text(lot?.jobName) && rollNo ? `${lot.jobName} - Printed SFG Roll ${rollNo}` : text(lot?.jobName)));
  return {
    barcodeId: barcode,
    itemName,
    jobName: text(roll?.jobName || lot?.jobName),
    jobCode: text(roll?.jobCode || lot?.jobCode),
    orderId: text(roll?.orderId || lot?.orderId),
    clientName: text(roll?.clientName || lot?.clientName),
    filmType: text(roll?.filmType || lot?.filmType),
    micron: roll?.micron ?? lot?.micron,
    widthMm: roll?.widthMm ?? lot?.widthMm,
    rollType: balance ? 'RAW_MATERIAL' : (roll?.rollType || 'SEMI_FINISHED_GOODS'),
    category: balance ? 'Raw Material (RM)' : (roll?.category || 'Semi-Finished Goods (SFG)'),
    sfgType: balance ? '' : (roll?.sfgType || 'Printed Rolls'),
    netWeightKg: roll?.netWeightKg,
    grossWeightKg: roll?.grossWeightKg,
    lengthMeters: roll?.lengthMeters ?? roll?.meters,
    balanceRoll: balance || undefined,
    kind: balance ? 'balance' : 'printed_sfg',
    inwardDatetime: roll?.inwardDatetime || roll?.createdAt || '',
  };
}

function fromGrn(pack, barcode) {
  const { grn, line, roll } = pack;
  return {
    barcodeId: barcode,
    itemName: text(line?.itemName || grn?.itemName),
    rollType: 'RAW_MATERIAL',
    category: text(line?.category || grn?.category) || 'Film Substrates',
    filmType: text(line?.filmType || grn?.filmType),
    micron: line?.micron ?? grn?.micron,
    widthMm: line?.widthMm ?? grn?.widthMm,
    vendorName: text(grn?.vendorName),
    invoiceNo: text(grn?.invoiceNo),
    batchNo: text(line?.batchNo || grn?.batchNo),
    purchaseRatePerKg: line?.purchaseRate ?? grn?.purchaseRatePerKg ?? grn?.purchaseRate ?? grn?.unitPrice,
    vendorRollNo: roll?.vendorRollNo,
    netWeightKg: roll?.netWeightKg,
    grossWeightKg: roll?.grossWeightKg,
    tareWeightKg: roll?.tareWeightKg,
    lengthMeters: roll?.lengthMeters,
    itemRemarks: roll?.itemRemarks,
    unitNo: roll?.unitNo,
    unit: line?.unit || grn?.unit || 'Kg',
    packagingType: line?.packagingType || grn?.packagingType || 'Roll',
    stationId: 'SCALE_1_INWARD',
    inwardDatetime: grn?.receivedDate || grn?.createdAt || '',
  };
}

function fromHold(item, barcode) {
  return {
    ...item,
    barcodeId: barcode,
    isQCHold: true,
    status: 'QC_HOLD',
    rollType: item?.rollType || 'QC_HOLD',
    netWeightKg: weightOf(item) ?? 0,
    itemName: text(item?.itemName || item?.jobName),
    jobName: text(item?.jobName),
  };
}

function pin(sticker, barcode) {
  return { ...sticker, id: barcode, barcodeId: barcode };
}

function isBalance(barcode, draft) {
  return /-BAL$/i.test(barcode)
    || draft?.balanceRoll === true
    || draft?.kind === 'balance'
    || /remaining balance/i.test(text(draft?.itemName));
}

function isHold(barcode, draft) {
  return Boolean(draft?.isQCHold) || draft?.status === 'QC_HOLD' || draft?.rollType === 'QC_HOLD' || /^QCHOLD-/i.test(barcode);
}

function isPrintedSfg(barcode, draft) {
  if (isFinishedGoodsStock({ ...draft, barcodeId: barcode, sfgBatchCode: draft?.sfgBatchCode || barcode })) return false;
  if (/^SFG-/i.test(barcode) || draft?.kind === 'printed_sfg') return true;
  const type = text(draft?.rollType).toUpperCase();
  return type === 'SFG' || type === 'SEMI_FINISHED_GOODS' || type === 'SFG_PRINTED' || type === 'SFG_LAMINATED';
}

function shape(draft, barcode, rolls) {
  if (/^FG-DISP-/i.test(barcode) || draft?.rollType === 'FG_DISPATCH') return pin(draft, barcode);
  if (isHold(barcode, draft)) {
    return pin(prepareStoreStickerRoll({ ...draft, barcodeId: barcode, isQCHold: true, status: 'QC_HOLD' }, rolls), barcode);
  }
  const balance = isBalance(barcode, draft);
  const prepared = prepareStoreStickerRoll({
    ...draft,
    barcodeId: barcode,
    rollType: balance ? 'RAW_MATERIAL' : draft.rollType,
    lengthMeters: metersOf(draft, barcode),
  }, rolls);
  if (balance || isPrintedSfg(barcode, prepared)) {
    const tagged = labelRoll({
      ...prepared,
      barcodeId: barcode,
      rollType: balance ? 'RAW_MATERIAL' : prepared.rollType,
      netWeightKg: weightOf(prepared) ?? weightOf(draft) ?? 0,
      lengthMeters: metersOf(prepared, barcode),
      totalMeters: undefined,
      consumedWeightKg: undefined,
      consumedKg: undefined,
    }, {
      jobName: text(prepared.jobName),
      jobCode: text(prepared.jobCode),
      orderId: text(prepared.orderId),
      clientName: text(prepared.clientName || prepared.customerName),
      filmType: text(prepared.filmType),
    });
    return pin(tagged, barcode);
  }
  return pin(prepared, barcode);
}

function assemble(barcode, sources, row) {
  const rolls = sources.inventoryRolls || [];
  const goods = [...(sources.sfgGoods || []), ...(sources.fgGoods || [])];
  const roll = findRoll(barcode, rolls);
  const batch = findBatch(barcode, goods);
  const child = findChild(barcode, goods);
  const grn = findGrnRoll(barcode, sources.grns);
  const dispatch = findDispatch(barcode, sources.dispatchShipments);
  const hold = findHold(barcode, sources.qcHoldItems);
  const custom = findCustom(barcode, sources.customBarcodes);
  const table = text(row?.sourceTable);
  const moduleName = text(row?.sourceModule);

  if (table === 'dispatch_shipments') {
    if (dispatch?.item) return pin({ ...dispatch.item, barcodeId: barcode }, barcode);
    if (/^FG-DISP-/i.test(barcode) && roll) return pin({ ...roll, rollType: roll.rollType || 'FG_DISPATCH' }, barcode);
    return null;
  }
  if (table === 'sfg_qc_hold_items' || moduleName === BARCODE_SOURCE.hold) {
    if (!hold) return null;
    return shape(fromHold(hold, barcode), barcode, rolls);
  }

  let primary = null;
  if (roll) primary = { ...roll };
  else if (child) primary = fromChild(child, barcode);
  else if (batch) primary = { ...batch, barcodeId: barcode };
  else if (grn) primary = fromGrn(grn, barcode);
  else if (custom) primary = { ...custom, barcodeId: barcode, itemName: text(custom.itemName || custom.description) };
  else if (hold) primary = fromHold(hold, barcode);
  else if (dispatch?.item) primary = { ...dispatch.item, barcodeId: barcode };
  else return null;

  const grnFacts = grn ? fromGrn(grn, barcode) : null;
  const childFacts = child ? fromChild(child, barcode) : null;
  const draft = fillGaps(primary, [
    childFacts,
    grnFacts,
    batch && !isLotHeaderBarcode(batch.sfgBatchCode) ? batch : null,
    custom,
    hold,
    row?.description ? { itemName: row.description } : null,
    row?.createdAt ? { inwardDatetime: row.createdAt } : null,
  ], barcode);
  if (!draft.inwardDatetime && !draft.createdAt && !draft.date && text(row?.createdAt)) {
    draft.inwardDatetime = row.createdAt;
  }
  return shape(draft, barcode, rolls);
}

/** Sticker data for one list row, or null when that row is not a label. */
export function reprintStickerForRow(row, sources = {}) {
  if (!isReprintableBarcodeRow(row)) return null;
  const barcode = text(row.barcode);
  const sticker = assemble(barcode, sources, row);
  if (!sticker || !sameCode(sticker.barcodeId, barcode)) return null;
  if (isScrapLabelCandidate(sticker) || isLotHeaderBarcode(sticker.barcodeId)) return null;
  return sticker;
}
