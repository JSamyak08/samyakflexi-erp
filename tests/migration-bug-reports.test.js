import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261109140000_bug_reports.sql', import.meta.url),
  'utf8'
);

const PRESS = '11111111-1111-4111-8111-111111111111';
const PLANT = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const IDLE = '44444444-4444-4444-8444-444444444444';

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
      ('user-press', '${PRESS}', 'Flexi Print', 'forged-name', 'flexi.print@example.test', 'Printing Operator', 'Active', true, ARRAY['Printing Operator']),
      ('user-plant', '${PLANT}', 'Plant Lead', 'plant', 'plant.lead@example.test', 'Plant Manager', 'Active', true, ARRAY['Plant Manager']),
      ('user-admin', '${ADMIN}', 'Plant Admin', 'admin', 'admin@example.test', 'Plant Manager', 'Active', true, ARRAY['Plant Manager', 'Admin']),
      ('user-idle', '${IDLE}', 'Former Crew', 'idle', 'idle@example.test', 'Printing Operator', 'Inactive', false, ARRAY['Printing Operator']);
  `);
  await db.exec(migrationSql);
  await db.exec(migrationSql);
  return db;
}

async function fileReport(db, uid, pathSuffix = '1.png', description = LONG) {
  await db.exec(asUser(uid));
  await db.exec('SET ROLE authenticated');
  const saved = await db.query(
    `INSERT INTO public.bug_reports (description, page_url, screenshot_paths, severity, title, reporter_name, reporter_role)
     VALUES ($1, $2, $3, 'High', 'Queue blank', 'Admin', 'Admin')
     RETURNING id, reporter_auth_id, reporter_user_id, reporter_name, reporter_role, status, severity, title`,
    [description, 'https://erp.example.test/printing', [`${uid}/report/${pathSuffix}`]]
  );
  return saved.rows[0];
}

test('checks reject a short description, an empty link, and a report with no screenshot', async () => {
  const db = await database();
  await db.exec('ALTER TABLE public.bug_reports DISABLE TRIGGER bug_reports_stamp');
  const base = {
    auth: PRESS,
    user: 'user-press',
    name: 'Flexi Print',
    role: 'Printing Operator',
    description: LONG,
    url: 'https://erp.example.test/printing',
    shots: [`${PRESS}/report/1.png`],
  };
  async function insert(overrides) {
    const row = { ...base, ...overrides };
    return db.query(
      `INSERT INTO public.bug_reports (
         reporter_auth_id, reporter_user_id, reporter_name, reporter_role, description, page_url, screenshot_paths
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [row.auth, row.user, row.name, row.role, row.description, row.url, row.shots]
    );
  }
  await assert.rejects(insert({ description: 'too short' }), /bug_reports_description_len|check constraint/i);
  await assert.rejects(insert({ url: '   ' }), /bug_reports_page_url_nonempty|check constraint/i);
  await assert.rejects(insert({ shots: [] }), /bug_reports_screenshot_required|check constraint/i);
  const constraints = await db.query(`
    SELECT conname FROM pg_constraint
    WHERE conname IN (
      'bug_reports_description_len',
      'bug_reports_page_url_nonempty',
      'bug_reports_screenshot_required'
    )
    ORDER BY conname
  `);
  assert.deepEqual(constraints.rows.map((row) => row.conname), [
    'bug_reports_description_len',
    'bug_reports_page_url_nonempty',
    'bug_reports_screenshot_required',
  ]);
  await db.close();
});

test('an operator files their own report and cannot read or update someone else', async () => {
  const db = await database();
  const press = await fileReport(db, PRESS);
  assert.equal(press.reporter_name, 'Flexi Print');
  assert.equal(press.reporter_role, 'Printing Operator');
  assert.equal(press.reporter_user_id, 'user-press');
  assert.equal(press.reporter_auth_id, PRESS);
  assert.equal(press.status, 'New');
  assert.notEqual(press.reporter_name, 'Admin');

  const plant = await fileReport(db, PLANT, '1.jpg');
  assert.equal(plant.reporter_name, 'Plant Lead');

  await db.exec(asUser(PRESS));
  await db.exec('SET ROLE authenticated');
  const own = await db.query('SELECT id FROM public.bug_reports ORDER BY reporter_name');
  assert.deepEqual(own.rows.map((row) => row.id), [press.id]);

  const updated = await db.query(
    `UPDATE public.bug_reports SET status = 'Resolved', resolution_note = 'no' WHERE id = $1 RETURNING id`,
    [press.id]
  );
  assert.equal(updated.rows.length, 0);
  const stillNew = await db.query('SELECT status FROM public.bug_reports WHERE id = $1', [press.id]);
  assert.equal(stillNew.rows[0].status, 'New');

  await assert.rejects(
    db.query(
      `INSERT INTO public.bug_reports (description, page_url, screenshot_paths)
       VALUES ($1, 'https://erp.example.test/printing', $2)`,
      [LONG, [`${PLANT}/report/1.png`]]
    ),
    /Screenshots must be stored under your account/
  );

  await db.exec(asUser(IDLE));
  await assert.rejects(
    db.query(
      `INSERT INTO public.bug_reports (description, page_url, screenshot_paths)
       VALUES ($1, 'https://erp.example.test/printing', $2)`,
      [LONG, [`${IDLE}/report/1.png`]]
    ),
    /cannot report bugs/
  );

  await db.exec('SET ROLE anon');
  await assert.rejects(db.query('SELECT id FROM public.bug_reports'), /permission denied/i);
  await assert.rejects(
    db.query(
      `INSERT INTO public.bug_reports (description, page_url, screenshot_paths)
       VALUES ($1, 'https://erp.example.test/printing', $2)`,
      [LONG, [`${PRESS}/report/2.png`]]
    ),
    /permission denied/i
  );
  await db.close();
});

test('admin reads every report, changes status, and cannot rewrite the description', async () => {
  const db = await database();
  const press = await fileReport(db, PRESS);
  await db.exec(asUser(ADMIN));
  await db.exec('SET ROLE authenticated');
  const all = await db.query('SELECT id, reporter_name FROM public.bug_reports');
  assert.equal(all.rows.length, 1);
  const saved = await db.query(
    `UPDATE public.bug_reports
        SET status = 'In Progress',
            resolution_note = 'Looking at the press queue',
            description = 'forged description that must not stick'
      WHERE id = $1
      RETURNING status, description, resolution_note, reporter_name`,
    [press.id]
  );
  assert.equal(saved.rows[0].status, 'In Progress');
  assert.equal(saved.rows[0].resolution_note, 'Looking at the press queue');
  assert.equal(saved.rows[0].description, LONG);
  assert.equal(saved.rows[0].reporter_name, 'Flexi Print');

  const resolved = await db.query(
    `UPDATE public.bug_reports SET status = 'Won''t Fix' WHERE id = $1 RETURNING status, resolved_at`,
    [press.id]
  );
  assert.equal(resolved.rows[0].status, "Won't Fix");
  assert.ok(resolved.rows[0].resolved_at);
  await db.close();
});

test('screenshot storage is private to the owner and to admin', async () => {
  const db = await database();
  const bucket = await db.query(`SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'bug-screenshots'`);
  assert.equal(bucket.rows[0].public, false);
  assert.equal(Number(bucket.rows[0].file_size_limit), 5242880);
  assert.deepEqual(bucket.rows[0].allowed_mime_types, ['image/png', 'image/jpeg', 'image/webp']);

  await db.exec(asUser(PRESS));
  await db.exec('SET ROLE authenticated');
  await db.query(
    `INSERT INTO storage.objects (bucket_id, name) VALUES ('bug-screenshots', $1)`,
    [`${PRESS}/report/1.png`]
  );
  await assert.rejects(
    db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('bug-screenshots', $1)`, [`${PLANT}/report/1.png`]),
    /row-level security|violates/i
  );
  await db.exec(asUser(PLANT));
  await db.query(
    `INSERT INTO storage.objects (bucket_id, name) VALUES ('bug-screenshots', $1)`,
    [`${PLANT}/report/1.jpg`]
  );
  const plantSees = await db.query(`SELECT name FROM storage.objects ORDER BY name`);
  assert.deepEqual(plantSees.rows.map((row) => row.name), [`${PLANT}/report/1.jpg`]);

  await db.exec(asUser(ADMIN));
  const adminSees = await db.query(`SELECT name FROM storage.objects ORDER BY name`);
  assert.equal(adminSees.rows.length, 2);

  await db.exec('SET ROLE anon');
  const anonSees = await db.query('SELECT name FROM storage.objects');
  assert.equal(anonSees.rows.length, 0);
  await db.close();
});
