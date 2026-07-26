/**
 * Settings Service for Samyak Flexi-ERP
 * Manages Authorised Signatory Signature, Document Prefix Series, Payment Terms & Terms & Conditions
 */

const SIGNATURE_STORAGE_KEY = 'samyak_authorised_signature';
const PREFIX_STORAGE_KEY = 'samyak_doc_prefixes';
const TERMS_STORAGE_KEY = 'samyak_doc_terms';

export const DEFAULT_PREFIXES = {
  poPrefix: 'SIL/PO/26-27/',
  poCounter: 246,
  ocnPrefix: 'SIL/OCN/26-27/',
  ocnCounter: 108,
  grnPrefix: 'SIL/GRN/26-27/',
  grnCounter: 104
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
export function saveAuthorisedSignature(base64String) {
  try {
    if (base64String) {
      localStorage.setItem(SIGNATURE_STORAGE_KEY, base64String);
    } else {
      localStorage.removeItem(SIGNATURE_STORAGE_KEY);
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
      grnTerms: Array.isArray(parsed.grnTerms) && parsed.grnTerms.length > 0 ? parsed.grnTerms : DEFAULT_DOCUMENT_TERMS.grnTerms
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
  } catch (e) {
    console.error("Failed to save document terms", e);
  }
}

/**
 * Generate formatted document reference number
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
  }
  
  return `SIL/DOC/${customNumber || 100}`;
}
