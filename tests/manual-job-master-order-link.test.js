import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const script = fs.readFileSync(
  new URL('../supabase/manual/20261118_link_orders_to_job_master_by_name.sql', import.meta.url),
  'utf8'
);

function lastStatement(sql) {
  const parts = sql.split(';').map((part) => part.replace(/--[^\n]*/g, '').trim()).filter(Boolean);
  return parts[parts.length - 1];
}

test('the link-up script previews candidates and rolls back unless someone changes the ending', () => {
  assert.match(script, /PREVIEW/);
  assert.match(script, /BEGIN;/);
  assert.equal(lastStatement(script), 'ROLLBACK');
  assert.match(script, /candidate_count > 1 THEN 'ambiguous — excluded'/);
  assert.match(script, /unique — will link/);
  assert.match(script, /job_master_id/);
  assert.match(script, /split_part\(o\.job_name, ' \|\|\| ', 1\)/);
  assert.doesNotMatch(script, /eamstsaqkbeiywfaanhi/);
  assert.doesNotMatch(script, /COMMIT;/);
});

async function seeded() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.job_masters (
      id text PRIMARY KEY,
      job_name text NOT NULL
    );
    CREATE TABLE public.orders (
      id text PRIMARY KEY,
      job_name text NOT NULL,
      status text,
      job_master_id text,
      job_details jsonb
    );
    INSERT INTO public.job_masters (id, job_name) VALUES
      ('JM-A', 'Biscuits 50g'),
      ('JM-B', 'Shared Name'),
      ('JM-C', 'Shared Name');
    INSERT INTO public.orders (id, job_name, status, job_master_id, job_details) VALUES
      (
        'ORD-UNIQUE',
        'Biscuits 50g ||| {"jobDetails":{"structure":"PET 12"},"raw_material_requirements":[]}',
        'In Progress',
        NULL,
        '{"structure":"PET 12"}'::jsonb
      ),
      ('ORD-AMB', 'Shared Name', 'In Production', NULL, '{}'::jsonb),
      ('ORD-DONE', 'Biscuits 50g', 'Completed', NULL, '{}'::jsonb),
      ('ORD-SHIP', 'Biscuits 50g', 'Dispatched', NULL, '{}'::jsonb),
      ('ORD-LINKED', 'Biscuits 50g', 'On Hold', 'JM-OLD', '{}'::jsonb),
      ('ORD-OTHER', 'No Such Job', 'Confirmed', NULL, '{}'::jsonb);
  `);
  return db;
}

test('the preview shows the unique id and excludes ambiguous matches', async () => {
  const db = await seeded();
  const preview = script.slice(script.indexOf('WITH order_names'), script.indexOf('-- APPLY')).trim();
  const result = await db.query(preview);
  const unique = result.rows.find((row) => row.order_id === 'ORD-UNIQUE');
  assert.equal(unique.job_name, 'Biscuits 50g');
  assert.equal(unique.proposed_job_master_id, 'JM-A');
  assert.equal(Number(unique.candidate_count), 1);
  assert.equal(unique.decision, 'unique — will link');

  const ambiguous = result.rows.filter((row) => row.order_id === 'ORD-AMB');
  assert.equal(ambiguous.length, 2);
  assert.deepEqual(ambiguous.map((row) => row.proposed_job_master_id).sort(), ['JM-B', 'JM-C']);
  assert.ok(ambiguous.every((row) => row.decision === 'ambiguous — excluded'));
  assert.equal(Number(ambiguous[0].candidate_count), 2);

  assert.equal(result.rows.some((row) => row.order_id === 'ORD-DONE'), false);
  assert.equal(result.rows.some((row) => row.order_id === 'ORD-SHIP'), false);
  assert.equal(result.rows.some((row) => row.order_id === 'ORD-LINKED'), false);
  assert.equal(result.rows.some((row) => row.order_id === 'ORD-OTHER'), false);
});

test('applying the transaction links only the unique active order and keeps the envelope', async () => {
  const db = await seeded();
  const apply = script
    .slice(script.indexOf('BEGIN;'))
    .replace(/ROLLBACK;\s*$/, 'COMMIT;');
  await db.exec(apply);
  const rows = await db.query(`SELECT id, job_master_id, job_name, job_details->>'jobMasterId' AS details_id FROM public.orders ORDER BY id`);
  const byId = Object.fromEntries(rows.rows.map((row) => [row.id, row]));
  assert.equal(byId['ORD-UNIQUE'].job_master_id, 'JM-A');
  assert.equal(byId['ORD-UNIQUE'].details_id, 'JM-A');
  const envelope = JSON.parse(byId['ORD-UNIQUE'].job_name.split(' ||| ')[1]);
  assert.equal(envelope.jobDetails.jobMasterId, 'JM-A');
  assert.equal(envelope.raw_material_requirements.length, 0);
  assert.equal(byId['ORD-AMB'].job_master_id, null);
  assert.equal(byId['ORD-DONE'].job_master_id, null);
  assert.equal(byId['ORD-SHIP'].job_master_id, null);
  assert.equal(byId['ORD-LINKED'].job_master_id, 'JM-OLD');
  assert.equal(byId['ORD-OTHER'].job_master_id, null);
});
