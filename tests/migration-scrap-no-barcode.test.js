import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261103140000_scrap_not_a_barcode.sql', import.meta.url),
  'utf8'
);

test('barcode registry keeps stock and old scrap stickers, and skips a scrap id', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE TABLE private.barcode_probe (allowed boolean NOT NULL);
    INSERT INTO private.barcode_probe VALUES (true);
    CREATE OR REPLACE FUNCTION private.can_any(modules text[])
    RETURNS boolean
    LANGUAGE sql
    STABLE
    AS $$ SELECT allowed FROM private.barcode_probe $$;

    CREATE TABLE public.deleted_barcodes (
      barcode text,
      source_module text,
      description text,
      reference_no text,
      created_at timestamptz,
      status text,
      location text,
      source_table text,
      source_column text,
      deleted_reason text,
      deleted_at timestamptz,
      deleted_by text
    );

    CREATE TABLE public.sfg_scrap_items (
      id text PRIMARY KEY,
      payload jsonb,
      created_at timestamptz
    );

    CREATE VIEW public.barcode_registry_sources AS
    SELECT *
    FROM (
      VALUES
        ('REC-1'::text, 'SFG scrap'::text, 'Process scrap'::text, 'ORD-1'::text, '2026-10-01'::timestamptz, 'Scrap'::text, NULL::text, 'sfg_scrap_items'::text, 'payload'::text),
        ('QCHOLD-100001', 'SFG scrap', 'Old sticker', 'ORD-1', '2026-10-02'::timestamptz, 'Scrap', NULL, 'sfg_scrap_items', 'payload'),
        ('RM-BC-1', 'Raw material / GRN', 'PET', 'GRN-1', '2026-10-03'::timestamptz, 'In Stock', 'Bay A', 'inventory_rolls', 'barcode_id'),
        ('SFG-BC-1', 'SFG rolls', 'Printed', 'ORD-1', '2026-10-04'::timestamptz, 'In Stock', 'Bay B', 'sfg_goods', 'sfg_batch_code'),
        ('RM-BC-1-BAL', 'Raw material / GRN', 'Balance', 'GRN-1', '2026-10-05'::timestamptz, 'In Stock', 'Bay A', 'inventory_rolls', 'barcode_id'),
        ('print-scrap:ORD:trim', 'SFG scrap', 'Rewind trim', 'ORD-1', '2026-10-06'::timestamptz, 'Scrap', NULL, 'sfg_scrap_items', 'payload')
    ) AS src(barcode, source_module, description, reference_no, created_at, status, location, source_table, source_column);

    CREATE VIEW public.barcode_registry AS
    SELECT barcode, source_module, description, reference_no, created_at, status, location, source_table, source_column
    FROM public.barcode_registry_sources
    WHERE false;

    INSERT INTO public.sfg_scrap_items (id, payload, created_at) VALUES
      ('print-scrap:ORD:printing-wastage', '{"scrapQtyKg":4,"sourceRecordId":"REC-1","defectCategory":"Printing Wastage"}', '2026-10-01'),
      ('SCRAP-1', '{"holdTagId":"QCHOLD-100001","scrapQtyKg":1}', '2026-10-02');
  `);

  await db.exec(migrationSql);

  const codes = await db.query(`
    SELECT barcode, source_module, source_table
    FROM public.barcode_registry
    ORDER BY barcode
  `);
  const found = new Set(codes.rows.map((row) => `${row.source_table}|${row.barcode}`));
  assert.equal(found.has('sfg_scrap_items|REC-1'), false);
  assert.equal(found.has('sfg_scrap_items|print-scrap:ORD:trim'), false);
  assert.equal(found.has('sfg_scrap_items|QCHOLD-100001'), true);
  assert.equal(found.has('inventory_rolls|RM-BC-1'), true);
  assert.equal(found.has('inventory_rolls|RM-BC-1-BAL'), true);
  assert.equal(found.has('sfg_goods|SFG-BC-1'), true);

  const scrap = await db.query(`SELECT id, payload->>'scrapQtyKg' AS kg FROM public.sfg_scrap_items ORDER BY id`);
  assert.deepEqual(scrap.rows.map((row) => `${row.id}:${row.kg}`), [
    'SCRAP-1:1',
    'print-scrap:ORD:printing-wastage:4'
  ]);

  assert.equal((await db.query(`SELECT public.scrap_code_is_legacy_barcode('REC-1') AS ok`)).rows[0].ok, false);
  assert.equal((await db.query(`SELECT public.scrap_code_is_legacy_barcode('scrapref:1') AS ok`)).rows[0].ok, false);
  assert.equal((await db.query(`SELECT public.scrap_code_is_legacy_barcode('QCHOLD-100001') AS ok`)).rows[0].ok, true);
  assert.equal((await db.query(`SELECT public.scrap_code_is_legacy_barcode('RM-BC-1-BAL') AS ok`)).rows[0].ok, true);
});
