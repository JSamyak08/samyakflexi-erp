import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const previousSql = fs.readFileSync(new URL('../supabase/migrations/20261112130000_allocate_order_id.sql', import.meta.url), 'utf8');
const migrationSql = fs.readFileSync(new URL('../supabase/migrations/20261125160000_retired_order_ids_and_sfg_lot_owner.sql', import.meta.url), 'utf8');

function schema() {
  return `
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      client_name text NOT NULL,
      status text,
      created_at timestamptz NOT NULL DEFAULT now(),
      job_details jsonb,
      job_master_id text
    );
    CREATE TABLE public.sfg_goods (
      id uuid PRIMARY KEY,
      sfg_batch_code text UNIQUE,
      sfg_type text,
      order_id text,
      job_name text,
      job_code text,
      client_name text,
      job_id text,
      total_net_kg numeric,
      available_kg numeric,
      consumed_kg numeric,
      total_meters numeric,
      total_gross_kg numeric,
      gross_weight_kg numeric,
      tare_weight_kg numeric,
      status text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz
    );
    CREATE TABLE public.audit_logs (
      id text PRIMARY KEY,
      action_type text,
      module text,
      details text,
      target_id text,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_code text,
      item_name text,
      stock_qty_kg numeric,
      category text
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      order_id text,
      roll_type text,
      category text,
      item_name text,
      available_weight_kg numeric,
      status text,
      sfg_type text,
      fg_type text
    );
  `;
}

test('the order-id migration is later than the open batch-entry migration', () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url));
  assert.ok(names.includes('20261125160000_retired_order_ids_and_sfg_lot_owner.sql'));
  assert.ok('20261125160000' > '20261125120000');
  assert.ok('20261125160000' > '20261124124327');
  assert.match(migrationSql, /retired_order_ids/);
  assert.match(migrationSql, /order_id_high_water/);
  assert.match(migrationSql, /A lot from an earlier order with this number exists/);
  assert.match(migrationSql, /while SFG\/FG stock remains/);
  assert.doesNotMatch(migrationSql, /DROP TABLE/i);
  assert.doesNotMatch(migrationSql, /DROP FUNCTION public\.allocate_order_id/i);
});

test('a deleted order number is not issued again and stock blocks the delete', async () => {
  const db = new PGlite();
  await db.exec(schema());
  const yearRow = await db.query(`SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS year`);
  const year = yearRow.rows[0].year;
  await db.query(
    `INSERT INTO public.orders (id, job_name, client_name, status) VALUES ($1, 'Highest', 'Client', 'Open')`,
    [`ORD-${year}-185`]
  );
  await db.query(
    `INSERT INTO public.audit_logs (id, action_type, target_id) VALUES ('audit-1', 'DELETE', $1)`,
    [`ORD-${year}-186`]
  );
  await db.query(
    `INSERT INTO public.sfg_goods (id, sfg_batch_code, sfg_type, order_id, job_name, total_net_kg, available_kg)
     VALUES ('00000000-0000-0000-0000-000000000099', 'SFG-LOT-TYPO', 'Printed Rolls', $1, 'Typo', 1, 1)`,
    [`ORD-${year}-9000`]
  );
  await db.exec(previousSql);
  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const first = await db.query(`SELECT public.allocate_order_id(1) AS issued`);
  assert.deepEqual(first.rows[0].issued, [`ORD-${year}-187`]);

  await db.query(
    `UPDATE public.orders
     SET job_name = 'With stock', created_at = now() - interval '1 hour'
     WHERE id = $1`,
    [`ORD-${year}-185`]
  );
  await db.query(
    `INSERT INTO public.sfg_goods (
       id, sfg_batch_code, sfg_type, order_id, job_name, job_code, total_net_kg, available_kg, created_at
     ) VALUES (
       '00000000-0000-0000-0000-000000000185', $1, 'Printed Rolls', $2, 'With stock', 'CYL-185', 12, 12, now() - interval '30 minutes'
     )`,
    [`SFG-LOT-ORD-${year}-185`, `ORD-${year}-185`]
  );
  await assert.rejects(
    () => db.query(`DELETE FROM public.orders WHERE id = $1`, [`ORD-${year}-185`]),
    /SFG\/FG stock remains/i
  );
  const kept = await db.query(`SELECT job_name FROM public.orders WHERE id = $1`, [`ORD-${year}-185`]);
  assert.equal(kept.rows[0].job_name, 'With stock');

  await db.query(
    `UPDATE public.sfg_goods SET available_kg = 0, consumed_kg = 12 WHERE sfg_batch_code = $1`,
    [`SFG-LOT-ORD-${year}-185`]
  );
  await db.query(`DELETE FROM public.orders WHERE id = $1`, [`ORD-${year}-185`]);
  const again = await db.query(`SELECT public.allocate_order_id(1) AS issued`);
  assert.deepEqual(again.rows[0].issued, [`ORD-${year}-188`]);
  const retired = await db.query(
    `SELECT 1 FROM private.retired_order_ids WHERE lower(order_id) = lower($1)`,
    [`ORD-${year}-185`]
  );
  assert.equal(retired.rows.length, 1);

  await db.query(
    `INSERT INTO public.orders (id, job_name, client_name, status, job_master_id, job_details, created_at)
     VALUES ($1, 'Bambaiya Premium', 'S K Products', 'Open', 'JM-NEW', '{"jobCode":"CYL-NEW"}'::jsonb, now())`,
    [`ORD-${year}-185`]
  );
  await assert.rejects(
    () => db.query(
      `UPDATE public.sfg_goods
       SET job_name = 'Bambaiya Premium', job_code = 'CYL-NEW', client_name = 'S K Products'
       WHERE sfg_batch_code = $1`,
      [`SFG-LOT-ORD-${year}-185`]
    ),
    /earlier order/i
  );
  const lot = await db.query(
    `SELECT job_name, job_code FROM public.sfg_goods WHERE sfg_batch_code = $1`,
    [`SFG-LOT-ORD-${year}-185`]
  );
  assert.equal(lot.rows[0].job_name, 'With stock');
  assert.equal(lot.rows[0].job_code, 'CYL-185');

  await db.query(
    `INSERT INTO public.orders (id, job_name, client_name, status, job_details, created_at)
     VALUES ($1, 'Owned job', 'Client', 'Open', '{"jobCode":"CYL-OWN"}'::jsonb, now() - interval '1 hour')`,
    [`ORD-${year}-190`]
  );
  await db.query(
    `INSERT INTO public.sfg_goods (
       id, sfg_batch_code, sfg_type, order_id, job_name, job_code, total_net_kg, available_kg, total_meters, created_at, notes
     ) VALUES (
       '00000000-0000-0000-0000-000000000190', $1, 'Printed Rolls', $2, 'Owned job', 'CYL-OWN', 10, 10, 4000, now(),
       '{"childRolls":[{"barcodeId":"R1","lengthMeters":4000}],"totalMeters":4000}'
     )`,
    [`SFG-LOT-ORD-${year}-190`, `ORD-${year}-190`]
  );
  await db.query(
    `UPDATE public.sfg_goods
     SET notes = $2, total_meters = 4000
     WHERE sfg_batch_code = $1`,
    [
      `SFG-LOT-ORD-${year}-190`,
      JSON.stringify({
        childRolls: [
          { barcodeId: 'R1', lengthMeters: 6000 },
          { barcodeId: 'R2', lengthMeters: 4000 }
        ],
        totalMeters: 4000
      })
    ]
  );
  const summed = await db.query(
    `SELECT total_meters FROM public.sfg_goods WHERE sfg_batch_code = $1`,
    [`SFG-LOT-ORD-${year}-190`]
  );
  assert.equal(Number(summed.rows[0].total_meters), 10000);
  await db.close();
});

test('prod-like outliers stay retired and the next order number is 253', async () => {
  const db = new PGlite();
  await db.exec(schema());
  const yearRow = await db.query(`SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int AS year`);
  const year = yearRow.rows[0].year;
  const id = (serial) => `ORD-${year}-${serial}`;
  await db.query(
    `INSERT INTO public.orders (id, job_name, client_name, status) VALUES
      ($1, 'Live 200', 'Client', 'Open'),
      ($2, 'Live max', 'Client', 'Open')`,
    [id(200), id(252)]
  );
  await db.query(
    `INSERT INTO public.audit_logs (id, action_type, target_id) VALUES
      ('audit-9697', 'DELETE', $1),
      ('audit-2259', 'DELETE', $2),
      ('audit-294', 'DELETE', $3),
      ('audit-252-old', 'DELETE', $4)`,
    [id(9697), id(2259), id(294), id(252)]
  );
  await db.query(
    `INSERT INTO public.sfg_goods (id, sfg_batch_code, sfg_type, order_id, job_name, total_net_kg, available_kg)
     VALUES ('00000000-0000-0000-0000-000000002259', 'SFG-LOT-TYPO-2259', 'Printed Rolls', $1, 'Typo', 1, 0)`,
    [id(2259)]
  );
  await db.exec(previousSql);
  await db.exec(migrationSql);

  const mark = await db.query(`SELECT serial FROM private.order_id_high_water WHERE year = $1`, [year]);
  assert.equal(Number(mark.rows[0].serial), 252);
  const retired = await db.query(
    `SELECT order_id FROM private.retired_order_ids WHERE order_id IN ($1, $2, $3) ORDER BY length(order_id), order_id`,
    [id(294), id(2259), id(9697)]
  );
  assert.deepEqual(retired.rows.map((row) => row.order_id), [id(294), id(2259), id(9697)]);

  await db.query(`DELETE FROM public.orders WHERE id = $1`, [id(252)]);
  const reused = await db.query(
    `SELECT 1 FROM private.retired_order_ids WHERE order_id = $1`,
    [id(252)]
  );
  assert.equal(reused.rows.length, 1);
  const next = await db.query(`SELECT public.allocate_order_id(1) AS issued`);
  assert.deepEqual(next.rows[0].issued, [id(253)]);
  assert.notEqual(next.rows[0].issued[0], id(252));
  assert.notEqual(next.rows[0].issued[0], id(9697));

  await db.query(`UPDATE private.order_id_high_water SET serial = 293 WHERE year = $1`, [year]);
  const aroundNearby = await db.query(`SELECT public.allocate_order_id(1) AS issued`);
  assert.deepEqual(aroundNearby.rows[0].issued, [id(295)]);
  assert.equal(aroundNearby.rows[0].issued.includes(id(294)), false);

  await db.query(`UPDATE private.order_id_high_water SET serial = 2258 WHERE year = $1`, [year]);
  const aroundTypo = await db.query(`SELECT public.allocate_order_id(2) AS issued`);
  assert.deepEqual(aroundTypo.rows[0].issued, [id(2260), id(2261)]);
  assert.equal(aroundTypo.rows[0].issued.includes(id(2259)), false);

  await db.query(`UPDATE private.order_id_high_water SET serial = 9696 WHERE year = $1`, [year]);
  const aroundOutlier = await db.query(`SELECT public.allocate_order_id(1) AS issued`);
  assert.deepEqual(aroundOutlier.rows[0].issued, [id(9698)]);
  assert.equal(aroundOutlier.rows[0].issued.includes(id(9697)), false);
  await db.close();
});
