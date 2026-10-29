import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import {
  resolveItemPurchaseRate,
  getStickerCategoryInfo,
  generateSingleStickerHtml,
  generateThermalLabelsHtml,
  printThermalBarcodeLabels
} from '../src/utils/thermalBarcodePrinter.js';
import { generateSyncQrSvg } from '../src/utils/qrCodeSvg.js';

test('Thermal Barcode Printer Isolated Engine and Styling', () => {
  const modalContent = fs.readFileSync('src/components/BarcodePrinterModal.jsx', 'utf-8');
  const indexCss = fs.readFileSync('src/index.css', 'utf-8');
  const pdfA4Css = fs.readFileSync('src/pdfA4.css', 'utf-8');

  // 1. Verify modal-content has no-print to hide on-screen preview if main page is printed
  assert.ok(
    modalContent.includes('className="glass-card modal-content no-print"'),
    'modal-content must have no-print class'
  );

  // 2. Verify modal print style hides overlay and modal content on main window print
  assert.ok(
    modalContent.includes('.barcode-printer-modal-root,\n          .modal-overlay,\n          .modal-content,\n          .no-print {\n            display: none !important;'),
    'BarcodePrinterModal must shield the main window from printing modal DOM elements'
  );

  // 3. Verify modal uses printThermalBarcodeLabels for isolated iframe printing
  assert.ok(
    modalContent.includes('printThermalBarcodeLabels'),
    'BarcodePrinterModal must use printThermalBarcodeLabels'
  );

  // 4. Verify pdfA4.css does not force modal-content to be visible via printable-barcode-container
  assert.ok(
    !pdfA4Css.includes('div:has(.printable-barcode-container)'),
    'pdfA4.css must not force modal-content visible via div:has(.printable-barcode-container)'
  );

  // 5. Test QR code SVG generator
  const qrSvg = generateSyncQrSvg('RM-BC-20261029-9068NF5P', 1);
  assert.ok(qrSvg.includes('<svg'), 'QR SVG must produce valid svg');
  assert.ok(qrSvg.includes('shape-rendering="crispEdges"'), 'QR SVG must use crispEdges');
  assert.ok(qrSvg.includes('<rect width='), 'QR SVG must include background rect');

  // 6. Test item rate resolution and category categorization
  const testRoll = {
    barcodeId: 'RM-BC-20261029-9068NF5P',
    itemName: 'BOPP Film 15mic',
    micron: '15',
    widthMm: '410',
    rollType: 'RAW_MATERIAL',
    category: 'Film Substrates',
    netWeightKg: 26.9,
    grossWeightKg: 27.4,
    tareWeightKg: 0.5,
    lengthMeters: 3895,
    vendorName: 'Samyak International Ltd',
    batchNo: '20261029-3699NF8E',
    purchaseRatePerKg: 184
  };

  const rate = resolveItemPurchaseRate(testRoll);
  assert.equal(rate, 184, 'Should resolve direct purchase rate');

  const catInfo = getStickerCategoryInfo(testRoll);
  assert.equal(catInfo.isFilmItem, true, 'Should classify as film item');
  assert.equal(catInfo.tagLabel, 'RAW MATERIAL (RM)', 'Tag label should be RAW MATERIAL (RM)');
  assert.equal(catInfo.displayQty, 26.9, 'Display qty should be 26.9');
  assert.equal(catInfo.displayUnit, 'Kg', 'Display unit should be Kg');

  // 7. Test single sticker HTML generation with complete GSTIN and factory address
  const singleHtml = generateSingleStickerHtml(testRoll, {
    name: 'SAMYAK INTERNATIONAL LTD.',
    address: '11-B, Kheda Industrial Area, Pithampur Sector - III, Dist. Dhar, Dhar (Madhya Pradesh- 23), India - 454775',
    placeOfSupply: 'Dhar, Madhya Pradesh (23)',
    gstin: '23AABCM3526F1ZY'
  });

  assert.ok(singleHtml.includes('SAMYAK INTERNATIONAL LTD.'), 'HTML must include company name');
  assert.ok(singleHtml.includes('23AABCM3526F1ZY'), 'HTML must include GSTIN');
  assert.ok(singleHtml.includes('company-gstin'), 'HTML must include company-gstin container');
  assert.ok(singleHtml.includes('11-B, Kheda Industrial Area'), 'HTML must include factory address');
  assert.ok(singleHtml.includes('company-address'), 'HTML must include company-address container');
  assert.ok(singleHtml.includes('RM-BC-20261029-9068NF5P'), 'HTML must include barcode ID');
  assert.ok(singleHtml.includes('26.9'), 'HTML must include net weight');
  assert.ok(singleHtml.includes('thermal-label-sheet'), 'HTML must include thermal-label-sheet class');
  assert.ok(singleHtml.includes('thermal-label-card'), 'HTML must include thermal-label-card class');

  // 8. Test multi-page thermal labels HTML document
  const multiHtml = generateThermalLabelsHtml([testRoll, { ...testRoll, barcodeId: 'RM-BC-20261029-9068NF5Q' }], {
    name: 'SAMYAK INTERNATIONAL LTD.'
  });

  assert.ok(multiHtml.includes('@page {\n      size: 4in 4in;\n      margin: 0;\n    }'), 'Must specify 4x4 inch page size with 0 margin');
  assert.ok(multiHtml.includes('page-break-after: always;'), 'Must page-break between multiple stickers');
  assert.ok(multiHtml.includes('page-break-after: avoid;'), 'Last sticker must avoid page-break');
  assert.ok(multiHtml.includes('RM-BC-20261029-9068NF5P') && multiHtml.includes('RM-BC-20261029-9068NF5Q'), 'Must contain both stickers');
});
