import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261113120000_revert_sfg_consumption.sql', import.meta.url),
  'utf8'
);

const ADMIN = '11111111-1111-4111-8111-111111111111';
const PLANT = '22222222-2222-4222-8222-222222222222';
const OPERATOR = '33333333-3333-4333-8333-333333333333';
const PRODUCTION = '44444444-4444-4444-8444-444444444444';

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      auth_user_id uuid,
      username text,
      full_name text,
      email text,
      role text,
      status text,
      active boolean
    );
    CREATE OR REPLACE FUNCTION private.has_role(allowed text[])
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.users AS u
        WHERE u.auth_user_id = auth.uid()
          AND coalesce(u.active, true) IS TRUE
          AND (u.role = 'Admin' OR u.role = ANY (allowed))
      );
    $$;
    CREATE TABLE public.sfg_goods (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sfg_batch_code text UNIQUE,
      sfg_type text,
      job_name text,
      order_id text,
      status text,
      notes text,
      consumed_kg numeric,
      available_kg numeric,
      consumption_history jsonb,
      updated_at timestamptz
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      available_weight_kg numeric,
      net_weight_kg numeric,
      status text,
      roll_type text
    );
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_code text,
      item_name text NOT NULL DEFAULT 'Item',
      stock_qty_kg numeric,
      allocated_qty_kg numeric,
      metadata jsonb,
      last_updated timestamptz
    );
    CREATE TABLE public.inventory_ledger_entries (
      id text PRIMARY KEY,
      entry_kind text,
      barcode text,
      scope_key text,
      production_record_id text,
      record_consumed numeric,
      record_payload jsonb,
      applied_stock_kg numeric,
      stock_item_id text,
      print_consumed numeric,
      parent_status_before text,
      parent_available_before numeric,
      updated_at timestamptz
    );
    CREATE TABLE public.production_records (
      id text PRIMARY KEY,
      order_id text,
      job_name text,
      process_logs jsonb,
      sfg_consumptions jsonb,
      materials_list jsonb,
      output_rolls jsonb,
      rolls_breakdown jsonb,
      qty_lamination_l1 numeric,
      adhesive_consumed_l1_kg numeric,
      lamination_plain_substrate_wastage_kg numeric,
      laminate_wastage_kg numeric,
      qty_second_pass_l2 numeric,
      adhesive_consumed_l2_kg numeric,
      lamination_plain_substrate_wastage_l2_kg numeric,
      qty_first_pass_l1 numeric,
      printing_plain_setting_wastage_kg numeric,
      printing_wastage_kg numeric,
      qty_slitting numeric,
      trim_wastage_kg numeric,
      qty_pouching numeric,
      zipper_consumed_kg numeric,
      pouching_scrap_kg numeric
    );
    CREATE TABLE public.sfg_scrap_items (
      id text PRIMARY KEY,
      payload jsonb,
      updated_at timestamptz
    );
    CREATE TABLE public.erp_notifications (
      id text PRIMARY KEY,
      payload jsonb,
      created_at timestamptz,
      updated_at timestamptz
    );
    CREATE TABLE public.audit_logs (
      id text PRIMARY KEY,
      username text,
      user_role text,
      action_type text,
      module text,
      details text,
      target_id text,
      created_at timestamptz,
      actor_id uuid
    );
    INSERT INTO public.users (id, auth_user_id, full_name, role, active) VALUES
      ('admin', '${ADMIN}', 'QA Admin', 'Admin', true),
      ('plant', '${PLANT}', 'QA Plant', 'Plant Manager', true),
      ('prod', '${PRODUCTION}', 'QA Production', 'Production Manager', true),
      ('op', '${OPERATOR}', 'QA Operator', 'Printing Operator', true);
  `);
  await db.exec(migrationSql);
  return db;
}

async function asUser(db, uid) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false)`);
}

function history(logs) {
  return JSON.stringify({ consumptionHistory: logs, consumedKg: 0, availableKg: 0 }).replace(/'/g, "''");
}

test('migration is idempotent and keeps the revert function private to signed-in staff', async () => {
  const db = await database();
  await db.exec(migrationSql);
  await db.exec(migrationSql);
  const grants = await db.query(`
    SELECT grantee FROM information_schema.routine_privileges
    WHERE routine_name = 'revert_sfg_consumption' AND grantee = 'anon'
  `);
  assert.equal(grants.rows.length, 0);
  await db.close();
});

test('a simple consume reverts to the exact before balances and tells Admin', async () => {
  const db = await database();
  const notes = JSON.stringify({
    sfgBatchCode: 'SFG-100',
    consumedKg: 25,
    availableKg: 75,
    status: 'Partially Consumed',
    consumptionHistory: [{
      id: 'LOG-1',
      timestamp: new Date().toISOString(),
      consumedKg: 25,
      targetProcess: 'Dispatch Packing',
      sfgBatchCode: 'SFG-100',
      jobName: 'Peas Pouch'
    }]
  });
  await db.query(`
    INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name, status, notes, consumed_kg, available_kg)
    VALUES ('SFG-100', 'Printed Rolls', 'Peas Pouch', 'Partially Consumed', $1, 25, 75)
  `, [notes]);
  await db.exec(`
    INSERT INTO public.inventory_rolls (barcode_id, available_weight_kg, net_weight_kg, status)
    VALUES ('SFG-100', 75, 100, 'In Stock (SFG)');
    INSERT INTO public.inventory (id, item_code, item_name, stock_qty_kg, allocated_qty_kg, metadata)
    VALUES ('SFG-100', 'SFG-100', 'Peas roll', 75, 25, '{"availableQtyKg":75,"allocatedQtyKg":25}'::jsonb);
  `);
  await asUser(db, ADMIN);
  const result = await db.query(`SELECT public.revert_sfg_consumption('SFG-100', 'LOG-1', 'wrong weight') AS plan`);
  const plan = result.rows[0].plan;
  assert.equal(plan.applied, true);
  assert.equal(Number(plan.availableAfter), 100);
  assert.equal(Number(plan.consumedAfter), 0);
  const good = await db.query(`SELECT consumed_kg, available_kg, status, notes FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-100'`);
  assert.equal(Number(good.rows[0].consumed_kg), 0);
  assert.equal(Number(good.rows[0].available_kg), 100);
  assert.equal(good.rows[0].status, 'In Stock (WIP)');
  const saved = JSON.parse(good.rows[0].notes);
  assert.equal(saved.consumptionHistory[0].status, 'Reverted');
  assert.equal(saved.consumptionHistory[0].revertReason, 'wrong weight');
  assert.equal(saved.consumptionHistory[0].revertedBy, 'QA Admin');
  const roll = await db.query(`SELECT available_weight_kg, status FROM public.inventory_rolls WHERE barcode_id = 'SFG-100'`);
  assert.equal(Number(roll.rows[0].available_weight_kg), 100);
  const stock = await db.query(`SELECT stock_qty_kg, allocated_qty_kg FROM public.inventory WHERE id = 'SFG-100'`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 100);
  assert.equal(Number(stock.rows[0].allocated_qty_kg), 0);
  const notice = await db.query(`SELECT payload FROM public.erp_notifications WHERE id = 'CONSUMPTION-REVERT-LOG-1'`);
  assert.equal(notice.rows[0].payload.type, 'CONSUMPTION_REVERTED');
  assert.match(notice.rows[0].payload.message, /SFG-100/);
  assert.match(notice.rows[0].payload.message, /Peas Pouch/);
  assert.match(notice.rows[0].payload.message, /25\.00 kg/);
  assert.match(notice.rows[0].payload.message, /QA Admin/);
  assert.match(notice.rows[0].payload.message, /wrong weight/);
  await db.close();
});

test('reverting one of two consumptions leaves the other deduction in place', async () => {
  const db = await database();
  const notes = JSON.stringify({
    consumedKg: 50,
    availableKg: 50,
    consumptionHistory: [
      { id: 'LOG-B', timestamp: new Date().toISOString(), consumedKg: 20, targetProcess: 'Dispatch Packing', sfgBatchCode: 'SFG-100', jobName: 'Peas' },
      { id: 'LOG-A', timestamp: new Date(Date.now() - 86400000).toISOString(), consumedKg: 30, targetProcess: 'Dispatch Packing', sfgBatchCode: 'SFG-100', jobName: 'Peas' }
    ]
  });
  await db.query(`
    INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name, status, notes, consumed_kg, available_kg)
    VALUES ('SFG-100', 'Printed Rolls', 'Peas', 'Partially Consumed', $1, 50, 50)
  `, [notes]);
  await asUser(db, PRODUCTION);
  await db.query(`SELECT public.revert_sfg_consumption('SFG-100', 'LOG-A', 'first entry was wrong')`);
  const good = await db.query(`SELECT consumed_kg, available_kg, status, notes FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-100'`);
  assert.equal(Number(good.rows[0].consumed_kg), 20);
  assert.equal(Number(good.rows[0].available_kg), 80);
  assert.equal(good.rows[0].status, 'Partially Consumed');
  const saved = JSON.parse(good.rows[0].notes);
  const reverted = saved.consumptionHistory.find((log) => log.id === 'LOG-A');
  const kept = saved.consumptionHistory.find((log) => log.id === 'LOG-B');
  assert.equal(reverted.status, 'Reverted');
  assert.equal(kept.status, undefined);
  assert.equal(saved.consumptionHistory[0].id, 'LOG-B');
  await db.close();
});

test('lamination revert restores the substrate roll, raw-material stock, and removes the balance roll', async () => {
  const db = await database();
  const notes = JSON.stringify({
    consumedKg: 40,
    availableKg: 60,
    consumptionHistory: [{
      id: 'LOG-LAM',
      timestamp: new Date().toISOString(),
      consumedKg: 40,
      targetProcess: 'Lamination (Pass 1)',
      sfgBatchCode: 'SFG-100',
      jobName: 'Peas',
      orderId: 'ORD-1',
      substrate2Rolls: [{ barcode: 'RM-1', initialKg: 80, consumedKg: 30, itemId: 'FILM-1' }],
      outputRoll: { barcode: 'SFG-OUT', netWeightKg: 55 },
      scrapBreakdown: { laminateWastageKg: 2, laminationPlainSubstrateWastageKg: 1, adhesiveConsumedL1Kg: 3 }
    }]
  });
  await db.query(`
    INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name, order_id, status, notes, consumed_kg, available_kg)
    VALUES
      ('SFG-100', 'Printed Rolls', 'Peas', 'ORD-1', 'Partially Consumed', $1, 40, 60),
      ('SFG-OUT', 'Laminated / Processed Rolls', 'Peas', 'ORD-1', 'In Stock (WIP)', '{"consumedKg":0,"availableKg":55,"status":"In Stock (WIP)","consumptionHistory":[]}', 0, 55)
  `, [notes]);
  await db.exec(`
    INSERT INTO public.inventory_rolls (barcode_id, available_weight_kg, net_weight_kg, status) VALUES
      ('SFG-100', 60, 100, 'In Stock (SFG)'),
      ('RM-1', 0, 80, 'Issued to Lamination'),
      ('RM-1-BAL', 50, 50, 'In Stock (RM)'),
      ('SFG-OUT', 55, 55, 'In Stock (SFG)');
    INSERT INTO public.inventory (id, item_code, item_name, stock_qty_kg, metadata)
    VALUES ('FILM-1', 'FILM-1', 'PET', 170, '{}'::jsonb);
    INSERT INTO public.inventory_ledger_entries (
      id, entry_kind, barcode, scope_key, production_record_id, record_consumed, applied_stock_kg, stock_item_id, parent_status_before
    ) VALUES (
      'roll-issue:ord:ORD-1:rm-1', 'issue', 'RM-1', 'ord:ORD-1', 'REC-1', 30, 30, 'FILM-1', 'Issued to Lamination'
    );
    INSERT INTO public.production_records (
      id, order_id, job_name, qty_lamination_l1, adhesive_consumed_l1_kg,
      lamination_plain_substrate_wastage_kg, laminate_wastage_kg, materials_list, process_logs, output_rolls
    ) VALUES (
      'REC-1', 'ORD-1', 'Peas', 55, 3, 1, 2,
      '[{"id":"lam-film:ORD-1:LOG-LAM:RM-1","logId":"LOG-LAM","ledgerSource":"lamination-substrate","barcode":"RM-1","netConsumedQtyKg":30}]'::jsonb,
      jsonb_build_object(
        'sfgConsumptions', (SELECT notes::jsonb->'consumptionHistory' FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-100'),
        'qtyLaminationL1', 55,
        'outputRolls', '[{"barcodeId":"SFG-OUT","netWeightKg":55}]'::jsonb
      ),
      '[{"barcodeId":"SFG-OUT","netWeightKg":55}]'::jsonb
    );
    INSERT INTO public.sfg_scrap_items (id, payload) VALUES
      ('print-scrap:ORD-1:laminate-wastage', '{"scrapQtyKg":2}'::jsonb);
  `);
  await asUser(db, PLANT);
  await db.query(`SELECT public.revert_sfg_consumption('SFG-100', 'LOG-LAM', 'lamination was the wrong roll')`);
  const parent = await db.query(`SELECT available_weight_kg, status FROM public.inventory_rolls WHERE barcode_id = 'RM-1'`);
  assert.equal(Number(parent.rows[0].available_weight_kg), 80);
  assert.equal(parent.rows[0].status, 'In Stock (RM)');
  const balance = await db.query(`SELECT available_weight_kg, net_weight_kg, status FROM public.inventory_rolls WHERE barcode_id = 'RM-1-BAL'`);
  assert.equal(Number(balance.rows[0].available_weight_kg), 0);
  assert.equal(balance.rows[0].status, 'Reversed');
  const film = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'FILM-1'`);
  assert.equal(Number(film.rows[0].stock_qty_kg), 200);
  const output = await db.query(`SELECT count(*)::int AS n FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-OUT'`);
  assert.equal(output.rows[0].n, 0);
  const record = await db.query(`SELECT qty_lamination_l1, laminate_wastage_kg, materials_list, process_logs FROM public.production_records WHERE id = 'REC-1'`);
  assert.equal(Number(record.rows[0].qty_lamination_l1), 0);
  assert.equal(Number(record.rows[0].laminate_wastage_kg), 0);
  assert.equal(record.rows[0].materials_list.length, 0);
  assert.equal(record.rows[0].process_logs.sfgConsumptions[0].status, 'Reverted');
  const scrap = await db.query(`SELECT count(*)::int AS n FROM public.sfg_scrap_items WHERE id = 'print-scrap:ORD-1:laminate-wastage'`);
  assert.equal(scrap.rows[0].n, 0);
  const sourceGood = await db.query(`SELECT consumed_kg, available_kg FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-100'`);
  assert.equal(Number(sourceGood.rows[0].consumed_kg), 0);
  assert.equal(Number(sourceGood.rows[0].available_kg), 100);
  await db.close();
});

test('an output that has moved on blocks the revert', async () => {
  const db = await database();
  const notes = JSON.stringify({
    consumedKg: 40,
    availableKg: 60,
    consumptionHistory: [{
      id: 'LOG-OUT',
      timestamp: new Date().toISOString(),
      consumedKg: 40,
      targetProcess: 'Slitting & Rewinding',
      outputRoll: { barcode: 'FG-OUT', netWeightKg: 36 }
    }]
  });
  await db.query(`
    INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name, status, notes, consumed_kg, available_kg)
    VALUES
      ('SFG-100', 'Printed Rolls', 'Peas', 'Partially Consumed', $1, 40, 60),
      ('FG-OUT', 'Finished Goods (FG)', 'Peas', 'Fully Consumed', '{"consumedKg":36,"availableKg":0,"status":"Fully Consumed","consumptionHistory":[{"id":"LOG-NEXT","consumedKg":36,"targetProcess":"Dispatch Packing","status":"Recorded"}]}', 36, 0)
  `, [notes]);
  await asUser(db, ADMIN);
  await assert.rejects(
    () => db.query(`SELECT public.revert_sfg_consumption('SFG-100', 'LOG-OUT', 'try')`),
    /Output roll FG-OUT has already been consumed/
  );
  const good = await db.query(`SELECT consumed_kg FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-100'`);
  assert.equal(Number(good.rows[0].consumed_kg), 40);
  await db.close();
});

test('the revert window closes after 7 days and a printing operator is rejected', async () => {
  const db = await database();
  const oldStamp = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const edgeStamp = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 5000).toISOString();
  const notes = JSON.stringify({
    consumedKg: 10,
    availableKg: 90,
    consumptionHistory: [
      { id: 'LOG-OLD', timestamp: oldStamp, consumedKg: 4, targetProcess: 'Dispatch Packing' },
      { id: 'LOG-EDGE', timestamp: edgeStamp, consumedKg: 6, targetProcess: 'Dispatch Packing' }
    ]
  });
  await db.query(`
    INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name, status, notes, consumed_kg, available_kg)
    VALUES ('SFG-100', 'Printed Rolls', 'Peas', 'Partially Consumed', $1, 10, 90)
  `, [notes]);
  await asUser(db, OPERATOR);
  await assert.rejects(
    () => db.query(`SELECT public.revert_sfg_consumption('SFG-100', 'LOG-EDGE', 'no')`),
    /Only Admin, Plant Manager, and Production Manager/
  );
  await asUser(db, PLANT);
  await assert.rejects(
    () => db.query(`SELECT public.revert_sfg_consumption('SFG-100', 'LOG-OLD', 'too late')`),
    /Revert window \(7 days\) has passed/
  );
  const preview = await db.query(`SELECT public.preview_sfg_consumption_revert('SFG-100', 'LOG-OLD') AS plan`);
  assert.equal(preview.rows[0].plan.ok, false);
  assert.match(preview.rows[0].plan.blocks.join(' '), /Revert window \(7 days\) has passed/);
  await db.query(`SELECT public.revert_sfg_consumption('SFG-100', 'LOG-EDGE', 'still inside the window')`);
  const good = await db.query(`SELECT consumed_kg, available_kg FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-100'`);
  assert.equal(Number(good.rows[0].consumed_kg), 4);
  assert.equal(Number(good.rows[0].available_kg), 96);
  await db.close();
});
