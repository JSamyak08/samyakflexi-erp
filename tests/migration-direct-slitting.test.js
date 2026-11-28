import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261125120000_direct_roll_slitting.sql', import.meta.url),
  'utf8'
);
const priceSql = fs.readFileSync(
  new URL('../supabase/migrations/20261126120000_direct_slit_roll_price.sql', import.meta.url),
  'utf8'
);
const specSql = fs.readFileSync(
  new URL('../supabase/migrations/20261030200000_inventory_spec_duplicate_guard.sql', import.meta.url),
  'utf8'
);

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCTION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STORE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SHOP = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function slitDoc(extra = {}) {
  return {
    id: 'CONV-TEST-1',
    parents: [{ barcode: 'RM-PARENT', consumedKg: 60 }],
    outputs: [
      { destination: 'inventory', widthMm: 600, netKg: 36, lane: 1 },
      { destination: 'inventory', widthMm: 400, netKg: 24, lane: 2 }
    ],
    trimScrapKg: 0,
    settingScrapKg: 0,
    ...extra
  };
}

async function database({ storeExplicitFalse = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE SCHEMA IF NOT EXISTS private;
    GRANT USAGE ON SCHEMA public, private TO authenticated;
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      auth_user_id uuid,
      username text,
      full_name text,
      role text,
      active boolean DEFAULT true
    );
    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb,
      updated_at timestamptz
    );
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_code text,
      item_name text NOT NULL,
      stock_qty_kg numeric DEFAULT 0,
      unit_price numeric DEFAULT 0,
      category text,
      film_type text,
      micron numeric,
      width_mm numeric,
      unit text,
      density numeric,
      metallocene_pct text,
      is_active boolean DEFAULT true,
      last_updated timestamptz,
      metadata jsonb
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      roll_type text NOT NULL DEFAULT 'RAW_MATERIAL',
      item_id text,
      item_name text NOT NULL,
      category text,
      job_name text,
      order_id text,
      job_code text,
      client_name text,
      micron numeric,
      width_mm numeric,
      film_type text,
      net_weight_kg numeric NOT NULL DEFAULT 0,
      available_weight_kg numeric NOT NULL DEFAULT 0,
      gross_weight_kg numeric,
      tare_weight_kg numeric,
      status text,
      qc_status text,
      location_bay text,
      inward_datetime timestamptz,
      vendor_name text,
      batch_no text,
      grn_id text,
      length_meters numeric,
      metallocene_pct text,
      sfg_type text,
      fg_type text,
      input_barcode_ids jsonb,
      metadata jsonb
    );
    CREATE TABLE public.inventory_ledger_entries (
      id text PRIMARY KEY,
      entry_kind text NOT NULL CHECK (entry_kind IN ('issue', 'balance_receipt')),
      scope_key text NOT NULL,
      stage text NOT NULL DEFAULT 'Printing',
      barcode text NOT NULL,
      line_key text,
      parent_barcode text,
      balance_barcode text,
      stock_item_id text,
      order_id text,
      production_record_id text,
      job_name text,
      job_code text,
      qty_kg numeric NOT NULL DEFAULT 0,
      consumed_kg numeric,
      balance_kg numeric,
      applied_stock_kg numeric NOT NULL DEFAULT 0,
      qty_source text,
      film_type text,
      micron numeric,
      width_mm numeric,
      item_name text,
      purchase_rate numeric,
      vendor_name text,
      batch_no text,
      grn_no text,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text,
      job_code text,
      client_name text,
      job_details jsonb
    );
    CREATE TABLE public.sfg_goods (
      id uuid PRIMARY KEY,
      sfg_batch_code text UNIQUE NOT NULL,
      sfg_type text NOT NULL,
      order_id text,
      job_name text NOT NULL,
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
      operator_name text,
      storage_bay text,
      production_date date,
      unit_valuation_rate numeric,
      status text,
      notes text,
      is_opening_balance boolean DEFAULT false,
      created_at timestamptz,
      updated_at timestamptz
    );
    CREATE TABLE public.sfg_scrap_items (
      id text PRIMARY KEY,
      payload jsonb NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.production_records (
      id text PRIMARY KEY,
      order_id text,
      materials_list jsonb,
      input_rolls_list jsonb,
      qty_slitting numeric
    );
    CREATE TABLE public.deleted_barcodes (
      barcode text,
      status text
    );
    CREATE OR REPLACE FUNCTION private.add_item_stock(p_item_id text, p_delta numeric)
    RETURNS numeric LANGUAGE plpgsql AS $$
    DECLARE old_qty numeric; new_qty numeric;
    BEGIN
      SELECT stock_qty_kg INTO old_qty FROM public.inventory WHERE id = p_item_id FOR UPDATE;
      IF NOT FOUND THEN RETURN 0; END IF;
      new_qty := GREATEST(0, COALESCE(old_qty, 0) + p_delta);
      UPDATE public.inventory SET stock_qty_kg = new_qty WHERE id = p_item_id;
      RETURN new_qty - COALESCE(old_qty, 0);
    END $$;
    CREATE OR REPLACE FUNCTION private.app_roles()
    RETURNS text[] LANGUAGE sql STABLE AS $$
      SELECT COALESCE((
        SELECT ARRAY[u.role]
        FROM public.users AS u
        WHERE u.auth_user_id = auth.uid()
        LIMIT 1
      ), ARRAY[]::text[])
    $$;
    CREATE OR REPLACE FUNCTION private.can_any(modules text[])
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE OR REPLACE FUNCTION private.roll_barcode_blocked(p_barcode text)
    RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.deleted_barcodes
        WHERE lower(btrim(barcode)) = lower(btrim(p_barcode))
          AND status IN ('Deleted', 'Written Off')
      )
    $$;
    INSERT INTO public.users (id, auth_user_id, username, full_name, role) VALUES
      ('admin', '${ADMIN}', 'admin', 'Admin User', 'Admin'),
      ('plant', '${PLANT}', 'plant', 'Plant Manager', 'Plant Manager'),
      ('prod', '${PRODUCTION}', 'prod', 'Production Manager', 'Production Manager'),
      ('store', '${STORE}', 'store', 'Store Manager', 'Store Manager'),
      ('shop', '${SHOP}', 'shop', 'Shop Floor', 'Shop Floor Operator');
    INSERT INTO public.role_permissions (role, permissions) VALUES
      ('Admin', '{"inventory": true}'),
      ('Plant Manager', '{"inventory": true}'),
      ('Production Manager', '{"inventory": true}'),
      ('Store Manager', ${storeExplicitFalse ? '\'{"inventory": true, "direct_slitting": false}\'' : '\'{"inventory": true}\''}),
      ('Shop Floor Operator', '{"inventory": true}');
    INSERT INTO public.inventory (
      id, item_code, item_name, stock_qty_kg, unit_price, category, film_type, micron, width_mm, density, is_active
    ) VALUES (
      'INVT-0001', 'INVT-0001', 'PET-1000-12', 100, 125, 'Film Substrates', 'PET', 12, 1000, 1.4, true
    );
    INSERT INTO public.inventory_rolls (
      barcode_id, roll_type, item_id, item_name, category, film_type, micron, width_mm,
      net_weight_kg, available_weight_kg, status, qc_status, length_meters, vendor_name, batch_no
    ) VALUES (
      'RM-PARENT', 'RAW_MATERIAL', 'INVT-0001', 'PET-1000-12', 'Film Substrates', 'PET', 12, 1000,
      100, 100, 'In Stock (RM)', 'Approved', 5952, 'FlexiPoly', 'BATCH-1'
    );
    INSERT INTO public.orders (id, job_name, job_code, client_name) VALUES
      ('ORD-1', 'Peas Pouch', 'PEAS', 'Acme');
    INSERT INTO public.production_records (id, order_id, materials_list, input_rolls_list, qty_slitting) VALUES
      ('PR-1', 'ORD-1', '[]'::jsonb, '[]'::jsonb, 0);
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, private TO authenticated;
  `);
  await db.exec(specSql);
  await db.exec(migrationSql);
  await db.exec(priceSql);
  return db;
}

async function asUser(db, uid) {
  await db.exec('RESET ROLE');
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false)`);
  await db.exec('SET ROLE authenticated');
}

async function post(db, doc) {
  const { rows } = await db.query(
    'SELECT public.post_roll_conversion($1::jsonb) AS result',
    [JSON.stringify(doc)]
  );
  return rows[0].result;
}

test('migration is additive and keeps the job roll ledger kinds', () => {
  assert.ok(migrationSql.includes('20261124124327') === false);
  assert.match(migrationSql, /conversion_issue/);
  assert.match(migrationSql, /conversion_receipt/);
  assert.match(migrationSql, /conversion_balance/);
  assert.match(migrationSql, /'issue'/);
  assert.match(migrationSql, /'balance_receipt'/);
  assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION private\.sync_job_roll_issues/);
  assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION private\.realize_roll_issue/);
  assert.doesNotMatch(migrationSql, /barcode_registry/);
  assert.doesNotMatch(migrationSql, /DROP TABLE/);
  assert.doesNotMatch(migrationSql, /DROP VIEW/);
  assert.doesNotMatch(migrationSql, /DROP FUNCTION/);
  assert.doesNotMatch(migrationSql, /INSERT INTO public\.production_records/);
  assert.doesNotMatch(migrationSql, /UPDATE public\.production_records/);
  assert.doesNotMatch(migrationSql, /qty_slitting/);
});

test('store manager slit creates missing widths, a balance roll, and scrap', async () => {
  const db = await database();
  await asUser(db, STORE);
  const doc = slitDoc({
    trimScrapKg: 0,
    settingScrapKg: 0,
    outputs: [
      { destination: 'inventory', widthMm: 500, netKg: 25, lane: 1 },
      { destination: 'inventory', widthMm: 400, netKg: 20, lane: 2 }
    ],
    parents: [{ barcode: 'RM-PARENT', consumedKg: 50 }]
  });
  // 25 + 20 + 3 + 2 = 50. Widths are not a perfect area match to a stored length,
  // so use kilograms that follow the width and keep scrap in the mass.
  const posted = await post(db, slitDoc({
    id: 'CONV-MASS',
    parents: [{ barcode: 'RM-PARENT', consumedKg: 60 }],
    outputs: [
      { destination: 'inventory', widthMm: 600, netKg: 34, lane: 1 },
      { destination: 'inventory', widthMm: 400, netKg: 22, lane: 2 }
    ],
    trimScrapKg: 3,
    settingScrapKg: 1
  }));
  assert.equal(posted.id, 'CONV-MASS');
  assert.equal(Number(posted.varianceKg), 0);
  assert.equal(posted.outputs.length, 2);
  assert.equal(posted.outputs.every((row) => row.itemCreated === true), true);
  assert.equal(posted.outputs.every((row) => !String(row.barcode).toUpperCase().endsWith('-BAL')), true);
  assert.equal(posted.parents[0].balanceBarcode, 'RM-PARENT-BAL');
  assert.equal(Number(posted.parents[0].balanceKg), 40);

  const names = await db.query(`SELECT id, item_name, width_mm, unit_price, film_type, micron, stock_qty_kg FROM public.inventory ORDER BY width_mm`);
  const created = names.rows.filter((row) => row.id !== 'INVT-0001');
  assert.deepEqual(created.map((row) => row.item_name), ['PET-400-12', 'PET-600-12']);
  assert.equal(Number(created[0].unit_price), 125);
  assert.equal(Number(names.rows.find((row) => row.id === 'INVT-0001').stock_qty_kg), 40);

  const scrap = await db.query(`SELECT id, payload->>'stage' AS stage, payload->>'type' AS type FROM public.sfg_scrap_items ORDER BY id`);
  assert.deepEqual(scrap.rows.map((row) => row.id), ['direct-slit:CONV-MASS:setting', 'direct-slit:CONV-MASS:trim']);
  assert.equal(scrap.rows.every((row) => row.stage === 'Direct Slitting'), true);
  assert.equal(scrap.rows.some((row) => row.type === 'Trim / Edge Scrap'), true);
  assert.equal(scrap.rows.some((row) => row.type === 'Core / Setting Wastage'), true);

  const ledger = await db.query(`SELECT entry_kind FROM public.inventory_ledger_entries ORDER BY entry_kind`);
  assert.deepEqual(ledger.rows.map((row) => row.entry_kind), ['conversion_balance', 'conversion_issue', 'conversion_receipt', 'conversion_receipt']);

  const again = await post(db, slitDoc({
    id: 'CONV-MASS',
    parents: [{ barcode: 'RM-PARENT', consumedKg: 60 }],
    outputs: [
      { destination: 'inventory', widthMm: 600, netKg: 34, lane: 1 },
      { destination: 'inventory', widthMm: 400, netKg: 22, lane: 2 }
    ],
    trimScrapKg: 3,
    settingScrapKg: 1
  }));
  assert.equal(again.id, 'CONV-MASS');
  const stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-0001'`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 40);
  assert.equal(doc.id, 'CONV-TEST-1');
});

test('a second slit of the same widths reuses the item', async () => {
  const db = await database();
  await asUser(db, STORE);
  await db.exec(`
    INSERT INTO public.inventory_rolls (
      barcode_id, roll_type, item_id, item_name, film_type, micron, width_mm,
      net_weight_kg, available_weight_kg, status, qc_status, length_meters
    ) VALUES (
      'RM-TWO', 'RAW_MATERIAL', 'INVT-0001', 'PET-1000-12', 'PET', 12, 1000,
      60, 60, 'In Stock (RM)', 'Approved', 3571
    );
    UPDATE public.inventory SET stock_qty_kg = 160 WHERE id = 'INVT-0001';
  `);
  await post(db, slitDoc({ id: 'CONV-A' }));
  const second = await post(db, slitDoc({
    id: 'CONV-B',
    parents: [{ barcode: 'RM-TWO', consumedKg: 60 }]
  }));
  assert.equal(second.outputs.every((row) => row.itemCreated === false), true);
  const count = await db.query(`SELECT count(*)::int AS n FROM public.inventory WHERE item_name IN ('PET-600-12', 'PET-400-12')`);
  assert.equal(count.rows[0].n, 2);
});

test('shop floor is rejected and a store manager cannot override the mass', async () => {
  const db = await database();
  await asUser(db, SHOP);
  await assert.rejects(() => post(db, slitDoc()), /Not allowed to post a direct slit/);
  await asUser(db, STORE);
  await assert.rejects(
    () => post(db, slitDoc({
      outputs: [
        { destination: 'inventory', widthMm: 600, netKg: 30, lane: 1 },
        { destination: 'inventory', widthMm: 400, netKg: 20, lane: 2 }
      ]
    })),
    /Mass balance is off/
  );
  const stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-0001'`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 100);
});

test('admin can post past the tolerance with a reason, and a stored length blocks without one', async () => {
  const db = await database();
  await asUser(db, ADMIN);
  await assert.rejects(
    () => post(db, slitDoc({
      id: 'CONV-SHORT',
      outputs: [
        { destination: 'inventory', widthMm: 600, netKg: 30, lane: 1 },
        { destination: 'inventory', widthMm: 400, netKg: 20, lane: 2 }
      ]
    })),
    /Mass balance is off/
  );
  const posted = await post(db, slitDoc({
    id: 'CONV-SHORT',
    overrideReason: 'Scale was checked twice',
    outputs: [
      { destination: 'inventory', widthMm: 600, netKg: 30, lane: 1 },
      { destination: 'inventory', widthMm: 400, netKg: 20, lane: 2 }
    ]
  }));
  assert.equal(posted.override, true);
  assert.equal(Number(posted.varianceKg), 10);

  await db.exec(`
    UPDATE public.inventory_rolls
    SET length_meters = 1000, available_weight_kg = 100, status = 'In Stock (RM)'
    WHERE barcode_id = 'RM-PARENT-BAL';
  `);
  await asUser(db, STORE);
  await assert.rejects(
    () => post(db, slitDoc({
      id: 'CONV-LENGTH',
      parents: [{ barcode: 'RM-PARENT-BAL', consumedKg: 40 }],
      outputs: [
        { destination: 'inventory', widthMm: 600, netKg: 24, lane: 1 },
        { destination: 'inventory', widthMm: 400, netKg: 16, lane: 2 }
      ]
    })),
    /Running length/
  );
});

test('finished goods for an order do not add raw kilograms or touch the production record', async () => {
  const db = await database();
  await asUser(db, PRODUCTION);
  const before = await db.query(`SELECT materials_list, input_rolls_list, qty_slitting FROM public.production_records WHERE id = 'PR-1'`);
  const posted = await post(db, slitDoc({
    id: 'CONV-FG',
    orderId: 'ORD-1',
    outputs: [
      { destination: 'fg', widthMm: 600, netKg: 36, lane: 1, orderId: 'ORD-1', stageType: 'Slitted Rolls' },
      { destination: 'fg', widthMm: 400, netKg: 24, lane: 2, orderId: 'ORD-1', stageType: 'Slitted Rolls' }
    ]
  }));
  assert.equal(posted.outputs.every((row) => row.destination === 'fg' && row.stockItemId == null), true);
  const goods = await db.query(`SELECT sfg_type, order_id, total_net_kg, available_kg, is_opening_balance FROM public.sfg_goods`);
  assert.equal(goods.rows.length, 1);
  assert.equal(goods.rows[0].sfg_type, 'Slitted Rolls');
  assert.equal(goods.rows[0].order_id, 'ORD-1');
  assert.equal(Number(goods.rows[0].total_net_kg), 60);
  assert.equal(goods.rows[0].is_opening_balance, false);
  const rolls = await db.query(`SELECT roll_type, order_id, item_id FROM public.inventory_rolls WHERE roll_type = 'FG'`);
  assert.equal(rolls.rows.length, 2);
  assert.equal(rolls.rows.every((row) => row.item_id == null && row.order_id === 'ORD-1'), true);
  const raw = await db.query(`SELECT count(*)::int AS n FROM public.inventory WHERE id <> 'INVT-0001'`);
  assert.equal(raw.rows[0].n, 0);
  const parentStock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-0001'`);
  assert.equal(Number(parentStock.rows[0].stock_qty_kg), 40);
  const after = await db.query(`SELECT materials_list, input_rolls_list, qty_slitting FROM public.production_records WHERE id = 'PR-1'`);
  assert.deepEqual(after.rows[0], before.rows[0]);
});

test('reversal restores the parent and refuses a child that has been used', async () => {
  const db = await database();
  await asUser(db, STORE);
  await post(db, slitDoc({ id: 'CONV-REV' }));
  await asUser(db, PRODUCTION);
  await assert.rejects(
    () => db.query(`SELECT public.reverse_roll_conversion('CONV-REV', 'no')`),
    /Not allowed to reverse/
  );
  await asUser(db, STORE);
  const reversed = await db.query(`SELECT public.reverse_roll_conversion('CONV-REV', 'posted on the wrong roll') AS result`);
  assert.equal(reversed.rows[0].result.status, 'reversed');
  const parent = await db.query(`SELECT available_weight_kg, status FROM public.inventory_rolls WHERE barcode_id = 'RM-PARENT'`);
  assert.equal(Number(parent.rows[0].available_weight_kg), 100);
  assert.equal(parent.rows[0].status, 'In Stock (RM)');
  const stock = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-0001'`);
  assert.equal(Number(stock.rows[0].stock_qty_kg), 100);
  const scrap = await db.query(`SELECT count(*)::int AS n FROM public.sfg_scrap_items`);
  assert.equal(scrap.rows[0].n, 0);
  const ledger = await db.query(`SELECT count(*)::int AS n FROM public.inventory_ledger_entries WHERE entry_kind LIKE 'conversion%'`);
  assert.equal(ledger.rows[0].n, 0);

  const used = await post(db, slitDoc({ id: 'CONV-USED' }));
  await db.exec(`UPDATE public.inventory_rolls SET available_weight_kg = 1 WHERE barcode_id = '${used.outputs[0].barcode}'`);
  await assert.rejects(
    () => db.query(`SELECT public.reverse_roll_conversion('CONV-USED', 'too late')`),
    /already been used/
  );
});

test('a short parent item and a deleted barcode are refused', async () => {
  const db = await database();
  await asUser(db, PLANT);
  await db.exec(`UPDATE public.inventory SET stock_qty_kg = 10 WHERE id = 'INVT-0001'`);
  await assert.rejects(() => post(db, slitDoc({ id: 'CONV-SHORT-STOCK' })), /Not enough kilograms/);
  const roll = await db.query(`SELECT status, available_weight_kg FROM public.inventory_rolls WHERE barcode_id = 'RM-PARENT'`);
  assert.equal(roll.rows[0].status, 'In Stock (RM)');
  assert.equal(Number(roll.rows[0].available_weight_kg), 100);
  await db.exec(`
    UPDATE public.inventory SET stock_qty_kg = 100 WHERE id = 'INVT-0001';
    INSERT INTO public.deleted_barcodes (barcode, status) VALUES ('RM-PARENT', 'Deleted');
  `);
  await assert.rejects(() => post(db, slitDoc({ id: 'CONV-DEAD' })), /cannot be slit/);
});

test('an explicit false permission is not turned back on', async () => {
  const db = await database({ storeExplicitFalse: true });
  const perms = await db.query(`SELECT permissions->>'direct_slitting' AS flag FROM public.role_permissions WHERE role = 'Store Manager'`);
  assert.equal(perms.rows[0].flag, 'false');
  await asUser(db, STORE);
  await assert.rejects(() => post(db, slitDoc()), /Not allowed to post a direct slit/);
  const shop = await db.query(`SELECT permissions->>'direct_slitting' AS flag FROM public.role_permissions WHERE role = 'Shop Floor Operator'`);
  assert.equal(shop.rows[0].flag, 'false');
});

test('the price migration replaces functions and does not drop them', () => {
  assert.match(priceSql, /CREATE OR REPLACE FUNCTION private\.direct_slit_roll_rate/);
  assert.match(priceSql, /CREATE OR REPLACE FUNCTION private\.direct_slit_blend_rate/);
  assert.match(priceSql, /CREATE OR REPLACE FUNCTION private\.direct_slit_post/);
  assert.match(priceSql, /purchaseRatePerKg/);
  assert.match(priceSql, /unitPrice/);
  assert.doesNotMatch(priceSql, /DROP FUNCTION/);
  assert.doesNotMatch(priceSql, /DROP TABLE/);
  assert.doesNotMatch(priceSql, /DROP VIEW/);
});

test('each mother keeps its rate and children receive the weighted average', async () => {
  const db = await database();
  await asUser(db, STORE);
  await db.exec(`
    UPDATE public.inventory SET stock_qty_kg = 130, unit_price = 125 WHERE id = 'INVT-0001';
    UPDATE public.inventory_rolls
    SET net_weight_kg = 80, available_weight_kg = 80, length_meters = 0,
        metadata = '{"purchaseRatePerKg":200}'::jsonb
    WHERE barcode_id = 'RM-PARENT';
    INSERT INTO public.inventory_rolls (
      barcode_id, roll_type, item_id, item_name, category, film_type, micron, width_mm,
      net_weight_kg, available_weight_kg, status, qc_status, length_meters, metadata
    ) VALUES (
      'RM-TWO', 'RAW_MATERIAL', 'INVT-0001', 'PET-1000-12', 'Film Substrates', 'PET', 12, 1000,
      50, 50, 'In Stock (RM)', 'Approved', 0, '{"purchaseRatePerKg":260}'::jsonb
    );
    INSERT INTO public.inventory (
      id, item_code, item_name, stock_qty_kg, unit_price, category, film_type, micron, width_mm, density, is_active
    ) VALUES (
      'INVT-600', 'INVT-600', 'PET-600-12', 10, 999, 'Film Substrates', 'PET', 12, 600, 1.4, true
    );
  `);
  const posted = await post(db, {
    id: 'CONV-BLEND',
    parents: [
      { barcode: 'RM-PARENT', consumedKg: 60 },
      { barcode: 'RM-TWO', consumedKg: 40 }
    ],
    outputs: [
      { destination: 'inventory', widthMm: 600, netKg: 60, lane: 1 },
      { destination: 'inventory', widthMm: 400, netKg: 40, lane: 2 }
    ],
    trimScrapKg: 0,
    settingScrapKg: 0
  });
  assert.equal(Number(posted.purchaseRate), 224);
  assert.equal(Number(posted.parents.find((row) => row.barcode === 'RM-PARENT').purchaseRate), 200);
  assert.equal(Number(posted.parents.find((row) => row.barcode === 'RM-TWO').purchaseRate), 260);
  assert.equal(posted.outputs.every((row) => Number(row.purchaseRate) === 224), true);

  const parents = await db.query(`SELECT barcode, purchase_rate FROM public.roll_conversion_parents WHERE conversion_id = 'CONV-BLEND' ORDER BY barcode`);
  assert.deepEqual(parents.rows.map((row) => Number(row.purchase_rate)), [200, 260]);
  const outputs = await db.query(`SELECT purchase_rate FROM public.roll_conversion_outputs WHERE conversion_id = 'CONV-BLEND'`);
  assert.equal(outputs.rows.every((row) => Number(row.purchase_rate) === 224), true);
  const header = await db.query(`SELECT purchase_rate FROM public.roll_conversions WHERE id = 'CONV-BLEND'`);
  assert.equal(Number(header.rows[0].purchase_rate), 224);

  const rolls = await db.query(`SELECT barcode_id, metadata FROM public.inventory_rolls WHERE barcode_id LIKE '%BAL' OR metadata->>'directSlitting' = 'true'`);
  assert.equal(rolls.rows.length >= 4, true);
  assert.equal(rolls.rows.every((row) => Number(row.metadata.purchaseRatePerKg) === 224 && Number(row.metadata.unitPrice) === 224), true);

  const ledger = await db.query(`SELECT entry_kind, purchase_rate FROM public.inventory_ledger_entries WHERE scope_key = 'conv:CONV-BLEND' ORDER BY entry_kind, purchase_rate`);
  const issues = ledger.rows.filter((row) => row.entry_kind === 'conversion_issue').map((row) => Number(row.purchase_rate));
  assert.deepEqual(issues, [200, 260]);
  assert.equal(ledger.rows.filter((row) => row.entry_kind !== 'conversion_issue').every((row) => Number(row.purchase_rate) === 224), true);

  const prices = await db.query(`SELECT id, unit_price FROM public.inventory WHERE id IN ('INVT-0001', 'INVT-600') OR item_name = 'PET-400-12' ORDER BY id`);
  assert.equal(Number(prices.rows.find((row) => row.id === 'INVT-0001').unit_price), 125);
  assert.equal(Number(prices.rows.find((row) => row.id === 'INVT-600').unit_price), 999);
  assert.equal(Number(prices.rows.find((row) => row.id !== 'INVT-0001' && row.id !== 'INVT-600').unit_price), 224);
});

test('a roll with no rate still posts and scrap uses the blend', async () => {
  const db = await database();
  await asUser(db, ADMIN);
  await db.exec(`UPDATE public.inventory SET unit_price = 0 WHERE id = 'INVT-0001'`);
  const posted = await post(db, slitDoc({ id: 'CONV-ZERO' }));
  assert.equal(Number(posted.purchaseRate), 0);
  assert.equal(Number(posted.parents[0].purchaseRate), 0);
  assert.equal(posted.outputs.every((row) => Number(row.purchaseRate) === 0), true);

  await db.exec(`
    UPDATE public.inventory SET unit_price = 125, stock_qty_kg = 100 WHERE id = 'INVT-0001';
    DELETE FROM public.inventory_rolls WHERE barcode_id = 'RM-PARENT-BAL';
    UPDATE public.inventory_rolls
    SET available_weight_kg = 100, status = 'In Stock (RM)', metadata = '{"purchaseRatePerKg":200}'::jsonb
    WHERE barcode_id = 'RM-PARENT';
  `);
  const scrap = await post(db, slitDoc({
    id: 'CONV-SCRAP',
    overrideReason: 'Trim was weighed separately',
    parents: [{ barcode: 'RM-PARENT', consumedKg: 60 }],
    outputs: [
      { destination: 'inventory', widthMm: 600, netKg: 34, lane: 1 },
      { destination: 'inventory', widthMm: 400, netKg: 22, lane: 2 }
    ],
    trimScrapKg: 3,
    settingScrapKg: 1
  }));
  assert.equal(Number(scrap.purchaseRate), 200);
  const rows = await db.query(`SELECT id, (payload->>'ratePerKg')::numeric AS rate, (payload->>'valueRs')::numeric AS value FROM public.sfg_scrap_items WHERE id LIKE 'direct-slit:CONV-SCRAP:%' ORDER BY id`);
  assert.equal(rows.rows.every((row) => Number(row.rate) === 200), true);
  const trim = rows.rows.find((row) => row.id.endsWith(':trim'));
  const setting = rows.rows.find((row) => row.id.endsWith(':setting'));
  assert.equal(Number(trim.value), 600);
  assert.equal(Number(setting.value), 200);
});

test('metadata rate wins over the GRN line, which wins over the item master', async () => {
  const db = await database();
  await db.exec('RESET ROLE');
  await db.exec(`
    ALTER TABLE public.inventory_rolls ADD COLUMN grn_line_item_id text;
    CREATE TABLE public.grn_line_items (id text PRIMARY KEY, purchase_rate numeric);
    INSERT INTO public.grn_line_items (id, purchase_rate) VALUES ('LINE-1', 180);
    UPDATE public.inventory_rolls
    SET grn_line_item_id = 'LINE-1', metadata = '{"purchaseRatePerKg":200}'::jsonb
    WHERE barcode_id = 'RM-PARENT';
  `);
  await asUser(db, STORE);
  const fromMeta = await post(db, slitDoc({ id: 'CONV-META' }));
  assert.equal(Number(fromMeta.purchaseRate), 200);
  assert.equal(Number(fromMeta.parents[0].purchaseRate), 200);

  await db.exec('RESET ROLE');
  await db.exec(`
    UPDATE public.inventory SET stock_qty_kg = 100 WHERE id = 'INVT-0001';
    DELETE FROM public.inventory_rolls WHERE barcode_id = 'RM-PARENT-BAL';
    UPDATE public.inventory_rolls
    SET available_weight_kg = 100, status = 'In Stock (RM)', metadata = '{}'::jsonb
    WHERE barcode_id = 'RM-PARENT';
    DELETE FROM public.inventory WHERE id <> 'INVT-0001';
  `);
  await asUser(db, STORE);
  const fromGrn = await post(db, slitDoc({ id: 'CONV-GRN' }));
  assert.equal(Number(fromGrn.parents[0].purchaseRate), 180);
  const created = await db.query(`SELECT unit_price FROM public.inventory WHERE id <> 'INVT-0001' ORDER BY width_mm LIMIT 1`);
  assert.equal(Number(created.rows[0].unit_price), 180);
});

test('issue and balance_receipt still fit the ledger check', async () => {
  const db = await database();
  await db.exec(`
    INSERT INTO public.inventory_ledger_entries (id, entry_kind, scope_key, stage, barcode, qty_kg, applied_stock_kg)
    VALUES ('old-issue', 'issue', 'ord:1', 'Printing', 'RM-OLD', 1, 1),
           ('old-bal', 'balance_receipt', 'ord:1', 'Printing', 'RM-OLD-BAL', 1, 0);
  `);
  const kinds = await db.query(`SELECT entry_kind FROM public.inventory_ledger_entries ORDER BY entry_kind`);
  assert.deepEqual(kinds.rows.map((row) => row.entry_kind), ['balance_receipt', 'issue']);
});
