import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const printLogSql = fs.readFileSync(
  new URL('../supabase/migrations/20261024060000_barcode_print_log.sql', import.meta.url),
  'utf8'
);
const qzSql = fs.readFileSync(
  new URL('../supabase/migrations/20261024070000_barcode_qz_print.sql', import.meta.url),
  'utf8'
);
const rollbackSql = fs.readFileSync(
  new URL('../supabase/rollback/20261024070000_barcode_qz_print_rollback.sql', import.meta.url),
  'utf8'
);

function settle(action, jobId, printer, barcode, spooler, printedBy = 'Store Clerk') {
  const status = spooler == null ? 'NULL' : `'${spooler}'`;
  const code = barcode == null ? 'NULL' : `'${barcode}'`;
  return `
    SELECT public.settle_barcode_print_job(
      '${action}',
      '${jobId}',
      '${printer}',
      ${code},
      ${status},
      '${printedBy}',
      'Raw material / GRN'
    ) AS result
  `;
}

test('QZ settle records Printed only from a finished spooler status on an allow-listed printer', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE private.print_probe (allowed boolean NOT NULL);
    INSERT INTO private.print_probe VALUES (true);
    CREATE OR REPLACE FUNCTION private.can_any(modules text[])
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT allowed FROM private.print_probe $$;
    CREATE TABLE auth.session_probe (role text, uid uuid);
    INSERT INTO auth.session_probe VALUES ('service_role', NULL);
    CREATE OR REPLACE FUNCTION auth.role()
    RETURNS text LANGUAGE sql STABLE AS $$ SELECT role FROM auth.session_probe $$;
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT uid FROM auth.session_probe $$;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
  `);
  await db.exec(printLogSql);
  await db.exec(qzSql);

  const grants = await db.query(`
    SELECT grantee FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'settle_barcode_print_job'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  `);
  assert.equal(grants.rows.length, 0);

  await db.exec(`INSERT INTO public.barcode_printer_allowlist (printer_name, created_by) VALUES ('TSC TE244', 'Store')`);

  await assert.rejects(
    () => db.query(settle('open', 'job-browser', 'browser', 'RM-BC-1', null)),
    /browser/
  );
  await assert.rejects(
    () => db.query(settle('open', 'job-other', 'Office Laser', 'RM-BC-1', null)),
    /allow list/
  );

  const opened = await db.query(settle('open', 'job-tsc', 'TSC TE244', 'RM-BC-1', null));
  assert.equal(opened.rows[0].result.job_status, 'queued');
  assert.equal(opened.rows[0].result.counts_as_printed, false);

  await assert.rejects(
    () => db.query(settle('settle', 'job-tsc', 'TSC TE244', 'RM-BC-1', 'PRINTING')),
    /not a finished job/
  );

  const printed = await db.query(settle('settle', 'job-tsc', 'TSC TE244', 'RM-BC-1', 'PRINTED'));
  assert.equal(printed.rows[0].result.job_status, 'printed');
  assert.equal(printed.rows[0].result.counts_as_printed, true);
  assert.equal(printed.rows[0].result.spooler_status, 'PRINTED');

  const again = await db.query(settle('settle', 'job-tsc', 'TSC TE244', 'RM-BC-1', 'ERROR'));
  assert.equal(again.rows[0].result.duplicate, true);
  assert.equal(again.rows[0].result.job_status, 'printed');

  const failed = await db.query(settle('open', 'job-fail', 'TSC TE244', 'FG-BC-2', null));
  assert.equal(failed.rows[0].result.job_status, 'queued');
  const paper = await db.query(settle('settle', 'job-fail', 'TSC TE244', 'FG-BC-2', 'PAPER OUT'));
  assert.equal(paper.rows[0].result.job_status, 'failed');
  assert.equal(paper.rows[0].result.counts_as_printed, false);

  const dropped = await db.query(settle('open', 'job-drop', 'TSC TE244', 'FG-BC-3', null));
  assert.equal(dropped.rows[0].result.counts_as_printed, false);
  const deleted = await db.query(settle('settle', 'job-drop', 'TSC TE244', 'FG-BC-3', 'DELETED'));
  assert.equal(deleted.rows[0].result.job_status, 'cancelled');

  await db.query(settle('open', 'job-both', 'TSC TE244', 'RM-BC-4', null));
  const both = await db.query(settle('settle', 'job-both', 'TSC TE244', 'RM-BC-4', 'PRINTING, PRINTED'));
  assert.equal(both.rows[0].result.job_status, 'printed');
  assert.equal(both.rows[0].result.spooler_status, 'PRINTING_PRINTED');

  await assert.rejects(
    () => db.query(`
      SELECT public.record_barcode_print(
        'RM-BC-1', 'job-browser-printed', 'printed', 'browser',
        '2026-10-24 05:00:00+00', 'Store Clerk', NULL
      )
    `),
    /cannot be recorded as printed/
  );

  const visible = await db.query(`
    SELECT barcode, printer FROM public.barcode_print_status ORDER BY barcode
  `);
  assert.deepEqual(visible.rows, [
    { barcode: 'RM-BC-1', printer: 'TSC TE244' },
    { barcode: 'RM-BC-4', printer: 'TSC TE244' },
  ]);

  await db.exec(`UPDATE auth.session_probe SET role = 'authenticated'`);
  await assert.rejects(
    () => db.query(settle('open', 'job-user', 'TSC TE244', 'RM-BC-9', null)),
    /print function/
  );

  const allowed = await db.query(`SELECT public.caller_has_barcodes() AS ok`);
  assert.equal(allowed.rows[0].ok, true);
  await db.exec(`UPDATE private.print_probe SET allowed = false`);
  const denied = await db.query(`SELECT public.caller_has_barcodes() AS ok`);
  assert.equal(denied.rows[0].ok, false);

  await db.exec(rollbackSql);
  const left = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'barcode_printer_allowlist'
  `);
  assert.equal(left.rows.length, 0);
});
