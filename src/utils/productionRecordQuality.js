/**
 * Shared production-record checks.
 * Measured facts stay blank when they were not recorded.
 * Costing defaults (target ink GSM 1.5 and similar) are not treated as measurements.
 * There is no cap on how much SFG or FG an order may produce.
 */

export const NOT_RECORDED = 'Not recorded';
export const NO_JOB_SPEC = 'No linked job spec';
export const WIDTH_TOLERANCE_MM = 5;

const PLACEHOLDER_TOKENS = new Set([
  'n/a',
  'na',
  'dummy',
  'test',
  'placeholder',
  'sample',
  'null',
  'undefined',
  'nan',
  '[object object]',
  '—',
  '–',
  '-'
]);

export const FIELD_BOUNDS = {
  inkGsm: {
    unit: 'g/m²',
    warnMin: 0.3,
    warnMax: 4,
    blockMin: 0,
    blockMax: 12,
    requiredOnForm: true,
    blockZeroOnForm: true,
    rationale: 'Operator ink GSM on real jobs is about 0.4–1.7. Above 12 g/m² is not a dry ink laydown.'
  },
  adhesiveGsm: {
    unit: 'g/m²',
    warnMin: 0.4,
    warnMax: 8,
    blockMin: 0,
    blockMax: 15,
    blockZeroOnForm: false,
    rationale: 'Adhesive coat is usually a few g/m². Above 15 g/m² is not a measured coat weight.'
  },
  dryInkKg: {
    unit: 'kg',
    warnMax: 40,
    warnPctOfInput: 8,
    blockMin: 0,
    blockMax: 120,
    blockPctOfInput: 20,
    rationale: 'Dried web gain is the dry solids. A 975 kg figure was downstream output counted as ink.'
  },
  wastagePct: {
    unit: '%',
    warnMax: 15,
    blockMin: 0,
    blockMax: 100,
    rationale: 'A percentage cannot exceed 100. Above 15% is unusual for this plant and needs a reason.'
  },
  rollKg: {
    unit: 'kg',
    warnMax: 1000,
    blockMin: 0,
    blockMax: 2500,
    rationale: 'Substrate rolls in production reach about 1450 kg. Above 2500 kg is not a single roll.'
  },
  jobKg: {
    unit: 'kg',
    warnMax: 3000,
    blockMin: 0,
    blockMax: 20000,
    rationale: 'Job weight above 3000 kg is unusual. Above 20000 kg is not a flexible-packaging order weight.'
  },
  micron: {
    unit: 'µ',
    warnMin: 6,
    warnMax: 120,
    blockMin: 0,
    blockMax: 350,
    rationale: 'Films in use are 12, 18 and 55 µ. Above 350 µ is not a packaging film gauge.'
  },
  widthMm: {
    unit: 'mm',
    warnMin: 250,
    warnMax: 1300,
    blockMin: 0,
    blockMax: 1800,
    rationale: 'Press widths in use are about 510–1010 mm. Above 1800 mm exceeds the press.'
  },
  meters: {
    unit: 'm',
    warnMax: 80000,
    blockMin: 0,
    blockMax: 250000,
    rationale: 'Recorded print runs reach about 42000 m. Above 250000 m is not one run.'
  },
  speedMpm: {
    unit: 'm/min',
    warnMin: 30,
    warnMax: 280,
    blockMin: 0,
    blockMax: 450,
    rationale: 'Rotogravure speed sits well below 450 m/min. The field is checked when it is captured.'
  },
  adhesiveKg: {
    unit: 'kg',
    warnMax: 40,
    blockMin: 0,
    blockMax: 150,
    rationale: 'Adhesive entries are about 17–20 kg. Above 150 kg is not one lamination pass.'
  },
  scrapKg: {
    unit: 'kg',
    warnMax: 80,
    blockMin: 0,
    blockMax: 500,
    rationale: 'Scrap above 80 kg needs a reason. Above 500 kg is not a single process scrap entry.'
  }
};

export function isPlaceholderText(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return false;
  return PLACEHOLDER_TOKENS.has(text);
}

export function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && isPlaceholderText(value)) return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

export function displayQuantity(value, digits = 2, suffix = '') {
  const number = finiteNumber(value);
  if (number === null) return NOT_RECORDED;
  const shown = number.toFixed(digits);
  return suffix ? `${shown} ${suffix}` : shown;
}

export function displayText(value) {
  if (value === null || value === undefined) return NOT_RECORDED;
  const text = String(value).trim();
  if (!text || isPlaceholderText(text)) return NOT_RECORDED;
  return text;
}

export function filmTypeToken(value) {
  const text = displayText(value);
  if (text === NOT_RECORDED) return '';
  const leading = text.split(/[\s(/]/)[0].replace(/[^a-zA-Z]/g, '');
  return leading.toUpperCase();
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== null && number !== 0) return number;
    if (number === 0) continue;
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    const text = displayText(value);
    if (text !== NOT_RECORDED) return text;
  }
  return null;
}

export function resolveJobSpec(order, jobMaster) {
  const layers = []
    .concat(order?.layers || order?.jobDetails?.layers || jobMaster?.layers || [])
    .filter((layer) => layer && (layer.filmType || layer.film_type || layer.micron || layer.widthMm || layer.width_mm));
  const filmType = firstText(layers[0]?.filmType, layers[0]?.film_type, order?.printFilmType, jobMaster?.filmType);
  const micron = firstFinite(layers[0]?.micron, order?.micron, jobMaster?.micron);
  const printWidthMm = firstFinite(
    order?.printWidthMm,
    order?.jobDetails?.printWidthMm,
    jobMaster?.printWidthMm,
    layers[0]?.widthMm,
    layers[0]?.width_mm,
    order?.widthMm
  );
  if (!filmType && micron === null && printWidthMm === null) return null;
  return {
    layers,
    filmType: filmType || null,
    micron,
    printWidthMm
  };
}

export function compareSubstrate({ spec, actual }) {
  const expectedFilm = spec?.filmType || null;
  const actualFilm = actual?.filmType ? displayText(actual.filmType) : null;
  const actualFilmShown = actualFilm && actualFilm !== NOT_RECORDED ? actualFilm : null;
  const expectedWidth = finiteNumber(spec?.printWidthMm);
  const actualWidth = finiteNumber(actual?.widthMm);
  const expectedMicron = finiteNumber(spec?.micron);
  const actualMicron = finiteNumber(actual?.micron);

  const typeMatch = expectedFilm && actualFilmShown
    ? filmTypeToken(expectedFilm) === filmTypeToken(actualFilmShown)
    : null;
  const sizeMatch = expectedWidth !== null && actualWidth !== null
    ? Math.abs(actualWidth - expectedWidth) <= WIDTH_TOLERANCE_MM
    : null;
  const micronMatch = expectedMicron !== null && actualMicron !== null
    ? expectedMicron === actualMicron
    : null;

  const warnings = [];
  if (typeMatch === false) {
    warnings.push(`Substrate type ${actualFilmShown} does not match the job spec ${expectedFilm}.`);
  }
  if (sizeMatch === false) {
    warnings.push(`Width ${actualWidth} mm is outside ${WIDTH_TOLERANCE_MM} mm of the job width ${expectedWidth} mm.`);
  }
  if (micronMatch === false) {
    warnings.push(`Micron ${actualMicron} does not match the job spec ${expectedMicron} µ.`);
  }

  return {
    specStatus: spec ? 'recorded' : NO_JOB_SPEC,
    actualStatus: actualFilmShown || actualWidth !== null || actualMicron !== null ? 'recorded' : NOT_RECORDED,
    expectedFilm,
    actualFilm: actualFilmShown,
    expectedWidth,
    actualWidth,
    expectedMicron,
    actualMicron,
    typeMatch,
    sizeMatch,
    micronMatch,
    warnings
  };
}

/**
 * Blank or missing optional kilograms count as 0.
 * A negative or non-numeric entry is invalid and returns null.
 */
export function parseOptionalKg(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  const number = finiteNumber(value);
  if (number === null || number < 0) return null;
  return roundMeasure(number);
}

function nonNegativeKg(value) {
  const parsed = parseOptionalKg(value);
  return parsed === null ? 0 : parsed;
}

/**
 * Dry ink solids are the mass that is not substrate.
 *
 * Edge trim is removed first, and only when the input roll is wider than the
 * print width. Plain setting and printing wastage are substrate that left the
 * roll and is not in the good printed output (wastage may also carry ink).
 * They are added back so that film is not treated as missing ink.
 *
 * dry ink = printed output + plain setting + printing wastage − substrate after trim
 *
 * Missing plain setting or printing wastage counts as 0, so an older record
 * with neither value keeps the previous result: printed output − substrate after trim.
 * Do not multiply by 0.20. Do not treat a missing input weight as zero.
 */
export function computeDryInkSolids({
  inputKg,
  outputKg,
  inputWidthMm,
  printWidthMm,
  meters,
  plainSettingKg,
  printingWastageKg
} = {}) {
  const input = finiteNumber(inputKg);
  const output = finiteNumber(outputKg);
  if (input === null || input <= 0 || output === null) {
    return {
      status: NOT_RECORDED,
      dryInkSolidsKg: null,
      trimKg: null,
      effectiveInputKg: null,
      plainSettingKg: nonNegativeKg(plainSettingKg),
      printingWastageKg: nonNegativeKg(printingWastageKg),
      gsm: null,
      areaM2: null
    };
  }

  let effectiveInput = input;
  let trimKg = 0;
  const inputWidth = finiteNumber(inputWidthMm);
  const printWidth = finiteNumber(printWidthMm);
  if (inputWidth !== null && printWidth !== null && inputWidth > printWidth) {
    trimKg = input * ((inputWidth - printWidth) / inputWidth);
    effectiveInput = input - trimKg;
  }

  const plainSetting = nonNegativeKg(plainSettingKg);
  const printingWastage = nonNegativeKg(printingWastageKg);
  const dryInkSolidsKg = roundMeasure(output - effectiveInput + plainSetting + printingWastage);
  const meterValue = finiteNumber(meters);
  const areaM2 = meterValue !== null && meterValue > 0 && printWidth !== null && printWidth > 0
    ? (meterValue * printWidth) / 1000
    : null;
  const gsm = areaM2 ? roundMeasure((dryInkSolidsKg * 1000) / areaM2) : null;

  return {
    status: 'recorded',
    dryInkSolidsKg,
    trimKg: roundMeasure(trimKg),
    effectiveInputKg: roundMeasure(effectiveInput),
    plainSettingKg: plainSetting,
    printingWastageKg: printingWastage,
    gsm,
    areaM2: areaM2 === null ? null : roundMeasure(areaM2)
  };
}

function roundMeasure(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function classifyMeasure(field, value, options = {}) {
  const bounds = FIELD_BOUNDS[field];
  if (!bounds) return { level: 'ok', message: '' };
  const mode = options.mode || 'form';
  const parsed = parseMeasure(value);

  if (parsed.kind === 'missing') {
    if (mode === 'form' && bounds.requiredOnForm) {
      return { level: 'block', message: `${labelFor(field)} is required.` };
    }
    return { level: 'missing', message: '' };
  }
  if (parsed.kind === 'placeholder' || parsed.kind === 'invalid') {
    return { level: 'block', message: `${labelFor(field)} is not a number (${parsed.text}).` };
  }

  const number = parsed.value;
  if (mode === 'service' && (number === 0 || number === null)) {
    return { level: 'ok', message: '' };
  }
  if (mode === 'form' && bounds.blockZeroOnForm && number === 0) {
    return { level: 'block', message: `${labelFor(field)} must be greater than 0.` };
  }
  if (number < bounds.blockMin || (bounds.blockMax !== undefined && number > bounds.blockMax)) {
    return {
      level: 'block',
      message: `${labelFor(field)} ${number} ${bounds.unit} is outside the possible range ${rangeText(bounds)}.`
    };
  }

  const inputKg = finiteNumber(options.inputKg);
  if (field === 'dryInkKg' && inputKg !== null && inputKg > 0) {
    const pct = (number / inputKg) * 100;
    if (number < 0 || number > bounds.blockMax || pct > bounds.blockPctOfInput) {
      return {
        level: 'block',
        message: `Dry ink solids ${number} kg (${pct.toFixed(1)}% of print input) is outside the physical range.`
      };
    }
    if (number > bounds.warnMax || pct > bounds.warnPctOfInput) {
      return {
        level: 'warn',
        message: `This value looks wrong: dry ink solids ${number} kg, expected up to ${bounds.warnMax} kg or ${bounds.warnPctOfInput}% of print input.`
      };
    }
  }

  const belowWarn = bounds.warnMin !== undefined && number < bounds.warnMin && number > bounds.blockMin;
  const aboveWarn = bounds.warnMax !== undefined && number > bounds.warnMax;
  if (belowWarn || aboveWarn) {
    return {
      level: 'warn',
      message: `This value looks wrong: expected ${warnText(bounds)}.`
    };
  }
  return { level: 'ok', message: '' };
}

function parseMeasure(value) {
  if (value === null || value === undefined || value === '') return { kind: 'missing' };
  if (typeof value === 'string' && isPlaceholderText(value)) return { kind: 'placeholder', text: value.trim() };
  if (typeof value === 'string' && value.trim() === '') return { kind: 'missing' };
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(number)) return { kind: 'invalid', text: String(value).trim() };
  return { kind: 'number', value: number };
}

function labelFor(field) {
  const labels = {
    inkGsm: 'Ink GSM',
    adhesiveGsm: 'Adhesive GSM',
    dryInkKg: 'Dry ink solids',
    wastagePct: 'Wastage',
    rollKg: 'Roll weight',
    jobKg: 'Job weight',
    micron: 'Micron',
    widthMm: 'Width',
    meters: 'Meters',
    speedMpm: 'Speed',
    adhesiveKg: 'Adhesive weight',
    scrapKg: 'Scrap weight'
  };
  return labels[field] || field;
}

function rangeText(bounds) {
  const min = bounds.blockMin === 0 ? 'above 0' : String(bounds.blockMin);
  return `${min}–${bounds.blockMax} ${bounds.unit}`;
}

function warnText(bounds) {
  if (bounds.warnMin !== undefined && bounds.warnMax !== undefined) {
    return `${bounds.warnMin}–${bounds.warnMax} ${bounds.unit}`;
  }
  if (bounds.warnMax !== undefined) return `up to ${bounds.warnMax} ${bounds.unit}`;
  return bounds.unit;
}

const FORM_FIELDS = [
  ['inkGsm', 'actualInkGsm'],
  ['adhesiveGsm', 'actualAdhesiveGsm'],
  ['wastagePct', 'wastagePercentage'],
  ['meters', 'actualMetersPrinted'],
  ['widthMm', 'printWidthMm'],
  ['micron', 'micron'],
  ['rollKg', 'printedOutputKg'],
  ['jobKg', 'grossProductionKg'],
  ['dryInkKg', 'dryInkSolidsKg'],
  ['adhesiveKg', 'adhesiveConsumedL1Kg'],
  ['scrapKg', 'totalScrapQtyKg'],
  ['speedMpm', 'speedMpm']
];

export function assessFormMeasures(values = {}) {
  const blocks = [];
  const warnings = [];
  FORM_FIELDS.forEach(([field, key]) => {
    if (!(key in values)) return;
    const result = classifyMeasure(field, values[key], {
      mode: 'form',
      inputKg: values.printInputKg
    });
    if (result.level === 'block' && result.message) blocks.push(result.message);
    if (result.level === 'warn' && result.message) warnings.push(result.message);
  });
  (values.substrateWarnings || []).forEach((warning) => warnings.push(warning));
  return { blocks, warnings };
}

const SERVICE_FIELDS = [
  ['inkGsm', 'actualInkGsm'],
  ['adhesiveGsm', 'actualAdhesiveGsm'],
  ['wastagePct', 'wastagePercentage'],
  ['meters', 'actualMetersPrinted'],
  ['rollKg', 'printedOutputKg'],
  ['jobKg', 'grossProductionKg'],
  ['adhesiveKg', 'adhesiveConsumedL1Kg'],
  ['scrapKg', 'totalScrapQtyKg']
];

export function persistableMeasureProblems(record = {}) {
  const problems = [];
  SERVICE_FIELDS.forEach(([field, key]) => {
    const result = classifyMeasure(field, record[key], { mode: 'service', inputKg: record.printInputKg });
    if (result.level === 'block' && result.message) problems.push(result.message);
  });
  const rolls = [].concat(record.inputRollsList || [], record.outputRolls || [], record.rollsBreakdown || []);
  rolls.forEach((roll) => {
    if (!roll) return;
    if (isPlaceholderText(roll.filmType)) {
      problems.push(`Substrate "${roll.filmType}" is a placeholder, not a film type.`);
    }
    const weight = classifyMeasure('rollKg', roll.consumedWeightKg ?? roll.netWeightKg, { mode: 'service' });
    if (weight.level === 'block') problems.push(weight.message);
  });
  return problems;
}

export function assertPersistableMeasures(record = {}) {
  const problems = persistableMeasureProblems(record);
  if (problems.length === 0) return;
  const error = new Error(problems.join(' '));
  error.code = 'MEASURE_BLOCK';
  throw error;
}

export function describeSubstrateAnalysis({ record = {}, order = {}, jobMaster = null } = {}) {
  const spec = resolveJobSpec(order, jobMaster);
  const inputs = Array.isArray(record.inputRollsList) ? record.inputRollsList : [];
  const consumed = inputs.reduce((sum, roll) => sum + (finiteNumber(roll?.consumedWeightKg) || 0), 0);
  const inputKg = inputs.some((roll) => finiteNumber(roll?.consumedWeightKg) > 0) ? roundMeasure(consumed) : null;
  const widths = inputs.map((roll) => finiteNumber(roll?.widthMm)).filter((value) => value !== null);
  const actual = {
    filmType: firstText(...inputs.map((roll) => roll?.filmType)),
    micron: firstFinite(...inputs.map((roll) => roll?.micron)),
    widthMm: widths.length ? Math.max(...widths) : null
  };
  const match = compareSubstrate({ spec, actual });
  const dry = computeDryInkSolids({
    inputKg,
    outputKg: record.printedOutputKg,
    inputWidthMm: actual.widthMm,
    printWidthMm: spec?.printWidthMm,
    meters: record.actualMetersPrinted,
    plainSettingKg: record.printingPlainSettingWastageKg,
    printingWastageKg: record.printingWastageKg
  });
  return { spec, actual, match, dry, inputKg, inputCount: inputs.length };
}
