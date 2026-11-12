import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  buildPackingListPrintModel,
  formatPackingKg,
  printableScale,
  printableText,
} from '../src/utils/packingListPrint.js';

const pdfSource = fs.readFileSync(new URL('../src/components/DispatchPackingListPDF.jsx', import.meta.url), 'utf8');
const printCss = fs.readFileSync(new URL('../src/components/packingListPrint.css', import.meta.url), 'utf8');
const sharedPrintCss = fs.readFileSync(new URL('../src/pdfA4.css', import.meta.url), 'utf8');

const shipment = {
  dispatchId: 'PL-2026-006137',
  invoiceNo: 'SAM/26-27/000030',
  dispatchDate: '2026-11-10T14:03:00.000Z',
  clientName: 'Skygo Polymers Private Limited',
  orderId: 'ORD-2026-235',
  poNo: 'PO-88',
  vehicleNo: 'MP09 AB 1234',
  lrNo: 'LR-19',
  transporterName: 'Samyak',
  weighingScaleStation: 'Scale #4 - Dispatch Section',
  jobName: 'Masti Atta 5 Kg',
  items: [
    {
      rollNo: 1,
      barcodeId: 'FG-DISP-33556-1',
      substrateSpec: 'CCPET 12μ / MGP 90μ',
      tareWeightKg: 2.2,
      coreSize: '3 Inch',
      grossWeightKg: 53.2,
      netWeightKg: 51,
      unit: 'Kg',
    },
    {
      rollNo: 2,
      barcodeId: 'FG-DISP-33557-2',
      substrateSpec: 'Flexible Laminate',
      netWeightKg: 40,
      unit: 'Kg',
    },
  ],
};

test('packing list print keeps real rows and drops form fillers', () => {
  const model = buildPackingListPrintModel(shipment);
  assert.equal(model.docNo, 'PL-2026-006137');
  assert.equal(model.customer.name, 'Skygo Polymers Private Limited');
  assert.equal(model.customer.orderId, 'ORD-2026-235');
  assert.equal(model.logistics.invoice, 'SAM/26-27/000030');
  assert.equal(model.logistics.vehicle, 'MP09 AB 1234');
  assert.equal(model.logistics.scale, 'Scale #4 - Dispatch Section');
  assert.equal(model.jobName, 'Masti Atta 5 Kg');
  assert.equal(model.lines[0].substrate, 'CCPET 12μ / MGP 90μ');
  assert.equal(model.lines[0].tare, 2.2);
  assert.equal(formatPackingKg(model.lines[0].net), '51.0');
  assert.equal(model.lines[1].substrate, '');
  assert.equal(model.lines[1].tare, null);
  assert.equal(model.lines[1].gross, null);
  assert.equal(model.totals.tare, 2.2);
  assert.equal(model.totals.net, 91);
  assert.ok(model.when);
});

test('missing fields stay blank instead of sample copy, dashes, or a 4.5 kg core', () => {
  const model = buildPackingListPrintModel({
    dispatchId: 'PL-EMPTY',
    orderId: 'N/A',
    vehicleNo: '-',
    lrNo: '—',
    invoiceNo: '',
    jobName: 'Finished Goods Job',
    clientName: 'N/A',
    items: [
      {
        barcodeId: 'FG-1',
        substrateSpec: 'Laminated Film / Pouch',
        stationId: 'Dispatch Main Dock',
      },
    ],
  });
  assert.equal(model.customer.name, '');
  assert.equal(model.customer.orderId, '');
  assert.equal(model.customer.address, 'Not Available');
  assert.equal(model.customer.email, 'Not Available');
  assert.equal(model.customer.mobile, 'Not Available');
  assert.equal(model.customer.gstin, 'Not Available');
  assert.equal(model.jobName, '');
  assert.equal(model.when, '');
  assert.equal(model.logistics.vehicle, '');
  assert.equal(model.logistics.lr, '');
  assert.equal(model.logistics.invoice, '');
  assert.equal(model.logistics.scale, '');
  assert.equal(model.lines[0].substrate, '');
  assert.equal(model.lines[0].tare, null);
  assert.equal(model.totals.tare, null);
  assert.equal(model.rollCount, 1);
  assert.equal(printableText('N/A'), '');
  assert.equal(printableScale({ stationId: 'Dispatch Main Dock' }), '');
});

test('the packing list sheet uses the shared letterhead and printable boxes', async () => {
  const server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
  });
  let html = '';
  try {
    const mod = await server.ssrLoadModule('/src/components/DispatchPackingListPDF.jsx');
    html = renderToStaticMarkup(React.createElement(mod.default, {
      shipment,
      onClose() {},
    }));
  } finally {
    await server.close();
  }

  assert.match(html, /class="letterhead-header"/);
  assert.match(html, /class="letterhead-brand"/);
  assert.match(html, /class="letterhead-doc-title"/);
  assert.match(html, /alt="Samyak International Ltd Logo"/);
  assert.match(html, /class="samyak-logo-img"/);
  assert.match(html, /height:36px/);
  assert.match(html, /max-width:188px/);
  assert.match(html, /DISPATCH PACKING LIST/);
  assert.match(html, /PL-2026-006137/);
  assert.match(html, /Skygo Polymers Private Limited/);
  assert.match(html, /Address:/);
  assert.match(html, /Email:/);
  assert.match(html, /Mobile:/);
  assert.match(html, /GSTIN:/);
  assert.match(html, /Not Available/);
  assert.match(html, /CCPET 12μ \/ MGP 90μ/);
  assert.match(html, /Scale #4 - Dispatch Section/);
  assert.equal((html.match(/class="pl-check"/g) || []).length, 3);
  assert.equal((html.match(/class="pl-sign-card"/g) || []).length, 3);
  assert.match(html, /Plant Manager \/ HOD Signature/);
  assert.match(html, /Verified By \(QC Inspector\)/);
  assert.match(html, /Received By \(Driver \/ Customer\)/);
  assert.match(html, /pdf-modal-overlay/);
  assert.match(html, /Back to Dispatch Management/);
  assert.doesNotMatch(html, /onClick=\{onClose\}/);
  assert.doesNotMatch(html, /Laminated Film/);
  assert.doesNotMatch(html, /Flexible Laminate/);
  assert.doesNotMatch(html, />—</);
  assert.doesNotMatch(html, /\[ \]/);

  assert.equal(pdfSource.includes('Scale #4 (Dispatch Section)'), false);
  assert.equal(pdfSource.includes('Laminated Film / Pouch'), false);
  assert.equal(pdfSource.includes(': 4.5'), false);
  assert.equal(pdfSource.includes('pdf-modal-overlay'), true);
  assert.equal(pdfSource.includes('onClick={onClose}'), true);
  assert.equal(pdfSource.includes('onClick={() => onClose'), false);

  assert.match(printCss, /#printable-packing-list img\.samyak-logo-img/);
  assert.match(printCss, /height: 36px !important/);
  assert.match(printCss, /max-width: 188px !important/);
  assert.match(printCss, /#printable-packing-list \.pl-check/);
  assert.match(printCss, /min-height: 3\.4mm !important/);
  assert.match(printCss, /#printable-packing-list \.pl-sign-card/);
  assert.match(printCss, /min-height: 32mm !important/);
  assert.match(sharedPrintCss, /#printable-packing-list \*,/);
});

test('the customer block prints directory values and Not Available, and filler substrate comes from the job master', async () => {
  const zainShipment = {
    dispatchId: 'PL-2026-606130',
    clientName: 'zain natural agro',
    orderId: 'ORD-2026-180',
    jobName: 'Deleted Order Job',
    items: [
      {
        rollNo: 2,
        barcodeId: 'FG-DISP-606130-2',
        substrateSpec: 'Flexible Laminate',
        netWeightKg: 10,
        unit: 'Kg',
      },
      {
        rollNo: 23,
        barcodeId: 'FG-DISP-606130-23',
        substrateSpec: 'Flexible Laminate',
        netWeightKg: 11,
        unit: 'Kg',
      },
    ],
  };
  const directory = {
    clients: [{
      id: 'CLI-2026-9267',
      name: 'Zain Natural Agro',
      address: '',
      email: null,
      phone: '8380893808',
      gstin: '',
    }],
    orders: [],
    jobMasters: [{
      id: 'JM-2026-538',
      jobName: 'Deleted Order Job',
      structure: 'PET 12µ / NMET 65µ',
    }],
  };
  const model = buildPackingListPrintModel(zainShipment, directory);
  assert.deepEqual(model.lines.map((line) => line.rollNo), ['1', '2']);
  assert.deepEqual(model.lines.map((line) => line.barcode), ['FG-DISP-606130-2', 'FG-DISP-606130-23']);
  assert.equal(model.lines[0].substrate, 'PET 12µ / NMET 65µ');
  assert.equal(model.customer.name, 'Zain Natural Agro');
  assert.equal(model.customer.address, 'Not Available');
  assert.equal(model.customer.email, 'Not Available');
  assert.equal(model.customer.mobile, '8380893808');
  assert.equal(model.customer.gstin, 'Not Available');

  const server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
  });
  let html = '';
  try {
    const mod = await server.ssrLoadModule('/src/components/DispatchPackingListPDF.jsx');
    html = renderToStaticMarkup(React.createElement(mod.default, {
      shipment: zainShipment,
      ...directory,
      onClose() {},
    }));
  } finally {
    await server.close();
  }

  assert.match(html, /Address:/);
  assert.match(html, /Email:/);
  assert.match(html, /Mobile:/);
  assert.match(html, /Mobile:.*8380893808/);
  assert.match(html, /GSTIN:/);
  assert.equal((html.match(/Not Available/g) || []).length, 3);
  assert.match(html, /PET 12µ \/ NMET 65µ/);
  assert.doesNotMatch(html, /Flexible Laminate/);
  assert.match(html, /class="pl-center">1</);
  assert.match(html, /class="pl-center">2</);
  assert.doesNotMatch(html, /class="pl-center">23</);
});
