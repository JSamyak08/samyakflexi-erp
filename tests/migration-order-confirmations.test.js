import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261030140000_order_confirmation_notes.sql', import.meta.url),
  'utf8'
);

test('order confirmation migration is idempotent and creates order_confirmations table', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      client_name text NOT NULL
    );
  `);

  await db.exec(migrationSql);
  await db.exec(migrationSql); // Test idempotency

  const tables = await db.query(`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_confirmations'
  `);
  assert.equal(tables.rows.length, 1);

  const columns = await db.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_confirmations'
    ORDER BY column_name
  `);
  const colNames = columns.rows.map(c => c.column_name);
  assert.ok(colNames.includes('id'));
  assert.ok(colNames.includes('ocn_number'));
  assert.ok(colNames.includes('order_id'));
  assert.ok(colNames.includes('revision_no'));
  assert.ok(colNames.includes('amendment_no'));
  assert.ok(colNames.includes('payload'));
});
