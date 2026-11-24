/**
 * Roll-wise yield for one job.
 *
 * A printed lot (SFG-LOT-*) is the sum of its child rolls. It is a total
 * line, not another output, once those children are in the list.
 * Yield is reconciled per print run (each hold, then the final run) and
 * per later SFG consumption. A roll shows its own input barcodes only when
 * those barcodes were recorded on the roll. Otherwise every roll in the run
 * shows that run's yield, and the run's input is shared by output weight.
 */

import { isFinishedGoodsStock } from './finishedGoods.js';
import { inputRollWeightsFromLog } from './consumeMassBalance.js';
import {
  consumptionOutputTrace,
  outputRollsFromLog,
  resolveInputSubstrateBarcodes,
  substrate2InputRolls
} from './consumeRollEntries.js';
import { roundFilmKg } from './printingFilmIssue.js';

export const YIELD_BAND_SETTING_KEY = 'yield_sanity_bands';

export const DEFAULT_YIELD_BANDS = {
  printing: { minPct: 98, maxPct: 112 },
  inspection: { minPct: 98, maxPct: 112 },
  'lamination-1': { minPct: 98, maxPct: 112 },
  'lamination-2': { minPct: 98, maxPct: 112 },
  slitting: { minPct: 98, maxPct: 112 },
  pouching: { minPct: 98, maxPct: 112 },
  default: { minPct: 98, maxPct: 112 }
};

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return String(value ?? '').trim();
}

function cleanId(value) {
  return text(value).replace(/^PR-/i, '').replace(/^REC-/i, '').trim().toLowerCase();
}

function barcodeOf(roll) {
  return text(roll?.barcodeId || roll?.barcode || roll?.sfgBatchCode || roll?.sfg_batch_code || roll?.rollId || roll?.id);
}

function sameCode(left, right) {
  const a = text(left).toLowerCase();
  const b = text(right).toLowerCase();
  return Boolean(a) && a === b;
}

export function normalizeYieldBands(value) {
  const source = value && typeof value === 'object' ? value : {};
  const bands = { ...DEFAULT_YIELD_BANDS };
  Object.entries(source).forEach(([key, band]) => {
    const minPct = finite(band?.minPct);
    const maxPct = finite(band?.maxPct);
    if (minPct === null || maxPct === null || maxPct < minPct) return;
    bands[key] = { minPct, maxPct };
  });
  return bands;
}

export function yieldBandForProcess(bands, process) {
  const table = normalizeYieldBands(bands);
  return table[process] || table.default || DEFAULT_YIELD_BANDS.printing;
}

export function recoveryOutsideBand(recoveryPct, band) {
  if (!(Number(recoveryPct) > 0) || !band) return false;
  return recoveryPct < band.minPct - 0.001 || recoveryPct > band.maxPct + 0.001;
}

/** Ink that should land on the web: gsm × width × metres, in kilograms. */
export function expectedInkGainKg({ inkGsm, widthMm, meters } = {}) {
  const gsm = finite(inkGsm);
  const width = finite(widthMm);
  const length = finite(meters);
  if (!(gsm > 0) || !(width > 0) || !(length > 0)) return null;
  return roundFilmKg((gsm * (width / 1000) * length) / 1000);
}

export function isSummaryLot(roll) {
  const barcode = barcodeOf(roll);
  if (/^SFG-LOT-/i.test(barcode)) return true;
  const children = Array.isArray(roll?.childRolls) ? roll.childRolls : (Array.isArray(roll?.child_rolls) ? roll.child_rolls : []);
  if (children.length > 0) return true;
  const count = finite(roll?.rollsCount ?? roll?.rolls_count) || 0;
  if (count > 0 && (roll?.sfgBatchCode || roll?.sfg_batch_code || roll?.isPrintedLot)) return true;
  return false;
}

function childCodesOf(lot) {
  const children = Array.isArray(lot?.childRolls) ? lot.childRolls : (Array.isArray(lot?.child_rolls) ? lot.child_rolls : []);
  return children.map((child) => barcodeOf(child)).filter(Boolean);
}

function orderMatches(roll, cleanOrderId, jobCode, jobName) {
  const rOrderId = cleanId(roll?.orderId || roll?.order_id);
  const rJobCode = text(roll?.jobCode || roll?.job_code).toLowerCase();
  const rJobName = text(roll?.jobName || roll?.job_name).toLowerCase();
  const barcode = barcodeOf(roll).toLowerCase();
  return (cleanOrderId && rOrderId && rOrderId === cleanOrderId)
    || (cleanOrderId && barcode.includes(cleanOrderId))
    || (jobCode && rJobCode && rJobCode === jobCode)
    || (jobName && rJobName && (rJobName.includes(jobName) || jobName.includes(rJobName)));
}

function asOutputRoll(roll, context) {
  const barcode = barcodeOf(roll);
  if (!barcode) return null;
  if (barcode.startsWith('RM-IN-') || barcode.startsWith('mat-') || barcode === 'null' || barcode === 'undefined') return null;
  const rType = text(roll.rollType || roll.roll_type || roll.sfgType || roll.sfg_type || roll.category).toLowerCase();
  const isExplicitRm = rType.includes('raw') || rType === 'rm' || rType.includes('chemical') || rType.includes('ink') || rType.includes('solvent') || barcode.startsWith('CON-');
  if (isExplicitRm && !barcode.startsWith('SFG-') && !barcode.startsWith('FG-')) return null;
  const isRealSfgOrFg = rType.includes('sfg') || rType.includes('semi') || rType.includes('fg') || rType.includes('finish') || rType.includes('printed') || barcode.startsWith('SFG-') || barcode.startsWith('FG-');
  if (!isRealSfgOrFg && !isSummaryLot(roll)) return null;
  const netKg = finite(roll.netWeightKg ?? roll.total_net_kg ?? roll.totalNetKg ?? roll.availableWeightKg ?? roll.available_weight_kg) || 0;
  const grossKg = finite(roll.grossWeightKg ?? roll.total_gross_kg ?? roll.totalGrossKg) || 0;
  if (netKg <= 0 && grossKg <= 0) return null;
  const isFg = isFinishedGoodsStock({
    rollType: roll.rollType || roll.roll_type,
    sfgType: roll.sfgType || roll.sfg_type,
    category: roll.category,
    sfgBatchCode: barcode,
    barcodeId: barcode
  });
  return {
    ...roll,
    id: barcode,
    barcodeId: barcode,
    rollType: isFg ? 'FG' : 'SFG',
    category: isFg ? 'Finished Goods (FG)' : 'Semi-Finished Goods (SFG)',
    netWeightKg: netKg,
    grossWeightKg: grossKg,
    tareWeightKg: finite(roll.tareWeightKg ?? roll.tare_weight_kg) || 0,
    lengthMeters: finite(roll.lengthMeters ?? roll.meters ?? roll.totalMeters),
    filmType: roll.filmType || roll.film_type || context.filmType || '',
    micron: finite(roll.micron ?? context.micron),
    widthMm: finite(roll.widthMm ?? roll.width_mm ?? context.widthMm),
    qcStatus: roll.qcStatus || roll.qc_status || 'Approved',
    locationBay: roll.locationBay || roll.storageBay || roll.storage_bay || (isFg ? 'FG Warehouse' : 'SFG Store'),
    inputSubstrateBarcodes: resolveInputSubstrateBarcodes(roll),
    inputRollsTraceability: roll.inputRollsTraceability || [],
    printSegment: roll.printSegment || roll.metadata?.printSegment || roll.stage || ''
  };
}

function normalizeInput(roll, source) {
  const barcodeId = text(roll?.barcodeId || roll?.barcode);
  if (!barcodeId || barcodeId.startsWith('RM-IN-') || barcodeId.startsWith('mat-')) return null;
  const consumed = finite(roll?.consumedWeightKg ?? roll?.consumedWeight ?? roll?.consumedKg) || 0;
  const initial = finite(roll?.initialWeightKg ?? roll?.initialWeight ?? roll?.initialKg) || consumed;
  if (!(consumed > 0) && !(initial > 0)) return null;
  return {
    id: roll.id || barcodeId,
    barcodeId,
    filmType: roll.filmType || '',
    micron: finite(roll.micron),
    widthMm: finite(roll.widthMm),
    initialWeightKg: initial || consumed,
    consumedWeightKg: consumed || initial,
    lengthMeters: finite(roll.lengthMeters ?? roll.length_meters ?? roll.meters),
    source: source || roll.source || ''
  };
}

function holdHistory(order) {
  if (Array.isArray(order?.printHoldHistory)) return order.printHoldHistory;
  if (Array.isArray(order?.jobDetails?.printHoldHistory)) return order.jobDetails.printHoldHistory;
  return [];
}

function processOfStage(stage) {
  const textValue = text(stage).toLowerCase();
  if (textValue.includes('pass 2') || textValue.includes('second')) return 'lamination-2';
  if (textValue.includes('laminat')) return 'lamination-1';
  if (textValue.includes('slit')) return 'slitting';
  if (textValue.includes('pouch')) return 'pouching';
  if (textValue.includes('inspect')) return 'inspection';
  return 'printing';
}

function grnMeters(inputs, inventoryRolls) {
  let total = 0;
  let found = false;
  inputs.forEach((input) => {
    const own = finite(input.lengthMeters);
    const stock = (inventoryRolls || []).find((roll) => sameCode(roll?.barcodeId || roll?.id, input.barcodeId));
    const length = own || finite(stock?.lengthMeters ?? stock?.length_meters ?? stock?.meters);
    if (length > 0) {
      total += length;
      found = true;
    }
  });
  return found ? roundFilmKg(total) : null;
}

function outputMeters(rolls) {
  let total = 0;
  let found = false;
  rolls.forEach((roll) => {
    const length = finite(roll.lengthMeters);
    if (length > 0) {
      total += length;
      found = true;
    }
  });
  return found ? roundFilmKg(total) : null;
}

function yieldFacts({ inputKg, outputKg, process, bands, inkGsm, widthMm, meters, inputMeters, outputMeters: outMeters }) {
  const recoveryPct = inputKg > 0 && outputKg > 0 ? roundFilmKg((outputKg / inputKg) * 100) : (outputKg > 0 ? 100 : 0);
  const deltaKg = inputKg > 0 && outputKg > 0 ? roundFilmKg(outputKg - inputKg) : (inputKg > 0 ? roundFilmKg(-inputKg) : 0);
  const deltaPct = inputKg > 0 ? roundFilmKg((deltaKg / inputKg) * 100) : 0;
  const band = yieldBandForProcess(bands, process);
  const comparable = inputKg > 0 && outputKg > 0;
  const checkEntries = comparable && recoveryOutsideBand(recoveryPct, band);
  let yieldLabel = '';
  if (!comparable) yieldLabel = inputKg > 0 ? 'Awaiting Output Weighing' : 'No Output Weighed Yet';
  else if (checkEntries) yieldLabel = 'Check entries';
  else if (deltaKg >= 0) yieldLabel = 'Ink & Solvent Gain';
  else yieldLabel = 'Trim / Process Loss';
  const metresCheck = inputMeters !== null && outMeters !== null
    ? { inputMeters, outputMeters: outMeters, deltaMeters: roundFilmKg(outMeters - inputMeters) }
    : null;
  return {
    inputKg,
    outputKg,
    recoveryPct,
    deltaKg,
    deltaPct,
    band,
    checkEntries,
    yieldLabel,
    expectedInkKg: expectedInkGainKg({ inkGsm, widthMm, meters }),
    metresCheck
  };
}

function pairRoll(outRoll, run, rollNo, inventoryRolls) {
  const recorded = (outRoll?.inputSubstrateBarcodes || [])
    .map((code) => (run.inputs || []).find((input) => sameCode(input.barcodeId, code)))
    .filter(Boolean);
  const runOutput = (run.outputs || []).reduce((sum, roll) => sum + (finite(roll.netWeightKg) || 0), 0);
  const runInput = (run.inputs || []).reduce((sum, roll) => sum + (finite(roll.consumedWeightKg) || 0), 0);
  const outNetKg = finite(outRoll?.netWeightKg) || 0;
  let inConsKg = 0;
  let inInitKg = 0;
  let inputBasis = 'none';
  let linked = [];
  if (recorded.length > 0) {
    inputBasis = 'recorded';
    linked = recorded;
    inConsKg = roundFilmKg(recorded.reduce((sum, roll) => sum + (finite(roll.consumedWeightKg) || 0), 0));
    inInitKg = roundFilmKg(recorded.reduce((sum, roll) => sum + (finite(roll.initialWeightKg) || 0), 0));
  } else if (runInput > 0 && runOutput > 0 && outNetKg > 0) {
    inputBasis = 'run-share';
    const share = outNetKg / runOutput;
    inConsKg = roundFilmKg(runInput * share);
    const runInitial = (run.inputs || []).reduce((sum, roll) => sum + (finite(roll.initialWeightKg) || 0), 0);
    inInitKg = roundFilmKg(runInitial * share);
  }
  const facts = yieldFacts({
    inputKg: inputBasis === 'run-share' ? runInput : inConsKg,
    outputKg: inputBasis === 'run-share' ? runOutput : outNetKg,
    process: run.process,
    bands: run.bands,
    inkGsm: run.inkGsm,
    widthMm: outRoll?.widthMm || run.widthMm,
    meters: run.meters,
    inputMeters: grnMeters(inputBasis === 'recorded' ? linked : run.inputs, inventoryRolls),
    outputMeters: outputMeters(inputBasis === 'run-share' ? run.outputs : [outRoll])
  });
  const recoveryPct = inputBasis === 'run-share' ? facts.recoveryPct : (inConsKg > 0 ? roundFilmKg((outNetKg / inConsKg) * 100) : facts.recoveryPct);
  const deltaKg = inConsKg > 0 ? roundFilmKg(outNetKg - inConsKg) : 0;
  const deltaPct = inConsKg > 0 ? roundFilmKg((deltaKg / inConsKg) * 100) : 0;
  const checkEntries = inputBasis === 'run-share' ? facts.checkEntries : (inConsKg > 0 && outNetKg > 0 && recoveryOutsideBand(recoveryPct, facts.band));
  let yieldLabel = facts.yieldLabel;
  if (inputBasis !== 'run-share' && inConsKg > 0 && outNetKg > 0) {
    yieldLabel = checkEntries ? 'Check entries' : (deltaKg >= 0 ? 'Ink & Solvent Gain' : 'Trim / Process Loss');
  }
  const inputNote = inputBasis === 'run-share'
    ? `Run yield ${facts.recoveryPct.toFixed(1)}%. This roll's share of the run input is ${inConsKg.toFixed(2)} kg.`
    : '';
  return {
    rollNo,
    outputRoll: outRoll,
    inputRoll: linked.length === 1 ? linked[0] : null,
    linkedInputList: linked,
    inputBasis,
    inputNote,
    outNetKg,
    outGrossKg: finite(outRoll?.grossWeightKg) || (outNetKg > 0 ? outNetKg : 0),
    outLengthM: finite(outRoll?.lengthMeters) || 0,
    inConsKg,
    inInitKg,
    inBalKg: Math.max(0, roundFilmKg(inInitKg - inConsKg)),
    deltaKg,
    deltaPct,
    recoveryPct,
    checkEntries,
    yieldLabel,
    expectedInkKg: facts.expectedInkKg,
    metresCheck: facts.metresCheck,
    runId: run.id,
    runLabel: run.label
  };
}

function resolveContext(args) {
  const orders = args.orders || [];
  const records = args.productionRecords || [];
  const effectiveOrder = args.targetOrder || orders.find((order) => {
    if (!args.targetRecord) return false;
    const cleanO = cleanId(order.id);
    const cleanR = cleanId(args.targetRecord.orderId || args.targetRecord.id);
    return cleanO === cleanR
      || (args.targetRecord.jobCode && order.jobCode === args.targetRecord.jobCode)
      || (args.targetRecord.jobName && order.jobName && order.jobName.trim().toLowerCase() === args.targetRecord.jobName.trim().toLowerCase());
  }) || null;
  const effectiveRecord = args.targetRecord || records.find((record) => {
    if (!effectiveOrder) return false;
    const cleanR = cleanId(record.orderId || record.id);
    const cleanO = cleanId(effectiveOrder.id);
    return cleanR === cleanO
      || (effectiveOrder.jobCode && record.jobCode === effectiveOrder.jobCode)
      || (effectiveOrder.jobName && record.jobName && record.jobName.trim().toLowerCase() === effectiveOrder.jobName.trim().toLowerCase());
  }) || null;
  return { effectiveOrder, effectiveRecord };
}

export function buildYieldReconciliation({
  targetOrder,
  targetRecord,
  orders = [],
  productionRecords = [],
  inventoryRolls = [],
  sfgGoods = [],
  bands
} = {}) {
  const yieldBands = normalizeYieldBands(bands);
  const { effectiveOrder, effectiveRecord } = resolveContext({ targetOrder, targetRecord, orders, productionRecords });
  const cleanOrderId = cleanId(effectiveOrder?.id || effectiveRecord?.orderId || effectiveRecord?.id);
  const jobCode = text(effectiveOrder?.jobCode || effectiveRecord?.jobCode).toLowerCase();
  const jobName = text(effectiveOrder?.jobName || effectiveRecord?.jobName).toLowerCase();
  const context = {
    filmType: effectiveOrder?.printFilmType || effectiveRecord?.printFilmType || '',
    micron: effectiveOrder?.micron ?? effectiveRecord?.printMicron,
    widthMm: effectiveOrder?.printWidthMm ?? effectiveOrder?.widthMm ?? effectiveRecord?.printWidthMm
  };

  const sfgLogs = [
    ...(Array.isArray(effectiveRecord?.sfgConsumptions) ? effectiveRecord.sfgConsumptions : []),
    ...(Array.isArray(effectiveOrder?.sfgConsumptions) ? effectiveOrder.sfgConsumptions : [])
  ].filter((log, index, list) => {
    const key = log.id || `${log.timestamp || log.date}-${log.sfgBatchCode}-${log.targetProcess}`;
    return list.findIndex((item) => (item.id || `${item.timestamp || item.date}-${item.sfgBatchCode}-${item.targetProcess}`) === key) === index;
  });

  const candidates = [];
  const pushCandidate = (roll, extra = {}) => {
    if (!roll || !orderMatches({ ...roll, ...extra }, cleanOrderId, jobCode, jobName)) return;
    const shaped = asOutputRoll({ ...roll, ...extra }, context);
    if (!shaped) return;
    if (!candidates.some((item) => sameCode(item.barcodeId, shaped.barcodeId))) candidates.push(shaped);
  };

  (effectiveRecord?.outputRolls || []).forEach((roll) => pushCandidate(roll));
  (effectiveRecord?.rollsBreakdown || []).forEach((roll) => pushCandidate(roll));
  (effectiveRecord?.stages?.printing?.outputRolls || []).forEach((roll) => pushCandidate(roll));
  (effectiveOrder?.rollsBreakdown || []).forEach((roll) => pushCandidate(roll));
  (effectiveOrder?.outputRolls || []).forEach((roll) => pushCandidate(roll));
  (inventoryRolls || []).forEach((roll) => pushCandidate(roll));
  (sfgGoods || []).forEach((roll) => pushCandidate(roll));
  sfgLogs.forEach((log) => {
    const trace = consumptionOutputTrace(log);
    outputRollsFromLog(log).forEach((outputRoll) => {
      const outB = text(outputRoll.barcode || outputRoll.barcodeId);
      if (!outB) return;
      pushCandidate({
        ...outputRoll,
        barcodeId: outB,
        orderId: log.orderId || effectiveOrder?.id,
        jobName: log.jobName || effectiveOrder?.jobName,
        jobCode: log.jobCode || effectiveOrder?.jobCode,
        rollType: outputRoll.outputType || 'SFG',
        stage: log.targetProcess || outputRoll.stage,
        inputSubstrateBarcodes: trace.inputSubstrateBarcodes,
        inputRollsTraceability: trace.inputRollsTraceability
      });
    });
  });

  candidates.slice().forEach((lot) => {
    if (!isSummaryLot(lot)) return;
    const children = Array.isArray(lot.childRolls) ? lot.childRolls : [];
    children.forEach((child) => {
      pushCandidate({
        ...child,
        barcodeId: barcodeOf(child),
        orderId: child.orderId || lot.orderId,
        jobName: child.jobName || lot.jobName,
        jobCode: child.jobCode || lot.jobCode,
        rollType: child.rollType || 'SFG',
        sfgType: child.sfgType || 'Printed Rolls',
        parentSfgBatchCode: lot.barcodeId,
        netWeightKg: child.netWeightKg,
        lengthMeters: child.lengthMeters
      });
    });
  });

  const lotTotals = [];
  const linkedRolls = candidates.filter((roll) => {
    if (!isSummaryLot(roll)) return true;
    const codes = new Set(childCodesOf(roll).map((code) => code.toLowerCase()));
    const lotCode = roll.barcodeId.toLowerCase();
    const childrenPresent = candidates.some((other) => {
      if (sameCode(other.barcodeId, roll.barcodeId)) return false;
      if (codes.has(other.barcodeId.toLowerCase())) return true;
      const parent = text(other.parentSfgBatchCode || other.parentBarcode).toLowerCase();
      return parent && parent === lotCode;
    });
    if (!childrenPresent) return true;
    lotTotals.push({
      barcodeId: roll.barcodeId,
      netKg: roundFilmKg(finite(roll.totalNetKg ?? roll.netWeightKg) || 0),
      meters: finite(roll.totalMeters ?? roll.lengthMeters),
      childCount: codes.size || (finite(roll.rollsCount ?? roll.rolls_count) || 0)
    });
    return false;
  });

  const pressInputs = [
    ...(Array.isArray(effectiveRecord?.inputRollsList) ? effectiveRecord.inputRollsList : []),
    ...(Array.isArray(effectiveRecord?.stages?.printing?.inputRollsList) ? effectiveRecord.stages.printing.inputRollsList : []),
    ...(Array.isArray(effectiveOrder?.inputRollsList) ? effectiveOrder.inputRollsList : [])
  ].map((roll) => normalizeInput(roll, 'Active Print Run')).filter(Boolean);

  const holds = holdHistory(effectiveOrder);
  const holdBarcodeSet = new Set();
  const runs = holds.map((entry, index) => {
    const inputs = (entry.inputRolls || entry.inputRollsList || [])
      .map((roll) => normalizeInput(roll, `Hold run ${index + 1}`))
      .filter(Boolean);
    inputs.forEach((roll) => holdBarcodeSet.add(roll.barcodeId.toLowerCase()));
    return {
      id: entry.segmentId || `hold-${index + 1}`,
      label: `Hold run ${index + 1}${entry.reason ? `: ${entry.reason}` : ''}`,
      process: 'printing',
      inputs,
      outputs: [],
      meters: finite(entry.meters),
      inkGsm: finite(effectiveRecord?.actualInkGsm ?? effectiveRecord?.inkGsmInSpeed ?? effectiveOrder?.inkGsmInSpeed),
      widthMm: context.widthMm,
      bands: yieldBands,
      printedKg: finite(entry.printedKg) || 0
    };
  });

  const finalInputs = [];
  const seenFinal = new Set();
  pressInputs.forEach((roll) => {
    if (holdBarcodeSet.has(roll.barcodeId.toLowerCase())) return;
    if (seenFinal.has(roll.barcodeId.toLowerCase())) return;
    seenFinal.add(roll.barcodeId.toLowerCase());
    finalInputs.push(roll);
  });
  const finalRun = {
    id: 'final-print',
    label: holds.length ? 'Final print run' : 'Print run',
    process: 'printing',
    inputs: finalInputs,
    outputs: [],
    meters: finite(effectiveRecord?.actualMetersPrinted ?? effectiveOrder?.actualMetersPrinted),
    inkGsm: finite(effectiveRecord?.actualInkGsm ?? effectiveRecord?.inkGsmInSpeed ?? effectiveOrder?.inkGsmInSpeed),
    widthMm: context.widthMm,
    bands: yieldBands
  };
  runs.push(finalRun);

  sfgLogs.forEach((log, index) => {
    const inputs = [];
    if (log.sfgBatchCode && finite(log.consumedKg) > 0) {
      const weights = inputRollWeightsFromLog(log);
      const row = normalizeInput({
        barcodeId: log.sfgBatchCode,
        filmType: log.filmType,
        micron: log.micron,
        widthMm: log.widthMm,
        initialWeightKg: weights.initialWeightKg,
        consumedWeightKg: weights.consumedWeightKg
      }, `SFG Store (${log.targetProcess || 'Consumption'})`);
      if (row) inputs.push(row);
    }
    substrate2InputRolls(log).forEach((roll) => {
      const row = normalizeInput(roll, roll.source);
      if (row) inputs.push(row);
    });
    if (log.substrate3 && log.substrate3.barcode && finite(log.substrate3.consumedKg) > 0) {
      const row = normalizeInput({
        barcodeId: log.substrate3.barcode,
        filmType: log.substrate3.filmType,
        micron: log.substrate3.micron,
        widthMm: log.substrate3.widthMm,
        initialWeightKg: log.substrate3.initialKg || log.substrate3.consumedKg,
        consumedWeightKg: log.substrate3.consumedKg
      }, `SFG Store (${log.targetProcess || 'Lamination Pass 2'})`);
      if (row) inputs.push(row);
    }
    const outputCodes = outputRollsFromLog(log).map((roll) => text(roll.barcode || roll.barcodeId).toLowerCase()).filter(Boolean);
    runs.push({
      id: log.id || `sfg-${index + 1}`,
      label: log.targetProcess || `SFG consumption ${index + 1}`,
      process: processOfStage(log.targetProcess),
      inputs,
      outputs: [],
      outputCodes,
      meters: finite(log.meters ?? log.stageMeters),
      inkGsm: null,
      widthMm: finite(log.widthMm) || context.widthMm,
      bands: yieldBands
    });
  });

  const printingOutputs = linkedRolls.filter((roll) => {
    const stage = text(roll.stage || roll.printSegment).toLowerCase();
    const type = text(roll.sfgType || roll.sfg_type || roll.category).toLowerCase();
    if (stage.includes('laminat') || type.includes('laminat')) return false;
    if (type.includes('printed') || stage.includes('print') || stage === 'end' || /^sfg-prn-/i.test(roll.barcodeId)) return true;
    return !stage && !type.includes('fg') && !/^fg-/i.test(roll.barcodeId);
  });
  const claimed = new Set();
  linkedRolls.forEach((roll) => {
    const segment = text(roll.printSegment);
    const hold = runs.find((run) => run.id !== 'final-print' && run.process === 'printing' && segment && sameCode(run.id, segment));
    if (hold) {
      hold.outputs.push(roll);
      claimed.add(roll.barcodeId.toLowerCase());
      return;
    }
    const logRun = runs.find((run) => Array.isArray(run.outputCodes) && run.outputCodes.includes(roll.barcodeId.toLowerCase()));
    if (logRun) {
      logRun.outputs.push(roll);
      claimed.add(roll.barcodeId.toLowerCase());
    }
  });
  printingOutputs.forEach((roll) => {
    if (claimed.has(roll.barcodeId.toLowerCase())) return;
    finalRun.outputs.push(roll);
    claimed.add(roll.barcodeId.toLowerCase());
  });
  linkedRolls.forEach((roll) => {
    if (claimed.has(roll.barcodeId.toLowerCase())) return;
    finalRun.outputs.push(roll);
  });

  runs.forEach((run) => {
    const inputKg = roundFilmKg(run.inputs.reduce((sum, roll) => sum + (finite(roll.consumedWeightKg) || 0), 0));
    const weighed = roundFilmKg(run.outputs.reduce((sum, roll) => sum + (finite(roll.netWeightKg) || 0), 0));
    const outputKg = weighed > 0 ? weighed : (run.printedKg || 0);
    Object.assign(run, { inputKg, outputKg, weighedKg: weighed });
  });

  const printingRuns = runs.filter((run) => run.process === 'printing');
  const holdsHaveRolls = printingRuns.some((run) => run.id !== 'final-print' && run.outputs.length > 0);
  const combinedPrintingInputs = [];
  const seenPrinting = new Set();
  printingRuns.forEach((run) => {
    run.inputs.forEach((roll) => {
      if (seenPrinting.has(roll.barcodeId.toLowerCase())) return;
      seenPrinting.add(roll.barcodeId.toLowerCase());
      combinedPrintingInputs.push(roll);
    });
  });
  const rollShareRun = !holdsHaveRolls && printingRuns.length > 1
    ? {
      ...finalRun,
      id: 'printing-total',
      label: 'Printing (hold runs + final run)',
      inputs: combinedPrintingInputs,
      outputs: finalRun.outputs
    }
    : finalRun;

  printingRuns.forEach((run) => {
    const share = run.id === 'final-print' ? rollShareRun : run;
    const facts = yieldFacts({
      inputKg: roundFilmKg(share.inputs.reduce((sum, roll) => sum + (finite(roll.consumedWeightKg) || 0), 0)),
      outputKg: run.id === 'final-print'
        ? roundFilmKg(share.outputs.reduce((sum, roll) => sum + (finite(roll.netWeightKg) || 0), 0))
        : run.outputKg,
      process: run.process,
      bands: yieldBands,
      inkGsm: run.inkGsm,
      widthMm: run.widthMm,
      meters: run.meters,
      inputMeters: grnMeters(share.inputs, inventoryRolls),
      outputMeters: outputMeters(run.id === 'final-print' ? share.outputs : run.outputs)
    });
    const ownInput = run.inputKg;
    const ownOutput = run.outputKg;
    Object.assign(run, facts);
    run.inputKg = ownInput;
    run.outputKg = ownOutput;
    run.shareRun = share;
  });
  runs.filter((run) => run.process !== 'printing').forEach((run) => {
    Object.assign(run, yieldFacts({
      inputKg: run.inputKg,
      outputKg: run.outputKg,
      process: run.process,
      bands: yieldBands,
      inkGsm: run.inkGsm,
      widthMm: run.widthMm,
      meters: run.meters,
      inputMeters: grnMeters(run.inputs, inventoryRolls),
      outputMeters: outputMeters(run.outputs)
    }));
    run.shareRun = run;
  });

  const pairedRolls = [];
  let rollNo = 1;
  runs.forEach((run) => {
    run.outputs.forEach((roll) => {
      pairedRolls.push(pairRoll(roll, run.shareRun || run, rollNo, inventoryRolls));
      rollNo += 1;
    });
    if (run.outputs.length === 0 && !(run.outputKg > 0)) {
      run.inputs.forEach((input) => {
        pairedRolls.push({
          rollNo,
          outputRoll: null,
          inputRoll: input,
          linkedInputList: [input],
          inputBasis: 'recorded',
          inputNote: '',
          outNetKg: 0,
          outGrossKg: 0,
          outLengthM: 0,
          inConsKg: input.consumedWeightKg,
          inInitKg: input.initialWeightKg,
          inBalKg: Math.max(0, roundFilmKg(input.initialWeightKg - input.consumedWeightKg)),
          deltaKg: roundFilmKg(-input.consumedWeightKg),
          deltaPct: -100,
          recoveryPct: 0,
          checkEntries: false,
          yieldLabel: 'Awaiting Output Weighing',
          expectedInkKg: null,
          metresCheck: null,
          runId: run.id,
          runLabel: run.label
        });
        rollNo += 1;
      });
    }
  });

  const inputRolls = [];
  const seenInput = new Set();
  runs.forEach((run) => {
    run.inputs.forEach((roll) => {
      if (seenInput.has(roll.barcodeId.toLowerCase())) return;
      seenInput.add(roll.barcodeId.toLowerCase());
      inputRolls.push(roll);
    });
  });

  const sfgRolls = linkedRolls.filter((roll) => roll.rollType === 'SFG');
  const fgRolls = linkedRolls.filter((roll) => roll.rollType === 'FG');
  const totalInputConsumedKg = roundFilmKg(inputRolls.reduce((sum, roll) => sum + (finite(roll.consumedWeightKg) || 0), 0));
  const totalSfgKg = roundFilmKg(sfgRolls.reduce((sum, roll) => sum + (finite(roll.netWeightKg) || 0), 0));
  const totalFgKg = roundFilmKg(fgRolls.reduce((sum, roll) => sum + (finite(roll.netWeightKg) || 0), 0));
  const totalOutputKg = roundFilmKg(totalSfgKg + totalFgKg);
  const summary = yieldFacts({
    inputKg: totalInputConsumedKg,
    outputKg: totalOutputKg,
    process: 'printing',
    bands: yieldBands,
    inkGsm: finalRun.inkGsm,
    widthMm: context.widthMm,
    meters: runs.filter((run) => run.process === 'printing').reduce((sum, run) => sum + (finite(run.meters) || 0), 0),
    inputMeters: grnMeters(inputRolls, inventoryRolls),
    outputMeters: outputMeters(linkedRolls)
  });
  const runOutside = runs.some((run) => run.checkEntries);
  const checkEntries = summary.checkEntries || runOutside;

  return {
    jobTitle: effectiveOrder?.jobName || effectiveRecord?.jobName || 'this job',
    linkedRolls,
    lotTotals,
    inputRolls,
    pairedRolls,
    runs: runs.filter((run) => run.inputs.length > 0 || run.outputs.length > 0),
    sfgRolls,
    fgRolls,
    totalInputConsumedKg,
    totalSfgKg,
    totalFgKg,
    totalOutputKg,
    hasBothInputAndOutput: totalInputConsumedKg > 0 && totalOutputKg > 0,
    netVarianceKg: summary.deltaKg,
    netVariancePct: summary.deltaPct,
    cumulativeRecoveryPct: summary.recoveryPct,
    checkEntries,
    yieldLabel: checkEntries ? 'Check entries' : summary.yieldLabel,
    expectedInkKg: summary.expectedInkKg,
    metresCheck: summary.metresCheck,
    band: summary.band
  };
}
