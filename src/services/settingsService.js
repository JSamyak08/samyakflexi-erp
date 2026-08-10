/**
 * Settings Service for Samyak Flexi-ERP
 * Manages Authorised Signatory Signature, Document Prefix Series, Payment Terms & Terms & Conditions
 */

const LOGO_STORAGE_KEY = 'samyak_company_logo';
const SIGNATURE_STORAGE_KEY = 'samyak_authorised_signature';
const PREFIX_STORAGE_KEY = 'samyak_doc_prefixes';
const TERMS_STORAGE_KEY = 'samyak_doc_terms';

import { compressImageDataUrl, safeLocalStorageSet } from '../utils/safeStorage';
import { saveSystemSetting } from './supabaseDataService';


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
  try {
    if (base64String) {
      const compressed = await compressImageDataUrl(base64String, 600, 0.7);
      safeLocalStorageSet(LOGO_STORAGE_KEY, compressed);
      await saveSystemSetting('company_logo', compressed);
    } else {
      localStorage.removeItem(LOGO_STORAGE_KEY);
      await saveSystemSetting('company_logo', '');
    }
  } catch (e) {
    console.error("Failed to save logo", e);
  }
}

/**
 * Clear stored company logo
 */
export function clearCompanyLogo() {
  try {
    localStorage.removeItem(LOGO_STORAGE_KEY);
    saveSystemSetting('company_logo', '').catch(() => {});
  } catch (e) {
    console.error("Failed to clear logo", e);
  }
}



export const DEFAULT_PREFIXES = {
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
  indentCounter: 101
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
  try {
    if (base64String) {
      const compressed = await compressImageDataUrl(base64String, 500, 0.7);
      safeLocalStorageSet(SIGNATURE_STORAGE_KEY, compressed);
      await saveSystemSetting('auth_signature', compressed);
    } else {
      localStorage.removeItem(SIGNATURE_STORAGE_KEY);
      await saveSystemSetting('auth_signature', '');
    }
  } catch (e) {
    console.error("Failed to save signature", e);
  }
}

/**
 * Clear stored signature
 */
export function clearAuthorisedSignature() {
  try {
    localStorage.removeItem(SIGNATURE_STORAGE_KEY);
    saveSystemSetting('auth_signature', '').catch(() => {});
  } catch (e) {
    console.error("Failed to clear signature", e);
  }
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
export function saveDocumentPrefixes(prefixConfig) {
  try {
    localStorage.setItem(PREFIX_STORAGE_KEY, JSON.stringify(prefixConfig));
    saveSystemSetting('doc_prefixes', prefixConfig).catch(() => {});
  } catch (e) {
    console.error("Failed to save document prefixes", e);
  }
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
export function saveDocumentTerms(termsConfig) {
  try {
    localStorage.setItem(TERMS_STORAGE_KEY, JSON.stringify(termsConfig));
    saveSystemSetting('doc_terms', termsConfig).catch(() => {});
  } catch (e) {
    console.error("Failed to save document terms", e);
  }
}


/**
 * Generate formatted document reference number without incrementing counter
 */
export function generateDocRefNumber(type, customNumber) {
  const config = getDocumentPrefixes();
  
  if (type === 'po') {
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
  
  if (type === 'po') {
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
  }

  const docRef = generateDocRefNumber(type, num);
  
  if (key) {
    saveDocumentPrefixes({
      ...config,
      [key]: Number(num) + 1
    });
  }

  return docRef;
}

const RATES_STORAGE_KEY = 'samyak_processing_rates';

export const DEFAULT_RATES = {
  liquidInkPrice: 1500,
  adhesivePrice: 270
};

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
      adhesivePrice: Number(parsed.adhesivePrice) || DEFAULT_RATES.adhesivePrice
    };
  } catch (e) {
    return { ...DEFAULT_RATES };
  }
}

/**
 * Save processing rates configuration
 */
export function saveProcessingRates(rates) {
  try {
    localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(rates));
    saveSystemSetting('processing_rates', rates).catch(() => {});
  } catch (e) {
    console.error("Failed to save processing rates", e);
  }
}

