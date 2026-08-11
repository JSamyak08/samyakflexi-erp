/**
 * Settings Service for Samyak Flexi-ERP
 * Manages Authorised Signatory Signature, Document Prefix Series, Payment Terms & Terms & Conditions
 */

const LOGO_STORAGE_KEY = 'samyak_company_logo';
const SIGNATURE_STORAGE_KEY = 'samyak_authorised_signature';
const PREFIX_STORAGE_KEY = 'samyak_doc_prefixes';
const TERMS_STORAGE_KEY = 'samyak_doc_terms';

import { compressImageDataUrl, safeLocalStorageSet } from '../utils/safeStorage';
import { saveSystemSetting, saveEmailSettingsToSupabase, saveEmailTemplatesToSupabase } from './supabaseDataService';


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
  smtpPass: 'Admin#3994',
  senderName: 'Samyak International ERP',
  adminEmail: 'admin@samyakinternational.in',
  plantManagerEmail: 'plant.manager@plant.com',
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
    ccEmail: 'plant.manager@plant.com',
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
    toEmail: 'plant.manager@plant.com',
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
    <tr><td><strong>Temporary Password:</strong></td><td><code>{userPassword}</code></td></tr>
  </table>
</div>
<p style="font-size: 13px; color: #64748b;">Please log in at app.samyakinternational.in and update your password.</p>`,
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
  We received a password reset request for your ERP account associated with <strong>{userEmail}</strong>.
</p>
<div style="background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
  <span style="font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Your 6-Digit Verification Code</span>
  <span style="font-size: 32px; font-weight: 800; color: #0f172a; letter-spacing: 6px;">{recoveryCode}</span>
</div>
<p style="color: #475569; font-size: 13px;">
  Please enter this verification code on the ERP login screen to set a new password. This code will expire in 15 minutes.
</p>`,
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
export function getEmailSettings() {
  try {
    const saved = localStorage.getItem(EMAIL_SETTINGS_STORAGE_KEY);
    return saved ? { ...DEFAULT_EMAIL_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_EMAIL_SETTINGS };
  } catch (e) {
    return { ...DEFAULT_EMAIL_SETTINGS };
  }
}

/**
 * Save Email Settings (SMTP & Department routing)
 */
export function saveEmailSettings(config) {
  try {
    localStorage.setItem(EMAIL_SETTINGS_STORAGE_KEY, JSON.stringify(config));
    saveEmailSettingsToSupabase(config).catch(() => {});
  } catch (e) {
    console.error("Failed to save email settings", e);
  }
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
    return merged;
  } catch (e) {
    return { ...DEFAULT_EMAIL_TEMPLATES };
  }
}

/**
 * Save custom Email Templates
 */
export function saveEmailTemplates(templates) {
  try {
    localStorage.setItem(EMAIL_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    saveEmailTemplatesToSupabase(templates).catch(() => {});
  } catch (e) {
    console.error("Failed to save email templates", e);
  }
}

/**
 * Reset Email Templates to Factory Defaults
 */
export function resetEmailTemplates() {
  try {
    localStorage.setItem(EMAIL_TEMPLATES_STORAGE_KEY, JSON.stringify(DEFAULT_EMAIL_TEMPLATES));
    saveEmailTemplatesToSupabase(DEFAULT_EMAIL_TEMPLATES).catch(() => {});
    return { ...DEFAULT_EMAIL_TEMPLATES };
  } catch (e) {
    return { ...DEFAULT_EMAIL_TEMPLATES };
  }
}

