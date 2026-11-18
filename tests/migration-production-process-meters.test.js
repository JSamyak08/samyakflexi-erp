import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261118130000_production_process_meters.sql', import.meta.url),
  'utf8'
);

test('process meter columns are added after the structure-notice migration and have no zero default', () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const previous = '20261118120000_structure_change_notices.sql';
  const current = '20261118130000_production_process_meters.sql';
  assert.ok(names.includes(previous));
  assert.ok(names.indexOf(current) > names.indexOf(previous));
  assert.doesNotMatch(migrationSql, /DEFAULT\s+0/i);
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.match(migrationSql, /lamination_meters_l1/);
  assert.match(migrationSql, /lamination_meters_l2/);
  assert.match(migrationSql, /slitting_meters/);
  assert.match(migrationSql, /pouching_meters/);
  assert.match(migrationSql, /actual_adhesive_gsm_l2/);
});

test('the new production record columns are nullable', async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE public.production_records (id text PRIMARY KEY);`);
  await db.exec(migrationSql);
  const columns = await db.query(`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'production_records'
      AND column_name IN (
        'lamination_meters_l1',
        'lamination_meters_l2',
        'slitting_meters',
        'pouching_meters',
        'actual_adhesive_gsm_l2'
      )
    ORDER BY column_name
  `);
  assert.equal(columns.rows.length, 5);
  for (const row of columns.rows) {
    assert.equal(row.is_nullable, 'YES');
    assert.equal(row.column_default, null);
  }
});
