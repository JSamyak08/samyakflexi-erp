import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261031173000_print_run_keeps_order_close.sql', import.meta.url),
  'utf8'
);

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const SHOP = '33333333-3333-4333-8333-333333333333';
const ADMIN = '22222222-2222-4222-8222-222222222222';

const legacyGuardSql = `
CREATE OR REPLACE FUNCTION public.guard_manual_order_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  allowed boolean;
  new_manual boolean;
  old_manual boolean;
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  new_manual := NEW.close_mode = 'manual'
    OR COALESCE(NEW.job_details->>'closeMode', '') = 'manual';
  old_manual := TG_OP = 'UPDATE' AND (
    OLD.close_mode = 'manual'
    OR COALESCE(OLD.job_details->>'closeMode', '') = 'manual'
  );

  IF new_manual IS NOT DISTINCT FROM old_manual AND NOT (old_manual AND NEW.status IS DISTINCT FROM 'Completed' AND OLD.status = 'Completed') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE auth.uid() IS NOT NULL
      AND u.role = 'Admin'
      AND u.auth_user_id = auth.uid()
      AND u.active IS NOT FALSE
  ) INTO allowed;

  IF allowed IS TRUE THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only an Admin can manually close or reopen an order'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS guard_manual_order_close ON public.orders;
CREATE TRIGGER guard_manual_order_close
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_manual_order_close();
`;

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      auth_user_id uuid,
      role text,
      status text,
      active boolean
    );
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text,
      client_name text,
      order_type text,
      order_qty_kg numeric,
      delivery_date date,
      target_delivery_date date,
      status text,
      job_details jsonb,
      raw_material_requirements jsonb,
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
      closed_by text,
      closed_at timestamptz,
      close_reason text,
      close_mode text,
      over_dispatch_warning text
    );
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
    GRANT SELECT ON public.users TO authenticated;
    INSERT INTO public.users (id, auth_user_id, role, status, active) VALUES
      ('op', '${OPERATOR}', 'Printing Operator', 'Active', true),
      ('shop', '${SHOP}', 'Shop Floor Operator', 'Active', true),
      ('admin', '${ADMIN}', 'Admin', 'Active', true);
    INSERT INTO public.orders (id, job_name, status, close_mode, job_details, printing_status) VALUES
      ('ORD-OPEN', 'Peas Pouch', 'In Production', NULL, '{"closeMode": null, "printingStatus": "In Production"}'::jsonb, 'Pending'),
      ('ORD-DONE', 'Finished Pouch', 'Completed', NULL, '{"closeMode": null}'::jsonb, 'Pending'),
      ('ORD-MANUAL', 'Closed Pouch', 'Completed', 'manual', '{"closeMode": "manual"}'::jsonb, 'Pending'),
      ('ORD-AUTO', 'Auto Pouch', 'Completed', 'auto', '{"closeMode": "auto"}'::jsonb, 'Pending');
  `);
  await db.exec(legacyGuardSql);
  return db;
}

async function asUser(db, uid) {
  await db.exec('RESET ROLE');
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false)`);
  await db.exec('SET ROLE authenticated');
}

async function orderRow(db, id) {
  await db.exec('RESET ROLE');
  const result = await db.query(`SELECT id, status, close_mode, printing_status, job_details, job_name FROM public.orders WHERE id = $1`, [id]);
  return result.rows[0];
}

test('the old guard treats null close mode and ordinary status changes as a manual close', async () => {
  const db = await database();
  await asUser(db, OPERATOR);

  await assert.rejects(
    db.query(`UPDATE public.orders SET close_mode = 'auto', job_details = '{"closeMode":"auto"}'::jsonb WHERE id = 'ORD-OPEN'`),
    /Only an Admin can manually close or reopen an order/
  );
  await assert.rejects(
    db.query(`UPDATE public.orders SET close_mode = '' WHERE id = 'ORD-OPEN'`),
    /Only an Admin can manually close or reopen an order/
  );
  await assert.rejects(
    db.query(`UPDATE public.orders SET status = 'In Production' WHERE id = 'ORD-DONE'`),
    /Only an Admin can manually close or reopen an order/
  );
  await assert.rejects(
    db.query(`UPDATE public.orders SET job_details = COALESCE(job_details, '{}'::jsonb) || '{"closeMode":"manual"}'::jsonb WHERE id = 'ORD-OPEN'`),
    /Only an Admin can manually close or reopen an order/
  );

  const open = await orderRow(db, 'ORD-OPEN');
  assert.equal(open.close_mode, null);
  assert.equal(open.status, 'In Production');
  await db.close();
});

test('operators can start and end a print run without closing or reopening the order', async () => {
  const db = await database();
  await db.exec(migrationSql);

  await asUser(db, OPERATOR);
  const started = await db.query(
    `SELECT public.record_print_run($1, 'start', $2::jsonb) AS run`,
    ['ORD-OPEN', JSON.stringify({
      machineId: 'MAC-PRINT-30',
      printingStartTime: '2026-10-31T06:40:00.000Z',
      inputRollsList: [{ barcodeId: 'RM-1', consumedWeightKg: '4.5' }],
      closeMode: 'manual',
      status: 'Completed'
    })]
  );
  assert.equal(started.rows[0].run.printingStatus, 'In Production');
  assert.equal(started.rows[0].run.status, 'In Production');
  assert.equal(started.rows[0].run.closeMode, null);
  assert.equal(started.rows[0].run.isPrintingCompleted, false);

  const progress = await db.query(
    `SELECT public.record_print_run($1, 'progress', $2::jsonb) AS run`,
    ['ORD-OPEN', JSON.stringify({
      inputRollsList: [
        { barcodeId: 'RM-1', consumedWeightKg: '9' },
        { barcodeId: 'RM-2', consumedWeightKg: '3' }
      ],
      closeMode: 'manual'
    })]
  );
  assert.equal(progress.rows[0].run.closeMode, null);
  assert.equal(progress.rows[0].run.inputRollsList.length, 2);
  assert.equal(progress.rows[0].run.isPrintingCompleted, false);

  await asUser(db, SHOP);
  const ended = await db.query(
    `SELECT public.record_print_run($1, 'end', $2::jsonb) AS run`,
    ['ORD-OPEN', JSON.stringify({
      printingEndTime: '2026-10-31T11:55:00.000Z',
      actualMetersPrinted: 1200,
      printedOutputKg: 42.5,
      inkGsmInSpeed: 1.6,
      printingNotes: 'Run complete',
      nextProcess: 'Lamination Machine',
      printingDurationMinutes: 80,
      printingDurationFormatted: '1h 20m',
      closeMode: 'manual',
      status: 'Completed'
    })]
  );
  assert.equal(ended.rows[0].run.printingStatus, 'Completed');
  assert.equal(ended.rows[0].run.status, 'In Production');
  assert.equal(ended.rows[0].run.closeMode, null);
  assert.equal(ended.rows[0].run.isPrintingCompleted, true);
  assert.equal(ended.rows[0].run.nextProcess, 'Lamination Machine');
  assert.equal(Number(ended.rows[0].run.printedOutputKg), 42.5);

  const stored = await orderRow(db, 'ORD-OPEN');
  assert.equal(stored.status, 'In Production');
  assert.equal(stored.close_mode, null);
  assert.equal(stored.printing_status, 'Completed');
  assert.equal(stored.job_details.closeMode, null);
  assert.equal(stored.job_details.printingStatus, 'Completed');
  assert.equal(stored.job_details.nextProcess, 'Lamination Machine');
  assert.match(stored.job_name, /Lamination Machine|printingStatus/);
  await db.close();
});

test('a manually closed order can take a print run and stays closed', async () => {
  const db = await database();
  await db.exec(migrationSql);
  await asUser(db, OPERATOR);

  const started = await db.query(
    `SELECT public.record_print_run('ORD-MANUAL', 'start', '{"machineId":"MAC-1","printingStartTime":"2026-10-31T08:00:00.000Z"}'::jsonb) AS run`
  );
  assert.equal(started.rows[0].run.status, 'Completed');
  assert.equal(started.rows[0].run.closeMode, 'manual');
  assert.equal(started.rows[0].run.printingStatus, 'In Production');

  const ended = await db.query(
    `SELECT public.record_print_run('ORD-MANUAL', 'end', '{"printingEndTime":"2026-10-31T09:00:00.000Z","nextProcess":"Slitting Machine","printedOutputKg":10}'::jsonb) AS run`
  );
  assert.equal(ended.rows[0].run.status, 'Completed');
  assert.equal(ended.rows[0].run.closeMode, 'manual');
  assert.equal(ended.rows[0].run.printingStatus, 'Completed');
  assert.equal(ended.rows[0].run.nextProcess, 'Slitting Machine');

  await assert.rejects(
    db.query(`UPDATE public.orders SET status = 'In Production', close_mode = NULL, job_details = '{"closeMode": null}'::jsonb WHERE id = 'ORD-MANUAL'`),
    /Only an Admin can manually close or reopen an order/
  );
  await assert.rejects(
    db.query(`UPDATE public.orders SET status = 'Completed', close_mode = 'manual', job_details = '{"closeMode":"manual"}'::jsonb WHERE id = 'ORD-OPEN'`),
    /Only an Admin can manually close or reopen an order/
  );

  const manual = await orderRow(db, 'ORD-MANUAL');
  assert.equal(manual.status, 'Completed');
  assert.equal(manual.close_mode, 'manual');
  assert.equal(manual.printing_status, 'Completed');
  await db.close();
});

test('null close mode is not a manual close, and other roles can still update orders', async () => {
  const db = await database();
  await db.exec(migrationSql);
  await asUser(db, SHOP);

  await db.query(`UPDATE public.orders SET status = 'In Production' WHERE id = 'ORD-DONE'`);
  await db.query(`UPDATE public.orders SET close_mode = 'auto', job_details = '{"closeMode":"auto"}'::jsonb WHERE id = 'ORD-OPEN'`);
  await db.query(`UPDATE public.orders SET close_mode = NULL, status = 'In Production', raw_material_requirements = '[{"filmType":"PET"}]'::jsonb WHERE id = 'ORD-AUTO'`);
  await db.query(`UPDATE public.orders SET status = 'Completed' WHERE id = 'ORD-DONE'`);

  await db.exec('RESET ROLE');
  const done = await db.query(`SELECT status, close_mode FROM public.orders WHERE id = 'ORD-DONE'`);
  assert.equal(done.rows[0].status, 'Completed');
  assert.equal(done.rows[0].close_mode, null);
  const open = await db.query(`SELECT close_mode, job_details->>'closeMode' AS jd FROM public.orders WHERE id = 'ORD-OPEN'`);
  assert.equal(open.rows[0].close_mode, 'auto');
  assert.equal(open.rows[0].jd, 'auto');
  const reopenedAuto = await db.query(`SELECT status, close_mode FROM public.orders WHERE id = 'ORD-AUTO'`);
  assert.equal(reopenedAuto.rows[0].status, 'In Production');
  assert.equal(reopenedAuto.rows[0].close_mode, null);

  await asUser(db, ADMIN);
  await db.query(`UPDATE public.orders SET status = 'Completed', close_mode = 'manual', closed_by = 'Admin', job_details = '{"closeMode":"manual"}'::jsonb WHERE id = 'ORD-DONE'`);
  await db.query(`UPDATE public.orders SET status = 'In Production', close_mode = NULL, closed_by = NULL, job_details = '{"closeMode": null}'::jsonb WHERE id = 'ORD-DONE'`);
  const reopened = await orderRow(db, 'ORD-DONE');
  assert.equal(reopened.status, 'In Production');
  assert.equal(reopened.close_mode, null);

  await db.exec('RESET ROLE');
  await db.exec('SET ROLE anon');
  await assert.rejects(
    db.query(`SELECT public.record_print_run('ORD-OPEN', 'start', '{}'::jsonb)`),
    /permission denied/i
  );
  await db.close();
});
