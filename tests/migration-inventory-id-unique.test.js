import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261028120000_inventory_id_barcode_ci_unique.sql', import.meta.url),
  'utf8'
);

async function stubSchema(db) {
  await db.exec(`
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_code text NOT NULL,
      item_name text NOT NULL
    );
    CREATE TABLE public.inventory_rolls (
      barcode_id text PRIMARY KEY,
      item_name text NOT NULL
    );
  `);
}

test('case-insensitive inventory ids and roll barcodes are rejected after the migration', async () => {
  const db = new PGlite();
  await stubSchema(db);
  await db.exec(`
    INSERT INTO public.inventory (id, item_code, item_name) VALUES ('INVT-0001', 'INVT-0001', 'PET');
    INSERT INTO public.inventory_rolls (barcode_id, item_name) VALUES ('RM-BC-20261028-0001', 'PET');
  `);
  await db.exec(migrationSql);
  await assert.rejects(
    () => db.exec(`INSERT INTO public.inventory (id, item_code, item_name) VALUES ('invt-0001', 'invt-0001', 'Other')`),
    /inventory_id_ci_unique|duplicate key/i
  );
  await assert.rejects(
    () => db.exec(`INSERT INTO public.inventory_rolls (barcode_id, item_name) VALUES ('rm-bc-20261028-0001', 'Other')`),
    /inventory_rolls_barcode_ci_unique|duplicate key/i
  );
  await db.exec(`INSERT INTO public.inventory (id, item_code, item_name) VALUES ('INVT-0002', 'INVT-0002', 'Ink')`);
  const saved = await db.query(`SELECT id FROM public.inventory WHERE id = 'INVT-0002'`);
  assert.equal(saved.rows[0].id, 'INVT-0002');
});

test('the migration leaves an existing case-variant pair in place', async () => {
  const db = new PGlite();
  await stubSchema(db);
  await db.exec(`
    INSERT INTO public.inventory (id, item_code, item_name) VALUES
      ('INVT-0001', 'INVT-0001', 'One'),
      ('invt-0001', 'invt-0001', 'Two');
  `);
  await db.exec(migrationSql);
  const count = await db.query(`SELECT count(*)::int AS n FROM public.inventory`);
  assert.equal(count.rows[0].n, 2);
  const index = await db.query(`SELECT indexname FROM pg_indexes WHERE indexname = 'inventory_id_ci_unique'`);
  assert.equal(index.rows.length, 0);
});
