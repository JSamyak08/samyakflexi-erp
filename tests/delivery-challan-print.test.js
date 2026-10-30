import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  settleChallanImages,
  imageHasPainted,
  CHALLAN_LOGO_FALLBACK,
} from '../src/utils/printDeliveryChallan.js';

const pdfA4 = fs.readFileSync(new URL('../src/pdfA4.css', import.meta.url), 'utf8');
const challanCss = fs.readFileSync(new URL('../src/components/deliveryChallanPrint.css', import.meta.url), 'utf8');
const challanJsx = fs.readFileSync(new URL('../src/components/DeliveryChallanPDF.jsx', import.meta.url), 'utf8');
const printJs = fs.readFileSync(new URL('../src/utils/printDeliveryChallan.js', import.meta.url), 'utf8');

test('print ancestor reset does not share a selector list with :has()', () => {
  const marker = pdfA4.indexOf('#root,');
  assert.ok(marker > 0, 'ancestor reset is present');
  const block = pdfA4.slice(marker, pdfA4.indexOf('}', marker));
  assert.equal(block.includes(':has('), false);
  assert.ok(block.includes('.pdf-paper-container'));
  assert.ok(block.includes('.pdf-modal-overlay'));
  assert.ok(pdfA4.includes('div:has(.printable-document)'));
  assert.equal(pdfA4.includes('div:has(.printable-barcode-container)'), false);
});

test('delivery challan print styles are scoped and fill an A4 sheet', () => {
  assert.ok(challanJsx.includes('id="printable-dc"'));
  assert.ok(challanJsx.includes('className="dc-summary"'));
  assert.ok(challanJsx.includes('printDeliveryChallan'));
  assert.equal(challanJsx.includes('localStorage'), false);
  assert.equal(printJs.includes('localStorage'), false);
  assert.equal(challanCss.includes('#printable-po'), false);
  assert.equal(challanCss.includes('#printable-ocn'), false);
  assert.ok(challanCss.includes('#printable-dc .dc-summary'));
  assert.ok(challanCss.includes('grid-template-columns: minmax(0, 1fr) minmax(68mm, 78mm)'));
  assert.ok(challanCss.includes('max-width: none !important'));
  assert.ok(challanCss.includes('min-height: 250mm'));
  assert.ok(challanCss.includes('font-size: 18pt !important'));
  assert.ok(challanCss.includes('margin-top: auto !important'));
});

test('a failed or private logo is replaced before print instead of hanging', async () => {
  const broken = fakeImage('https://example.supabase.co/storage/v1/object/public/erp-files/logo.png', {
    complete: true,
    naturalWidth: 0,
  });
  const root = { querySelectorAll: () => [broken] };
  await settleChallanImages(root, { timeoutMs: 30, fallbackSrc: CHALLAN_LOGO_FALLBACK });
  assert.equal(broken.dataset.dcFallback, '1');
  assert.equal(imageHasPainted(broken), false);
  assert.ok(broken.src.startsWith('data:image/gif'), broken.src);
});

test('a logo that paints is left alone', async () => {
  const ok = fakeImage('/samyak-logo.png', { complete: true, naturalWidth: 40 });
  const root = { querySelectorAll: () => [ok] };
  await settleChallanImages(root, { timeoutMs: 30 });
  assert.equal(ok.src, '/samyak-logo.png');
  assert.equal(ok.dataset.dcFallback, undefined);
});

function fakeImage(src, { complete, naturalWidth }) {
  return {
    src,
    currentSrc: src,
    complete,
    naturalWidth,
    dataset: {},
    addEventListener() {},
  };
}
