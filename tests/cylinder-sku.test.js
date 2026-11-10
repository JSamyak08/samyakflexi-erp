import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  allocateCylinderSkuSeries,
  cylinderSkuTaken,
  nextCylinderSku,
  planBulkCylinderSkus
} from '../src/utils/cylinderSku.js';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261110120000_cylinder_sku_allocation.sql', import.meta.url),
  'utf8'
);

const rows = [
  { id: 'a', sku: 'SKU-CYL-515', jobName: 'Gap neighbour', status: 'Inactive' },
  { id: 'b', sku: ' sku-cyl-517 ', jobName: 'Taken with spaces', status: 'Active In-Use' },
  { id: 'c', sku: 'SKU-CYL-518', jobName: 'Sonu gold mango mirchi', status: 'Active In-Use' },
  { id: 'd', sku: 'CYL-2026-999', jobName: 'Bulk format', status: 'Active' },
  { id: 'e', sku: 'SKU-CYL-495', jobName: 'Repeated code', status: 'Under Engraving' },
  { id: 'f', sku: 'SKU-CYL-495', jobName: 'Repeated code', status: 'Active In-Use' },
  { id: 'g', sku: 'SKU-CYL-7271', jobName: 'Four digit serial', status: 'Active In-Use' }
];

test('the next SKU-CYL code is one past the highest serial and does not fill gaps', () => {
  assert.equal(nextCylinderSku(rows), 'SKU-CYL-7272');
  assert.deepEqual(allocateCylinderSkuSeries(rows, 2), ['SKU-CYL-7272', 'SKU-CYL-7273']);
  assert.equal(nextCylinderSku([
    { sku: 'CYL-2026-900' },
    { sku: 'JM-2026-800' },
    { id: '1792841545179', sku: 'SKU-CYL-400' }
  ]), 'SKU-CYL-401');
  assert.equal(cylinderSkuTaken('SKU-CYL-517', rows), true);
  assert.equal(cylinderSkuTaken('sku-cyl-517', rows), true);
  assert.equal(cylinderSkuTaken('SKU-CYL-516', rows), false);
  assert.equal(cylinderSkuTaken('SKU-CYL-495', rows, 'e'), true);
  assert.equal(cylinderSkuTaken('SKU-CYL-518', rows, 'c'), false);
});

test('blank CSV rows get the next codes and a colliding SKU is flagged', () => {
  const plan = planBulkCylinderSkus(
    ['', 'SKU-CYL-518', 'CYL-2026-100', 'SKU-CYL-518', ''],
    rows
  );
  assert.equal(plan[0].sku, 'SKU-CYL-7272');
  assert.equal(plan[0].generated, true);
  assert.equal(plan[0].collision, false);
  assert.equal(plan[1].collision, true);
  assert.match(plan[1].message, /SKU-CYL-518/);
  assert.equal(plan[1].sku, 'SKU-CYL-518');
  assert.equal(plan[2].sku, 'CYL-2026-100');
  assert.equal(plan[2].collision, false);
  assert.equal(plan[3].collision, true);
  assert.equal(plan[4].sku, 'SKU-CYL-7273');
  assert.equal(plan[4].collision, false);
});

test('the migration is later than 20261109160000 and does not add a unique index', () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'));
  assert.ok(names.includes('20261110120000_cylinder_sku_allocation.sql'));
  assert.ok('20261110120000' > '20261109160000');
  assert.doesNotMatch(migrationSql, /CREATE UNIQUE INDEX/i);
  assert.match(migrationSql, /allocate_cylinder_sku/);
  assert.match(migrationSql, /Existing cylinder SKU codes cannot be changed/);
});

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.cylinders (
      id text PRIMARY KEY,
      sku text,
      job_name text NOT NULL,
      status text,
      rate_per_sq_inch numeric
    );
  `);
  for (const row of rows) {
    await db.query(
      `INSERT INTO public.cylinders (id, sku, job_name, status) VALUES ($1, $2, $3, $4)`,
      [row.id, row.sku, row.jobName, row.status]
    );
  }
  await db.exec(migrationSql);
  return db;
}

test('new duplicates are rejected, existing codes stay, and allocation skips taken numbers', async () => {
  const db = await database();

  await db.query(`UPDATE public.cylinders SET job_name = 'Repeated code kept' WHERE id = 'f'`);
  const kept = await db.query(`SELECT sku FROM public.cylinders WHERE id = 'f'`);
  assert.equal(kept.rows[0].sku, 'SKU-CYL-495');

  await assert.rejects(
    () => db.query(`INSERT INTO public.cylinders (id, sku, job_name) VALUES ('new-dup', 'sku-cyl-495', 'Another')`),
    /already exists for another cylinder/i
  );
  await assert.rejects(
    () => db.query(`INSERT INTO public.cylinders (id, sku, job_name) VALUES ('spaced', ' SKU-CYL-518 ', 'Spaced')`),
    /already exists for another cylinder/i
  );
  await assert.rejects(
    () => db.query(`UPDATE public.cylinders SET sku = 'SKU-CYL-600' WHERE id = 'c'`),
    /cannot be changed/i
  );

  const first = await db.query(`SELECT public.allocate_cylinder_sku(1) AS issued`);
  const second = await db.query(`SELECT public.allocate_cylinder_sku(2) AS issued`);
  assert.deepEqual(first.rows[0].issued, ['SKU-CYL-7272']);
  assert.deepEqual(second.rows[0].issued, ['SKU-CYL-7273', 'SKU-CYL-7274']);

  await db.query(`INSERT INTO public.cylinders (id, sku, job_name, status) VALUES ('issued', 'SKU-CYL-7272', 'QA next', 'Inactive')`);
  const stored = await db.query(`SELECT sku, status FROM public.cylinders WHERE id = 'issued'`);
  assert.equal(stored.rows[0].sku, 'SKU-CYL-7272');
  assert.equal(stored.rows[0].status, 'Inactive');

  const afterInsert = await db.query(`SELECT public.allocate_cylinder_sku(1) AS issued`);
  assert.deepEqual(afterInsert.rows[0].issued, ['SKU-CYL-7275']);

  const untouched = await db.query(`SELECT sku FROM public.cylinders WHERE id IN ('a','b','c','d') ORDER BY id`);
  assert.deepEqual(untouched.rows.map((row) => row.sku), [
    'SKU-CYL-515',
    ' sku-cyl-517 ',
    'SKU-CYL-518',
    'CYL-2026-999'
  ]);
  await db.close();
});
