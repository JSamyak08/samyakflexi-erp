import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { cylinderCodeSerial } from '../src/utils/cylinderSku.js';
import { linkedJobMasterLabel } from '../src/utils/jobMasterLink.js';
import { planCylinderJobCardRecords } from '../src/utils/cylinderJobCardSave.js';

function readSrc(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

const oldMigration = fs.readFileSync(new URL('../supabase/migrations/20261110120000_cylinder_sku_allocation.sql', import.meta.url), 'utf8');
const newMigration = fs.readFileSync(new URL('../supabase/migrations/20261116120000_cylinder_sku_cross_prefix.sql', import.meta.url), 'utf8');

test('the cross-prefix migration is newer than the latest migration on main', () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'));
  assert.ok(names.includes('20261116120000_cylinder_sku_cross_prefix.sql'));
  const stamps = names.map((name) => name.slice(0, 14)).filter((stamp) => /^\d{14}$/.test(stamp));
  const latestBeforeThis = stamps.filter((stamp) => stamp < '20261116120000').sort().at(-1);
  assert.equal(latestBeforeThis, '20261114020000');
  assert.match(newMigration, /sku-2026-/);
  assert.match(newMigration, /cyl-2026-/);
  assert.match(newMigration, /allocate_cylinder_sku/);
  assert.doesNotMatch(newMigration, /CREATE UNIQUE INDEX/i);
  assert.doesNotMatch(newMigration, /eamstsaqkbeiywfaanhi/);
});

test('every cylinder-code generator asks the database and does not count in the browser', () => {
  const directory = readSrc('src/components/JobMasterDirectory.jsx');
  const cylinders = readSrc('src/components/CylinderManagement.jsx');
  const sales = readSrc('src/components/SalesManagement.jsx');
  const jobCard = readSrc('src/CylinderJobCardForm.jsx');
  const settings = readSrc('src/services/settingsService.js');

  for (const source of [directory, cylinders, sales, jobCard]) {
    assert.match(source, /allocateCylinderSkusFromServer\(/);
  }
  assert.doesNotMatch(directory, /getNextSerialSkuCode|SKU-2026-\$\{|SKU-\$\{Date\.now/);
  assert.doesNotMatch(cylinders, /nextCylinderSku\(/);
  assert.match(jobCard, /allocateJobMasterIdsFromServer\(/);
  assert.match(jobCard, /planCylinderJobCardRecords\(/);
  assert.match(jobCard, /mode: plan\.jobMasterMode/);
  assert.match(jobCard, /mode: plan\.cylinderMode/);
  assert.doesNotMatch(jobCard, /getNextDocRefNumber|CYL-\$\{targetSku|CYL-\$\{targetJobMaster/);

  const quoteStart = sales.indexOf('if (isCylinderQuote)');
  const quoteEnd = sales.indexOf('} else {', quoteStart);
  const quote = sales.slice(quoteStart, quoteEnd);
  assert.match(quote, /allocateCylinderSkusFromServer\(/);
  assert.doesNotMatch(quote, /Math\.random|clientName\.substring/);
  assert.match(sales, /sku: cylinderSku/);

  const getter = settings.slice(
    settings.indexOf('export function getNextDocRefNumber'),
    settings.indexOf('export function syncOcnCounterWithRecords')
  );
  assert.match(getter, /type === 'jm'/);
  assert.match(getter, /allocate_job_master_id/);
  assert.doesNotMatch(getter, /SIL\/DOC/);

  const service = readSrc('src/services/supabaseDataService.js');
  const saveJob = service.slice(
    service.indexOf('export async function saveJobMasterToSupabase'),
    service.indexOf('export async function deleteJobMasterFromSupabase')
  );
  const saveCyl = service.slice(
    service.indexOf('export async function saveCylinderToSupabase'),
    service.indexOf('export async function saveCylinderBatchToSupabase')
  );
  assert.match(saveJob, /mode === 'insert'/);
  assert.match(saveJob, /\.insert\(extendedPayload\)/);
  assert.match(saveJob, /\.update\(extendedPayload\)\.eq\('id', id\)/);
  assert.match(saveJob, /jobMasterDuplicateMessage/);
  assert.match(service, /already exists\. It was not overwritten\./);
  assert.match(saveCyl, /\.insert\(fullPayload\)/);
  assert.match(saveCyl, /\.update\(fullPayload\)\.eq\('id', id\)/);
  assert.match(saveCyl, /cylinderDuplicateMessage/);
});

test('the cylinder list names the job master id and the SKU', () => {
  assert.equal(
    linkedJobMasterLabel({ id: 'JM-2026-570', skuCode: 'SKU-CYL-514' }),
    'Linked to JM-2026-570 (SKU-CYL-514)'
  );
  const screen = readSrc('src/components/CylinderManagement.jsx');
  assert.match(screen, /linkedJobMasterLabel\(linkedJm\)/);
  assert.doesNotMatch(screen, /Linked to JM \(/);
});

test('a job card inserts a new id and updates only an exact id', () => {
  const jobMasters = [
    { id: 'SIL/DOC/101', skuCode: 'SKU-OLD', jobName: 'Chocovalley Masterpiece Inner (Twist)' },
    { id: 'JM-2026-569', skuCode: 'SKU-2026-514', jobName: 'Darshan Milk Double Decker Mini Outer' }
  ];
  const cylinders = [
    { id: '1794460369213', sku: 'SKU-2026-514', jobName: 'Darshan Milk Double Decker Mini Outer', jobMasterId: 'JM-2026-569' },
    { id: '1794485343753', sku: 'SKU-CYL-514', jobName: 'Zain Frozen Sweet Corn 400gm' }
  ];

  assert.throws(
    () => planCylinderJobCardRecords({
      jobMasters,
      cylinders,
      jobMasterId: '',
      allocatedJobMasterId: 'SIL/DOC/101',
      allocatedSku: 'SKU-CYL-901',
      now: 1794500000000
    }),
    /already exists\. It was not overwritten/
  );

  const created = planCylinderJobCardRecords({
    jobMasters,
    cylinders,
    jobMasterId: '',
    cylinderIds: [],
    allocatedJobMasterId: 'JM-2026-571',
    allocatedSku: 'SKU-CYL-901',
    now: 1794500000000
  });
  assert.equal(created.jobMasterMode, 'insert');
  assert.equal(created.cylinderMode, 'insert');
  assert.equal(created.jobMasterId, 'JM-2026-571');
  assert.equal(created.cylinderId, 1794500000000);
  assert.equal(created.sku, 'SKU-CYL-901');
  assert.equal(String(created.cylinderId).startsWith('CYL-'), false);

  const sameName = planCylinderJobCardRecords({
    jobMasters,
    cylinders,
    jobMasterId: 'not-the-chocovalley-id',
    cylinderIds: ['not-a-cylinder'],
    allocatedJobMasterId: 'JM-2026-572',
    allocatedSku: 'SKU-CYL-902',
    now: 1794500000001
  });
  assert.equal(sameName.existingJobMaster, null);
  assert.equal(sameName.existingCylinder, null);
  assert.equal(sameName.jobMasterId, 'JM-2026-572');

  const edited = planCylinderJobCardRecords({
    jobMasters,
    cylinders,
    jobMasterId: 'JM-2026-569',
    cylinderIds: ['1794460369213'],
    allocatedJobMasterId: 'JM-2026-999',
    allocatedSku: 'SKU-CYL-999',
    now: 1794500000002
  });
  assert.equal(edited.jobMasterMode, 'update');
  assert.equal(edited.cylinderMode, 'update');
  assert.equal(edited.jobMasterId, 'JM-2026-569');
  assert.equal(edited.cylinderId, '1794460369213');
  assert.equal(edited.sku, 'SKU-2026-514');
});

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.cylinders (
      id text PRIMARY KEY,
      sku text,
      job_name text NOT NULL,
      status text,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.job_masters (
      id text PRIMARY KEY,
      sku_code text NOT NULL,
      cylinder_sku text,
      job_name text NOT NULL,
      client_name text NOT NULL DEFAULT 'Client',
      created_at timestamptz DEFAULT now()
    );
  `);
  await db.exec(`
    INSERT INTO public.cylinders (id, sku, job_name, created_at) VALUES
      ('1794460369213', 'SKU-2026-514', 'Darshan Milk', '2026-11-12 05:12:00+00'),
      ('1794485343753', 'SKU-CYL-514', 'Zain Corn', '2026-11-12 12:09:00+00'),
      ('cyl-420', 'CYL-2026-0420', 'Older 420', '2026-01-01 00:00:00+00'),
      ('sku-600', 'SKU-2026-600', 'Six hundred', '2026-02-01 00:00:00+00');
    INSERT INTO public.job_masters (id, sku_code, cylinder_sku, job_name, created_at) VALUES
      ('JM-2026-569', 'SKU-2026-700', 'CYL-2026-0428', 'High job master', '2026-03-01 00:00:00+00'),
      ('JM-2026-900', 'SKU-CYL-900', 'SKU-CYL-900', 'Same code pair', '2026-04-01 00:00:00+00'),
      ('SIL/DOC/101', 'SKU-CHOCO', 'SKU-CHOCO', 'Chocovalley Masterpiece Inner (Twist)', '2026-01-02 00:00:00+00');
  `);
  await db.exec(oldMigration);
  await db.exec(newMigration);
  await db.exec(newMigration);
  return db;
}

test('the allocator counts every prefix and a new code cannot reuse a number', async () => {
  const db = await database();

  await db.query(`UPDATE public.cylinders SET job_name = 'Darshan kept' WHERE id = '1794460369213'`);
  const kept = await db.query(`SELECT sku, job_name FROM public.cylinders WHERE id = '1794460369213'`);
  assert.equal(kept.rows[0].sku, 'SKU-2026-514');
  assert.equal(kept.rows[0].job_name, 'Darshan kept');

  await assert.rejects(
    () => db.query(`INSERT INTO public.cylinders (id, sku, job_name) VALUES ('clash-420', 'SKU-CYL-420', 'Clash')`),
    /already used by another cylinder code/i
  );
  await assert.rejects(
    () => db.query(`INSERT INTO public.cylinders (id, sku, job_name) VALUES ('clash-514', 'SKU-CYL-0514', 'Clash')`),
    /already used by another cylinder code/i
  );

  await db.query(`INSERT INTO public.cylinders (id, sku, job_name) VALUES ('pair-900', 'SKU-CYL-900', 'Same code as its job master')`);
  const paired = await db.query(`SELECT sku FROM public.cylinders WHERE id = 'pair-900'`);
  assert.equal(paired.rows[0].sku, 'SKU-CYL-900');

  const screens = [];
  for (let i = 0; i < 6; i += 1) {
    const issued = await db.query(`SELECT public.allocate_cylinder_sku(1) AS issued`);
    screens.push(issued.rows[0].issued[0]);
  }
  assert.deepEqual(screens, [
    'SKU-CYL-901',
    'SKU-CYL-902',
    'SKU-CYL-903',
    'SKU-CYL-904',
    'SKU-CYL-905',
    'SKU-CYL-906'
  ]);
  const numbers = screens.map((code) => cylinderCodeSerial(code));
  assert.equal(new Set(numbers).size, numbers.length);
  for (const number of [514, 420, 428, 600, 700, 900]) {
    assert.equal(numbers.includes(number), false);
  }

  await assert.rejects(
    () => db.query(`INSERT INTO public.cylinders (id, sku, job_name) VALUES ('other-prefix', 'SKU-2026-901', 'Reserved number')`),
    /already used by another cylinder code/i
  );
  await db.query(`INSERT INTO public.cylinders (id, sku, job_name) VALUES ('issued', 'SKU-CYL-901', 'First screen')`);
  const next = await db.query(`SELECT public.allocate_cylinder_sku(1) AS issued`);
  assert.deepEqual(next.rows[0].issued, ['SKU-CYL-907']);

  const chocovalley = await db.query(`SELECT job_name FROM public.job_masters WHERE id = 'SIL/DOC/101'`);
  assert.equal(chocovalley.rows[0].job_name, 'Chocovalley Masterpiece Inner (Twist)');
  await assert.rejects(
    () => db.query(`INSERT INTO public.job_masters (id, sku_code, job_name) VALUES ('SIL/DOC/101', 'SKU-NEW', 'Overwrite')`),
    /duplicate key|job_masters_pkey/i
  );
  const jm = await db.query(`SELECT public.allocate_job_master_id(1) AS issued`);
  assert.equal(jm.rows[0].issued[0].startsWith('JM-2026-'), true);
  assert.notEqual(jm.rows[0].issued[0], 'SIL/DOC/101');

  await db.close();
});
