import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261030200000_inventory_spec_duplicate_guard.sql', import.meta.url),
  'utf8'
);

async function schema(db) {
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE TABLE public.inventory (
      id text PRIMARY KEY,
      item_code text NOT NULL,
      item_name text NOT NULL,
      category text,
      micron numeric,
      width_mm numeric,
      stock_qty_kg numeric DEFAULT 0,
      unit_price numeric DEFAULT 0,
      location text
    );
  `);
}

test('existing duplicate items stay, and a new duplicate insert is rejected', async () => {
  const db = new PGlite();
  await schema(db);
  await db.exec(`
    INSERT INTO public.inventory (id, item_code, item_name, category, micron, width_mm, stock_qty_kg, unit_price, location)
    VALUES
      ('INVT-0150', 'INVT-0150', 'METBOPP-570-18 ||| {"availableQtyKg":26,"location":"Bay A"}', 'Film Substrates', 18, 570, 26, 209, 'Bay A'),
      ('INVT-2031', 'INVT-2031', 'metbopp-570-18', 'Film Substrates', 18.00, 570.00, 10, 205, 'Bay A - Inward Dock');
  `);
  await db.exec(migrationSql);
  const still = await db.query(`SELECT count(*)::int AS n FROM public.inventory`);
  assert.equal(still.rows[0].n, 2);

  await assert.rejects(
    () => db.exec(`
      INSERT INTO public.inventory (id, item_code, item_name, category, micron, width_mm)
      VALUES ('INVT-2099', 'INVT-2099', 'METBOPP-570-18', 'Film Substrates', 18, 570)
    `),
    /Duplicate inventory item/
  );

  await db.exec(`
    INSERT INTO public.inventory (id, item_code, item_name, category, micron, width_mm, stock_qty_kg)
    VALUES ('INVT-0160', 'INVT-0160', 'METBOPP-580-18', 'Film Substrates', 18, 580, 1)
    ON CONFLICT (id) DO UPDATE SET stock_qty_kg = EXCLUDED.stock_qty_kg
  `);
  await db.exec(`
    INSERT INTO public.inventory (id, item_code, item_name, category, micron, width_mm, stock_qty_kg, location)
    VALUES ('INVT-0150', 'INVT-0150', 'METBOPP-570-18 ||| {"availableQtyKg":36,"location":"Bay A"}', 'Film Substrates', 18, 570, 36, 'Bay A')
    ON CONFLICT (id) DO UPDATE SET stock_qty_kg = EXCLUDED.stock_qty_kg, item_name = EXCLUDED.item_name
  `);
  const saved = await db.query(`SELECT stock_qty_kg FROM public.inventory WHERE id = 'INVT-0150'`);
  assert.equal(Number(saved.rows[0].stock_qty_kg), 36);
  const fresh = await db.query(`SELECT id FROM public.inventory WHERE id = 'INVT-0160'`);
  assert.equal(fresh.rows[0].id, 'INVT-0160');
});
