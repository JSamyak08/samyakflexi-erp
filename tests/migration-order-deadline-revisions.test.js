import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261030120000_order_deadline_revisions.sql', import.meta.url),
  'utf8'
);

test('the deadline migration does not rewrite existing orders or email anyone', () => {
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.orders/i);
  assert.doesNotMatch(migrationSql, /UPDATE\s+orders/i);
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.doesNotMatch(migrationSql, /send-email/i);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS original_deadline date/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS revised_deadline date/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS client_informed boolean/);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS public\.order_deadline_revisions/);
  assert.match(migrationSql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migrationSql, /orders','job_punching','sales','production_records','printing_scheduler'/);
  assert.match(migrationSql, /Plant Manager', 'Production Manager', 'Sales Manager'/);
});

test('existing orders stay untouched and the new columns are nullable', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      client_name text NOT NULL,
      target_delivery_date date,
      delivery_date date,
      status text
    );
    INSERT INTO public.orders (id, job_name, client_name, target_delivery_date, delivery_date, status)
    VALUES ('ORD-9', 'Atta 5kg', 'Sharma Traders', '2026-11-02', '2026-11-02', 'Scheduled');
  `);

  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const row = await db.query(`SELECT * FROM public.orders`);
  assert.equal(row.rows.length, 1);
  assert.equal(row.rows[0].id, 'ORD-9');
  assert.equal(row.rows[0].job_name, 'Atta 5kg');
  assert.equal(row.rows[0].status, 'Scheduled');
  assert.equal(row.rows[0].original_deadline, null);
  assert.equal(row.rows[0].revised_deadline, null);
  assert.equal(row.rows[0].deadline_revised_by, null);
  assert.equal(row.rows[0].client_informed, null);

  const columns = await db.query(`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND column_name IN (
        'original_deadline', 'revised_deadline', 'deadline_revised_at', 'deadline_revised_by',
        'deadline_revision_reason', 'client_informed', 'client_informed_at', 'client_informed_by'
      )
    ORDER BY column_name
  `);
  assert.equal(columns.rows.length, 8);
  assert.ok(columns.rows.every((column) => column.is_nullable === 'YES'));

  const rls = await db.query(`
    SELECT c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'order_deadline_revisions'
  `);
  assert.equal(rls.rows[0].relrowsecurity, true);

  const policies = await db.query(`
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_deadline_revisions'
  `);
  assert.deepEqual(policies.rows.map((policy) => policy.policyname), ['Allow anon and auth full access']);
});

test('a locked-down database limits deadline history to order access and the commercial roles', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA private;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE FUNCTION private.can_any(modules text[]) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION private.has_role(allowed text[]) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      target_delivery_date date,
      delivery_date date
    );
    INSERT INTO public.orders (id, target_delivery_date, delivery_date)
    VALUES ('ORD-9', '2026-11-02', '2026-11-02');
  `);
  await db.exec(migrationSql);

  const policies = await db.query(`
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_deadline_revisions'
    ORDER BY policyname
  `);
  assert.deepEqual(policies.rows.map((policy) => policy.policyname), [
    'order_deadline_revisions_insert',
    'order_deadline_revisions_select',
  ]);
  const insert = policies.rows.find((policy) => policy.policyname === 'order_deadline_revisions_insert');
  assert.match(insert.with_check, /private\.has_role/);
  assert.match(insert.with_check, /printing_scheduler/);
  assert.equal(insert.cmd, 'INSERT');

  const trigger = await db.query(`
    SELECT tgname FROM pg_trigger
    WHERE tgname = 'orders_guard_deadline_columns' AND NOT tgisinternal
  `);
  assert.equal(trigger.rows.length, 1);

  await db.exec(`
    UPDATE public.orders
    SET revised_deadline = '2026-11-18', deadline_revised_by = 'Asha'
    WHERE id = 'ORD-9'
  `);
  const row = await db.query(`SELECT original_deadline, revised_deadline, target_delivery_date FROM public.orders`);
  assert.equal(row.rows[0].revised_deadline.toISOString().slice(0, 10), '2026-11-18');
  assert.equal(row.rows[0].original_deadline.toISOString().slice(0, 10), '2026-11-02');
  assert.equal(row.rows[0].target_delivery_date.toISOString().slice(0, 10), '2026-11-02');

  await db.exec(`
    UPDATE public.orders
    SET original_deadline = '2026-12-01', target_delivery_date = '2026-12-01'
    WHERE id = 'ORD-9'
  `);
  const frozen = await db.query(`SELECT original_deadline, target_delivery_date FROM public.orders`);
  assert.equal(frozen.rows[0].original_deadline.toISOString().slice(0, 10), '2026-11-02');
  assert.equal(frozen.rows[0].target_delivery_date.toISOString().slice(0, 10), '2026-12-01');

  await db.exec(`
    CREATE OR REPLACE FUNCTION private.has_role(allowed text[]) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT false $$;
  `);
  await db.exec(`UPDATE public.orders SET delivery_date = '2026-12-15' WHERE id = 'ORD-9'`);
  await assert.rejects(
    () => db.exec(`UPDATE public.orders SET revised_deadline = '2026-11-20' WHERE id = 'ORD-9'`),
    /Sales Manager/
  );
});
