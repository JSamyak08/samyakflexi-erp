import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(new URL('../supabase/migrations/20261114020000_delivery_challan_once.sql', import.meta.url), 'utf8');

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text,
      client_name text,
      order_type text,
      order_qty_kg numeric,
      status text,
      close_mode text,
      closed_by text,
      closed_at timestamptz,
      close_reason text,
      over_dispatch_warning text,
      job_details jsonb
    );
    CREATE TABLE public.delivery_challans (
      id text PRIMARY KEY,
      challan_no text,
      client_name text,
      payload jsonb,
      challan_nature text,
      party_type text
    );
    CREATE TABLE public.dispatch_shipments (
      id text,
      dispatch_id text,
      order_id text,
      job_name text,
      packing_status text,
      total_net_weight_kg numeric,
      items jsonb,
      payload jsonb
    );
    CREATE TABLE public.sfg_goods (
      id text PRIMARY KEY,
      order_id text,
      job_name text,
      sfg_batch_code text,
      sfg_type text,
      available_kg numeric,
      total_net_kg numeric,
      consumed_kg numeric
    );
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text
    );
    INSERT INTO public.orders (id, job_name, client_name, order_qty_kg, status)
    VALUES
      ('ORD-A', 'Alpha Pouch', 'Alpha', 100, 'In Production'),
      ('ORD-B', 'Beta Pouch', 'Beta', 100, 'Slitting'),
      ('ORD-K', 'Kasa Creamy Donuts ||| {"jobDetails":{}}', 'Kasa', 1000, 'In Production');
    INSERT INTO public.delivery_challans (id, challan_no, client_name, challan_nature, payload)
    VALUES
      ('DC-OLD-1', 'SIL/DC/26-27/102', 'Jindal', 'Sale of Goods', '{"challanNature":"Sale of Goods","jobName":"Old Job"}'),
      ('DC-OLD-2', 'SIL/DC/26-27/102', 'Zain', 'Sale of Goods', '{"challanNature":"Sale of Goods","jobName":"Other Job"}');
  `);
  await db.exec(migrationSql);
  return db;
}

test('the delivery challan migration keeps the two-argument dispatched kg function', () => {
  assert.doesNotMatch(migrationSql, /DROP FUNCTION IF EXISTS private\.order_dispatched_kg\(text, text\)/);
  assert.match(migrationSql, /FUNCTION private\.order_dispatched_kg_except/);
  assert.match(migrationSql, /FUNCTION private\.order_dispatched_kg\(p_order_id text, p_job_name text\)/);
  assert.doesNotMatch(migrationSql, /p_except_shipment_ids text\[\] DEFAULT/);
});

test('existing duplicate challan numbers are kept and the next number is unused', async () => {
  const db = await database();
  const before = await db.query(`SELECT challan_no, count(*)::int AS n FROM public.delivery_challans GROUP BY challan_no`);
  assert.equal(before.rows.find((row) => row.challan_no === 'SIL/DC/26-27/102').n, 2);
  const issued = await db.query(`SELECT public.allocate_delivery_challan_no() AS n`);
  assert.equal(issued.rows[0].n, 'SIL/DC/26-27/103');
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.delivery_challans (id, challan_no, payload, challan_nature)
      VALUES ('DC-DUP', 'SIL/DC/26-27/102', '{"challanNature":"Sale of Goods"}', 'Sale of Goods')
    `),
    /already used/
  );
  const after = await db.query(`SELECT count(*)::int AS n FROM public.delivery_challans WHERE challan_no = 'SIL/DC/26-27/102'`);
  assert.equal(after.rows[0].n, 2);
  await db.close();
});

test('a second sale challan for the same order is rejected and an edit is kept', async () => {
  const db = await database();
  await db.query(`
    INSERT INTO public.delivery_challans (id, challan_no, payload, challan_nature)
    VALUES (
      'DC-A',
      'SIL/DC/26-27/201',
      '{"challanNature":"Sale of Goods","orderId":"ORD-A","items":[{"quantity":100,"unit":"Kg","orderId":"ORD-A"}]}',
      'Sale of Goods'
    )
  `);
  const closed = await db.query(`SELECT status, close_mode FROM public.orders WHERE id = 'ORD-A'`);
  assert.equal(closed.rows[0].status, 'Completed');
  assert.equal(closed.rows[0].close_mode, 'auto');

  await assert.rejects(
    () => db.query(`
      INSERT INTO public.delivery_challans (id, challan_no, payload, challan_nature)
      VALUES (
        'DC-A2',
        'SIL/DC/26-27/202',
        '{"challanNature":"Sale of Goods","orderId":"ORD-A","items":[{"quantity":10,"unit":"Kg"}]}',
        'Sale of Goods'
      )
    `),
    /already has Sale of Goods delivery challan/
  );

  await db.query(`
    UPDATE public.delivery_challans
    SET payload = '{"challanNature":"Sale of Goods","orderId":"ORD-A","items":[{"quantity":40,"unit":"Kg","orderId":"ORD-A"}]}'
    WHERE id = 'DC-A'
  `);
  const balance = await db.query(`SELECT status FROM public.orders WHERE id = 'ORD-A'`);
  assert.equal(balance.rows[0].status, 'Balance Dispatch Pending');

  await db.query(`
    INSERT INTO public.delivery_challans (id, challan_no, payload, challan_nature)
    VALUES (
      'DC-R',
      'SIL/DC/26-27/203',
      '{"challanNature":"Returnable Material","orderId":"ORD-B","items":[{"quantity":5,"unit":"Kg"}]}',
      'Returnable Material'
    )
  `);
  await db.query(`
    UPDATE public.delivery_challans
    SET payload = '{"challanNature":"Sale of Goods","status":"Cancelled","orderId":"ORD-A","items":[{"quantity":40,"unit":"Kg"}]}'
    WHERE id = 'DC-A'
  `);
  const reopened = await db.query(`SELECT status, close_mode FROM public.orders WHERE id = 'ORD-A'`);
  assert.equal(reopened.rows[0].status, 'In Production');
  assert.equal(reopened.rows[0].close_mode, null);

  await db.query(`
    INSERT INTO public.delivery_challans (id, challan_no, payload, challan_nature)
    VALUES (
      'DC-A3',
      'SIL/DC/26-27/204',
      '{"challanNature":"Sale of Goods","orderId":"ORD-A","items":[{"quantity":95,"unit":"Kg"}]}',
      'Sale of Goods'
    )
  `);
  const again = await db.query(`SELECT status FROM public.orders WHERE id = 'ORD-A'`);
  assert.equal(again.rows[0].status, 'Completed');
  await db.close();
});

test('a multi-order packing list challan blocks only the orders it covers', async () => {
  const db = await database();
  await db.exec(`
    INSERT INTO public.dispatch_shipments (id, dispatch_id, order_id, job_name, packing_status, total_net_weight_kg, items)
    VALUES (
      'DISP-1', 'PL-1', 'ORD-A', 'Alpha Pouch', 'Finalised', 100,
      '[{"orderId":"ORD-A","jobName":"Alpha Pouch","netWeightKg":40},{"orderId":"ORD-B","jobName":"Beta Pouch","netWeightKg":60}]'
    );
  `);
  await db.query(`
    INSERT INTO public.delivery_challans (id, challan_no, payload, challan_nature)
    VALUES (
      'DC-BOTH',
      'SIL/DC/26-27/210',
      '{"challanNature":"Sale of Goods","linkedPackingListIds":["PL-1"],"items":[
        {"orderId":"ORD-A","jobName":"Alpha Pouch","quantity":40,"unit":"Kg","packingListId":"PL-1"},
        {"orderId":"ORD-B","jobName":"Beta Pouch","quantity":60,"unit":"Kg","packingListId":"PL-1"}
      ]}',
      'Sale of Goods'
    )
  `);
  const statuses = await db.query(`SELECT id, status FROM public.orders WHERE id IN ('ORD-A','ORD-B') ORDER BY id`);
  assert.equal(statuses.rows[0].status, 'Balance Dispatch Pending');
  assert.equal(statuses.rows[1].status, 'Balance Dispatch Pending');
  await db.query(`
    INSERT INTO public.delivery_challans (id, challan_no, payload, challan_nature)
    VALUES ('DC-B2', 'SIL/DC/26-27/211', '{"challanNature":"Sale of Goods","orderId":"ORD-B","items":[{"orderId":"ORD-B","quantity":20,"unit":"Kg"}]}', 'Sale of Goods')
  `);
  const afterBalance = await db.query(`SELECT status FROM public.orders WHERE id = 'ORD-B'`);
  assert.equal(afterBalance.rows[0].status, 'Balance Dispatch Pending');
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.delivery_challans (id, challan_no, payload, challan_nature)
      VALUES ('DC-B3', 'SIL/DC/26-27/212', '{"challanNature":"Sale of Goods","orderId":"ORD-B","items":[{"quantity":10,"unit":"Kg"}]}', 'Sale of Goods')
    `),
    /third challan is not issued/
  );
  await db.close();
});

test('one balance challan can complete the order and a later print write cannot reopen it', async () => {
  const db = await database();
  await db.query(`
    INSERT INTO public.delivery_challans (id, challan_no, payload, challan_nature)
    VALUES (
      'DC-SHORT',
      'SIL/DC/26-27/230',
      '{"challanNature":"Sale of Goods","orderId":"ORD-A","items":[{"orderId":"ORD-A","quantity":40,"unit":"Kg"}]}',
      'Sale of Goods'
    )
  `);
  const pending = await db.query(`SELECT status FROM public.orders WHERE id = 'ORD-A'`);
  assert.equal(pending.rows[0].status, 'Balance Dispatch Pending');
  await db.query(`
    INSERT INTO public.delivery_challans (id, challan_no, payload, challan_nature)
    VALUES (
      'DC-BAL',
      'SIL/DC/26-27/231',
      '{"challanNature":"Sale of Goods","orderId":"ORD-A","items":[{"orderId":"ORD-A","quantity":55,"unit":"Kg"}]}',
      'Sale of Goods'
    )
  `);
  const closed = await db.query(`SELECT status, close_mode FROM public.orders WHERE id = 'ORD-A'`);
  assert.equal(closed.rows[0].status, 'Completed');
  assert.equal(closed.rows[0].close_mode, 'auto');
  await db.query(`UPDATE public.orders SET status = 'In Production' WHERE id = 'ORD-A'`);
  const kept = await db.query(`SELECT status, close_mode FROM public.orders WHERE id = 'ORD-A'`);
  assert.equal(kept.rows[0].status, 'Completed');
  assert.equal(kept.rows[0].close_mode, 'auto');
  await db.close();
});

test('over-dispatch is Completed and does not renumber the stored challan', async () => {
  const db = await database();
  await db.query(`
    INSERT INTO public.delivery_challans (id, challan_no, payload, challan_nature)
    VALUES (
      'DC-K',
      'SIL/DC/26-27/220',
      '{"challanNature":"Sale of Goods","jobName":"Kasa Creamy Donuts","items":[{"quantity":1137.1,"unit":"Kg"}]}',
      'Sale of Goods'
    )
  `);
  const row = await db.query(`SELECT status, close_mode, over_dispatch_warning FROM public.orders WHERE id = 'ORD-K'`);
  assert.equal(row.rows[0].status, 'Completed');
  assert.equal(row.rows[0].close_mode, 'auto');
  assert.equal(row.rows[0].over_dispatch_warning, null);
  const numbers = await db.query(`SELECT count(*)::int AS n FROM public.delivery_challans WHERE challan_no = 'SIL/DC/26-27/102'`);
  assert.equal(numbers.rows[0].n, 2);
  const kept = await db.query(`SELECT challan_no FROM public.delivery_challans WHERE id = 'DC-K'`);
  assert.equal(kept.rows[0].challan_no, 'SIL/DC/26-27/220');
  await db.close();
});

const wastagePreviousSql = fs.readFileSync(
  new URL('../supabase/migrations/20261026140000_job_wastage_scrap_registry.sql', import.meta.url),
  'utf8'
);
const wastageSql = fs.readFileSync(
  new URL('../supabase/migrations/20261113210000_wastage_pct_of_dispatch.sql', import.meta.url),
  'utf8'
);

test('the scrap registry view blocks a drop and still works after this migration', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text,
      client_name text,
      order_qty_kg numeric,
      job_details jsonb,
      order_type text,
      status text,
      close_mode text,
      closed_by text,
      closed_at timestamptz,
      close_reason text,
      over_dispatch_warning text
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
      challan_no text,
      client_name text,
      payload jsonb,
      challan_nature text,
      party_type text
    );
    CREATE TABLE public.dispatch_shipments (
      id text,
      dispatch_id text PRIMARY KEY,
      order_id text,
      job_name text,
      client_name text,
      packing_status text,
      total_net_weight_kg numeric,
      items jsonb,
      payload jsonb
    );
    CREATE TABLE public.sfg_goods (
      id text PRIMARY KEY,
      order_id text,
      job_name text,
      sfg_batch_code text,
      sfg_type text,
      available_kg numeric,
      total_net_kg numeric,
      consumed_kg numeric
    );
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text
    );
  `);
  await db.exec(wastagePreviousSql);
  await db.exec(wastageSql);
  await db.exec(`
    INSERT INTO public.orders (id, job_name, order_qty_kg) VALUES
      ('ORD-ROLLS', 'Sonu Mango Mirchi Shots Inner', 500);
    INSERT INTO public.production_records (
      id, order_id, job_name, printing_wastage_kg, process_logs, recorded_at
    ) VALUES
      ('REC-ROLLS', 'ORD-ROLLS', 'Sonu Mango Mirchi Shots Inner', 30.82, '{}'::jsonb, '2026-10-26T10:00:00Z');
    INSERT INTO public.dispatch_shipments (
      dispatch_id, order_id, job_name, packing_status, total_net_weight_kg, items, payload
    ) VALUES (
      'PL-ROLLS', 'ORD-ROLLS', 'Sonu Mango Mirchi Shots Inner', 'Finalised', 420,
      '[{"netWeightKg": 210.5, "unit": "Kg"}, {"netWeightKg": 209.5, "unit": "Kg"}]'::jsonb,
      '{"orderId":"ORD-ROLLS","jobName":"Sonu Mango Mirchi Shots Inner","packingStatus":"Finalised","totalNetWeightKg":420,"items":[{"netWeightKg":210.5,"unit":"Kg"},{"netWeightKg":209.5,"unit":"Kg"}]}'::jsonb
    );
  `);
  const before = await db.query(`
    SELECT dispatch_qty_kg FROM public.high_scrap_audit_registry WHERE order_id = 'ORD-ROLLS'
  `);
  assert.equal(Number(before.rows[0].dispatch_qty_kg), 420);
  const dependents = await db.query(`
    SELECT c.relname AS view_name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_depend d ON d.refobjid = p.oid AND d.refclassid = 'pg_proc'::regclass
    JOIN pg_rewrite r ON d.classid = 'pg_rewrite'::regclass AND r.oid = d.objid
    JOIN pg_class c ON c.oid = r.ev_class
    WHERE n.nspname = 'private'
      AND p.proname = 'order_dispatched_kg'
      AND pg_get_function_identity_arguments(p.oid) = 'p_order_id text, p_job_name text'
  `);
  assert.deepEqual(dependents.rows.map((row) => row.view_name), ['high_scrap_audit_registry']);
  await assert.rejects(
    () => db.exec('DROP FUNCTION private.order_dispatched_kg(text, text)'),
    /cannot drop function private\.order_dispatched_kg\(text,text\)/
  );
  await db.exec(migrationSql);
  const after = await db.query(`
    SELECT dispatch_qty_kg FROM public.high_scrap_audit_registry WHERE order_id = 'ORD-ROLLS'
  `);
  assert.equal(Number(after.rows[0].dispatch_qty_kg), 420);
  const signatures = await db.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND p.proname LIKE 'order_dispatched_kg%'
    ORDER BY 1, 2
  `);
  assert.deepEqual(signatures.rows, [
    { proname: 'order_dispatched_kg', args: 'p_order_id text, p_job_name text' },
    { proname: 'order_dispatched_kg_except', args: 'p_order_id text, p_job_name text, p_except_shipment_ids text[]' },
  ]);
  await db.close();
});
