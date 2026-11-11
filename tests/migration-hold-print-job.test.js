import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261111200000_hold_print_job.sql', import.meta.url),
  'utf8'
);

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const SALES = '22222222-2222-4222-8222-222222222222';
const MULTI = '33333333-3333-4333-8333-333333333333';
const LOCKED = '44444444-4444-4444-8444-444444444444';

function holdPatch(extra = {}) {
  return {
    holdReason: 'Cylinder Chroming Issue',
    holdNote: '',
    printedUsable: true,
    actualMetersPrinted: 800,
    printedOutputKg: 25,
    filmType: 'PET',
    jobCode: 'JOB-HOLD',
    jobName: 'Hold trial',
    clientName: 'Acme',
    inputRollsList: [{
      barcodeId: 'RM-HOLD-1',
      itemId: 'FILM-1',
      filmType: 'PET',
      initialWeightKg: 100,
      consumedWeightKg: 40,
      balanceLengthMeters: 500
    }],
    ...extra
  };
}

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    CREATE TABLE public.users (
      id text PRIMARY KEY,
      role text,
      assigned_roles text[],
      auth_user_id uuid,
      active boolean DEFAULT true,
      status text DEFAULT 'Active',
      full_name text
    );
    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb
    );
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      status text,
      close_mode text,
      job_name text,
      job_details jsonb,
      client_name text,
      order_qty_kg numeric,
      printing_status text,
      printing_start_time timestamptz,
      printing_end_time timestamptz,
      printing_duration_minutes numeric,
      printing_duration_formatted text,
      actual_meters_printed numeric,
      printed_output_kg numeric,
      ink_gsm_in_speed numeric,
      printing_notes text,
      machine_id text,
      job_master_id text
    );
    CREATE TABLE public.inventory_items (
      id text PRIMARY KEY,
      available_qty_kg numeric
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      roll_type text,
      item_id text,
      item_name text,
      category text,
      job_name text,
      order_id text,
      job_code text,
      client_name text,
      film_type text,
      micron numeric,
      width_mm numeric,
      net_weight_kg numeric,
      available_weight_kg numeric,
      gross_weight_kg numeric,
      tare_weight_kg numeric,
      length_meters numeric,
      status text,
      qc_status text,
      sfg_type text,
      location_bay text,
      machine_name text,
      operator_name text,
      shift text,
      inward_datetime timestamptz,
      production_date date,
      metadata jsonb
    );
    CREATE TABLE public.inventory_ledger_entries (
      id text PRIMARY KEY,
      entry_kind text,
      scope_key text,
      barcode text,
      order_id text,
      qty_kg numeric,
      consumed_kg numeric,
      balance_kg numeric,
      stock_item_id text,
      balance_barcode text
    );
    CREATE TABLE public.sfg_goods (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sfg_batch_code text UNIQUE,
      sfg_type text,
      order_id text,
      job_name text,
      job_code text,
      client_name text,
      film_type text,
      micron numeric,
      width_mm numeric,
      total_gross_kg numeric,
      gross_weight_kg numeric,
      tare_weight_kg numeric,
      total_net_kg numeric,
      consumed_kg numeric,
      available_kg numeric,
      total_meters numeric,
      rolls_count integer,
      machine_name text,
      operator_name text,
      shift text,
      storage_bay text,
      production_date date,
      status text,
      notes text,
      updated_at timestamptz
    );
    CREATE TABLE public.sfg_qc_hold_items (
      id text PRIMARY KEY,
      payload jsonb,
      updated_at timestamptz
    );
    CREATE TABLE public.custom_barcodes (
      id text PRIMARY KEY,
      payload jsonb
    );

    CREATE SCHEMA private;
    CREATE OR REPLACE FUNCTION private.app_roles()
    RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
      SELECT COALESCE((
        SELECT ARRAY(
          SELECT DISTINCT candidate
          FROM (
            SELECT u.role AS candidate
            UNION ALL
            SELECT unnest(coalesce(u.assigned_roles, ARRAY[]::text[]))
          ) AS raw(candidate)
          WHERE candidate IS NOT NULL AND candidate <> ''
        )
        FROM public.users AS u
        WHERE u.auth_user_id = auth.uid()
      ), ARRAY[]::text[]);
    $$;
    CREATE OR REPLACE FUNCTION private.print_patch_number(p_obj jsonb, p_key text)
    RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE raw text;
    BEGIN
      IF p_obj IS NULL OR NOT (p_obj ? p_key) THEN RETURN NULL; END IF;
      raw := NULLIF(btrim(p_obj ->> p_key), '');
      IF raw IS NULL THEN RETURN NULL; END IF;
      RETURN raw::numeric;
    EXCEPTION WHEN others THEN RETURN NULL;
    END $$;
    CREATE OR REPLACE FUNCTION private.current_print_operator_name()
    RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
      SELECT full_name FROM public.users WHERE auth_user_id = auth.uid()
    $$;
    CREATE OR REPLACE FUNCTION private.caller_can_print()
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE OR REPLACE FUNCTION private.note_printed_barcode(p_barcode text, p_order_id text, p_label text, p_kind text)
    RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO public.custom_barcodes (id, payload)
      VALUES (p_barcode, jsonb_build_object('orderId', p_order_id, 'kind', p_kind))
      ON CONFLICT (id) DO NOTHING;
    END $$;
    CREATE OR REPLACE FUNCTION public.order_is_manually_closed(p_close_mode text, p_job_details jsonb)
    RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;
    CREATE OR REPLACE FUNCTION public.order_print_run_is_active(p_status text, p_start timestamptz, p_end timestamptz)
    RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
      SELECT p_end IS NULL AND p_start IS NOT NULL
        AND lower(btrim(coalesce(p_status, ''))) NOT IN ('completed', 'cancelled', 'canceled')
    $$;
    CREATE OR REPLACE FUNCTION private.log_print_run_event(text, text, text, text, timestamptz, timestamptz, text)
    RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;

    CREATE OR REPLACE FUNCTION private.sync_job_roll_issues(p_order_id text, p_record_id text, p_origin text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE
      order_row public.orders;
      roll jsonb;
      barcode text;
      consumed numeric;
      initial_kg numeric;
      item_id text;
      balance_kg numeric;
      bal_code text;
      issue_id text;
      old_consumed numeric;
      delta numeric;
      found jsonb := '[]'::jsonb;
    BEGIN
      SELECT * INTO order_row FROM public.orders WHERE id = p_order_id;
      IF order_row.printing_end_time IS NULL
         OR lower(btrim(coalesce(order_row.printing_status, ''))) IS DISTINCT FROM 'completed' THEN
        RETURN '[]'::jsonb;
      END IF;
      FOR roll IN
        SELECT value FROM jsonb_array_elements(coalesce(order_row.job_details -> 'inputRollsList', '[]'::jsonb))
      LOOP
        barcode := btrim(coalesce(roll ->> 'barcodeId', roll ->> 'barcode', ''));
        consumed := COALESCE((roll ->> 'consumedWeightKg')::numeric, 0);
        initial_kg := COALESCE((roll ->> 'initialWeightKg')::numeric, consumed);
        item_id := nullif(btrim(coalesce(roll ->> 'itemId', '')), '');
        IF barcode = '' OR consumed <= 0 THEN CONTINUE; END IF;
        issue_id := 'roll-issue:ord:' || p_order_id || ':' || lower(barcode);
        SELECT consumed_kg INTO old_consumed FROM public.inventory_ledger_entries WHERE id = issue_id;
        delta := consumed - COALESCE(old_consumed, 0);
        IF item_id IS NOT NULL AND delta <> 0 THEN
          UPDATE public.inventory_items
          SET available_qty_kg = available_qty_kg - delta
          WHERE id = item_id;
        END IF;
        INSERT INTO public.inventory_ledger_entries (id, entry_kind, scope_key, barcode, order_id, consumed_kg, qty_kg, stock_item_id)
        VALUES (issue_id, 'issue', 'ord:' || p_order_id, barcode, p_order_id, consumed, consumed, item_id)
        ON CONFLICT (id) DO UPDATE SET consumed_kg = EXCLUDED.consumed_kg, qty_kg = EXCLUDED.qty_kg;
        balance_kg := greatest(initial_kg - consumed, 0);
        bal_code := CASE WHEN balance_kg > 0 THEN barcode || '-BAL' ELSE NULL END;
        IF bal_code IS NOT NULL THEN
          INSERT INTO public.inventory_rolls (
            barcode_id, roll_type, item_id, item_name, net_weight_kg, available_weight_kg, status, metadata
          ) VALUES (
            bal_code, 'RAW_MATERIAL', item_id, barcode || ' balance', balance_kg, balance_kg, 'In Stock (RM)',
            jsonb_build_object('parentBarcodeId', barcode, 'orderId', p_order_id, 'balanceRoll', true)
          )
          ON CONFLICT (barcode_id) DO UPDATE
          SET net_weight_kg = EXCLUDED.net_weight_kg,
              available_weight_kg = EXCLUDED.available_weight_kg,
              status = 'In Stock (RM)';
          INSERT INTO public.inventory_ledger_entries (id, entry_kind, scope_key, barcode, order_id, balance_kg, qty_kg, stock_item_id, balance_barcode)
          VALUES ('roll-return:ord:' || p_order_id || ':' || lower(barcode), 'balance_receipt', 'ord:' || p_order_id, bal_code, p_order_id, balance_kg, balance_kg, item_id, bal_code)
          ON CONFLICT (id) DO UPDATE SET balance_kg = EXCLUDED.balance_kg, qty_kg = EXCLUDED.qty_kg, barcode = EXCLUDED.barcode;
          found := found || jsonb_build_array(jsonb_build_object('barcodeId', bal_code, 'netWeightKg', balance_kg, 'itemName', barcode || ' balance'));
        END IF;
      END LOOP;
      DELETE FROM public.inventory_ledger_entries AS issue
      WHERE issue.entry_kind = 'issue'
        AND issue.order_id = p_order_id
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(coalesce(order_row.job_details -> 'inputRollsList', '[]'::jsonb)) AS listed(value)
          WHERE lower(btrim(coalesce(value ->> 'barcodeId', value ->> 'barcode', ''))) = lower(issue.barcode)
        );
      RETURN found;
    END $$;

    INSERT INTO public.users (id, role, assigned_roles, auth_user_id, full_name) VALUES
      ('op', 'Printing Operator', ARRAY['Printing Operator'], '${OPERATOR}', 'Press Operator'),
      ('sales', 'Sales Manager', ARRAY['Sales Manager'], '${SALES}', 'Sales Person'),
      ('multi', 'Sales Manager', ARRAY['Sales Manager', 'Printing Operator'], '${MULTI}', 'Combined User'),
      ('locked', 'Production Manager', ARRAY['Production Manager'], '${LOCKED}', 'Locked Manager');
    INSERT INTO public.role_permissions (role, permissions) VALUES
      ('Printing Operator', '{"printing_scheduler": true}'::jsonb),
      ('Sales Manager', '{"printing_scheduler": false}'::jsonb),
      ('Production Manager', '{"printing_scheduler": false}'::jsonb),
      ('Admin', '{"printing_scheduler": true}'::jsonb);
    INSERT INTO public.inventory_items (id, available_qty_kg) VALUES ('FILM-1', 100);
    INSERT INTO public.inventory_rolls (barcode_id, roll_type, item_id, net_weight_kg, available_weight_kg, status)
    VALUES ('RM-HOLD-1', 'RAW_MATERIAL', 'FILM-1', 100, 100, 'In Stock (RM)');
    INSERT INTO public.orders (
      id, status, job_name, client_name, order_qty_kg, printing_status, printing_start_time, machine_id, job_details
    ) VALUES (
      'ORD-HOLD', 'In Production', 'Hold trial', 'Acme', 100, 'In Production', now(), 'MAC-1',
      '{"jobCode":"JOB-HOLD","printingStatus":"In Production","isPrintingCompleted":false}'::jsonb
    );

    GRANT USAGE ON SCHEMA auth, private, public TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT, UPDATE ON public.orders TO authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.sfg_goods FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.sfg_qc_hold_items FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.inventory_rolls FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE ON public.inventory_ledger_entries FROM authenticated;
  `);
  await db.exec(migrationSql);
  await db.exec(`
    CREATE OR REPLACE FUNCTION private.caller_can_print()
    RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT private.caller_can_hold_print()
    $$;
  `);
  return db;
}

async function asUser(db, authId) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [authId]);
  await db.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  await db.exec('SET ROLE authenticated');
}

test('the hold migration is after the completed-progress freeze and does not treat a hold as completed', () => {
  assert.ok('20261111200000' > '20261111183000');
  assert.match(migrationSql, /Hold on Printing/);
  assert.match(migrationSql, /sfg_qc_hold_items/);
  assert.match(migrationSql, /sync_job_roll_issues/);
  assert.doesNotMatch(migrationSql, /localStorage/);
  assert.match(migrationSql, /isPrintingCompleted', false/);
});

test('hold posts usable SFG and a new balance barcode, restart keeps the totals, and a second hold uses QC Hold', async () => {
  const db = await database();
  await asUser(db, SALES);
  await assert.rejects(
    () => db.query(`SELECT public.hold_print_run('ORD-HOLD', $1::jsonb)`, [JSON.stringify(holdPatch())]),
    /Not allowed to hold/
  );
  await db.exec('RESET ROLE');
  const stillRunning = await db.query(`SELECT printing_status FROM public.orders WHERE id = 'ORD-HOLD'`);
  assert.equal(stillRunning.rows[0].printing_status, 'In Production');

  await asUser(db, LOCKED);
  await assert.rejects(
    () => db.query(`SELECT public.hold_print_run('ORD-HOLD', $1::jsonb)`, [JSON.stringify(holdPatch())]),
    /Not allowed to hold/
  );

  await asUser(db, MULTI);
  const held = await db.query(`SELECT public.hold_print_run('ORD-HOLD', $1::jsonb) AS run`, [JSON.stringify(holdPatch())]);
  const run = held.rows[0].run;
  assert.equal(run.printingStatus, 'Hold on Printing');
  assert.equal(run.isPrintingCompleted, false);
  assert.equal(run.holdReason, 'Cylinder Chroming Issue');
  assert.equal(Number(run.actualMetersPrinted), 800);
  assert.equal(Number(run.printedOutputKg), 25);
  assert.equal(run.balanceRolls[0].barcodeId, 'RM-HOLD-1-BAL');
  assert.equal(Number(run.balanceRolls[0].netWeightKg), 60);
  assert.equal(run.printedRolls[0].barcodeId, 'SFG-BC-JOB-HOLD-H1-1');
  assert.equal(run.printHoldHistory.length, 1);
  assert.equal(run.printHoldHistory[0].heldBy, 'Combined User');
  assert.equal(run.qcHold, null);

  await db.exec('RESET ROLE');
  const stock = await db.query(`SELECT available_qty_kg FROM public.inventory_items WHERE id = 'FILM-1'`);
  assert.equal(Number(stock.rows[0].available_qty_kg), 60);
  const sfg = await db.query(`SELECT total_net_kg, total_meters FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-LOT-ORD-HOLD'`);
  assert.equal(Number(sfg.rows[0].total_net_kg), 25);
  assert.equal(Number(sfg.rows[0].total_meters), 800);
  const order = await db.query(`SELECT printing_status, printing_end_time, job_details->>'isPrintingCompleted' AS done FROM public.orders WHERE id = 'ORD-HOLD'`);
  assert.equal(order.rows[0].printing_status, 'Hold on Printing');
  assert.ok(order.rows[0].printing_end_time);
  assert.equal(order.rows[0].done, 'false');

  await asUser(db, OPERATOR);
  const stale = await db.query(
    `SELECT public.record_print_run('ORD-HOLD', 'progress', '{"inputRollsList":[{"barcodeId":"STALE"}],"actualMetersPrinted":1}'::jsonb) AS run`
  );
  assert.equal(stale.rows[0].run.printingStatus, 'Hold on Printing');
  assert.equal(stale.rows[0].run.isPrintingCompleted, false);
  assert.equal(stale.rows[0].run.inputRollsList.length, 0);
  await assert.rejects(
    () => db.query(`SELECT public.record_print_run('ORD-HOLD', 'start', '{"machineId":"MAC-9"}'::jsonb)`),
    /restart_held_print_run/
  );

  const restarted = await db.query(
    `SELECT public.restart_held_print_run('ORD-HOLD', '{"machineId":"MAC-2"}'::jsonb) AS run`
  );
  assert.equal(restarted.rows[0].run.printingStatus, 'In Production');
  assert.equal(restarted.rows[0].run.printingEndTime, null);
  assert.equal(restarted.rows[0].run.machineId, 'MAC-2');
  assert.equal(Number(restarted.rows[0].run.actualMetersPrinted), 800);
  assert.equal(Number(restarted.rows[0].run.printedOutputKg), 25);
  assert.equal(restarted.rows[0].run.printHoldHistory[0].restartMachineId, 'MAC-2');
  assert.ok(restarted.rows[0].run.printHoldHistory[0].restartedAt);
  assert.equal(restarted.rows[0].run.printHoldHistory[0].restartedBy, 'Press Operator');

  const second = await db.query(`SELECT public.hold_print_run('ORD-HOLD', $1::jsonb) AS run`, [JSON.stringify(holdPatch({
    holdReason: 'Raw Material Issue',
    printedUsable: false,
    actualMetersPrinted: 300,
    printedOutputKg: 10,
    inputRollsList: [{
      barcodeId: 'RM-HOLD-1-BAL',
      itemId: 'FILM-1',
      filmType: 'PET',
      initialWeightKg: 60,
      consumedWeightKg: 20,
      balanceLengthMeters: 200
    }]
  }))]);
  const again = second.rows[0].run;
  assert.equal(again.printingStatus, 'Hold on Printing');
  assert.equal(again.isPrintingCompleted, false);
  assert.equal(Number(again.actualMetersPrinted), 1100);
  assert.equal(Number(again.printedOutputKg), 25);
  assert.equal(again.printHoldHistory.length, 2);
  assert.equal(again.printHoldHistory[1].usable, false);
  assert.equal(again.printHoldHistory[1].reason, 'Raw Material Issue');
  assert.equal(again.qcHold.holdReason, 'Raw Material Issue');
  assert.equal(again.qcHold.targetProcess, 'QC Hold Store');
  assert.equal(Number(again.qcHold.totalHoldKg), 10);
  assert.equal(again.printedRolls.length, 0);
  assert.ok(again.balanceRolls.some((roll) => roll.barcodeId === 'RM-HOLD-1-BAL-BAL'));

  await db.exec('RESET ROLE');
  const after = await db.query(`SELECT available_qty_kg FROM public.inventory_items WHERE id = 'FILM-1'`);
  assert.equal(Number(after.rows[0].available_qty_kg), 40);
  const issues = await db.query(`SELECT barcode, consumed_kg FROM public.inventory_ledger_entries WHERE entry_kind = 'issue' ORDER BY barcode`);
  assert.deepEqual(issues.rows.map((row) => [row.barcode, Number(row.consumed_kg)]), [
    ['RM-HOLD-1', 40],
    ['RM-HOLD-1-BAL', 20]
  ]);
  const kept = await db.query(`SELECT net_weight_kg FROM public.inventory_rolls WHERE barcode_id = 'SFG-BC-JOB-HOLD-H1-1'`);
  assert.equal(Number(kept.rows[0].net_weight_kg), 25);
  const lot = await db.query(`SELECT total_net_kg FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-LOT-ORD-HOLD'`);
  assert.equal(Number(lot.rows[0].total_net_kg), 25);
  const qc = await db.query(`SELECT payload->>'status' AS status FROM public.sfg_qc_hold_items`);
  assert.equal(qc.rows[0].status, 'QC_HOLD');
});

test('other reason without a note is rejected and the running job is unchanged', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await assert.rejects(
    () => db.query(`SELECT public.hold_print_run('ORD-HOLD', $1::jsonb)`, [JSON.stringify(holdPatch({ holdReason: 'Other Reason', holdNote: '' }))]),
    /needs a note/
  );
  await db.exec('RESET ROLE');
  const order = await db.query(`SELECT printing_status, printing_end_time FROM public.orders WHERE id = 'ORD-HOLD'`);
  assert.equal(order.rows[0].printing_status, 'In Production');
  assert.equal(order.rows[0].printing_end_time, null);
});
