import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261021180000_persist_business_records.sql', import.meta.url),
  'utf8'
);

async function stubSchema(db) {
  await db.exec(`
    CREATE TABLE public.vendors (
      id text PRIMARY KEY,
      name text,
      category text,
      contact_person text,
      phone text,
      email text,
      gstin text,
      address text,
      rating numeric
    );
    CREATE TABLE public.sales_quotations (
      id text PRIMARY KEY,
      quotation_no text
    );
    CREATE TABLE public.dispatch_shipments (
      dispatch_id text PRIMARY KEY,
      job_name text NOT NULL DEFAULT '',
      client_name text NOT NULL DEFAULT ''
    );
    CREATE TABLE public.purchase_orders (
      id text PRIMARY KEY,
      po_number text UNIQUE,
      po_date date,
      delivery_date date,
      promised_delivery_date date,
      vendor_id text,
      vendor_name text,
      vendor_details jsonb,
      category text,
      items jsonb,
      total_qty_kg numeric,
      subtotal numeric,
      tax_amount numeric,
      total_amount numeric,
      payment_terms text,
      logistic_details text,
      notes text,
      remarks text,
      status text,
      source text,
      linked_order_id text,
      linked_order_name text,
      linked_requirements jsonb,
      created_by text
    );
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text,
      updated_at timestamptz
    );
    CREATE TABLE public.scrap_disposals (
      id text PRIMARY KEY,
      category text,
      qty_kg numeric,
      vendor text,
      ref_no text,
      disposed_date date,
      disposed_by text,
      notes text
    );
    CREATE TABLE public.audit_logs (
      id text PRIMARY KEY,
      username text,
      user_role text,
      action_type text,
      module text,
      details text,
      target_id text,
      created_at timestamptz
    );
    INSERT INTO public.system_settings (setting_key, setting_value) VALUES
      ('purchase_orders', '[{"id":"PO-SET-1","poNumber":"PO-SET-1","poDate":"2026-10-01","vendorName":"Settings Vendor","items":[]},{"id":"PO-SET-1","poNumber":"PO-SET-1","vendorName":"Duplicate"}]'),
      ('material_indents', '[{"id":"IND-9","item":"PET"}]'),
      ('audit_logs', '[{"id":"LOG-1","username":"Store","actionType":"CREATE","module":"Inventory","details":"GRN","timestamp":"2026-10-01T00:00:00Z"}]');
    INSERT INTO public.purchase_orders (id, po_number, po_date, vendor_name)
      VALUES ('PO-LIVE', 'PO-LIVE', '2026-09-01', 'Live Vendor');
  `);
}

test('business-record migration copies settings once and drops its helpers', async () => {
  const db = new PGlite();
  await stubSchema(db);
  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const columns = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendors'
      AND column_name IN ('payment_terms', 'bank_details')
  `);
  assert.equal(columns.rows.length, 2);

  const orders = await db.query(`SELECT id, po_number, vendor_name FROM public.purchase_orders ORDER BY po_number`);
  assert.deepEqual(orders.rows.map((row) => row.po_number), ['PO-LIVE', 'PO-SET-1']);
  assert.equal(orders.rows.find((row) => row.po_number === 'PO-LIVE').vendor_name, 'Live Vendor');

  const indents = await db.query(`SELECT id, payload->>'item' AS item FROM public.material_indents`);
  assert.equal(indents.rows.length, 1);
  assert.equal(indents.rows[0].item, 'PET');

  const pellets = await db.query(`
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('pellet_inwards', 'pellet_consumptions', 'press_board')
    ORDER BY c.relname
  `);
  assert.equal(pellets.rows.length, 3);
  assert.equal(pellets.rows.every((row) => row.relrowsecurity === true), true);

  const helpers = await db.query(`
    SELECT proname FROM pg_proc
    WHERE proname IN ('_flexi_parse_setting', '_flexi_copy_payload_array', '_flexi_insert_po')
  `);
  assert.equal(helpers.rows.length, 0);

  const settings = await db.query(`SELECT count(*)::int AS n FROM public.system_settings`);
  assert.equal(settings.rows[0].n, 3);
  await db.close();
});
