import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261030223000_printing_deadline_alerts.sql', import.meta.url),
  'utf8'
);

test('the printing deadline migration is newer than the assigned-roles migration and does not rewrite orders', () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const latestBefore = '20261030210000_user_assigned_roles.sql';
  assert.ok(names.includes(latestBefore));
  assert.ok(names.includes('20261030223000_printing_deadline_alerts.sql'));
  assert.ok(names.indexOf('20261030223000_printing_deadline_alerts.sql') > names.indexOf(latestBefore));
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.orders/i);
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.match(migrationSql, /printing_deadline_lead_days/);
  assert.match(migrationSql, /PRINTING_DEADLINE_SUMMARY/);
  assert.match(migrationSql, /private\.has_role\(ARRAY\['Sales Manager'\]\)/);
  assert.match(migrationSql, /private\.has_role\(ARRAY\['Admin'\]\)/);
});

test('lead time writes are admin-only and sales can store deadline notices', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA private;
    CREATE ROLE authenticated;
    CREATE TABLE private.session_role (role text);
    INSERT INTO private.session_role (role) VALUES ('Sales Manager');
    CREATE FUNCTION private.has_role(allowed text[]) RETURNS boolean
    LANGUAGE sql STABLE AS $$
      SELECT (SELECT role FROM private.session_role LIMIT 1) = 'Admin'
          OR (SELECT role FROM private.session_role LIMIT 1) = ANY (allowed)
    $$;
    CREATE TABLE public.system_settings (
      setting_key text PRIMARY KEY,
      setting_value text,
      updated_at timestamptz
    );
    CREATE TABLE public.erp_notifications (
      id text PRIMARY KEY,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.erp_notifications ENABLE ROW LEVEL SECURITY;
  `);

  await db.exec(migrationSql);

  const lead = await db.query(`
    SELECT policyname, cmd, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'system_settings'
      AND policyname LIKE 'system_settings_printing_lead_%'
    ORDER BY policyname
  `);
  assert.equal(lead.rows.length, 2);
  assert.match(lead.rows[0].with_check, /printing_deadline_lead_days/);
  assert.match(lead.rows[0].with_check, /Admin/);
  assert.equal(lead.rows.map((row) => row.cmd).sort().join(','), 'INSERT,UPDATE');

  const notices = await db.query(`
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'erp_notifications'
      AND policyname = 'erp_notifications_printing_deadline'
  `);
  assert.equal(notices.rows.length, 1);
  assert.equal(notices.rows[0].cmd, 'ALL');
  assert.match(notices.rows[0].qual, /PRINTING_DEADLINE_STAGE/);
  assert.match(notices.rows[0].with_check, /PRINTING_DEADLINE_SUMMARY/);
  assert.match(notices.rows[0].with_check, /Sales Manager/);
  assert.doesNotMatch(notices.rows[0].with_check, /Plant Manager/);
  assert.doesNotMatch(notices.rows[0].with_check, /Production Manager/);
});
