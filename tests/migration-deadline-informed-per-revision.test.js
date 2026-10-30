import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261030163000_deadline_informed_per_revision.sql', import.meta.url),
  'utf8'
);

test('the per-revision follow-up does not rewrite existing orders', () => {
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.orders/i);
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.match(migrationSql, /NEW\.revised_deadline IS DISTINCT FROM OLD\.revised_deadline/);
  assert.match(migrationSql, /NEW\.client_informed := NULL/);
});

test('replacing the earlier guard clears client informed when the revised date changes', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA private;
    CREATE FUNCTION private.has_role(allowed text[]) RETURNS boolean
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
    INSERT INTO public.orders (id, target_delivery_date, delivery_date, revised_deadline, client_informed, client_informed_by)
    VALUES ('ORD-9', '2026-10-31', '2026-10-31', '2026-10-31', true, 'Asha');
  `);
  await db.exec(`
    CREATE OR REPLACE FUNCTION private.guard_order_deadline_columns()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $body$
    BEGIN
      IF NOT coalesce(private.has_role(ARRAY['Plant Manager', 'Production Manager', 'Sales Manager']), false) THEN
        RAISE EXCEPTION 'role';
      END IF;
      RETURN NEW;
    END;
    $body$;
    CREATE TRIGGER orders_guard_deadline_columns
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION private.guard_order_deadline_columns();
  `);

  await db.exec(migrationSql);

  await db.exec(`
    UPDATE public.orders
    SET revised_deadline = '2026-11-02', client_informed = true, client_informed_by = 'Asha'
    WHERE id = 'ORD-9'
  `);
  const row = await db.query(`
    SELECT revised_deadline, client_informed, client_informed_by, client_informed_at, target_delivery_date
    FROM public.orders
  `);
  assert.equal(row.rows[0].revised_deadline.toISOString().slice(0, 10), '2026-11-02');
  assert.equal(row.rows[0].client_informed, null);
  assert.equal(row.rows[0].client_informed_by, null);
  assert.equal(row.rows[0].client_informed_at, null);
  assert.equal(row.rows[0].target_delivery_date.toISOString().slice(0, 10), '2026-10-31');
});
