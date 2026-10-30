/**
 * Settings Service for Samyak Flexi-ERP
 * Manages Authorised Signatory Signature, Document Prefix Series, Payment Terms & Terms & Conditions
 */

const LOGO_STORAGE_KEY = 'samyak_company_logo';
const SIGNATURE_STORAGE_KEY = 'samyak_authorised_signature';
const PREFIX_STORAGE_KEY = 'samyak_doc_prefixes';
const TERMS_STORAGE_KEY = 'samyak_doc_terms';
const COA_SIGNATORIES_STORAGE_KEY = 'samyak_coa_signatories';
const AGEING_SETTINGS_STORAGE_KEY = 'samyak_inventory_ageing_settings';

export const DEFAULT_COA_SIGNATORIES = {
  preparedByLabel: 'PREPARED BY / QUALITY CONTROL CHEMIST',
  approvedByLabel: 'APPROVED BY / QUALITY ASSURANCE HEAD'
};

export const DEFAULT_AGEING_SETTINGS = {
  "Film Substrates": 90,
  "Semi-Finished Goods (SFG)": 30,
  "Finished Goods (FG)": 60,
  "Printing Inks": 180,
  "Chemicals & Solvents": 180,
  "Adhesives & Hardener": 90,
  "Doctor Blades & Wipers": 180,
  "Rollers & Sleeves": 365,
  "Machine Spare Parts": 365,
  "Lubricants & Oils": 180,
  "Tapes & Consumables": 180,
  "Safety Gear (PPE)": 365,
  "Packaging & Cores": 180,
  "Other Raw Materials": 90,
  "Rotogravure Cylinders": 365,
  defaultDays: 90,
  enforceFifoStrictly: true
};

import { compressImageDataUrl, safeLocalStorageSet } from '../utils/safeStorage.js';
import { saveSystemSetting, fetchSystemSetting, saveEmailSettingsToSupabase, saveEmailTemplatesToSupabase, fetchFilmSubstratesFromSupabase, saveFilmSubstratesToSupabase } from './supabaseDataService.js';
import {
  cacheCompanyProfile,
  COMPANY_PROFILE_SETTING_KEY,
  companyProfileError,
  getCompanyProfile,
  normalizeCompanyProfile,
  withCompanyTagline,
} from './companyProfile.js';
import { FILM_SUBSTRATES_STORAGE_KEY, DEFAULT_FILM_SUBSTRATES, getFilmSubstrates } from './filmSubstratesService.js';
export { FILM_SUBSTRATES_STORAGE_KEY, DEFAULT_FILM_SUBSTRATES, getFilmSubstrates };



/**
 * Get saved company logo (base64 or default path /samyak-logo.png)
 */
export function getCompanyLogo() {
  try {
    return localStorage.getItem(LOGO_STORAGE_KEY) || '/samyak-logo.png';
  } catch (e) {
    return '/samyak-logo.png';
  }
}

/**
 * Save custom company logo image (base64 string)
 */
export async function saveCompanyLogo(base64String) {
  if (base64String) {
    const compressed = await compressImageDataUrl(base64String, 600, 0.7);
    await saveSystemSetting('company_logo', compressed);
    safeLocalStorageSet(LOGO_STORAGE_KEY, compressed);
    return compressed;
  }
  await saveSystemSetting('company_logo', '');
  localStorage.removeItem(LOGO_STORAGE_KEY);
  return '';
}

/**
 * Clear stored company logo
 */
export async function clearCompanyLogo() {
  await saveCompanyLogo('');
}



export const DEFAULT_PREFIXES = {
  orderPrefix: 'ORD-2026-',
  orderCounter: 101,
  poPrefix: 'SIL/PO/26-27/',
  poCounter: 246,
  ocnPrefix: 'SIL/OCN/26-27/',
  ocnCounter: 108,
  grnPrefix: 'SIL/GRN/26-27/',
  grnCounter: 104,
  qtnPrefix: 'SIL/QTN/26-27/',
  qtnCounter: 501,
  dispatchPrefix: 'SIL/DISP/26-27/',
  dispatchCounter: 301,
  dcPrefix: 'SIL/DC/26-27/',
  dcCounter: 101,
  coaPrefix: 'SIL/COA/26-27/',
  coaCounter: 101,
  jdsPrefix: 'SIL/JDS/26-27/',
  jdsCounter: 201,
  indentPrefix: 'SIL/IND/26-27/',
  indentCounter: 101,
  plPrefix: 'PL-',
  plCounter: 606130
};

export const DEFAULT_DOCUMENT_TERMS = {
  paymentTerms: '60 Days',
  poTerms: [
    "Solid Content of the ordered Inks shall be within the range mentioned in the TDS provided. Material not within the range shall be returned to the vendor.",
    "Any material not clearing the Quality Control parameters shall be returned to the vendor.",
    "All Item Codes of the supply shall be checked and sent. Any corrections in Item Codes shall be informed prior to dispatch by the vendor."
  ],
  ocnTerms: [
    "Issue Purchase Orders (POs) immediately for the gross raw material quantities listed above.",
    "Verify available store stock before releasing new purchase requisitions.",
    "Ensure all material specifications strictly comply with corona treatment, micron gauge, and dyne requirements."
  ],
  grnTerms: [
    "Material verified for micron gauge tolerance (±3%), dyne level (≥38 dynes/cm), and slit width accuracy.",
    "Stock updated in Factory Inventory store under inward batch reference.",
    "Rejection by Samyak QC will result in immediate material return at supplier's expense."
  ],
  dcTerms: [
    "Goods once sold or dispatched will not be taken back or exchanged without prior written consent.",
    "Please inspect material immediately upon receipt for physical roll condition, micron gauge, and net weight accuracy.",
    "All supplies strictly comply with approved Job Master technical specifications & Purchase Order terms.",
    "Subject to Indore / Dhar Jurisdiction only."
  ]
};

/**
 * Get saved authorised signature image (base64) or null
 */
export function getAuthorisedSignature() {
  try {
    return localStorage.getItem(SIGNATURE_STORAGE_KEY) || null;
  } catch (e) {
    console.error("Failed to fetch signature", e);
    return null;
  }
}

/**
 * Save authorised signature image (base64 string)
 */
export async function saveAuthorisedSignature(base64String) {
  if (base64String) {
    const compressed = await compressImageDataUrl(base64String, 500, 0.7);
    await saveSystemSetting('auth_signature', compressed);
    safeLocalStorageSet(SIGNATURE_STORAGE_KEY, compressed);
    return compressed;
  }
  await saveSystemSetting('auth_signature', '');
  localStorage.removeItem(SIGNATURE_STORAGE_KEY);
  return '';
}

/**
 * Clear stored signature
 */
export async function clearAuthorisedSignature() {
  await saveAuthorisedSignature('');
}


/**
 * Get document prefix configuration
 */
export function getDocumentPrefixes() {
  try {
    const saved = localStorage.getItem(PREFIX_STORAGE_KEY);
    return saved ? { ...DEFAULT_PREFIXES, ...JSON.parse(saved) } : { ...DEFAULT_PREFIXES };
  } catch (e) {
    return { ...DEFAULT_PREFIXES };
  }
}

/**
 * Save document prefix configuration
 */
function cacheJson(key, value) {
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

export async function saveDocumentPrefixes(prefixConfig) {
  await saveSystemSetting('doc_prefixes', prefixConfig);
  cacheJson(PREFIX_STORAGE_KEY, prefixConfig);
  return prefixConfig;
}


/**
 * Get document terms & conditions configuration
 */
export function getDocumentTerms() {
  try {
    const saved = localStorage.getItem(TERMS_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_DOCUMENT_TERMS };
    const parsed = JSON.parse(saved);
    return {
      paymentTerms: parsed.paymentTerms || DEFAULT_DOCUMENT_TERMS.paymentTerms,
      poTerms: Array.isArray(parsed.poTerms) && parsed.poTerms.length > 0 ? parsed.poTerms : DEFAULT_DOCUMENT_TERMS.poTerms,
      ocnTerms: Array.isArray(parsed.ocnTerms) && parsed.ocnTerms.length > 0 ? parsed.ocnTerms : DEFAULT_DOCUMENT_TERMS.ocnTerms,
      grnTerms: Array.isArray(parsed.grnTerms) && parsed.grnTerms.length > 0 ? parsed.grnTerms : DEFAULT_DOCUMENT_TERMS.grnTerms,
      dcTerms: Array.isArray(parsed.dcTerms) && parsed.dcTerms.length > 0 ? parsed.dcTerms : DEFAULT_DOCUMENT_TERMS.dcTerms
    };
  } catch (e) {
    console.error("Failed to parse document terms", e);
    return { ...DEFAULT_DOCUMENT_TERMS };
  }
}


/**
 * Save document terms & conditions configuration
 */
export async function saveDocumentTerms(termsConfig) {
  await saveSystemSetting('doc_terms', termsConfig);
  cacheJson(TERMS_STORAGE_KEY, termsConfig);
  return termsConfig;
}


/**
 * Get CoA Signatories configuration
 */
export function getCoaSignatories() {
  try {
    const saved = localStorage.getItem(COA_SIGNATORIES_STORAGE_KEY);
    return saved ? { ...DEFAULT_COA_SIGNATORIES, ...JSON.parse(saved) } : { ...DEFAULT_COA_SIGNATORIES };
  } catch (e) {
    return { ...DEFAULT_COA_SIGNATORIES };
  }
}

/**
 * Save CoA Signatories configuration
 */
export async function saveCoaSignatories(signatoryConfig) {
  await saveSystemSetting('coa_signatories', signatoryConfig);
  cacheJson(COA_SIGNATORIES_STORAGE_KEY, signatoryConfig);
  return signatoryConfig;
}


/**
 * Generate formatted document reference number without incrementing counter
 */
export function generateDocRefNumber(type, customNumber) {
  const config = getDocumentPrefixes();
  
  if (type === 'order') {
    const num = customNumber !== undefined ? customNumber : (config.orderCounter || 101);
    const prefix = config.orderPrefix || 'ORD-2026-';
    const formattedNum = String(num).padStart(3, '0');
    return `${prefix}${formattedNum}`;
  } else if (type === 'po') {
    const num = customNumber !== undefined ? customNumber : config.poCounter;
    return `${config.poPrefix}${num}`;
  } else if (type === 'ocn') {
    const num = customNumber !== undefined ? customNumber : config.ocnCounter;
    return `${config.ocnPrefix}${num}`;
  } else if (type === 'grn') {
    const num = customNumber !== undefined ? customNumber : config.grnCounter;
    return `${config.grnPrefix}${num}`;
  } else if (type === 'qtn') {
    const num = customNumber !== undefined ? customNumber : (config.qtnCounter || 501);
    return `${config.qtnPrefix || 'SIL/QTN/26-27/'}${num}`;
  } else if (type === 'dispatch') {
    const num = customNumber !== undefined ? customNumber : (config.dispatchCounter || 301);
    return `${config.dispatchPrefix || 'SIL/DISP/26-27/'}${num}`;
  } else if (type === 'dc') {
    const num = customNumber !== undefined ? customNumber : (config.dcCounter || 101);
    return `${config.dcPrefix || 'SIL/DC/26-27/'}${num}`;
  } else if (type === 'coa') {
    const num = customNumber !== undefined ? customNumber : (config.coaCounter || 101);
    return `${config.coaPrefix || 'SIL/COA/26-27/'}${num}`;
  } else if (type === 'jds') {
    const num = customNumber !== undefined ? customNumber : (config.jdsCounter || 201);
    return `${config.jdsPrefix || 'SIL/JDS/26-27/'}${num}`;
  } else if (type === 'indent') {
    const num = customNumber !== undefined ? customNumber : (config.indentCounter || 101);
    return `${config.indentPrefix || 'SIL/IND/26-27/'}${num}`;
  } else if (type === 'pl' || type === 'packing') {
    const year = new Date().getFullYear();
    const num = customNumber !== undefined ? customNumber : (config.plCounter || 606130);
    return `PL-${year}-${num}`;
  }
  
  return `SIL/DOC/${customNumber || 100}`;
}

/**
 * Get next document reference number AND increment counter in settings
 */
export function getNextDocRefNumber(type) {
  const config = getDocumentPrefixes();
  let num = 101;
  let key = '';
  
  if (type === 'order') {
    num = config.orderCounter || 101;
    key = 'orderCounter';
  } else if (type === 'po') {
    num = config.poCounter || 246;
    key = 'poCounter';
  } else if (type === 'ocn') {
    num = config.ocnCounter || 108;
    key = 'ocnCounter';
  } else if (type === 'grn') {
    num = config.grnCounter || 104;
    key = 'grnCounter';
  } else if (type === 'qtn') {
    num = config.qtnCounter || 501;
    key = 'qtnCounter';
  } else if (type === 'dispatch') {
    num = config.dispatchCounter || 301;
    key = 'dispatchCounter';
  } else if (type === 'dc') {
    num = config.dcCounter || 101;
    key = 'dcCounter';
  } else if (type === 'coa') {
    num = config.coaCounter || 101;
    key = 'coaCounter';
  } else if (type === 'jds') {
    num = config.jdsCounter || 201;
    key = 'jdsCounter';
  } else if (type === 'indent') {
    num = config.indentCounter || 101;
    key = 'indentCounter';
  } else if (type === 'pl' || type === 'packing') {
    num = config.plCounter || 606130;
    key = 'plCounter';
  }

  const docRef = generateDocRefNumber(type, num);
  
  if (key) {
    const next = { ...config, [key]: Number(num) + 1 };
    cacheJson(PREFIX_STORAGE_KEY, next);
    saveDocumentPrefixes(next).catch((err) => {
      console.error('Document number series was not saved', err);
      if (typeof window !== 'undefined') {
        window.alert(`The next document number was not saved to the database: ${err.message || err}`);
      }
    });
  }

  return docRef;
}

/**
 * Ensures ocnCounter in settings is at least max(existing OCNs) + 1
 */
export function syncOcnCounterWithRecords(ocnList = []) {
  if (!Array.isArray(ocnList) || ocnList.length === 0) return;
  const config = getDocumentPrefixes();
  let maxSeq = Number(config.ocnCounter) || 108;
  for (const item of ocnList) {
    const str = String(item?.ocnNumber || item?.id || '');
    const parts = str.trim().split('/');
    const lastPart = parts[parts.length - 1];
    const match = lastPart ? lastPart.match(/\d+/) : null;
    const seq = match ? parseInt(match[0], 10) : null;
    if (seq && seq >= maxSeq) {
      maxSeq = seq + 1;
    }
  }
  if (maxSeq > (Number(config.ocnCounter) || 108)) {
    const next = { ...config, ocnCounter: maxSeq };
    cacheJson(PREFIX_STORAGE_KEY, next);
    saveDocumentPrefixes(next).catch(() => {});
  }
}

const RATES_STORAGE_KEY = 'samyak_processing_rates';

export const DEFAULT_RATES = {
  liquidInkPrice: 1500,
  adhesivePrice: 270,
  paperCorePrice: 45,
  conversionChargesPerKg: 45,
  fixedProfitPerKg: 25
};

export const MATERIAL_COST_SETTINGS_STORAGE_KEY = 'samyak_material_cost_settings';

export const DEFAULT_MATERIAL_COST_SETTINGS = {
  adhesiveCostPerKg: 270,       // ₹ / kg for Lamination Adhesive
  paperCoreCostPerKg: 45,       // ₹ / kg for Slitting Paper Cores
  liquidInkPrice: 1500,         // ₹ / kg for Inks
  conversionChargesPerKg: 45,   // ₹ / kg default Conversion Charges
  fixedProfitPerKg: 25,         // ₹ / kg default Fixed Profit Margin
  minPoQtyKg: 100,              // minimum kilograms on an ink purchase order
  defaultReorderLevelKg: 50,    // used when an ink has no reorder level of its own
  updatedAt: ''
};

function configuredKilograms(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
}

function inkPurchaseQuantities(source) {
  return {
    minPoQtyKg: configuredKilograms(source?.minPoQtyKg, DEFAULT_MATERIAL_COST_SETTINGS.minPoQtyKg),
    defaultReorderLevelKg: configuredKilograms(source?.defaultReorderLevelKg, DEFAULT_MATERIAL_COST_SETTINGS.defaultReorderLevelKg),
  };
}

/**
 * Fetch Material Cost Settings from Supabase Database with local fallback
 */
export async function fetchMaterialCostSettingsFromSupabase() {
  try {
    const remote = await fetchSystemSetting('material_cost_settings');
    if (remote && typeof remote === 'object') {
      const merged = {
        ...DEFAULT_MATERIAL_COST_SETTINGS,
        ...remote,
        adhesiveCostPerKg: Number(remote.adhesiveCostPerKg ?? remote.adhesivePrice) || DEFAULT_MATERIAL_COST_SETTINGS.adhesiveCostPerKg,
        paperCoreCostPerKg: Number(remote.paperCoreCostPerKg ?? remote.paperCorePrice) || DEFAULT_MATERIAL_COST_SETTINGS.paperCoreCostPerKg,
        liquidInkPrice: Number(remote.liquidInkPrice) || DEFAULT_MATERIAL_COST_SETTINGS.liquidInkPrice,
        conversionChargesPerKg: (remote.conversionChargesPerKg !== undefined && remote.conversionChargesPerKg !== '')
          ? Number(remote.conversionChargesPerKg)
          : DEFAULT_MATERIAL_COST_SETTINGS.conversionChargesPerKg,
        fixedProfitPerKg: (remote.fixedProfitPerKg !== undefined && remote.fixedProfitPerKg !== '')
          ? Number(remote.fixedProfitPerKg)
          : DEFAULT_MATERIAL_COST_SETTINGS.fixedProfitPerKg,
        ...inkPurchaseQuantities(remote),
        updatedAt: remote.updatedAt || ''
      };
      safeLocalStorageSet(MATERIAL_COST_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.warn("Failed to fetch material cost settings from Supabase:", err);
  }
  return getMaterialCostSettings();
}

/**
 * Get synchronous Material Cost Settings (cached or defaults)
 */
export function getMaterialCostSettings() {
  try {
    const saved = localStorage.getItem(MATERIAL_COST_SETTINGS_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_MATERIAL_COST_SETTINGS };
    const parsed = JSON.parse(saved);
    return {
      ...DEFAULT_MATERIAL_COST_SETTINGS,
      ...parsed,
      adhesiveCostPerKg: Number(parsed.adhesiveCostPerKg ?? parsed.adhesivePrice) || DEFAULT_MATERIAL_COST_SETTINGS.adhesiveCostPerKg,
      paperCoreCostPerKg: Number(parsed.paperCoreCostPerKg ?? parsed.paperCorePrice) || DEFAULT_MATERIAL_COST_SETTINGS.paperCoreCostPerKg,
      liquidInkPrice: Number(parsed.liquidInkPrice) || DEFAULT_MATERIAL_COST_SETTINGS.liquidInkPrice,
      conversionChargesPerKg: (parsed.conversionChargesPerKg !== undefined && parsed.conversionChargesPerKg !== '')
        ? Number(parsed.conversionChargesPerKg)
        : DEFAULT_MATERIAL_COST_SETTINGS.conversionChargesPerKg,
      fixedProfitPerKg: (parsed.fixedProfitPerKg !== undefined && parsed.fixedProfitPerKg !== '')
        ? Number(parsed.fixedProfitPerKg)
        : DEFAULT_MATERIAL_COST_SETTINGS.fixedProfitPerKg,
      ...inkPurchaseQuantities(parsed)
    };
  } catch (e) {
    return { ...DEFAULT_MATERIAL_COST_SETTINGS };
  }
}

/**
 * Save Material Cost Settings to Supabase DB and local cache
 */
export async function saveCompanyProfile(profile) {
  const problem = companyProfileError(profile);
  if (problem) {
    const error = new Error(problem);
    error.status = 500;
    throw error;
  }
  const stored = withCompanyTagline(normalizeCompanyProfile(profile));
  await saveSystemSetting(COMPANY_PROFILE_SETTING_KEY, stored);
  cacheCompanyProfile(stored);
  return stored;
}

export async function loadCompanyProfileFromSupabase() {
  const remote = await fetchSystemSetting(COMPANY_PROFILE_SETTING_KEY);
  if (!remote) return getCompanyProfile();
  return cacheCompanyProfile(remote);
}

export async function saveMaterialCostSettings(settings) {
  const quantities = inkPurchaseQuantities(settings);
  if (!Number.isFinite(quantities.minPoQtyKg) || !Number.isFinite(quantities.defaultReorderLevelKg)) {
    throw new Error('minPoQtyKg and defaultReorderLevelKg must be numbers greater than or equal to 0.');
  }
  const payload = {
    ...DEFAULT_MATERIAL_COST_SETTINGS,
    ...settings,
    ...quantities,
    adhesiveCostPerKg: Number(settings.adhesiveCostPerKg ?? settings.adhesivePrice) || DEFAULT_MATERIAL_COST_SETTINGS.adhesiveCostPerKg,
    paperCoreCostPerKg: Number(settings.paperCoreCostPerKg ?? settings.paperCorePrice) || DEFAULT_MATERIAL_COST_SETTINGS.paperCoreCostPerKg,
    liquidInkPrice: Number(settings.liquidInkPrice) || DEFAULT_MATERIAL_COST_SETTINGS.liquidInkPrice,
    conversionChargesPerKg: (settings.conversionChargesPerKg !== undefined && settings.conversionChargesPerKg !== '')
      ? Number(settings.conversionChargesPerKg)
      : DEFAULT_MATERIAL_COST_SETTINGS.conversionChargesPerKg,
    fixedProfitPerKg: (settings.fixedProfitPerKg !== undefined && settings.fixedProfitPerKg !== '')
      ? Number(settings.fixedProfitPerKg)
      : DEFAULT_MATERIAL_COST_SETTINGS.fixedProfitPerKg,
    updatedAt: new Date().toISOString()
  };
  await saveSystemSetting('material_cost_settings', payload);
  safeLocalStorageSet(MATERIAL_COST_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
  await saveProcessingRates({
    liquidInkPrice: payload.liquidInkPrice,
    adhesivePrice: payload.adhesiveCostPerKg,
    paperCorePrice: payload.paperCoreCostPerKg,
    conversionChargesPerKg: payload.conversionChargesPerKg,
    fixedProfitPerKg: payload.fixedProfitPerKg
  });
  return payload;
}

/**
 * Get processing rates (Liquid Ink default price & Adhesive price)
 */
export function getProcessingRates() {
  try {
    const saved = localStorage.getItem(RATES_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_RATES };
    const parsed = JSON.parse(saved);
    return {
      liquidInkPrice: Number(parsed.liquidInkPrice) || DEFAULT_RATES.liquidInkPrice,
      adhesivePrice: Number(parsed.adhesivePrice) || DEFAULT_RATES.adhesivePrice,
      paperCorePrice: Number(parsed.paperCorePrice) || DEFAULT_RATES.paperCorePrice,
      conversionChargesPerKg: (parsed.conversionChargesPerKg !== undefined && parsed.conversionChargesPerKg !== '')
        ? Number(parsed.conversionChargesPerKg)
        : DEFAULT_RATES.conversionChargesPerKg,
      fixedProfitPerKg: (parsed.fixedProfitPerKg !== undefined && parsed.fixedProfitPerKg !== '')
        ? Number(parsed.fixedProfitPerKg)
        : DEFAULT_RATES.fixedProfitPerKg
    };
  } catch (e) {
    return { ...DEFAULT_RATES };
  }
}

/**
 * Save processing rates configuration
 */
export async function saveProcessingRates(rates) {
  const current = getProcessingRates();
  const merged = { ...current, ...rates };
  await saveSystemSetting('processing_rates', merged);
  cacheJson(RATES_STORAGE_KEY, merged);
  return merged;
}

/**
 * Get inventory ageing threshold configuration (days per category)
 */
export function getInventoryAgeingSettings() {
  try {
    const saved = localStorage.getItem(AGEING_SETTINGS_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_AGEING_SETTINGS };
    return { ...DEFAULT_AGEING_SETTINGS, ...JSON.parse(saved) };
  } catch (e) {
    return { ...DEFAULT_AGEING_SETTINGS };
  }
}

/**
 * Save inventory ageing threshold configuration
 */
export async function saveInventoryAgeingSettings(settings) {
  await saveSystemSetting('inventory_ageing_settings', settings);
  cacheJson(AGEING_SETTINGS_STORAGE_KEY, settings);
  return settings;
}


// ============================================================================
// EMAIL CONFIGURATION & VISUAL TEMPLATE MANAGEMENT
// ============================================================================

const EMAIL_SETTINGS_STORAGE_KEY = 'samyak_email_settings';
const EMAIL_TEMPLATES_STORAGE_KEY = 'samyak_email_templates';

export const DEFAULT_EMAIL_SETTINGS = {
  smtpHost: 'smtp.hostinger.com',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: 'admin@samyakinternational.in',
  smtpPass: '',
  senderName: 'Samyak International ERP',
  adminEmail: 'admin@samyakinternational.in',
  plantManagerEmail: 'admin@samyakinternational.in',
  purchaseEmail: 'purchase@samyakinternational.in',
  dispatchEmail: 'dispatch@samyakinternational.in'
};

export const DEFAULT_EMAIL_TEMPLATES = {
  order_punched: {
    key: 'order_punched',
    name: 'New Job Order Punched Alert',
    eventTitle: '📦 New Job Order Punched: {jobName}',
    subject: '📦 Order Punched: {jobName} ({orderId})',
    badgeText: 'Action Task: Order Created',
    badgeBgColor: '#0284c7',
    toEmail: 'admin@samyakinternational.in',
    ccEmail: '',
    enabled: true,
    contentHtml: `<p style="font-size: 14px; color: #334155;">A new job order has been punched into the ERP system and queued for raw material allocation and cylinder scheduling.</p>
<div class="info-card">
  <table style="width: 100%; font-size: 13px;">
    <tr><td><strong>Order ID:</strong></td><td>{orderId}</td></tr>
    <tr><td><strong>Job Name:</strong></td><td>{jobName}</td></tr>
    <tr><td><strong>Client Name:</strong></td><td>{clientName}</td></tr>
    <tr><td><strong>Order Quantity:</strong></td><td>{orderQtyKg} kg</td></tr>
    <tr><td><strong>Substrate Structure:</strong></td><td>{structure}</td></tr>
    <tr><td><strong>Target Delivery Date:</strong></td><td>{targetDeliveryDate}</td></tr>
  </table>
</div>
<p style="font-size: 13px; color: #64748b;">Please review material requirements in the Production Scheduler.</p>`,
    footerNote: 'Samyak International Ltd • Indore Packaging Division\nKheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY'
  },
  production_submitted: {
    key: 'production_submitted',
    name: 'Production Record Submitted for Approval',
    eventTitle: '📋 Production Record Submitted: {jobName}',
    subject: '📋 Approval Required: Production Record for {jobName} ({orderId})',
    badgeText: 'Action Task: Admin Approval Required',
    badgeBgColor: '#d97706',
    toEmail: 'admin@samyakinternational.in',
    ccEmail: '',
    enabled: true,
    contentHtml: `<p style="font-size: 14px; color: #334155;">Plant Manager has submitted a new production record. Administrative approval is required to finalize costings and job completion.</p>
<div class="info-card">
  <table style="width: 100%; font-size: 13px;">
    <tr><td><strong>Record ID:</strong></td><td>{recordId}</td></tr>
    <tr><td><strong>Order ID:</strong></td><td>{orderId}</td></tr>
    <tr><td><strong>Job Name:</strong></td><td>{jobName}</td></tr>
    <tr><td><strong>Dispatch Ready Qty:</strong></td><td><strong>{totalProductionQtyKg} kg</strong></td></tr>
    <tr><td><strong>Total Ingredients Cost:</strong></td><td>₹ {totalMaterialCostRs}</td></tr>
    <tr><td><strong>Final Cost of Production:</strong></td><td><strong style="color: #047857;">₹ {finalProductionCostRs}</strong></td></tr>
    <tr><td><strong>Total Scrap Logged:</strong></td><td>{totalScrapQtyKg} kg</td></tr>
    <tr><td><strong>Submitted By:</strong></td><td>{filledBy}</td></tr>
  </table>
</div>
<p style="font-size: 13px; color: #64748b;">Log into the ERP Admin Dashboard to approve or reject this production record.</p>`,
    footerNote: 'Samyak International Ltd • Indore Packaging Division\nKheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY'
  },
  production_approved: {
    key: 'production_approved',
    name: 'Production Record Approved',
    eventTitle: '✅ Production Record Approved: {jobName}',
    subject: '✅ Production Record Approved: {jobName}',
    badgeText: 'Action Task: Approved by Admin',
    badgeBgColor: '#059669',
    toEmail: 'admin@samyakinternational.in',
    ccEmail: '',
    enabled: true,
    contentHtml: `<p style="font-size: 14px; color: #334155;">The production record for job <strong>{jobName}</strong> has been officially reviewed and APPROVED by the Admin.</p>
<div class="info-card">
  <table style="width: 100%; font-size: 13px;">
    <tr><td><strong>Record ID:</strong></td><td>{recordId}</td></tr>
    <tr><td><strong>Job Name:</strong></td><td>{jobName}</td></tr>
    <tr><td><strong>Produced Dispatch Qty:</strong></td><td>{totalProductionQtyKg} kg</td></tr>
    <tr><td><strong>Final Production Cost:</strong></td><td>₹ {finalProductionCostRs}</td></tr>
    <tr><td><strong>Approved By:</strong></td><td>{approvedBy}</td></tr>
    <tr><td><strong>Approval Date:</strong></td><td>{approvalDate}</td></tr>
  </table>
</div>`,
    footerNote: 'Samyak International Ltd • Indore Packaging Division\nKheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY'
  },
  indent_created: {
    key: 'indent_created',
    name: 'New Purchase Indent Requisition',
    eventTitle: '📝 New Purchase Indent Requisition: {indentNo}',
    subject: '📝 Material Indent Raised: {indentNo} ({priority} Priority)',
    badgeText: 'Action Task: Material Indent Raised',
    badgeBgColor: '#7c3aed',
    toEmail: 'admin@samyakinternational.in',
    ccEmail: 'purchase@samyakinternational.in',
    enabled: true,
    contentHtml: `<p style="font-size: 14px; color: #334155;">A new material purchase indent requisition has been raised for plant consumables / raw materials.</p>
<div class="info-card">
  <table style="width: 100%; font-size: 13px;">
    <tr><td><strong>Indent No:</strong></td><td>{indentNo}</td></tr>
    <tr><td><strong>Department:</strong></td><td>{department}</td></tr>
    <tr><td><strong>Priority Level:</strong></td><td><strong>{priority}</strong></td></tr>
    <tr><td><strong>Items Requested:</strong></td><td>{itemCount} item(s)</td></tr>
    <tr><td><strong>Remarks:</strong></td><td>{remarks}</td></tr>
  </table>
</div>`,
    footerNote: 'Samyak International Ltd • Indore Packaging Division\nKheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY'
  },
  po_issued: {
    key: 'po_issued',
    name: 'Purchase Order Issued to Supplier',
    eventTitle: '🛒 Purchase Order Issued: {poNumber}',
    subject: '🛒 Purchase Order Issued: {poNumber} - {supplierName}',
    badgeText: 'Action Task: PO Issued to Vendor',
    badgeBgColor: '#2563eb',
    toEmail: 'purchase@samyakinternational.in',
    ccEmail: '',
    enabled: true,
    contentHtml: `<p style="font-size: 14px; color: #334155;">An official Purchase Order has been generated and dispatched to the supplier.</p>
<div class="info-card">
  <table style="width: 100%; font-size: 13px;">
    <tr><td><strong>PO Number:</strong></td><td>{poNumber}</td></tr>
    <tr><td><strong>Vendor / Supplier:</strong></td><td>{supplierName}</td></tr>
    <tr><td><strong>Indent Ref:</strong></td><td>{indentNumber}</td></tr>
    <tr><td><strong>Item Name:</strong></td><td>{itemName}</td></tr>
    <tr><td><strong>Order Quantity:</strong></td><td>{qty} {unit}</td></tr>
    <tr><td><strong>Total PO Amount:</strong></td><td><strong>₹ {totalAmount}</strong></td></tr>
  </table>
</div>`,
    footerNote: 'Samyak International Ltd • Indore Packaging Division\nKheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY'
  },
  low_stock: {
    key: 'low_stock',
    name: 'Low Inventory Stock Warning Alert',
    eventTitle: '⚠️ Low Inventory Alert: {itemName}',
    subject: '⚠️ Low Stock Warning: {itemName} ({stockQty} {unit} left)',
    badgeText: 'Action Task: Inventory Alert',
    badgeBgColor: '#dc2626',
    toEmail: 'admin@samyakinternational.in',
    ccEmail: 'purchase@samyakinternational.in',
    enabled: true,
    contentHtml: `<p style="font-size: 14px; color: #334155;">Plant store stock level for item <strong>{itemName}</strong> has fallen below the safety reorder threshold.</p>
<div class="info-card">
  <table style="width: 100%; font-size: 13px;">
    <tr><td><strong>Item Code:</strong></td><td>{itemCode}</td></tr>
    <tr><td><strong>Item Name:</strong></td><td>{itemName}</td></tr>
    <tr><td><strong>Current In-Stock:</strong></td><td><strong style="color: #dc2626;">{stockQty} {unit}</strong></td></tr>
    <tr><td><strong>Minimum Reorder Level:</strong></td><td>{reorderLevel} {unit}</td></tr>
    <tr><td><strong>Location / Rack:</strong></td><td>{location}</td></tr>
  </table>
</div>
<p style="font-size: 13px; color: #64748b;">Immediate purchase requisition is recommended to avoid shop-floor downtime.</p>`,
    footerNote: 'Samyak International Ltd • Indore Packaging Division\nKheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY'
  },
  user_created: {
    key: 'user_created',
    name: 'User Account Onboarding Welcome Email',
    eventTitle: '🎉 Welcome to SamyakFlexi ERP, {userName}!',
    subject: '🎉 Account Created — SamyakFlexi ERP ({userRole})',
    badgeText: 'Action Task: User Onboarding',
    badgeBgColor: '#059669',
    toEmail: '{userEmail}',
    ccEmail: 'admin@samyakinternational.in',
    enabled: true,
    contentHtml: `<p style="font-size: 14px; color: #334155;">Your user account has been created on the SamyakFlexi ERP platform.</p>
<div class="info-card">
  <table style="width: 100%; font-size: 13px;">
    <tr><td><strong>Full Name:</strong></td><td>{userName}</td></tr>
    <tr><td><strong>Login Email:</strong></td><td>{userEmail}</td></tr>
    <tr><td><strong>Assigned Role:</strong></td><td><strong>{userRole}</strong></td></tr>
    <tr><td><strong>Department:</strong></td><td>{userDepartment}</td></tr>
  </table>
</div>
<p style="font-size: 13px; color: #64748b;">A separate email contains a link to choose your password. Sign in at erp.samyakinternational.in after you set it. No password is included in this message.</p>`,
    footerNote: 'Samyak International Ltd • Indore Packaging Division\nKheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY'
  },
  password_recovery: {
    key: 'password_recovery',
    name: 'Password Recovery Verification Code',
    eventTitle: '🔐 Password Recovery Code',
    subject: '🔐 Password Recovery Request — SamyakFlexi ERP',
    badgeText: 'Security Verification',
    badgeBgColor: '#4f46e5',
    toEmail: '{userEmail}',
    ccEmail: '',
    enabled: true,
    contentHtml: `<p style="color: #475569; font-size: 14px; line-height: 1.5;">
  Password resets for <strong>{userEmail}</strong> are sent by Supabase Auth. Use Forgot password on the ERP login screen. The message contains a one-time link to choose a new password. There is no verification code.
</p>`,
    footerNote: 'Samyak International Ltd • Indore Packaging Division\nKheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY'
  },
  over_wastage: {
    key: 'over_wastage',
    name: 'Over Wastage Alert (Pre-costing Threshold Exceeded)',
    eventTitle: '⚠️ Over Wastage Alert: {jobName}',
    subject: '⚠️ Over Wastage Threshold Exceeded: {jobName} ({actualWastagePct}% vs {allowedWastagePct}% allowed)',
    badgeText: 'Action Task: High Scrap Warning',
    badgeBgColor: '#dc2626',
    toEmail: 'admin@samyakinternational.in',
    ccEmail: '',
    enabled: true,
    contentHtml: `<p style="font-size: 14px; color: #334155;">Production record entry for job <strong>{jobName}</strong> exceeded the pre-costing scrap & wastage allowance threshold by <strong>+{wastageVariancePct}%</strong>.</p>
<div class="info-card">
  <table style="width: 100%; font-size: 13px;">
    <tr><td><strong>Job Name:</strong></td><td>{jobName} ({orderId})</td></tr>
    <tr><td><strong>Production Date & Time:</strong></td><td>{productionDateTime}</td></tr>
    <tr><td><strong>Target Order Quantity:</strong></td><td>{orderQtyKg} kg</td></tr>
    <tr><td><strong>Net Dispatch Quantity Produced:</strong></td><td><strong>{totalProductionQtyKg} kg</strong></td></tr>
    <tr><td><strong>Pre-costing Allowed Wastage %:</strong></td><td>{allowedWastagePct}%</td></tr>
    <tr><td><strong>Actual Logged Wastage %:</strong></td><td><strong style="color: #dc2626;">{actualWastagePct}%</strong></td></tr>
    <tr><td><strong>Total Wastage Produced:</strong></td><td><strong style="color: #dc2626;">{actualWastageKg} kg</strong></td></tr>
  </table>
</div>
<h4 style="font-size: 13px; color: #0f172a; margin-top: 16px; margin-bottom: 8px;">Breakdown of Process Scrap Generated:</h4>
{wastageBreakdownHtml}
<p style="font-size: 13px; color: #64748b; margin-top: 16px;">Please review shop-floor extrusion/printing setup logs and machine settings in the Plant Operations dashboard.</p>`,
    footerNote: 'Samyak International Ltd • Indore Packaging Division\nKheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY'
  },
  grn_pending_qc: {
    key: 'grn_pending_qc',
    name: 'GRN Inward Pending QC Approval Alert',
    eventTitle: '🧪 Inward GRN Pending Quality Inspection: #{grnNo}',
    subject: '🧪 Action Required: Inward GRN #{grnNo} Pending QC Approval — {vendorName}',
    badgeText: 'Action Task: Pending QC Inspection',
    badgeBgColor: '#d97706',
    toEmail: 'quality@samyakinternational.in',
    ccEmail: 'admin@samyakinternational.in',
    enabled: true,
    contentHtml: `<p style="font-size: 14px; color: #334155;">A new Goods Receipt Note (GRN) has been inwarded at the plant store and is currently <strong>Pending Quality Control (QC) Inspection & Approval</strong>.</p>
<div class="info-card">
  <table style="width: 100%; font-size: 13px;">
    <tr><td><strong>GRN Document No:</strong></td><td><strong>{grnNo}</strong></td></tr>
    <tr><td><strong>Supplier / Vendor:</strong></td><td>{vendorName}</td></tr>
    <tr><td><strong>Invoice No & Date:</strong></td><td>{invoiceNo} ({receivedDate})</td></tr>
    <tr><td><strong>Material Category:</strong></td><td>{category}</td></tr>
    <tr><td><strong>Item Name:</strong></td><td>{itemName}</td></tr>
    <tr><td><strong>Inward Net Quantity:</strong></td><td><strong>{netWeightKg}</strong></td></tr>
    <tr><td><strong>Packages / Rolls Received:</strong></td><td>{unitCount}</td></tr>
    <tr><td><strong>Supplier Batch No:</strong></td><td>{batchNo}</td></tr>
    <tr><td><strong>Inwarded By (Store):</strong></td><td>{storeManager}</td></tr>
    <tr><td><strong>Generated Barcodes:</strong></td><td><code>{barcodes}</code></td></tr>
  </table>
</div>
<p style="font-size: 13px; color: #475569;"><strong>Action Required:</strong> Please perform physical quality sampling and parameter verification in the Inventory & Quality Control module to release material into active plant inventory.</p>`,
    footerNote: 'Samyak International Ltd • Indore Packaging Division\nKheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY'
  },
  grn_qc_escalation_12h: {
    key: 'grn_qc_escalation_12h',
    name: 'GRN Pending QC Overdue (>12 Hours) Escalation Alert',
    eventTitle: '🚨 SLA URGENT ALERT: QC Approval Overdue (>12 Hours) — GRN #{grnNo}',
    subject: '🚨 OVERDUE QC APPROVAL ALERT (>12 hrs): GRN #{grnNo} — {vendorName}',
    badgeText: '🚨 SLA Escalation Alert: QC Overdue',
    badgeBgColor: '#dc2626',
    toEmail: 'admin@samyakinternational.in',
    ccEmail: 'quality@samyakinternational.in',
    enabled: true,
    contentHtml: `<div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
  <h3 style="color: #991b1b; font-size: 16px; margin: 0 0 6px 0;">🚨 12-Hour Quality Inspection SLA Exceeded</h3>
  <p style="color: #7f1d1d; font-size: 13px; margin: 0;">Goods Receipt Note <strong>#{grnNo}</strong> has been pending Quality Control (QC) clearance for <strong style="color: #dc2626; font-size: 15px;">{hoursPending} hours</strong> without sign-off.</p>
</div>
<div class="info-card">
  <table style="width: 100%; font-size: 13px;">
    <tr><td><strong>GRN Document No:</strong></td><td><strong>{grnNo}</strong></td></tr>
    <tr><td><strong>Supplier / Vendor:</strong></td><td>{vendorName}</td></tr>
    <tr><td><strong>Invoice No & Date:</strong></td><td>{invoiceNo} ({receivedDate})</td></tr>
    <tr><td><strong>Material Description:</strong></td><td>{itemName} ({category})</td></tr>
    <tr><td><strong>Inward Net Quantity:</strong></td><td><strong>{netWeightKg}</strong></td></tr>
    <tr><td><strong>Batch Number:</strong></td><td>{batchNo}</td></tr>
    <tr><td><strong>Total SLA Delay:</strong></td><td><strong style="color: #dc2626;">{hoursPending} Hours</strong></td></tr>
    <tr><td><strong>Inwarded By:</strong></td><td>{storeManager}</td></tr>
  </table>
</div>
<p style="font-size: 13px; color: #1e293b; margin-top: 16px; font-weight: 600;">Escalated Roles Notified: Admin, Plant Manager, Production Manager, Quality Head.</p>`,
    footerNote: 'Samyak International Ltd • Indore Packaging Division\nKheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY'
  }
};


/**
 * Replace placeholder variables like {jobName}, {orderId} in string templates
 */
export function interpolateTemplate(str, vars = {}) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/\{(\w+)\}/g, (match, p1) => {
    return vars[p1] !== undefined && vars[p1] !== null ? vars[p1] : match;
  });
}

/**
 * Fetch saved Email Settings (SMTP & Department routing)
 */
function withoutSmtpSecret(config) {
  const { smtpPass, ...rest } = config || {};
  return { ...DEFAULT_EMAIL_SETTINGS, ...rest, smtpPass: '' };
}

export function getEmailSettings() {
  try {
    const saved = localStorage.getItem(EMAIL_SETTINGS_STORAGE_KEY);
    return withoutSmtpSecret(saved ? JSON.parse(saved) : {});
  } catch (e) {
    return { ...DEFAULT_EMAIL_SETTINGS };
  }
}

/**
 * Save Email Settings (SMTP & Department routing)
 */
export async function saveEmailSettings(config) {
  const safe = withoutSmtpSecret(config);
  await saveEmailSettingsToSupabase(safe);
  cacheJson(EMAIL_SETTINGS_STORAGE_KEY, safe);
  return safe;
}

/**
 * Fetch saved Email Templates for all ERP events
 */
export function getEmailTemplates() {
  try {
    const saved = localStorage.getItem(EMAIL_TEMPLATES_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_EMAIL_TEMPLATES };
    const parsed = JSON.parse(saved);
    const merged = { ...DEFAULT_EMAIL_TEMPLATES };
    Object.keys(DEFAULT_EMAIL_TEMPLATES).forEach(key => {
      if (parsed[key]) {
        merged[key] = { ...DEFAULT_EMAIL_TEMPLATES[key], ...parsed[key] };
      }
    });
    if (merged.user_created?.contentHtml?.includes('{userPassword}')) {
      merged.user_created = {
        ...merged.user_created,
        contentHtml: DEFAULT_EMAIL_TEMPLATES.user_created.contentHtml
      };
    }
    if (merged.password_recovery?.contentHtml?.includes('{recoveryCode}')) {
      merged.password_recovery = {
        ...merged.password_recovery,
        contentHtml: DEFAULT_EMAIL_TEMPLATES.password_recovery.contentHtml
      };
    }
    return merged;
  } catch (e) {
    return { ...DEFAULT_EMAIL_TEMPLATES };
  }
}

/**
 * Save custom Email Templates
 */
export async function saveEmailTemplates(templates) {
  await saveEmailTemplatesToSupabase(templates);
  cacheJson(EMAIL_TEMPLATES_STORAGE_KEY, templates);
  return templates;
}

/**
 * Reset Email Templates to Factory Defaults
 */
export async function resetEmailTemplates() {
  return saveEmailTemplates({ ...DEFAULT_EMAIL_TEMPLATES });
}

/* ========================================================================= */
/* FILM SUBSTRATES & DENSITIES MASTER SETTINGS */
/* ========================================================================= */


export async function saveFilmSubstrates(substratesList) {
  await saveFilmSubstratesToSupabase(substratesList);
  safeLocalStorageSet(FILM_SUBSTRATES_STORAGE_KEY, JSON.stringify(substratesList));
  return substratesList;
}

export async function loadFilmSubstratesFromSupabase() {
  try {
    const remoteSubstrates = await fetchFilmSubstratesFromSupabase();
    if (remoteSubstrates && Array.isArray(remoteSubstrates) && remoteSubstrates.length > 0) {
      safeLocalStorageSet(FILM_SUBSTRATES_STORAGE_KEY, JSON.stringify(remoteSubstrates));
      return remoteSubstrates;
    }
  } catch (e) {
    console.warn("Could not load film substrates from Supabase:", e.message);
  }
  return getFilmSubstrates();
}

/* ========================================================================= */
/* STORAGE BAYS MASTER SETTINGS */
/* ========================================================================= */
const STORAGE_BAYS_STORAGE_KEY = 'samyak_storage_bays_master';

export const DEFAULT_STORAGE_BAYS = [
  {
    id: 'BAY-RM-01',
    name: 'Bay A - Film Substrate Store',
    code: 'RM-BAY-A',
    storageType: 'Raw Material Store',
    zone: 'Zone 1 - Main Factory Floor',
    capacityKg: 10000,
    status: 'Active',
    description: 'Storage area for raw PET, BOPP, METPET film rolls'
  },
  {
    id: 'BAY-RM-02',
    name: 'Bay B - Inks & Solvents',
    code: 'RM-BAY-B',
    storageType: 'Inks & Chemicals Store',
    zone: 'Rack 2 - Chemicals & Solvent Room',
    capacityKg: 5000,
    status: 'Active',
    description: 'Base inks, ethyl acetate, toluene, hardener barrels'
  },
  {
    id: 'BAY-CYL-01',
    name: 'Bay C - Printing Cylinders Racks',
    code: 'CYL-BAY-C',
    storageType: 'Cylinder Store',
    zone: 'Cylinder Storage Racks (Grid A-F)',
    capacityKg: 500,
    status: 'Active',
    description: 'Engraved Rotogravure cylinders storage'
  },
  {
    id: 'BAY-SFG-01',
    name: 'SFG Bay 1 - Printed Web Rolls',
    code: 'SFG-BAY-01',
    storageType: 'Semi-Finished Goods (SFG) Store',
    zone: 'SFG Aisle 1 (Post-Printing)',
    capacityKg: 8000,
    status: 'Active',
    description: 'Storage for freshly printed rolls awaiting lamination'
  },
  {
    id: 'BAY-SFG-02',
    name: 'SFG Bay 2 - Laminated Web Rolls',
    code: 'SFG-BAY-02',
    storageType: 'Semi-Finished Goods (SFG) Store',
    zone: 'SFG Aisle 2 (Post-Lamination)',
    capacityKg: 8000,
    status: 'Active',
    description: 'Curing area for 1st & 2nd pass laminated web rolls'
  },
  {
    id: 'BAY-FG-01',
    name: 'FG Bay 1 - Slit Finished Reels',
    code: 'FG-BAY-01',
    storageType: 'Finished Goods (FG) Store',
    zone: 'Dispatch Warehouse Shelf A',
    capacityKg: 12000,
    status: 'Active',
    description: 'QC passed slit rolls packed & ready for delivery'
  },
  {
    id: 'BAY-FG-02',
    name: 'FG Bay 2 - Finished Pouches & Bags',
    code: 'FG-BAY-02',
    storageType: 'Finished Goods (FG) Store',
    zone: 'Dispatch Warehouse Shelf B',
    capacityKg: 10000,
    status: 'Active',
    description: 'Corrugated cartons of finished pouches'
  }
];

export function getStorageBays() {
  try {
    const saved = localStorage.getItem(STORAGE_BAYS_STORAGE_KEY);
    if (!saved) return [...DEFAULT_STORAGE_BAYS];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_STORAGE_BAYS];
  } catch (e) {
    return [...DEFAULT_STORAGE_BAYS];
  }
}

export async function saveStorageBays(baysList) {
  await saveSystemSetting('storage_bays_master', baysList);
  safeLocalStorageSet(STORAGE_BAYS_STORAGE_KEY, JSON.stringify(baysList));
  return baysList;
}

export async function loadStorageBaysFromSupabase() {
  try {
    const remote = await fetchSystemSetting('storage_bays_master');
    if (remote && Array.isArray(remote) && remote.length > 0) {
      safeLocalStorageSet(STORAGE_BAYS_STORAGE_KEY, JSON.stringify(remote));
      return remote;
    }
  } catch (e) {
    console.warn("Could not load storage bays from Supabase:", e.message);
  }
  return getStorageBays();
}


