/**
 * Rotogravure cylinder area and engraving cost.
 *
 * Area is (face mm × circumference mm) / 100 square centimetres,
 * because 1 cm² = 100 mm². Cost per cylinder is that area × the
 * engraving rate in ₹/cm². The set total is that amount × the colour count.
 * Round the per-cylinder amount first, then multiply, so the set total
 * stays an exact multiple of the per-cylinder figure.
 *
 * Stored amounts are text such as "₹ 5,139.00". The decimal point has to
 * survive parsing. Dropping every non-digit turns the trailing ".00" into
 * two extra zeros and multiplies the amount by 100 on the next save.
 */

/** ₹ per cm² used when a cylinder has no stored engraving rate. */
export const DEFAULT_CYLINDER_RATE_PER_SQ_CM = 1.8;
const RATE_MIN = 0.2;
const RATE_MAX = 50;

/**
 * The rate written on the row, or null when nothing was stored.
 * A typed or previously saved number is returned unchanged, including 1.60.
 */
export function storedEngravingRate(...candidates) {
  for (const value of candidates) {
    if (value == null || value === '') continue;
    const numeric = typeof value === 'number' ? value : parseInrAmount(value);
    if (numeric != null && numeric > 0) return numeric;
  }
  return null;
}

export function parseInrAmount(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = String(value).trim();
  if (!text) return null;
  text = text.replace(/₹/g, '').replace(/rs\.?/ig, '').replace(/\s+/g, '');
  if (!text) return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  if (lastComma > lastDot) {
    const fraction = text.slice(lastComma + 1);
    if (!text.includes('.') && /^\d{1,2}$/.test(fraction)) {
      text = `${text.slice(0, lastComma).replace(/,/g, '')}.${fraction}`;
    } else {
      text = text.replace(/,/g, '');
    }
  } else {
    text = text.replace(/,/g, '');
  }
  text = text.replace(/[^0-9.-]/g, '');
  if (!text || text === '.' || text === '-' || text === '-.') return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

export function formatInrAmount(value) {
  const amount = typeof value === 'number' ? value : parseInrAmount(value);
  if (amount == null) return '';
  return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Integer cm². Matches the directory's "sq. cm" figure. */
export function cylinderSurfaceSqCm(faceLengthMm, circumferenceMm) {
  const face = Number(faceLengthMm);
  const circumference = Number(circumferenceMm);
  if (!Number.isFinite(face) || !Number.isFinite(circumference) || face <= 0 || circumference <= 0) {
    return null;
  }
  return Math.round((face * circumference) / 100);
}

export function saneEngravingRate(rate) {
  const numeric = storedEngravingRate(rate);
  if (numeric == null || numeric < RATE_MIN || numeric > RATE_MAX) return DEFAULT_CYLINDER_RATE_PER_SQ_CM;
  return numeric;
}

export function expectedCylinderCosts({ faceLengthMm, circumferenceMm, rate, colorsCount } = {}) {
  const areaSqCm = cylinderSurfaceSqCm(faceLengthMm, circumferenceMm);
  const colors = Math.max(1, parseInt(colorsCount, 10) || 1);
  const saneRate = saneEngravingRate(rate);
  if (areaSqCm == null) {
    return { areaSqCm: null, rate: saneRate, colors, costPerCylinder: null, totalSetCost: null };
  }
  const costPerCylinder = Math.round(areaSqCm * saneRate);
  const totalSetCost = costPerCylinder * colors;
  return { areaSqCm, rate: saneRate, colors, costPerCylinder, totalSetCost };
}

function relativeGap(actual, expected) {
  if (actual == null || expected == null || expected === 0) return Infinity;
  return Math.abs(actual - expected) / Math.abs(expected);
}

/**
 * Stored text is trusted when the per-cylinder amount and the set total agree.
 * A large agreed price is left alone: it might be a real commercial rate, and
 * dividing by 100 would silently destroy it. The SQL check lists those rows
 * for review (`needsReview`).
 *
 * The one silent fix is unambiguous. One stored side already matches the
 * engraving formula and the other side contradicts it, as with a set total of
 * ₹35,973 and a per-cylinder string of ₹6,85,40,000. The contradicting side
 * becomes the agreed side (total / colours, or per × colours).
 */
export function reconcileCylinderCosts(row = {}) {
  const colors = Math.max(1, parseInt(row.colorsCount ?? row.numberOfCylinders, 10) || 1);
  const expected = expectedCylinderCosts({
    faceLengthMm: row.faceLengthMm,
    circumferenceMm: row.circumferenceMm ?? row.repeatLengthMm,
    rate: row.rate ?? row.ratePerSqInch,
    colorsCount: colors
  });
  let per = parseInrAmount(row.costPerCylinder);
  let total = parseInrAmount(row.cylinderCost);
  const storedPer = per;
  const storedTotal = total;

  const totalMatchesFormula = expected.totalSetCost != null && total != null && relativeGap(total, expected.totalSetCost) <= 0.02;
  const perMatchesFormula = expected.costPerCylinder != null && per != null && relativeGap(per, expected.costPerCylinder) <= 0.02;

  if (totalMatchesFormula && per != null && relativeGap(per, total / colors) > 0.02) {
    per = Math.round(total / colors);
  } else if (perMatchesFormula && total != null && relativeGap(per * colors, total) > 0.02) {
    total = Math.round(per * colors);
  } else if (per != null && total == null) {
    total = Math.round(per * colors);
  } else if (total != null && per == null) {
    per = Math.round(total / colors);
  }

  const shownAgrees = per != null && total != null && relativeGap(per * colors, total) <= 0.05;
  const needsReview = Boolean(
    expected.costPerCylinder
    && shownAgrees
    && relativeGap(per, expected.costPerCylinder) > 20
  );

  const perChanged = storedPer == null ? per != null : per == null || relativeGap(per, storedPer) > 0.001;
  const totalChanged = storedTotal == null ? total != null : total == null || relativeGap(total, storedTotal) > 0.001;

  return {
    areaSqCm: expected.areaSqCm,
    rate: expected.rate,
    colors,
    costPerCylinder: per,
    totalSetCost: total,
    costPerCylinderText: per == null ? '' : formatInrAmount(per),
    cylinderCostText: total == null ? '' : formatInrAmount(total),
    perCorrected: perChanged && storedPer != null,
    totalCorrected: totalChanged && storedTotal != null,
    needsReview,
    storedPer,
    storedTotal
  };
}

const OLD_DEFAULT_RATE = 1.6;
const FORMULA_MATCH_TOLERANCE = 0.02;

/**
 * How a stored ₹1.60/sq cm row moves to ₹1.80.
 * Rows at any other rate, including null, are untouched.
 * Costs are recomputed only when a stored side matches the ₹1.60 area formula
 * (so an inflated per-cylinder figure beside a correct set total is corrected)
 * or when both cost fields are empty. A price that does not match that formula,
 * such as an agreed amount far above it, keeps its cost text. The directory
 * review flag then stays on when that price is still more than 20× the ₹1.80 formula.
 * Missing face length or circumference changes the rate only.
 */
export function planCylinderRateMove(row = {}) {
  const rate = storedEngravingRate(row.rate ?? row.ratePerSqInch ?? row.rate_per_sq_inch);
  if (rate == null || Math.abs(rate - OLD_DEFAULT_RATE) > 1e-9) {
    return { action: 'untouched' };
  }
  const colors = Math.max(1, parseInt(row.colorsCount ?? row.colors_count ?? row.numberOfCylinders, 10) || 1);
  const dimensions = {
    faceLengthMm: row.faceLengthMm ?? row.face_length_mm,
    circumferenceMm: row.circumferenceMm ?? row.circumference_mm ?? row.repeatLengthMm,
    colorsCount: colors
  };
  const atOldRate = expectedCylinderCosts({ ...dimensions, rate: OLD_DEFAULT_RATE });
  const atNewRate = expectedCylinderCosts({ ...dimensions, rate: DEFAULT_CYLINDER_RATE_PER_SQ_CM });
  if (atOldRate.areaSqCm == null) {
    return { action: 'rate_only', rate: DEFAULT_CYLINDER_RATE_PER_SQ_CM };
  }
  const per = parseInrAmount(row.costPerCylinder ?? row.cost_per_cylinder);
  const total = parseInrAmount(row.cylinderCost ?? row.cylinder_cost);
  const totalMatches = total != null && relativeGap(total, atOldRate.totalSetCost) <= FORMULA_MATCH_TOLERANCE;
  const perMatches = per != null && relativeGap(per, atOldRate.costPerCylinder) <= FORMULA_MATCH_TOLERANCE;
  if ((per == null && total == null) || totalMatches || perMatches) {
    return {
      action: 'recompute',
      rate: DEFAULT_CYLINDER_RATE_PER_SQ_CM,
      costPerCylinder: atNewRate.costPerCylinder,
      totalSetCost: atNewRate.totalSetCost,
      costPerCylinderText: formatInrAmount(atNewRate.costPerCylinder),
      cylinderCostText: formatInrAmount(atNewRate.totalSetCost)
    };
  }
  const agrees = per != null && total != null && relativeGap(per * colors, total) <= 0.05;
  return {
    action: 'keep_costs',
    rate: DEFAULT_CYLINDER_RATE_PER_SQ_CM,
    needsReview: Boolean(
      atNewRate.costPerCylinder
      && agrees
      && relativeGap(per, atNewRate.costPerCylinder) > 20
    )
  };
}

export function withReconciledCosts(row) {
  if (!row || typeof row !== 'object') return row;
  const costs = reconcileCylinderCosts(row);
  const next = { ...row, areaSqCm: costs.areaSqCm };
  if (costs.costPerCylinder != null) next.costPerCylinder = costs.costPerCylinderText;
  if (costs.totalSetCost != null && (costs.storedTotal != null || costs.storedPer != null)) {
    next.cylinderCost = costs.cylinderCostText;
  }
  return next;
}

function headerToken(header) {
  return String(header || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Maps CSV headers onto cylinder fields. The result is field key → header text,
 * which is the shape the bulk-upload form reads. Rate, per-cylinder cost, and
 * set cost are separate fields; a generic "cost" or "rate" header must not
 * capture the wrong one.
 */
export function autoMapCylinderCsvHeaders(headers = []) {
  const mapping = {};
  const used = new Set();
  const rules = [
    { key: 'sku', test: (token) => token.includes('sku') || token.includes('serial') || (token.includes('code') && !token.includes('barcode') && !token.includes('hsn')) },
    { key: 'jobName', test: (token) => token.includes('jobname') || token.includes('brand') || token.includes('design') || token.includes('itemname') || token === 'job' || token === 'name' },
    { key: 'clientGroup', test: (token) => token.includes('client') || token.includes('party') || token.includes('customer') || token.includes('company') },
    { key: 'colorsCount', test: (token) => token.includes('color') || token.includes('colour') || (token.includes('count') && !token.includes('cost')) },
    { key: 'printWidthMm', test: (token) => token.includes('printwidth') || token.includes('webwidth') || (token.includes('width') && !token.includes('face')) },
    { key: 'faceLengthMm', test: (token) => token.includes('facelength') || token.includes('shell') || (token.includes('length') && !token.includes('repeat')) },
    { key: 'circumferenceMm', test: (token) => token.includes('repeat') || token.includes('circumference') || token.includes('dia') },
    { key: 'structure', test: (token) => token.includes('structure') || token.includes('laminate') || token.includes('substrate') },
    { key: 'costPerCylinder', test: (token) => token.includes('costpercyl') || token.includes('percylinder') || token.includes('percy') || (token.includes('cost') && token.includes('per')) },
    { key: 'rate', test: (token) => token.includes('rate') || token.includes('persq') },
    { key: 'cylinderCost', test: (token) => (token.includes('cost') || token.includes('price')) && !token.includes('borne') && !token.includes('per') },
    { key: 'engravuresName', test: (token) => token.includes('engrav') || token.includes('vendor') || token.includes('maker') },
    { key: 'costBorneBy', test: (token) => token.includes('borne') },
    { key: 'status', test: (token) => token.includes('status') || token.includes('condition') },
    { key: 'assignedPress', test: (token) => token.includes('press') || token.includes('machine') }
  ];

  rules.forEach((rule) => {
    const header = headers.find((item) => !used.has(item) && rule.test(headerToken(item)));
    if (header) {
      mapping[rule.key] = header;
      used.add(header);
    }
  });
  return mapping;
}

export function costsFromCsvRow({
  faceLengthMm,
  circumferenceMm,
  rate,
  colorsCount,
  cylinderCost,
  costPerCylinder
} = {}) {
  const colors = parseInt(colorsCount, 10) || 1;
  const face = parseFloat(faceLengthMm);
  const circumference = parseFloat(circumferenceMm);
  const parsedRate = parseInrAmount(rate);
  const expected = expectedCylinderCosts({
    faceLengthMm: Number.isFinite(face) ? face : null,
    circumferenceMm: Number.isFinite(circumference) ? circumference : null,
    rate: parsedRate == null ? rate : parsedRate,
    colorsCount: colors
  });
  const reconciled = reconcileCylinderCosts({
    faceLengthMm: Number.isFinite(face) ? face : null,
    circumferenceMm: Number.isFinite(circumference) ? circumference : null,
    rate: parsedRate == null ? rate : parsedRate,
    colorsCount: colors,
    cylinderCost,
    costPerCylinder
  });
  const per = reconciled.costPerCylinder != null
    ? reconciled.costPerCylinder
    : expected.costPerCylinder;
  const total = reconciled.totalSetCost != null
    ? reconciled.totalSetCost
    : expected.totalSetCost;
  return {
    areaSqCm: expected.areaSqCm,
    rate: parsedRate == null ? expected.rate : parsedRate,
    colors,
    costPerCylinder: per,
    totalSetCost: total,
    costPerCylinderText: per == null ? '' : formatInrAmount(per),
    cylinderCostText: total == null ? '' : formatInrAmount(total)
  };
}
