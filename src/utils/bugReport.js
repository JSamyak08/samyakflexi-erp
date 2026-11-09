/** Bug-report rules shared by the form, the list, and the tests. */

export const BUG_SCREENSHOT_BUCKET = 'bug-screenshots';
export const MAX_SCREENSHOTS = 5;
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const MIN_DESCRIPTION_LENGTH = 30;
export const MAX_DESCRIPTION_LENGTH = 8000;
export const BUG_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
export const BUG_STATUSES = ['New', 'In Progress', 'Resolved', "Won't Fix"];
export const DESCRIPTION_PLACEHOLDER = 'What you did, what you expected, and what happened.';

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const MODULE_LABELS = {
  dashboard: 'Executive Dashboard',
  sales: 'Sales & Quotations',
  scrap_analytics: 'Scrap & Wastage',
  job_punching: 'Job Punching & Costing',
  orders: 'Order Management',
  job_masters: 'Job Master Directory',
  clients: 'Clients Directory',
  printing_scheduler: 'Printing Scheduler',
  production_records: 'Production Records',
  sfg_store: 'SFG & FG Store',
  cylinders: 'Rotogravure Cylinders',
  purchase_orders: 'Purchase Orders',
  inventory: 'Inventory, GRN & QC',
  ink_management: 'Ink Master & Costing',
  material_indents: 'Material Indents & Store',
  pellet_fuel: 'Pellet Fuel Stock Management',
  barcodes: 'Barcodes',
  vendors: 'Vendor Directory',
  dispatch: 'Dispatch & Challans',
  employees: 'Employee Management',
  user_management: 'User Access (RBAC)',
  supabase: 'Supabase Connection',
  doc_settings: 'System Settings',
  audit_logs: 'System Audit Logs',
  bug_reports: 'Bug Reports',
  my_bug_reports: 'My Bug Reports',
};

export function moduleLabelForTab(tab) {
  const key = String(tab || '').trim();
  return MODULE_LABELS[key] || '';
}

/**
 * Alt+Shift+R opens the report form.
 * Alt+B and Ctrl+B stay on the barcode scanner.
 * Ctrl+\ and Cmd+\ stay on the sidebar.
 */
export function isBugReportShortcut(event) {
  if (!event || event.repeat) return false;
  if (!event.altKey || !event.shiftKey) return false;
  if (event.ctrlKey || event.metaKey) return false;
  if (event.key === 'r' || event.key === 'R') return true;
  return event.code === 'KeyR';
}

export function bugReportShortcutLabel() {
  return 'Alt+Shift+R';
}

export function isValidPageUrl(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 2000 || /\s/.test(text)) return false;
  try {
    const url = new URL(text);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeImageMime(type, name = '') {
  const mime = String(type || '').toLowerCase().split(';')[0].trim();
  if (mime === 'image/jpg' || mime === 'image/pjpeg') return 'image/jpeg';
  if (ACCEPTED_MIME.has(mime)) return mime;
  const ext = String(name || '').toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return '';
}

export function extensionForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  return '';
}

export function bugScreenshotPath(authUserId, reportId, index, mime) {
  const ext = extensionForMime(mime);
  if (!authUserId || !reportId || !ext) return '';
  const n = Number(index);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SCREENSHOTS) return '';
  return `${authUserId}/${reportId}/${n}.${ext}`;
}

export function screenshotPathOwnedBy(path, authUserId) {
  const text = String(path || '');
  if (!authUserId || !text || text.includes('..') || text.startsWith('/')) return false;
  return text.split('/')[0] === String(authUserId);
}

export function validateBugReportDraft({ description, pageUrl, screenshots } = {}) {
  const errors = {};
  const text = String(description || '').trim();
  if (text.length < MIN_DESCRIPTION_LENGTH) {
    errors.description = `Describe the bug in at least ${MIN_DESCRIPTION_LENGTH} characters: what you did, what you expected, and what happened.`;
  } else if (text.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`;
  }
  const link = String(pageUrl || '').trim();
  if (!link) errors.pageUrl = 'Page link is required.';
  else if (!isValidPageUrl(link)) errors.pageUrl = 'Enter a valid http or https page link.';
  const shots = Array.isArray(screenshots) ? screenshots : [];
  if (shots.length < 1) errors.screenshots = 'Add at least one screenshot.';
  else if (shots.length > MAX_SCREENSHOTS) errors.screenshots = `You can attach up to ${MAX_SCREENSHOTS} screenshots.`;
  return errors;
}

export function draftHasErrors(errors) {
  return Boolean(errors && Object.keys(errors).length);
}

export function imageRejectionReason(file) {
  if (!file) return 'Choose a PNG, JPG, or WebP image.';
  const mime = normalizeImageMime(file.type, file.name);
  if (!mime) return 'Use a PNG, JPG, or WebP image.';
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) return 'That image is empty.';
  if (size > MAX_SCREENSHOT_BYTES) return 'Each screenshot must be 5 MB or smaller.';
  return '';
}

export function isBugReportLayer(element) {
  if (!element) return false;
  if (typeof element.closest === 'function' && element.closest('[data-bug-report-layer]')) return true;
  return typeof element.hasAttribute === 'function' && element.hasAttribute('data-bug-report-layer');
}

export function collectBugMetadata({
  user,
  userAgent = '',
  screenWidth = null,
  screenHeight = null,
  appVersion = '',
  pageUrl = '',
  moduleLabel = '',
  capturedAt = '',
} = {}) {
  const width = Number(screenWidth);
  const height = Number(screenHeight);
  return {
    reporterUserId: user?.id ? String(user.id) : '',
    reporterName: user?.name || user?.full_name || user?.username || '',
    reporterRole: user?.role || '',
    userAgent: String(userAgent || '').slice(0, 1000),
    screenWidth: Number.isFinite(width) ? Math.round(width) : null,
    screenHeight: Number.isFinite(height) ? Math.round(height) : null,
    appVersion: String(appVersion || '').slice(0, 200),
    pageUrl: String(pageUrl || ''),
    module: String(moduleLabel || ''),
    capturedAt: capturedAt || new Date().toISOString(),
  };
}

export function filterBugReports(rows, filters = {}) {
  const status = String(filters.status || 'All');
  const severity = String(filters.severity || 'All');
  const moduleName = String(filters.module || '').trim().toLowerCase();
  const reporter = String(filters.reporter || '').trim().toLowerCase();
  const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : null;
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row) return false;
    if (status !== 'All' && row.status !== status) return false;
    if (severity !== 'All' && row.severity !== severity) return false;
    if (moduleName && !String(row.module || '').toLowerCase().includes(moduleName)) return false;
    if (reporter) {
      const haystack = [row.reporterName, row.reporterRole, row.reporterUserId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(reporter)) return false;
    }
    if (from || to) {
      const when = new Date(row.createdAt || 0);
      if (Number.isNaN(when.getTime())) return false;
      if (from && when < from) return false;
      if (to && when > to) return false;
    }
    return true;
  });
}

export function dataUrlToFile(dataUrl, filename, mimeHint) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('Screenshot data was not a base64 image.');
  const mime = mimeHint || match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const name = filename || `screenshot.${extensionForMime(mime) || 'img'}`;
  if (typeof File === 'function') return new File([bytes], name, { type: mime });
  const blob = new Blob([bytes], { type: mime });
  blob.name = name;
  return blob;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Shrink an image until it fits the 5 MB cap. PNG, JPG, and WebP are accepted.
 * Images that are already small enough are returned unchanged.
 */
export async function prepareBugImage(file) {
  const mime = normalizeImageMime(file?.type, file?.name);
  if (!mime) throw new Error('Use a PNG, JPG, or WebP image.');
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) throw new Error('That image is empty.');
  if (size <= MAX_SCREENSHOT_BYTES) {
    if (file.type === mime) return file;
    const bytes = new Uint8Array(await file.arrayBuffer());
    return new File([bytes], file.name || `screenshot.${extensionForMime(mime)}`, { type: mime });
  }
  if (typeof document === 'undefined') {
    throw new Error('Each screenshot must be 5 MB or smaller.');
  }
  const { compressImageDataUrl } = await import('./safeStorage.js');
  const source = await readAsDataUrl(file);
  let maxDim = 1800;
  let quality = 0.82;
  let best = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const compressed = await compressImageDataUrl(source, maxDim, quality);
    const next = dataUrlToFile(compressed, `screenshot-${Date.now()}.jpg`, 'image/jpeg');
    if (!best || next.size < best.size) best = next;
    if (next.size <= MAX_SCREENSHOT_BYTES && next.size > 0) return next;
    quality = Math.max(0.35, quality - 0.12);
    maxDim = Math.max(640, Math.round(maxDim * 0.72));
  }
  if (best && best.size <= MAX_SCREENSHOT_BYTES) return best;
  throw new Error('Each screenshot must be 5 MB or smaller.');
}
