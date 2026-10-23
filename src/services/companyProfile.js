// Statutory letterhead. Seeded from the plant's registered identity.
// A saved profile that is incomplete is an error. It is not filled from this seed.

export const COMPANY_PROFILE_STORAGE_KEY = 'samyak_company_profile';
export const COMPANY_PROFILE_SETTING_KEY = 'company_profile';

export const REQUIRED_COMPANY_FIELDS = [
  'name',
  'bseSymbol',
  'cin',
  'gstin',
  'address',
  'contactPerson',
  'phones',
  'email',
  'placeOfSupply',
];

export const SEED_COMPANY_PROFILE = {
  name: 'SAMYAK INTERNATIONAL LTD.',
  bseSymbol: 'SAMYAKINT',
  cin: 'L67120MH1994PLC225907',
  gstin: '23AABCM3526F1ZY',
  address: '11-B, Kheda Industrial Area, Pithampur Sector - III, Dist. Dhar, Dhar (Madhya Pradesh- 23), India - 454775',
  contactPerson: 'Samyak Jain',
  phones: '8889133133',
  email: 'info@samyakinternational.in',
  placeOfSupply: 'Dhar, Madhya Pradesh (23)',
  logoUrl: '/samyak-logo.svg',
  defaultGstRatePct: 18,
  timeZone: 'Asia/Kolkata',
  locale: 'en-IN',
  currency: 'INR',
  financialYearStartMonth: 4,
};

const OPERATIONAL_NUMBER_FIELDS = ['defaultGstRatePct', 'financialYearStartMonth'];
const OPERATIONAL_TEXT_FIELDS = ['timeZone', 'locale', 'currency'];

export function companyTagline(profile) {
  return `BSE: ${profile.bseSymbol} • CIN: ${profile.cin}`;
}

export function withCompanyTagline(profile) {
  return { ...profile, tagline: companyTagline(profile) };
}

function trimField(value) {
  return String(value ?? '').trim();
}

export function normalizeCompanyProfile(profile) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const normalized = {};
  for (const field of REQUIRED_COMPANY_FIELDS) {
    normalized[field] = trimField(source[field]);
  }
  normalized.logoUrl = trimField(source.logoUrl);
  for (const field of OPERATIONAL_TEXT_FIELDS) {
    if (source[field] !== undefined && source[field] !== null && trimField(source[field])) {
      normalized[field] = trimField(source[field]);
    }
  }
  for (const field of OPERATIONAL_NUMBER_FIELDS) {
    if (source[field] !== undefined && source[field] !== null && source[field] !== '') {
      const number = Number(source[field]);
      if (Number.isFinite(number)) normalized[field] = number;
    }
  }
  return normalized;
}

export function requireCompanyField(profile, field) {
  const source = profile || getCompanyProfile();
  const value = source?.[field];
  if (value === undefined || value === null || value === '' || (typeof value === 'number' && !Number.isFinite(value))) {
    const error = new Error(`Company profile is missing ${field}. Set it in Document Settings.`);
    error.status = 500;
    throw error;
  }
  return value;
}

export function companyFooterText(profile = getCompanyProfile()) {
  const problem = companyProfileError(profile);
  if (problem) {
    const error = new Error(problem);
    error.status = 500;
    throw error;
  }
  return `${profile.name}\n${profile.address} | GSTIN: ${profile.gstin}`;
}

export function companyProfileError(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return 'Company profile is not configured. Set it in Document Settings before printing.';
  }
  const normalized = normalizeCompanyProfile(profile);
  const missing = REQUIRED_COMPANY_FIELDS.filter(field => !normalized[field]);
  if (missing.length) {
    return `Company profile is incomplete. Set ${missing.join(', ')} in Document Settings before printing.`;
  }
  return '';
}

export function readStoredCompanyProfile() {
  if (typeof localStorage === 'undefined') return null;
  let raw = null;
  try {
    raw = localStorage.getItem(COMPANY_PROFILE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Company profile stored in this browser is not an object. Repair it in Document Settings.');
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Company profile stored in this browser is not valid JSON. Repair it in Document Settings.');
    }
    throw error;
  }
}

export function cacheCompanyProfile(profile) {
  const problem = companyProfileError(profile);
  if (problem) {
    const error = new Error(problem);
    error.status = 500;
    throw error;
  }
  const stored = normalizeCompanyProfile(profile);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(COMPANY_PROFILE_STORAGE_KEY, JSON.stringify(stored));
  }
  return withCompanyTagline(stored);
}

export function getCompanyProfile() {
  const stored = readStoredCompanyProfile();
  if (!stored) return withCompanyTagline({ ...SEED_COMPANY_PROFILE });
  return cacheCompanyProfile(stored);
}

export function loadLetterhead() {
  try {
    return { company: getCompanyProfile(), error: '' };
  } catch (error) {
    return {
      company: null,
      error: error.message || 'Company profile is not configured.',
    };
  }
}

export function applyRemoteCompanyProfile(value) {
  if (value == null || value === '') return;
  let profile = value;
  if (typeof value === 'string') {
    try {
      profile = JSON.parse(value);
    } catch (error) {
      console.error('Company profile from the database is not valid JSON and was not applied.', error);
      return;
    }
  }
  try {
    cacheCompanyProfile(profile);
  } catch (error) {
    console.error('Company profile from the database is incomplete and was not applied.', error);
  }
}
