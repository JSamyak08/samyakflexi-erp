/**
 * Pure helpers for the SFG consume popup.
 *
 * One substrate-2 row and one output row keep the objects saved today.
 * Extra rows are optional. Substrate 3 is unchanged and is not handled here.
 *
 * Output barcodes follow the existing client-side pattern
 * `TYPE-BC-<order>-<last 4 of Date.now()>`. That generator can repeat inside
 * one save, so added child rolls get a deterministic `-Rnn` suffix checked
 * against barcodes already on the form and against stock passed in.
 * Barcodes are built from the existing time-based pattern plus a sequence suffix.
 * A random number generator and a client-side UUID are not used for the barcode.
 */

export function round2(value) {
  return parseFloat((Number(value) || 0).toFixed(2));
}

export function legacyOutputBarcode(outputType, orderId, nowMs) {
  return `${outputType || 'SFG'}-BC-${orderId || 'ORD'}-${String(nowMs).slice(-4)}`;
}

export function buildLegacySubstrateInfo(barcode, filmType, initialKg, consumedKg) {
  const subConsumedVal = parseFloat(consumedKg) || 0;
  const subInitialVal = parseFloat(initialKg) || 0;
  const subRemainingVal = Math.max(0, subInitialVal - subConsumedVal);
  if (!(barcode || subConsumedVal > 0)) return null;
  return {
    barcode: String(barcode || '').trim(),
    filmType: (filmType || '').trim(),
    initialKg: subInitialVal,
    consumedKg: subConsumedVal,
    remainingKg: subRemainingVal
  };
}

export function buildLegacyOutputRoll(fields) {
  const outputType = fields.outputType;
  return {
    barcode: fields.barcode || legacyOutputBarcode(outputType, fields.orderId, fields.nowMs),
    outputType,
    grossWeightKg: fields.grossWeightKg,
    tareWeightKg: fields.tareWeightKg,
    netWeightKg: fields.netWeightKg,
    storageBay: fields.storageBay || (outputType === 'FG' ? 'FG Warehouse' : 'Bay A'),
    stage: fields.stage,
    pouchCount: fields.pouchCount,
    timestamp: fields.timestamp
  };
}

export function outputEntryNet(gross, tare) {
  return Math.max(0, (parseFloat(gross) || 0) - (parseFloat(tare) || 0));
}

export function sumSubstrateConsumed(firstConsumedKg, extras) {
  const extra = (extras || []).reduce((sum, row) => sum + (parseFloat(row?.consumedKg) || 0), 0);
  return round2((parseFloat(firstConsumedKg) || 0) + extra);
}

export function sumOutputNet(firstGross, firstTare, extras) {
  const first = outputEntryNet(firstGross, firstTare);
  const extra = (extras || []).reduce((sum, row) => sum + outputEntryNet(row?.grossKg, row?.tareKg), 0);
  return round2(first + extra);
}

/**
 * Reference mass the single popup already had available: parent kg consumed
 * plus substrate 2 kg consumed. Adhesive and scrap are separate fields and
 * were never subtracted from or added to an output cap. There is no existing
 * hard cap, so going over this reference is a warning, not an error.
 */
export function outputReferenceKg(consumedKg, substrateConsumedKg) {
  return round2((Number(consumedKg) || 0) + (Number(substrateConsumedKg) || 0));
}

export function outputOverReferenceWarning({ outputNetKg, consumedKg, substrateConsumedKg }) {
  const output = round2(outputNetKg);
  const reference = outputReferenceKg(consumedKg, substrateConsumedKg);
  if (!(output > reference)) return '';
  return `Output total ${output.toFixed(2)} kg is above the consumed roll plus substrate 2 (${reference.toFixed(2)} kg). Saving is still allowed: this popup has never blocked output weight against input weight.`;
}

function codeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function recordedPositive(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function validateAddedConsumeRows({
  substrateExtras = [],
  firstSubstrateBarcode = '',
  parentBatchCode = '',
  outputExtras = [],
  firstOutputGross = '',
  firstOutputTare = '0',
  isSpecialProcess = true,
  isOutputMade = true
} = {}) {
  if (substrateExtras.length > 0) {
    const seen = new Set();
    const firstKey = codeKey(firstSubstrateBarcode);
    if (firstKey) seen.add(firstKey);
    const parentKey = codeKey(parentBatchCode);
    for (let i = 0; i < substrateExtras.length; i += 1) {
      const row = substrateExtras[i] || {};
      const label = `Substrate 2 roll ${i + 2}`;
      const barcode = String(row.barcode || '').trim();
      const consumed = parseFloat(row.consumedKg);
      const initial = parseFloat(row.initialKg || 0);
      if (!barcode) return { ok: false, error: `${label} needs a roll barcode.` };
      if (parentKey && codeKey(barcode) === parentKey) {
        return { ok: false, error: `${label} cannot be the same roll that is being consumed.` };
      }
      if (seen.has(codeKey(barcode))) {
        return { ok: false, error: `${label} barcode ${barcode} is already used on this layer.` };
      }
      seen.add(codeKey(barcode));
      if (!(consumed > 0)) {
        return { ok: false, error: `${label} needs a consumed weight greater than 0 kg.` };
      }
      if (consumed > initial) {
        return {
          ok: false,
          error: `${label} consumed weight (${row.consumedKg} kg) cannot exceed initial roll balance (${row.initialKg || 0} kg).`
        };
      }
    }
  }

  if (outputExtras.length > 0 && isSpecialProcess && isOutputMade) {
    const firstGross = parseFloat(firstOutputGross);
    const firstTare = parseFloat(firstOutputTare) || 0;
    const firstNet = Math.max(0, (Number.isNaN(firstGross) ? 0 : firstGross) - firstTare);
    if (firstOutputGross === '' || firstOutputGross === null || firstOutputGross === undefined || Number.isNaN(firstGross) || !(firstNet > 0)) {
      return { ok: false, error: 'Each child roll needs its own gross weight. Roll 1 is missing a net quantity.' };
    }
    const seenBarcodes = new Set();
    for (let i = 0; i < outputExtras.length; i += 1) {
      const row = outputExtras[i] || {};
      const label = `Child roll ${i + 2}`;
      const barcode = String(row.barcode || '').trim();
      if (!barcode) return { ok: false, error: `${label} needs a barcode.` };
      if (seenBarcodes.has(codeKey(barcode))) {
        return { ok: false, error: `${label} barcode ${barcode} is already used on another child roll.` };
      }
      seenBarcodes.add(codeKey(barcode));
      if (row.grossKg === '' || row.grossKg === undefined || row.grossKg === null) {
        return { ok: false, error: `${label} needs a gross weight.` };
      }
      const gross = parseFloat(row.grossKg);
      const tare = parseFloat(row.tareKg) || 0;
      if (Number.isNaN(gross) || gross < tare) {
        return { ok: false, error: `${label} gross weight cannot be less than tare weight.` };
      }
      if (!(gross - tare > 0)) {
        return { ok: false, error: `${label} net weight must be greater than 0 kg.` };
      }
      if (row.outputType !== 'SFG' && row.outputType !== 'FG') {
        return { ok: false, error: `${label} needs an SFG or FG type.` };
      }
    }
  }

  return { ok: true };
}

export function buildSubstrate2RollList(firstInfo, extras) {
  const rolls = [];
  if (firstInfo) rolls.push(firstInfo);
  (extras || []).forEach((row) => {
    const info = buildLegacySubstrateInfo(row?.barcode, row?.filmType, row?.initialKg, row?.consumedKg);
    if (info) rolls.push(info);
  });
  return rolls;
}

export function nextAdditionalOutputBarcode({ outputType, orderId, nowMs, takenCodes, startAt = 2 }) {
  const base = legacyOutputBarcode(outputType || 'SFG', orderId, nowMs);
  const taken = new Set((takenCodes || []).map(codeKey).filter(Boolean));
  let n = startAt;
  let candidate = `${base}-R${String(n).padStart(2, '0')}`;
  while (taken.has(codeKey(candidate))) {
    n += 1;
    if (n > 500) {
      throw new Error('Could not allocate a unique child roll barcode.');
    }
    candidate = `${base}-R${String(n).padStart(2, '0')}`;
  }
  return candidate;
}

/**
 * First row keeps the barcode the operator already sees (same as a one-roll save).
 * Later rows keep a hand-edited barcode when it is free. Collisions get `-Rnn`.
 */
export function assignOutputBarcodes(rows, { orderId, nowMs, takenCodes } = {}) {
  const taken = new Set((takenCodes || []).map(codeKey).filter(Boolean));
  const used = new Set();
  return (rows || []).map((row, index) => {
    const type = row?.outputType || 'SFG';
    const requested = String(row?.barcode || '').trim();
    if (index === 0) {
      const barcode = requested || legacyOutputBarcode(type, orderId, nowMs);
      used.add(codeKey(barcode));
      return barcode;
    }
    const base = legacyOutputBarcode(type, orderId, nowMs);
    const collides = (code) => {
      const key = codeKey(code);
      return !key || used.has(key) || taken.has(key);
    };
    let barcode = requested;
    if (collides(barcode)) {
      let n = index + 1;
      barcode = `${base}-R${String(n).padStart(2, '0')}`;
      while (collides(barcode)) {
        n += 1;
        if (n > 500) throw new Error('Could not allocate a unique child roll barcode.');
        barcode = `${base}-R${String(n).padStart(2, '0')}`;
      }
    }
    used.add(codeKey(barcode));
    return barcode;
  });
}

export function buildChildOutputRoll({
  barcode,
  outputType,
  grossWeightKg,
  tareWeightKg,
  storageBay,
  stage,
  pouchCount,
  timestamp,
  parentSfgBatchCode
}) {
  const netWeightKg = parseFloat(Math.max(0, (Number(grossWeightKg) || 0) - (Number(tareWeightKg) || 0)).toFixed(2));
  return {
    barcode,
    outputType,
    grossWeightKg,
    tareWeightKg,
    netWeightKg,
    storageBay: storageBay || (outputType === 'FG' ? 'FG Warehouse' : 'Bay A'),
    stage,
    pouchCount,
    timestamp,
    parentSfgBatchCode,
    parentBarcode: parentSfgBatchCode
  };
}

export function substrate2RollsFromLog(log) {
  if (Array.isArray(log?.substrate2Rolls) && log.substrate2Rolls.length > 0) {
    return log.substrate2Rolls.filter(Boolean);
  }
  if (log?.substrate2 && (parseFloat(log.substrate2.consumedKg) > 0 || log.substrate2.barcode)) {
    return [log.substrate2];
  }
  return [];
}

export function outputRollsFromLog(log) {
  if (Array.isArray(log?.outputRolls) && log.outputRolls.length > 0) return log.outputRolls.filter(Boolean);
  if (log?.outputRoll) return [log.outputRoll];
  return [];
}

export function consumptionOutputNetKg(log) {
  const rolls = outputRollsFromLog(log);
  if (Array.isArray(log?.outputRolls) && log.outputRolls.length > 1) {
    return rolls.reduce((sum, roll) => sum + (parseFloat(roll?.netWeightKg) || 0), 0);
  }
  return log?.outputRoll ? (parseFloat(log.outputRoll.netWeightKg) || 0) : 0;
}

export function consumptionOutputTrace(log) {
  const substrateRolls = substrate2RollsFromLog(log);
  return {
    inputSubstrateBarcodes: [
      log?.sfgBatchCode,
      ...substrateRolls.map((roll) => roll?.barcode),
      log?.substrate3?.barcode
    ].filter(Boolean),
    inputRollsTraceability: [
      log?.sfgBatchCode
        ? { barcodeId: log.sfgBatchCode, consumedWeightKg: parseFloat(log.consumedKg) || 0, filmType: 'SFG Base Film' }
        : null,
      ...substrateRolls
        .filter((roll) => roll?.barcode)
        .map((roll) => ({
          barcodeId: roll.barcode,
          consumedWeightKg: parseFloat(roll.consumedKg) || 0,
          filmType: roll.filmType || 'Substrate 2'
        })),
      log?.substrate3?.barcode
        ? {
          barcodeId: log.substrate3.barcode,
          consumedWeightKg: parseFloat(log.substrate3.consumedKg) || 0,
          filmType: log.substrate3.filmType || 'Substrate 3'
        }
        : null
    ].filter(Boolean)
  };
}

export function substrate2InputRolls(log) {
  return substrate2RollsFromLog(log)
    .filter((roll) => roll?.barcode && parseFloat(roll.consumedKg) > 0)
    .map((roll, index) => ({
      id: index === 0
        ? `sub2-cons-${log?.id || roll.barcode}`
        : `sub2-cons-${log?.id || roll.barcode}-${index + 1}`,
      barcodeId: roll.barcode,
      filmType: roll.filmType || '',
      micron: recordedPositive(roll.micron),
      widthMm: recordedPositive(roll.widthMm),
      initialWeightKg: parseFloat(roll.initialKg || roll.consumedKg) || 0,
      consumedWeightKg: parseFloat(roll.consumedKg) || 0,
      source: `SFG Store (${log?.targetProcess || 'Lamination Pass 1'})`
    }));
}

export function additionalSubstrate2Materials(log, rateForFilm = () => 150) {
  if (!Array.isArray(log?.substrate2Rolls) || log.substrate2Rolls.length < 2) return [];
  return log.substrate2Rolls.slice(1)
    .filter((roll) => roll && (parseFloat(roll.consumedKg) > 0 || roll.barcode))
    .map((roll) => {
      const rate = rateForFilm(roll.filmType) || 150;
      const consumed = parseFloat(roll.consumedKg) || 0;
      const initial = parseFloat(roll.initialKg) || 0;
      return {
        id: `mat-sub2-${roll.barcode || 'roll'}`,
        itemId: `RM-SUB2-${roll.barcode || 'roll'}`,
        itemCode: 'RM-SUB2',
        itemName: `Substrate 2 (${roll.filmType || 'Lamination Film'}) - Pass 1`,
        filmType: roll.filmType || '',
        micron: recordedPositive(roll.micron),
        widthMm: recordedPositive(roll.widthMm),
        unit: 'Kg',
        barcode: roll.barcode || '',
        issueQtyKg: initial || consumed,
        returnQtyKg: Math.max(0, initial - consumed),
        netConsumedQtyKg: consumed,
        unitPricePerKg: rate,
        totalMaterialCost: consumed * rate,
        wastagePct: 0
      };
    });
}

/**
 * Same short-circuit as the reconciliation screen. Parent-linked child rolls
 * can fill an empty input list from inputBarcodeIds. Older rolls are unchanged.
 */
export function resolveInputSubstrateBarcodes(record) {
  const explicitInputs = record?.inputSubstrateBarcodes || record?.input_barcode_ids;
  const tracedInputs = (record?.inputRollsTraceability || []).map((roll) => roll?.barcodeId).filter(Boolean);
  let barcodes = explicitInputs || tracedInputs || [];
  if (
    (!barcodes || barcodes.length === 0) &&
    record?.parentSfgBatchCode &&
    Array.isArray(record?.inputBarcodeIds) &&
    record.inputBarcodeIds.length > 0
  ) {
    barcodes = record.inputBarcodeIds;
  }
  return barcodes;
}

/** Split a shared input weight across sibling child rolls. Rolls without a parent are unchanged. */
export function sharedInputWeight(outRoll, linkedRolls, fullWeight) {
  const parent = outRoll?.parentSfgBatchCode;
  if (!parent) return fullWeight;
  const siblings = (linkedRolls || []).filter((roll) => roll?.parentSfgBatchCode === parent);
  if (siblings.length < 2) return fullWeight;
  const siblingNet = siblings.reduce((sum, roll) => sum + (parseFloat(roll.netWeightKg) || 0), 0);
  if (!(siblingNet > 0)) return fullWeight;
  const share = (parseFloat(outRoll.netWeightKg) || 0) / siblingNet;
  return Number(((Number(fullWeight) || 0) * share).toFixed(2));
}

export function collectKnownBarcodes(lists) {
  const out = [];
  (lists || []).forEach((list) => {
    (list || []).forEach((item) => {
      if (item == null) return;
      if (typeof item !== 'object') {
        out.push(item);
        return;
      }
      [item.barcode, item.barcodeId, item.sfgBatchCode, item.id].forEach((value) => {
        if (value == null || value === '') return;
        const text = String(value).trim();
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return;
        out.push(text);
      });
    });
  });
  return out;
}
