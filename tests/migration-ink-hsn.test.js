import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261031060000_ink_hsn_code.sql', import.meta.url),
  'utf8'
);

test('the ink HSN migration is newer than the printing deadline migration and does not rewrite rows', () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const previous = '20261030223000_printing_deadline_alerts.sql';
  const current = '20261031060000_ink_hsn_code.sql';
  assert.ok(names.includes(previous));
  assert.ok(names.includes(current));
  assert.ok(names.indexOf(current) > names.indexOf(previous));
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS hsn_code text/i);
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.inks/i);
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
});

test('adding hsn_code leaves an existing ink null until a master save writes it', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.inks (
      id text PRIMARY KEY,
      product_code text UNIQUE NOT NULL,
      shade text NOT NULL,
      manufacturer text,
      solid_content_pct numeric,
      solid_variation_pct numeric,
      price_per_kg numeric,
      notes text,
      price_history jsonb
    );
    INSERT INTO public.inks (
      id, product_code, shade, manufacturer, solid_content_pct, solid_variation_pct, price_per_kg, notes, price_history
    ) VALUES (
      'INK-453036',
      'WCL4-12AK-01FW',
      'Flint - GPL REDDER YELLOW',
      'Flint  Inks',
      22,
      2,
      334,
      '',
      '[{"date":"2026-10-23","price":334,"reason":"Initial onboarding rate"}]'::jsonb
    );
  `);

  await db.exec(migrationSql);

  const before = await db.query(`
    SELECT hsn_code, notes, price_history
    FROM public.inks
    WHERE product_code = 'WCL4-12AK-01FW'
  `);
  assert.equal(before.rows.length, 1);
  assert.equal(before.rows[0].hsn_code, null);
  assert.equal(before.rows[0].notes, '');
  assert.equal(JSON.stringify(before.rows[0].price_history).includes('hsn'), false);

  await db.query(`UPDATE public.inks SET hsn_code = '32151990' WHERE product_code = 'WCL4-12AK-01FW'`);
  const after = await db.query(`SELECT hsn_code FROM public.inks WHERE id = 'INK-453036'`);
  assert.equal(after.rows[0].hsn_code, '32151990');
});
