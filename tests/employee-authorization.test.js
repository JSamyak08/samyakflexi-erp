import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SYSTEM_ROLES } from '../src/roles.js';
import {
  buildApprovedSalaryAdvance,
  buildDisbursedSalaryAdvance,
  canDecideEmployeeAuthorization,
  salaryAdvancePrimaryAction,
  toSalaryAdvanceRow,
} from '../src/services/salaryAdvance.js';

const stagesSql = fs.readFileSync(
  new URL('../supabase/migrations/20261024120000_salary_advance_stages.sql', import.meta.url),
  'utf8'
);
const upsertSql = fs.readFileSync(
  new URL('../supabase/migrations/20261024140000_salary_advance_upsert_stage.sql', import.meta.url),
  'utf8'
);
const migrationName = '20261113200000_employee_authorization_admin_only.sql';
const migrationSql = fs.readFileSync(
  new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
  'utf8'
);
const ui = fs.readFileSync(new URL('../src/components/EmployeeManagement.jsx', import.meta.url), 'utf8');

const ADMIN_UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HR_UID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function upsertAdvance(db, adv) {
  const row = toSalaryAdvanceRow(adv, { updatedAt: '2026-11-11T08:00:00.000Z' });
  const cols = Object.keys(row);
  const values = cols.map((col) => sqlLiteral(row[col]));
  const assignments = cols.filter((col) => col !== 'id').map((col) => `${col} = EXCLUDED.${col}`);
  await db.exec(`
    INSERT INTO public.salary_advances (${cols.join(', ')})
    VALUES (${values.join(', ')})
    ON CONFLICT (id) DO UPDATE SET ${assignments.join(', ')}
  `);
}

function requestedAdvance(id, employeeId) {
  return {
    id,
    employeeId,
    employeeName: 'Asha',
    department: 'Printing',
    requestDate: '2026-11-11',
    advanceAmount: 8000,
    repaymentTenureMonths: 4,
    monthlyEmiAmount: 2000,
    reason: 'Family expense',
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

async function prepare(db) {
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS private;
    CREATE TABLE public.auth_uid_holder (id int PRIMARY KEY, uid uuid);
    INSERT INTO public.auth_uid_holder (id, uid) VALUES (1, '${ADMIN_UID}');
    CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT uid FROM public.auth_uid_holder WHERE id = 1 $$;

    CREATE TABLE public.test_actor (
      id int PRIMARY KEY,
      role text,
      is_verified_admin boolean
    );
    INSERT INTO public.test_actor (id, role, is_verified_admin)
    VALUES (1, 'Store Manager', false);

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

    CREATE TABLE public.role_permissions (
      role text PRIMARY KEY,
      permissions jsonb,
      updated_at timestamptz
    );
    INSERT INTO public.role_permissions (role, permissions, updated_at)
    VALUES ('Store Manager', '{"employees": true}'::jsonb, '2026-01-01T00:00:00Z');

    CREATE FUNCTION private.app_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT role FROM public.test_actor WHERE id = 1 $$;
    CREATE FUNCTION private.has_role(allowed text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$
      SELECT (SELECT role FROM public.test_actor WHERE id = 1) = 'Admin'
          OR (SELECT role FROM public.test_actor WHERE id = 1) = ANY (allowed);
    $$;
    CREATE FUNCTION private.caller_is_verified_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT coalesce(is_verified_admin, false) FROM public.test_actor WHERE id = 1 $$;

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
    GRANT USAGE ON SCHEMA public, private TO authenticated, service_role;
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
    CREATE TABLE public.employee_attendance (
      id text PRIMARY KEY,
      employee_id text NOT NULL,
      date date NOT NULL,
      status text NOT NULL,
      overtime_hours numeric DEFAULT 0,
      overtime_status text DEFAULT 'Pending Approval',
      overtime_approved_by text,
      overtime_approved_date text,
      check_in text
    );
    CREATE TABLE public.salary_payments (
      id text PRIMARY KEY,
      employee_id text,
      month_key text,
      status text,
      net_amount_paid numeric
    );
  `);
}

async function actAs(db, who) {
  await db.exec('RESET ROLE');
  if (who === 'admin') {
    await db.exec(`UPDATE public.test_actor SET role = 'Admin', is_verified_admin = true WHERE id = 1`);
    await db.exec(`UPDATE public.auth_uid_holder SET uid = '${ADMIN_UID}' WHERE id = 1`);
  } else if (who === 'admin-in-assigned-role') {
    await db.exec(`UPDATE public.test_actor SET role = 'Store Manager', is_verified_admin = true WHERE id = 1`);
    await db.exec(`UPDATE public.auth_uid_holder SET uid = '${ADMIN_UID}' WHERE id = 1`);
  } else if (who === 'hr') {
    await db.exec(`UPDATE public.test_actor SET role = 'HR & Payroll Manager', is_verified_admin = false WHERE id = 1`);
    await db.exec(`UPDATE public.auth_uid_holder SET uid = '${HR_UID}' WHERE id = 1`);
  } else {
    await db.exec(`UPDATE public.test_actor SET role = '${who.replace(/'/g, "''")}', is_verified_admin = false WHERE id = 1`);
  }
  await db.exec('SET ROLE authenticated');
}

test('the screen and the migration keep Employee Management decisions with Admin', () => {
  assert.ok(migrationName.slice(0, 14) > '20261113180000');
  assert.doesNotMatch(migrationSql, /eamstsaqkbeiywfaanhi/);
  assert.doesNotMatch(migrationSql, /UPDATE\s+public\.role_permissions/i);
  assert.match(migrationSql, /Only an Admin can approve or reject overtime/);
  assert.match(migrationSql, /Only an Admin can approve, reject, revert overtime, or change attendance that is already marked/);
  assert.match(migrationSql, /Only an Admin can approve, disburse, recover, or otherwise authorize a salary advance/);
  assert.match(migrationSql, /Only an Admin can authorize a salary payment/);
  assert.doesNotMatch(migrationSql, /DROP TABLE|DROP COLUMN/i);

  const actionsStart = ui.indexOf('const renderOtActions');
  const actionsEnd = ui.indexOf('// Export Overtime Data');
  const actions = ui.slice(actionsStart, actionsEnd);
  assert.ok(actionsStart > 0);
  assert.ok(actions.indexOf('if (!canDecide)') < actions.indexOf('data-testid={`ot-approve-'));
  assert.equal((ui.match(/handleApproveOvertime\(att, true\)/g) || []).length, 1);
  assert.equal((ui.match(/handleApproveOvertime\(att, false\)/g) || []).length, 1);
  assert.equal((ui.match(/handleRevertOvertime\(att\)/g) || []).length, 2);
  assert.match(ui, /renderOtActions\(att, payout\)/);
  assert.match(ui, /renderOtActions\(att, payoutInfo\?\.payout\)/);
  assert.match(ui, /ot-awaiting-admin-/);
  assert.match(ui, /payroll-awaiting-admin-/);
  assert.match(ui, /advance-recover-/);
  assert.match(ui, /Only an Admin can approve, reject, or revert/);
  assert.doesNotMatch(ui, /Plant Head/);
  assert.doesNotMatch(ui, /Only Plant Head, HR Manager, or Admin/);

  for (const role of SYSTEM_ROLES) {
    assert.equal(canDecideEmployeeAuthorization(role), role === 'Admin', role);
  }
  assert.equal(salaryAdvancePrimaryAction(
    { id: 'A', employeeId: 'E', status: 'Requested', remainingBalance: 1, advanceAmount: 1 },
    [],
    'Store Manager'
  ), 'awaiting-admin');
  assert.equal(salaryAdvancePrimaryAction(
    { id: 'A', employeeId: 'E', status: 'Requested', remainingBalance: 1, advanceAmount: 1 },
    [],
    'HR & Payroll Manager'
  ), 'awaiting-admin');
});

test('the database refuses non-Admin overtime, advance, and payroll decisions', async () => {
  const db = new PGlite();
  try {
    await prepare(db);
    await db.exec(stagesSql);
    await db.exec(upsertSql);
    await db.exec(migrationSql);
    await db.exec(migrationSql);
    await db.exec('ALTER TABLE public.salary_advances ADD COLUMN IF NOT EXISTS updated_at timestamptz');
    await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_attendance, public.salary_advances, public.salary_payments TO authenticated, service_role');

    await db.exec('RESET ROLE');
    const permissions = await db.query(`SELECT permissions, updated_at FROM public.role_permissions WHERE role = 'Store Manager'`);
    assert.equal(permissions.rows[0].permissions.employees, true);
    assert.equal(new Date(permissions.rows[0].updated_at).toISOString(), '2026-01-01T00:00:00.000Z');

    const nonAdmins = ['Store Manager', 'HR & Payroll Manager', 'Plant Manager', 'Production Manager'];
    for (const role of nonAdmins) {
      await actAs(db, role === 'HR & Payroll Manager' ? 'hr' : role);
      await db.query(
        `INSERT INTO public.employee_attendance (id, employee_id, date, status, overtime_hours, overtime_status)
         VALUES ($1, 'EMP-1', '2026-11-11', 'Present', 1.5, 'Pending Approval')`,
        [`ATT-${role}`]
      );
      await assert.rejects(
        () => db.query(
          `INSERT INTO public.employee_attendance (id, employee_id, date, status, overtime_hours, overtime_status, overtime_approved_by)
           VALUES ($1, 'EMP-1', '2026-11-10', 'Present', 2, 'Approved', $2)`,
          [`ATT-SKIP-${role}`, role]
        ),
        /Only an Admin can approve or reject overtime/
      );
      await assert.rejects(
        () => db.query(
          `UPDATE public.employee_attendance SET overtime_status = 'Approved', overtime_approved_by = $2 WHERE id = $1`,
          [`ATT-${role}`, role]
        ),
        /Only an Admin can approve, reject, revert overtime, or change attendance that is already marked/
      );
      await assert.rejects(
        () => db.query(
          `UPDATE public.employee_attendance SET overtime_status = 'Rejected' WHERE id = $1`,
          [`ATT-${role}`]
        ),
        /change attendance that is already marked/
      );
      await assert.rejects(
        () => db.query(`UPDATE public.employee_attendance SET check_in = '09:00' WHERE id = $1`, [`ATT-${role}`]),
        /change attendance that is already marked/
      );
    }

    await actAs(db, 'Store Manager');
    await db.query(
      `INSERT INTO public.employee_attendance (id, employee_id, date, status, overtime_hours, overtime_status)
       VALUES ('ATT-ZERO', 'EMP-1', '2026-11-09', 'Present', 0, 'Approved')`
    );
    await db.query(`DELETE FROM public.employee_attendance WHERE id = 'ATT-ZERO'`);
    const stillPending = await db.query(`SELECT overtime_status FROM public.employee_attendance WHERE id = 'ATT-Store Manager'`);
    assert.equal(stillPending.rows[0].overtime_status, 'Pending Approval');

    await actAs(db, 'admin');
    await db.query(`UPDATE public.employee_attendance SET overtime_status = 'Approved', overtime_approved_by = 'Samyak Jain', overtime_approved_date = '2026-11-11' WHERE id = 'ATT-Store Manager'`);
    await db.query(`UPDATE public.employee_attendance SET overtime_status = 'Rejected', overtime_approved_by = 'Samyak Jain' WHERE id = 'ATT-Plant Manager'`);
    await db.query(`UPDATE public.employee_attendance SET overtime_status = 'Pending Approval', overtime_approved_by = NULL, overtime_approved_date = NULL WHERE id = 'ATT-Store Manager'`);
    const reverted = await db.query(`SELECT overtime_status, overtime_approved_by FROM public.employee_attendance WHERE id = 'ATT-Store Manager'`);
    assert.equal(reverted.rows[0].overtime_status, 'Pending Approval');
    assert.equal(reverted.rows[0].overtime_approved_by, null);
    await db.query(`UPDATE public.employee_attendance SET overtime_status = 'Approved', overtime_approved_by = 'Samyak Jain' WHERE id = 'ATT-HR & Payroll Manager'`);

    await actAs(db, 'Store Manager');
    await assert.rejects(
      () => db.query(`DELETE FROM public.employee_attendance WHERE id = 'ATT-HR & Payroll Manager'`),
      /Only an Admin can approve, reject, or revert overtime/
    );
    await actAs(db, 'admin-in-assigned-role');
    await db.query(`UPDATE public.employee_attendance SET check_in = '08:15' WHERE id = 'ATT-Production Manager'`);

    await actAs(db, 'hr');
    await upsertAdvance(db, requestedAdvance('ADV-HR', 'EMP-20'));
    await db.query(`UPDATE public.salary_advances SET reason = 'Corrected reason' WHERE id = 'ADV-HR'`);
    const corrected = await db.query(`SELECT status, reason FROM public.salary_advances WHERE id = 'ADV-HR'`);
    assert.equal(corrected.rows[0].status, 'Requested');
    assert.equal(corrected.rows[0].reason, 'Corrected reason');
    const approvedByHr = buildApprovedSalaryAdvance(requestedAdvance('ADV-HR', 'EMP-20'), {
      withOverride: false,
      actorName: 'Payroll Lead',
    });
    await assert.rejects(
      () => upsertAdvance(db, approvedByHr),
      /Only an Admin can approve, disburse, recover, or otherwise authorize a salary advance/
    );

    await actAs(db, 'admin');
    const approved = buildApprovedSalaryAdvance({ ...requestedAdvance('ADV-HR', 'EMP-20'), reason: 'Corrected reason' }, {
      withOverride: false,
      actorName: 'Samyak Jain',
      approvedDate: '2026-11-11',
    });
    await upsertAdvance(db, approved);
    const approvedRow = await db.query(`SELECT status, approved_by, policy_override FROM public.salary_advances WHERE id = 'ADV-HR'`);
    assert.equal(approvedRow.rows[0].status, 'Approved');
    assert.equal(approvedRow.rows[0].approved_by, 'Samyak Jain');
    assert.equal(approvedRow.rows[0].policy_override, false);

    await actAs(db, 'hr');
    await assert.rejects(
      () => upsertAdvance(db, buildDisbursedSalaryAdvance(
        { ...approved, status: 'Approved', policyOverride: false },
        { paymentReference: 'UTR-HR', disbursedDate: '2026-11-11', disbursedBy: 'Payroll Lead' }
      )),
      /Only an Admin can approve, disburse, recover, or otherwise authorize a salary advance/
    );
    await assert.rejects(
      () => db.query(`INSERT INTO public.salary_payments (id, employee_id, month_key, status, net_amount_paid) VALUES ('PAY-HR', 'EMP-20', '2026-11', 'Paid', 1000)`),
      /Only an Admin can authorize a salary payment/
    );

    await actAs(db, 'admin');
    const disbursed = buildDisbursedSalaryAdvance(
      { ...approved, status: 'Approved', policyOverride: false, reason: 'Corrected reason' },
      { paymentReference: 'UTR-ADMIN', disbursedDate: '2026-11-11', disbursedBy: 'Samyak Jain' }
    );
    await upsertAdvance(db, disbursed);
    await db.query(`UPDATE public.salary_advances SET total_recovered_amount = 2000, remaining_balance = 6000, deduction_history = '[{"amount":2000}]'::jsonb WHERE id = 'ADV-HR'`);
    await db.query(`INSERT INTO public.salary_payments (id, employee_id, month_key, status, net_amount_paid) VALUES ('PAY-ADMIN', 'EMP-20', '2026-11', 'Paid', 12000)`);

    await actAs(db, 'hr');
    await assert.rejects(
      () => db.query(`UPDATE public.salary_advances SET remaining_balance = 0, total_recovered_amount = 8000 WHERE id = 'ADV-HR'`),
      /Only an Admin can approve, disburse, recover/
    );
    await actAs(db, 'Store Manager');
    await assert.rejects(
      () => db.query(`DELETE FROM public.salary_payments WHERE id = 'PAY-ADMIN'`),
      /Only an Admin can authorize a salary payment/
    );
    await db.exec('RESET ROLE');
    const finalAdvance = await db.query(`SELECT status, payment_reference, remaining_balance FROM public.salary_advances WHERE id = 'ADV-HR'`);
    assert.equal(finalAdvance.rows[0].status, 'Disbursed');
    assert.equal(finalAdvance.rows[0].payment_reference, 'UTR-ADMIN');
    assert.equal(Number(finalAdvance.rows[0].remaining_balance), 6000);
    const triggers = await db.query(`
      SELECT DISTINCT event_object_table, trigger_name
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND trigger_name IN ('employee_attendance_authorization', 'salary_payments_authorization', 'salary_advances_stage_guard')
      ORDER BY event_object_table, trigger_name
    `);
    assert.deepEqual(triggers.rows.map((row) => `${row.event_object_table}:${row.trigger_name}`), [
      'employee_attendance:employee_attendance_authorization',
      'salary_advances:salary_advances_stage_guard',
      'salary_payments:salary_payments_authorization',
    ]);
  } finally {
    await db.close();
  }
});
