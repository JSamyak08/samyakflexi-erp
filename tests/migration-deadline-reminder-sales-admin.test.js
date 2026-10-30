import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261030190000_deadline_reminder_sales_admin.sql', import.meta.url),
  'utf8'
);

test('the sales-admin deadline migration does not rewrite orders or widen the role list', () => {
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.orders/i);
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.doesNotMatch(migrationSql, /Plant Manager/);
  assert.doesNotMatch(migrationSql, /Production Manager/);
  assert.match(migrationSql, /private\.has_role\(ARRAY\['Sales Manager'\]\)/);
  assert.match(migrationSql, /Only Admin or Sales Manager can revise an order deadline/);
  assert.match(migrationSql, /NEW\.client_informed := NULL/);
  assert.match(migrationSql, /DROP POLICY IF EXISTS order_deadline_revisions_insert/);
});

test('plant and production can no longer change a deadline, and a new date still clears client informed', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA private;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE private.session_role (role text);
    INSERT INTO private.session_role (role) VALUES ('Plant Manager');
    CREATE FUNCTION private.has_role(allowed text[]) RETURNS boolean
    LANGUAGE sql STABLE AS $$
      SELECT (SELECT role FROM private.session_role LIMIT 1) = 'Admin'
          OR (SELECT role FROM private.session_role LIMIT 1) = ANY (allowed)
    $$;
    CREATE FUNCTION private.can_any(modules text[]) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      target_delivery_date date,
      delivery_date date,
      original_deadline date,
      revised_deadline date,
      deadline_revised_at timestamptz,
      deadline_revised_by text,
      deadline_revision_reason text,
      client_informed boolean,
      client_informed_at timestamptz,
      client_informed_by text
    );
    CREATE TABLE public.order_deadline_revisions (id text PRIMARY KEY);
    INSERT INTO public.orders (id, target_delivery_date, delivery_date, revised_deadline, client_informed, client_informed_by)
    VALUES ('ORD-9', '2026-10-31', '2026-10-31', '2026-10-31', true, 'Plant');
  `);

  await db.exec(migrationSql);

  const definition = await db.query(`SELECT pg_get_functiondef('private.guard_order_deadline_columns()'::regprocedure) AS def`);
  assert.doesNotMatch(definition.rows[0].def, /Plant Manager/);
  assert.doesNotMatch(definition.rows[0].def, /Production Manager/);
  assert.match(definition.rows[0].def, /Sales Manager/);

  const policy = await db.query(`
    SELECT with_check FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_deadline_revisions' AND policyname = 'order_deadline_revisions_insert'
  `);
  assert.match(policy.rows[0].with_check, /Sales Manager/);
  assert.doesNotMatch(policy.rows[0].with_check, /Plant Manager/);
  assert.doesNotMatch(policy.rows[0].with_check, /Production Manager/);

  await assert.rejects(
    () => db.exec(`UPDATE public.orders SET revised_deadline = '2026-11-02' WHERE id = 'ORD-9'`),
    /Sales Manager/
  );

  await db.exec(`UPDATE private.session_role SET role = 'Production Manager'`);
  await assert.rejects(
    () => db.exec(`UPDATE public.orders SET client_informed = false WHERE id = 'ORD-9'`),
    /Sales Manager/
  );

  await db.exec(`UPDATE private.session_role SET role = 'Sales Manager'`);
  await db.exec(`
    UPDATE public.orders
    SET revised_deadline = '2026-11-02', client_informed = true, client_informed_by = 'Sales'
    WHERE id = 'ORD-9'
  `);
  const sales = await db.query(`
    SELECT revised_deadline, client_informed, client_informed_by, original_deadline, target_delivery_date
    FROM public.orders
  `);
  assert.equal(sales.rows[0].revised_deadline.toISOString().slice(0, 10), '2026-11-02');
  assert.equal(sales.rows[0].client_informed, null);
  assert.equal(sales.rows[0].client_informed_by, null);
  assert.equal(sales.rows[0].original_deadline.toISOString().slice(0, 10), '2026-10-31');
  assert.equal(sales.rows[0].target_delivery_date.toISOString().slice(0, 10), '2026-10-31');

  await db.exec(`UPDATE public.orders SET client_informed = true, client_informed_by = 'Sales' WHERE id = 'ORD-9'`);
  await db.exec(`UPDATE private.session_role SET role = 'Admin'`);
  await db.exec(`UPDATE public.orders SET deadline_revision_reason = 'Agreed on WhatsApp' WHERE id = 'ORD-9'`);
  const admin = await db.query(`SELECT client_informed, deadline_revision_reason FROM public.orders`);
  assert.equal(admin.rows[0].client_informed, true);
  assert.equal(admin.rows[0].deadline_revision_reason, 'Agreed on WhatsApp');
});
