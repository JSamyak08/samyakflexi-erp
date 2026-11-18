import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261118120000_structure_change_notices.sql', import.meta.url),
  'utf8'
);

test('the structure notice migration is additive and does not rewrite orders', () => {
  const names = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const previous = '20261116130000_allocate_ocn_and_quotation_numbers.sql';
  assert.ok(names.includes(previous));
  assert.ok(names.includes('20261118120000_structure_change_notices.sql'));
  assert.ok(names.indexOf('20261118120000_structure_change_notices.sql') > names.indexOf(previous));
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.orders/i);
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.doesNotMatch(migrationSql, /send-email|nodemailer|smtp/i);
  assert.match(migrationSql, /STRUCTURE_CHANGED/);
  assert.match(migrationSql, /record_structure_change_notice/);
  assert.match(migrationSql, /Store Manager/);
  assert.match(migrationSql, /Purchase Manager/);
  assert.match(migrationSql, /Sales Manager/);
});

test('a job-master editor can record the notice and the audience roles can read it', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA private;
    CREATE SCHEMA auth;
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT '11111111-1111-1111-1111-111111111111'::uuid $$;
    CREATE FUNCTION private.can_any(modules text[]) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION private.has_role(allowed text[]) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.record_audit_log(p_action_type text, p_module text, p_details text, p_target_id text)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE TABLE public.erp_notifications (
      id text PRIMARY KEY,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.erp_notifications ENABLE ROW LEVEL SECURITY;
  `);
  await db.exec(migrationSql);

  const policies = await db.query(`
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'erp_notifications'
      AND policyname = 'erp_notifications_structure_changed'
  `);
  assert.equal(policies.rows.length, 1);
  assert.equal(policies.rows[0].cmd, 'ALL');
  assert.match(policies.rows[0].qual, /STRUCTURE_CHANGED/);
  assert.match(policies.rows[0].qual, /Purchase Manager/);
  assert.match(policies.rows[0].with_check, /Store Manager/);
  assert.doesNotMatch(policies.rows[0].qual, /Printing Operator/);
  assert.doesNotMatch(policies.rows[0].qual, /QC Chemist/);

  const saved = await db.query(`
    SELECT public.record_structure_change_notice(
      'STRUCT-1',
      '{"message":"PET 12 changed","jobMasterId":"JM-1","read":false}'::jsonb
    ) AS payload
  `);
  assert.equal(saved.rows[0].payload.type, 'STRUCTURE_CHANGED');
  assert.equal(saved.rows[0].payload.jobMasterId, 'JM-1');
  const row = await db.query(`SELECT payload->>'type' AS type FROM public.erp_notifications WHERE id = 'STRUCT-1'`);
  assert.equal(row.rows[0].type, 'STRUCTURE_CHANGED');

  await db.exec(`
    CREATE OR REPLACE FUNCTION private.can_any(modules text[]) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE OR REPLACE FUNCTION private.has_role(allowed text[]) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT false $$;
  `);
  await assert.rejects(
    () => db.query(`SELECT public.record_structure_change_notice('STRUCT-2', '{}'::jsonb)`),
    /cannot record a structure change notice/
  );
});
