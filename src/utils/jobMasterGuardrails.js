/**
 * Job Master guardrails for Job Production Records.
 *
 * Printing layer: job_masters.layers[0]. The owner still needs to confirm that
 * layer 1 is always the printed substrate. Change only printingLayer() if a
 * job is printed on a different layer.
 *
 * Hard-coded film, micron and width defaults are not used. A missing spec is
 * "unknown" and fails the check.
 */

export const JM_UNRESOLVED_LABEL = 'Job Master not found / ambiguous';
export const UNKNOWN = 'unknown';

export const FILM_OVERRIDE_ROLES = ['Admin', 'Plant Manager', 'Production Manager'];

export const GUARDRAIL_SETTING_KEY = 'job_master_guardrails';

/** Densities in g/cm³. Same values as the film substrate master. Unknown films have no density. */
export const FILM_DENSITY_BY_TYPE = {
  PET: 1.40,
  METPET: 1.40,
  BOPP: 0.91,
  METBOPP: 0.91,
  MATTEBOPP: 0.91,
  PEARLBOPP: 0.70,
  CPP: 0.91,
  METCPP: 0.91,
  LDPE: 0.93,
  PE: 0.93,
  LLDPE: 0.94,
  MGP: 0.93,
  NGP: 0.93,
  MATTA: 0.94,
  NMET: 0.935,
  MMET: 0.935,
  PVC: 1.38,
  FOIL: 2.70,
  PAPER: 0.80
};

export const DEFAULT_GUARDRAIL_LIMITS = {
  micronWarn: 0.5,
  micronBlock: 2,
  widthWiderWarnMm: 25,
  metersKgWarnPct: 8,
  metersKgBlockPct: 25,
  defaultRatedSpeedMpm: 250,
  inkGainWarnGsm: 4,
  inkGainBlockGsm: 8,
  laminationWarnPct: 3,
  laminationBlockPct: 10,
  quantityWarnPct: 10,
  quantityBlockFactor: 1.5,
  wastageBlockPct: 30,
  defaultWastagePct: 5
};

const SCRAP_KEYS = [
  'printingPlainSettingWastageKg',
  'printingWastageKg',
  'laminationPlainSubstrateWastageKg',
  'laminationPlainSubstrateWastageL2Kg',
  'printedWastageKg',
  'laminateWastageKg',
  'trimWastageKg',
  'slittingSettingWastageKg',
  'pouchingScrapKg',
  'excessFilmWastageKg'
];

export function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

export function round2(value) {
  const number = finiteNumber(value);
  if (number === null) return null;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function sameText(left, right) {
  const a = text(left).toLowerCase();
  const b = text(right).toLowerCase();
  return Boolean(a) && a === b;
}

export function normalizeFilmType(value) {
  const raw = text(value);
  if (!raw || raw === '—' || raw === '-' || raw.toLowerCase() === UNKNOWN) return '';
  let token = raw.toUpperCase().replace(/\bFILM\b/g, '').replace(/[^A-Z0-9]/g, '');
  if (!token) return '';
  if (token.includes('PEARL') && token.includes('BOPP')) return 'PEARLBOPP';
  if (token.includes('MATTE') && token.includes('BOPP')) return 'MATTEBOPP';
  if (token.includes('MET') && token.includes('BOPP')) return 'METBOPP';
  if (token.includes('BOPP') || token.includes('OPP')) return 'BOPP';
  if (token.includes('MET') && token.includes('CPP')) return 'METCPP';
  if (token.includes('CPP')) return 'CPP';
  if (token.includes('METPET') || (token.includes('MET') && token.includes('PET'))) return 'METPET';
  if (token === 'PET' || token.includes('POLYESTER')) return 'PET';
  if (token.includes('LLDPE')) return 'LLDPE';
  if (token.includes('LDPE') || token === 'LD' || token.includes('NATURALLD')) return 'LDPE';
  if (token === 'PE' || token.includes('POLYETHYLENE')) return 'PE';
  if (token.includes('MGP')) return 'MGP';
  if (token.includes('NGP')) return 'NGP';
  if (token.includes('MATTA') || token === 'ATTA') return 'MATTA';
  if (token.includes('NMET')) return 'NMET';
  if (token.includes('MMET')) return 'MMET';
  if (token.includes('PVC')) return 'PVC';
  if (token.includes('FOIL') || token.includes('ALU')) return 'FOIL';
  if (token.includes('PAPER')) return 'PAPER';
  return token;
}

export function densityForFilm(filmType, densities = FILM_DENSITY_BY_TYPE) {
  const token = normalizeFilmType(filmType);
  if (!token) return null;
  if (Object.prototype.hasOwnProperty.call(densities, token)) return densities[token];
  return null;
}

/**
 * Layer used as the printing substrate. Today that is layers[0].
 * A future role: 'print' flag wins when one layer carries it.
 */
export function printingLayer(jobMaster) {
  const layers = Array.isArray(jobMaster?.layers) ? jobMaster.layers.filter(Boolean) : [];
  const flagged = layers.find((layer) => layer.role === 'print' || layer.isPrintLayer === true);
  return flagged || layers[0] || null;
}

export function recordedPrintWidthMm(jobMaster) {
  if (!jobMaster) return null;
  if (jobMaster.printWidthRecorded === false) return null;
  if (jobMaster.print_width_mm !== undefined && jobMaster.print_width_mm !== null && jobMaster.print_width_mm !== '') {
    return finiteNumber(jobMaster.print_width_mm);
  }
  if (jobMaster.printWidthRecorded === true || jobMaster.printWidthMm !== undefined) {
    return finiteNumber(jobMaster.printWidthMm);
  }
  return null;
}

export function printLayerSpec(jobMaster) {
  if (!jobMaster) return null;
  const layer = printingLayer(jobMaster);
  const filmType = text(layer?.filmType || layer?.film_type) || null;
  const micron = finiteNumber(layer?.micron);
  const printWidthMm = recordedPrintWidthMm(jobMaster);
  const wastagePct = finiteNumber(
    jobMaster.wastagePercentage ?? jobMaster.wastagePct ?? jobMaster.wastage_percentage
  );
  return {
    jobMasterId: jobMaster.id || null,
    jobCode: text(jobMaster.skuCode || jobMaster.sku_code || jobMaster.jobCode) || null,
    filmType,
    micron,
    printWidthMm,
    wastagePct,
    density: densityForFilm(filmType),
    laminateLayers: (Array.isArray(jobMaster.layers) ? jobMaster.layers : []).slice(1)
  };
}

function skuOf(row) {
  return text(row?.skuCode || row?.sku_code || row?.sku || row?.jobCode || row?.job_code);
}

export function resolveJobMaster({ order = null, record = null, jobMasters = [] } = {}) {
  const list = (Array.isArray(jobMasters) ? jobMasters : []).filter(Boolean);
  const storedId = text(
    record?.jobMasterId ||
    order?.jobMasterId ||
    order?.jobDetails?.jobMasterId ||
    record?.job_master_id
  );
  if (storedId) {
    const byId = list.filter((job) => text(job.id) === storedId);
    if (byId.length === 1) {
      return { status: 'linked', via: 'id', jobMaster: byId[0], message: '' };
    }
  }

  const sku = text(
    order?.skuCode ||
    order?.jobDetails?.skuCode ||
    record?.skuCode ||
    order?.jobCode ||
    order?.jobDetails?.jobCode ||
    record?.jobCode
  );
  if (sku) {
    const bySku = list.filter((job) => sameText(skuOf(job), sku));
    if (bySku.length === 1) {
      return { status: 'linked', via: 'sku', jobMaster: bySku[0], message: '' };
    }
    if (bySku.length > 1) {
      return { status: 'ambiguous', via: 'sku', jobMaster: null, message: JM_UNRESOLVED_LABEL };
    }
  }

  const name = text(order?.jobName || record?.jobName);
  if (name) {
    const byName = list.filter((job) => sameText(job.jobName || job.job_name, name));
    if (byName.length === 1) {
      return { status: 'linked', via: 'name', jobMaster: byName[0], message: '' };
    }
    if (byName.length > 1) {
      return { status: 'ambiguous', via: 'name', jobMaster: null, message: JM_UNRESOLVED_LABEL };
    }
  }

  return { status: 'missing', via: null, jobMaster: null, message: JM_UNRESOLVED_LABEL };
}

export function canOverrideFilmType(role) {
  return FILM_OVERRIDE_ROLES.includes(text(role));
}

export function mergeGuardrailLimits(overrides) {
  const next = { ...DEFAULT_GUARDRAIL_LIMITS };
  if (!overrides || typeof overrides !== 'object') return next;
  Object.keys(DEFAULT_GUARDRAIL_LIMITS).forEach((key) => {
    const number = finiteNumber(overrides[key]);
    if (number !== null) next[key] = number;
  });
  return next;
}

/**
 * kg = meters × width(m) × micron × density / 1000.
 * Width is millimetres. Density is g/cm³. Micron × density is g/m².
 */
export function expectedFilmKg({ meters, widthMm, micron, filmType, densities } = {}) {
  const meterValue = finiteNumber(meters);
  const width = finiteNumber(widthMm);
  const gauge = finiteNumber(micron);
  const density = densityForFilm(filmType, densities);
  if (meterValue === null || width === null || gauge === null || density === null) {
    return { kg: null, density, areaM2: null };
  }
  if (meterValue < 0 || width < 0 || gauge < 0) {
    return { kg: null, density, areaM2: null };
  }
  const areaM2 = meterValue * (width / 1000);
  const kg = (areaM2 * gauge * density) / 1000;
  return { kg: round2(kg), density, areaM2: round2(areaM2) };
}

export function trimKgForWiderRoll({ inputKg, inputWidthMm, printWidthMm } = {}) {
  const input = finiteNumber(inputKg);
  const inputWidth = finiteNumber(inputWidthMm);
  const printWidth = finiteNumber(printWidthMm);
  if (input === null || inputWidth === null || printWidth === null) return null;
  if (inputWidth <= printWidth || inputWidth <= 0 || input < 0) return 0;
  return round2(input * ((inputWidth - printWidth) / inputWidth));
}

function finding(rule, level, message, extra = {}) {
  return {
    rule,
    level,
    message,
    actual: extra.actual ?? null,
    expected: extra.expected ?? null,
    overrideAllowed: Boolean(extra.overrideAllowed),
    trimKg: extra.trimKg ?? null
  };
}

function push(list, item) {
  if (item) list.push(item);
}

function compareFilm(actualFilm, expectedFilm) {
  const actual = normalizeFilmType(actualFilm);
  const expected = normalizeFilmType(expectedFilm);
  if (!expected || !actual) return null;
  return actual === expected;
}

export function compareRollToSpec(roll, spec, limits = DEFAULT_GUARDRAIL_LIMITS) {
  const filmType = text(roll?.filmType);
  const micron = finiteNumber(roll?.micron);
  const width = finiteNumber(roll?.widthMm);
  const expectedFilm = spec?.filmType || null;
  const expectedMicron = finiteNumber(spec?.micron);
  const expectedWidth = finiteNumber(spec?.printWidthMm);
  const blocks = [];
  const warnings = [];
  const label = roll?.label || 'Input roll';

  if (!filmType || micron === null || width === null) {
    blocks.push(finding('blank-roll', 'block', `${label} is missing film type, micron, or width. Blank roll specs cannot be saved.`, {
      actual: [filmType || UNKNOWN, micron === null ? UNKNOWN : micron, width === null ? UNKNOWN : width].join(' / '),
      expected: 'film type, micron and width'
    }));
  }
  [micron, width, finiteNumber(roll?.consumedKg), finiteNumber(roll?.consumedWeightKg)].forEach((number) => {
    if (number !== null && number < 0) {
      blocks.push(finding('negative', 'block', `${label} has a negative value (${number}).`, { actual: number, expected: '>= 0' }));
    }
  });

  const filmMatch = compareFilm(filmType, expectedFilm);
  if (expectedFilm && filmType && filmMatch === false) {
    blocks.push(finding('film-type', 'block', `${label} film ${filmType} differs from the Job Master printing layer ${expectedFilm}.`, {
      actual: filmType,
      expected: expectedFilm,
      overrideAllowed: true
    }));
  } else if (!expectedFilm && filmType) {
    blocks.push(finding('film-type', 'block', `${label} cannot be checked because the Job Master film type is unknown.`, {
      actual: filmType,
      expected: UNKNOWN
    }));
  }

  if (micron !== null && expectedMicron !== null) {
    const delta = Math.abs(micron - expectedMicron);
    if (delta > limits.micronBlock) {
      blocks.push(finding('micron', 'block', `${label} micron ${micron} µ is more than ±${limits.micronBlock} µ from the Job Master ${expectedMicron} µ.`, {
        actual: micron,
        expected: expectedMicron
      }));
    } else if (delta > limits.micronWarn) {
      warnings.push(finding('micron', 'warn', `${label} micron ${micron} µ is more than ±${limits.micronWarn} µ from the Job Master ${expectedMicron} µ.`, {
        actual: micron,
        expected: expectedMicron
      }));
    }
  } else if (micron !== null && expectedMicron === null) {
    blocks.push(finding('micron', 'block', `${label} micron cannot be checked because the Job Master micron is unknown.`, {
      actual: micron,
      expected: UNKNOWN
    }));
  }

  let widthLevel = 'ok';
  const consumed = finiteNumber(roll?.consumedKg ?? roll?.consumedWeightKg);
  const trimKg = trimKgForWiderRoll({ inputKg: consumed, inputWidthMm: width, printWidthMm: expectedWidth });
  if (width !== null && expectedWidth === null) {
    widthLevel = 'block';
    blocks.push(finding('width', 'block', `${label} width cannot be checked because the Job Master print width is unknown.`, {
      actual: width,
      expected: UNKNOWN
    }));
  } else if (width !== null && expectedWidth !== null) {
    const widerBy = width - expectedWidth;
    if (widerBy < 0) {
      widthLevel = 'block';
      blocks.push(finding('width', 'block', `${label} width ${width} mm is narrower than the Job Master print width ${expectedWidth} mm.`, {
        actual: width,
        expected: expectedWidth
      }));
    } else if (widerBy > limits.widthWiderWarnMm) {
      widthLevel = 'warn';
      warnings.push(finding('width', 'warn', `${label} width ${width} mm is more than ${limits.widthWiderWarnMm} mm wider than ${expectedWidth} mm. Trim is ${trimKg === null ? UNKNOWN : `${trimKg} kg`}.`, {
        actual: width,
        expected: expectedWidth,
        trimKg
      }));
    }
  }

  return {
    filmMatch,
    micron,
    width,
    expectedFilm,
    expectedMicron,
    expectedWidth,
    widthLevel,
    trimKg,
    blocks,
    warnings
  };
}

function percentGap(actual, expected) {
  if (expected === null || expected === 0 || actual === null) return null;
  return Math.abs(actual - expected) / Math.abs(expected) * 100;
}

function negativeFindings(entry) {
  const fields = [
    ['Meters', entry.meters],
    ['Printed output kg', entry.printedOutputKg],
    ['Print input kg', entry.printInputKg],
    ['Duration minutes', entry.durationMinutes],
    ['Printing scrap kg', entry.printingScrapKg],
    ['Order quantity kg', entry.orderQtyKg],
    ['Quantity kg', entry.quantityKg],
    ['Good output kg', entry.goodKg],
    ['Total scrap kg', entry.scrapKg],
    ['Lamination output kg', entry.lamination?.outputKg],
    ['Lamination substrate kg', entry.lamination?.substrateKg],
    ['Lamination adhesive kg', entry.lamination?.adhesiveKg],
    ['Lamination scrap kg', entry.lamination?.scrapKg],
    ['Pouching kg', entry.pouchingKg],
    ['Pouching pcs', entry.pouchingPcs],
    ['Zipper kg', entry.zipperKg],
    ['Zipper m', entry.zipperM]
  ];
  return fields
    .map(([label, value]) => {
      const number = finiteNumber(value);
      if (number !== null && number < 0) {
        return finding('negative', 'block', `${label} is negative (${number}).`, { actual: number, expected: '>= 0' });
      }
      return null;
    })
    .filter(Boolean);
}

function rollList(entry, context) {
  const rolls = Array.isArray(entry.inputRolls) ? entry.inputRolls : [];
  return rolls.filter((roll) => {
    if (!roll) return false;
    if (context === 'end-press') return true;
    const consumed = finiteNumber(roll.consumedKg ?? roll.consumedWeightKg);
    const hasSpec = text(roll.filmType) || finiteNumber(roll.micron) !== null || finiteNumber(roll.widthMm) !== null;
    const hasId = text(roll.barcodeId || roll.barcode);
    return (consumed !== null && consumed > 0) || hasSpec || hasId;
  });
}

export function dispatchReadyKg(record = {}) {
  const dispatch = finiteNumber(record.qtyDispatch ?? record.qty_dispatch);
  if (dispatch !== null && dispatch > 0) return round2(dispatch);
  const pouchKg = finiteNumber(record.qtyPouching ?? record.qty_pouching);
  if (pouchKg !== null && pouchKg > 0) return round2(pouchKg);
  const slit = finiteNumber(record.qtySlitting ?? record.qty_slitting);
  if (slit !== null && slit > 0) return round2(slit);
  return 0;
}

/**
 * Production-entry saves pass deriveNetFromStages so printing output is not
 * copied into net usable. Other saves (approval, dispatch) keep a stored net.
 */
export function netUsableForSave(record = {}) {
  const ready = dispatchReadyKg(record);
  if (record.deriveNetFromStages) return ready;
  if (ready > 0) return ready;
  const stored = finiteNumber(record.netUsableKg ?? record.net_usable_kg);
  if (stored !== null && stored >= 0) return round2(stored);
  return 0;
}

export function sumSfgScrapKg(logs) {
  const totals = Object.fromEntries(SCRAP_KEYS.map((key) => [key, 0]));
  (Array.isArray(logs) ? logs : []).forEach((log) => {
    const breakdown = log?.scrapBreakdown || {};
    SCRAP_KEYS.forEach((key) => {
      const number = finiteNumber(breakdown[key]);
      if (number !== null && number > 0) totals[key] += number;
    });
  });
  SCRAP_KEYS.forEach((key) => {
    totals[key] = round2(totals[key]);
  });
  totals.total = round2(SCRAP_KEYS.reduce((sum, key) => sum + totals[key], 0));
  return totals;
}

/** Copy SFG-log scrap into empty stage fields. Does not add scrap that is already on the record. */
export function rollSfgScrapIntoRecord(record = {}) {
  const fromLogs = sumSfgScrapKg(record.sfgConsumptions);
  const next = { ...record };
  SCRAP_KEYS.forEach((key) => {
    const current = finiteNumber(record[key]);
    if ((current === null || current === 0) && fromLogs[key] > 0) next[key] = fromLogs[key];
  });
  const total = round2(SCRAP_KEYS.reduce((sum, key) => sum + (finiteNumber(next[key]) || 0), 0));
  next.totalScrapQtyKg = total;
  next.totalWastageKg = total;
  return next;
}

function layerSpecForRoll(roll, spec) {
  const index = finiteNumber(roll?.layerIndex);
  if (index !== null && index > 0 && spec?.laminateLayers?.[index - 1]) {
    const layer = spec.laminateLayers[index - 1];
    return {
      ...spec,
      filmType: text(layer.filmType || layer.film_type) || null,
      micron: finiteNumber(layer.micron),
      density: densityForFilm(layer.filmType || layer.film_type)
    };
  }
  return spec;
}

export function validateProductionEntry({
  context = 'record-form',
  order = null,
  jobMasters = [],
  entry = {},
  limits: limitOverrides = null,
  role = ''
} = {}) {
  const limits = mergeGuardrailLimits(limitOverrides);
  const resolution = resolveJobMaster({ order, record: entry, jobMasters });
  const spec = printLayerSpec(resolution.jobMaster);
  const blocks = [];
  const warnings = [];

  if (!text(entry.orderId || order?.id)) {
    blocks.push(finding('order', 'block', 'A production record needs an order. Saving without an order is blocked.', {
      actual: null,
      expected: 'order id'
    }));
  }
  if (resolution.status !== 'linked') {
    blocks.push(finding('job-master', 'block', `${JM_UNRESOLVED_LABEL}. Saving is blocked until this order matches one Job Master by id, SKU, or a unique job name.`, {
      actual: resolution.status,
      expected: 'one Job Master'
    }));
  }

  ['machineName', 'operatorName', 'shift'].forEach((key) => {
    if (!text(entry[key])) {
      const label = key === 'machineName' ? 'Machine' : key === 'operatorName' ? 'Operator' : 'Shift';
      blocks.push(finding('identity', 'block', `${label} is required.`, { actual: null, expected: label }));
    }
  });

  negativeFindings(entry).forEach((item) => blocks.push(item));

  const rolls = rollList(entry, context);
  if ((context === 'end-press' || context === 'record-form') && rolls.length === 0 && finiteNumber(entry.printInputKg) > 0) {
    blocks.push(finding('blank-roll', 'block', 'Print input has no roll specs.', { actual: UNKNOWN, expected: 'film type, micron and width' }));
  }
  rolls.forEach((roll, index) => {
    const compared = compareRollToSpec({ ...roll, label: roll.label || `Roll ${index + 1}` }, layerSpecForRoll(roll, spec), limits);
    compared.blocks.forEach((item) => blocks.push(item));
    compared.warnings.forEach((item) => warnings.push(item));
  });

  if (context === 'sfg-fg') {
    const outputRolls = Array.isArray(entry.outputRolls) ? entry.outputRolls : [];
    outputRolls.forEach((roll, index) => {
      const compared = compareRollToSpec({ ...roll, label: roll.label || `Output roll ${index + 1}` }, spec, limits);
      compared.blocks.forEach((item) => blocks.push(item));
      compared.warnings.forEach((item) => warnings.push(item));
    });
    if (outputRolls.length === 0) {
      const loose = compareRollToSpec({
        label: 'Output',
        filmType: entry.filmType,
        micron: entry.micron,
        widthMm: entry.widthMm
      }, spec, limits);
      loose.blocks.forEach((item) => blocks.push(item));
      loose.warnings.forEach((item) => warnings.push(item));
    }
  }

  const meters = finiteNumber(entry.meters);
  const consumed = finiteNumber(entry.printInputKg);
  const primaryRoll = rolls.reduce((heaviest, roll) => {
    const kg = finiteNumber(roll?.consumedKg ?? roll?.consumedWeightKg) || 0;
    const best = finiteNumber(heaviest?.consumedKg ?? heaviest?.consumedWeightKg) || 0;
    return kg >= best ? roll : heaviest;
  }, rolls[0] || null);
  if (meters !== null && meters > 0 && consumed !== null && consumed > 0 && primaryRoll) {
    const expected = expectedFilmKg({
      meters,
      widthMm: primaryRoll.widthMm,
      micron: primaryRoll.micron,
      filmType: primaryRoll.filmType
    });
    if (expected.kg === null) {
      blocks.push(finding('meters-kg', 'block', 'Meters cannot be checked against kg because film density, micron, or width is unknown.', {
        actual: consumed,
        expected: UNKNOWN
      }));
    } else {
      const gap = percentGap(consumed, expected.kg);
      if (gap > limits.metersKgBlockPct) {
        blocks.push(finding('meters-kg', 'block', `Consumed ${consumed} kg differs from the meters estimate ${expected.kg} kg by ${round2(gap)}% (block above ${limits.metersKgBlockPct}%).`, {
          actual: consumed,
          expected: expected.kg
        }));
      } else if (gap > limits.metersKgWarnPct) {
        warnings.push(finding('meters-kg', 'warn', `Consumed ${consumed} kg differs from the meters estimate ${expected.kg} kg by ${round2(gap)}% (warn above ${limits.metersKgWarnPct}%).`, {
          actual: consumed,
          expected: expected.kg
        }));
      }
    }
  }

  const duration = finiteNumber(entry.durationMinutes);
  if (meters !== null && meters > 0 && duration !== null && duration > 0) {
    const speed = meters / duration;
    const configured = finiteNumber(entry.ratedSpeedMpm);
    const ratedKnown = entry.ratedSpeedConfigured === true && configured !== null && configured > 0;
    const rated = ratedKnown ? configured : limits.defaultRatedSpeedMpm;
    if (!ratedKnown) {
      warnings.push(finding('speed', 'warn', `Machine rated speed is not set. The check uses the default ${limits.defaultRatedSpeedMpm} m/min.`, {
        actual: round2(speed),
        expected: limits.defaultRatedSpeedMpm
      }));
    }
    if (speed > rated * 2) {
      blocks.push(finding('speed', 'block', `Press speed ${round2(speed)} m/min is above twice the rated ${rated} m/min.`, {
        actual: round2(speed),
        expected: rated
      }));
    } else if (speed > rated) {
      warnings.push(finding('speed', 'warn', `Press speed ${round2(speed)} m/min is above the rated ${rated} m/min.`, {
        actual: round2(speed),
        expected: rated
      }));
    }
  }

  const outputKg = finiteNumber(entry.printedOutputKg);
  const scrapKg = finiteNumber(entry.printingScrapKg) || 0;
  if (outputKg !== null && consumed !== null && consumed > 0) {
    const widthForArea = finiteNumber(spec?.printWidthMm ?? primaryRoll?.widthMm);
    const trim = trimKgForWiderRoll({
      inputKg: consumed,
      inputWidthMm: primaryRoll?.widthMm,
      printWidthMm: widthForArea
    }) || 0;
    const effectiveInput = consumed - trim;
    const inkKg = outputKg + scrapKg - effectiveInput;
    const area = meters !== null && meters > 0 && widthForArea
      ? meters * (widthForArea / 1000)
      : null;
    const gsm = area ? (inkKg * 1000) / area : null;
    if (outputKg + scrapKg < effectiveInput && scrapKg === 0) {
      blocks.push(finding('ink-gain', 'block', `Print output ${outputKg} kg is below the substrate ${round2(effectiveInput)} kg and scrap is zero.`, {
        actual: round2(inkKg),
        expected: 'ink gain with scrap, or output at least the substrate'
      }));
    }
    if (gsm !== null && gsm > limits.inkGainBlockGsm) {
      blocks.push(finding('ink-gain', 'block', `Printing ink gain ${round2(gsm)} g/m² is above ${limits.inkGainBlockGsm} g/m².`, {
        actual: round2(gsm),
        expected: `<= ${limits.inkGainBlockGsm}`
      }));
    } else if (gsm !== null && (gsm < 0 || gsm > limits.inkGainWarnGsm)) {
      warnings.push(finding('ink-gain', 'warn', `Printing ink gain ${round2(gsm)} g/m² is outside 0 to ${limits.inkGainWarnGsm} g/m².`, {
        actual: round2(gsm),
        expected: `0–${limits.inkGainWarnGsm}`
      }));
    }
  }

  const lam = entry.lamination;
  if (lam && (finiteNumber(lam.outputKg) !== null || finiteNumber(lam.substrateKg) !== null)) {
    const printed = finiteNumber(lam.printedKg) || 0;
    const substrate = finiteNumber(lam.substrateKg) || 0;
    const adhesive = finiteNumber(lam.adhesiveKg) || 0;
    const lamOut = finiteNumber(lam.outputKg);
    const lamScrap = finiteNumber(lam.scrapKg) || 0;
    const lamIn = printed + substrate + adhesive;
    if (lamOut === null || lamIn <= 0) {
      blocks.push(finding('lamination', 'block', 'Lamination mass balance needs an output and the printed, substrate, and adhesive inputs.', {
        actual: lamOut,
        expected: 'inputs and output'
      }));
    } else {
      const balance = lamOut + lamScrap;
      const gap = percentGap(balance, lamIn);
      if (gap > limits.laminationBlockPct) {
        blocks.push(finding('lamination', 'block', `Lamination output plus scrap ${round2(balance)} kg differs from inputs ${round2(lamIn)} kg by ${round2(gap)}% (block above ${limits.laminationBlockPct}%).`, {
          actual: round2(balance),
          expected: round2(lamIn)
        }));
      } else if (gap > limits.laminationWarnPct) {
        warnings.push(finding('lamination', 'warn', `Lamination output plus scrap ${round2(balance)} kg differs from inputs ${round2(lamIn)} kg by ${round2(gap)}% (warn above ${limits.laminationWarnPct}%).`, {
          actual: round2(balance),
          expected: round2(lamIn)
        }));
      }
    }
  }

  const orderQty = finiteNumber(entry.orderQtyKg ?? order?.orderQtyKg);
  const quantity = finiteNumber(entry.quantityKg);
  if (orderQty !== null && orderQty > 0 && quantity !== null && quantity > 0) {
    const warnAt = orderQty * (1 + limits.quantityWarnPct / 100);
    const blockAt = orderQty * limits.quantityBlockFactor;
    if (quantity > blockAt) {
      blocks.push(finding('quantity', 'block', `Quantity ${quantity} kg is above ${limits.quantityBlockFactor}× the order ${orderQty} kg.`, {
        actual: quantity,
        expected: orderQty
      }));
    } else if (quantity > warnAt) {
      warnings.push(finding('quantity', 'warn', `Quantity ${quantity} kg is above the order ${orderQty} kg by more than ${limits.quantityWarnPct}%.`, {
        actual: quantity,
        expected: orderQty
      }));
    }
  }

  const good = finiteNumber(entry.goodKg);
  const stageScrap = finiteNumber(entry.scrapKg);
  if (stageScrap !== null && stageScrap >= 0 && good !== null && good + stageScrap > 0) {
    const wastagePct = (stageScrap / (good + stageScrap)) * 100;
    const jmWastage = finiteNumber(spec?.wastagePct ?? entry.jmWastagePct);
    const warnAt = jmWastage === null ? limits.defaultWastagePct : jmWastage;
    if (wastagePct > limits.wastageBlockPct) {
      blocks.push(finding('wastage', 'block', `Stage wastage ${round2(wastagePct)}% is above ${limits.wastageBlockPct}%.`, {
        actual: round2(wastagePct),
        expected: warnAt
      }));
    } else if (wastagePct > warnAt) {
      warnings.push(finding('wastage', 'warn', `Stage wastage ${round2(wastagePct)}% is above the Job Master wastage ${warnAt}%.`, {
        actual: round2(wastagePct),
        expected: warnAt
      }));
    }
  }

  const targetMeters = finiteNumber(entry.targetMeters);
  if (context === 'end-press' && targetMeters !== null && targetMeters > 0 && meters !== null && meters < targetMeters) {
    warnings.push(finding('meters-target', 'warn', `Actual meters ${meters} are below the target ${targetMeters}. This is a warning and needs a reason. The operator does not have to type the target.`, {
      actual: meters,
      expected: targetMeters
    }));
  }

  const filmBlocks = blocks.filter((item) => item.rule === 'film-type' && item.overrideAllowed);
  const hardBlocks = blocks.filter((item) => !(item.rule === 'film-type' && item.overrideAllowed));

  return {
    context,
    limits,
    resolution,
    spec,
    blocks: hardBlocks,
    filmTypeBlocks: filmBlocks,
    warnings,
    findings: [...hardBlocks, ...filmBlocks, ...warnings]
  };
}

export function decideGuardrailSave(result, { role = '', warningReason = '', filmTypeOverrideReason = '', overrideBy = '' } = {}) {
  const hard = result?.blocks || [];
  const film = result?.filmTypeBlocks || [];
  const warnings = result?.warnings || [];
  const reason = text(warningReason);
  const filmReason = text(filmTypeOverrideReason);
  const messages = [];

  if (hard.length) {
    messages.push(...hard.map((item) => item.message));
  }
  let filmOverride = null;
  if (film.length) {
    if (!canOverrideFilmType(role) || !filmReason) {
      messages.push(...film.map((item) => item.message));
      if (!canOverrideFilmType(role)) {
        messages.push('Film type can be overridden only by an Admin, Plant Manager, or Production Manager, with a reason.');
      } else {
        messages.push('Film type differs from the Job Master. A supervisor reason is required.');
      }
    } else {
      filmOverride = {
        reason: filmReason,
        by: text(overrideBy) || text(role),
        role: text(role),
        findings: film
      };
    }
  }
  if (warnings.length && !reason) {
    messages.push('A warning needs a typed reason before this record can be saved.');
    warnings.forEach((item) => messages.push(item.message));
  }

  const spec = result?.spec;
  const resolution = result?.resolution;
  return {
    ok: messages.length === 0,
    messages,
    fields: {
      jobMasterId: resolution?.status === 'linked' ? (spec?.jobMasterId || resolution.jobMaster?.id || null) : null,
      jobCode: spec?.jobCode || null,
      printFilmType: spec?.filmType || null,
      printMicron: spec?.micron ?? null,
      printWidthMm: spec?.printWidthMm ?? null,
      guardrailWarningReason: warnings.length ? reason : '',
      guardrailWarnings: warnings,
      filmTypeOverrideReason: filmOverride ? filmOverride.reason : '',
      filmTypeOverrideBy: filmOverride ? filmOverride.by : '',
      filmTypeOverrideRole: filmOverride ? filmOverride.role : ''
    }
  };
}

export function applyGuardrailFields(record, decision) {
  const fields = decision?.fields || {};
  return {
    ...record,
    jobMasterId: fields.jobMasterId || record.jobMasterId || null,
    jobCode: fields.jobCode || record.jobCode || '',
    printFilmType: fields.printFilmType ?? null,
    printMicron: fields.printMicron ?? null,
    printWidthMm: fields.printWidthMm ?? null,
    micron: fields.printMicron ?? record.micron ?? null,
    guardrailWarningReason: fields.guardrailWarningReason || '',
    guardrailWarnings: fields.guardrailWarnings || [],
    filmTypeOverrideReason: fields.filmTypeOverrideReason || '',
    filmTypeOverrideBy: fields.filmTypeOverrideBy || '',
    filmTypeOverrideRole: fields.filmTypeOverrideRole || '',
    netUsableKg: netUsableForSave(record),
    qtyDispatch: finiteNumber(record.qtyDispatch) === null ? 0 : finiteNumber(record.qtyDispatch)
  };
}

export function substrateMatchSummary({ order = null, record = null, jobMasters = [], limits } = {}) {
  const resolution = resolveJobMaster({ order, record, jobMasters });
  const liveSpec = printLayerSpec(resolution.jobMaster);
  const savedSpec = (record?.printFilmType || record?.printMicron || record?.printWidthMm)
    ? {
      jobMasterId: record.jobMasterId || null,
      jobCode: record.jobCode || null,
      filmType: text(record.printFilmType) || null,
      micron: finiteNumber(record.printMicron),
      printWidthMm: finiteNumber(record.printWidthMm),
      wastagePct: null,
      density: densityForFilm(record.printFilmType),
      laminateLayers: liveSpec?.laminateLayers || []
    }
    : null;
  const spec = liveSpec || savedSpec;
  const rolls = Array.isArray(record?.inputRollsList) ? record.inputRollsList : [];
  const mergedLimits = mergeGuardrailLimits(limits);
  const rows = rolls.map((roll, index) => {
    const compared = compareRollToSpec({
      ...roll,
      consumedKg: roll.consumedWeightKg,
      label: `Roll ${index + 1}`
    }, spec, mergedLimits);
    const failed = compared.blocks.length > 0;
    const warned = compared.warnings.length > 0;
    return {
      index,
      filmType: text(roll.filmType) || UNKNOWN,
      micron: finiteNumber(roll.micron),
      widthMm: finiteNumber(roll.widthMm),
      filmPass: compared.filmMatch,
      micronLevel: compared.blocks.some((item) => item.rule === 'micron' || item.rule === 'blank-roll')
        ? 'fail'
        : compared.warnings.some((item) => item.rule === 'micron') ? 'warn' : (compared.micron === null ? 'fail' : 'pass'),
      widthLevel: compared.widthLevel === 'block' ? 'fail' : compared.widthLevel === 'warn' ? 'warn' : (compared.width === null ? 'fail' : 'pass'),
      trimKg: compared.trimKg,
      status: failed ? 'fail' : warned ? 'warn' : 'pass',
      messages: [...compared.blocks, ...compared.warnings].map((item) => item.message)
    };
  });
  const specLabel = !spec
    ? JM_UNRESOLVED_LABEL
    : [
      spec.filmType || UNKNOWN,
      spec.micron === null ? `${UNKNOWN} µ` : `${spec.micron} µ`,
      spec.printWidthMm === null ? `${UNKNOWN} mm` : `${spec.printWidthMm} mm`
    ].join(' / ');
  return { resolution, spec, specLabel, rows };
}
