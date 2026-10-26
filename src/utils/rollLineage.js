/**
 * Roll lineage from raw film through printing, lamination, slitting and pouching.
 * Missing weights stay "Not recorded". A parent input is not split across child rolls.
 */

import { NOT_RECORDED, computeDryInkSolids, finiteNumber } from './productionRecordQuality.js';

const STAGE_RULES = {
  printing: { warnGainPct: 8, warnGainKg: 40, blockGainPct: 20, blockGainKg: 120, warnLossPct: 8, blockLossPct: 25 },
  lamination1: { warnDeltaPct: 8, blockGainPct: 15, blockGainKg: 40 },
  lamination2: { warnDeltaPct: 8, blockGainPct: 15, blockGainKg: 40 },
  slitting: { warnLossPct: 12, blockLossPct: 35, warnGainPct: 3, blockGainPct: 8 },
  pouching: { warnLossPct: 15, blockLossPct: 40, warnGainPct: 3, blockGainPct: 8 },
  process: { warnLossPct: 12, blockLossPct: 35, warnGainPct: 8, blockGainPct: 20 }
};

export function stageKeyFromName(name = '') {
  const text = String(name || '').toLowerCase();
  if (text.includes('pouch')) return 'pouching';
  if (text.includes('slit')) return 'slitting';
  if (text.includes('pass 2') || text.includes('second')) return 'lamination2';
  if (text.includes('lam')) return 'lamination1';
  if (text.includes('print')) return 'printing';
  return 'process';
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function kgOrNull(value) {
  const number = finiteNumber(value);
  return number === null ? null : number;
}

function substrateEntries(log) {
  const rows = [];
  if (Array.isArray(log?.substrate2Rolls) && log.substrate2Rolls.length > 0) {
    rows.push(...log.substrate2Rolls);
  } else if (log?.substrate2) {
    rows.push(log.substrate2);
  }
  if (log?.substrate3) rows.push(log.substrate3);
  return rows.filter((row) => row && (row.barcode || row.barcodeId || kgOrNull(row.consumedKg) > 0));
}

function outputEntries(log) {
  if (Array.isArray(log?.outputRolls) && log.outputRolls.length > 0) return log.outputRolls;
  if (log?.outputRoll && (log.outputRoll.barcode || log.outputRoll.netWeightKg)) return [log.outputRoll];
  return [];
}

function isFgOutput(roll, stage) {
  const type = String(roll?.outputType || roll?.rollType || '').toUpperCase();
  const code = String(roll?.barcode || roll?.barcodeId || '');
  return type === 'FG' || code.startsWith('FG-') || stage === 'slitting' || stage === 'pouching';
}

function emptyStep(stage, label) {
  return {
    stage,
    label,
    inputKg: null,
    outputKg: null,
    addedSubstrateKg: null,
    gainKg: null,
    lossKg: null,
    gainPct: null,
    lossPct: null,
    inputStatus: NOT_RECORDED,
    outputStatus: NOT_RECORDED,
    children: [],
    findings: []
  };
}

function applyDelta(step, rules) {
  if (step.inputKg === null || step.outputKg === null) {
    step.findings.push({ level: 'warn', message: `${step.label}: weight is ${NOT_RECORDED}.` });
    return;
  }
  const reference = round2(step.inputKg + (step.addedSubstrateKg || 0));
  const delta = round2(step.outputKg - (step.stage.startsWith('lamination') ? reference : step.inputKg));
  const base = step.stage.startsWith('lamination') ? reference : step.inputKg;
  const pct = base > 0 ? (Math.abs(delta) / base) * 100 : null;
  if (delta > 0) {
    step.gainKg = delta;
    step.gainPct = pct === null ? null : round2(pct);
  } else if (delta < 0) {
    step.lossKg = round2(Math.abs(delta));
    step.lossPct = pct === null ? null : round2(pct);
  } else {
    step.gainKg = 0;
    step.lossKg = 0;
  }

  if (step.outputKg === 0 && (step.inputKg > 0 || (step.addedSubstrateKg || 0) > 0)) {
    step.findings.push({ level: 'block', message: `${step.label}: output is 0 kg while input is recorded.` });
  }

  if (step.stage === 'printing' || step.stage === 'process') {
    if (step.gainKg > rules.blockGainKg || (step.gainPct !== null && step.gainPct > rules.blockGainPct)) {
      step.findings.push({ level: 'block', message: `${step.label}: weight gain is outside the physical range.` });
    } else if (step.gainKg > rules.warnGainKg || (step.gainPct !== null && step.gainPct > rules.warnGainPct)) {
      step.findings.push({ level: 'warn', message: `${step.label}: weight gain is unusual and needs a reason.` });
    }
    if (step.lossPct !== null && step.lossPct > rules.blockLossPct) {
      step.findings.push({ level: 'block', message: `${step.label}: process loss is outside the physical range.` });
    } else if (step.lossPct !== null && step.lossPct > rules.warnLossPct) {
      step.findings.push({ level: 'warn', message: `${step.label}: process loss is unusual and needs a reason.` });
    }
  } else if (step.stage.startsWith('lamination')) {
    const over = step.outputKg - reference;
    const overPct = reference > 0 ? (over / reference) * 100 : 0;
    if (over > rules.blockGainKg || overPct > rules.blockGainPct) {
      step.findings.push({ level: 'block', message: `${step.label}: output exceeds parent plus substrate by more than the physical range.` });
    } else if (Math.abs(overPct) > rules.warnDeltaPct) {
      step.findings.push({ level: 'warn', message: `${step.label}: output differs from parent plus substrate by more than ${rules.warnDeltaPct}%. Adhesive is expected weight gain.` });
    }
  } else {
    if (step.gainPct !== null && step.gainPct > rules.blockGainPct) {
      step.findings.push({ level: 'block', message: `${step.label}: a gain on this stage is outside the physical range. Trim is process loss.` });
    } else if (step.gainPct !== null && step.gainPct > rules.warnGainPct) {
      step.findings.push({ level: 'warn', message: `${step.label}: unexpected weight gain. Trim should be process loss.` });
    }
    if (step.lossPct !== null && step.lossPct > rules.blockLossPct) {
      step.findings.push({ level: 'block', message: `${step.label}: trim or process loss is outside the physical range.` });
    } else if (step.lossPct !== null && step.lossPct > rules.warnLossPct) {
      step.findings.push({ level: 'warn', message: `${step.label}: trim or process loss is unusual and needs a reason.` });
    }
  }
}

export function buildRollLineage(record = {}) {
  const findings = [];
  const steps = [];
  const knownOutputs = new Set();

  const inputs = Array.isArray(record.inputRollsList) ? record.inputRollsList : [];
  const printInput = inputs.reduce((sum, roll) => sum + (kgOrNull(roll?.consumedWeightKg) || 0), 0);
  const printInputKnown = inputs.some((roll) => kgOrNull(roll?.consumedWeightKg) > 0);
  inputs.forEach((roll) => {
    const code = String(roll?.barcodeId || roll?.barcode || '').trim();
    if (code) knownOutputs.add(code.toLowerCase());
  });
  const widths = inputs.map((roll) => kgOrNull(roll?.widthMm)).filter((value) => value !== null);
  const dry = computeDryInkSolids({
    inputKg: printInputKnown ? printInput : null,
    outputKg: record.printedOutputKg,
    inputWidthMm: widths.length ? Math.max(...widths) : null,
    printWidthMm: record.printWidthMm,
    meters: record.actualMetersPrinted,
    plainSettingKg: record.printingPlainSettingWastageKg,
    printingWastageKg: record.printingWastageKg
  });

  const printing = emptyStep('printing', 'Printing');
  if (printInputKnown) {
    printing.inputKg = round2(printInput);
    printing.inputStatus = 'recorded';
  }
  if (dry.status !== NOT_RECORDED) {
    printing.outputKg = round2(finiteNumber(record.printedOutputKg));
    printing.outputStatus = 'recorded';
    if (dry.dryInkSolidsKg > 0) printing.gainKg = dry.dryInkSolidsKg;
    else if (dry.dryInkSolidsKg < 0) printing.lossKg = round2(Math.abs(dry.dryInkSolidsKg));
    else {
      printing.gainKg = 0;
      printing.lossKg = 0;
    }
    printing.dryInkSolidsKg = dry.dryInkSolidsKg;
    printing.dryInkGsm = dry.gsm;
    const base = dry.effectiveInputKg || printing.inputKg;
    if (printing.gainKg && base) printing.gainPct = round2((printing.gainKg / base) * 100);
    if (printing.lossKg && base) printing.lossPct = round2((printing.lossKg / base) * 100);
    const rules = STAGE_RULES.printing;
    if ((printing.gainKg || 0) > rules.blockGainKg || (printing.gainPct !== null && printing.gainPct > rules.blockGainPct)) {
      printing.findings.push({ level: 'block', message: 'Printing: weight gain is outside the physical range.' });
    } else if ((printing.gainKg || 0) > rules.warnGainKg || (printing.gainPct !== null && printing.gainPct > rules.warnGainPct)) {
      printing.findings.push({ level: 'warn', message: 'Printing: weight gain is unusual and needs a reason.' });
    }
    if (printing.lossPct !== null && printing.lossPct > rules.blockLossPct) {
      printing.findings.push({ level: 'block', message: 'Printing: process loss is outside the physical range.' });
    } else if (printing.lossPct !== null && printing.lossPct > rules.warnLossPct) {
      printing.findings.push({ level: 'warn', message: 'Printing: process loss is unusual and needs a reason.' });
    }
  } else if (printInputKnown || finiteNumber(record.printedOutputKg) !== null) {
    printing.findings.push({ level: 'warn', message: `Printing: weight is ${NOT_RECORDED}.` });
  }
  if (printing.inputKg !== null || printing.outputKg !== null || printing.findings.length) steps.push(printing);

  const seenBarcodes = new Map();
  (record.sfgConsumptions || []).forEach((log, index) => {
    const stage = stageKeyFromName(log?.targetProcess);
    const label = log?.targetProcess || stage;
    const step = emptyStep(stage, label);
    const parent = kgOrNull(log?.consumedKg);
    const substrates = substrateEntries(log);
    const substrateKg = substrates.reduce((sum, row) => sum + (kgOrNull(row.consumedKg) || 0), 0);
    const substrateKnown = substrates.some((row) => kgOrNull(row.consumedKg) !== null);
    if (parent !== null || substrateKnown) {
      step.inputKg = round2((parent || 0));
      step.addedSubstrateKg = substrateKnown ? round2(substrateKg) : 0;
      step.inputStatus = 'recorded';
    }
    const outputs = outputEntries(log);
    const outputKnown = outputs.some((roll) => kgOrNull(roll.netWeightKg ?? roll.weightKg) !== null);
    if (outputKnown) {
      step.outputKg = round2(outputs.reduce((sum, roll) => sum + (kgOrNull(roll.netWeightKg ?? roll.weightKg) || 0), 0));
      step.outputStatus = 'recorded';
    }
    step.children = outputs.map((roll) => ({
      barcode: roll.barcode || roll.barcodeId || NOT_RECORDED,
      outputKg: kgOrNull(roll.netWeightKg ?? roll.weightKg),
      inputKg: null,
      inputStatus: NOT_RECORDED,
      outputType: roll.outputType || (isFgOutput(roll, stage) ? 'FG' : 'SFG')
    }));
    step.substrates = substrates.map((row) => ({
      barcode: row.barcode || row.barcodeId || NOT_RECORDED,
      filmType: row.filmType || NOT_RECORDED,
      consumedKg: kgOrNull(row.consumedKg)
    }));

    const parentCode = String(log?.sfgBatchCode || '').trim().toLowerCase();
    if (parentCode) {
      const prior = seenBarcodes.get(parentCode) || 0;
      seenBarcodes.set(parentCode, prior + (parent || 0));
      if (prior > 0) {
        step.findings.push({ level: 'block', message: `Roll ${log.sfgBatchCode} is consumed more than once.` });
      }
      if (!knownOutputs.has(parentCode) && steps.length > 0) {
        step.findings.push({ level: 'warn', message: `${label}: input ${log.sfgBatchCode} does not trace to a prior output.` });
      }
    }
    substrates.forEach((row) => {
      const code = String(row.barcode || row.barcodeId || '').trim().toLowerCase();
      if (!code) return;
      const prior = seenBarcodes.get(code) || 0;
      seenBarcodes.set(code, prior + (kgOrNull(row.consumedKg) || 0));
      if (prior > 0) step.findings.push({ level: 'block', message: `Roll ${code} is consumed more than once.` });
      const initial = kgOrNull(row.initialKg);
      const consumed = kgOrNull(row.consumedKg);
      if (initial !== null && consumed !== null && consumed > initial + 0.05) {
        step.findings.push({ level: 'block', message: `Roll ${code} consumes more than its available weight.` });
      }
    });
    if (parent !== null) {
      const available = kgOrNull(log?.availableKg ?? log?.initialKg);
      if (available !== null && parent > available + 0.05) {
        step.findings.push({ level: 'block', message: `${label}: consumed ${parent} kg is above the available ${available} kg.` });
      }
    }

    applyDelta(step, STAGE_RULES[stage] || STAGE_RULES.process);
    outputs.forEach((roll) => {
      const code = String(roll.barcode || roll.barcodeId || '').trim().toLowerCase();
      if (code) knownOutputs.add(code);
      if (isFgOutput(roll, stage) && !log?.orderId && !record?.orderId) {
        step.findings.push({ level: 'warn', message: `FG roll ${roll.barcode || roll.barcodeId || index + 1} has no order.` });
      }
    });
    steps.push(step);
  });

  const rawInputKg = printing.inputKg;
  const addedSubstrateKg = round2(steps.reduce((sum, step) => sum + (step.addedSubstrateKg || 0), 0));
  const fgRolls = steps.flatMap((step) => step.children.filter((child) => child.outputType === 'FG' && child.outputKg !== null));
  const fgOutputKg = fgRolls.length ? round2(fgRolls.reduce((sum, roll) => sum + roll.outputKg, 0)) : null;
  const totalGainKg = round2(steps.reduce((sum, step) => sum + (step.gainKg || 0), 0));
  const totalLossKg = round2(steps.reduce((sum, step) => sum + (step.lossKg || 0), 0));
  const denominator = (rawInputKg || 0) + addedSubstrateKg;
  const netYieldPct = fgOutputKg !== null && denominator > 0 ? round2((fgOutputKg / denominator) * 100) : null;

  steps.forEach((step) => step.findings.forEach((finding) => findings.push(finding)));

  const perStage = {};
  steps.forEach((step) => {
    if (!perStage[step.stage]) {
      perStage[step.stage] = { stage: step.stage, inputKg: 0, outputKg: 0, gainKg: 0, lossKg: 0, inputKnown: false, outputKnown: false };
    }
    const bucket = perStage[step.stage];
    if (step.inputKg !== null) {
      bucket.inputKg = round2(bucket.inputKg + step.inputKg + (step.addedSubstrateKg || 0));
      bucket.inputKnown = true;
    }
    if (step.outputKg !== null) {
      bucket.outputKg = round2(bucket.outputKg + step.outputKg);
      bucket.outputKnown = true;
    }
    bucket.gainKg = round2(bucket.gainKg + (step.gainKg || 0));
    bucket.lossKg = round2(bucket.lossKg + (step.lossKg || 0));
  });

  return {
    steps,
    findings,
    summary: {
      rawInputKg,
      addedSubstrateKg: steps.some((step) => step.addedSubstrateKg) ? addedSubstrateKg : (steps.length ? 0 : null),
      fgOutputKg,
      totalGainKg: steps.some((step) => step.gainKg !== null || step.lossKg !== null) ? totalGainKg : null,
      totalLossKg: steps.some((step) => step.gainKg !== null || step.lossKg !== null) ? totalLossKg : null,
      netYieldPct,
      perStage: Object.values(perStage)
    }
  };
}

export function lineageProblems(record) {
  const lineage = buildRollLineage(record);
  return {
    blocks: lineage.findings.filter((finding) => finding.level === 'block').map((finding) => finding.message),
    warnings: lineage.findings.filter((finding) => finding.level === 'warn').map((finding) => finding.message)
  };
}

export function assessConsumeStep({ stage, inputKg, substrateKg = 0, outputKg, barcode, availableKg } = {}) {
  const log = {
    targetProcess: stage,
    consumedKg: inputKg,
    availableKg,
    sfgBatchCode: barcode,
    substrate2: substrateKg ? { barcode: 'substrate', consumedKg: substrateKg } : null,
    outputRoll: outputKg === null || outputKg === undefined || outputKg === ''
      ? null
      : { barcode: 'output', netWeightKg: outputKg, outputType: stageKeyFromName(stage) === 'slitting' || stageKeyFromName(stage) === 'pouching' ? 'FG' : 'SFG' }
  };
  return lineageProblems({ sfgConsumptions: [log], orderId: 'consume-check' });
}
