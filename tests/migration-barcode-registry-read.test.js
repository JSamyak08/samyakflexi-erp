import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261103041042_barcode_registry_delete_allowed_execute.sql', import.meta.url),
  'utf8'
);

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    GRANT USAGE ON SCHEMA private TO authenticated;

    CREATE OR REPLACE FUNCTION private.can_any(modules text[])
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $$ SELECT true $$;
    REVOKE ALL ON FUNCTION private.can_any(text[]) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION private.can_any(text[]) TO authenticated;

    CREATE OR REPLACE FUNCTION private.inventory_delete_allowed()
    RETURNS boolean
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $$
    BEGIN
      RETURN coalesce(private.can_any(ARRAY['inventory']::text[]), false);
    END;
    $$;
    REVOKE ALL ON FUNCTION private.inventory_delete_allowed() FROM PUBLIC;

    CREATE TABLE public.deleted_barcodes (
      barcode text PRIMARY KEY,
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
    ALTER TABLE public.deleted_barcodes ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON TABLE public.deleted_barcodes TO authenticated;
    CREATE POLICY deleted_barcodes_select ON public.deleted_barcodes
      FOR SELECT TO authenticated
      USING (
        private.inventory_delete_allowed()
        OR private.can_any(ARRAY['barcodes']::text[])
      );
    INSERT INTO public.deleted_barcodes (barcode, source_module, status)
    VALUES ('RM-KEEP', 'Raw material / GRN', 'Deleted');

    CREATE VIEW public.barcode_registry WITH (security_invoker = true) AS
    SELECT barcode, source_module, status
    FROM public.deleted_barcodes
    WHERE private.can_any(ARRAY['barcodes']::text[]);
    GRANT SELECT ON TABLE public.barcode_registry TO authenticated;
  `);
  return db;
}

test('authenticated cannot read barcode_registry until inventory_delete_allowed is executable', async () => {
  const db = await database();
  await assert.rejects(
    () => db.exec(`SET ROLE authenticated; SELECT barcode FROM public.barcode_registry;`),
    /permission denied for function inventory_delete_allowed/
  );
  await db.close();
});

test('the migration grants execute to authenticated and keeps anon closed', async () => {
  const db = await database();
  await db.exec(migrationSql);

  const flags = await db.query(`
    SELECT
      prosecdef AS security_definer,
      proconfig AS config,
      has_function_privilege('authenticated', 'private.inventory_delete_allowed()'::regprocedure, 'EXECUTE') AS authenticated_execute,
      has_function_privilege('anon', 'private.inventory_delete_allowed()'::regprocedure, 'EXECUTE') AS anon_execute
    FROM pg_proc
    WHERE proname = 'inventory_delete_allowed'
  `);
  assert.equal(flags.rows[0].security_definer, true);
  assert.match(String(flags.rows[0].config), /search_path=/);
  assert.equal(flags.rows[0].authenticated_execute, true);
  assert.equal(flags.rows[0].anon_execute, false);

  await db.exec(`SET ROLE authenticated`);
  const rows = await db.query(`SELECT barcode FROM public.barcode_registry`);
  assert.deepEqual(rows.rows.map(row => row.barcode), ['RM-KEEP']);
  await db.exec(`RESET ROLE`);
  await db.close();
});
