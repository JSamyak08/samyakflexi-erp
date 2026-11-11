import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261111183000_freeze_completed_print_progress.sql', import.meta.url),
  'utf8'
);

const OPERATOR = '11111111-1111-4111-8111-111111111111';

const keptRolls = [
  { barcodeId: 'RM-KEEP-1', consumedWeightKg: '40', initialWeightKg: '80' },
  { barcodeId: 'RM-KEEP-2', consumedWeightKg: '12', initialWeightKg: '12' }
];

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE SCHEMA private;
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE OR REPLACE FUNCTION public.order_is_manually_closed(p_close_mode text, p_job_details jsonb)
    RETURNS boolean
    LANGUAGE sql
    IMMUTABLE
    AS $$
      SELECT COALESCE(p_close_mode, '') = 'manual'
        OR COALESCE(p_job_details->>'closeMode', '') = 'manual'
    $$;
    CREATE OR REPLACE FUNCTION private.log_print_run_event(
      p_action text,
      p_order_id text,
      p_machine_id text,
      p_job_name text,
      p_started timestamptz,
      p_ended timestamptz,
      p_next_process text
    )
    RETURNS void
    LANGUAGE sql
    AS $$ SELECT NULL::void $$;
    CREATE OR REPLACE FUNCTION private.sync_job_roll_issues(p_order_id text, p_record_id text, p_origin text)
    RETURNS jsonb
    LANGUAGE sql
    AS $$ SELECT '[]'::jsonb $$;
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text,
      client_name text,
      status text,
      job_details jsonb,
      printing_status text,
      printing_start_time timestamptz,
      printing_end_time timestamptz,
      printing_duration_minutes numeric,
      printing_duration_formatted text,
      actual_meters_printed numeric,
      ink_gsm_in_speed numeric,
      printed_output_kg numeric,
      printing_notes text,
      machine_id text,
      job_master_id text,
      close_mode text
    );
    GRANT USAGE ON SCHEMA auth, private TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.order_is_manually_closed(text, jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.log_print_run_event(text, text, text, text, timestamptz, timestamptz, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.sync_job_roll_issues(text, text, text) TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
  `);
  await db.exec(migrationSql);
  const envelope = JSON.stringify({
    inputRollsList: keptRolls,
    printingStatus: 'Completed',
    isPrintingCompleted: true
  });
  await db.query(
    `INSERT INTO public.orders (
      id, job_name, client_name, status, close_mode, printing_status,
      printing_start_time, printing_end_time, actual_meters_printed, printed_output_kg,
      printing_notes, machine_id, job_details
    ) VALUES
      ($1, $2, 'Client', 'In Production', NULL, 'Completed',
       '2026-11-11T06:00:00.000Z', '2026-11-11T11:47:15.953Z', 1200, 90,
       'kept note', 'MAC-1', $3::jsonb),
      ('ORD-LIVE', 'Live job ||| {"inputRollsList":[{"barcodeId":"RM-LIVE"}]}', 'Client', 'In Production', NULL, 'In Production',
       '2026-11-11T08:00:00.000Z', NULL, NULL, NULL,
       NULL, 'MAC-LIVE', '{"printingStatus":"In Production","isPrintingCompleted":false,"inputRollsList":[{"barcodeId":"RM-LIVE","consumedWeightKg":"1"}]}'::jsonb)`,
    ['ORD-DONE', `Finished job ||| ${envelope}`, JSON.stringify({
      printingStatus: 'Completed',
      isPrintingCompleted: true,
      inputRollsList: keptRolls,
      printingNotes: 'kept note'
    })]
  );
  return db;
}

async function asOperator(db) {
  await db.exec('RESET ROLE');
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${OPERATOR}', false)`);
  await db.exec('SET ROLE authenticated');
}

async function orderRow(db, id) {
  await db.exec('RESET ROLE');
  const result = await db.query(
    `SELECT printing_status, printing_end_time, actual_meters_printed, printing_notes, machine_id, job_details, job_name
     FROM public.orders WHERE id = $1`,
    [id]
  );
  await asOperator(db);
  return result.rows[0];
}

test('progress on a completed print run does not change input rolls or other run data', async () => {
  const db = await database();
  await asOperator(db);
  const before = await orderRow(db, 'ORD-DONE');
  const saved = await db.query(
    `SELECT public.record_print_run($1, 'progress', $2::jsonb) AS run`,
    ['ORD-DONE', JSON.stringify({
      inputRollsList: [{ barcodeId: '', consumedWeightKg: '142.8', initialWeightKg: '142.8' }],
      machineId: 'MAC-STALE',
      actualMetersPrinted: 1,
      printedOutputKg: 1,
      printingNotes: 'stale tab',
      inkGsmInSpeed: 9
    })]
  );
  assert.equal(saved.rows[0].run.inputRollsList.length, 2);
  assert.equal(saved.rows[0].run.inputRollsList[0].barcodeId, 'RM-KEEP-1');
  assert.equal(saved.rows[0].run.machineId, 'MAC-1');
  assert.equal(saved.rows[0].run.printingNotes, 'kept note');
  assert.equal(Number(saved.rows[0].run.actualMetersPrinted), 1200);
  const after = await orderRow(db, 'ORD-DONE');
  assert.deepEqual(after.job_details.inputRollsList, before.job_details.inputRollsList);
  assert.equal(after.job_name, before.job_name);
  assert.equal(after.machine_id, 'MAC-1');
  assert.equal(after.printing_notes, 'kept note');
  assert.equal(Number(after.actual_meters_printed), 1200);
  assert.equal(after.printing_status, 'Completed');
  await db.close();
});

test('progress on a running print run still saves the input roll list', async () => {
  const db = await database();
  await asOperator(db);
  const nextRolls = [
    { barcodeId: 'RM-LIVE', consumedWeightKg: '20', initialWeightKg: '40' },
    { barcodeId: 'RM-LIVE-2', consumedWeightKg: '5', initialWeightKg: '30' }
  ];
  const saved = await db.query(
    `SELECT public.record_print_run('ORD-LIVE', 'progress', $1::jsonb) AS run`,
    [JSON.stringify({ inputRollsList: nextRolls, machineId: 'MAC-LIVE' })]
  );
  assert.equal(saved.rows[0].run.printingStatus, 'In Production');
  assert.equal(saved.rows[0].run.isPrintingCompleted, false);
  assert.equal(saved.rows[0].run.inputRollsList.length, 2);
  assert.equal(saved.rows[0].run.inputRollsList[1].barcodeId, 'RM-LIVE-2');
  const after = await orderRow(db, 'ORD-LIVE');
  assert.equal(after.job_details.inputRollsList[1].barcodeId, 'RM-LIVE-2');
  assert.equal(after.printing_end_time, null);
  assert.equal(after.printing_status, 'In Production');
  await db.close();
});
