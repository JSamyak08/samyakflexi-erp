import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const oldMigration = fs.readFileSync(new URL('../supabase/migrations/20261110120000_cylinder_sku_allocation.sql', import.meta.url), 'utf8');
const newMigration = fs.readFileSync(new URL('../supabase/migrations/20261116120000_cylinder_sku_cross_prefix.sql', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../supabase/manual/20261112_renumber_shared_cylinder_codes.sql', import.meta.url), 'utf8');

function lastStatement(sql) {
  const parts = sql.split(';').map((part) => part.replace(/--[^\n]*/g, '').trim()).filter(Boolean);
  return parts[parts.length - 1];
}

test('the renumber script is a transaction that ends in ROLLBACK', () => {
  assert.match(script, /^BEGIN;/m);
  assert.equal(lastStatement(script), 'ROLLBACK');
  assert.match(script, /allocate_cylinder_sku\(1\)/);
  assert.match(script, /20261116120000_cylinder_sku_cross_prefix/);
  assert.match(script, /SKU-2026-514/);
  assert.match(script, /CYL-2026-0420/);
  assert.match(script, /cylinders\.sku/);
  assert.match(script, /job_masters\.sku_code/);
  assert.match(script, /job_masters\.cylinder_sku/);
  assert.match(script, /orders\.job_details/);
  assert.match(script, /order_confirmations\.payload/);
  assert.match(script, /job_card_specs/);
  assert.match(script, /production_records\.job_code/);
  assert.match(script, /sales_quotations\.items/);
  assert.match(script, /barcode_registry is a view/);
  assert.doesNotMatch(script, /eamstsaqkbeiywfaanhi/);
});

async function seeded() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.cylinders (
      id text PRIMARY KEY,
      sku text,
      job_name text NOT NULL,
      artwork_url text,
      press_marks jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.job_masters (
      id text PRIMARY KEY,
      sku_code text UNIQUE NOT NULL,
      cylinder_sku text,
      job_name text NOT NULL,
      client_name text NOT NULL DEFAULT 'Client',
      artwork_url text,
      press_marks jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      client_name text NOT NULL,
      job_details jsonb
    );
    CREATE TABLE public.order_confirmations (
      id text PRIMARY KEY,
      ocn_number text NOT NULL,
      job_name text,
      payload jsonb
    );
    CREATE TABLE public.job_datasheets (
      id text PRIMARY KEY,
      job_id text,
      job_name text NOT NULL,
      client_name text NOT NULL
    );
    CREATE TABLE public.production_schedules (
      id text PRIMARY KEY,
      order_id text NOT NULL,
      job_name text NOT NULL,
      client_name text NOT NULL,
      machine_id text NOT NULL
    );
    CREATE TABLE public.production_records (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      job_code text,
      notes text
    );
    CREATE TABLE public.sales_quotations (
      id text PRIMARY KEY,
      items jsonb,
      comments text
    );
    CREATE TABLE public.job_card_specs (
      id text PRIMARY KEY,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb
    );
  `);
  await db.exec(oldMigration);
  await db.exec(`
    INSERT INTO public.cylinders (id, sku, job_name, artwork_url, created_at) VALUES
      ('darshan', 'SKU-2026-514', 'Darshan Milk', 'https://files.example/SKU-2026-514-proof.png', '2026-11-12 05:12:00+00'),
      ('zain', 'SKU-CYL-514', 'Zain Corn', NULL, '2026-11-12 12:09:00+00'),
      ('old-420', 'CYL-2026-0420', 'Older 420', NULL, '2026-01-01 00:00:00+00'),
      ('new-420', 'SKU-2026-420', 'Newer 420', NULL, '2026-06-01 00:00:00+00'),
      ('cyl-421', 'CYL-2026-0421', 'Cyl 421', NULL, '2026-02-01 00:00:00+00'),
      ('sku-421', 'SKU-CYL-421', 'Sku 421', NULL, '2026-03-01 00:00:00+00'),
      ('cyl-425', 'CYL-2026-0425', 'Cyl 425', NULL, '2026-02-02 00:00:00+00'),
      ('sku-425', 'SKU-CYL-425', 'Sku 425', NULL, '2026-03-02 00:00:00+00'),
      ('cyl-426', 'CYL-2026-0426', 'Cyl 426', NULL, '2026-02-03 00:00:00+00'),
      ('sku-426', 'SKU-CYL-426', 'Sku 426', NULL, '2026-03-03 00:00:00+00'),
      ('cyl-427', 'CYL-2026-0427', 'Cyl 427', NULL, '2026-02-04 00:00:00+00'),
      ('sku-427', 'SKU-CYL-427', 'Sku 427', NULL, '2026-03-04 00:00:00+00'),
      ('cyl-428', 'CYL-2026-0428', 'Cyl 428', NULL, '2026-02-05 00:00:00+00'),
      ('sku-428', 'SKU-CYL-428', 'Sku 428', NULL, '2026-03-05 00:00:00+00');
    INSERT INTO public.job_masters (id, sku_code, cylinder_sku, job_name, created_at) VALUES
      ('JM-2026-569', 'SKU-2026-514', 'SKU-2026-514', 'Darshan ||| {"skuCode":"SKU-2026-514","artworkUrl":"https://files.example/SKU-2026-514-proof.png"}', '2026-11-12 05:12:00+00'),
      ('JM-2026-570', 'SKU-CYL-514', 'SKU-CYL-514', 'Zain Corn', '2026-11-12 12:09:00+00');
    INSERT INTO public.orders (id, job_name, client_name, job_details) VALUES
      ('ORD-1', 'Darshan ||| {"skuCode":"SKU-2026-514"}', 'Darshan', '{"skuCode":"SKU-2026-514","note":"keep SKU-2026-5140","cylinderDetails":{"sku":"SKU-2026-514"}}');
    INSERT INTO public.order_confirmations (id, ocn_number, job_name, payload) VALUES
      ('OCN-1', 'SIL/OCN/421', 'Cyl 425', '{"sku":"CYL-2026-0425"}');
    INSERT INTO public.job_datasheets (id, job_id, job_name, client_name) VALUES
      ('JDS-1', 'SKU-2026-514', 'Darshan datasheet', 'Darshan');
    INSERT INTO public.production_schedules (id, order_id, job_name, client_name, machine_id) VALUES
      ('SCH-1', 'ORD-1', 'SKU-2026-514', 'Darshan', 'MAC-1'),
      ('SCH-2', 'ORD-1', 'Job SKU-2026-514 extra', 'Darshan', 'MAC-1');
    INSERT INTO public.production_records (id, job_name, job_code, notes) VALUES
      ('REC-1', 'Cyl 421', 'CYL-2026-0421', 'uses CYL-2026-0421 on press');
    INSERT INTO public.sales_quotations (id, items, comments) VALUES
      ('QTN-1', '[{"cylinderSku":"CYL-2026-0426"}]', 'CYL-2026-0426 mentioned in a sentence');
    INSERT INTO public.job_card_specs (id, payload) VALUES
      ('jobcard_SKU-2026-514', '{"skuCode":"SKU-2026-514","artworkUrl":"https://files.example/SKU-2026-514-proof.png"}');
  `);
  await db.exec(newMigration);
  return db;
}

test('ROLLBACK leaves the shared codes where they are', async () => {
  const db = await seeded();
  await db.exec(script);
  const skus = await db.query(`SELECT sku FROM public.cylinders WHERE id = 'darshan'`);
  assert.equal(skus.rows[0].sku, 'SKU-2026-514');
  const spec = await db.query(`SELECT id FROM public.job_card_specs`);
  assert.equal(spec.rows[0].id, 'jobcard_SKU-2026-514');
  await db.close();
});

test('the script renumbers one side of each pair and a second run does nothing', async () => {
  const db = await seeded();
  const committed = script.replace(/ROLLBACK;\s*$/, 'COMMIT;');
  assert.equal(lastStatement(committed), 'COMMIT');
  await db.exec(committed);

  const mapping = await db.query(`
    SELECT shared_number, old_code, new_code, kept_code, detail
    FROM cylinder_sku_renumber_preview
    ORDER BY shared_number, old_code
  `);
  const byNumber = Object.fromEntries(mapping.rows.map((row) => [String(row.shared_number), row]));
  assert.equal(byNumber['514'].old_code, 'SKU-2026-514');
  assert.equal(byNumber['514'].kept_code, 'SKU-CYL-514');
  assert.equal(byNumber['514'].new_code, 'SKU-CYL-515');
  assert.equal(byNumber['420'].old_code, 'SKU-2026-420');
  assert.equal(byNumber['420'].kept_code, 'CYL-2026-0420');
  assert.match(byNumber['420'].detail, /SKU-2026 is newer and is renumbered/);
  assert.equal(byNumber['421'].old_code, 'CYL-2026-0421');
  assert.equal(byNumber['421'].kept_code, 'SKU-CYL-421');
  for (const number of ['425', '426', '427', '428']) {
    assert.equal(byNumber[number].old_code, `CYL-2026-0${number}`);
    assert.equal(byNumber[number].kept_code, `SKU-CYL-${number}`);
  }
  const newCodes = mapping.rows.map((row) => row.new_code);
  assert.equal(new Set(newCodes).size, 7);

  const darshan = await db.query(`SELECT sku, artwork_url FROM public.cylinders WHERE id = 'darshan'`);
  assert.equal(darshan.rows[0].sku, 'SKU-CYL-515');
  assert.equal(darshan.rows[0].artwork_url, 'https://files.example/SKU-2026-514-proof.png');
  const zain = await db.query(`SELECT sku FROM public.cylinders WHERE id = 'zain'`);
  assert.equal(zain.rows[0].sku, 'SKU-CYL-514');
  const older420 = await db.query(`SELECT sku FROM public.cylinders WHERE id = 'old-420'`);
  assert.equal(older420.rows[0].sku, 'CYL-2026-0420');

  const master = await db.query(`SELECT sku_code, cylinder_sku, job_name FROM public.job_masters WHERE id = 'JM-2026-569'`);
  assert.equal(master.rows[0].sku_code, 'SKU-CYL-515');
  assert.equal(master.rows[0].cylinder_sku, 'SKU-CYL-515');
  assert.match(master.rows[0].job_name, /^Darshan \|\|\| /);
  assert.match(master.rows[0].job_name, /SKU-CYL-515/);
  assert.match(master.rows[0].job_name, /SKU-2026-514-proof\.png/);

  const order = await db.query(`SELECT job_name, job_details FROM public.orders WHERE id = 'ORD-1'`);
  assert.match(order.rows[0].job_name, /SKU-CYL-515/);
  assert.equal(order.rows[0].job_details.skuCode, 'SKU-CYL-515');
  assert.equal(order.rows[0].job_details.cylinderDetails.sku, 'SKU-CYL-515');
  assert.equal(order.rows[0].job_details.note, 'keep SKU-2026-5140');

  const spec = await db.query(`SELECT id, payload FROM public.job_card_specs`);
  assert.equal(spec.rows[0].id, 'jobcard_SKU-CYL-515');
  assert.equal(spec.rows[0].payload.skuCode, 'SKU-CYL-515');
  assert.equal(spec.rows[0].payload.artworkUrl, 'https://files.example/SKU-2026-514-proof.png');

  const record = await db.query(`SELECT job_code, notes FROM public.production_records WHERE id = 'REC-1'`);
  assert.equal(record.rows[0].job_code, byNumber['421'].new_code);
  assert.equal(record.rows[0].notes, 'uses CYL-2026-0421 on press');

  const quote = await db.query(`SELECT items, comments FROM public.sales_quotations WHERE id = 'QTN-1'`);
  assert.equal(quote.rows[0].items[0].cylinderSku, byNumber['426'].new_code);
  assert.match(quote.rows[0].comments, /CYL-2026-0426 mentioned/);

  const sheet = await db.query(`SELECT job_id FROM public.job_datasheets WHERE id = 'JDS-1'`);
  assert.equal(sheet.rows[0].job_id, 'SKU-CYL-515');
  const schedules = await db.query(`SELECT id, job_name FROM public.production_schedules ORDER BY id`);
  assert.equal(schedules.rows.find((row) => row.id === 'SCH-1').job_name, 'SKU-CYL-515');
  assert.equal(schedules.rows.find((row) => row.id === 'SCH-2').job_name, 'Job SKU-2026-514 extra');

  const trigger = await db.query(`SELECT tgenabled FROM pg_trigger WHERE tgname = 'cylinders_guard_sku'`);
  assert.equal(trigger.rows[0].tgenabled, 'O');

  await db.exec(committed);
  const again = await db.query(`SELECT count(*)::int AS n FROM cylinder_sku_renumber_preview`);
  assert.equal(again.rows[0].n, 0);
  const still = await db.query(`SELECT sku FROM public.cylinders WHERE id IN ('darshan', 'zain', 'old-420') ORDER BY id`);
  assert.deepEqual(still.rows.map((row) => row.sku), ['SKU-CYL-515', 'CYL-2026-0420', 'SKU-CYL-514']);
  const noExtra = await db.query(`SELECT sku FROM public.cylinders WHERE sku = 'SKU-CYL-522'`);
  assert.equal(noExtra.rows.length, 0);

  await db.close();
});
