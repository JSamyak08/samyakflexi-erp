import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  buildApprovedSalaryAdvance,
  buildDisbursedSalaryAdvance,
  isPayrollRecoverableAdvance,
  salaryAdvancePrimaryAction,
  toSalaryAdvanceRow,
} from '../src/services/salaryAdvance.js';

const migrationSql = fs.readFileSync(
  new URL('../supabase/migrations/20261024120000_salary_advance_stages.sql', import.meta.url),
  'utf8',
);
const upsertFixSql = fs.readFileSync(
  new URL('../supabase/migrations/20261024140000_salary_advance_upsert_stage.sql', import.meta.url),
  'utf8',
);

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Same statement PostgREST sends for supabase.from('salary_advances').upsert(row, { onConflict: 'id' }).
async function upsertAdvance(db, adv) {
  const row = toSalaryAdvanceRow(adv, { updatedAt: '2026-10-24T13:14:10.000Z' });
  const cols = Object.keys(row);
  const values = cols.map((col) => sqlLiteral(row[col]));
  const assignments = cols.filter((col) => col !== 'id').map((col) => `${col} = EXCLUDED.${col}`);
  await db.exec(`
    INSERT INTO public.salary_advances (${cols.join(', ')})
    VALUES (${values.join(', ')})
    ON CONFLICT (id) DO UPDATE SET ${assignments.join(', ')}
  `);
}

function requestedAdvance(id, employeeId, employeeName) {
  return {
    id,
    employeeId,
    employeeName,
    department: 'Printing',
    requestDate: '2026-10-24',
    advanceAmount: 8000,
    repaymentTenureMonths: 4,
    monthlyEmiAmount: 2000,
    reason: 'Salary Advance Request',
    status: 'Requested',
    approvedBy: '',
    approvedDate: '',
    disbursedDate: '',
    disbursedBy: '',
    paymentReference: '',
    policyOverride: false,
    totalRecoveredAmount: 0,
    remainingBalance: 8000,
    deductionHistory: [],
  };
}

const ADMIN_UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HR_UID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function rejects(db, sql, pattern) {
  return assert.rejects(() => db.exec(sql), pattern);
}

async function prepare(db) {
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE SCHEMA IF NOT EXISTS public;
    CREATE TABLE public.auth_uid_holder (id int PRIMARY KEY, uid uuid);
    INSERT INTO public.auth_uid_holder (id, uid) VALUES (1, '${ADMIN_UID}');
    CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public
    AS $$ SELECT uid FROM public.auth_uid_holder WHERE id = 1 $$;

    CREATE TABLE public.test_actor (
      id int PRIMARY KEY,
      role text,
      is_verified_admin boolean
    );
    INSERT INTO public.test_actor (id, role, is_verified_admin)
    VALUES (1, 'HR & Payroll Manager', false);

    CREATE TABLE public.users (
      id text PRIMARY KEY,
      auth_user_id uuid,
      username text,
      full_name text,
      role text,
      active boolean,
      status text
    );
    INSERT INTO public.users (id, auth_user_id, full_name, role, active, status) VALUES
      ('user-admin', '${ADMIN_UID}', 'Samyak Jain', 'Admin', true, 'Active'),
      ('user-hr', '${HR_UID}', 'Payroll Lead', 'HR & Payroll Manager', true, 'Active');

    CREATE FUNCTION private.app_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public
    AS $$ SELECT role FROM public.test_actor WHERE id = 1 $$;
    CREATE FUNCTION private.has_role(allowed text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT (SELECT role FROM public.test_actor WHERE id = 1) = 'Admin'
          OR (SELECT role FROM public.test_actor WHERE id = 1) = ANY (allowed);
    $$;
    CREATE FUNCTION private.caller_is_verified_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT coalesce(is_verified_admin, false) FROM public.test_actor WHERE id = 1;
    $$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
    END $$;

    GRANT USAGE ON SCHEMA public TO authenticated, service_role;
    GRANT USAGE ON SCHEMA private TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION private.app_role() TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION private.has_role(text[]) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION private.caller_is_verified_admin() TO authenticated, service_role;

    CREATE TABLE public.salary_advances (
      id text PRIMARY KEY,
      employee_id text,
      employee_name text,
      department text,
      request_date date,
      advance_amount numeric,
      repayment_tenure_months numeric,
      monthly_emi_amount numeric,
      reason text,
      status text DEFAULT 'Pending Approval',
      approved_by text,
      approved_date text,
      disbursed_date text,
      total_recovered_amount numeric DEFAULT 0,
      remaining_balance numeric DEFAULT 0,
      deduction_history jsonb DEFAULT '[]'::jsonb
    );

    INSERT INTO public.salary_advances (
      id, employee_id, employee_name, status, advance_amount, remaining_balance,
      total_recovered_amount, disbursed_date, deduction_history, approved_by
    ) VALUES
      ('ADV-OPEN', 'EMP-1', 'Open Loan', 'Approved & Disbursed', 10000, 10000, 0, '2026-10-24', '[]'::jsonb, 'Samyak Jain'),
      ('ADV-PART', 'EMP-2', 'Partial', 'Approved & Disbursed', 10000, 5000, 5000, '2026-09-26', '[{"paymentRef":""}]'::jsonb, 'Samyak Jain'),
      ('ADV-REF', 'EMP-3', 'Referenced', 'Approved & Disbursed', 8000, 3000, 5000, '2026-09-26', '[{"paymentRef":"UTR-REAL-1"}]'::jsonb, 'Samyak Jain'),
      ('ADV-DONE', 'EMP-4', 'Settled', 'Fully Recovered', 2000, 0, 2000, '2026-09-26', '[{"paymentRef":""}]'::jsonb, 'Samyak Jain'),
      ('ADV-PEND', 'EMP-5', 'Waiting', 'Pending Approval', 1000, 1000, 0, NULL, '[]'::jsonb, '');
  `);
}

async function actAs(db, who) {
  await db.exec('RESET ROLE');
  if (who === 'admin') {
    await db.exec(`UPDATE public.test_actor SET role = 'Admin', is_verified_admin = true WHERE id = 1`);
    await db.exec(`UPDATE public.auth_uid_holder SET uid = '${ADMIN_UID}' WHERE id = 1`);
  } else if (who === 'hr') {
    await db.exec(`UPDATE public.test_actor SET role = 'HR & Payroll Manager', is_verified_admin = false WHERE id = 1`);
    await db.exec(`UPDATE public.auth_uid_holder SET uid = '${HR_UID}' WHERE id = 1`);
  } else if (who === 'plant') {
    await db.exec(`UPDATE public.test_actor SET role = 'Plant Manager', is_verified_admin = false WHERE id = 1`);
  } else if (who === 'admin-unverified') {
    await db.exec(`UPDATE public.test_actor SET role = 'Admin', is_verified_admin = false WHERE id = 1`);
    await db.exec(`UPDATE public.auth_uid_holder SET uid = '${ADMIN_UID}' WHERE id = 1`);
  }
  await db.exec('SET ROLE authenticated');
}

test('migration rewrites legacy advance statuses without dropping rows', async () => {
  const db = new PGlite();
  try {
    await prepare(db);
    await db.exec(migrationSql);
    await db.exec(migrationSql);

    const rows = await db.query(`
      SELECT id, status, payment_reference, disbursed_date, total_recovered_amount, remaining_balance
      FROM public.salary_advances
      ORDER BY id
    `);
    const byId = Object.fromEntries(rows.rows.map((row) => [row.id, row]));
    assert.equal(rows.rows.length, 5);
    assert.equal(byId['ADV-OPEN'].status, 'Approved');
    assert.equal(byId['ADV-OPEN'].payment_reference, null);
    assert.equal(byId['ADV-OPEN'].disbursed_date, '2026-10-24');
    assert.equal(Number(byId['ADV-OPEN'].remaining_balance), 10000);

    assert.equal(byId['ADV-PART'].status, 'Disbursed');
    assert.equal(byId['ADV-PART'].payment_reference, 'LEGACY-ADV-PART');
    assert.equal(Number(byId['ADV-PART'].total_recovered_amount), 5000);

    assert.equal(byId['ADV-REF'].status, 'Disbursed');
    assert.equal(byId['ADV-REF'].payment_reference, 'UTR-REAL-1');

    assert.equal(byId['ADV-DONE'].status, 'Fully Recovered');
    assert.equal(byId['ADV-DONE'].payment_reference, null);
    assert.equal(Number(byId['ADV-DONE'].remaining_balance), 0);

    assert.equal(byId['ADV-PEND'].status, 'Requested');

    const trigger = await db.query(`
      SELECT tgname FROM pg_trigger
      WHERE tgname = 'salary_advances_stage_guard' AND NOT tgisinternal
    `);
    assert.equal(trigger.rows.length, 1);
  } finally {
    await db.close();
  }
});

test('server allows only Requested -> Approved -> Disbursed, and only Admin can override', async () => {
  const db = new PGlite();
  try {
    await prepare(db);
    await db.exec(migrationSql);
    await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_advances TO authenticated, service_role');

    await actAs(db, 'plant');
    await rejects(
      db,
      `INSERT INTO public.salary_advances (id, employee_id, employee_name, status, advance_amount, remaining_balance)
       VALUES ('ADV-PLANT', 'EMP-9', 'Plant', 'Requested', 100, 100)`,
      /Only payroll approvers can record a salary advance/,
    );

    await actAs(db, 'hr');
    await rejects(
      db,
      `INSERT INTO public.salary_advances (id, employee_id, employee_name, status, advance_amount, remaining_balance)
       VALUES ('ADV-SKIP', 'EMP-9', 'Neha', 'Approved & Disbursed', 1500, 1500)`,
      /must start as Requested/,
    );
    await db.exec(`
      INSERT INTO public.salary_advances (id, employee_id, employee_name, status, advance_amount, monthly_emi_amount, remaining_balance)
      VALUES ('ADV-HR', 'EMP-9', 'Neha', 'Requested', 1500, 1500, 1500)
    `);
    await db.exec(`UPDATE public.salary_advances SET status = 'Approved' WHERE id = 'ADV-HR'`);
    await rejects(
      db,
      `UPDATE public.salary_advances SET status = 'Disbursed' WHERE id = 'ADV-HR'`,
      /payment reference is required/,
    );
    await db.exec(`
      UPDATE public.salary_advances
      SET status = 'Disbursed', payment_reference = 'UTR-1', disbursed_date = '2026-10-24'
      WHERE id = 'ADV-HR'
    `);

    await rejects(
      db,
      `INSERT INTO public.salary_advances (id, employee_id, employee_name, status, advance_amount, remaining_balance)
       VALUES ('ADV-HR-2', 'EMP-9', 'Neha', 'Requested', 500, 500)`,
      /unsettled advance cannot receive a new advance request/,
    );

    await actAs(db, 'admin');
    await rejects(
      db,
      `INSERT INTO public.salary_advances (id, employee_id, employee_name, status, advance_amount, remaining_balance, policy_override)
       VALUES ('ADV-ADM-2', 'EMP-9', 'Neha', 'Requested', 500, 500, true)`,
      /policy override cannot be set when the advance is requested/,
    );
    await db.exec(`
      INSERT INTO public.salary_advances (id, employee_id, employee_name, status, advance_amount, remaining_balance)
      VALUES ('ADV-ADM-2', 'EMP-9', 'Neha', 'Requested', 500, 500)
    `);

    await actAs(db, 'hr');
    await rejects(
      db,
      `UPDATE public.salary_advances SET status = 'Approved', policy_override = true WHERE id = 'ADV-ADM-2'`,
      /Only an Admin can approve a salary advance while a previous advance is unsettled/,
    );

    await actAs(db, 'admin');
    await rejects(
      db,
      `UPDATE public.salary_advances SET status = 'Approved', policy_override = false WHERE id = 'ADV-ADM-2'`,
      /must record a policy override/,
    );

    await actAs(db, 'admin-unverified');
    await rejects(
      db,
      `UPDATE public.salary_advances SET status = 'Approved', policy_override = true WHERE id = 'ADV-ADM-2'`,
      /Only an Admin can approve/,
    );

    await actAs(db, 'admin');
    await db.exec(`UPDATE public.salary_advances SET status = 'Approved', policy_override = true WHERE id = 'ADV-ADM-2'`);
    const approved = await db.query(`
      SELECT status, approved_by, policy_override, policy_override_by, policy_override_at, payment_reference, disbursed_date
      FROM public.salary_advances WHERE id = 'ADV-ADM-2'
    `);
    assert.equal(approved.rows[0].status, 'Approved');
    assert.equal(approved.rows[0].approved_by, 'Samyak Jain');
    assert.equal(approved.rows[0].policy_override, true);
    assert.equal(approved.rows[0].policy_override_by, 'Samyak Jain');
    assert.ok(approved.rows[0].policy_override_at);
    assert.equal(approved.rows[0].payment_reference, null);
    assert.equal(approved.rows[0].disbursed_date, null);

    await actAs(db, 'hr');
    await rejects(
      db,
      `UPDATE public.salary_advances SET status = 'Disbursed', payment_reference = '   ' WHERE id = 'ADV-ADM-2'`,
      /payment reference is required/,
    );
    await db.exec(`
      UPDATE public.salary_advances
      SET status = 'Disbursed', payment_reference = 'UTR-99', disbursed_date = '2026-10-24'
      WHERE id = 'ADV-ADM-2'
    `);
    const disbursed = await db.query(`
      SELECT status, payment_reference, disbursed_by, policy_override_by
      FROM public.salary_advances WHERE id = 'ADV-ADM-2'
    `);
    assert.equal(disbursed.rows[0].status, 'Disbursed');
    assert.equal(disbursed.rows[0].payment_reference, 'UTR-99');
    assert.equal(disbursed.rows[0].disbursed_by, 'Payroll Lead');
    assert.equal(disbursed.rows[0].policy_override_by, 'Samyak Jain');

    await db.exec(`
      UPDATE public.salary_advances
      SET remaining_balance = 200, total_recovered_amount = 300, payment_reference = NULL
      WHERE id = 'ADV-ADM-2'
    `);
    const keptRef = await db.query(`SELECT payment_reference, status FROM public.salary_advances WHERE id = 'ADV-ADM-2'`);
    assert.equal(keptRef.rows[0].status, 'Disbursed');
    assert.equal(keptRef.rows[0].payment_reference, 'UTR-99');

    await rejects(
      db,
      `UPDATE public.salary_advances SET status = 'Approved' WHERE id = 'ADV-ADM-2'`,
      /can only move forward/,
    );
    await rejects(
      db,
      `UPDATE public.salary_advances SET status = 'Fully Recovered', remaining_balance = 200 WHERE id = 'ADV-ADM-2'`,
      /balance is zero/,
    );
    await db.exec(`
      UPDATE public.salary_advances
      SET status = 'Fully Recovered', remaining_balance = 0, total_recovered_amount = 500
      WHERE id = 'ADV-ADM-2'
    `);
    const settled = await db.query(`SELECT status, payment_reference FROM public.salary_advances WHERE id = 'ADV-ADM-2'`);
    assert.equal(settled.rows[0].status, 'Fully Recovered');
    assert.equal(settled.rows[0].payment_reference, 'UTR-99');

    await db.exec(`
      UPDATE public.salary_advances
      SET status = 'Fully Recovered', remaining_balance = 0, total_recovered_amount = 1500
      WHERE id = 'ADV-HR'
    `);
    await db.exec(`
      INSERT INTO public.salary_advances (id, employee_id, employee_name, status, advance_amount, remaining_balance)
      VALUES ('ADV-AFTER', 'EMP-9', 'Neha', 'Requested', 700, 700)
    `);
    await db.exec(`UPDATE public.salary_advances SET status = 'Approved' WHERE id = 'ADV-AFTER'`);
    const plain = await db.query(`
      SELECT status, policy_override, approved_by FROM public.salary_advances WHERE id = 'ADV-AFTER'
    `);
    assert.equal(plain.rows[0].status, 'Approved');
    assert.equal(plain.rows[0].policy_override, false);
    assert.equal(plain.rows[0].approved_by, 'Payroll Lead');

    await rejects(
      db,
      `UPDATE public.salary_advances SET policy_override = true WHERE id = 'ADV-AFTER'`,
      /only be recorded when an Admin approves/,
    );

    await db.exec('RESET ROLE');
    await db.exec('SET ROLE service_role');
    await db.exec(`
      INSERT INTO public.salary_advances (id, employee_id, employee_name, status, advance_amount, remaining_balance, payment_reference)
      VALUES ('ADV-SERVICE', 'EMP-8', 'Service', 'Disbursed', 50, 50, 'SVC-1')
    `);
    const serviceRow = await db.query(`SELECT status FROM public.salary_advances WHERE id = 'ADV-SERVICE'`);
    assert.equal(serviceRow.rows[0].status, 'Disbursed');
  } finally {
    await db.close();
  }
});

test('screen upsert approves and disburses a normal advance and an override advance', async () => {
  const db = new PGlite();
  try {
    await prepare(db);
    await db.exec(migrationSql);
    await db.exec(upsertFixSql);
    await db.exec(upsertFixSql);
    await db.exec('ALTER TABLE public.salary_advances ADD COLUMN IF NOT EXISTS updated_at timestamptz');
    await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_advances TO authenticated, service_role');

    const sibling = {
      id: 'ADV-OLD',
      employeeId: 'EMP-9',
      status: 'Disbursed',
      advanceAmount: 10000,
      remainingBalance: 4000,
    };
    await db.exec('RESET ROLE');
    await db.exec('SET ROLE service_role');
    await db.exec(`
      INSERT INTO public.salary_advances (
        id, employee_id, employee_name, status, advance_amount, remaining_balance,
        monthly_emi_amount, payment_reference, total_recovered_amount
      ) VALUES (
        'ADV-OLD', 'EMP-9', 'Neha', 'Disbursed', 10000, 4000, 2500, 'LEGACY-ADV-OLD', 6000
      )
    `);

    await actAs(db, 'hr');
    const normalRequest = requestedAdvance('ADV-NORMAL', 'EMP-20', 'Asha');
    await upsertAdvance(db, normalRequest);
    const normalApproved = buildApprovedSalaryAdvance(normalRequest, {
      withOverride: false,
      actorName: 'Browser Name',
      approvedDate: '2026-10-24',
    });
    assert.equal(salaryAdvancePrimaryAction(normalRequest, [normalRequest], 'HR & Payroll Manager'), 'approve');
    await upsertAdvance(db, normalApproved);
    const normalRow = await db.query(`
      SELECT status, policy_override, approved_by, payment_reference
      FROM public.salary_advances WHERE id = 'ADV-NORMAL'
    `);
    assert.equal(normalRow.rows[0].status, 'Approved');
    assert.equal(normalRow.rows[0].policy_override, false);
    assert.equal(normalRow.rows[0].approved_by, 'Payroll Lead');
    assert.equal(normalRow.rows[0].payment_reference, null);
    assert.equal(salaryAdvancePrimaryAction(
      { ...normalApproved, status: 'Approved', policyOverride: false },
      [{ ...normalApproved, status: 'Approved' }],
      'HR & Payroll Manager',
    ), 'disburse');
    assert.equal(salaryAdvancePrimaryAction(
      { ...normalApproved, status: 'Approved', policyOverride: false },
      [{ ...normalApproved, status: 'Approved' }],
      'Admin',
    ), 'disburse');

    await rejects(
      db,
      `INSERT INTO public.salary_advances (id, employee_id, status, advance_amount, remaining_balance, payment_reference)
       VALUES ('ADV-NORMAL', 'EMP-20', 'Disbursed', 8000, 8000, 'placeholder')
       ON CONFLICT (id) DO UPDATE SET status = 'Disbursed', payment_reference = '   '`,
      /payment reference is required/,
    );

    await actAs(db, 'admin');
    const normalDisbursed = buildDisbursedSalaryAdvance(
      { ...normalApproved, status: 'Approved', policyOverride: false },
      { paymentReference: ' UTR-NORMAL ', disbursedDate: '2026-10-24', disbursedBy: 'Browser Name' },
    );
    assert.equal(normalDisbursed.status, 'Disbursed');
    assert.equal(toSalaryAdvanceRow(normalDisbursed).status, 'Disbursed');
    assert.equal(toSalaryAdvanceRow(normalDisbursed).payment_reference, 'UTR-NORMAL');
    await upsertAdvance(db, normalDisbursed);
    const normalPaid = await db.query(`
      SELECT status, payment_reference, disbursed_by, policy_override, remaining_balance, monthly_emi_amount
      FROM public.salary_advances WHERE id = 'ADV-NORMAL'
    `);
    assert.equal(normalPaid.rows[0].status, 'Disbursed');
    assert.equal(normalPaid.rows[0].payment_reference, 'UTR-NORMAL');
    assert.equal(normalPaid.rows[0].disbursed_by, 'Samyak Jain');
    assert.equal(normalPaid.rows[0].policy_override, false);
    assert.equal(isPayrollRecoverableAdvance({
      status: normalPaid.rows[0].status,
      remainingBalance: normalPaid.rows[0].remaining_balance,
      monthlyEmiAmount: normalPaid.rows[0].monthly_emi_amount,
    }), true);

    await actAs(db, 'admin');
    const nextRequest = requestedAdvance('ADV-NEXT', 'EMP-9', 'Neha');
    await upsertAdvance(db, nextRequest);
    assert.equal(salaryAdvancePrimaryAction(nextRequest, [sibling, nextRequest], 'Admin'), 'approve-override');
    assert.equal(salaryAdvancePrimaryAction(nextRequest, [sibling, nextRequest], 'HR & Payroll Manager'), 'awaiting-admin');

    const overrideApproved = buildApprovedSalaryAdvance(nextRequest, {
      withOverride: true,
      actorName: 'Browser Name',
      approvedDate: '2026-10-24',
      overrideAt: '2020-01-01T00:00:00.000Z',
    });
    await actAs(db, 'hr');
    await assert.rejects(
      () => upsertAdvance(db, overrideApproved),
      /Only an Admin can approve a salary advance while a previous advance is unsettled/,
    );

    await actAs(db, 'admin');
    await upsertAdvance(db, overrideApproved);
    const overrideRow = await db.query(`
      SELECT status, policy_override, policy_override_by, policy_override_at, payment_reference, approved_by
      FROM public.salary_advances WHERE id = 'ADV-NEXT'
    `);
    assert.equal(overrideRow.rows[0].status, 'Approved');
    assert.equal(overrideRow.rows[0].policy_override, true);
    assert.equal(overrideRow.rows[0].policy_override_by, 'Samyak Jain');
    assert.equal(overrideRow.rows[0].approved_by, 'Samyak Jain');
    assert.ok(overrideRow.rows[0].policy_override_at);
    assert.notEqual(new Date(overrideRow.rows[0].policy_override_at).toISOString(), '2020-01-01T00:00:00.000Z');
    assert.equal(overrideRow.rows[0].payment_reference, null);
    const storedOverrideAt = overrideRow.rows[0].policy_override_at;

    const approvedForUi = {
      ...overrideApproved,
      status: 'Approved',
      policyOverride: true,
      policyOverrideBy: overrideRow.rows[0].policy_override_by,
      policyOverrideAt: storedOverrideAt,
    };
    assert.equal(salaryAdvancePrimaryAction(approvedForUi, [sibling, approvedForUi], 'Admin'), 'disburse');
    assert.equal(salaryAdvancePrimaryAction(approvedForUi, [sibling, approvedForUi], 'HR & Payroll Manager'), 'disburse');

    await upsertAdvance(db, {
      ...approvedForUi,
      policyOverrideBy: 'Browser Name',
      policyOverrideAt: '2020-01-01T00:00:00.000Z',
    });
    const replayed = await db.query(`
      SELECT status, policy_override_by, policy_override_at FROM public.salary_advances WHERE id = 'ADV-NEXT'
    `);
    assert.equal(replayed.rows[0].status, 'Approved');
    assert.equal(replayed.rows[0].policy_override_by, 'Samyak Jain');

    await actAs(db, 'hr');
    const overrideDisbursed = buildDisbursedSalaryAdvance({
      ...approvedForUi,
      policyOverrideBy: 'Browser Name',
      policyOverrideAt: '2020-01-01T00:00:00.000Z',
    }, {
      paymentReference: '  UTR-OVERRIDE  ',
      disbursedDate: '2026-10-24',
      disbursedBy: 'Browser Name',
    });
    assert.equal(overrideDisbursed.status, 'Disbursed');
    assert.equal(toSalaryAdvanceRow(overrideDisbursed).status, 'Disbursed');
    await upsertAdvance(db, overrideDisbursed);
    await upsertAdvance(db, overrideDisbursed);
    const overridePaid = await db.query(`
      SELECT status, payment_reference, disbursed_by, approved_by, policy_override, policy_override_by, policy_override_at,
             remaining_balance, monthly_emi_amount
      FROM public.salary_advances WHERE id = 'ADV-NEXT'
    `);
    assert.equal(overridePaid.rows[0].status, 'Disbursed');
    assert.equal(overridePaid.rows[0].payment_reference, 'UTR-OVERRIDE');
    assert.equal(overridePaid.rows[0].disbursed_by, 'Payroll Lead');
    assert.equal(overridePaid.rows[0].approved_by, 'Samyak Jain');
    assert.equal(overridePaid.rows[0].policy_override, true);
    assert.equal(overridePaid.rows[0].policy_override_by, 'Samyak Jain');
    assert.equal(
      new Date(overridePaid.rows[0].policy_override_at).toISOString(),
      new Date(storedOverrideAt).toISOString(),
    );
    assert.equal(isPayrollRecoverableAdvance({
      status: overridePaid.rows[0].status,
      remainingBalance: overridePaid.rows[0].remaining_balance,
    }), true);

    await actAs(db, 'admin');
    await assert.rejects(
      () => upsertAdvance(db, {
        ...requestedAdvance('ADV-SKIP', 'EMP-3', 'Ravi'),
        status: 'Disbursed',
        paymentReference: 'UTR-SKIP',
      }),
      /must start as Requested/,
    );
    await assert.rejects(
      () => upsertAdvance(db, {
        ...normalDisbursed,
        policyOverride: true,
      }),
      /only be recorded when an Admin approves/,
    );
  } finally {
    await db.close();
  }
});
