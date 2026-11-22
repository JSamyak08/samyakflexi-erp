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

test('Active User toggle is minimized into a compact pill on both desktop and mobile views', () => {
  const appPath = path.join(rootDir, 'src', 'App.jsx');
  const indexCssPath = path.join(rootDir, 'src', 'index.css');

  const appContent = fs.readFileSync(appPath, 'utf8');
  const cssContent = fs.readFileSync(indexCssPath, 'utf8');

  // Verify markup classes
  assert.match(appContent, /className="[^"]*app-header-user-actions[^"]*"/, 'Header user container must have app-header-user-actions class');
  assert.match(appContent, /className="[^"]*active-user-control[^"]*"/, 'Active user control must have active-user-control class');
  assert.match(appContent, /className="[^"]*active-user-prefix[^"]*"/, 'Active user prefix text must have active-user-prefix class');
  assert.match(appContent, /className="[^"]*active-user-switch-select[^"]*"/, 'SearchableSelect must have active-user-switch-select class');

  // Verify CSS minimizes the toggle on desktop and mobile
  assert.match(cssContent, /\.active-user-prefix\s*\{\s*display:\s*none\s*!important/i, 'Active user prefix must be hidden');
  assert.match(cssContent, /\.active-user-control\s*\{[\s\S]*?border-radius:\s*20px/i, 'Active user control must be rendered as a compact pill');
  assert.match(cssContent, /\.app-header-user-actions\s*\{[\s\S]*?flex-wrap:\s*nowrap/i, 'Header user actions must keep controls in a single row without wrapping on mobile');
});

test('Preloader status text does not expose provider name Supabase across platform', () => {
  const appPath = path.join(rootDir, 'src', 'App.jsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  // Verify Supabase is not in the connecting database sentence
  assert.doesNotMatch(appContent, /Connecting to Supabase Cloud Database/, 'Preloader must not expose Supabase provider name');
  assert.match(appContent, /Connecting to Cloud Database\.\.\./, 'Preloader must use generic Connecting to Cloud Database');
});

test('Raw Material Stock Ledger modal is optimized for mobile responsiveness', () => {
  const invPath = path.join(rootDir, 'src', 'components', 'InventoryManagement.jsx');
  const cssPath = path.join(rootDir, 'src', 'index.css');

  const invContent = fs.readFileSync(invPath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Verify modal layout classes
  assert.match(invContent, /className="[^"]*rm-stock-ledger-modal[^"]*"/, 'Stock ledger modal must have rm-stock-ledger-modal class');
  assert.match(invContent, /className="[^"]*rm-stock-ledger-header[^"]*"/, 'Stock ledger header must have responsive class');
  assert.match(invContent, /className="[^"]*rm-ledger-kpi-grid[^"]*"/, 'Summary KPI cards must have rm-ledger-kpi-grid class');
  assert.match(invContent, /className="[^"]*rm-ledger-adj-grid[^"]*"/, 'Quick stock adjustment form must have responsive grid class');
  assert.match(invContent, /className="[^"]*rm-ledger-toolbar[^"]*"/, 'Toolbar must have rm-ledger-toolbar class');
  assert.match(invContent, /className="[^"]*rm-ledger-subtabs[^"]*"/, 'Subtabs must have rm-ledger-subtabs class for horizontal swipe');
  assert.match(invContent, /mobile-table-scroll-hint/, 'Must include mobile scroll cue');

  // Verify CSS media queries
  assert.match(cssContent, /\.rm-stock-ledger-modal\s*\{[\s\S]*?padding:\s*16px 14px/i, 'Modal padding must be reduced on mobile');
  assert.match(cssContent, /\.rm-ledger-kpi-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*1fr\)/i, 'KPI grid must wrap into 2 columns on mobile instead of forcing 4');
  assert.match(cssContent, /\.rm-ledger-subtabs\s*\{[\s\S]*?overflow-x:\s*auto/i, 'Subtabs must enable smooth touch scrolling on mobile');
});

test('UniversalBarcodeScannerModal suppresses Open Production Record for RM barcodes and points to GRN PDF', () => {
  const modalPath = path.join(rootDir, 'src', 'components', 'UniversalBarcodeScannerModal.jsx');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  // Verify GRNPDF import and state
  assert.match(modalContent, /import GRNPDF from '\.\/GRNPDF';/, 'Must import GRNPDF component');
  assert.match(modalContent, /activeGrnPdfData/, 'Must have activeGrnPdfData state');

  // Verify RM barcode check and Inward GRN action card
  assert.match(modalContent, /isRawMaterial/, 'Must identify raw material barcodes');
  assert.match(modalContent, /rm-grn-action-card/, 'Must render Inward GRN card for raw materials');
  assert.match(modalContent, /View Inward GRN PDF/, 'Must provide button to view/print Inward GRN PDF');
  assert.match(modalContent, /<GRNPDF[\s\S]*?grnData=\{activeGrnPdfData\}/, 'Must mount GRNPDF overlay when activeGrnPdfData is set');
});

test('Side menu Scan Barcode, Revert notices, and Structure Changes are minimized into icons with closable popups', () => {
  const appPath = path.join(rootDir, 'src', 'App.jsx');
  const revertPath = path.join(rootDir, 'src', 'components', 'ConsumptionRevertNotices.jsx');
  const structurePath = path.join(rootDir, 'src', 'components', 'StructureChangeNotices.jsx');
  const cssPath = path.join(rootDir, 'src', 'index.css');

  const appContent = fs.readFileSync(appPath, 'utf8');
  const revertContent = fs.readFileSync(revertPath, 'utf8');
  const structureContent = fs.readFileSync(structurePath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Verify App.jsx quick actions container
  assert.match(appContent, /data-testid="sidebar-quick-actions"/, 'Must contain sidebar-quick-actions bar');
  assert.match(appContent, /className="sidebar-action-icon-btn sidebar-action-scan"/, 'Scan Barcode must be a compact icon button');
  assert.match(appContent, /Scan Barcode \(Alt\+B\)/, 'Scan barcode must retain Alt+B hint');

  // Verify ConsumptionRevertNotices uses icon button and ModalOverlay popup
  assert.match(revertContent, /import ModalOverlay from '\.\/ModalOverlay';/, 'Revert notices must import ModalOverlay');
  assert.match(revertContent, /className=\{`sidebar-action-icon-btn sidebar-action-revert/, 'Revert notices toggle must use compact icon button class');
  assert.match(revertContent, /className="sidebar-action-badge"/, 'Revert notices must render floating unread badge');
  assert.match(revertContent, /<ModalOverlay onClose=\{\(\) => setOpen\(false\)\}/, 'Revert notices must open a closable ModalOverlay popup');

  // Verify StructureChangeNotices uses icon button and ModalOverlay popup
  assert.match(structureContent, /import ModalOverlay from '\.\/ModalOverlay';/, 'Structure changes must import ModalOverlay');
  assert.match(structureContent, /className=\{`sidebar-action-icon-btn sidebar-action-structure/, 'Structure changes toggle must use compact icon button class');
  assert.match(structureContent, /className="sidebar-action-badge"/, 'Structure changes must render floating unread badge');
  assert.match(structureContent, /<ModalOverlay onClose=\{\(\) => setOpen\(false\)\}/, 'Structure changes must open a closable ModalOverlay popup');

  // Verify CSS styles for quick actions
  assert.match(cssContent, /\.sidebar-quick-actions\s*\{[\s\S]*?display:\s*flex/i, 'Must style quick actions container');
  assert.match(cssContent, /\.sidebar-action-icon-btn\s*\{[\s\S]*?height:\s*38px/i, 'Must define compact 38px icon buttons');
  assert.match(cssContent, /\.sidebar-action-badge\s*\{[\s\S]*?position:\s*absolute/i, 'Must define floating counter badge');
  assert.match(cssContent, /\.sidebar\.collapsed \.sidebar-quick-actions\s*\{[\s\S]*?flex-direction:\s*column/i, 'Must stack vertically in collapsed desktop rail');
});

