import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('..', import.meta.url);
const migrationName = '20261121130000_packing_list_numbers.sql';
const migrationSql = fs.readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');

function readSrc(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, found);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

async function database(rowsSql) {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.dispatch_shipments (
      dispatch_id text PRIMARY KEY,
      id text,
      order_id text,
      job_name text,
      client_name text,
      vehicle_no text,
      lr_no text,
      transporter_name text,
      po_no text,
      invoice_no text,
      dispatch_date timestamptz,
      total_rolls integer,
      total_net_weight_kg numeric,
      total_gross_weight_kg numeric,
      items jsonb,
      hide_branding boolean,
      packing_status text,
      payload jsonb,
      created_at timestamptz,
      updated_at timestamptz
    );
    CREATE TABLE public.packing_list_consumptions (
      id text PRIMARY KEY,
      packing_list_id text NOT NULL,
      order_id text,
      job_name text,
      job_code text,
      barcode text,
      consumed_kg numeric NOT NULL,
      operator_name text,
      consumed_by text,
      consumed_at timestamptz NOT NULL,
      shift text,
      target_machine text,
      notes text
    );
    ${rowsSql}
  `);
  await db.exec(migrationSql);
  await db.exec(`
    CREATE OR REPLACE FUNCTION private.app_role()
    RETURNS text LANGUAGE sql AS $$ SELECT 'Admin'::text $$;
    CREATE OR REPLACE FUNCTION private.can_any(modules text[])
    RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE OR REPLACE FUNCTION private.packing_shipment_json(p_dispatch_id text)
    RETURNS jsonb LANGUAGE sql AS $$
      SELECT jsonb_build_object('dispatchId', p_dispatch_id)
    $$;
  `);
  return db;
}

test('the packing list migration is after the accounts role constraint and does not drop production objects', () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const previous = '20261121120000_allow_accounts_role_in_users.sql';
  assert.ok(names.includes(previous));
  assert.ok(names.indexOf(migrationName) > names.indexOf(previous));
  assert.ok(migrationName.slice(0, 14) >= '20261121130000');
  assert.doesNotMatch(migrationSql, /DROP TABLE/i);
  assert.doesNotMatch(migrationSql, /DROP FUNCTION/i);
  assert.doesNotMatch(migrationSql, /DROP COLUMN/i);
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.match(migrationSql, /pg_advisory_xact_lock\(hashtext\('samyak-pl-no'\)\)/);
  assert.match(migrationSql, /GRANT EXECUTE ON FUNCTION public\.allocate_packing_list_no\(\) TO authenticated, service_role/);
  assert.match(migrationSql, /REVOKE ALL ON FUNCTION public\.allocate_packing_list_no\(\) FROM PUBLIC, anon/);
  const allocator = migrationSql.slice(
    migrationSql.indexOf('CREATE OR REPLACE FUNCTION private.allocate_packing_list_no'),
    migrationSql.indexOf('REVOKE ALL ON FUNCTION private.allocate_packing_list_no')
  );
  assert.doesNotMatch(allocator, /system_settings|doc_prefixes|plCounter|localStorage/);
  const consumption = migrationSql.slice(
    migrationSql.indexOf('CREATE OR REPLACE FUNCTION private.record_dispatch_packing_consumption'),
    migrationSql.lastIndexOf('$$;')
  );
  assert.doesNotMatch(consumption, /suggestedDispatchId|plCounter|md5\(/);
});

test('the browser no longer chooses a packing list number', () => {
  const srcDir = path.join(root.pathname, 'src');
  for (const file of walk(srcDir)) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /getNextDocRefNumber\(\s*['"]pl['"]\s*\)/);
    assert.doesNotMatch(text, /getNextDocRefNumber\(\s*['"]packing['"]\s*\)/);
    assert.doesNotMatch(text, /generateDocRefNumber\(\s*['"]pl['"]\s*\)/);
  }

  const settings = readSrc('src/services/settingsService.js');
  const getter = settings.slice(
    settings.indexOf('export function getNextDocRefNumber'),
    settings.indexOf('export function syncOcnCounterWithRecords')
  );
  assert.match(getter, /allocate_packing_list_no/);
  assert.doesNotMatch(getter, /plCounter/);

  const dispatch = readSrc('src/components/DispatchManagement.jsx');
  assert.match(dispatch, /allocatePackingListNo\(/);
  assert.match(dispatch, /releasePackingListNo\(/);
  assert.match(dispatch, /insertOnly: !editingExisting/);
  assert.match(dispatch, /readOnly/);
  assert.match(dispatch, /data-testid="packing-list-number"/);

  const service = readSrc('src/services/supabaseDataService.js');
  const save = service.slice(
    service.indexOf('export async function saveDispatchShipmentToSupabase'),
    service.indexOf('export async function deleteDispatchShipmentFromSupabase')
  );
  assert.match(save, /insertOnly/);
  assert.match(save, /\.insert\(fullPayload\)/);
  assert.match(save, /\.update\(fullPayload\)/);
  assert.match(save, /\.eq\('dispatch_id', fullPayload\.dispatch_id\)/);
  assert.doesNotMatch(save, /\.upsert\(/);
  assert.match(service, /allocatePackingListNo/);

  const app = readSrc('src/App.jsx');
  assert.match(app, /saveDispatchShipmentToSupabase\(shipmentToSave, \{ insertOnly \}\)/);
  assert.doesNotMatch(app, /suggestedDispatchId = getNextDocRefNumber/);
});

test('the next packing list number continues after the highest PL-YYYY serial and an insert cannot overwrite', async () => {
  const db = await database(`
    INSERT INTO public.dispatch_shipments (dispatch_id, id, job_name, client_name, payload, packing_status)
    VALUES
      ('PL-2026-606130', 'DISP-PL-OLD', 'Zain pouch', 'Zain Natural', '{"dispatchId":"PL-2026-606130","id":"DISP-PL-OLD"}', 'Finalised'),
      ('PL-2026-606137', 'DISP-PL-HIGH', 'Skygo pouch', 'Skygo', '{"dispatchId":"PL-2026-606137"}', 'Finalised'),
      ('PL-2026-b8dd2a72', 'DISP-PL-HASH', 'Hash job', 'Nyra', '{"dispatchId":"PL-2026-b8dd2a72"}', 'Open'),
      ('PL-2025-999999', 'DISP-PL-OLD-YEAR', 'Last year', 'Nyra', '{"dispatchId":"PL-2025-999999"}', 'Finalised');
  `);

  const first = await db.query(`SELECT public.allocate_packing_list_no() AS n`);
  const second = await db.query(`SELECT public.allocate_packing_list_no() AS n`);
  assert.equal(first.rows[0].n, 'PL-2026-606138');
  assert.equal(second.rows[0].n, 'PL-2026-606139');
  await db.query(`SELECT public.release_packing_list_no('PL-2026-606139')`);
  const reused = await db.query(`SELECT public.allocate_packing_list_no() AS n`);
  assert.equal(reused.rows[0].n, 'PL-2026-606139');

  await assert.rejects(
    () => db.query(`
      INSERT INTO public.dispatch_shipments (dispatch_id, id, job_name, client_name, payload)
      VALUES ('PL-2026-606130', 'DISP-PL-NEW', 'Replaced job', 'Replaced client', '{}')
    `),
    /already used/
  );
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.dispatch_shipments (dispatch_id, id, job_name, client_name, payload)
      VALUES ('PL-2026-606130', 'DISP-PL-NEW', 'Replaced job', 'Replaced client', '{}')
      ON CONFLICT (dispatch_id) DO UPDATE
      SET id = EXCLUDED.id, job_name = EXCLUDED.job_name, client_name = EXCLUDED.client_name
    `),
    /already used|cannot overwrite/
  );

  const kept = await db.query(`SELECT id, job_name, client_name FROM public.dispatch_shipments WHERE dispatch_id = 'PL-2026-606130'`);
  assert.equal(kept.rows[0].id, 'DISP-PL-OLD');
  assert.equal(kept.rows[0].job_name, 'Zain pouch');
  assert.equal(kept.rows[0].client_name, 'Zain Natural');

  await db.query(`
    UPDATE public.dispatch_shipments
    SET vehicle_no = 'MP-09-AB-1234', client_name = 'Zain Natural'
    WHERE dispatch_id = 'PL-2026-606130'
  `);
  const edited = await db.query(`SELECT dispatch_id, id, vehicle_no, client_name FROM public.dispatch_shipments WHERE id = 'DISP-PL-OLD'`);
  assert.equal(edited.rows[0].dispatch_id, 'PL-2026-606130');
  assert.equal(edited.rows[0].vehicle_no, 'MP-09-AB-1234');

  await assert.rejects(
    () => db.query(`UPDATE public.dispatch_shipments SET id = 'DISP-PL-NEW' WHERE dispatch_id = 'PL-2026-606130'`),
    /cannot overwrite/
  );
  await assert.rejects(
    () => db.query(`UPDATE public.dispatch_shipments SET dispatch_id = 'PL-2026-606200' WHERE id = 'DISP-PL-OLD'`),
    /cannot be changed/
  );
  const still = await db.query(`SELECT dispatch_id FROM public.dispatch_shipments WHERE id = 'DISP-PL-OLD'`);
  assert.equal(still.rows[0].dispatch_id, 'PL-2026-606130');

  const created = await db.query(`
    SELECT private.record_dispatch_packing_consumption($1::jsonb) AS result
  `, [JSON.stringify({
    id: 'SFG-LOG-QA',
    orderId: 'ORD-NEW',
    jobName: 'Fresh job',
    consumedKg: 12,
    targetProcess: 'Dispatch Packing',
    clientName: 'QA Client',
    suggestedDispatchId: 'PL-2026-606130'
  })]);
  assert.equal(created.rows[0].result.dispatchId, 'PL-2026-606140');
  assert.equal(created.rows[0].result.created, true);
  const untouched = await db.query(`SELECT job_name FROM public.dispatch_shipments WHERE dispatch_id = 'PL-2026-606130'`);
  assert.equal(untouched.rows[0].job_name, 'Zain pouch');
  await db.close();
});

test('a year with no packing lists starts at PL-YYYY-000001 and a 7-digit serial is not truncated', async () => {
  const empty = await database('');
  const first = await empty.query(`SELECT public.allocate_packing_list_no() AS n`);
  assert.equal(first.rows[0].n, 'PL-2026-000001');
  await empty.close();

  const wide = await database(`
    INSERT INTO public.dispatch_shipments (dispatch_id, id, job_name, client_name)
    VALUES ('PL-2026-999999', 'DISP-PL-WIDE', 'Wide', 'Wide Client');
  `);
  const next = await wide.query(`SELECT public.allocate_packing_list_no() AS n`);
  assert.equal(next.rows[0].n, 'PL-2026-1000000');
  await wide.close();
});
