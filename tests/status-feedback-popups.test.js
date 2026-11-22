import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('SuccessModalContext exports global helpers for both success and error popups', () => {
  const contextPath = path.join(rootDir, 'src', 'context', 'SuccessModalContext.jsx');
  assert.ok(fs.existsSync(contextPath), 'SuccessModalContext.jsx must exist');
  const content = fs.readFileSync(contextPath, 'utf8');

  assert.match(content, /export function showSuccessScreen/, 'Must export showSuccessScreen');
  assert.match(content, /export function showErrorScreen/, 'Must export showErrorScreen');
  assert.match(content, /export const showFailureScreen\s*=\s*showErrorScreen/, 'Must export showFailureScreen');
  assert.match(content, /export const showSuccessFeedback\s*=\s*showSuccessScreen/, 'Must export showSuccessFeedback');
  assert.match(content, /export const showErrorFeedback\s*=\s*showErrorScreen/, 'Must export showErrorFeedback');
  assert.match(content, /SUCCESS_EVENT_NAME\s*=\s*['"]app:show-success-screen['"]/, 'Must define SUCCESS_EVENT_NAME');
  assert.match(content, /ERROR_EVENT_NAME\s*=\s*['"]app:show-error-screen['"]/, 'Must define ERROR_EVENT_NAME');
});

test('SuccessScreenModal renders animated tick for success and animated cross for failure with database sync verification', () => {
  const modalPath = path.join(rootDir, 'src', 'components', 'SuccessScreenModal.jsx');
  const cssPath = path.join(rootDir, 'src', 'index.css');

  assert.ok(fs.existsSync(modalPath), 'SuccessScreenModal.jsx must exist');
  const modalContent = fs.readFileSync(modalPath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Verify animated checkmark tick SVG structure
  assert.match(modalContent, /data-testid="status-feedback-tick"/, 'Must render animated tick container for success');
  assert.match(modalContent, /className="status-checkmark-svg"/, 'Must render checkmark SVG');
  assert.match(modalContent, /className="status-checkmark-circle"/, 'Must render checkmark circle with dash stroke');
  assert.match(modalContent, /className="status-checkmark-check"/, 'Must render animated check stroke');

  // Verify animated error cross SVG structure
  assert.match(modalContent, /data-testid="status-feedback-error"/, 'Must render animated error cross container for error');
  assert.match(modalContent, /className="status-error-svg"/, 'Must render error cross SVG');
  assert.match(modalContent, /className="status-error-cross1"/, 'Must render animated error cross stroke 1');
  assert.match(modalContent, /className="status-error-cross2"/, 'Must render animated error cross stroke 2');

  // Verify database status pill
  assert.match(modalContent, /status-db-pill/, 'Must render database status pill');
  assert.match(modalContent, /Committed to Cloud Database & Synced/, 'Must confirm data is committed to cloud database');
  assert.match(modalContent, /Database Save Failed \/ Uncommitted/, 'Must indicate failure when database save failed');

  // Verify CSS keyframe animations for the tick
  assert.match(cssContent, /@keyframes statusStrokeCircle/, 'CSS must define circle stroke draw keyframe');
  assert.match(cssContent, /@keyframes statusStrokeCheck/, 'CSS must define checkmark stroke draw keyframe');
  assert.match(cssContent, /@keyframes statusIconPop/, 'CSS must define icon pop scale keyframe');
  assert.match(cssContent, /@keyframes statusErrorShake/, 'CSS must define error shake keyframe');
  assert.match(cssContent, /\.status-checkmark-check\s*\{[\s\S]*?stroke-dashoffset:\s*48/i, 'Check stroke must use dashoffset for drawing animation');
});

test('JobPunchingForm displays animated success popup with Job Punched Successfully! and handles failure', () => {
  const formPath = path.join(rootDir, 'src', 'components', 'JobPunchingForm.jsx');
  const formContent = fs.readFileSync(formPath, 'utf8');

  // Verify import
  assert.match(formContent, /import\s*\{[^}]*showSuccessScreen[^}]*\}\s*from\s*['"]\.\.\/context\/SuccessModalContext['"]/, 'Must import showSuccessScreen');
  assert.match(formContent, /import\s*\{[^}]*showErrorScreen[^}]*\}\s*from\s*['"]\.\.\/context\/SuccessModalContext['"]/, 'Must import showErrorScreen');

  // Verify success screen invocation
  assert.match(formContent, /showSuccessScreen\(\{[\s\S]*?title:\s*['"`]Job Punched Successfully!['"`]/, 'Must show Job Punched Successfully! title');
  assert.match(formContent, /primaryActionText:\s*['"`]View Order Confirmation Note \(PDF\)['"`]/, 'Must provide primary button to view OCN PDF');
  assert.match(formContent, /onPrimaryAction:\s*\(\)\s*=>\s*setShowPDFModal\(true\)/, 'Primary action must open PDF modal');

  // Verify failure screen invocation
  assert.match(formContent, /showErrorScreen\(\{[\s\S]*?title:\s*['"`]Job Punching Failed['"`]/, 'Must show error screen on database save failure');
});

test('PurchaseOrderManagement uses animated feedback for PO creation, amendments, and Inward GRN', () => {
  const poPath = path.join(rootDir, 'src', 'components', 'PurchaseOrderManagement.jsx');
  const poContent = fs.readFileSync(poPath, 'utf8');

  assert.match(poContent, /import\s*\{[^}]*showSuccessScreen[^}]*\}\s*from\s*['"]\.\.\/context\/SuccessModalContext['"]/, 'Must import showSuccessScreen');
  assert.match(poContent, /showSuccessScreen\(\{[\s\S]*?title:\s*['"`]Purchase Order Created Successfully!['"`]/, 'Must trigger PO Created feedback');
  assert.match(poContent, /showSuccessScreen\(\{[\s\S]*?title:\s*['"`]Purchase Order Amended Successfully!['"`]/, 'Must trigger PO Amended feedback');
  assert.match(poContent, /showSuccessScreen\(\{[\s\S]*?Inward GRN #/, 'Must trigger Inward GRN feedback');
  assert.match(poContent, /showErrorScreen\(\{[\s\S]*?title:\s*['"`]Failed to Save Purchase Order['"`]/, 'Must trigger error feedback on PO failure');
});

test('SalesManagement uses animated feedback for sales quotations and OCN conversion', () => {
  const salesPath = path.join(rootDir, 'src', 'components', 'SalesManagement.jsx');
  const salesContent = fs.readFileSync(salesPath, 'utf8');

  assert.match(salesContent, /import\s*\{[^}]*showSuccessScreen[^}]*\}\s*from\s*['"]\.\.\/context\/SuccessModalContext['"]/, 'Must import showSuccessScreen');
  assert.match(salesContent, /showSuccessScreen\(\{[\s\S]*?Saved Successfully!['"`]/, 'Must trigger Quotation Saved feedback');
  assert.match(salesContent, /showSuccessScreen\(\{[\s\S]*?Quotation Converted to OCN Successfully!['"`]/, 'Must trigger OCN conversion feedback');
  assert.match(salesContent, /showErrorScreen\(\{[\s\S]*?Failed to Save Sales Quotation['"`]/, 'Must trigger error feedback on quotation failure');
});

test('DispatchManagement uses animated feedback for delivery challans, CoA, and packing lists', () => {
  const dispatchPath = path.join(rootDir, 'src', 'components', 'DispatchManagement.jsx');
  const dispatchContent = fs.readFileSync(dispatchPath, 'utf8');

  assert.match(dispatchContent, /import\s*\{[^}]*showSuccessScreen[^}]*\}\s*from\s*['"]\.\.\/context\/SuccessModalContext['"]/, 'Must import showSuccessScreen');
  assert.match(dispatchContent, /showSuccessScreen\(\{[\s\S]*?Delivery Challan[\s\S]*?Issued Successfully!['"`]/, 'Must trigger Delivery Challan feedback');
  assert.match(dispatchContent, /showSuccessScreen\(\{[\s\S]*?Quality Test Report \(CoA\) Generated Successfully!['"`]/, 'Must trigger CoA feedback');
  assert.match(dispatchContent, /showSuccessScreen\(\{[\s\S]*?Packing List[\s\S]*?Created Successfully!['"`]/, 'Must trigger Packing List feedback');
  assert.match(dispatchContent, /showErrorScreen\(\{[\s\S]*?Failed to Save Delivery Challan['"`]/, 'Must trigger error feedback on challan failure');
});

test('ProductionRecordManagement and Master entities use animated feedback upon submit', () => {
  const prodPath = path.join(rootDir, 'src', 'components', 'ProductionRecordManagement.jsx');
  const clientPath = path.join(rootDir, 'src', 'components', 'ClientManagement.jsx');
  const vendorPath = path.join(rootDir, 'src', 'components', 'VendorManagement.jsx');
  const jmPath = path.join(rootDir, 'src', 'components', 'JobMasterDirectory.jsx');

  const prodContent = fs.readFileSync(prodPath, 'utf8');
  const clientContent = fs.readFileSync(clientPath, 'utf8');
  const vendorContent = fs.readFileSync(vendorPath, 'utf8');
  const jmContent = fs.readFileSync(jmPath, 'utf8');

  assert.match(prodContent, /showSuccessScreen\(\{[\s\S]*?Production Record Saved Successfully!['"`]/, 'Production record must trigger success feedback');
  assert.match(clientContent, /showSuccessScreen\(\{[\s\S]*?Client[\s\S]*?Successfully!['"`]/, 'Client save must trigger success feedback');
  assert.match(vendorContent, /showSuccessScreen\(\{[\s\S]*?Vendor[\s\S]*?Successfully!['"`]/, 'Vendor save must trigger success feedback');
  assert.match(jmContent, /showSuccessScreen\(\{[\s\S]*?Job Master[\s\S]*?Successfully!['"`]/, 'Job Master save must trigger success feedback');
});
