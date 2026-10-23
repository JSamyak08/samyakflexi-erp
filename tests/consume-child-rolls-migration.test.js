import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261023193000_save_consume_child_rolls.sql', import.meta.url),
  'utf8'
);
const rollbackSql = fs.readFileSync(
  new URL('../supabase/rollback/20261023193000_save_consume_child_rolls_rollback.sql', import.meta.url),
  'utf8'
);

function child(barcode, parent, net) {
  return {
    parent_batch: parent,
    sfg: {
      sfg_batch_code: barcode,
      sfg_type: 'Laminated / Processed Rolls',
      order_id: 'ORD-1',
      job_name: 'Pouch job',
      job_code: 'JOB1',
      client_name: 'Client',
      film_type: 'PET',
      micron: 12,
      width_mm: 460,
      total_gross_kg: net + 0.8,
      gross_weight_kg: net + 0.8,
      tare_weight_kg: 0.8,
      total_net_kg: net,
      consumed_kg: 0,
      available_kg: net,
      total_meters: 0,
      rolls_count: 1,
      machine_name: 'Lam 1',
      operator_name: 'Operator',
      shift: 'Day Shift',
      storage_bay: 'Bay A',
      production_date: '2026-10-23',
      status: 'In Stock (WIP)',
      notes: JSON.stringify({
        sfgBatchCode: barcode,
        parentSfgBatchCode: parent,
        parentBarcode: parent,
        notesText: `Produced from Lamination (Pass 1) of ${parent}`
      }),
      updated_at: '2026-10-23T12:00:00.000Z'
    },
    roll: {
      barcode_id: barcode,
      roll_type: 'SEMI_FINISHED_GOODS',
      item_id: '',
      item_name: 'Pouch job child roll',
      category: 'Semi-Finished Goods (SFG)',
      job_name: 'Pouch job',
      order_id: 'ORD-1',
      micron: 12,
      width_mm: 460,
      inward_datetime: '2026-10-23T12:00:00.000Z',
      production_date: '2026-10-23',
      gross_weight_kg: net + 0.8,
      tare_weight_kg: 0.8,
      net_weight_kg: net,
      available_weight_kg: net,
      length_meters: 0,
      joint_count: 0,
      qc_status: 'Approved',
      machine_name: 'Lam 1',
      operator_name: 'Operator',
      shift: 'Day Shift',
      remarks: 'Produced from Lamination (Pass 1)',
      core_dia: '',
      input_barcode_ids: [parent],
      station_id: '',
      location_bay: 'Bay A',
      status: 'In Stock (SFG)',
      sfg_type: 'Laminated Rolls',
      job_code: 'JOB1',
      client_name: 'Client',
      structure: '',
      metadata: {
        packagingType: 'Roll',
        unit: 'Kg',
        parentSfgBatchCode: parent
      }
    }
  };
}

async function createDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.sfg_goods (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sfg_batch_code text NOT NULL UNIQUE,
      sfg_type text NOT NULL,
      job_id text,
      order_id text,
      job_name text NOT NULL,
      job_code text,
      client_name text,
      structure text,
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
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      roll_type text NOT NULL,
      item_id text,
      item_name text NOT NULL,
      category text,
      job_name text,
      order_id text,
      micron numeric,
      width_mm numeric,
      inward_datetime timestamptz,
      production_date date,
      vendor_name text,
      invoice_no text,
      batch_no text,
      gross_weight_kg numeric,
      tare_weight_kg numeric,
      net_weight_kg numeric NOT NULL,
      available_weight_kg numeric NOT NULL,
      length_meters numeric,
      joint_count integer,
      qc_status text,
      machine_name text,
      operator_name text,
      shift text,
      remarks text,
      core_dia text,
      input_barcode_ids jsonb,
      station_id text,
      location_bay text,
      status text,
      sfg_type text,
      job_code text,
      client_name text,
      structure text,
      metadata jsonb
    );
  `);
  await db.exec(migrationSql);
  return db;
}

test('the child-roll migration is replaceable and the rollback only drops the function', () => {
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.save_consume_child_rolls/);
  assert.match(migrationSql, /SECURITY INVOKER|SET search_path = public/);
  assert.doesNotMatch(migrationSql, /SECURITY DEFINER/);
  assert.match(migrationSql, /gen_random_uuid\(\)/);
  assert.match(rollbackSql, /DROP FUNCTION IF EXISTS public\.save_consume_child_rolls\(jsonb\)/);
  assert.doesNotMatch(rollbackSql, /DELETE FROM/i);
  assert.doesNotMatch(rollbackSql, /DROP TABLE/i);
});

test('all child rolls commit together, a retry updates them, and a foreign barcode rolls back', async () => {
  const db = await createDb();
  const parent = 'SFG-PARENT-1000';
  const payload = JSON.stringify([
    child('SFG-BC-ORD1-1000-R02', parent, 250),
    child('SFG-BC-ORD1-1000-R03', parent, 250),
    child('SFG-BC-ORD1-1000-R04', parent, 250),
    child('SFG-BC-ORD1-1000-R05', parent, 250)
  ]);

  const saved = await db.query(
    'SELECT public.save_consume_child_rolls($1::jsonb) AS n',
    [payload]
  );
  assert.equal(Number(saved.rows[0].n), 4);

  const goods = await db.query('SELECT id, sfg_batch_code, total_net_kg, notes FROM public.sfg_goods ORDER BY sfg_batch_code');
  assert.equal(goods.rows.length, 4);
  const ids = new Set(goods.rows.map((row) => row.id));
  assert.equal(ids.size, 4);
  goods.rows.forEach((row) => {
    assert.equal(Number(row.total_net_kg), 250);
    const notes = JSON.parse(row.notes);
    assert.equal(notes.parentSfgBatchCode, parent);
  });

  const rolls = await db.query('SELECT barcode_id, net_weight_kg, input_barcode_ids, metadata FROM public.inventory_rolls ORDER BY barcode_id');
  assert.equal(rolls.rows.length, 4);
  rolls.rows.forEach((row) => {
    assert.deepEqual(row.input_barcode_ids, [parent]);
    assert.equal(row.metadata.parentSfgBatchCode, parent);
  });

  const retryPayload = JSON.stringify([
    child('SFG-BC-ORD1-1000-R02', parent, 240),
    child('SFG-BC-ORD1-1000-R03', parent, 260),
    child('SFG-BC-ORD1-1000-R04', parent, 250),
    child('SFG-BC-ORD1-1000-R05', parent, 250)
  ]);
  await db.query('SELECT public.save_consume_child_rolls($1::jsonb)', [retryPayload]);
  const afterRetry = await db.query('SELECT count(*)::int AS n FROM public.sfg_goods');
  assert.equal(afterRetry.rows[0].n, 4);
  const updated = await db.query(
    "SELECT total_net_kg FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-BC-ORD1-1000-R02'"
  );
  assert.equal(Number(updated.rows[0].total_net_kg), 240);
  const sameId = await db.query(
    "SELECT id FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-BC-ORD1-1000-R02'"
  );
  assert.equal(sameId.rows[0].id, goods.rows.find((row) => row.sfg_batch_code === 'SFG-BC-ORD1-1000-R02').id);

  await db.query(
    `INSERT INTO public.sfg_goods (sfg_batch_code, sfg_type, job_name, notes)
     VALUES ('SFG-EXISTING', 'Printed Rolls', 'Other job', '{"notesText":"already in stock"}')`
  );
  await db.query(
    `INSERT INTO public.inventory_rolls (barcode_id, roll_type, item_name, net_weight_kg, available_weight_kg, metadata)
     VALUES ('SFG-EXISTING', 'SEMI_FINISHED_GOODS', 'Other job', 10, 10, '{}'::jsonb)`
  );

  const clash = JSON.stringify([
    child('SFG-BC-NEW-1', parent, 100),
    child('SFG-EXISTING', parent, 100)
  ]);
  await assert.rejects(
    () => db.query('SELECT public.save_consume_child_rolls($1::jsonb)', [clash]),
    /already belongs to another roll/
  );
  const leftover = await db.query("SELECT count(*)::int AS n FROM public.sfg_goods WHERE sfg_batch_code = 'SFG-BC-NEW-1'");
  assert.equal(leftover.rows[0].n, 0);

  await db.exec(rollbackSql);
  const gone = await db.query(
    "SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'save_consume_child_rolls'"
  );
  assert.equal(gone.rows[0].n, 0);
  const stillThere = await db.query('SELECT count(*)::int AS n FROM public.sfg_goods');
  assert.equal(stillThere.rows[0].n, 5);
});
