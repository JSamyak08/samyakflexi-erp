import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261026140000_job_wastage_scrap_registry.sql', import.meta.url),
  'utf8'
);

async function stubSchema(db) {
  await db.exec(`
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text,
      order_qty_kg numeric
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
  `);
}

test('high scrap view keeps jobs at 5% of order quantity and omits the rest', async () => {
  const db = new PGlite();
  await stubSchema(db);
  await db.exec(migrationSql);
  await db.exec(`
    INSERT INTO public.orders (id, job_name, order_qty_kg) VALUES
      ('ORD-LIMIT', 'At Limit', 1000),
      ('ORD-UNDER', 'Under', 1000),
      ('ORD-MIXED', 'Mixed', 200),
      ('ORD-EMPTY', 'No Qty', 0);
    INSERT INTO public.production_records (
      id, order_id, job_name, printing_wastage_kg, trim_wastage_kg,
      lamination_plain_substrate_wastage_l2_kg, process_logs, recorded_at
    ) VALUES
      ('REC-LIMIT', 'ORD-LIMIT', 'At Limit', 50, 0, 0, '{}'::jsonb, '2026-10-26T10:00:00Z'),
      ('REC-UNDER', 'ORD-UNDER', 'Under', 49.9, 0, 0, '{}'::jsonb, '2026-10-26T10:00:00Z'),
      (
        'REC-MIXED', 'ORD-MIXED', 'Mixed', 4, 4, 0,
        '{"slittingSettingWastageKg": 2, "slittingScrapKg": 100, "excessFilmWastageKg": 1, "laminationPlainSubstrateWastageL2Kg": 3}'::jsonb,
        '2026-10-26T11:00:00Z'
      ),
      ('REC-EMPTY', 'ORD-EMPTY', 'No Qty', 40, 0, 0, '{}'::jsonb, '2026-10-26T12:00:00Z');
  `);

  const flagged = await db.query(`
    SELECT order_id, total_wastage_kg, wastage_percentage, order_qty_kg,
           excess_film_wastage_kg, slitting_setting_wastage_kg,
           lamination_plain_substrate_wastage_l2_kg, is_high_scrap_alert
    FROM public.high_scrap_audit_registry
    ORDER BY order_id
  `);
  const ids = flagged.rows.map((row) => row.order_id);
  assert.deepEqual(ids, ['ORD-LIMIT', 'ORD-MIXED']);
  const mixed = flagged.rows.find((row) => row.order_id === 'ORD-MIXED');
  assert.equal(Number(mixed.total_wastage_kg), 14);
  assert.equal(Number(mixed.excess_film_wastage_kg), 1);
  assert.equal(Number(mixed.slitting_setting_wastage_kg), 2);
  assert.equal(Number(mixed.lamination_plain_substrate_wastage_l2_kg), 3);
  assert.equal(Number(mixed.wastage_percentage), 7);
  assert.equal(mixed.is_high_scrap_alert, true);
  const limit = flagged.rows.find((row) => row.order_id === 'ORD-LIMIT');
  assert.equal(Number(limit.wastage_percentage), 5);

  await db.close();
});
