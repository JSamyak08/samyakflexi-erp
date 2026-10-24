import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';

await register(new URL('../scripts/resolve-js-hook.mjs', import.meta.url));

const { buildTsplLabel, describeSticker } = await import('../src/utils/stickerLabel.js');
const { classifySpoolerStatus, eventMatchesJob } = await import('../src/utils/qzJob.js');
const { PRINT_STATUS, withPrintStatus } = await import('../src/utils/barcodeRegistry.js');

const film = {
  barcodeId: 'RM-BC-GRN-1-L2-R1',
  rollType: 'RAW_MATERIAL',
  category: 'Film Substrates',
  itemName: 'PET 12µ',
  micron: 12,
  widthMm: 1000,
  netWeightKg: 80,
  grossWeightKg: 86,
  tareWeightKg: 6,
  vendorName: 'UFlex Films',
  batchNo: 'HEAT-9',
  purchaseRate: 120,
  sourceModule: 'Raw material / GRN',
};

test('TSPL keeps the sticker fields and addresses a 4x4 TSC label', () => {
  const sticker = describeSticker(film, {
    company: { name: 'Samyak International Ltd', placeOfSupply: 'Dhar', gstin: '23AABCM3526F1ZY' },
    rate: 120,
  });
  assert.equal(sticker.badge, 'RAW MATERIAL (RM)');
  assert.equal(sticker.barcode, 'RM-BC-GRN-1-L2-R1');
  assert.equal(sticker.qtyText, '80 Kg');
  assert.match(sticker.specLine, /12µ/);
  assert.ok(sticker.details.some((line) => line.text.includes('UFlex Films')));
  assert.ok(sticker.details.some((line) => line.text.includes('₹120 / Kg')));

  const tspl = buildTsplLabel(sticker, { gapMm: 3 });
  assert.match(tspl, /^SIZE 4,4/m);
  assert.match(tspl, /GAP 3 mm,0 mm/);
  assert.match(tspl, /QRCODE /);
  assert.match(tspl, /BARCODE 16,700,"128"/);
  assert.match(tspl, /RM-BC-GRN-1-L2-R1/);
  assert.match(tspl, /PET 12µ/);
  assert.match(tspl, /Samyak International Ltd/);
  assert.match(tspl, /PRINT 1,1/);
  assert.equal(tspl.includes('printer=browser'), false);
});

test('spooler words map to printed, failed, cancelled, or still pending', () => {
  assert.equal(classifySpoolerStatus('PRINTED'), 'printed');
  assert.equal(classifySpoolerStatus('COMPLETE'), 'printed');
  assert.equal(classifySpoolerStatus('COMPLETED'), 'printed');
  assert.equal(classifySpoolerStatus('USER_INTERVENTION'), 'failed');
  assert.equal(classifySpoolerStatus('paper out'), 'failed');
  assert.equal(classifySpoolerStatus('DELETED'), 'cancelled');
  assert.equal(classifySpoolerStatus('PRINTING'), 'pending');
  assert.equal(classifySpoolerStatus('SPOOLING'), 'pending');
  assert.equal(classifySpoolerStatus(''), 'pending');
  assert.equal(classifySpoolerStatus('PRINTING, PRINTED'), 'printed');
  assert.equal(classifySpoolerStatus('ERROR | PRINTING'), 'failed');
  assert.equal(eventMatchesJob({ jobName: 'abc-123 extra' }, 'abc-123'), true);
  assert.equal(eventMatchesJob({ jobName: 'other' }, 'abc-123'), false);
  assert.equal(eventMatchesJob({ statusText: 'PRINTED' }, 'abc-123'), false);
});

test('a queued or browser row does not flip the Printed column', () => {
  const rows = withPrintStatus([
    { barcode: 'RM-BC-1', sourceModule: 'Raw material / GRN' },
  ], [
    { barcode: 'RM-BC-1', job_status: 'queued', printer: 'TSC TE244', job_id: 'job-q' },
    { barcode: 'RM-BC-1', job_status: 'printed', printer: 'browser', job_id: 'job-b' },
  ]);
  assert.equal(rows[0].printStatus, PRINT_STATUS.notPrinted);
  assert.equal(rows[0].printAttempted, true);
});

test('QZ signing and print functions do not embed a private key', () => {
  const sign = fs.readFileSync(new URL('../supabase/functions/qz-sign/index.ts', import.meta.url), 'utf8');
  const job = fs.readFileSync(new URL('../supabase/functions/barcode-print-job/index.ts', import.meta.url), 'utf8');
  assert.match(sign, /QZ_PRIVATE_KEY/);
  assert.match(sign, /QZ_CERTIFICATE/);
  assert.equal(sign.includes('BEGIN PRIVATE KEY\n'), false);
  assert.match(job, /caller_has_barcodes/);
  assert.match(job, /settle_barcode_print_job/);
  assert.equal(job.includes("job_status: 'printed'"), false);
  assert.equal(job.includes('p_job_status'), false);
});
