import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261024060000_barcode_print_log.sql', import.meta.url),
  'utf8'
);
const rollbackSql = fs.readFileSync(
  new URL('../supabase/rollback/20261024060000_barcode_print_log_rollback.sql', import.meta.url),
  'utf8'
);

async function ready(db) {
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE private.print_probe (allowed boolean NOT NULL);
    INSERT INTO private.print_probe VALUES (true);
    CREATE OR REPLACE FUNCTION private.can_any(modules text[])
    RETURNS boolean
    LANGUAGE sql
    STABLE
    AS $$ SELECT allowed FROM private.print_probe $$;

    CREATE TABLE auth.session_probe (role text, uid uuid);
    INSERT INTO auth.session_probe VALUES ('service_role', NULL);
    CREATE OR REPLACE FUNCTION auth.role()
    RETURNS text
    LANGUAGE sql
    STABLE
    AS $$ SELECT role FROM auth.session_probe $$;
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$ SELECT uid FROM auth.session_probe $$;

    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
  `);
  await db.exec(migrationSql);
}

function record(barcode, jobId, status, printer = 'Zebra-Dock-1') {
  return `
    SELECT public.record_barcode_print(
      '${barcode}',
      '${jobId}',
      '${status}',
      '${printer}',
      '2026-10-24 04:00:00+00',
      'Store Clerk',
      'Raw material / GRN'
    ) AS result
  `;
}

test('print log accepts a printer job and ignores dialog events', async () => {
  const db = new PGlite();
  await ready(db);

  const options = await db.query(`
    SELECT c.reloptions
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'barcode_print_status'
  `);
  assert.match(String(options.rows[0].reloptions), /security_invoker=true/);

  const grants = await db.query(`
    SELECT grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'record_barcode_print'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  `);
  assert.deepEqual(grants.rows.map((row) => row.grantee), ['authenticated']);

  const printed = await db.query(record('RM-BC-1', 'job-1', 'printed'));
  const body = printed.rows[0].result;
  assert.equal(body.counts_as_printed, true);
  assert.equal(body.job_status, 'printed');
  assert.equal(body.duplicate, false);

  const again = await db.query(record('RM-BC-1', 'job-1', 'printed'));
  assert.equal(again.rows[0].result.duplicate, true);

  await assert.rejects(
    () => db.query(record('FG-BC-9', 'job-1', 'printed')),
    /different barcode/
  );

  const success = await db.query(record('RM-BC-1', 'job-2', 'success', 'Zebra-Dock-2'));
  assert.equal(success.rows[0].result.job_status, 'printed');

  const cancelled = await db.query(record('FG-BC-2', 'job-cancel', 'cancelled'));
  assert.equal(cancelled.rows[0].result.counts_as_printed, false);

  await assert.rejects(() => db.query(record('RM-BC-1', 'job-dialog', 'afterprint')), /not a printer result/);
  await assert.rejects(() => db.query(record('RM-BC-1', 'job-open', 'opened')), /not a printer result/);
  await assert.rejects(
    () => db.query(`
      SELECT public.record_barcode_print('RM-BC-1', '', 'printed', 'Zebra-Dock-1', '2026-10-24 04:00:00+00', 'Store Clerk', NULL)
    `),
    /job id/
  );

  await assert.rejects(
    () => db.query(record('RM-BC-1', 'browser-printed', 'printed', 'browser')),
    /cannot be recorded as printed/
  );

  await db.exec(`UPDATE auth.session_probe SET role = 'authenticated'`);
  const browser = await db.query(record('FG-BC-8', 'browser-job-1', 'sent_to_browser', 'browser'));
  assert.equal(browser.rows[0].result.counts_as_printed, false);
  assert.equal(browser.rows[0].result.job_status, 'sent_to_browser');
  assert.equal(browser.rows[0].result.printer, 'browser');

  await assert.rejects(
    () => db.query(record('FG-BC-8', 'browser-job-printed', 'printed', 'Zebra-Dock-1')),
    /print agent/
  );

  await db.exec(`UPDATE private.print_probe SET allowed = false`);
  await assert.rejects(
    () => db.query(record('RM-BC-1', 'job-denied', 'sent_to_browser', 'browser')),
    /barcodes permission/
  );
  await db.exec(`UPDATE private.print_probe SET allowed = true`);

  const visible = await db.query(`
    SELECT barcode, job_id, printer
    FROM public.barcode_print_status
    ORDER BY barcode, job_id
  `);
  assert.deepEqual(visible.rows.map((row) => row.barcode), ['RM-BC-1']);
  assert.equal(visible.rows.some((row) => row.barcode === 'FG-BC-2'), false);
  assert.equal(visible.rows.some((row) => row.printer === 'browser'), false);

  const attempts = await db.query(`
    SELECT barcode, job_status
    FROM public.barcode_print_attempts
    ORDER BY barcode
  `);
  assert.ok(attempts.rows.some((row) => row.barcode === 'FG-BC-8' && row.job_status === 'sent_to_browser'));

  await db.exec(rollbackSql);
  const left = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'barcode_print_log'
  `);
  assert.equal(left.rows.length, 0);
});
