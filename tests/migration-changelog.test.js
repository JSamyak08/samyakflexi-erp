import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const bugSql = fs.readFileSync(
  new URL('../supabase/migrations/20261109140000_bug_reports.sql', import.meta.url),
  'utf8'
);
const changelogSql = fs.readFileSync(
  new URL('../supabase/migrations/20261110130000_bug_resolve_and_changelog.sql', import.meta.url),
  'utf8'
);

const PRESS = '11111111-1111-4111-8111-111111111111';
const PLANT = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const STORE = '55555555-5555-4555-8555-555555555555';
const PROD = '66666666-6666-4666-8666-666666666666';
const FORGED = '77777777-7777-4777-8777-777777777777';
const LONG = 'I started the press, expected the queue to open, and the screen stayed blank.';

function asUser(uid) {
  return `SELECT set_config('request.jwt.claim.sub', '${uid}', false)`;
}

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.users (
      id text PRIMARY KEY,
      auth_user_id uuid,
      full_name text,
      username text,
      email text,
      role text,
      status text,
      active boolean,
      assigned_roles text[]
    );
    CREATE OR REPLACE FUNCTION private.app_roles()
    RETURNS text[]
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = ''
    AS $$
      SELECT COALESCE((
        SELECT ARRAY(
          SELECT DISTINCT candidate
          FROM (
            SELECT u.role AS candidate
            UNION ALL
            SELECT unnest(coalesce(u.assigned_roles, ARRAY[]::text[]))
          ) AS raw(candidate)
          WHERE candidate IS NOT NULL AND btrim(candidate) <> ''
        )
        FROM public.users AS u
        WHERE (u.auth_user_id = auth.uid() OR (u.auth_user_id IS NULL AND u.id = auth.uid()::text))
          AND coalesce(u.active, true) = true
          AND lower(coalesce(u.status, 'Active')) = 'active'
        LIMIT 1
      ), ARRAY[]::text[]);
    $$;
    GRANT EXECUTE ON FUNCTION private.app_roles() TO authenticated;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      public boolean DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    CREATE TABLE storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text,
      name text
    );
    CREATE OR REPLACE FUNCTION storage.foldername(name text)
    RETURNS text[]
    LANGUAGE sql
    IMMUTABLE
    AS $$
      SELECT CASE
        WHEN name IS NULL OR position('/' in name) = 0 THEN ARRAY[]::text[]
        ELSE string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
      END
    $$;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
    GRANT SELECT ON storage.buckets TO anon, authenticated;
    INSERT INTO public.users (id, auth_user_id, full_name, username, email, role, status, active, assigned_roles) VALUES
      ('user-press', '${PRESS}', 'Flexi Print', 'press', 'flexi.print@example.test', 'Printing Operator', 'Active', true, ARRAY['Printing Operator']),
      ('user-plant', '${PLANT}', 'Plant Lead', 'plant', 'plant.lead@example.test', 'Plant Manager', 'Active', true, ARRAY['Plant Manager']),
      ('user-admin', '${ADMIN}', 'Plant Admin', 'admin', 'admin@example.test', 'Admin', 'Active', true, ARRAY['Admin']),
      ('user-store', '${STORE}', 'Store Lead', 'store', 'store.lead@example.test', 'Store Manager', 'Active', true, ARRAY['Store Manager']),
      ('user-prod', '${PROD}', 'Prod Lead', 'prod', 'prod.lead@example.test', 'Production Manager', 'Active', true, ARRAY['Production Manager']);
  `);
  await db.exec(bugSql);
  await db.exec(changelogSql);
  await db.exec(changelogSql);
  return db;
}

async function fileReport(db, uid) {
  await db.exec(asUser(uid));
  await db.exec('SET ROLE authenticated');
  const saved = await db.query(
    `INSERT INTO public.bug_reports (description, page_url, screenshot_paths, severity, title)
     VALUES ($1, 'https://erp.example.test/printing', $2, 'High', 'Queue blank')
     RETURNING id, status, resolved_by, resolved_at`,
    [LONG, [`${uid}/report/1.png`]]
  );
  await db.exec('RESET ROLE');
  return saved.rows[0];
}

test('the migration names the seed count and keeps resolve fields server-owned', () => {
  assert.match(changelogSql, /-- seed count: 96/);
  assert.match(changelogSql, /ADD COLUMN IF NOT EXISTS resolved_by uuid/);
  assert.match(changelogSql, /Only an Admin can update a bug report/);
  assert.match(changelogSql, /NEW\.resolved_by := coalesce\(OLD\.resolved_by, v_uid\)/);
  assert.match(changelogSql, /NEW\.resolved_by := NULL/);
  const selectPolicy = changelogSql.slice(
    changelogSql.indexOf('POLICY changelog_entries_select'),
    changelogSql.indexOf('POLICY changelog_entries_insert')
  );
  assert.match(selectPolicy, /Admin/);
  assert.match(selectPolicy, /Production Manager/);
  const writes = changelogSql.slice(
    changelogSql.indexOf('POLICY changelog_entries_insert'),
    changelogSql.indexOf('INSERT INTO public.changelog_entries')
  );
  assert.match(writes, /Admin/);
  assert.equal(writes.includes('Production Manager'), false);
  assert.match(changelogSql, /'2026-11-09T12:48:54Z', 'Bug Fixed', 'Ready for dispatch'/);
  assert.match(changelogSql, /'2026-11-09T18:24:52Z', 'Bug Fixed', 'Cylinder cost and artwork'/);
  assert.match(changelogSql, /₹1\.80/);
  assert.match(changelogSql, /'2026-11-09T14:04:23Z', 'Added', 'In-app bug reports'/);
  assert.match(changelogSql, /'2026-11-09T14:32:11Z', 'Revised', 'Operator SFG view'/);
  assert.match(changelogSql, /'2026-11-09T18:24:58Z', 'Revised', 'Newest SFG and FG first'/);
  assert.match(changelogSql, /'2026-11-10T01:46:33Z', 'Revised', 'Report a Bug placement'/);
  assert.match(changelogSql, /'2026-11-10T05:13:00Z', 'Bug Fixed', 'Consume mass balance'/);
  assert.match(changelogSql, /'2026-11-10T06:59:31Z', 'Bug Fixed', 'Cylinder SKU allocation'/);
  assert.match(changelogSql, /'2026-11-10T07:05:04Z', 'Revised', 'SFG and FG store layout'/);
});

test('admin resolve stamps resolved_by and a reporter cannot change status', async () => {
  const db = await database();
  const press = await fileReport(db, PRESS);
  assert.equal(press.status, 'New');
  assert.equal(press.resolved_by, null);
  assert.equal(press.resolved_at, null);

  await db.exec(asUser(PRESS));
  await db.exec('SET ROLE authenticated');
  const blocked = await db.query(
    `UPDATE public.bug_reports SET status = 'Resolved', resolution_note = 'no' WHERE id = $1 RETURNING id`,
    [press.id]
  );
  assert.equal(blocked.rows.length, 0);
  await db.exec('RESET ROLE');

  await db.exec(asUser(ADMIN));
  await db.exec('SET ROLE authenticated');
  const resolved = await db.query(
    `UPDATE public.bug_reports
        SET status = 'Resolved',
            resolution_note = 'Queue selection is restored.',
            description = 'forged',
            resolved_by = $2
      WHERE id = $1
      RETURNING status, resolution_note, description, resolved_by, resolved_at`,
    [press.id, FORGED]
  );
  assert.equal(resolved.rows[0].status, 'Resolved');
  assert.equal(resolved.rows[0].resolution_note, 'Queue selection is restored.');
  assert.equal(resolved.rows[0].description, LONG);
  assert.equal(resolved.rows[0].resolved_by, ADMIN);
  assert.ok(resolved.rows[0].resolved_at);

  const kept = await db.query(
    `UPDATE public.bug_reports SET status = 'Resolved', resolution_note = 'Still fixed.', resolved_by = $2
      WHERE id = $1 RETURNING resolved_by, resolution_note`,
    [press.id, FORGED]
  );
  assert.equal(kept.rows[0].resolved_by, ADMIN);
  assert.equal(kept.rows[0].resolution_note, 'Still fixed.');

  const reopened = await db.query(
    `UPDATE public.bug_reports SET status = 'New' WHERE id = $1 RETURNING status, resolved_by, resolved_at`,
    [press.id]
  );
  assert.equal(reopened.rows[0].status, 'New');
  assert.equal(reopened.rows[0].resolved_by, null);
  assert.equal(reopened.rows[0].resolved_at, null);

  const wont = await db.query(
    `UPDATE public.bug_reports SET status = 'Won''t Fix' WHERE id = $1 RETURNING status, resolved_by, resolved_at`,
    [press.id]
  );
  assert.equal(wont.rows[0].status, "Won't Fix");
  assert.equal(wont.rows[0].resolved_by, ADMIN);
  assert.ok(wont.rows[0].resolved_at);

  await db.exec(asUser(PRESS));
  const seen = await db.query(
    'SELECT status, resolution_note FROM public.bug_reports WHERE id = $1',
    [press.id]
  );
  assert.equal(seen.rows[0].status, "Won't Fix");
  assert.equal(seen.rows[0].resolution_note, 'Still fixed.');
  await db.close();
});

test('changelog seed is idempotent and only Admin and Production Manager can read it', async () => {
  const db = await database();
  const seeded = await db.query('SELECT count(*)::int AS n FROM public.changelog_entries');
  assert.equal(seeded.rows[0].n, 96);
  const recent = await db.query(`
    SELECT pr_number, entry_type, implemented_at
    FROM public.changelog_entries
    WHERE pr_number IN (96, 97, 99, 100, 101, 102, 103, 104, 106)
    ORDER BY pr_number
  `);
  const byPr = Object.fromEntries(recent.rows.map((row) => [row.pr_number, row]));
  assert.equal(byPr[96].entry_type, 'Bug Fixed');
  assert.equal(new Date(byPr[96].implemented_at).toISOString(), '2026-11-09T12:48:54.000Z');
  assert.equal(byPr[97].entry_type, 'Bug Fixed');
  assert.equal(new Date(byPr[97].implemented_at).toISOString(), '2026-11-09T18:24:52.000Z');
  assert.equal(byPr[99].entry_type, 'Added');
  assert.equal(new Date(byPr[99].implemented_at).toISOString(), '2026-11-09T14:04:23.000Z');
  assert.equal(byPr[100].entry_type, 'Revised');
  assert.equal(byPr[101].entry_type, 'Revised');
  assert.equal(new Date(byPr[101].implemented_at).toISOString(), '2026-11-09T18:24:58.000Z');
  assert.equal(byPr[102].entry_type, 'Revised');
  assert.equal(new Date(byPr[102].implemented_at).toISOString(), '2026-11-10T01:46:33.000Z');
  assert.equal(byPr[103].entry_type, 'Bug Fixed');
  assert.equal(new Date(byPr[103].implemented_at).toISOString(), '2026-11-10T05:13:00.000Z');
  assert.equal(byPr[104].entry_type, 'Bug Fixed');
  assert.equal(new Date(byPr[104].implemented_at).toISOString(), '2026-11-10T06:59:31.000Z');
  assert.equal(byPr[106].entry_type, 'Revised');
  assert.equal(new Date(byPr[106].implemented_at).toISOString(), '2026-11-10T07:05:04.000Z');

  const newest = await db.query(`
    SELECT pr_number FROM public.changelog_entries
    ORDER BY implemented_at DESC
    LIMIT 1
  `);
  assert.equal(newest.rows[0].pr_number, 106);

  async function visibleCount(uid) {
    await db.exec(asUser(uid));
    await db.exec('SET ROLE authenticated');
    const rows = await db.query('SELECT id FROM public.changelog_entries');
    await db.exec('RESET ROLE');
    return rows.rows.length;
  }

  assert.equal(await visibleCount(PRESS), 0);
  assert.equal(await visibleCount(STORE), 0);
  assert.equal(await visibleCount(PLANT), 0);
  assert.equal(await visibleCount(PROD), 96);
  assert.equal(await visibleCount(ADMIN), 96);

  await db.exec(asUser(PROD));
  await db.exec('SET ROLE authenticated');
  await assert.rejects(
    db.query(`INSERT INTO public.changelog_entries (implemented_at, entry_type, title, description)
              VALUES (now(), 'Added', 'Not allowed', 'A production manager cannot write this.')`),
    /Only an Admin can change the changelog/
  );
  await db.exec('RESET ROLE');

  await db.exec(asUser(PRESS));
  await db.exec('SET ROLE authenticated');
  await assert.rejects(
    db.query(`INSERT INTO public.changelog_entries (implemented_at, entry_type, title, description)
              VALUES (now(), 'Bug Fixed', 'Not allowed', 'An operator cannot write this.')`),
    /Only an Admin can change the changelog/
  );
  await db.exec('RESET ROLE');

  await db.exec(asUser(ADMIN));
  await db.exec('SET ROLE authenticated');
  const added = await db.query(`
    INSERT INTO public.changelog_entries (implemented_at, entry_type, title, description, module)
    VALUES ('2026-11-10T06:00:00Z', 'Bug Fixed', 'Queue blank', 'The press queue stays selected.', 'Printing')
    RETURNING created_by, description
  `);
  assert.equal(added.rows[0].created_by, ADMIN);
  assert.equal(added.rows[0].description, 'The press queue stays selected.');
  const edited = await db.query(`
    UPDATE public.changelog_entries
       SET title = 'Queue stays selected', created_by = $1
     WHERE title = 'Queue blank'
     RETURNING title, created_by
  `, [FORGED]);
  assert.equal(edited.rows[0].title, 'Queue stays selected');
  assert.equal(edited.rows[0].created_by, ADMIN);
  const removed = await db.query(`DELETE FROM public.changelog_entries WHERE title = 'Queue stays selected' RETURNING id`);
  assert.equal(removed.rows.length, 1);
  await db.exec('RESET ROLE');

  await db.exec(asUser(PROD));
  await db.exec('SET ROLE authenticated');
  const prodDelete = await db.query(`DELETE FROM public.changelog_entries WHERE pr_number = 103 RETURNING id`);
  assert.equal(prodDelete.rows.length, 0);
  await db.exec('RESET ROLE');

  await db.exec('SET ROLE anon');
  await assert.rejects(db.query('SELECT id FROM public.changelog_entries'), /permission denied/i);
  await db.close();
});
