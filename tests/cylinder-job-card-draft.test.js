import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applySavedJobCardSpec,
  buildCylinderJobCardDraft,
  findMatchingJobMaster
} from '../src/utils/cylinderJobCardDraft.js';

const PRINT_SOURCES = [
  'src/CylinderJobCardForm.jsx',
  'src/utils/cylinderJobCardDraft.js',
  'src/components/SalesQuotationPDF.jsx',
  'src/components/PurchaseOrderPDF.jsx',
  'src/components/JobDataSheetPDF.jsx',
  'src/components/JobDataSheet.jsx',
  'src/components/OrderConfirmationPDF.jsx',
  'src/components/ClientPendingOrdersPDF.jsx',
  'src/components/EmployeePayslipPDF.jsx',
  'src/components/GRNPDF.jsx',
  'src/components/CertificateOfAnalysisPDF.jsx',
  'src/components/DeliveryChallanPDF.jsx',
  'src/components/DispatchPackingListPDF.jsx',
  'src/components/BarcodePrinterModal.jsx',
  'src/components/ConsumablesAndIndents.jsx'
];

test('cylinder job card draft builds from the cylinder and job master without a browser copy', () => {
  const cylinder = {
    id: 'CYL-1',
    sku: 'SKU-1',
    jobName: 'Bourbon 250g',
    clientGroup: 'Britannia',
    colorsCount: 8,
    printWidthMm: 1020,
    faceLengthMm: 1080,
    circumferenceMm: 420,
    pouchOpenWidth: 160,
    pouchHeight: 220,
    structure: 'PET 12µ / PE 50µ',
    chkEyemark: true,
    chkBarcode: false,
    printing: 'Surface',
    creationDate: '24/10/2026',
    engravuresName: 'Rotoflex',
    utilisationLimit: 12000,
    artworkUrl: 'https://example.com/art.png',
    productionApproved: true,
    approvedHeadName: ''
  };
  const jobMaster = {
    id: 'JM-1',
    skuCode: 'SKU-1',
    jobName: 'Bourbon 250g',
    chkOrientation: true,
    chkClientApproval: true,
    approvedHeadName: 'From job master',
    approvedHeadDate: '01/10/2026'
  };

  const match = findMatchingJobMaster([jobMaster, { id: 'JM-OTHER', skuCode: 'SKU-9', jobName: 'Other' }], cylinder);
  assert.equal(match.id, 'JM-1');

  const draft = buildCylinderJobCardDraft(cylinder, match);
  assert.equal(draft.formData.jobName, 'Bourbon 250g');
  assert.equal(draft.formData.skuCode, 'SKU-1');
  assert.equal(draft.formData.partyName, 'Britannia');
  assert.equal(draft.formData.numberOfCylinders, '8');
  assert.equal(draft.formData.printWidth, '1020 mm');
  assert.equal(draft.formData.faceLength, '1080 mm');
  assert.equal(draft.formData.totalHeight, '420 mm');
  assert.equal(draft.formData.pouchOpenWidth, '160 mm');
  assert.equal(draft.formData.pouchHeight, '220 mm');
  assert.equal(draft.formData.jobStructure, 'PET 12µ / PE 50µ');
  assert.equal(draft.formData.printing, 'Surface');
  assert.equal(draft.formData.engravure, 'Rotoflex');
  assert.equal(draft.formData.creationDate, '24/10/2026');
  assert.equal(draft.formData.chkEyemark, true);
  assert.equal(draft.formData.chkBarcode, false);
  assert.equal(draft.formData.chkOrientation, true);
  assert.equal(draft.formData.chkClientApproval, true);
  assert.equal(draft.formData.approvedByHead, true);
  assert.equal(draft.formData.approvedHeadName, 'From job master');
  assert.equal(draft.formData.approvedHeadDate, '01/10/2026');
  assert.equal(draft.artworkUrl, 'https://example.com/art.png');
  assert.deepEqual(draft.layers.map(layer => [layer.filmType, layer.micron]), [['PET', 12], ['PE', 50]]);
});

test('a saved job card spec fills checklist fields and leaves storage-only objects off the form', () => {
  const cylinder = {
    id: 'CYL-2',
    sku: 'SKU-2',
    jobName: 'Tea 100g',
    chkEyemark: false,
    approvedByHead: false
  };
  const draft = buildCylinderJobCardDraft(cylinder, null);
  const merged = applySavedJobCardSpec(draft.formData, {
    chkEyemark: true,
    chkBarcode: true,
    approvedByHead: true,
    approvedHeadName: 'Plant Head',
    approvedHeadDate: '24/10/2026',
    jobName: 'Tea 100g revised',
    targetJobMaster: { id: 'JM-2' },
    targetCylinder: { id: 'CYL-2' },
    layers: [{ id: 1, filmType: 'PET', micron: 12 }]
  });

  assert.equal(merged.chkEyemark, true);
  assert.equal(merged.chkBarcode, true);
  assert.equal(merged.approvedByHead, true);
  assert.equal(merged.approvedHeadName, 'Plant Head');
  assert.equal(merged.jobName, 'Tea 100g revised');
  assert.equal(Object.hasOwn(merged, 'targetJobMaster'), false);
  assert.equal(Object.hasOwn(merged, 'targetCylinder'), false);
  assert.equal(Object.hasOwn(merged, 'layers'), false);
  assert.equal(applySavedJobCardSpec(draft.formData, null), draft.formData);
});

test('job name match is case-insensitive and an empty cylinder still produces a draft', () => {
  const match = findMatchingJobMaster(
    [{ id: 'JM-3', jobName: 'Namkeen Pouch', skuCode: 'SKU-3', printWidthMm: 900 }],
    { jobName: '  namkeen pouch  ' }
  );
  assert.equal(match.skuCode, 'SKU-3');
  const draft = buildCylinderJobCardDraft({ jobName: '  namkeen pouch  ' }, match);
  assert.equal(draft.formData.jobName, '  namkeen pouch  ');
  assert.equal(draft.formData.printWidth, '900 mm');
  assert.equal(draft.formData.chkEyemark, false);
  assert.equal(draft.layers.length, 0);
});

test('print and document sources do not reference the removed savedLocal binding', () => {
  for (const relativePath of PRINT_SOURCES) {
    const source = fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
    assert.equal(source.includes('savedLocal'), false, relativePath);
  }
  const form = fs.readFileSync(new URL('../src/CylinderJobCardForm.jsx', import.meta.url), 'utf8');
  assert.equal(form.includes('setCustomData'), false);
  assert.equal(form.includes('buildCylinderJobCardDraft'), true);
  assert.equal(form.includes('applySavedJobCardSpec'), true);
});
