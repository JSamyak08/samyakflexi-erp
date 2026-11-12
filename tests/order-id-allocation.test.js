import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { recordsAfterDataLoad } from '../src/utils/loadedRecords.js';
import { reportBackgroundFailure, resetFailureToasts, showFailureToast } from '../src/utils/backgroundFailure.js';

const root = new URL('..', import.meta.url);
const migrationSql = fs.readFileSync(new URL('../supabase/migrations/20261112130000_allocate_order_id.sql', import.meta.url), 'utf8');
const repairSql = fs.readFileSync(new URL('../supabase/manual/20261112_restore_ord_2026_101_and_relink.sql', import.meta.url), 'utf8');

const KEPT_KEYWORDS = [
  'Chocolate Bites',
  'Aadi Chemtrade',
  'ISS-176883652985',
  'CON-BC-20260816-533'
];

function readSrc(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (/\.(js|jsx)$/.test(entry.name)) found.push(full);
  }
  return found;
}

test('a record containing the old dummy keywords survives a data load', () => {
  const rows = [
    { id: 'ORD-2026-201', jobName: 'Darshan Chocolate Bites 80mm Inner', clientName: 'Aadi Chemtrade' },
    { id: 'ISS-176883652985', note: 'kept' },
    { grnNo: 'CON-BC-20260816-533', vendor: 'Aadi Chemtrade' },
    { id: 'ORD-2026-101', jobName: 'Chocovalley Sniper Inner' }
  ];
  assert.deepEqual(recordsAfterDataLoad(rows), rows);
  const loaded = JSON.stringify(recordsAfterDataLoad(rows));
  for (const keyword of KEPT_KEYWORDS) {
    assert.match(loaded, new RegExp(keyword));
  }
});

test('page load does not delete records and order numbers are not taken from the browser', () => {
  const srcDir = path.join(root.pathname, 'src');
  const files = walk(srcDir);
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /isDummyRecord|DUMMY_KEYWORDS|stripDummyRecords|purgeLegacyMockData/);
    if (!file.endsWith(`${path.sep}settingsService.js`)) {
      assert.doesNotMatch(text, /getNextDocRefNumber\(\s*['"]order['"]\s*\)/);
    }
  }

  const settings = readSrc('src/services/settingsService.js');
  const getter = settings.slice(
    settings.indexOf('export function getNextDocRefNumber'),
    settings.indexOf('export function syncOcnCounterWithRecords')
  );
  assert.match(getter, /type === 'order'/);
  assert.match(getter, /allocate_order_id/);
  assert.doesNotMatch(getter, /orderCounter/);

  for (const file of [
    'src/components/JobPunchingForm.jsx',
    'src/components/SalesManagement.jsx',
    'src/components/InventoryManagement.jsx',
    'src/App.jsx'
  ]) {
    assert.match(readSrc(file), /allocateOrderIdFromServer\(/);
  }

  const app = readSrc('src/App.jsx');
  const loadStart = app.indexOf('async function loadSupabaseData');
  const loadEnd = app.indexOf('loadSupabaseData();');
  assert.ok(loadStart > 0 && loadEnd > loadStart);
  const loadBody = app.slice(loadStart, loadEnd);
  assert.match(loadBody, /recordsAfterDataLoad/);
  assert.doesNotMatch(loadBody, /delete[A-Za-z]+FromSupabase|\.delete\(/);
  const refreshStart = app.indexOf('const refreshEntity =');
  const refreshEnd = app.indexOf('const channel = supabase');
  assert.ok(refreshStart > 0 && refreshEnd > refreshStart);
  assert.doesNotMatch(app.slice(refreshStart, refreshEnd), /delete[A-Za-z]+FromSupabase|\.delete\(/);

  const service = readSrc('src/services/supabaseDataService.js');
  const save = service.slice(
    service.indexOf('export async function saveOrderToSupabase'),
    service.indexOf('export async function deleteOrderFromSupabase')
  );
  assert.match(save, /\.insert\(row\)/);
  assert.match(save, /\.update\(row\)\.eq\('id', order\.id\)/);
  assert.match(save, /mode === 'insert'/);
  assert.doesNotMatch(save, /\.upsert\(/);
  assert.match(save, /orderDuplicateMessage\(order\.id\)/);
  assert.match(service.slice(0, service.indexOf('export async function saveOrderToSupabase')), /already exists/);
  assert.match(app, /saveOrderToSupabase\(newOrder, \{ mode: 'insert' \}\)/);
});

test('a background save failure shows a toast and is reported', () => {
  resetFailureToasts();
  const nodes = [];
  const doc = {
    body: { appendChild(node) { nodes.push(node); } },
    createElement() {
      return { style: {}, dataset: {}, setAttribute() {}, textContent: '' };
    },
    querySelectorAll() { return nodes; }
  };
  const captured = [];
  const error = new Error('connection lost');
  reportBackgroundFailure(error, 'The schedule for order ORD-2026-201 was not saved', {
    toast: (message) => showFailureToast(message, { documentRef: doc, now: 1000 }),
    capture(err, extra) { captured.push({ err, extra }); }
  });
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].dataset.backgroundFailure, 'true');
  assert.match(nodes[0].textContent, /ORD-2026-201/);
  assert.match(nodes[0].textContent, /connection lost/);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].err, error);
  assert.match(captured[0].extra.context, /schedule/);
  reportBackgroundFailure(error, 'The schedule for order ORD-2026-201 was not saved', {
    toast: (message) => showFailureToast(message, { documentRef: doc, now: 2000 }),
    capture() { captured.push('again'); }
  });
  assert.equal(nodes.length, 1);
  assert.equal(captured.length, 2);
});

test('the order allocator continues from the highest ORD-YYYY number and a duplicate insert does not overwrite', async () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'));
  assert.ok(names.includes('20261112130000_allocate_order_id.sql'));
  assert.ok('20261112130000' > '20261112120000');
  assert.match(migrationSql, /allocate_order_id/);
  assert.match(migrationSql, /REVOKE ALL ON FUNCTION public\.allocate_order_id\(integer\) FROM PUBLIC, anon/);
  assert.match(migrationSql, /GRANT EXECUTE ON FUNCTION public\.allocate_order_id\(integer\) TO authenticated, service_role/);
  const allocator = migrationSql.slice(
    migrationSql.indexOf('CREATE OR REPLACE FUNCTION public.allocate_order_id'),
    migrationSql.indexOf('REVOKE ALL ON FUNCTION public.allocate_order_id')
  );
  assert.doesNotMatch(allocator, /orderCounter|localStorage|system_settings/);

  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      client_name text NOT NULL,
      status text
    );
    CREATE TABLE public.job_masters (
      id text PRIMARY KEY
    );
  `);
  const yearRow = await db.query(`SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS year`);
  const year = yearRow.rows[0].year;
  await db.query(
    `INSERT INTO public.orders (id, job_name, client_name, status) VALUES
      ($1, 'Highest real order', 'Kept Client', 'In Progress'),
      ($2, 'Looks like the old browser counter', 'Kept Client', 'In Progress'),
      ('KEEP-CHOCOLATE', 'Darshan Chocolate Bites 80mm Inner', 'Aadi Chemtrade', 'In Progress'),
      ('KEEP-ISSUE', $3, 'ISS-176883652985', 'In Progress'),
      ('KEEP-CONTRACT', 'CON-BC-20260816-533', 'Aadi Chemtrade', 'In Progress')`,
    [`ORD-${year}-185`, `ORD-${year}-102`, 'ISS-176883652985 note']
  );
  await db.exec(`
    CREATE TABLE public.system_settings (
      key text PRIMARY KEY,
      value jsonb
    );
    INSERT INTO public.system_settings (key, value)
    VALUES ('doc_prefixes', '{"orderCounter": 102}'::jsonb);
  `);
  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const first = await db.query(`SELECT public.allocate_order_id(1) AS issued`);
  const second = await db.query(`SELECT public.allocate_order_id(2) AS issued`);
  assert.deepEqual(first.rows[0].issued, [`ORD-${year}-186`]);
  assert.deepEqual(second.rows[0].issued, [`ORD-${year}-187`, `ORD-${year}-188`]);

  await db.query(
    `INSERT INTO public.orders (id, job_name, client_name, status) VALUES ($1, 'Allocated', 'Client', 'In Progress')`,
    [`ORD-${year}-186`]
  );
  const kept = await db.query(`SELECT job_name, client_name FROM public.orders WHERE id = 'KEEP-CHOCOLATE'`);
  assert.equal(kept.rows[0].job_name, 'Darshan Chocolate Bites 80mm Inner');
  assert.equal(kept.rows[0].client_name, 'Aadi Chemtrade');
  const keywords = await db.query(`SELECT id FROM public.orders WHERE id IN ('KEEP-ISSUE', 'KEEP-CONTRACT') ORDER BY id`);
  assert.deepEqual(keywords.rows.map((row) => row.id), ['KEEP-CONTRACT', 'KEEP-ISSUE']);

  await assert.rejects(
    () => db.query(
      `INSERT INTO public.orders (id, job_name, client_name) VALUES ($1, 'Overwrite attempt', 'Someone else')`,
      [`ORD-${year}-185`]
    ),
    /duplicate key|orders_pkey/i
  );
  const original = await db.query(`SELECT job_name FROM public.orders WHERE id = $1`, [`ORD-${year}-185`]);
  assert.equal(original.rows[0].job_name, 'Highest real order');

  const updated = await db.query(
    `UPDATE public.orders SET status = 'Scheduled' WHERE id = $1 RETURNING status`,
    [`ORD-${year}-185`]
  );
  assert.equal(updated.rows[0].status, 'Scheduled');

  const auth = await db.query(`SELECT has_function_privilege('authenticated', 'public.allocate_order_id(integer)', 'EXECUTE') AS ok`);
  const anon = await db.query(`SELECT has_function_privilege('anon', 'public.allocate_order_id(integer)', 'EXECUTE') AS ok`);
  const service = await db.query(`SELECT has_function_privilege('service_role', 'public.allocate_order_id(integer)', 'EXECUTE') AS ok`);
  assert.equal(auth.rows[0].ok, true);
  assert.equal(anon.rows[0].ok, false);
  assert.equal(service.rows[0].ok, true);

  const reserved = await db.query(`SELECT count(*)::int AS n FROM private.order_id_reservations WHERE order_id = $1`, [`ORD-${year}-186`]);
  assert.equal(reserved.rows[0].n, 0);
  await db.close();
});

test('the repair script is manual, rolls back, and relinks the Darshan OCN without overwriting ORD-2026-101', async () => {
  assert.match(repairSql, /PASTE_FROM_BACKUP/);
  assert.match(repairSql, /backups\/2026-11-12-pre-pr123\/orders\.json/);
  assert.match(repairSql, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(repairSql, /allocate_order_id\(1\)/);
  assert.match(repairSql, /Darshan Chocolate Bites 80mm Inner/);
  assert.match(repairSql, /Chocovalley Sniper Inner/);
  assert.doesNotMatch(repairSql, /^\s*COMMIT\s*;/m);
  assert.match(repairSql, /\nROLLBACK;\s*$/);
  const migrations = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url));
  assert.equal(migrations.some((name) => name.includes('restore_ord_2026_101')), false);

  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      client_name text NOT NULL,
      order_type text,
      order_qty_kg numeric,
      status text,
      target_delivery_date date,
      delivery_date date,
      job_details jsonb,
      raw_material_requirements jsonb,
      ocn_number text,
      ocn_id text,
      job_master_id text,
      ink_gsm numeric,
      adhesive_gsm numeric,
      metallocene_pct text,
      wastage_percentage numeric,
      printing_status text,
      machine_id text,
      printing_notes text,
      closed_by text,
      closed_at timestamptz,
      close_reason text,
      close_mode text,
      over_dispatch_warning text,
      original_deadline date,
      revised_deadline date,
      deadline_revised_at timestamptz,
      deadline_revised_by text,
      deadline_revision_reason text,
      client_informed boolean,
      client_informed_at timestamptz,
      client_informed_by text,
      print_active_slot text,
      sfg_consumptions jsonb
    );
    CREATE TABLE public.job_masters (id text PRIMARY KEY);
    CREATE TABLE public.order_confirmations (
      id text PRIMARY KEY,
      ocn_number text,
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
    CREATE TABLE public.production_records (id text PRIMARY KEY, order_id text);
    CREATE TABLE public.job_datasheets (id text PRIMARY KEY, job_id text);
    CREATE TABLE public.production_schedules (id text PRIMARY KEY, order_id text);
    CREATE TABLE public.inventory_rolls (id text PRIMARY KEY, order_id text);
    CREATE TABLE public.dispatch_shipments (id text PRIMARY KEY, order_id text);
    CREATE TABLE public.certificate_of_analyses (id text PRIMARY KEY, order_id text);
    CREATE TABLE public.delivery_challans (id text PRIMARY KEY, order_id text);
  `);
  await db.exec(migrationSql);
  const yearRow = await db.query(`SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS year`);
  const year = yearRow.rows[0].year;
  await db.query(
    `INSERT INTO public.orders (id, job_name, client_name, status) VALUES
      ('ORD-2026-101', 'Keep me', 'Jai Graha Udyog', 'In Progress'),
      ($1, 'Highest', 'Client', 'In Progress')`,
    [`ORD-${year}-185`]
  );
  const darshanPayload = {
    jobName: 'Darshan Chocolate Bites 80mm Inner',
    clientName: 'Darshan Foods',
    orderType: 'Reel',
    orderQtyKg: 500,
    targetDeliveryDate: '2026-12-01',
    orderId: 'ORD-2026-201',
    printWidthMm: 80,
    repeatLengthMm: 400,
    structure: 'PET 12µ',
    layers: [{ filmType: 'PET', micron: 12 }],
    layerResults: [{ filmType: 'PET', micron: 12, widthMm: 80, grossKg: 520, pricePerKg: 150 }]
  };
  await db.query(
    `INSERT INTO public.order_confirmations
      (id, ocn_number, order_id, job_name, client_name, status, revision_no, payload)
     VALUES
      ('SIL/OCN/26-27/151', 'SIL/OCN/26-27/151', 'ORD-2026-201', 'Darshan Chocolate Bites 80mm Inner', 'Darshan Foods', 'Confirmed', 0, $1::jsonb),
      ('SIL/OCN/26-27/150', 'SIL/OCN/26-27/150', 'ORD-2026-201', 'Darshan Chocolate Bites 80mm Inner', 'Darshan Foods', 'Amended', 1, $2::jsonb),
      ('SIL/OCN/26-27/145', 'SIL/OCN/26-27/145', NULL, 'Chocovalley Sniper Inner', 'Jai Graha Udyog', 'Confirmed', 0, '{"jobName":"Chocovalley Sniper Inner"}'::jsonb)`,
    [JSON.stringify(darshanPayload), JSON.stringify({ ...darshanPayload, ocnNumber: 'SIL/OCN/26-27/150' })]
  );

  const runnable = repairSql.replace(/\nROLLBACK;\s*$/, '\n');
  await db.exec(runnable);

  const original = await db.query(`SELECT job_name, client_name, status FROM public.orders WHERE id = 'ORD-2026-101'`);
  assert.equal(original.rows[0].job_name, 'Keep me');
  assert.equal(original.rows[0].client_name, 'Jai Graha Udyog');

  const created = await db.query(
    `SELECT id, client_name, status, order_qty_kg, ocn_number, job_master_id, raw_material_requirements
     FROM public.orders
     WHERE job_name ILIKE '%Darshan Chocolate Bites 80mm Inner%'
       AND id <> 'ORD-2026-101'`
  );
  assert.equal(created.rows.length, 1);
  assert.equal(created.rows[0].id, `ORD-${year}-186`);
  assert.equal(created.rows[0].client_name, 'Darshan Foods');
  assert.equal(created.rows[0].status, 'In Progress');
  assert.equal(Number(created.rows[0].order_qty_kg), 500);
  assert.equal(created.rows[0].ocn_number, 'SIL/OCN/26-27/151');
  assert.equal(created.rows[0].job_master_id, null);
  const lines = created.rows[0].raw_material_requirements;
  assert.equal(lines[0].id, `REQ-ORD-${year}-186-1`);
  assert.equal(lines[0].filmType, 'PET');
  assert.equal(Number(lines[0].qtyKg), 520);

  const ocns = await db.query(`SELECT id, order_id FROM public.order_confirmations ORDER BY id`);
  const byId = Object.fromEntries(ocns.rows.map((row) => [row.id, row.order_id]));
  assert.equal(byId['SIL/OCN/26-27/151'], `ORD-${year}-186`);
  assert.equal(byId['SIL/OCN/26-27/150'], `ORD-${year}-186`);
  assert.equal(byId['SIL/OCN/26-27/145'], 'ORD-2026-101');

  const notes = await db.query(`SELECT ord_101_inserted, ocn_151_relinked, ocn_150_relinked, ocn_145_kept FROM restore_notes`);
  assert.equal(notes.rows[0].ord_101_inserted, false);
  assert.equal(notes.rows[0].ocn_151_relinked, true);
  assert.equal(notes.rows[0].ocn_150_relinked, true);
  assert.equal(notes.rows[0].ocn_145_kept, true);
  await db.close();
});
