import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261027143000_job_master_guardrails.sql', import.meta.url),
  'utf8'
);
const exceptionsSql = fs.readFileSync(
  new URL('../supabase/manual/20261027143000_production_record_exceptions.sql', import.meta.url),
  'utf8'
);

async function stubSchema(db) {
  await db.exec(`
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text,
      order_qty_kg numeric,
      job_details jsonb
    );
    CREATE TABLE public.job_masters (
      id text PRIMARY KEY,
      sku_code text,
      job_name text,
      print_width_mm numeric,
      layers jsonb,
      wastage_percentage numeric
    );
    CREATE TABLE public.production_records (
      id text PRIMARY KEY,
      order_id text,
      job_name text,
      client_name text,
      date_filled date,
      recorded_at timestamptz,
      gross_production_kg numeric,
      net_usable_kg numeric,
      total_wastage_kg numeric,
      wastage_percentage numeric,
      actual_meters_printed numeric,
      qty_printing numeric,
      qty_inspection numeric,
      qty_lamination_l1 numeric,
      qty_second_pass_l2 numeric,
      qty_slitting numeric,
      qty_pouching numeric,
      qty_dispatch numeric,
      qty_first_pass_l1 numeric,
      adhesive_consumed_l1_kg numeric,
      adhesive_consumed_l2_kg numeric,
      zipper_consumed_kg numeric,
      paper_core_consumed_kg numeric,
      printing_plain_setting_wastage_kg numeric,
      printing_wastage_kg numeric,
      lamination_plain_substrate_wastage_kg numeric,
      lamination_plain_substrate_wastage_l2_kg numeric,
      printed_wastage_kg numeric,
      laminate_wastage_kg numeric,
      trim_wastage_kg numeric,
      pouching_scrap_kg numeric,
      job_code text,
      process_logs jsonb
    );
  `);
}

test('guardrail migration adds nullable columns and does not rewrite an existing negative row', async () => {
  const db = new PGlite();
  await stubSchema(db);
  await db.exec(`
    INSERT INTO public.production_records (id, order_id, job_name, actual_meters_printed, qty_pouching)
    VALUES ('OLD-NEG', 'ORD-1', 'Old', -5, 10);
  `);
  await db.exec(migrationSql);

  const stillThere = await db.query(`SELECT actual_meters_printed FROM public.production_records WHERE id = 'OLD-NEG'`);
  assert.equal(Number(stillThere.rows[0].actual_meters_printed), -5);

  const columns = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'production_records'
      AND column_name IN ('job_master_id', 'print_film_type', 'print_micron', 'print_width_mm', 'qty_pouching_pcs', 'zipper_consumed_m')
    ORDER BY column_name
  `);
  assert.deepEqual(columns.rows.map((row) => row.column_name), [
    'job_master_id',
    'print_film_type',
    'print_micron',
    'print_width_mm',
    'qty_pouching_pcs',
    'zipper_consumed_m'
  ]);

  const orderColumn = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'job_master_id'
  `);
  assert.equal(orderColumn.rows.length, 1);

  await assert.rejects(
    () => db.exec(`INSERT INTO public.production_records (id, job_name, actual_meters_printed) VALUES ('NEW-NEG', 'New', -1)`),
    /production_records_qty_meters_nonneg|check constraint/i
  );
  await db.exec(`
    INSERT INTO public.production_records (
      id, job_name, order_id, job_master_id, print_film_type, print_micron, print_width_mm,
      actual_meters_printed, qty_pouching_pcs, zipper_consumed_m
    ) VALUES (
      'NEW-OK', 'New', 'ORD-1', 'JM-1', 'PET', 12, 660, 1000, 50, 20
    )
  `);
  const saved = await db.query(`SELECT job_master_id, print_film_type, print_micron FROM public.production_records WHERE id = 'NEW-OK'`);
  assert.equal(saved.rows[0].job_master_id, 'JM-1');
  assert.equal(saved.rows[0].print_film_type, 'PET');
  assert.equal(Number(saved.rows[0].print_micron), 12);
});

test('exceptions script is read-only and flags a narrower roll and an ambiguous name', async () => {
  const db = new PGlite();
  await stubSchema(db);
  await db.exec(migrationSql);
  await db.exec(`
    INSERT INTO public.job_masters (id, sku_code, job_name, print_width_mm, layers, wastage_percentage) VALUES
      ('JM-1', 'SKU-1', 'Shared', 660, '[{"filmType":"PET","micron":12}]'::jsonb, 5),
      ('JM-2', 'SKU-2', 'Shared', 700, '[{"filmType":"BOPP","micron":18}]'::jsonb, 5),
      ('JM-3', 'SKU-3', 'Unique Tea', 510, '[{"filmType":"METPET","micron":12}]'::jsonb, 5);
    INSERT INTO public.orders (id, job_name, order_qty_kg, job_details) VALUES
      ('ORD-NARROW', 'Unique Tea', 100, '{}'::jsonb),
      ('ORD-AMBIG', 'Shared', 100, '{}'::jsonb);
    INSERT INTO public.production_records (
      id, order_id, job_name, gross_production_kg, net_usable_kg, qty_slitting, qty_pouching, qty_dispatch,
      process_logs, recorded_at
    ) VALUES
      (
        'REC-NARROW', 'ORD-NARROW', 'Unique Tea', 20, 20, 0, 0, 0,
        '{"inputRollsList":[{"filmType":"METPET","micron":"12","widthMm":"400","consumedWeightKg":"20"}]}'::jsonb,
        '2026-10-27T08:00:00Z'
      ),
      (
        'REC-AMBIG', 'ORD-AMBIG', 'Shared', 10, 0, 0, 0, 0,
        '{"inputRollsList":[]}'::jsonb,
        '2026-10-27T09:00:00Z'
      );
  `);

  const before = await db.query(`SELECT COUNT(*)::int AS n FROM public.production_records`);
  const flagged = await db.query(exceptionsSql);
  const after = await db.query(`SELECT COUNT(*)::int AS n FROM public.production_records`);
  assert.equal(after.rows[0].n, before.rows[0].n);

  const narrow = flagged.rows.filter((row) => row.record_id === 'REC-NARROW').map((row) => row.rule);
  assert.ok(narrow.includes('width'));
  const ambiguous = flagged.rows.find((row) => row.record_id === 'REC-AMBIG' && row.rule === 'job-master');
  assert.equal(ambiguous.link_via, 'ambiguous');
  assert.match(ambiguous.detail, /not found \/ ambiguous/);
});
