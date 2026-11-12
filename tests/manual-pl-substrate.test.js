import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const scriptSql = fs.readFileSync(
  new URL('../supabase/manual/20261112_pl_2026_606130_substrate.sql', import.meta.url),
  'utf8'
);

function committedScript() {
  const replaced = scriptSql.replace(/\nROLLBACK;\s*$/, '\nCOMMIT;\n');
  assert.notEqual(replaced, scriptSql);
  assert.match(replaced, /COMMIT;/);
  assert.doesNotMatch(replaced, /ROLLBACK;/);
  return replaced;
}

async function createTables(db) {
  await db.exec(`
    CREATE TABLE public.job_masters (
      id text PRIMARY KEY,
      structure text,
      film_structure text,
      layers jsonb
    );
    CREATE TABLE public.dispatch_shipments (
      dispatch_id text PRIMARY KEY,
      items jsonb,
      payload jsonb,
      updated_at timestamptz
    );
  `);
}

test('the manual substrate script is scoped to one packing list and is not a migration', () => {
  assert.match(scriptSql, /PL-2026-606130/);
  assert.match(scriptSql, /JM-2026-538/);
  assert.match(scriptSql, /ROLLBACK;/);
  assert.match(scriptSql, /NOT a migration/);
  assert.match(scriptSql, /eamstsaqkbeiywfaanhi/);
  assert.match(scriptSql, /awtjvrhpoyzjwrfumhip/);
  const updates = scriptSql.match(/UPDATE\s+public\.dispatch_shipments/gi) || [];
  assert.equal(updates.length, 1);
  assert.match(scriptSql, /ds\.dispatch_id = 'PL-2026-606130'/);
});

test('filler rows on PL-2026-606130 take the job master structure and nothing else changes', async () => {
  const db = new PGlite();
  await createTables(db);
  const filler = 'Flexible Laminate';
  const spaced = 'Flexible   Laminate';
  const real = 'PET 12µ / METPET 12µ';
  const items = [
    { barcodeId: 'FG-DISP-606130-2', rollNo: 2, substrateSpec: filler, netWeightKg: 10, coreSize: '3 Inch' },
    { barcodeId: 'FG-KEEP', rollNo: 3, substrateSpec: real, netWeightKg: 11, coreSize: '3 Inch' },
    { barcodeId: 'FG-DISP-606130-23', rollNo: '23', substrateSpec: spaced, netWeightKg: 12, structure: filler },
  ];
  const payload = { dispatchId: 'PL-2026-606130', invoiceNo: 'keep-me', items };
  await db.query(
    `INSERT INTO public.job_masters (id, structure, film_structure, layers)
     VALUES ('JM-2026-538', 'PET 12µ / NMET 65µ', 'film column', '[]'::jsonb)`
  );
  await db.query(
    `INSERT INTO public.dispatch_shipments (dispatch_id, items, payload, updated_at)
     VALUES ('PL-2026-606130', $1::jsonb, $2::jsonb, '2026-11-01T00:00:00Z'),
            ('PL-2026-606137', $3::jsonb, $3::jsonb, '2026-11-01T00:00:00Z')`,
    [JSON.stringify(items), JSON.stringify(payload), JSON.stringify([{ barcodeId: 'OTHER', substrateSpec: filler, rollNo: 5 }])]
  );

  await db.exec(committedScript());

  const target = await db.query(`SELECT items, payload FROM public.dispatch_shipments WHERE dispatch_id = 'PL-2026-606130'`);
  const saved = target.rows[0].items;
  assert.equal(saved[0].substrateSpec, 'PET 12µ / NMET 65µ');
  assert.equal(saved[0].barcodeId, 'FG-DISP-606130-2');
  assert.equal(saved[0].rollNo, 2);
  assert.equal(saved[0].netWeightKg, 10);
  assert.equal(saved[0].coreSize, '3 Inch');
  assert.equal(saved[1].substrateSpec, real);
  assert.equal(saved[1].barcodeId, 'FG-KEEP');
  assert.equal(saved[2].substrateSpec, 'PET 12µ / NMET 65µ');
  assert.equal(saved[2].structure, 'PET 12µ / NMET 65µ');
  assert.equal(saved[2].rollNo, '23');
  assert.equal(target.rows[0].payload.invoiceNo, 'keep-me');
  assert.equal(target.rows[0].payload.items[0].substrateSpec, 'PET 12µ / NMET 65µ');
  assert.equal(target.rows[0].payload.items[1].substrateSpec, real);

  const other = await db.query(`SELECT items FROM public.dispatch_shipments WHERE dispatch_id = 'PL-2026-606137'`);
  assert.equal(other.rows[0].items[0].substrateSpec, filler);

  const report = await db.query(`SELECT section, detail FROM script_report ORDER BY ord`);
  assert.equal(report.rows.find((row) => row.section === 'job master structure').detail, 'PET 12µ / NMET 65µ');

  const beforeSecond = JSON.stringify(target.rows[0].items);
  await db.exec(committedScript());
  const afterSecond = await db.query(`SELECT items FROM public.dispatch_shipments WHERE dispatch_id = 'PL-2026-606130'`);
  assert.equal(JSON.stringify(afterSecond.rows[0].items), beforeSecond);
  const fillerLeft = await db.query(`
    SELECT count(*)::int AS n
    FROM public.dispatch_shipments ds,
      jsonb_array_elements(ds.items) item
    WHERE ds.dispatch_id = 'PL-2026-606130'
      AND lower(regexp_replace(btrim(item->>'substrateSpec'), '\\s+', ' ', 'g')) = 'flexible laminate'
  `);
  assert.equal(fillerLeft.rows[0].n, 0);
  await db.close();
});

test('layers win over the structure column, matching the job master screen', async () => {
  const db = new PGlite();
  await createTables(db);
  await db.query(
    `INSERT INTO public.job_masters (id, structure, layers)
     VALUES (
       'JM-2026-538',
       'OLD COLUMN',
       '[{"filmType":"PET","micron":"12"},{"filmType":"NMET","micron":"65"}]'::jsonb
     )`
  );
  await db.query(
    `INSERT INTO public.dispatch_shipments (dispatch_id, items, payload)
     VALUES ('PL-2026-606130', $1::jsonb, jsonb_build_object('items', $1::jsonb))`,
    [JSON.stringify([{ barcodeId: 'FG-1', rollNo: 1, substrateSpec: 'Flexible Laminate' }])]
  );

  await db.exec(committedScript());

  const row = await db.query(`SELECT items FROM public.dispatch_shipments WHERE dispatch_id = 'PL-2026-606130'`);
  assert.equal(row.rows[0].items[0].substrateSpec, 'PET 12µ / NMET 65µ');
  assert.equal(row.rows[0].items[0].barcodeId, 'FG-1');
  await db.close();
});
