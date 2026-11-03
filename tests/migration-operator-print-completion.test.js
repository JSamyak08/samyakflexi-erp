import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const operatorSql = fs.readFileSync(
  new URL('../supabase/migrations/20261101180000_operator_sfg_view_only.sql', import.meta.url),
  'utf8'
);
const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261103143000_operator_print_run_completion.sql', import.meta.url),
  'utf8'
);

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const SHOP = '33333333-3333-4333-8333-333333333333';
const STORE = '44444444-4444-4444-8444-444444444444';
const LOOKUP = '66666666-6666-4666-8666-666666666666';

const OPERATOR_PERMS = {
  inventory: true,
  printing_scheduler: true,
  sfg_store: 'view',
  production_records: false,
  scrap_analytics: false,
  barcodes: false
};

function endPatch(weight = 10, plain = 6.5) {
  return {
    printedOutputKg: weight,
    actualMetersPrinted: 1500,
    jobCode: 'JOB-1',
    clientName: 'Acme',
    operatorName: 'Press Op',
    filmType: 'PET',
    micron: 12,
    widthMm: 820,
    orderQtyKg: 100,
    printingPlainSettingWastageKg: plain,
    printingWastageKg: 0,
    excessFilmWastageKg: 0,
    storageBay: 'SFG Store (Pre-Lamination)',
    inputRollsList: [{ barcodeId: 'RM-100', consumedWeightKg: 47.5, initialWeightKg: 80, filmType: 'PET' }],
    outputRolls: [{ netWeightKg: weight, filmType: 'PET', itemName: 'Snack - Printed SFG Roll 1' }]
  };
}

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    GRANT USAGE ON SCHEMA auth, private, public TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb,
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      role text,
      assigned_roles text[] DEFAULT '{}'::text[],
      active boolean DEFAULT true,
      auth_user_id uuid
    );
    CREATE OR REPLACE FUNCTION private.app_roles()
    RETURNS text[]
    LANGUAGE sql STABLE AS $$
      SELECT COALESCE((
        SELECT ARRAY(
          SELECT DISTINCT candidate
          FROM (
            SELECT u.role AS candidate
            UNION ALL
            SELECT unnest(coalesce(u.assigned_roles, ARRAY[]::text[]))
          ) AS raw(candidate)
          WHERE candidate IS NOT NULL AND btrim(candidate) <> ''
        )
        FROM public.users AS u
        WHERE u.auth_user_id = auth.uid()
        LIMIT 1
      ), ARRAY[]::text[]);
    $$;
    CREATE OR REPLACE FUNCTION private.can_any(modules text[])
    RETURNS boolean
    LANGUAGE sql STABLE AS $$
      SELECT EXISTS (
        SELECT 1
        FROM unnest(private.app_roles()) AS granted(role_name)
        WHERE granted.role_name = 'Admin'
           OR EXISTS (
             SELECT 1
             FROM public.role_permissions AS rp
             WHERE rp.role = granted.role_name
               AND EXISTS (
                 SELECT 1
                 FROM unnest(modules) AS requested(module_key)
                 WHERE rp.permissions -> requested.module_key = 'true'::jsonb
               )
           )
      );
    $$;

    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      client_name text NOT NULL,
      order_qty_kg numeric,
      status text,
      printing_status text,
      printing_end_time timestamptz,
      printed_output_kg numeric,
      job_details jsonb
    );
    CREATE TABLE public.sfg_goods (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sfg_batch_code text UNIQUE NOT NULL,
      sfg_type text NOT NULL,
      order_id text,
      job_name text NOT NULL,
      job_code text,
      client_name text,
      film_type text,
      micron numeric DEFAULT 0,
      width_mm numeric DEFAULT 0,
      total_gross_kg numeric DEFAULT 0,
      gross_weight_kg numeric DEFAULT 0,
      tare_weight_kg numeric DEFAULT 0,
      total_net_kg numeric DEFAULT 0,
      consumed_kg numeric DEFAULT 0,
      available_kg numeric DEFAULT 0,
      total_meters numeric DEFAULT 0,
      rolls_count integer DEFAULT 1,
      machine_name text,
      operator_name text,
      shift text,
      storage_bay text,
      production_date date,
      status text,
      notes text,
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      roll_type text NOT NULL,
      item_id text,
      item_name text NOT NULL,
      category text,
      job_name text,
      order_id text,
      job_code text,
      client_name text,
      film_type text,
      micron numeric,
      width_mm numeric,
      net_weight_kg numeric NOT NULL DEFAULT 0,
      available_weight_kg numeric NOT NULL DEFAULT 0,
      gross_weight_kg numeric DEFAULT 0,
      tare_weight_kg numeric DEFAULT 0,
      length_meters numeric DEFAULT 0,
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
    CREATE TABLE public.sfg_scrap_items (
      id text PRIMARY KEY,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.high_scrap_registry (
      id text PRIMARY KEY,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.custom_barcodes (
      id text PRIMARY KEY,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.production_records (
      id text PRIMARY KEY,
      order_id text,
      job_name text,
      status text
    );
    CREATE TABLE public.inventory_ledger_entries (
      id text PRIMARY KEY,
      order_id text,
      entry_kind text,
      barcode text,
      qty_kg numeric
    );
    CREATE TABLE public.fg_goods (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE public.sfg_fg_store (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE public.sfg_qc_hold_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);

    ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.sfg_goods ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.inventory_rolls ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.sfg_scrap_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.high_scrap_registry ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.custom_barcodes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.inventory_ledger_entries ENABLE ROW LEVEL SECURITY;

    CREATE POLICY orders_access ON public.orders FOR ALL TO authenticated
      USING (private.can_any(ARRAY['orders','printing_scheduler']))
      WITH CHECK (private.can_any(ARRAY['orders','printing_scheduler']));
    CREATE POLICY inventory_rolls_access ON public.inventory_rolls FOR ALL TO authenticated
      USING (private.can_any(ARRAY['inventory','printing_scheduler']))
      WITH CHECK (private.can_any(ARRAY['inventory','printing_scheduler']));
    CREATE POLICY production_records_access ON public.production_records FOR ALL TO authenticated
      USING (private.can_any(ARRAY['production_records','printing_scheduler']))
      WITH CHECK (private.can_any(ARRAY['production_records','printing_scheduler']));
    CREATE POLICY ledger_access ON public.inventory_ledger_entries FOR ALL TO authenticated
      USING (private.can_any(ARRAY['inventory','production_records','printing_scheduler']))
      WITH CHECK (private.can_any(ARRAY['inventory','production_records','printing_scheduler']));
    CREATE POLICY custom_barcodes_access ON public.custom_barcodes FOR ALL TO authenticated
      USING (private.can_any(ARRAY['inventory']))
      WITH CHECK (private.can_any(ARRAY['inventory']));
    CREATE POLICY high_scrap_access ON public.high_scrap_registry FOR ALL TO authenticated
      USING (private.can_any(ARRAY['scrap_analytics','production_records']))
      WITH CHECK (private.can_any(ARRAY['scrap_analytics','production_records']));

    GRANT ALL ON public.role_permissions, public.users, public.orders, public.sfg_goods,
      public.inventory_rolls, public.sfg_scrap_items, public.high_scrap_registry,
      public.custom_barcodes, public.production_records, public.inventory_ledger_entries,
      public.fg_goods, public.sfg_fg_store, public.sfg_qc_hold_items
      TO authenticated;
  `);

  await db.query(
    `INSERT INTO public.role_permissions (role, permissions) VALUES
      ('Printing Operator', $1::jsonb),
      ('Shop Floor Operator', $1::jsonb),
      ('Store Manager', '{"sfg_store": true, "production_records": true, "inventory": true}'::jsonb),
      ('Lookup Only', '{"sfg_store": "view"}'::jsonb)`,
    [JSON.stringify({ ...OPERATOR_PERMS, dashboard: true, production_records: true })]
  );
  await db.query(
    `INSERT INTO public.users (id, role, assigned_roles, auth_user_id) VALUES
      ('op', 'Printing Operator', ARRAY['Printing Operator'], $1::uuid),
      ('shop', 'Shop Floor Operator', ARRAY['Shop Floor Operator'], $2::uuid),
      ('store', 'Store Manager', ARRAY['Store Manager'], $3::uuid),
      ('lookup', 'Lookup Only', ARRAY['Lookup Only'], $4::uuid)`,
    [OPERATOR, SHOP, STORE, LOOKUP]
  );
  await db.query(
    `INSERT INTO public.orders (id, job_name, client_name, order_qty_kg, status, printing_status, job_details)
     VALUES ('ORD-1', 'Snack roll', 'Acme', 100, 'In Production', 'In Production', '{"jobCode":"JOB-1"}'::jsonb)`
  );
  await db.exec(operatorSql);
  await db.exec(migrationSql);
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.record_print_run(p_order_id text, p_action text, p_patch jsonb)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $fn$
    BEGIN
      UPDATE public.orders
      SET printing_status = CASE WHEN p_action = 'end' THEN 'Completed' ELSE printing_status END,
          printing_end_time = CASE WHEN p_action = 'end' THEN pg_catalog.now() ELSE printing_end_time END,
          printed_output_kg = COALESCE(NULLIF(p_patch->>'printedOutputKg', '')::numeric, printed_output_kg)
      WHERE id = p_order_id;
      RETURN jsonb_build_object(
        'id', p_order_id,
        'printingStatus', 'Completed',
        'balanceRolls', jsonb_build_array(jsonb_build_object(
          'barcodeId', 'RM-100-BAL',
          'netWeightKg', 32.5,
          'itemName', 'PET balance'
        ))
      );
    END;
    $fn$;
    GRANT EXECUTE ON FUNCTION public.record_print_run(text, text, jsonb) TO authenticated;
  `);
  return db;
}

async function asUser(db, authId) {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [authId]);
  await db.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false)`);
  await db.exec('SET ROLE authenticated');
}

test('the completion migration is newer than the approval gates and does not grant store write', () => {
  assert.ok('20261103143000' > '20261103120000');
  assert.match(migrationSql, /complete_print_run/);
  assert.match(migrationSql, /SECURITY DEFINER/);
  assert.match(migrationSql, /printing_scheduler/);
  assert.doesNotMatch(migrationSql, /UPDATE public\.role_permissions/);
  assert.match(migrationSql, /'barcode' - 'barcodeId' - 'barcode_id'/);
  assert.ok('20261103143000' > '20261103140000');
});

test('an operator end saves the printed lot, balance barcode, and printing scrap, and a retry updates the same rows', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  const first = await db.query(
    `SELECT public.complete_print_run('ORD-1', $1::jsonb) AS run`,
    [JSON.stringify(endPatch(10, 6.5))]
  );
  const run = first.rows[0].run;
  assert.equal(run.printingStatus, 'Completed');
  assert.equal(run.printedRolls[0].barcodeId, 'SFG-BC-JOB-1-1');
  assert.equal(Number(run.printedRolls[0].netWeightKg), 10);
  assert.equal(Number(run.printedRolls[0].lengthMeters), 1500);
  assert.equal(run.balanceRolls[0].barcodeId, 'RM-100-BAL');
  assert.equal(run.consumedRolls[0].barcodeId, 'RM-100');

  const lot = await db.query(`SELECT total_net_kg, total_meters, consumed_kg, notes FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-LOT-ORD-1'`);
  assert.equal(Number(lot.rows[0].total_net_kg), 10);
  assert.equal(Number(lot.rows[0].total_meters), 1500);
  const notes = JSON.parse(lot.rows[0].notes);
  assert.equal(notes.childRolls[0].barcodeId, 'SFG-BC-JOB-1-1');
  assert.equal(notes.runBalanceRolls[0].barcodeId, 'RM-100-BAL');
  assert.equal(notes.isPrintedLot, true);

  const roll = await db.query(`SELECT net_weight_kg, length_meters, roll_type FROM public.inventory_rolls WHERE barcode_id = 'SFG-BC-JOB-1-1'`);
  assert.equal(Number(roll.rows[0].net_weight_kg), 10);
  assert.equal(Number(roll.rows[0].length_meters), 1500);
  assert.equal(roll.rows[0].roll_type, 'SEMI_FINISHED_GOODS');

  const scrap = await db.query(`SELECT id, payload FROM public.sfg_scrap_items`);
  assert.equal(scrap.rows.length, 1);
  assert.equal(scrap.rows[0].id, 'print-scrap:ORD-1:plain-setting');
  assert.equal(scrap.rows[0].payload.barcode, undefined);
  assert.equal(scrap.rows[0].payload.barcodeId, undefined);
  assert.equal(scrap.rows[0].payload.holdTagId, undefined);
  assert.equal(scrap.rows[0].payload.sfgBatchCode, undefined);
  assert.equal(Number(scrap.rows[0].payload.scrapQtyKg), 6.5);

  const tags = await db.query(`SELECT id FROM public.custom_barcodes ORDER BY id`);
  assert.deepEqual(tags.rows.map((row) => row.id), ['RM-100-BAL', 'SFG-BC-JOB-1-1']);

  await db.query(`SELECT public.complete_print_run('ORD-1', $1::jsonb)`, [JSON.stringify(endPatch(12, 0))]);
  const again = await db.query(`SELECT total_net_kg, consumed_kg FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-LOT-ORD-1'`);
  assert.equal(Number(again.rows[0].total_net_kg), 12);
  assert.equal(Number(again.rows[0].consumed_kg), 0);
  const rolls = await db.query(`SELECT count(*)::int AS n FROM public.inventory_rolls WHERE barcode_id = 'SFG-BC-JOB-1-1'`);
  assert.equal(rolls.rows[0].n, 1);
  const weight = await db.query(`SELECT net_weight_kg FROM public.inventory_rolls WHERE barcode_id = 'SFG-BC-JOB-1-1'`);
  assert.equal(Number(weight.rows[0].net_weight_kg), 12);
  const cleared = await db.query(`SELECT count(*)::int AS n FROM public.sfg_scrap_items WHERE id = 'print-scrap:ORD-1:plain-setting'`);
  assert.equal(cleared.rows[0].n, 0);
});

test('a shop floor operator can end a run, and a view-only account cannot', async () => {
  const db = await database();
  await asUser(db, SHOP);
  await db.query(`SELECT public.complete_print_run('ORD-1', $1::jsonb)`, [JSON.stringify(endPatch(8, 1))]);
  const saved = await db.query(`SELECT printing_status FROM public.orders WHERE id = 'ORD-1'`);
  assert.equal(saved.rows[0].printing_status, 'Completed');

  await db.exec('RESET ROLE');
  await db.query(`UPDATE public.orders SET printing_status = 'In Production', printing_end_time = NULL WHERE id = 'ORD-1'`);
  await asUser(db, LOOKUP);
  await assert.rejects(
    () => db.query(`SELECT public.complete_print_run('ORD-1', $1::jsonb)`, [JSON.stringify(endPatch())]),
    /Not allowed to record printed output/
  );
  await db.exec('RESET ROLE');
  const untouched = await db.query(`SELECT printing_status FROM public.orders WHERE id = 'ORD-1'`);
  assert.equal(untouched.rows[0].printing_status, 'In Production');
  await asUser(db, LOOKUP);
  await assert.rejects(
    () => db.query(`SELECT public.record_printing_wastage('{"scrap":{"upserts":[{"id":"print-scrap:ORD-1:plain-setting","orderId":"ORD-1","source":"printing","scrapQtyKg":1}]}}'::jsonb)`),
    /Not allowed to record printing wastage/
  );
});

test('a bad printed weight rolls the completed order back', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await assert.rejects(
    () => db.query(`SELECT public.complete_print_run('ORD-1', $1::jsonb)`, [JSON.stringify(endPatch(-1, 1))]),
    /cannot be negative/
  );
  await db.exec('RESET ROLE');
  const order = await db.query(`SELECT printing_status, printing_end_time FROM public.orders WHERE id = 'ORD-1'`);
  assert.equal(order.rows[0].printing_status, 'In Production');
  assert.equal(order.rows[0].printing_end_time, null);
  const lots = await db.query(`SELECT count(*)::int AS n FROM public.sfg_goods`);
  assert.equal(lots.rows[0].n, 0);
});

test('operators can read the printing tables and write a production record and a ledger line, and still cannot edit the SFG store directly', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.complete_print_run('ORD-1', $1::jsonb)`, [JSON.stringify(endPatch())]);
  const visible = await db.query(`SELECT count(*)::int AS n FROM public.sfg_goods`);
  assert.equal(visible.rows[0].n, 1);
  const rolls = await db.query(`SELECT count(*)::int AS n FROM public.inventory_rolls`);
  assert.equal(rolls.rows[0].n, 1);
  const order = await db.query(`SELECT printing_status FROM public.orders WHERE id = 'ORD-1'`);
  assert.equal(order.rows[0].printing_status, 'Completed');

  await db.query(`INSERT INTO public.production_records (id, order_id, job_name, status) VALUES ('REC-ORD-1', 'ORD-1', 'Snack roll', 'Filled by Plant Manager')`);
  await db.query(`INSERT INTO public.inventory_ledger_entries (id, order_id, entry_kind, barcode, qty_kg) VALUES ('LED-1', 'ORD-1', 'issue', 'RM-100', 47.5)`);
  await db.query(`INSERT INTO public.custom_barcodes (id, payload) VALUES ('EXTRA-1', '{"barcode":"EXTRA-1"}'::jsonb)`);

  await assert.rejects(
    () => db.query(`INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name) VALUES ('SFG-DIRECT', 'Printed Rolls', 'Blocked')`),
    /view-only|row-level security/i
  );
  await assert.rejects(
    () => db.query(`INSERT INTO public.sfg_scrap_items (id, payload) VALUES ('scrap-direct', '{"scrapQtyKg":1}'::jsonb)`),
    /view-only|row-level security/i
  );
  await assert.rejects(
    () => db.query(`UPDATE public.sfg_goods SET consumed_kg = 9 WHERE sfg_batch_code = 'SFG-LOT-ORD-1'`),
    /view-only|row-level security/i
  );

  await asUser(db, LOOKUP);
  const readLot = await db.query(`SELECT count(*)::int AS n FROM public.sfg_goods`);
  assert.equal(readLot.rows[0].n, 1);
  await assert.rejects(
    () => db.query(`INSERT INTO public.production_records (id, order_id, job_name) VALUES ('REC-NO', 'ORD-1', 'Nope')`),
    /row-level security|permission/i
  );
  await assert.rejects(
    () => db.query(`INSERT INTO public.inventory_ledger_entries (id, barcode) VALUES ('LED-NO', 'RM-X')`),
    /row-level security|permission/i
  );
  await assert.rejects(
    () => db.query(`INSERT INTO public.inventory_rolls (barcode_id, roll_type, item_name) VALUES ('RM-NO', 'RAW_MATERIAL', 'Nope')`),
    /row-level security|permission/i
  );
  await assert.rejects(
    () => db.query(`INSERT INTO public.custom_barcodes (id, payload) VALUES ('NO-BC', '{}'::jsonb)`),
    /row-level security|permission/i
  );
  const hiddenOrder = await db.query(`SELECT printing_status FROM public.orders WHERE id = 'ORD-1'`);
  assert.equal(hiddenOrder.rows.length, 0);
});

test('a store editor can record a non-printing scrap row, and an operator cannot', async () => {
  const db = await database();
  const lamination = {
    scrap: {
      upserts: [{
        id: 'print-scrap:ORD-1:laminate-wastage',
        orderId: 'ORD-1',
        source: 'lamination',
        type: 'Laminate Wastage',
        scrapQtyKg: 2
      }]
    }
  };
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_printing_wastage($1::jsonb)`, [JSON.stringify(lamination)]);
  const skipped = await db.query(`SELECT count(*)::int AS n FROM public.sfg_scrap_items`);
  assert.equal(skipped.rows[0].n, 0);

  await asUser(db, STORE);
  await db.query(`SELECT public.record_printing_wastage($1::jsonb)`, [JSON.stringify(lamination)]);
  const kept = await db.query(`SELECT payload FROM public.sfg_scrap_items WHERE id = 'print-scrap:ORD-1:laminate-wastage'`);
  assert.equal(kept.rows[0].payload.source, 'lamination');
  assert.equal(Number(kept.rows[0].payload.scrapQtyKg), 2);
});

test('printing scrap does not store a new barcode', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_printing_wastage($1::jsonb)`, [JSON.stringify({
    scrap: {
      upserts: [{
        id: 'print-scrap:ORD-1:printing-wastage',
        orderId: 'ORD-1',
        source: 'printing',
        type: 'Printing Wastage',
        scrapQtyKg: 1.25,
        barcode: 'SFG-BC-NEW',
        barcodeId: 'SFG-BC-NEW',
        sfgBatchCode: 'SFG-LOT-ORD-1',
        holdTagId: 'SFG-LOT-ORD-1'
      }]
    }
  })]);
  const row = await db.query(`SELECT payload FROM public.sfg_scrap_items WHERE id = 'print-scrap:ORD-1:printing-wastage'`);
  const payload = row.rows[0].payload;
  assert.equal(payload.barcode, undefined);
  assert.equal(payload.barcodeId, undefined);
  assert.equal(payload.sfgBatchCode, undefined);
  assert.equal(payload.holdTagId, undefined);
  assert.equal(payload.sourceRollBarcode, 'SFG-LOT-ORD-1');
  assert.equal(Number(payload.scrapQtyKg), 1.25);
});
