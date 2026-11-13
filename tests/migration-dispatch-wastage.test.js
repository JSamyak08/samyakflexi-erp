import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const previousSql = fs.readFileSync(
  new URL('../supabase/migrations/20261026140000_job_wastage_scrap_registry.sql', import.meta.url),
  'utf8'
);
const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261113210000_wastage_pct_of_dispatch.sql', import.meta.url),
  'utf8'
);

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text,
      client_name text,
      order_qty_kg numeric,
      job_details jsonb
    );
    CREATE TABLE public.production_records (
      id text PRIMARY KEY,
      order_id text,
      job_name text,
      client_name text,
      operator_name text,
      shift text,
      date_filled date,
      recorded_at timestamptz,
      status text,
      process_logs jsonb,
      printing_plain_setting_wastage_kg numeric,
      printing_wastage_kg numeric,
      lamination_plain_substrate_wastage_kg numeric,
      lamination_plain_substrate_wastage_l2_kg numeric,
      laminate_wastage_kg numeric,
      printed_wastage_kg numeric,
      trim_wastage_kg numeric,
      pouching_scrap_kg numeric
    );
    CREATE TABLE public.delivery_challans (
      id text PRIMARY KEY,
      payload jsonb
    );
    CREATE TABLE public.dispatch_shipments (
      dispatch_id text PRIMARY KEY,
      order_id text,
      job_name text,
      client_name text,
      packing_status text,
      total_net_weight_kg numeric,
      items jsonb,
      payload jsonb
    );
  `);
  await db.exec(previousSql);
  await db.exec(migrationSql);
  await db.exec(`
    CREATE OR REPLACE FUNCTION private.print_patch_number(p_obj jsonb, p_key text)
    RETURNS numeric
    LANGUAGE plpgsql
    IMMUTABLE
    AS $fn$
    DECLARE
      raw text;
    BEGIN
      IF p_obj IS NULL OR jsonb_typeof(p_obj) IS DISTINCT FROM 'object' OR NOT (p_obj ? p_key) THEN
        RETURN NULL;
      END IF;
      raw := NULLIF(btrim(p_obj ->> p_key), '');
      IF raw IS NULL THEN RETURN NULL; END IF;
      RETURN raw::numeric;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
    $fn$;
  `);
  return db;
}

test('the dispatch wastage migration sorts after the production floor', () => {
  assert.ok('20261113210000' > '20261113180000');
  assert.match(migrationSql, /order_dispatched_kg/);
  assert.match(migrationSql, /dispatch_qty_kg/);
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.match(migrationSql, /security_invoker = true/);
});

test('high scrap view uses weighed dispatch kg and leaves out a job with no dispatch', async () => {
  const db = await database();
  await db.exec(`
    INSERT INTO public.orders (id, job_name, order_qty_kg) VALUES
      ('ORD-ROLLS', 'Sonu Mango Mirchi Shots Inner', 500),
      ('ORD-UNDER', 'Under', 1000),
      ('ORD-NONE', 'Not Dispatched', 1000),
      ('ORD-OPEN', 'Still Packing', 400),
      ('ORD-BOTH', 'Tea Pouch', 1000),
      ('ORD-FLIP-IN', 'Small Dispatch', 1000),
      ('ORD-FLIP-OUT', 'Large Dispatch', 100);
    INSERT INTO public.production_records (
      id, order_id, job_name, printing_wastage_kg, process_logs, recorded_at
    ) VALUES
      ('REC-ROLLS', 'ORD-ROLLS', 'Sonu Mango Mirchi Shots Inner', 30.82, '{}'::jsonb, '2026-10-26T10:00:00Z'),
      ('REC-UNDER', 'ORD-UNDER', 'Under', 49.9, '{}'::jsonb, '2026-10-26T10:00:00Z'),
      ('REC-NONE', 'ORD-NONE', 'Not Dispatched', 80, '{}'::jsonb, '2026-10-26T10:00:00Z'),
      ('REC-OPEN', 'ORD-OPEN', 'Still Packing', 40, '{}'::jsonb, '2026-10-26T10:00:00Z'),
      ('REC-BOTH', 'ORD-BOTH', 'Tea Pouch', 20, '{}'::jsonb, '2026-10-26T10:00:00Z'),
      ('REC-IN', 'ORD-FLIP-IN', 'Small Dispatch', 20, '{}'::jsonb, '2026-10-26T10:00:00Z'),
      ('REC-OUT', 'ORD-FLIP-OUT', 'Large Dispatch', 40, '{}'::jsonb, '2026-10-26T10:00:00Z');
    INSERT INTO public.dispatch_shipments (dispatch_id, order_id, job_name, packing_status, total_net_weight_kg, items, payload) VALUES
      (
        'PL-ROLLS', 'ORD-ROLLS', 'Sonu Mango Mirchi Shots Inner', 'Finalised', 420,
        '[{"netWeightKg": 210.5, "unit": "Kg"}, {"netWeightKg": 209.5, "unit": "Kg"}]'::jsonb,
        '{"orderId":"ORD-ROLLS","jobName":"Sonu Mango Mirchi Shots Inner","packingStatus":"Finalised","totalNetWeightKg":420,"items":[{"netWeightKg":210.5,"unit":"Kg"},{"netWeightKg":209.5,"unit":"Kg"}]}'::jsonb
      ),
      (
        'PL-UNDER', 'ORD-UNDER', 'Under', 'Finalised', 1000,
        '[{"netWeightKg": 1000, "unit": "Kg"}]'::jsonb,
        '{"orderId":"ORD-UNDER","jobName":"Under","packingStatus":"Finalised","items":[{"netWeightKg":1000,"unit":"Kg"}]}'::jsonb
      ),
      (
        'PL-OPEN', 'ORD-OPEN', 'Still Packing', 'Open', 200,
        '[{"netWeightKg": 200, "unit": "Kg"}]'::jsonb,
        '{"orderId":"ORD-OPEN","jobName":"Still Packing","packingStatus":"Open","items":[{"netWeightKg":200,"unit":"Kg"}]}'::jsonb
      ),
      (
        'PL-BOTH', 'ORD-BOTH', 'Tea Pouch', 'Finalised', 400,
        '[{"netWeightKg": 180, "unit": "Kg"}, {"netWeightKg": 220, "unit": "Kg"}]'::jsonb,
        '{"orderId":"ORD-BOTH","jobName":"Tea Pouch","packingStatus":"Finalised","items":[{"netWeightKg":180,"unit":"Kg"},{"netWeightKg":220,"unit":"Kg"}]}'::jsonb
      ),
      (
        'PL-IN', 'ORD-FLIP-IN', 'Small Dispatch', 'Finalised', 200,
        '[{"netWeightKg": 200, "unit": "Kg"}]'::jsonb,
        '{"orderId":"ORD-FLIP-IN","jobName":"Small Dispatch","packingStatus":"Finalised","items":[{"netWeightKg":200,"unit":"Kg"}]}'::jsonb
      ),
      (
        'PL-OUT', 'ORD-FLIP-OUT', 'Large Dispatch', 'Finalised', 1000,
        '[{"netWeightKg": 1000, "unit": "Kg"}]'::jsonb,
        '{"orderId":"ORD-FLIP-OUT","jobName":"Large Dispatch","packingStatus":"Finalised","items":[{"netWeightKg":1000,"unit":"Kg"}]}'::jsonb
      );
    INSERT INTO public.delivery_challans (id, payload) VALUES
      ('DC-BOTH', '{"orderId":"ORD-BOTH","jobName":"Tea Pouch","items":[{"quantity":400,"unit":"Kg"}]}'::jsonb),
      ('DC-CANCEL', '{"orderId":"ORD-NONE","jobName":"Not Dispatched","status":"Cancelled","items":[{"quantity":500,"unit":"Kg"}]}'::jsonb);
    INSERT INTO public.high_scrap_registry (id, payload) VALUES
      ('high-scrap:ORD-NONE', '{"orderId":"ORD-NONE","source":"high-scrap-registry","wastagePct":8}'::jsonb),
      ('high-scrap:KEEP', '{"orderId":"ORD-NONE","source":"buyer-return","wastagePct":8}'::jsonb);
  `);

  await db.exec('SELECT private.refresh_high_scrap_registry()');

  const flagged = await db.query(`
    SELECT order_id, total_wastage_kg, wastage_percentage, order_qty_kg, dispatch_qty_kg
    FROM public.high_scrap_audit_registry
    ORDER BY order_id
  `);
  const ids = flagged.rows.map((row) => row.order_id);
  assert.deepEqual(ids, ['ORD-BOTH', 'ORD-FLIP-IN', 'ORD-ROLLS']);

  const rolls = flagged.rows.find((row) => row.order_id === 'ORD-ROLLS');
  assert.equal(Number(rolls.order_qty_kg), 500);
  assert.equal(Number(rolls.dispatch_qty_kg), 420);
  assert.equal(Number(rolls.total_wastage_kg), 30.82);
  assert.equal(Number(rolls.wastage_percentage), 7.34);

  const both = flagged.rows.find((row) => row.order_id === 'ORD-BOTH');
  assert.equal(Number(both.dispatch_qty_kg), 400);
  assert.equal(Number(both.wastage_percentage), 5);

  const flippedIn = flagged.rows.find((row) => row.order_id === 'ORD-FLIP-IN');
  assert.equal(Number(flippedIn.order_qty_kg), 1000);
  assert.equal(Number(flippedIn.dispatch_qty_kg), 200);
  assert.equal(Number(flippedIn.wastage_percentage), 10);

  const stored = await db.query(`SELECT id, payload FROM public.high_scrap_registry ORDER BY id`);
  const storedIds = stored.rows.map((row) => row.id);
  assert.equal(storedIds.includes('high-scrap:ORD-NONE'), false);
  assert.equal(storedIds.includes('high-scrap:KEEP'), true);
  const storedRolls = stored.rows.find((row) => row.id === 'high-scrap:ORD-ROLLS');
  assert.equal(Number(storedRolls.payload.dispatchQtyKg), 420);
  assert.equal(Number(storedRolls.payload.wastagePct), 7.34);
  assert.equal(storedRolls.payload.source, 'high-scrap-registry');

  const plan = await db.query(
    `SELECT private.print_run_wastage_plan('ORD-ROLLS', $1::jsonb) AS plan`,
    [JSON.stringify({ printingWastageKg: 30.82, orderQtyKg: 500, jobName: 'Sonu Mango Mirchi Shots Inner' })]
  );
  const body = plan.rows[0].plan;
  assert.equal(Number(body.registry.upsert.dispatchQtyKg), 420);
  assert.equal(Number(body.registry.upsert.orderQtyKg), 500);
  assert.equal(Number(body.registry.upsert.wastagePct), 7.34);

  const pending = await db.query(
    `SELECT private.print_run_wastage_plan('ORD-NONE', '{"printingWastageKg":80}'::jsonb) AS plan`
  );
  assert.equal(pending.rows[0].plan.registry.upsert ?? null, null);
  assert.equal(pending.rows[0].plan.registry.deleteId, 'high-scrap:ORD-NONE');

  await db.close();
});
