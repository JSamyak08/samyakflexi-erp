import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { confirmQuoteConversion } from '../src/utils/quoteConversion.js';
import { buildOrderConfirmationRecord, layerStructure } from '../src/utils/orderConfirmationRecord.js';

const migrationSql = fs.readFileSync(new URL('../supabase/migrations/20261116130000_allocate_ocn_and_quotation_numbers.sql', import.meta.url), 'utf8');
const repairSql = fs.readFileSync(new URL('../supabase/manual/20261116_restore_ocn_163_for_ord_2026_242.sql', import.meta.url), 'utf8');

function readSrc(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing ${start}`);
  return source.slice(from, to);
}

const quote = {
  id: 'QTN-1',
  quotationNo: 'SIL/QTN/26-27/510',
  clientName: 'Oyster Exim',
  estimatedDeliveryDate: '2026-12-01',
  cylinderTerms: '₹ 35,000',
  items: [
    { jobTitle: 'Inner', quantity: 500, ratePerUom: 180 },
    { jobTitle: 'Outer', quantity: 700, ratePerUom: 190 }
  ]
};

function line(title, rate) {
  return {
    jobTitle: title,
    printWidthMm: 800,
    repeatLengthMm: 400,
    quantityKg: 500,
    ratePerUom: rate,
    conversionCharges: 45,
    fixedProfit: 25,
    materialFormat: 'Roll Form',
    targetDeliveryDate: '2026-12-01',
    structure: 'PET 12µ / Natural GP LD 40µ',
    layers: [
      { filmType: 'PET', micron: 12, ratePerKg: 125 },
      { filmType: 'Natural GP LD', micron: 40, ratePerKg: 115 }
    ],
    inkPrice: 220,
    adhesivePrice: 240,
    inkGsm: 1.5,
    adhesiveGsm: 1.5,
    isCylinderOrder: false,
    orderComments: 'Keep the eyemark'
  };
}

function deps(overrides = {}) {
  const calls = [];
  let orderN = 240;
  let ocnN = 163;
  const base = {
    calls,
    allocateOrderId: async () => {
      calls.push('order-number');
      orderN += 1;
      return `ORD-2026-${orderN}`;
    },
    allocateOcnNumber: async () => {
      calls.push('ocn-number');
      ocnN += 1;
      return `SIL/OCN/26-27/${ocnN}`;
    },
    allocateCylinderSku: async () => {
      calls.push('sku');
      return ['SKU-CYL-900'];
    },
    allocateJobMasterId: async () => ['JM-2026-900'],
    releaseCylinderSku: async (sku) => { calls.push(`release:${sku}`); },
    saveOrder: async (order) => { calls.push(`order:${order.id}`); },
    saveOcn: async (ocn) => { calls.push(`ocn:${ocn.ocnNumber}`); },
    saveQuotation: async (saved) => { calls.push(`quote:${saved.status}`); },
    saveJobMaster: async (job, options) => {
      calls.push(`job:${job.skuCode}:${job.cylinderSku}:${options?.mode}`);
      return { id: job.id };
    },
    logAudit: async (action, module, details, targetId) => {
      calls.push(`audit:${action}:${module}:${targetId}`);
    },
    reportFailure: (err, context) => { calls.push(`sentry:${context}`); }
  };
  return { ...base, ...overrides, calls };
}

test('one quotation line becomes one order and one OCN, and the quote is marked only after both save', async () => {
  const used = deps();
  const result = await confirmQuoteConversion({
    quotation: { ...quote, items: [quote.items[0]] },
    items: [line('Inner', 180)],
    jobMasters: [{ id: 'JM-1', jobName: 'Inner' }],
    clients: [{ id: 'CLI-1', name: 'Oyster Exim', gstin: 'GST' }],
    deps: used,
    now: new Date('2026-11-16T10:57:00.000Z')
  });

  assert.equal(result.ok, true);
  assert.equal(result.saved.length, 1);
  const order = result.saved[0].order;
  const ocn = result.saved[0].ocn;
  assert.equal(order.jobDetails.ocnNumber, ocn.ocnNumber);
  assert.equal(order.jobDetails.ocnId, ocn.ocnNumber);
  assert.equal(order.ocnNumber, ocn.ocnNumber);
  assert.equal(order.sellingPricePerKg, 180);
  assert.equal(order.conversionChargesPerKg, 45);
  assert.equal(order.fixedProfitPerKg, 25);
  assert.equal(ocn.quotationNo, 'SIL/QTN/26-27/510');
  assert.equal(ocn.sourceQuotationNo, 'SIL/QTN/26-27/510');
  assert.equal(ocn.quotationId, 'QTN-1');
  assert.equal(ocn.clientDetails.id, 'CLI-1');
  assert.equal(ocn.conversionChargesPerKg, 45);
  assert.equal(ocn.fixedProfitPerKg, 25);
  assert.ok(ocn.minSellingPricePerKg > 0);
  assert.equal(result.quotation.status, 'Confirmed (Converted to OCN)');
  assert.match(result.quotation.ocnRefNo, new RegExp(ocn.ocnNumber));
  assert.match(result.quotation.ocnRefNo, /ORD-2026-241/);
  assert.equal(result.quotation.items[0].orderId, 'ORD-2026-241');
  assert.equal(result.quotation.items[0].ocnNumber, ocn.ocnNumber);
  const quoteAt = used.calls.indexOf(`quote:${result.quotation.status}`);
  const orderAt = used.calls.indexOf('order:ORD-2026-241');
  const ocnAt = used.calls.indexOf(`ocn:${ocn.ocnNumber}`);
  assert.ok(orderAt >= 0 && ocnAt > orderAt && quoteAt > ocnAt);
  assert.ok(used.calls.includes('audit:CREATE:Order Confirmations:' + ocn.ocnNumber));
  assert.ok(used.calls.includes('audit:UPDATE:Sales:QTN-1'));
  assert.equal(used.calls.filter((call) => call === 'ocn-number').length, 1);
  assert.doesNotMatch(result.successMessage, /not marked|was not saved/i);
});

test('each line of a multi-item quotation gets its own OCN', async () => {
  const used = deps();
  const result = await confirmQuoteConversion({
    quotation: quote,
    items: [line('Inner', 180), line('Outer', 190)],
    jobMasters: [
      { id: 'JM-1', jobName: 'Inner' },
      { id: 'JM-2', jobName: 'Outer' }
    ],
    clients: [],
    deps: used
  });
  assert.equal(result.ok, true);
  assert.equal(result.saved.length, 2);
  assert.notEqual(result.saved[0].ocn.ocnNumber, result.saved[1].ocn.ocnNumber);
  assert.equal(result.saved[0].order.id, 'ORD-2026-241');
  assert.equal(result.saved[1].order.id, 'ORD-2026-242');
  assert.equal(result.quotation.items[0].ocnNumber, result.saved[0].ocn.ocnNumber);
  assert.equal(result.quotation.items[1].ocnNumber, result.saved[1].ocn.ocnNumber);
  assert.equal(result.quotation.items[1].orderId, 'ORD-2026-242');
  assert.equal(used.calls.filter((call) => call.startsWith('quote:')).length, 1);
  assert.equal(used.calls.filter((call) => call === 'ocn-number').length, 2);
});

test('a failed OCN save leaves the quotation unconverted and reports the error', async () => {
  const used = deps({
    saveOcn: async () => {
      used.calls.push('ocn:fail');
      const err = new Error('connection lost');
      throw err;
    }
  });
  const result = await confirmQuoteConversion({
    quotation: { ...quote, items: [quote.items[0]] },
    items: [line('Inner', 180)],
    jobMasters: [{ id: 'JM-1', jobName: 'Inner' }],
    deps: used
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /connection lost/);
  assert.match(result.error, /not marked converted/);
  assert.equal(used.calls.filter((call) => call.startsWith('quote:')).length, 0);
  assert.equal(used.calls.filter((call) => call.startsWith('order:')).length, 1);
  assert.equal(result.quotation, undefined);
});

test('a failed quotation save does not claim success', async () => {
  const used = deps({
    saveQuotation: async () => {
      throw new Error('quotation write rejected');
    }
  });
  const result = await confirmQuoteConversion({
    quotation: { ...quote, items: [quote.items[0]] },
    items: [line('Inner', 180)],
    jobMasters: [{ id: 'JM-1', jobName: 'Inner' }],
    deps: used
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /quotation write rejected/);
  assert.match(result.error, /not marked converted/);
  assert.ok(used.calls.some((call) => call.startsWith('sentry:Quotation')));
  assert.equal(result.successMessage, undefined);
});

test('a new job master is inserted with an allocated cylinder code, and a failed save stops the order', async () => {
  const used = deps();
  const created = await confirmQuoteConversion({
    quotation: { ...quote, items: [quote.items[0]] },
    items: [line('Brand new pouch', 180)],
    jobMasters: [],
    deps: used
  });
  assert.equal(created.ok, true);
  assert.ok(used.calls.includes('job:SKU-CYL-900:SKU-CYL-900:insert'));
  assert.equal(created.saved[0].order.jobMasterId, 'JM-2026-900');
  assert.doesNotMatch(used.calls.join(' '), /CYL-XXX-001|Math\.random/);

  const failing = deps({
    saveJobMaster: async () => {
      throw new Error('Job master JM-2026-900 already exists. It was not overwritten.');
    }
  });
  const stopped = await confirmQuoteConversion({
    quotation: { ...quote, items: [quote.items[0]] },
    items: [line('Brand new pouch', 180)],
    jobMasters: [],
    deps: failing
  });
  assert.equal(stopped.ok, false);
  assert.match(stopped.error, /already exists/);
  assert.match(stopped.error, /not marked converted/);
  assert.equal(failing.calls.filter((call) => call.startsWith('order:')).length, 0);
  assert.ok(failing.calls.includes('release:SKU-CYL-900'));
  assert.equal(failing.calls.filter((call) => call === 'ocn-number').length, 0);
});

test('document numbers are issued by the database at confirm, not when a window opens', () => {
  const settings = readSrc('src/services/settingsService.js');
  const getter = sliceBetween(settings, 'export function getNextDocRefNumber', 'return docRef;');
  assert.match(getter, /type === 'ocn'/);
  assert.match(getter, /allocate_ocn_number/);
  assert.match(getter, /type === 'qtn'/);
  assert.match(getter, /allocate_quotation_number/);
  assert.doesNotMatch(getter, /ocnCounter|qtnCounter|localStorage/);

  const sales = readSrc('src/components/SalesManagement.jsx');
  const open = sliceBetween(sales, 'const handleOpenOcnConvertModal', 'const handleUpdateOcnItemField');
  const create = sliceBetween(sales, 'const handleOpenCreateForm', 'const handleSaveQuotation');
  const confirm = sliceBetween(sales, 'const handleConfirmAndPunchOCN', 'const filteredQuotations');
  const saveQuote = sliceBetween(sales, 'const handleSaveQuotation', 'const handleDeleteQuotation');
  assert.doesNotMatch(open, /allocateOcn|allocateQuotation|getNextDocRefNumber/);
  assert.doesNotMatch(create, /allocateOcn|allocateQuotation|getNextDocRefNumber|generateDocRefNumber/);
  assert.match(confirm, /confirmQuoteConversion/);
  assert.match(confirm, /allocateOcnNumberFromServer/);
  assert.match(saveQuote, /allocateQuotationNumberFromServer/);
  assert.match(sales, /Conversion Charges \/ kg/);
  assert.match(sales, /Fixed Profit \/ kg/);
  assert.match(sales, /Minimum Selling Price \/ kg/);
  assert.match(sales, /onSaveOcn/);
  assert.doesNotMatch(sales, /notifyOrderPunched|CYL-\$\{|CYL-XXX-001/);

  const app = readSrc('src/App.jsx');
  const salesProps = sliceBetween(app, '<SalesManagement', 'TAB: PRODUCTION RECORDS');
  assert.match(salesProps, /onSaveOcn=\{handleSaveOcn\}/);
  assert.match(salesProps, /onLogAudit=\{logAudit\}/);
  assert.match(app, /saveOrderConfirmation\(ocnRecord, \{ mode: 'insert' \}\)/);

  const punch = readSrc('src/components/JobPunchingForm.jsx');
  const punchConfirm = sliceBetween(punch, 'const handleFinalConfirmAndPunch', 'return (');
  assert.match(punchConfirm, /allocateOcnNumberFromServer/);
  assert.match(punchConfirm, /buildOrderConfirmationRecord/);
  assert.doesNotMatch(punchConfirm, /getNextDocRefNumber/);
  const saveOrderAt = punchConfirm.indexOf('onSaveOrder');
  const saveOcnAt = punchConfirm.indexOf('onSaveOcn');
  assert.ok(saveOrderAt >= 0 && saveOcnAt > saveOrderAt);

  const card = readSrc('src/utils/cylinderJobCardDraft.js');
  assert.match(card, /export function buildCylinderJobCardDraft/);
});

test('the shared OCN builder keeps Job Punching fields and can carry the source quotation', () => {
  const layers = [{ filmType: 'PET', micron: 12, metallocenePct: '' }, { filmType: 'Natural GP LD', micron: 40, metallocenePct: 5 }];
  const record = buildOrderConfirmationRecord({
    ocnNumber: 'SIL/OCN/26-27/164',
    orderId: 'ORD-2026-242',
    jobName: 'Inner',
    clientName: 'Oyster Exim',
    clientDetails: { id: 'CLI-1', name: 'Oyster Exim' },
    orderDate: '2026-11-16',
    targetDeliveryDate: '2026-12-01',
    orderQtyKg: 500,
    orderType: 'Reel',
    printWidthMm: 800,
    repeatLengthMm: 400,
    calculationResults: {
      totalLaminateGsm: 20,
      totalAreaSqm: 100,
      wastagePct: 5,
      minSellingPricePerKg: 210,
      totalMinSellingAmount: 105000,
      summary: { costPerKg: 140 },
      layerResults: [],
      inkDetails: {},
      adhesiveDetails: {}
    },
    conversionCharges: 45,
    fixedProfit: 25,
    layers,
    variants: [],
    hasVariants: false,
    orderComments: 'note',
    quotationNo: 'SIL/QTN/26-27/501',
    quotationId: 'QTN-1794635964007',
    now: new Date('2026-11-16T10:57:00.000Z')
  });
  assert.equal(record.id, record.ocnNumber);
  assert.equal(record.status, 'Confirmed');
  assert.equal(record.revisionNo, 0);
  assert.equal(record.amendmentNo, 'Rev 00');
  assert.deepEqual(record.revisions, []);
  assert.equal(record.orderId, 'ORD-2026-242');
  assert.equal(record.structure, layerStructure(layers));
  assert.equal(record.quotationNo, 'SIL/QTN/26-27/501');
  assert.equal(record.createdAt, '2026-11-16T10:57:00.000Z');
  for (const key of ['summary', 'layerResults', 'inkDetails', 'adhesiveDetails', 'calculationData', 'clientDetails']) {
    assert.ok(record[key], key);
  }
});

function schema() {
  return `
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      client_name text NOT NULL,
      order_type text,
      order_qty_kg numeric,
      target_delivery_date date,
      delivery_date date,
      status text,
      job_details jsonb,
      ocn_number text,
      ocn_id text,
      metallocene_pct text
    );
    CREATE TABLE public.order_confirmations (
      id text PRIMARY KEY,
      ocn_number text NOT NULL,
      order_id text,
      job_name text,
      client_name text,
      status text,
      revision_no integer,
      amendment_no text,
      amended_at timestamptz,
      amended_by text,
      amendment_reason text,
      payload jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.sales_quotations (
      id text PRIMARY KEY,
      quotation_no text,
      client_name text,
      status text
    );
    CREATE TABLE public.clients (
      id text PRIMARY KEY,
      name text NOT NULL,
      gstin text,
      address text,
      payment_terms text,
      contact_person text,
      phone text,
      email text
    );
    CREATE TABLE public.system_settings (
      key text PRIMARY KEY,
      value jsonb
    );
  `;
}

test('OCN and quotation numbers continue from the highest stored serial and ignore the stuck counter', async () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((name) => name.endsWith('.sql'));
  assert.ok(names.includes('20261116130000_allocate_ocn_and_quotation_numbers.sql'));
  assert.ok(names.every((name) => name.slice(0, 14) <= '20261116130000' || name === '20261116130000_allocate_ocn_and_quotation_numbers.sql' || name < '20261116130000'));
  const latestOther = names.filter((name) => name !== '20261116130000_allocate_ocn_and_quotation_numbers.sql').sort().at(-1);
  assert.ok(latestOther < '20261116130000_allocate_ocn_and_quotation_numbers.sql');
  assert.match(migrationSql, /pg_advisory_xact_lock\(hashtext\('samyak-ocn-number'\)\)/);
  assert.match(migrationSql, /pg_advisory_xact_lock\(hashtext\('samyak-quotation-number'\)\)/);
  const ocnFn = migrationSql.slice(
    migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.allocate_ocn_number'),
    migrationSql.indexOf('REVOKE ALL ON FUNCTION public.allocate_ocn_number')
  );
  const qtnFn = migrationSql.slice(
    migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.allocate_quotation_number'),
    migrationSql.indexOf('REVOKE ALL ON FUNCTION public.allocate_quotation_number')
  );
  assert.doesNotMatch(ocnFn, /localStorage|ocnCounter|qtnCounter|system_settings/);
  assert.doesNotMatch(qtnFn, /localStorage|ocnCounter|qtnCounter|system_settings/);
  assert.match(migrationSql, /REVOKE ALL ON FUNCTION public\.allocate_ocn_number\(integer\) FROM PUBLIC, anon/);
  assert.match(migrationSql, /GRANT EXECUTE ON FUNCTION public\.allocate_ocn_number\(integer\) TO authenticated, service_role/);
  assert.match(migrationSql, /REVOKE ALL ON FUNCTION public\.allocate_quotation_number\(integer\) FROM PUBLIC, anon/);
  assert.match(migrationSql, /GRANT EXECUTE ON FUNCTION public\.allocate_quotation_number\(integer\) TO authenticated, service_role/);

  const db = new PGlite();
  await db.exec(schema());
  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const fy = await db.query(`SELECT private.doc_fy_suffix('2026-11-16 16:27:00+05:30'::timestamptz) AS suffix`);
  assert.equal(fy.rows[0].suffix, '26-27');
  const march = await db.query(`SELECT private.doc_fy_suffix('2027-03-31 22:00:00+05:30'::timestamptz) AS suffix`);
  assert.equal(march.rows[0].suffix, '26-27');
  const april = await db.query(`SELECT private.doc_fy_suffix('2027-04-01 00:30:00+05:30'::timestamptz) AS suffix`);
  assert.equal(april.rows[0].suffix, '27-28');

  await db.exec(`
    INSERT INTO public.system_settings (key, value)
    VALUES ('doc_prefixes', '{"ocnCounter": 108, "qtnCounter": 501}'::jsonb);
    INSERT INTO public.sales_quotations (id, quotation_no, client_name, status) VALUES
      ('QTN-A', 'SIL/QTN/26-27/501', 'One', 'Sent'),
      ('QTN-B', 'SIL/QTN/26-27/501', 'Two', 'Sent'),
      ('QTN-OLD', 'SIL/QTN/25-26/9999', 'Old', 'Sent');
    INSERT INTO public.order_confirmations (id, ocn_number, order_id, job_name, client_name)
    VALUES ('SIL/OCN/26-27/162', 'SIL/OCN/26-27/162', 'ORD-2026-200', 'Kept', 'Kept');
    INSERT INTO public.orders (id, job_name, client_name, job_details)
    VALUES (
      'ORD-2026-201',
      'Kept ||| {"jobDetails":{"ocnNumber":"SIL/OCN/26-27/160"}}',
      'Kept',
      '{"ocnNumber":"SIL/OCN/25-26/9000"}'::jsonb
    );
  `);

  const quotation = await db.query(`SELECT public.allocate_quotation_number(1) AS issued`);
  assert.deepEqual(quotation.rows[0].issued, ['SIL/QTN/26-27/502']);
  await db.query(`INSERT INTO public.sales_quotations (id, quotation_no) VALUES ('QTN-C', 'SIL/QTN/26-27/600')`);
  const quotationNext = await db.query(`SELECT public.allocate_quotation_number(2) AS issued`);
  assert.deepEqual(quotationNext.rows[0].issued, ['SIL/QTN/26-27/601', 'SIL/QTN/26-27/602']);

  const ocn = await db.query(`SELECT public.allocate_ocn_number(1) AS issued`);
  assert.deepEqual(ocn.rows[0].issued, ['SIL/OCN/26-27/163']);
  await db.query(
    `UPDATE public.orders SET job_details = jsonb_set(COALESCE(job_details, '{}'::jsonb), '{ocnNumber}', '"SIL/OCN/26-27/170"') WHERE id = 'ORD-2026-201'`
  );
  const ocnNext = await db.query(`SELECT public.allocate_ocn_number(1) AS issued`);
  assert.deepEqual(ocnNext.rows[0].issued, ['SIL/OCN/26-27/171']);

  await db.query(`INSERT INTO public.order_confirmations (id, ocn_number, job_name, client_name) VALUES ('SIL/OCN/26-27/163', 'SIL/OCN/26-27/163', 'Used', 'Used')`);
  const reserved = await db.query(`SELECT count(*)::int AS n FROM private.ocn_number_reservations WHERE ocn_number = 'SIL/OCN/26-27/163'`);
  assert.equal(reserved.rows[0].n, 0);
  await db.query(`INSERT INTO public.sales_quotations (id, quotation_no) VALUES ('QTN-D', 'SIL/QTN/26-27/601')`);
  const quoteReserved = await db.query(`SELECT count(*)::int AS n FROM private.quotation_number_reservations WHERE quotation_no = 'SIL/QTN/26-27/601'`);
  assert.equal(quoteReserved.rows[0].n, 0);

  const auth = await db.query(`SELECT has_function_privilege('authenticated', 'public.allocate_ocn_number(integer)', 'EXECUTE') AS ok`);
  const anon = await db.query(`SELECT has_function_privilege('anon', 'public.allocate_ocn_number(integer)', 'EXECUTE') AS ok`);
  const service = await db.query(`SELECT has_function_privilege('service_role', 'public.allocate_quotation_number(integer)', 'EXECUTE') AS ok`);
  assert.equal(auth.rows[0].ok, true);
  assert.equal(anon.rows[0].ok, false);
  assert.equal(service.rows[0].ok, true);
  await db.close();
});

test('the ORD-2026-242 repair inserts OCN 163 and then rolls back', async () => {
  assert.match(repairSql, /SIL\/OCN\/26-27\/163/);
  assert.match(repairSql, /ORD-2026-242/);
  assert.match(repairSql, /QTN-1794635964007/);
  assert.match(repairSql, /SIL\/QTN\/26-27\/501/);
  assert.match(repairSql, /2026-11-16 16:27:00\+05:30/);
  assert.match(repairSql, /conversionChargesPerKg/);
  assert.match(repairSql, /fixedProfitPerKg/);
  assert.match(repairSql, /minSellingPricePerKg/);
  assert.doesNotMatch(repairSql, /^\s*COMMIT\s*;/m);
  assert.match(repairSql, /\nROLLBACK;\s*$/);
  assert.doesNotMatch(repairSql, /allocate_ocn_number|allocate_quotation_number|localStorage|ocnCounter/);
  const migrations = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url));
  assert.equal(migrations.some((name) => name.includes('restore_ocn_163')), false);

  const db = new PGlite();
  await db.exec(schema());
  const envelope = JSON.stringify({
    jobDetails: {
      structure: 'PET 12µ / PE 50µ',
      printWidthMm: 800,
      repeatLengthMm: 420,
      layers: [{ filmType: 'PET', micron: 12 }],
      orderComments: 'From the saved order'
    }
  });
  await db.query(
    `INSERT INTO public.orders
      (id, job_name, client_name, order_type, order_qty_kg, target_delivery_date, status, job_details)
     VALUES
      ('ORD-2026-242', $1, 'Oyster Exim', 'Reel', 480, '2026-12-20', 'Confirmed', $2::jsonb),
      ('ORD-2026-100', 'Leave me ||| {"jobDetails":{}}', 'Someone Else', 'Reel', 10, '2026-12-01', 'Confirmed', '{}'::jsonb)`,
    [`Oyster pouch ||| ${envelope}`, JSON.stringify({ structure: 'PET 12µ / PE 50µ', printWidthMm: 800, layers: [{ filmType: 'PET', micron: 12 }], orderComments: 'From the saved order' })]
  );
  await db.query(
    `INSERT INTO public.clients (id, name, gstin, address, payment_terms, contact_person, phone, email)
     VALUES ('CLI-OYSTER', 'Oyster Exim', '23AAAAA0000A1Z5', 'Indore', '30 Days', 'Asha', '999', 'buyer@oyster.example')`
  );
  await db.query(
    `INSERT INTO public.sales_quotations (id, quotation_no, client_name, status) VALUES
      ('QTN-1794635964007', 'SIL/QTN/26-27/501', 'Oyster Exim', 'Sent to Client'),
      ('QTN-OLD', 'SIL/QTN/26-27/400', 'Old Client', 'Converted')`
  );
  await db.query(
    `INSERT INTO public.order_confirmations (id, ocn_number, order_id, job_name, client_name)
     VALUES ('SIL/OCN/26-27/162', 'SIL/OCN/26-27/162', 'ORD-2026-100', 'Leave me', 'Someone Else')`
  );

  const runnable = repairSql.replace(/\nROLLBACK;\s*$/, '\n');
  await db.exec(runnable);

  const ocn = await db.query(`SELECT id, ocn_number, order_id, client_name, payload, created_at FROM public.order_confirmations WHERE id = 'SIL/OCN/26-27/163'`);
  assert.equal(ocn.rows.length, 1);
  assert.equal(ocn.rows[0].order_id, 'ORD-2026-242');
  assert.equal(ocn.rows[0].client_name, 'Oyster Exim');
  assert.equal(ocn.rows[0].payload.quotationNo, 'SIL/QTN/26-27/501');
  assert.equal(ocn.rows[0].payload.quotationId, 'QTN-1794635964007');
  assert.equal(ocn.rows[0].payload.jobName, 'Oyster pouch');
  assert.equal(ocn.rows[0].payload.orderQtyKg, 480);
  assert.equal(ocn.rows[0].payload.clientDetails.email, 'buyer@oyster.example');
  assert.equal(ocn.rows[0].payload.conversionChargesPerKg, null);
  assert.equal(ocn.rows[0].payload.fixedProfitPerKg, null);
  assert.equal(ocn.rows[0].payload.minSellingPricePerKg, null);
  assert.equal(ocn.rows[0].payload.orderComments, 'From the saved order');
  assert.equal(new Date(ocn.rows[0].created_at).toISOString(), '2026-11-16T10:57:00.000Z');

  const order = await db.query(`SELECT ocn_number, ocn_id, job_details, job_name FROM public.orders WHERE id = 'ORD-2026-242'`);
  assert.equal(order.rows[0].ocn_number, 'SIL/OCN/26-27/163');
  assert.equal(order.rows[0].ocn_id, 'SIL/OCN/26-27/163');
  assert.equal(order.rows[0].job_details.ocnNumber, 'SIL/OCN/26-27/163');
  assert.equal(order.rows[0].job_details.ocnId, 'SIL/OCN/26-27/163');
  assert.match(order.rows[0].job_name, /SIL\/OCN\/26-27\/163/);
  const untouched = await db.query(`SELECT ocn_number, job_name FROM public.orders WHERE id = 'ORD-2026-100'`);
  assert.equal(untouched.rows[0].ocn_number, null);
  assert.equal(untouched.rows[0].job_name, 'Leave me ||| {"jobDetails":{}}');
  const quoteRow = await db.query(`SELECT status FROM public.sales_quotations WHERE id = 'QTN-1794635964007'`);
  assert.equal(quoteRow.rows[0].status, 'Sent to Client');
  const kept = await db.query(`SELECT order_id FROM public.order_confirmations WHERE id = 'SIL/OCN/26-27/162'`);
  assert.equal(kept.rows[0].order_id, 'ORD-2026-100');

  const blocked = new PGlite();
  await blocked.exec(schema());
  await blocked.query(
    `INSERT INTO public.orders (id, job_name, client_name) VALUES ('ORD-2026-242', 'Oyster pouch', 'Oyster Exim')`
  );
  await blocked.query(
    `INSERT INTO public.order_confirmations (id, ocn_number, job_name, client_name)
     VALUES ('SIL/OCN/26-27/163', 'SIL/OCN/26-27/163', 'Already', 'Oyster Exim')`
  );
  await assert.rejects(() => blocked.exec(runnable), /already exists/);
  await blocked.exec('ROLLBACK');
  const still = await blocked.query(`SELECT job_name FROM public.order_confirmations WHERE id = 'SIL/OCN/26-27/163'`);
  assert.equal(still.rows[0].job_name, 'Already');
  await blocked.close();

  const rolled = new PGlite();
  await rolled.exec(schema());
  await rolled.query(
    `INSERT INTO public.orders (id, job_name, client_name, order_qty_kg, job_details)
     VALUES ('ORD-2026-242', 'Oyster pouch ||| {"jobDetails":{}}', 'Oyster Exim', 480, '{}'::jsonb)`
  );
  await rolled.query(`INSERT INTO public.clients (id, name) VALUES ('CLI-OYSTER', 'Oyster Exim')`);
  await rolled.query(
    `INSERT INTO public.sales_quotations (id, quotation_no, client_name) VALUES ('QTN-1794635964007', 'SIL/QTN/26-27/501', 'Oyster Exim')`
  );
  await rolled.exec(repairSql);
  const gone = await rolled.query(`SELECT count(*)::int AS n FROM public.order_confirmations WHERE id = 'SIL/OCN/26-27/163'`);
  assert.equal(gone.rows[0].n, 0);
  const orderUntouched = await rolled.query(`SELECT ocn_number FROM public.orders WHERE id = 'ORD-2026-242'`);
  assert.equal(orderUntouched.rows[0].ocn_number, null);
  await rolled.close();
  await db.close();
});
