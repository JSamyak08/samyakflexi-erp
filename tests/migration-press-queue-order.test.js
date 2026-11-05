import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261105143000_press_queue_order_normalize.sql', import.meta.url),
  'utf8',
);

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE public.press_board (
      id text PRIMARY KEY,
      queue_order jsonb NOT NULL DEFAULT '[]'::jsonb,
      machine_assignments jsonb NOT NULL DEFAULT '{}'::jsonb,
      active_running_job jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.press_board (id, queue_order, machine_assignments, active_running_job)
    VALUES ('plant', '["A","B"]'::jsonb, '{"A":"MAC-1"}'::jsonb, '{"id":"RUN"}'::jsonb);
  `);
  await db.exec(migrationSql);
  return db;
}

test('the queue migration is additive and later than the inward QC migration', () => {
  assert.ok('20261105143000' > '20261105120000');
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION private\.normalize_press_queue/);
  assert.match(migrationSql, /BEFORE INSERT OR UPDATE OF queue_order/);
  assert.doesNotMatch(migrationSql, /DROP TABLE/);
  assert.doesNotMatch(migrationSql, /ALTER TABLE public\.press_board DROP/);
  assert.doesNotMatch(migrationSql, /UPDATE public\.press_board/);
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const ours = names.filter((name) => name.startsWith('20261105143000'));
  assert.deepEqual(ours, ['20261105143000_press_queue_order_normalize.sql']);
  assert.ok(names.at(-1).startsWith('20261105143000'));
});

test('the later queue save wins and the stored sequence stays unique and contiguous', async () => {
  const db = await database();
  await db.exec(`
    UPDATE public.press_board
    SET queue_order = '["B","A","A","","C",null,{"id":"nope"},"B"]'::jsonb
    WHERE id = 'plant';
  `);
  const first = await db.query(`SELECT queue_order, machine_assignments, active_running_job FROM public.press_board WHERE id = 'plant'`);
  assert.deepEqual(first.rows[0].queue_order, ['B', 'A', 'C']);
  assert.deepEqual(first.rows[0].machine_assignments, { A: 'MAC-1' });
  assert.deepEqual(first.rows[0].active_running_job, { id: 'RUN' });

  await db.exec(`
    UPDATE public.press_board
    SET queue_order = '["C","C","A","B","A"]'::jsonb
    WHERE id = 'plant';
  `);
  const second = await db.query(`SELECT queue_order FROM public.press_board WHERE id = 'plant'`);
  assert.deepEqual(second.rows[0].queue_order, ['C', 'A', 'B']);
  const sequence = second.rows[0].queue_order;
  assert.equal(new Set(sequence).size, sequence.length);
  sequence.forEach((id, index) => {
    assert.equal(sequence.indexOf(id), index);
    assert.equal(typeof id, 'string');
    assert.notEqual(id, '');
  });

  await db.exec(`
    UPDATE public.press_board
    SET machine_assignments = '{"A":"MAC-2"}'::jsonb
    WHERE id = 'plant';
  `);
  const kept = await db.query(`SELECT queue_order, machine_assignments FROM public.press_board WHERE id = 'plant'`);
  assert.deepEqual(kept.rows[0].queue_order, ['C', 'A', 'B']);
  assert.deepEqual(kept.rows[0].machine_assignments, { A: 'MAC-2' });
  await db.close();
});
