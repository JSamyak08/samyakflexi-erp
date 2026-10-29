import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

test('BarcodePrinterModal print formatting and no-print classes', () => {
  const modalContent = fs.readFileSync('src/components/BarcodePrinterModal.jsx', 'utf-8');
  const indexCss = fs.readFileSync('src/index.css', 'utf-8');
  const qrCodeContent = fs.readFileSync('src/components/QRCode2D.jsx', 'utf-8');

  // Verify modal-content has no-print to prevent overlapping on print media
  assert.ok(
    modalContent.includes('className="glass-card modal-content no-print"'),
    'modal-content must have no-print class to hide on-screen preview during printing'
  );

  // Verify printable-barcode-container is hidden on screen media
  assert.ok(
    modalContent.includes('.printable-barcode-container {\n            display: none !important;\n          }'),
    'printable-barcode-container must be hidden on screen media'
  );

  // Verify label sections have flexShrink: 0 to prevent vertical text squishing/collapse
  assert.ok(
    modalContent.includes('flexShrink: 0'),
    'Label sections must have flexShrink: 0'
  );

  // Verify QRCode2D renders synchronously to prevent blank QR code during instant print
  assert.ok(
    qrCodeContent.includes('generateSyncQrSvg'),
    'QRCode2D must have generateSyncQrSvg for immediate synchronous rendering'
  );

  // Verify index.css allows .printable-barcode-container
  assert.ok(
    indexCss.includes('.printable-barcode-container'),
    'index.css print media must unhide .printable-barcode-container'
  );
});

