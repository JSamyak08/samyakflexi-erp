/**
 * File names for every PDF the ERP prints or downloads.
 *
 * Chrome's Save as PDF dialog uses the document title, or the title of the
 * frame being printed. The name is:
 *   <Document title> - <Document number> - Samyak International Ltd
 *
 * Windows file names cannot contain \ / : * ? " < > | or control characters.
 * A slash in a printed number such as SIL/GRN/26-27/198 is replaced with a
 * hyphen, which leaves SIL-GRN-26-27-198. Hyphens already in the number stay.
 * The hyphen is used instead of deleting the character so each segment of the
 * number is still readable, and it matches numbers that are already hyphenated
 * (PL-2026-000132). The same replacement is used for the other illegal
 * characters. Spaces stay, because the three parts are separated with " - ".
 * Dots and spaces at either end of a part are removed so Windows will accept
 * the name. The company suffix is always "Samyak International Ltd".
 *
 * A document with no number of its own passes another identifier: a payslip
 * uses the employee code and pay period, a run-and-idle report uses its date
 * range, and a sheet of different barcode labels uses the label count and the
 * IST date. Callers choose that identifier. A blank number is refused.
 */

export const PDF_COMPANY_NAME = 'Samyak International Ltd';

export const PDF_DOCUMENT_TITLES = {
  packingList: 'Dispatch Packing List',
  deliveryChallan: 'Delivery Challan',
  goodsReceipt: 'Goods Receipt Note',
  purchaseOrder: 'Purchase Order',
  salesQuotation: 'Sales Quotation',
  orderConfirmation: 'Order Confirmation Note',
  jobDataSheet: 'Job Data Sheet',
  salaryPayslip: 'Salary Payslip',
  certificateOfAnalysis: 'Certificate Of Analysis',
  pendingOrders: 'Client Pending Orders Statement',
  indent: 'Material Indent Requisition',
  jobCard: 'Cylinder Job Card',
  barcodeLabel: 'Barcode Label',
  barcodeLabels: 'Barcode Labels',
  printUtilization: 'Printing Machine Run And Idle',
};

const MAX_PDF_FILE_BASE = 180;
const ILLEGAL_FILENAME = /[\\/:*?"<>|\u0000-\u001f]/g;
const savedTitles = new WeakMap();

export function sanitizePdfFilePart(value) {
  return String(value ?? '')
    .replace(ILLEGAL_FILENAME, '-')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, '');
}

export function pdfFileBase({ title, number } = {}) {
  let safeTitle = sanitizePdfFilePart(title);
  let safeNumber = sanitizePdfFilePart(number);
  if (!safeTitle) throw new Error('A PDF file name needs a document title.');
  if (!safeNumber) throw new Error('A PDF file name needs a document number or other identifier.');

  const suffix = ` - ${PDF_COMPANY_NAME}`;
  if (MAX_PDF_FILE_BASE - suffix.length - safeTitle.length - 3 < 1) {
    const titleRoom = Math.max(1, MAX_PDF_FILE_BASE - suffix.length - 3 - 8);
    safeTitle = safeTitle.slice(0, titleRoom).replace(/[.\s-]+$/g, '') || 'Document';
  }
  const numberRoom = Math.max(1, MAX_PDF_FILE_BASE - suffix.length - safeTitle.length - 3);
  if (safeNumber.length > numberRoom) {
    safeNumber = safeNumber.slice(0, numberRoom).replace(/[.\s-]+$/g, '') || 'document';
  }
  return `${safeTitle} - ${safeNumber}${suffix}`;
}

export function pdfFileName(spec) {
  return `${pdfFileBase(spec)}.pdf`;
}

/** Employee code and pay period. A payslip has no slip number of its own. */
export function payslipIdentifier({ code, period } = {}) {
  return [code, period].map((part) => String(part ?? '').trim()).filter(Boolean).join(' ');
}

/**
 * Date range for a report that has no document number.
 * One day stays as that date. Two dates are written "from to to".
 */
export function reportRangeIdentifier(from, to, fallback = '') {
  const start = String(from ?? '').trim();
  const end = String(to ?? '').trim();
  if (start && end && start !== end) return `${start} to ${end}`;
  if (start || end) return start || end;
  return String(fallback ?? '').trim();
}

export function plantDateStamp(when = new Date()) {
  const date = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * One barcode keeps that code. Several different barcodes have no single
 * document number, so the identifier is the label count and the IST date.
 * Several copies of one barcode still use that barcode.
 */
export function barcodeSheetFileBase(codes, when = new Date()) {
  const list = (Array.isArray(codes) ? codes : [])
    .map((code) => String(code ?? '').trim())
    .filter(Boolean);
  const unique = [...new Set(list)];
  if (unique.length === 1) {
    return pdfFileBase({
      title: list.length === 1 ? PDF_DOCUMENT_TITLES.barcodeLabel : PDF_DOCUMENT_TITLES.barcodeLabels,
      number: unique[0],
    });
  }
  const count = list.length || unique.length;
  const stamp = plantDateStamp(when) || 'undated';
  return pdfFileBase({
    title: PDF_DOCUMENT_TITLES.barcodeLabels,
    number: count > 0 ? `${count} labels ${stamp}` : stamp,
  });
}

function fileBaseFrom(spec) {
  return typeof spec === 'string' ? spec : pdfFileBase(spec);
}

function rememberTitle(doc) {
  if (!savedTitles.has(doc)) savedTitles.set(doc, doc.title);
}

function restoreTitle(doc) {
  if (!savedTitles.has(doc)) return;
  const original = savedTitles.get(doc);
  savedTitles.delete(doc);
  doc.title = original;
}

/**
 * Set document.title to the PDF file name, print, and put the app title back
 * when the print dialog closes. The title is set before print() and is left
 * in place until afterprint. Restoring in the same turn as print() lets
 * Chrome snapshot the previous tab title instead of the file name.
 */
export function printWithPdfName(spec, options = {}) {
  const fileBase = fileBaseFrom(spec);
  const target = options.win || (typeof window !== 'undefined' ? window : undefined);
  const doc = options.doc || target?.document;
  const run = options.print || (() => target?.print?.());
  if (!doc || !target) {
    run();
    return () => {};
  }
  rememberTitle(doc);
  doc.title = fileBase;
  let settled = false;
  const restore = () => {
    if (settled) return;
    settled = true;
    target.removeEventListener?.('afterprint', restore);
    restoreTitle(doc);
  };
  target.addEventListener?.('afterprint', restore);
  const invoke = () => {
    try {
      run();
    } catch (error) {
      restore();
      throw error;
    }
  };
  if (typeof target.setTimeout === 'function') target.setTimeout(invoke, 0);
  else invoke();
  return restore;
}

/**
 * Print a react-to-print iframe under the PDF file name.
 * The promise resolves on afterprint so the frame is still available while
 * the dialog is open, and both titles are restored then.
 */
export function printFrameWithPdfName(iframe, spec) {
  const fileBase = fileBaseFrom(spec);
  const frameWindow = iframe?.contentWindow;
  const frameDoc = iframe?.contentDocument || null;
  const parentDoc = iframe?.ownerDocument || null;
  if (!frameWindow || typeof frameWindow.print !== 'function') {
    return Promise.reject(new Error('This browser cannot print the document frame.'));
  }
  const previousFrame = frameDoc ? frameDoc.title : '';
  if (parentDoc) {
    rememberTitle(parentDoc);
    parentDoc.title = fileBase;
  }
  if (frameDoc) frameDoc.title = fileBase;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      frameWindow.removeEventListener('afterprint', onAfter);
      if (frameDoc) frameDoc.title = previousFrame;
      if (parentDoc) restoreTitle(parentDoc);
      if (error) reject(error);
      else resolve();
    };
    const onAfter = () => finish();
    frameWindow.addEventListener('afterprint', onAfter);
    setTimeout(() => {
      try {
        frameWindow.focus?.();
        frameWindow.print();
      } catch (error) {
        finish(error);
      }
    }, 0);
  });
}

function isShownForPrint(node) {
  if (!node || node.hidden) return false;
  if (node.isConnected === false) return false;
  const view = node.ownerDocument?.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') return true;
  const style = view.getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/** File name of the topmost open printable document, if one is on the page. */
export function activePdfFileName(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return '';
  if (typeof doc.querySelector === 'function' && doc.querySelector('.barcode-printer-modal-root')) return '';
  const nodes = [...doc.querySelectorAll('[data-pdf-file-name]')];
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (!isShownForPrint(node)) continue;
    const name = node.getAttribute?.('data-pdf-file-name');
    if (name) return name;
  }
  return '';
}

/**
 * Ctrl/Cmd+P uses the open document's file name. Barcode stickers keep their
 * own handler, which prints an isolated frame.
 */
export function installPdfPrintTitles(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win || win.__samyakPdfPrintTitles) return;
  Object.defineProperty(win, '__samyakPdfPrintTitles', { value: true });
  win.addEventListener('keydown', (event) => {
    const key = String(event.key || '').toLowerCase();
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || key !== 'p' || event.repeat) return;
    const doc = win.document;
    if (!doc) return;
    if (typeof doc.querySelector === 'function' && doc.querySelector('.barcode-printer-modal-root')) return;
    const name = activePdfFileName(doc);
    if (!name) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    printWithPdfName(name, { win, doc });
  }, true);
}
