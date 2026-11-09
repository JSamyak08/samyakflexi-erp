import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { planCylinderRateMove } from '../src/utils/cylinderCost.js';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261109160000_cylinder_rate_1_80.sql', import.meta.url),
  'utf8'
);

const rows = [
  {
    id: 'qa-901',
    sku: 'SKU-CYL-901',
    job_name: 'Clean Mango 500g',
    rate: 1.6,
    face: 730,
    circ: 440,
    colors: 7,
    total: '₹ 35,973.00',
    per: '₹ 5,139.00'
  },
  {
    id: 'qa-518',
    sku: 'SKU-CYL-518',
    job_name: 'Sonu gold mango mirchi',
    rate: 1.6,
    face: 730,
    circ: 440,
    colors: 7,
    total: '₹ 35,973.00',
    per: '₹ 6,85,40,000.00'
  },
  {
    id: 'qa-904',
    sku: 'SKU-CYL-904',
    job_name: 'Premium Engraving Set',
    rate: 1.6,
    face: 730,
    circ: 440,
    colors: 7,
    total: '₹ 35,97,300.00',
    per: '₹ 5,13,900.00'
  },
  {
    id: 'qa-nodim',
    sku: 'SKU-CYL-NODIM',
    job_name: 'No dimensions',
    rate: 1.6,
    face: null,
    circ: null,
    colors: 6,
    total: '₹ 10,000.00',
    per: '₹ 2,000.00'
  },
  {
    id: 'qa-210',
    sku: 'SKU-CYL-7271',
    job_name: 'QA Rate Check 210',
    rate: 2.1,
    face: 1050,
    circ: 400,
    colors: 6,
    total: '₹ 52,920.00',
    per: '₹ 8,820.00'
  },
  {
    id: 'qa-null',
    sku: 'SKU-CYL-NULL',
    job_name: 'No rate',
    rate: null,
    face: 730,
    circ: 440,
    colors: 7,
    total: '₹ 35,973.00',
    per: '₹ 5,139.00'
  }
];

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.cylinders (
      id text PRIMARY KEY,
      sku text,
      job_name text NOT NULL,
      colors_count integer,
      face_length_mm numeric,
      circumference_mm numeric,
      rate_per_sq_inch numeric DEFAULT 1.6,
      cylinder_cost text,
      cost_per_cylinder text,
      press_marks jsonb
    );
  `);
  for (const row of rows) {
    await db.query(
      `INSERT INTO public.cylinders (
        id, sku, job_name, colors_count, face_length_mm, circumference_mm,
        rate_per_sq_inch, cylinder_cost, cost_per_cylinder, press_marks
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [
        row.id, row.sku, row.job_name, row.colors, row.face, row.circ, row.rate,
        row.total, row.per,
        JSON.stringify({ ratePerSqInch: row.rate, cylinderCost: row.total, costPerCylinder: row.per })
      ]
    );
  }
  await db.exec(migrationSql);
  return db;
}

test('the rate migration is later than production migration 20261109150100 and only updates 1.6', () => {
  assert.match(migrationSql, /ALTER COLUMN rate_per_sq_inch SET DEFAULT 1\.8/);
  assert.match(migrationSql, /cylinder_rate_backup_20261109/);
  assert.match(migrationSql, /rate_per_sq_inch = 1\.6/);
  assert.match(migrationSql, /ON CONFLICT \(cylinder_id\) DO NOTHING/);
  assert.doesNotMatch(migrationSql, /DROP TABLE/);
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'));
  assert.ok(names.some((name) => name.startsWith('20261109160000')));
  assert.equal(names.filter((name) => name.startsWith('20261109150000')).length, 0);
  assert.ok('20261109160000' > '20261109150100');
});

test('₹1.60 rows move to ₹1.80 and a second run changes nothing', async () => {
  const db = await database();
  const { rows: stored } = await db.query(`
    SELECT id, rate_per_sq_inch::float8 AS rate, cylinder_cost, cost_per_cylinder,
           press_marks->>'ratePerSqInch' AS mark_rate,
           press_marks->>'cylinderCost' AS mark_total
    FROM public.cylinders
    ORDER BY id
  `);
  const byId = Object.fromEntries(stored.map((row) => [row.id, row]));

  const clean = planCylinderRateMove({
    faceLengthMm: 730,
    circumferenceMm: 440,
    colorsCount: 7,
    rate: 1.6,
    cylinderCost: '₹ 35,973.00',
    costPerCylinder: '₹ 5,139.00'
  });
  assert.equal(byId['qa-901'].rate, 1.8);
  assert.equal(byId['qa-901'].cylinder_cost, clean.cylinderCostText);
  assert.equal(byId['qa-901'].cost_per_cylinder, clean.costPerCylinderText);
  assert.equal(byId['qa-901'].cylinder_cost, '₹ 40,474.00');
  assert.equal(byId['qa-901'].cost_per_cylinder, '₹ 5,782.00');
  assert.equal(byId['qa-901'].mark_rate, '1.8');
  assert.equal(byId['qa-901'].mark_total, '₹ 40,474.00');

  assert.equal(byId['qa-518'].cylinder_cost, '₹ 40,474.00');
  assert.equal(byId['qa-518'].cost_per_cylinder, '₹ 5,782.00');

  assert.equal(byId['qa-904'].rate, 1.8);
  assert.equal(byId['qa-904'].cylinder_cost, '₹ 35,97,300.00');
  assert.equal(byId['qa-904'].cost_per_cylinder, '₹ 5,13,900.00');

  assert.equal(byId['qa-nodim'].rate, 1.8);
  assert.equal(byId['qa-nodim'].cylinder_cost, '₹ 10,000.00');
  assert.equal(byId['qa-nodim'].cost_per_cylinder, '₹ 2,000.00');

  assert.equal(byId['qa-210'].rate, 2.1);
  assert.equal(byId['qa-210'].cylinder_cost, '₹ 52,920.00');
  assert.equal(byId['qa-null'].rate, null);
  assert.equal(byId['qa-null'].cylinder_cost, '₹ 35,973.00');

  const { rows: backup } = await db.query(`
    SELECT cylinder_id, action, cylinder_cost
    FROM public.cylinder_rate_backup_20261109
    ORDER BY cylinder_id
  `);
  assert.deepEqual(backup.map((row) => row.cylinder_id), ['qa-518', 'qa-901', 'qa-904', 'qa-nodim']);
  assert.deepEqual(backup.map((row) => row.action), ['recompute', 'recompute', 'keep_costs', 'rate_only']);
  assert.equal(backup.find((row) => row.cylinder_id === 'qa-901').cylinder_cost, '₹ 35,973.00');

  await db.exec(migrationSql);
  const { rows: again } = await db.query(`SELECT count(*)::int AS n FROM public.cylinder_rate_backup_20261109`);
  assert.equal(again[0].n, 4);
  const { rows: still } = await db.query(`SELECT cylinder_cost FROM public.cylinders WHERE id = 'qa-901'`);
  assert.equal(still[0].cylinder_cost, '₹ 40,474.00');
  await db.close();
});
