import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PDF_COMPANY_NAME,
  PDF_DOCUMENT_TITLES,
  activePdfFileName,
  barcodeSheetFileBase,
  installPdfPrintTitles,
  payslipIdentifier,
  pdfFileBase,
  pdfFileName,
  plantDateStamp,
  printFrameWithPdfName,
  printWithPdfName,
  reportRangeIdentifier,
  sanitizePdfFilePart,
} from '../src/utils/pdfFileName.js';

const COMPANY = 'Samyak International Ltd';

test('a numbered document uses title, number, and the company name', () => {
  assert.equal(PDF_COMPANY_NAME, COMPANY);
  assert.equal(
    pdfFileBase({ title: 'Dispatch Packing List', number: 'PL-2026-000132' }),
    'Dispatch Packing List - PL-2026-000132 - Samyak International Ltd'
  );
  assert.equal(
    pdfFileName({ title: PDF_DOCUMENT_TITLES.packingList, number: 'PL-2026-000132' }),
    'Dispatch Packing List - PL-2026-000132 - Samyak International Ltd.pdf'
  );
});

test('slashes and other characters illegal in a Windows file name become hyphens', () => {
  assert.equal(sanitizePdfFilePart('SIL/GRN/26-27/198'), 'SIL-GRN-26-27-198');
  assert.equal(
    pdfFileBase({ title: 'Goods Receipt Note', number: 'SIL/GRN/26-27/198' }),
    'Goods Receipt Note - SIL-GRN-26-27-198 - Samyak International Ltd'
  );
  assert.equal(sanitizePdfFilePart('A\\B:C*D?E"F<G>H|I'), 'A-B-C-D-E-F-G-H-I');
  assert.equal(sanitizePdfFilePart('line\nbreak'), 'line-break');
  assert.equal(sanitizePdfFilePart('SIL//GRN'), 'SIL-GRN');
  assert.equal(sanitizePdfFilePart('  PL-2026-000132. '), 'PL-2026-000132');
  assert.equal(sanitizePdfFilePart('kept-hyphens'), 'kept-hyphens');
});

test('a missing title or number is refused', () => {
  assert.throws(() => pdfFileBase({ title: '', number: 'PL-1' }), /document title/);
  assert.throws(() => pdfFileBase({ title: 'Dispatch Packing List', number: '///' }), /document number/);
});

test('a very long number keeps the company suffix inside the file name limit', () => {
  const name = pdfFileBase({ title: 'Purchase Order', number: `PO/${'X'.repeat(400)}` });
  assert.ok(name.length <= 180, name);
  assert.ok(name.endsWith(` - ${COMPANY}`), name);
  assert.ok(name.startsWith('Purchase Order - PO-'), name);
});

test('reports and payslips use an identifier when there is no document number', () => {
  assert.equal(reportRangeIdentifier('2026-11-01', '2026-11-13'), '2026-11-01 to 2026-11-13');
  assert.equal(reportRangeIdentifier('2026-11-13', '2026-11-13'), '2026-11-13');
  assert.equal(reportRangeIdentifier('', '', 'Week 2026-11-09 to 2026-11-15'), 'Week 2026-11-09 to 2026-11-15');
  assert.equal(
    pdfFileBase({
      title: PDF_DOCUMENT_TITLES.printUtilization,
      number: reportRangeIdentifier('2026-11-01', '2026-11-13'),
    }),
    'Printing Machine Run And Idle - 2026-11-01 to 2026-11-13 - Samyak International Ltd'
  );
  assert.equal(payslipIdentifier({ code: 'EMP-014', period: 'November 2026' }), 'EMP-014 November 2026');
  assert.equal(
    pdfFileName({
      title: PDF_DOCUMENT_TITLES.salaryPayslip,
      number: payslipIdentifier({ code: 'EMP/014', period: 'November 2026' }),
    }),
    'Salary Payslip - EMP-014 November 2026 - Samyak International Ltd.pdf'
  );
});

test('barcode sheets use one code, or the label count and IST date', () => {
  assert.equal(
    barcodeSheetFileBase(['RM-BC-20261029-9068NF5P']),
    'Barcode Label - RM-BC-20261029-9068NF5P - Samyak International Ltd'
  );
  assert.equal(
    barcodeSheetFileBase(['FG-1', 'FG-1', 'FG-1']),
    'Barcode Labels - FG-1 - Samyak International Ltd'
  );
  const when = new Date('2026-11-13T10:00:00+05:30');
  assert.equal(plantDateStamp(when), '2026-11-13');
  assert.equal(
    barcodeSheetFileBase(['FG-1', 'FG-2'], when),
    'Barcode Labels - 2 labels 2026-11-13 - Samyak International Ltd'
  );
});

test('print sets the file name and restores the app title when the dialog closes', () => {
  const queued = [];
  const events = {};
  const win = {
    document: { title: 'FlexiERP - Samyak International Ltd' },
    addEventListener(name, fn) { events[name] = fn; },
    removeEventListener(name) { delete events[name]; },
    setTimeout(fn) { queued.push(fn); },
  };
  const seen = [];
  const restore = printWithPdfName(
    { title: 'Dispatch Packing List', number: 'PL-2026-000132' },
    {
      win,
      print() { seen.push(win.document.title); },
    }
  );
  assert.equal(seen.length, 0);
  assert.equal(win.document.title, 'Dispatch Packing List - PL-2026-000132 - Samyak International Ltd');
  queued[0]();
  assert.deepEqual(seen, ['Dispatch Packing List - PL-2026-000132 - Samyak International Ltd']);
  events.afterprint();
  assert.equal(win.document.title, 'FlexiERP - Samyak International Ltd');
  restore();
  assert.equal(win.document.title, 'FlexiERP - Samyak International Ltd');
});

test('a failed print puts the app title back immediately', () => {
  const win = {
    document: { title: 'FlexiERP - Samyak International Ltd' },
    addEventListener() {},
    removeEventListener() {},
    setTimeout(fn) { fn(); },
  };
  assert.throws(() => printWithPdfName('Dispatch Packing List - PL-1 - Samyak International Ltd', {
    win,
    print() { throw new Error('blocked'); },
  }), /blocked/);
  assert.equal(win.document.title, 'FlexiERP - Samyak International Ltd');
});

test('an iframe print keeps the file name until its dialog closes', async () => {
  const events = {};
  const parent = { title: 'FlexiERP - Samyak International Ltd' };
  const frameDoc = { title: '' };
  const frameWindow = {
    focus() {},
    print() {
      this.printedTitle = frameDoc.title;
      this.parentTitle = parent.title;
    },
    addEventListener(name, fn) { events[name] = fn; },
    removeEventListener(name) { delete events[name]; },
  };
  const pending = printFrameWithPdfName({
    contentWindow: frameWindow,
    contentDocument: frameDoc,
    ownerDocument: parent,
  }, { title: 'Cylinder Job Card', number: 'JM/2026/014' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(frameWindow.printedTitle, 'Cylinder Job Card - JM-2026-014 - Samyak International Ltd');
  assert.equal(parent.title, frameWindow.printedTitle);
  events.afterprint();
  await pending;
  assert.equal(parent.title, 'FlexiERP - Samyak International Ltd');
  assert.equal(frameDoc.title, '');
});

test('Ctrl+P prints the open document name and leaves barcode stickers alone', () => {
  const node = {
    isConnected: true,
    hidden: false,
    getAttribute(name) {
      return name === 'data-pdf-file-name'
        ? 'Delivery Challan - DC-2026-0009 - Samyak International Ltd'
        : '';
    },
  };
  const events = {};
  const queued = [];
  const win = {
    document: {
      title: 'FlexiERP - Samyak International Ltd',
      querySelector() { return null; },
      querySelectorAll() { return [node]; },
    },
    addEventListener(name, fn) { events[name] = fn; },
    removeEventListener() {},
    setTimeout(fn) { queued.push(fn); },
    print() { this.printed = this.document.title; },
  };
  installPdfPrintTitles(win);
  const event = {
    key: 'p',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  events.keydown(event);
  assert.equal(event.prevented, true);
  assert.equal(win.document.title, 'Delivery Challan - DC-2026-0009 - Samyak International Ltd');
  queued[0]();
  assert.equal(win.printed, win.document.title);

  const barcodeWin = {
    document: {
      title: 'FlexiERP - Samyak International Ltd',
      querySelector(selector) { return selector === '.barcode-printer-modal-root' ? {} : null; },
      querySelectorAll() { return [node]; },
    },
    addEventListener(name, fn) { this.listener = fn; },
  };
  installPdfPrintTitles(barcodeWin);
  const barcodeEvent = {
    key: 'p',
    ctrlKey: true,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  barcodeWin.listener(barcodeEvent);
  assert.equal(barcodeEvent.prevented, undefined);
  assert.equal(barcodeWin.document.title, 'FlexiERP - Samyak International Ltd');
  assert.equal(activePdfFileName(barcodeWin.document), '');
});
