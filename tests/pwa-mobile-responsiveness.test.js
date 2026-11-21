import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('JobPunchingForm uses responsive split layout and structured layer card rows', () => {
  const formPath = path.join(rootDir, 'src', 'components', 'JobPunchingForm.jsx');
  assert.ok(fs.existsSync(formPath), 'JobPunchingForm.jsx must exist');

  const content = fs.readFileSync(formPath, 'utf8');

  // Verify responsive classes are applied instead of inline fixed desktop columns
  assert.match(content, /className="job-punching-split-layout"/, 'Main split layout must use responsive CSS class');
  assert.doesNotMatch(content, /style=\{\{\s*display:\s*['"]grid['"],\s*gridTemplateColumns:\s*['"]minmax\(320px,\s*1fr\)\s*420px['"]/, 'Must not force hardcoded 420px column inline');

  // Verify substrate layer row structure
  assert.match(content, /className="layer-row-card"/, 'Layers must have layer-row-card class');
  assert.match(content, /className="layer-row-top-bar"/, 'Layers must have top bar container for mobile stacking');
  assert.match(content, /className="layer-row-inputs-grid"/, 'Layers must have responsive inputs grid');
  assert.match(content, /className="job-punching-form-grid-2"/, 'Processing chemical rates must use responsive 2-column class');
});

test('UniversalBarcodeScannerModal contains responsive mobile header and wrapping search form', () => {
  const modalPath = path.join(rootDir, 'src', 'components', 'UniversalBarcodeScannerModal.jsx');
  assert.ok(fs.existsSync(modalPath), 'UniversalBarcodeScannerModal.jsx must exist');

  const content = fs.readFileSync(modalPath, 'utf8');

  // Verify header has flexWrap and non-collapsing badge
  assert.match(content, /flexWrap:\s*['"]wrap['"]/, 'Header title area must allow wrapping on mobile screens');
  assert.match(content, /whiteSpace:\s*['"]nowrap['"]/, 'Read-only check badge must prevent awkward letter wrapping');
  assert.match(content, /className="barcode-scanner-form"/, 'Search and camera bar must use responsive form class');
  assert.match(content, /className="barcode-search-input-wrap"/, 'Input wrap must be present');
  assert.match(content, /className="barcode-scanner-actions"/, 'Action buttons must be grouped for responsive stacking');
});

test('OrderConfirmationPDF and pdfA4.css prevent vertical single-letter word wrapping and enable mobile document pan', () => {
  const pdfPath = path.join(rootDir, 'src', 'components', 'OrderConfirmationPDF.jsx');
  const cssPath = path.join(rootDir, 'src', 'pdfA4.css');
  const indexCssPath = path.join(rootDir, 'src', 'index.css');

  assert.ok(fs.existsSync(pdfPath), 'OrderConfirmationPDF.jsx must exist');
  assert.ok(fs.existsSync(cssPath), 'pdfA4.css must exist');

  const pdfContent = fs.readFileSync(pdfPath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const indexCssContent = fs.readFileSync(indexCssPath, 'utf8');

  // Verify mobile scroll hint exists
  assert.match(pdfContent, /mobile-table-scroll-hint/, 'OrderConfirmationPDF must provide document pan/swipe cue');

  // Verify responsive CSS prevents word-value single-letter vertical break
  assert.match(cssContent, /@media screen and \(max-width:\s*768px\)/, 'pdfA4.css must have mobile screen media query');
  assert.match(cssContent, /totals-and-words-grid[\s\S]*?flex-direction:\s*column/, 'totals and words must stack vertically on mobile');
  assert.match(cssContent, /word-value[\s\S]*?word-break:\s*normal/, 'word-value must keep words together on mobile screens');

  // Verify index.css has mobile pdf-modal-overlay rules
  assert.match(indexCssContent, /\.pdf-modal-overlay[\s\S]*?overflow-x:\s*auto/, 'pdf modal must allow horizontal pan on mobile devices');
});

test('SalesManagement provides mobile table hints and responsive custom term inputs', () => {
  const salesPath = path.join(rootDir, 'src', 'components', 'SalesManagement.jsx');
  assert.ok(fs.existsSync(salesPath), 'SalesManagement.jsx must exist');

  const content = fs.readFileSync(salesPath, 'utf8');

  // Verify table scroll hint and touch scroll
  assert.match(content, /mobile-table-scroll-hint/, 'SalesManagement must include mobile table scroll cue');
  assert.match(content, /WebkitOverflowScrolling:\s*['"]touch['"]/, 'Must use native smooth touch scrolling');
});
