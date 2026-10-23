// Operational settings that used to be copied as literals through costing,
// mail, and the press. A missing value stays missing. Callers fail with the
// setting name instead of substituting a plant number.

import { getCompanyProfile } from './companyProfile.js';

export const MATERIAL_COST_SETTINGS_STORAGE_KEY = 'samyak_material_cost_settings';
export const COSTING_SETTINGS_STORAGE_KEY = 'samyak_costing_settings';
export const PURCHASING_SETTINGS_STORAGE_KEY = 'samyak_purchasing_settings';
export const SHIFT_MASTER_STORAGE_KEY = 'samyak_shift_master';

export const DEFAULT_FILM_RATES = {
  PET: 125,
  METPET: 140,
  MATTA: 138,
  NMET: 128,
  MMET: 132,
  MGP: 120,
  NGP: 115,
  'Natural LD GP Film': 115,
  'Milky LD GP Film': 120,
  'Natural LD Metallocene Film': 128,
  'Milky LD Metallocene Film': 132,
  'Milky Atta (High Dart) Film': 138,
  LDPE: 115,
  'Natural GP LD': 115,
  'White LD': 120,
  'BOPP Natural': 130,
  'Matte Finish BOPP': 140,
  'Metalised BOPP': 145,
  'Pearlised BOPP': 160,
  'CPP Natural': 135,
  'Metalised CPP': 150,
};

export const DEFAULT_WASTAGE_TIERS = [
  { minKg: 2000, reelPct: 4.5, pouchPct: 5 },
  { minKg: 1000, reelPct: 5, pouchPct: 6 },
  { minKg: 501, reelPct: 6, pouchPct: 7.5 },
  { minKg: 0, reelPct: 7, pouchPct: 8 },
];

export const DEFAULT_SHIFTS = [
  { id: 'day', name: 'Day Shift', start: '08:00', end: '20:00', hours: 12 },
];

export function keptNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

export function requireNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    const error = new Error(`${name} is not configured.`);
    error.status = 500;
    throw error;
  }
  return number;
}

function readJson(key) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export const DEFAULT_MATERIAL_COST_SETTINGS = {
  adhesiveCostPerKg: 270,
  paperCoreCostPerKg: 45,
  liquidInkPrice: 1500,
  inkWeightGainPct: 20,
  adhesiveWeightGainPct: 100,
  conversionChargesPerKg: 45,
  fixedProfitPerKg: 25,
  minPoQtyKg: 100,
  defaultReorderLevelKg: 50,
  defaultCoreTareKg: 0,
  preferredInkVendorId: '',
  preferredAdhesiveVendorId: '',
  filmRates: { ...DEFAULT_FILM_RATES },
  updatedAt: '',
};

export function getMaterialCostSettings() {
  const defaults = {
    ...DEFAULT_MATERIAL_COST_SETTINGS,
    filmRates: { ...DEFAULT_FILM_RATES },
  };
  const parsed = readJson(MATERIAL_COST_SETTINGS_STORAGE_KEY);
  if (!parsed) return defaults;
  const filmRates = parsed.filmRates && typeof parsed.filmRates === 'object'
    ? parsed.filmRates
    : null;
  return {
    ...defaults,
    ...parsed,
    adhesiveCostPerKg: keptNumber(parsed.adhesiveCostPerKg ?? parsed.adhesivePrice, Number.NaN),
    paperCoreCostPerKg: keptNumber(parsed.paperCoreCostPerKg ?? parsed.paperCorePrice, Number.NaN),
    liquidInkPrice: keptNumber(parsed.liquidInkPrice, Number.NaN),
    inkWeightGainPct: keptNumber(parsed.inkWeightGainPct, Number.NaN),
    adhesiveWeightGainPct: keptNumber(parsed.adhesiveWeightGainPct, Number.NaN),
    conversionChargesPerKg: keptNumber(parsed.conversionChargesPerKg, Number.NaN),
    fixedProfitPerKg: keptNumber(parsed.fixedProfitPerKg, Number.NaN),
    minPoQtyKg: keptNumber(parsed.minPoQtyKg, Number.NaN),
    defaultReorderLevelKg: keptNumber(parsed.defaultReorderLevelKg, Number.NaN),
    defaultCoreTareKg: keptNumber(parsed.defaultCoreTareKg, Number.NaN),
    filmRates: filmRates || null,
    updatedAt: parsed.updatedAt || '',
  };
}

export function getCostingSettings() {
  const defaults = {
    wastageTiers: DEFAULT_WASTAGE_TIERS.map(tier => ({ ...tier })),
    ldExtraSlitMm: 5,
    cylinderUtilisationLimitKg: 10000,
    silLogoText: "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
  };
  const parsed = readJson(COSTING_SETTINGS_STORAGE_KEY);
  if (!parsed) return defaults;
  return {
    wastageTiers: Array.isArray(parsed.wastageTiers) ? parsed.wastageTiers : null,
    ldExtraSlitMm: keptNumber(parsed.ldExtraSlitMm, Number.NaN),
    cylinderUtilisationLimitKg: keptNumber(parsed.cylinderUtilisationLimitKg, Number.NaN),
    silLogoText: parsed.silLogoText == null ? '' : String(parsed.silLogoText),
  };
}

export function getPurchasingSettings() {
  const defaults = { defaultLeadTimeDays: 5 };
  const parsed = readJson(PURCHASING_SETTINGS_STORAGE_KEY);
  if (!parsed) return defaults;
  return {
    defaultLeadTimeDays: keptNumber(parsed.defaultLeadTimeDays, Number.NaN),
  };
}

export function getShiftMaster() {
  const parsed = readJson(SHIFT_MASTER_STORAGE_KEY);
  if (!parsed) return DEFAULT_SHIFTS.map(shift => ({ ...shift }));
  const rows = Array.isArray(parsed) ? parsed : parsed.shifts;
  if (!Array.isArray(rows)) return null;
  return rows;
}

export function filmRatePerKg({ filmType, purchaseRatePerKg, settings = getMaterialCostSettings() } = {}) {
  const purchased = keptNumber(purchaseRatePerKg, null);
  if (purchased != null) return purchased;
  const rates = settings?.filmRates;
  if (!rates || typeof rates !== 'object') {
    const error = new Error('Film rates are not configured in material cost settings.');
    error.status = 500;
    throw error;
  }
  if (filmType == null || String(filmType).trim() === '') return null;
  const direct = rates[filmType];
  if (direct !== undefined && direct !== '') {
    const number = Number(direct);
    if (!Number.isFinite(number)) {
      const error = new Error(`Film rate for ${filmType} is not a number.`);
      error.status = 500;
      throw error;
    }
    return number;
  }
  const key = Object.keys(rates).find(name => name.toLowerCase() === String(filmType).trim().toLowerCase());
  if (!key) return null;
  const number = Number(rates[key]);
  if (!Number.isFinite(number)) {
    const error = new Error(`Film rate for ${filmType} is not a number.`);
    error.status = 500;
    throw error;
  }
  return number;
}

export function wastagePercentForQuantity(orderQtyKg, isPouching = false, tiers = getCostingSettings().wastageTiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    const error = new Error('Wastage tiers are not configured in costing settings.');
    error.status = 500;
    throw error;
  }
  const qty = Number(orderQtyKg);
  if (!Number.isFinite(qty)) {
    const error = new Error('Order quantity is required before a wastage tier can be chosen.');
    error.status = 500;
    throw error;
  }
  const ordered = [...tiers].sort((a, b) => Number(b.minKg) - Number(a.minKg));
  const tier = ordered.find(row => qty >= Number(row.minKg));
  if (!tier) {
    const error = new Error('No wastage tier covers this order quantity.');
    error.status = 500;
    throw error;
  }
  const pct = isPouching ? tier.pouchPct : tier.reelPct;
  return requireNumber(pct, 'wastage tier percent');
}

export function optionalPercent(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function liquidInkKg(dryKg, solidsPct) {
  const dry = requireNumber(dryKg, 'dry ink kg');
  const gain = requireNumber(solidsPct, 'inkWeightGainPct');
  if (gain < 0) {
    const error = new Error('inkWeightGainPct cannot be negative.');
    error.status = 500;
    throw error;
  }
  return dry * (1 + gain / 100);
}

export function plainKg(value) {
  if (value === undefined || value === null || value === '') return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

export function rollPlainWastageProblem(roll) {
  const plain = plainKg(roll?.plainSubstrateWastageKg);
  if (!Number.isFinite(plain) || plain < 0) return 'Plain substrate wastage cannot be negative.';
  const consumed = Number(roll?.consumedWeightKg);
  if (Number.isFinite(consumed) && plain > consumed) {
    return 'Plain substrate wastage cannot exceed consumed kilograms.';
  }
  return '';
}

export function sumPlainWastageKg(rolls) {
  return (rolls || []).reduce((sum, roll) => {
    const plain = plainKg(roll?.plainSubstrateWastageKg);
    return sum + (Number.isFinite(plain) ? plain : 0);
  }, 0);
}

export function netPrintedSubstrateKg(rolls) {
  return (rolls || []).reduce((sum, roll) => {
    const consumed = Number(roll?.consumedWeightKg);
    const plain = plainKg(roll?.plainSubstrateWastageKg);
    const used = Number.isFinite(consumed) ? consumed : 0;
    const waste = Number.isFinite(plain) ? plain : 0;
    return sum + Math.max(0, used - waste);
  }, 0);
}

export function financialYearLabel(date = new Date(), startMonth, timeZone) {
  const month = Number(startMonth);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    const error = new Error('financialYearStartMonth is not configured on the company profile.');
    error.status = 500;
    throw error;
  }
  if (!timeZone) {
    const error = new Error('timeZone is not configured on the company profile.');
    error.status = 500;
    throw error;
  }
  let year;
  let monthIndex;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
    }).formatToParts(date);
    year = Number(parts.find(part => part.type === 'year')?.value);
    monthIndex = Number(parts.find(part => part.type === 'month')?.value);
  } catch {
    const error = new Error(`timeZone "${timeZone}" is not a valid IANA time zone.`);
    error.status = 500;
    throw error;
  }
  const startYear = monthIndex >= month ? year : year - 1;
  const endShort = String(startYear + 1).slice(-2);
  return `${String(startYear).slice(-2)}-${endShort}`;
}

export function applyPrefixTemplate(template, date = new Date()) {
  const text = String(template ?? '');
  if (!text.trim()) {
    const error = new Error('A document prefix is not configured.');
    error.status = 500;
    throw error;
  }
  if (!text.includes('{fy}') && !text.includes('{yyyy}')) return text;
  const profile = getCompanyProfile();
  const fy = financialYearLabel(date, profile.financialYearStartMonth, profile.timeZone);
  const year = fy.slice(0, 2);
  const fullYear = Number(year) > 50 ? `19${year}` : `20${year}`;
  return text.replaceAll('{fy}', fy).replaceAll('{yyyy}', fullYear);
}

export function leadTimeDays(vendor) {
  const vendorDays = keptNumber(vendor?.leadTimeDays, null);
  if (vendorDays != null) return vendorDays;
  return requireNumber(getPurchasingSettings().defaultLeadTimeDays, 'defaultLeadTimeDays');
}

export function resolveShiftHours(record) {
  const explicit = record?.shiftHours ?? record?.shift_hours;
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    return requireNumber(explicit, 'shift hours');
  }
  const name = String(record?.shiftType || record?.shift_type || record?.shift || '').trim();
  if (!name) {
    const error = new Error('Choose a shift. Shift hours are not assumed.');
    error.status = 500;
    throw error;
  }
  const shifts = getShiftMaster();
  if (!Array.isArray(shifts)) {
    const error = new Error('The shift master is not configured.');
    error.status = 500;
    throw error;
  }
  const match = shifts.find(shift => shift && (shift.name === name || shift.id === name));
  if (!match) {
    const error = new Error(`Shift "${name}" is not in the shift master.`);
    error.status = 500;
    throw error;
  }
  return requireNumber(match.hours, `hours for shift ${name}`);
}

export function mergePressPlainWastage(record, pressSumKg) {
  const press = Number(pressSumKg);
  if (!Number.isFinite(press)) return record || {};
  const current = Number(record?.printingPlainSettingWastageKg) || 0;
  const previousPress = Number(record?.pressPlainSubstrateWastageKg) || 0;
  const replace = current === 0 || current === previousPress;
  return {
    printingPlainSettingWastageKg: replace ? press : current,
    pressPlainSubstrateWastageKg: press,
    plainSubstrateWastageKg: press,
  };
}
