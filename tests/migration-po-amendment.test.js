import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261026120000_purchase_order_amendments.sql', import.meta.url),
  'utf8'
);

test('the purchase order amendment migration does not rewrite existing rows', () => {
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.purchase_orders/i);
  assert.doesNotMatch(migrationSql, /UPDATE\s+purchase_orders/i);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS revision_no integer/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS amendment_reason text/);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.purchase_order_revisions/);
  assert.match(migrationSql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migrationSql, /purchase_orders','inventory'/);
});

test('existing purchase orders stay untouched and the history table is locked down', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.purchase_orders (
      id text PRIMARY KEY,
      po_number text UNIQUE NOT NULL,
      vendor_name text NOT NULL,
      total_amount numeric,
      status text
    );
    INSERT INTO public.purchase_orders (id, po_number, vendor_name, total_amount, status)
    VALUES ('SIL/PO/26-27/278', 'SIL/PO/26-27/278', 'Creative marketing', 286740, 'Pending Delivery');
  `);

  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const row = await db.query(`SELECT * FROM public.purchase_orders`);
  assert.equal(row.rows.length, 1);
  assert.equal(row.rows[0].po_number, 'SIL/PO/26-27/278');
  assert.equal(row.rows[0].vendor_name, 'Creative marketing');
  assert.equal(Number(row.rows[0].total_amount), 286740);
  assert.equal(row.rows[0].status, 'Pending Delivery');
  assert.equal(row.rows[0].revision_no, null);
  assert.equal(row.rows[0].amendment_no, null);
  assert.equal(row.rows[0].amended_at, null);
  assert.equal(row.rows[0].amended_by, null);
  assert.equal(row.rows[0].amendment_reason, null);

  const columns = await db.query(`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_orders'
      AND column_name IN ('revision_no', 'amendment_no', 'amended_at', 'amended_by', 'amendment_reason')
    ORDER BY column_name
  `);
  assert.equal(columns.rows.length, 5);
  assert.ok(columns.rows.every((column) => column.is_nullable === 'YES'));

  const rls = await db.query(`
    SELECT c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'purchase_order_revisions'
  `);
  assert.equal(rls.rows[0].relrowsecurity, true);

  const policies = await db.query(`
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'purchase_order_revisions'
  `);
  assert.deepEqual(policies.rows.map((policy) => policy.policyname), ['Allow anon and auth full access']);
});

test('a locked-down database grants revision history only through purchase order access', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA private;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE FUNCTION private.can_any(modules text[]) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE TABLE public.purchase_orders (id text PRIMARY KEY, po_number text);
  `);
  await db.exec(migrationSql);

  const policies = await db.query(`
    SELECT policyname, roles::text, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'purchase_order_revisions'
  `);
  assert.equal(policies.rows.length, 1);
  assert.equal(policies.rows[0].policyname, 'purchase_order_revisions_access');
  assert.match(policies.rows[0].qual, /purchase_orders/);
  assert.match(policies.rows[0].qual, /inventory/);
  assert.match(policies.rows[0].with_check, /private\.can_any/);
});
