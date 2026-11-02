import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const closeSql = fs.readFileSync(
  new URL('../supabase/migrations/20261031173000_print_run_keeps_order_close.sql', import.meta.url),
  'utf8'
);
const printRunSql = fs.readFileSync(
  new URL('../supabase/migrations/20261101193000_one_active_print_run_and_utilization.sql', import.meta.url),
  'utf8'
);
const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261102120000_roll_consumption_ledger.sql', import.meta.url),
  'utf8'
);

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const SHOP = '33333333-3333-4333-8333-333333333333';

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE SCHEMA IF NOT EXISTS private;
    GRANT USAGE ON SCHEMA private TO authenticated;
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
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $$
      SELECT EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE auth.uid() IS NOT NULL
          AND (u.auth_user_id = auth.uid() OR (u.auth_user_id IS NULL AND u.id = (auth.uid())::text))
          AND u.active IS NOT FALSE
          AND (u.role = 'Admin' OR u.role = ANY (allowed))
      );
    $$;
    CREATE OR REPLACE FUNCTION private.app_roles()
    RETURNS text[]
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $$
      SELECT COALESCE((
        SELECT ARRAY[u.role]
        FROM public.users AS u
        WHERE auth.uid() IS NOT NULL
          AND u.auth_user_id = auth.uid()
          AND u.active IS NOT FALSE
        LIMIT 1
      ), ARRAY[]::text[]);
    $$;
    GRANT EXECUTE ON FUNCTION private.has_role(text[]) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.app_roles() TO authenticated;
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
      closed_by text,
      closed_at timestamptz,
      close_reason text,
      close_mode text,
      over_dispatch_warning text
    );
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text,
      updated_at timestamptz
    );
    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb,
      updated_at timestamptz
    );
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_code text,
      item_name text,
      stock_qty_kg numeric DEFAULT 0,
      unit_price numeric DEFAULT 0,
      category text,
      film_type text,
      micron numeric,
      width_mm numeric,
      is_active boolean DEFAULT true,
      last_updated timestamptz
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      roll_type text NOT NULL DEFAULT 'RAW_MATERIAL',
      item_id text,
      item_name text NOT NULL,
      category text,
      job_name text,
      order_id text,
      micron numeric,
      width_mm numeric,
      film_type text,
      net_weight_kg numeric NOT NULL DEFAULT 0,
      available_weight_kg numeric NOT NULL DEFAULT 0,
      gross_weight_kg numeric,
      status text,
      qc_status text,
      location_bay text,
      inward_datetime timestamptz,
      metadata jsonb
    );
    CREATE TABLE public.production_records (
      id text PRIMARY KEY,
      order_id text,
      job_name text NOT NULL,
      job_code text,
      materials_list jsonb DEFAULT '[]'::jsonb,
      input_rolls_list jsonb DEFAULT '[]'::jsonb,
      process_logs jsonb,
      sfg_consumptions jsonb,
      recorded_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.deleted_barcodes (
      barcode text,
      status text
    );
    GRANT USAGE ON SCHEMA auth, public TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_rolls TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_records TO authenticated;
    GRANT SELECT ON public.users TO authenticated;
    GRANT SELECT ON public.role_permissions TO authenticated;
    INSERT INTO public.users (id, auth_user_id, username, full_name, email, role, status, active) VALUES
      ('op', '${OPERATOR}', 'ravi', 'Ravi Press', 'ravi@plant.test', 'Printing Operator', 'Active', true),
      ('shop', '${SHOP}', 'mina', 'Mina Floor', 'mina@plant.test', 'Shop Floor Operator', 'Active', true);
    INSERT INTO public.role_permissions (role, permissions) VALUES
      ('Printing Operator', '{"printing_scheduler": true}'),
      ('Shop Floor Operator', '{"printing_scheduler": true}');
    INSERT INTO public.orders (id, job_name, status, close_mode, job_details, printing_status) VALUES
      ('ORD-OPEN', 'Peas Pouch', 'In Production', NULL, '{}'::jsonb, 'Pending'),
      ('ORD-NEXT', 'Rice Pouch', 'Scheduled', NULL, '{}'::jsonb, 'Pending');
    INSERT INTO public.inventory (id, item_code, item_name, stock_qty_kg, category, film_type, micron, width_mm)
    VALUES ('INVT-15', 'INVT-15', 'PET 12µ', 500, 'Film Substrates', 'PET', 12, 500);
    INSERT INTO public.inventory_rolls (
      barcode_id, item_id, item_name, category, film_type, micron, width_mm,
      net_weight_kg, available_weight_kg, status
    ) VALUES
      ('RM-100', 'INVT-15', 'PET 12µ', 'Film Substrates', 'PET', 12, 500, 80, 80, 'In Stock'),
      ('RM-DEL', 'INVT-15', 'PET 12µ', 'Film Substrates', 'PET', 12, 500, 20, 20, 'Deleted'),
      ('RM-OFF', 'INVT-15', 'PET 12µ', 'Film Substrates', 'PET', 12, 500, 20, 20, 'Written Off'),
      ('RM-ARC', 'INVT-15', 'PET 12µ', 'Film Substrates', 'PET', 12, 500, 20, 20, 'Archived');
  `);
  await db.exec(closeSql);
  await db.exec(printRunSql);
  await db.exec(migrationSql);
  return db;
}

async function asUser(db, uid) {
  await db.exec('RESET ROLE');
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false)`);
  await db.exec('SET ROLE authenticated');
}

function rolls(consumed, initial, barcode = 'RM-100') {
  return JSON.stringify({
    machineId: 'MAC-1',
    printingStartTime: '2026-11-02T02:00:00.000Z',
    printingEndTime: '2026-11-02T06:00:00.000Z',
    inputRollsList: [{
      barcodeId: barcode,
      filmType: 'PET',
      micron: 12,
      widthMm: 500,
      initialWeightKg: initial,
      consumedWeightKg: consumed
    }]
  });
}

test('migration timestamp is after the latest production migration', () => {
  assert.ok('20261102120000' > '20261101193000');
  assert.match(migrationSql, /inventory_ledger_entries/);
  assert.match(migrationSql, /balanceRolls/);
  assert.match(migrationSql, /does not rewrite historical stock/);
});

test('progress stores rolls and does not post stock or a ledger line', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'start', $1::jsonb)`, [rolls(0, 80)]);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'progress', $1::jsonb)`, [rolls(30, 80)]);
  await db.exec('RESET ROLE');
  const stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  const ledger = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  const roll = await db.query(`SELECT available_weight_kg, status FROM public.inventory_rolls WHERE barcode_id = 'RM-100'`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 500);
  assert.equal(ledger.rows[0].n, 0);
  assert.equal(Number(roll.rows[0].available_weight_kg), 80);
  assert.equal(roll.rows[0].status, 'In Stock');
  await db.close();
});

test('ending a run posts one issue and a balance receipt, and a retry does not duplicate', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'start', $1::jsonb)`, [JSON.stringify({ machineId: 'MAC-1', printingStartTime: '2026-11-02T02:00:00.000Z' })]);
  await asUser(db, SHOP);
  const ended = await db.query(`SELECT public.record_print_run('ORD-OPEN', 'end', $1::jsonb) AS run`, [rolls(47.5, 80)]);
  const balance = ended.rows[0].run.balanceRolls;
  assert.equal(balance.length, 1);
  assert.equal(balance[0].barcodeId, 'RM-100-BAL');
  assert.equal(Number(balance[0].netWeightKg), 32.5);
  assert.equal(balance[0].orderId, 'ORD-OPEN');
  assert.equal(balance[0].stage, 'Printing');

  await db.exec('RESET ROLE');
  const stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 452.5);
  const lines = await db.query(`SELECT entry_kind, barcode, qty_kg, order_id, stage, job_name, stock_item_id FROM public.inventory_ledger_entries ORDER BY entry_kind`);
  assert.equal(lines.rows.length, 2);
  const issue = lines.rows.find((row) => row.entry_kind === 'issue');
  const receipt = lines.rows.find((row) => row.entry_kind === 'balance_receipt');
  assert.equal(issue.barcode, 'RM-100');
  assert.equal(Number(issue.qty_kg), 80);
  assert.equal(issue.order_id, 'ORD-OPEN');
  assert.equal(issue.stage, 'Printing');
  assert.equal(issue.job_name, 'Peas Pouch');
  assert.equal(issue.stock_item_id, 'INVT-15');
  assert.equal(receipt.barcode, 'RM-100-BAL');
  assert.equal(Number(receipt.qty_kg), 32.5);
  const parent = await db.query(`SELECT available_weight_kg, status FROM public.inventory_rolls WHERE barcode_id = 'RM-100'`);
  const bal = await db.query(`SELECT available_weight_kg, status, item_id FROM public.inventory_rolls WHERE barcode_id = 'RM-100-BAL'`);
  assert.equal(Number(parent.rows[0].available_weight_kg), 0);
  assert.equal(parent.rows[0].status, 'Issued to Printing');
  assert.equal(Number(bal.rows[0].available_weight_kg), 32.5);
  assert.equal(bal.rows[0].status, 'In Stock (RM)');
  assert.equal(bal.rows[0].item_id, 'INVT-15');

  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'end', $1::jsonb)`, [rolls(47.5, 80)]);
  await db.exec('RESET ROLE');
  const again = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  const stockAgain = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  assert.equal(again.rows[0].n, 2);
  assert.equal(Number(stockAgain.rows[0].stock_qty_kg), 452.5);
  const order = await db.query(`SELECT status, close_mode, printing_status FROM public.orders WHERE id = 'ORD-OPEN'`);
  assert.equal(order.rows[0].printing_status, 'Completed');
  assert.equal(order.rows[0].status, 'In Production');
  assert.equal(order.rows[0].close_mode, null);
  await db.close();
});

test('editing the ended run adjusts the balance and removing the roll reverses it', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'start', $1::jsonb)`, [JSON.stringify({ machineId: 'MAC-1', printingStartTime: '2026-11-02T02:00:00.000Z' })]);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'end', $1::jsonb)`, [rolls(50, 80)]);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'end', $1::jsonb)`, [rolls(70, 80)]);
  await db.exec('RESET ROLE');
  let stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  let bal = await db.query(`SELECT available_weight_kg FROM public.inventory_rolls WHERE barcode_id = 'RM-100-BAL'`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 430);
  assert.equal(Number(bal.rows[0].available_weight_kg), 10);

  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'end', $1::jsonb)`, [JSON.stringify({
    printingEndTime: '2026-11-02T06:00:00.000Z',
    inputRollsList: []
  })]);
  await db.exec('RESET ROLE');
  stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  const parent = await db.query(`SELECT available_weight_kg, status FROM public.inventory_rolls WHERE barcode_id = 'RM-100'`);
  bal = await db.query(`SELECT available_weight_kg, status FROM public.inventory_rolls WHERE barcode_id = 'RM-100-BAL'`);
  const lines = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 500);
  assert.equal(Number(parent.rows[0].available_weight_kg), 80);
  assert.equal(parent.rows[0].status, 'In Stock');
  assert.equal(Number(bal.rows[0].available_weight_kg), 0);
  assert.equal(lines.rows[0].n, 0);
  await db.close();
});

test('a fully used roll has an issue and no balance roll', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'start', $1::jsonb)`, [JSON.stringify({ machineId: 'MAC-1', printingStartTime: '2026-11-02T02:00:00.000Z' })]);
  const ended = await db.query(`SELECT public.record_print_run('ORD-OPEN', 'end', $1::jsonb) AS run`, [rolls(80, 80)]);
  assert.deepEqual(ended.rows[0].run.balanceRolls, []);
  await db.exec('RESET ROLE');
  const lines = await db.query(`SELECT entry_kind, qty_kg FROM public.inventory_ledger_entries`);
  assert.equal(lines.rows.length, 1);
  assert.equal(lines.rows[0].entry_kind, 'issue');
  assert.equal(Number(lines.rows[0].qty_kg), 80);
  const stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 420);
  await db.close();
});

test('deleted, written-off, and archived rolls are not consumed', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'start', $1::jsonb)`, [JSON.stringify({ machineId: 'MAC-1', printingStartTime: '2026-11-02T02:00:00.000Z' })]);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'end', $1::jsonb)`, [JSON.stringify({
    printingEndTime: '2026-11-02T06:00:00.000Z',
    inputRollsList: [
      { barcodeId: 'RM-DEL', initialWeightKg: 20, consumedWeightKg: 20 },
      { barcodeId: 'RM-OFF', initialWeightKg: 20, consumedWeightKg: 10 },
      { barcodeId: 'RM-ARC', initialWeightKg: 20, consumedWeightKg: 5 }
    ]
  })]);
  await db.exec('RESET ROLE');
  const stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  const lines = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  const rollsLeft = await db.query(`SELECT barcode_id, status, available_weight_kg FROM public.inventory_rolls WHERE barcode_id IN ('RM-DEL', 'RM-OFF', 'RM-ARC') ORDER BY barcode_id`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 500);
  assert.equal(lines.rows[0].n, 0);
  assert.deepEqual(rollsLeft.rows.map((row) => row.status), ['Archived', 'Deleted', 'Written Off']);
  assert.deepEqual(rollsLeft.rows.map((row) => Number(row.available_weight_kg)), [20, 20, 20]);
  await db.close();
});

test('a second machine still cannot start while the first run is active', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'start', $1::jsonb)`, [JSON.stringify({ machineId: 'MAC-1', printingStartTime: '2026-11-02T02:00:00.000Z' })]);
  await assert.rejects(
    db.query(`SELECT public.record_print_run('ORD-NEXT', 'start', $1::jsonb)`, [JSON.stringify({ machineId: 'MAC-1', printingStartTime: '2026-11-02T03:00:00.000Z' })]),
    /PRINT_RUN_BUSY/
  );
  await db.close();
});

test('production record rolls post one issue and a balance receipt, and a resave does not duplicate', async () => {
  const db = await database();
  await db.exec('RESET ROLE');
  await db.query(`
    INSERT INTO public.production_records (id, order_id, job_name, job_code, materials_list)
    VALUES ('REC-1', 'ORD-NEXT', 'Rice Pouch', 'RICE', $1::jsonb)
  `, [JSON.stringify([{
    barcode: 'RM-100',
    filmType: 'PET',
    micron: 12,
    widthMm: 500,
    itemId: 'RM-PET-1',
    issueQtyKg: 80,
    returnQtyKg: 15,
    netConsumedQtyKg: 65,
    stage: 'Lamination (Pass 1)'
  }])]);
  const lines = await db.query(`SELECT entry_kind, barcode, qty_kg, stage, order_id, job_name, production_record_id FROM public.inventory_ledger_entries ORDER BY entry_kind`);
  assert.equal(lines.rows.length, 2);
  const issue = lines.rows.find((row) => row.entry_kind === 'issue');
  const receipt = lines.rows.find((row) => row.entry_kind === 'balance_receipt');
  assert.equal(Number(issue.qty_kg), 80);
  assert.equal(issue.stage, 'Lamination (Pass 1)');
  assert.equal(issue.order_id, 'ORD-NEXT');
  assert.equal(issue.job_name, 'Rice Pouch');
  assert.equal(issue.production_record_id, 'REC-1');
  assert.equal(receipt.barcode, 'RM-100-BAL');
  assert.equal(Number(receipt.qty_kg), 15);
  const stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 435);
  const parent = await db.query(`SELECT status FROM public.inventory_rolls WHERE barcode_id = 'RM-100'`);
  assert.equal(parent.rows[0].status, 'Issued to Lamination');

  await db.query(`
    UPDATE public.production_records
    SET materials_list = $1::jsonb
    WHERE id = 'REC-1'
  `, [JSON.stringify([{
    barcode: 'RM-100',
    filmType: 'PET',
    micron: 12,
    widthMm: 500,
    issueQtyKg: 80,
    returnQtyKg: 15,
    netConsumedQtyKg: 65,
    stage: 'Lamination (Pass 1)'
  }])]);
  const count = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  const stockAgain = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  assert.equal(count.rows[0].n, 2);
  assert.equal(Number(stockAgain.rows[0].stock_qty_kg), 435);

  await db.query(`UPDATE public.production_records SET materials_list = '[]'::jsonb WHERE id = 'REC-1'`);
  const cleared = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  const restored = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  const roll = await db.query(`SELECT available_weight_kg, status FROM public.inventory_rolls WHERE barcode_id = 'RM-100'`);
  assert.equal(cleared.rows[0].n, 0);
  assert.equal(Number(restored.rows[0].stock_qty_kg), 500);
  assert.equal(Number(roll.rows[0].available_weight_kg), 80);
  assert.equal(roll.rows[0].status, 'In Stock');
  await db.close();
});

test('saving the production record after the run has ended does not post the roll twice', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'start', $1::jsonb)`, [JSON.stringify({ machineId: 'MAC-1', printingStartTime: '2026-11-02T02:00:00.000Z' })]);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'end', $1::jsonb)`, [rolls(40, 80)]);
  await db.exec('RESET ROLE');
  await db.query(`
    INSERT INTO public.production_records (id, order_id, job_name, input_rolls_list, materials_list)
    VALUES ('REC-AFTER', 'ORD-OPEN', 'Peas Pouch', $1::jsonb, $2::jsonb)
  `, [
    JSON.stringify([{ barcodeId: 'RM-100', filmType: 'PET', micron: 12, widthMm: 500, initialWeightKg: 80, consumedWeightKg: 40 }]),
    JSON.stringify([{ barcode: 'RM-100', filmType: 'PET', micron: 12, widthMm: 500, issueQtyKg: 40, returnQtyKg: 40, netConsumedQtyKg: 40, ledgerSource: 'printing-input-roll', stage: 'Printing' }])
  ]);
  const lines = await db.query(`SELECT entry_kind, count(*)::int AS n FROM public.inventory_ledger_entries GROUP BY entry_kind ORDER BY entry_kind`);
  const stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  assert.deepEqual(lines.rows.map((row) => [row.entry_kind, row.n]), [['balance_receipt', 1], ['issue', 1]]);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 460);
  await db.close();
});

test('an active print run is not consumed by saving the production record', async () => {
  const db = await database();
  await asUser(db, OPERATOR);
  await db.query(`SELECT public.record_print_run('ORD-OPEN', 'start', $1::jsonb)`, [JSON.stringify({
    machineId: 'MAC-1',
    printingStartTime: '2026-11-02T02:00:00.000Z',
    inputRollsList: [{ barcodeId: 'RM-100', initialWeightKg: 80, consumedWeightKg: 40, filmType: 'PET', micron: 12, widthMm: 500 }]
  })]);
  await db.exec('RESET ROLE');
  await db.query(`
    INSERT INTO public.production_records (id, order_id, job_name, input_rolls_list, materials_list)
    VALUES ('REC-LIVE', 'ORD-OPEN', 'Peas Pouch', $1::jsonb, $1::jsonb)
  `, [JSON.stringify([{ barcodeId: 'RM-100', barcode: 'RM-100', initialWeightKg: 80, consumedWeightKg: 40, issueQtyKg: 80, netConsumedQtyKg: 40, filmType: 'PET', micron: 12, widthMm: 500 }])]);
  const lines = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries`);
  const stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-15'`);
  assert.equal(lines.rows[0].n, 0);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 500);
  await db.close();
});
