import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261027100000_dispatch_packing_gain_loss.sql', import.meta.url),
  'utf8'
);

function entry(id, kg, extra = {}) {
  return {
    id,
    barcode: extra.barcode || `FG-${id}`,
    jobName: extra.jobName || 'Sonu jaljeera shots inner',
    jobCode: 'JOB-2',
    orderId: extra.orderId || 'ORD-2026-107',
    consumedKg: kg,
    operatorName: 'Samyak Jain',
    consumedBy: 'samyak.jain@samyakinternational.in',
    consumedAt: '2026-10-26T09:13:00.000Z',
    targetProcess: 'Dispatch Packing',
    shift: 'Day Shift',
    targetMachine: 'Expert 1000 Rotogravure Press',
    notes: 'Bay A',
    clientName: 'Samyak',
    suggestedDispatchId: extra.suggestedDispatchId || null
  };
}

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    GRANT USAGE ON SCHEMA public TO authenticated;
    CREATE OR REPLACE FUNCTION private.app_role()
    RETURNS text
    LANGUAGE sql
    STABLE
    AS $$ SELECT nullif(current_setting('test.role', true), '') $$;
    CREATE OR REPLACE FUNCTION private.can_any(modules text[])
    RETURNS boolean
    LANGUAGE sql
    STABLE
    AS $$ SELECT private.app_role() IS NOT NULL $$;

    CREATE TABLE public.dispatch_shipments (
      dispatch_id text PRIMARY KEY,
      id text,
      order_id text,
      job_name text NOT NULL,
      client_name text NOT NULL,
      vehicle_no text,
      lr_no text,
      transporter_name text,
      po_no text,
      invoice_no text,
      dispatch_date timestamptz,
      total_rolls integer DEFAULT 0,
      total_net_weight_kg numeric DEFAULT 0,
      total_gross_weight_kg numeric DEFAULT 0,
      items jsonb DEFAULT '[]'::jsonb,
      hide_branding boolean DEFAULT false,
      payload jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text,
      updated_at timestamptz
    );
    CREATE TABLE public.erp_notifications (
      id text PRIMARY KEY,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.erp_notifications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY erp_notifications_access ON public.erp_notifications
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_notifications TO authenticated;
    INSERT INTO public.dispatch_shipments (
      dispatch_id, id, order_id, job_name, client_name, total_rolls, total_net_weight_kg, items
    ) VALUES (
      'PL-LEGACY', 'DISP-LEGACY', 'ORD-2026-107', 'Sonu jaljeera shots inner', 'Samyak',
      1, 80, '[{"netWeightKg": 80, "unit": "Kg"}]'::jsonb
    );
    INSERT INTO public.erp_notifications (id, payload)
    VALUES ('notif-other', '{"id":"notif-other","type":"QC_VARIANCE_MODIFIED","title":"QC"}'::jsonb);
  `);
  await db.exec(migrationSql);
  await db.exec(`SELECT set_config('test.role', 'Store Manager', false)`);
  return db;
}

test('the migration does not rewrite existing packing lists', () => {
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.dispatch_shipments\s+SET\s+packing_status/i);
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.dispatch_shipments\s+ds?\s+SET/i);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS packing_status text/);
  assert.match(migrationSql, /packing_gain_loss_admin_read/);
  assert.match(migrationSql, /PACKING_GAIN_LOSS/);
  assert.match(migrationSql, /private\.app_role\(\) = 'Admin'/);
  assert.match(migrationSql, /RETURN 2/);
});

test('consumption is idempotent, joins only an open list, and hides gain/loss from other roles', async () => {
  const db = await database();
  await db.exec(migrationSql);

  const legacy = await db.query(`SELECT packing_status, total_net_weight_kg, job_name FROM public.dispatch_shipments WHERE dispatch_id = 'PL-LEGACY'`);
  assert.equal(legacy.rows[0].packing_status, null);
  assert.equal(Number(legacy.rows[0].total_net_weight_kg), 80);
  assert.equal(legacy.rows[0].job_name, 'Sonu jaljeera shots inner');

  const first = await db.query(
    `SELECT public.record_dispatch_packing_consumption($1::jsonb) AS result`,
    [JSON.stringify(entry('SFG-LOG-1', 107, { suggestedDispatchId: 'PL-2026-606130' }))]
  );
  const created = first.rows[0].result;
  assert.equal(created.created, true);
  assert.equal(created.idempotent, false);
  assert.equal(created.dispatchId, 'PL-2026-606130');
  assert.equal(created.shipment.packingStatus, 'Open');
  assert.equal(created.shipment.dispatchConsumptions.length, 1);
  assert.equal(Number(created.shipment.dispatchConsumptions[0].consumedKg), 107);
  assert.equal(created.shipment.dispatchConsumptions[0].barcode, 'FG-SFG-LOG-1');
  assert.equal(created.shipment.dispatchConsumptions[0].consumedBy, 'samyak.jain@samyakinternational.in');

  const second = await db.query(
    `SELECT public.record_dispatch_packing_consumption($1::jsonb) AS result`,
    [JSON.stringify(entry('SFG-LOG-2', 20, { barcode: 'FG-2' }))]
  );
  assert.equal(second.rows[0].result.created, false);
  assert.equal(second.rows[0].result.dispatchId, 'PL-2026-606130');
  assert.equal(second.rows[0].result.shipment.dispatchConsumptions.length, 2);

  const replay = await db.query(
    `SELECT public.record_dispatch_packing_consumption($1::jsonb) AS result`,
    [JSON.stringify(entry('SFG-LOG-1', 999))]
  );
  assert.equal(replay.rows[0].result.idempotent, true);
  const consumed = await db.query(`SELECT coalesce(sum(consumed_kg), 0) AS kg FROM public.packing_list_consumptions`);
  assert.equal(Number(consumed.rows[0].kg), 127);

  const legacyAfter = await db.query(`SELECT count(*)::int AS n FROM public.packing_list_consumptions WHERE packing_list_id = 'PL-LEGACY'`);
  assert.equal(legacyAfter.rows[0].n, 0);

  await db.query(
    `UPDATE public.dispatch_shipments
     SET packing_status = 'Finalised', total_net_weight_kg = 130, total_rolls = 2,
         items = '[{"netWeightKg": 70, "unit": "Kg"}, {"netWeightKg": 60, "unit": "Kg"}]'::jsonb
     WHERE dispatch_id = 'PL-2026-606130'`
  );
  const gain = await db.query(`SELECT * FROM public.packing_gain_loss WHERE packing_list_id = 'PL-2026-606130'`);
  assert.equal(Number(gain.rows[0].fg_consumed_kg), 127);
  assert.equal(Number(gain.rows[0].packed_net_kg), 130);
  assert.equal(Number(gain.rows[0].difference_kg), 3);
  assert.equal(gain.rows[0].alerted, true);

  const notices = await db.query(`SELECT id, payload->>'type' AS type FROM public.erp_notifications WHERE id = 'PACKING-GAIN-LOSS-PL-2026-606130'`);
  assert.equal(notices.rows.length, 1);
  assert.equal(notices.rows[0].type, 'PACKING_GAIN_LOSS');

  await db.exec(`SELECT set_config('test.role', 'Store Manager', false)`);
  await db.exec(`SET ROLE authenticated`);
  const hiddenGain = await db.query(`SELECT * FROM public.packing_gain_loss`);
  assert.equal(hiddenGain.rows.length, 0);
  const hiddenNotice = await db.query(`SELECT id FROM public.erp_notifications WHERE coalesce(payload->>'type', '') = 'PACKING_GAIN_LOSS'`);
  assert.equal(hiddenNotice.rows.length, 0);
  const otherNotice = await db.query(`SELECT id FROM public.erp_notifications WHERE id = 'notif-other'`);
  assert.equal(otherNotice.rows.length, 1);
  const reportDenied = await db.query(`SELECT * FROM public.packing_gain_loss_report()`);
  assert.equal(reportDenied.rows.length, 0);
  await db.exec(`RESET ROLE`);

  await db.exec(`SELECT set_config('test.role', 'Admin', false)`);
  await db.exec(`SET ROLE authenticated`);
  const visibleGain = await db.query(`SELECT packing_list_id, difference_kg FROM public.packing_gain_loss`);
  assert.equal(visibleGain.rows.length, 1);
  assert.equal(Number(visibleGain.rows[0].difference_kg), 3);
  const visibleNotice = await db.query(`SELECT id FROM public.erp_notifications WHERE coalesce(payload->>'type', '') = 'PACKING_GAIN_LOSS'`);
  assert.equal(visibleNotice.rows.length, 1);
  const report = await db.query(`SELECT packing_list_id, fg_consumed_kg, packed_net_kg, difference_pct, over_threshold FROM public.packing_gain_loss_report()`);
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].packing_list_id, 'PL-2026-606130');
  assert.equal(Number(report.rows[0].fg_consumed_kg), 127);
  assert.equal(Number(report.rows[0].packed_net_kg), 130);
  assert.equal(report.rows[0].over_threshold, true);
  await db.exec(`RESET ROLE`);

  await db.exec(`
    INSERT INTO public.system_settings (setting_key, setting_value)
    VALUES ('dispatch_packing_gain_loss_threshold_pct', '5')
  `);
  await db.query(
    `UPDATE public.dispatch_shipments SET total_net_weight_kg = 130 WHERE dispatch_id = 'PL-2026-606130'`
  );
  const widened = await db.query(`SELECT alerted, threshold_pct FROM public.packing_gain_loss WHERE packing_list_id = 'PL-2026-606130'`);
  assert.equal(Number(widened.rows[0].threshold_pct), 5);
  assert.equal(widened.rows[0].alerted, false);
  const cleared = await db.query(`SELECT count(*)::int AS n FROM public.erp_notifications WHERE id = 'PACKING-GAIN-LOSS-PL-2026-606130'`);
  assert.equal(cleared.rows[0].n, 0);
});

test('a signed-out caller cannot record a dispatch packing consumption', async () => {
  const db = await database();
  await db.exec(`SELECT set_config('test.role', '', false)`);
  await db.exec(`SET ROLE authenticated`);
  await assert.rejects(
    () => db.query(
      `SELECT public.record_dispatch_packing_consumption($1::jsonb)`,
      [JSON.stringify(entry('SFG-LOG-X', 5))]
    ),
    /not allowed/
  );
});
