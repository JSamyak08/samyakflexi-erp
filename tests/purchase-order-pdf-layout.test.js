import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSyncQrSvg } from '../src/utils/qrCodeSvg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('PO QR Code generates a valid, non-empty SVG data URI for immediate, failure-free printing', () => {
  const poNum = 'SIL/PO/26-27/250';
  const qrValue = `SAMYAK-ERP-PO:${poNum}`;
  const svgMarkup = generateSyncQrSvg(qrValue, 0);

  assert.ok(svgMarkup && svgMarkup.length > 500, 'SVG markup should be generated');
  assert.ok(svgMarkup.includes('<svg'), 'Markup must contain <svg');
  assert.ok(svgMarkup.includes('viewBox="0 0'), 'SVG must have a viewBox');
  assert.ok(svgMarkup.includes('<rect'), 'SVG must contain QR modules');

  const qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svgMarkup)}`;
  assert.ok(qrDataUrl.startsWith('data:image/svg+xml;utf8,'), 'Data URL must be valid svg data uri');
});

test('PurchaseOrderPDF line items column allocation sums to exactly 100%', () => {
  const poPdfFile = path.resolve(__dirname, '../src/components/PurchaseOrderPDF.jsx');
  const content = fs.readFileSync(poPdfFile, 'utf8');

  // Extract all width percentages from the thead in po-items-table
  const theadMatch = content.match(/<table className="po-items-table">[\s\S]*?<thead>([\s\S]*?)<\/thead>/);
  assert.ok(theadMatch, 'po-items-table thead must exist');

  const widths = [];
  const thRegex = /width:\s*'([\d.]+)%'/g;
  let match;
  while ((match = thRegex.exec(theadMatch[1])) !== null) {
    widths.push(parseFloat(match[1]));
  }

  assert.equal(widths.length, 9, 'Items table must have 9 columns (#, desc, hsn, qty, rate, taxable, cgst, sgst, total)');
  const sum = widths.reduce((acc, w) => acc + w, 0);
  assert.equal(Math.round(sum * 10) / 10, 100, `Column widths must sum to 100%, got ${sum}%`);

  // Verify Line Total has at least 12% to prevent currency text overflow
  assert.ok(widths[8] >= 12, `Line Total width must be at least 12% to fit ₹2,21,427.00, got ${widths[8]}%`);
  // Verify CGST & SGST have at least 10% each
  assert.ok(widths[6] >= 10, `CGST width must be at least 10%, got ${widths[6]}%`);
  assert.ok(widths[7] >= 10, `SGST width must be at least 10%, got ${widths[7]}%`);
});

test('purchaseOrderPrint.css guarantees table-layout: fixed and prevents number overflow', () => {
  const cssFile = path.resolve(__dirname, '../src/components/purchaseOrderPrint.css');
  const css = fs.readFileSync(cssFile, 'utf8');

  // Table layout must be fixed
  assert.ok(css.includes('#printable-po .po-items-table'), 'Must style .po-items-table');
  assert.ok(css.includes('table-layout: fixed !important'), 'po-items-table must be table-layout: fixed');

  // Strict numeric cell styling
  assert.ok(css.includes('font-variant-numeric: tabular-nums !important'), 'Numbers must be tabular-nums');
  assert.ok(css.includes('overflow: hidden !important'), 'Numeric cells must prevent overflow');

  // QR image styling for both screen and print
  assert.ok(css.includes('#printable-po .po-qr-box .po-qr-img') || css.includes('#printable-po .po-qr-img'), 'QR image must be explicitly styled');
  assert.ok(css.includes('width: 42px !important') || css.includes('width: 44px !important'), 'QR image must have explicit width');
  assert.ok(css.includes('height: 42px !important') || css.includes('height: 44px !important'), 'QR image must have explicit height');

  // Summary grid units must not exceed 100%
  assert.ok(css.includes('grid-template-columns: 1.15fr 1fr !important'), 'Summary grid must use fr units to prevent width overflow with gap');

  // Print rules must reveal static terms and hide no-print
  assert.ok(css.includes('@media print'), 'Must include @media print');
  assert.ok(css.includes('#printable-po .po-print-term'), 'Must style .po-print-term');
  assert.ok(css.includes('display: block !important'), '.po-print-term must be display: block in print');
});

test('PurchaseOrderPDF Terms & Conditions uses flexbox without input overflow', () => {
  const poPdfFile = path.resolve(__dirname, '../src/components/PurchaseOrderPDF.jsx');
  const content = fs.readFileSync(poPdfFile, 'utf8');

  // Ensure textarea has minWidth: 0 to prevent flexbox child overflow
  assert.ok(content.includes('minWidth: 0'), 'Terms input/textarea must set minWidth: 0 in flex container');
  // Ensure static print term exists
  assert.ok(content.includes('className="po-print-term"'), 'Terms must have po-print-term for clean multiline wrapping in print');
});
