import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SYSTEM_ROLES } from '../src/roles.js';
import { PLANT_ROLE_OPTIONS, normalizeAssignedRoles } from '../src/assignedRoles.js';
import { generateFullRolePermissions } from '../src/factoryStore.js';
import { canReadPayroll, roleHasModule } from '../src/bootAccess.js';
import {
  isAccountsRole,
  canDisburseSalaryAdvanceRole,
  canDecideEmployeeAuthorization,
  canApproveSalaryAdvanceRole,
  salaryAdvancePrimaryAction
} from '../src/services/salaryAdvance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('SYSTEM_ROLES and PLANT_ROLE_OPTIONS register Accounts Manager under Accounts & Finance', () => {
  assert.equal(SYSTEM_ROLES.includes('Accounts Manager'), true);
  const plantOption = PLANT_ROLE_OPTIONS.find((opt) => opt.role === 'Accounts Manager');
  assert.ok(plantOption, 'Accounts Manager must be in PLANT_ROLE_OPTIONS');
  assert.equal(plantOption.dept, 'Accounts & Finance');
});

test('normalizeAssignedRoles maps Accounts and Accounts Department to Accounts Manager', () => {
  assert.deepEqual(normalizeAssignedRoles(['Accounts']), ['Accounts Manager']);
  assert.deepEqual(normalizeAssignedRoles(['Accounts Department']), ['Accounts Manager']);
  assert.deepEqual(normalizeAssignedRoles(['Accounts Manager']), ['Accounts Manager']);
});

test('generateFullRolePermissions grants correct modules to Accounts Manager and Accounts', () => {
  const perms = generateFullRolePermissions(false);
  
  for (const roleKey of ['Accounts Manager', 'Accounts']) {
    const rolePerms = perms[roleKey];
    assert.ok(rolePerms, `Permissions must be defined for ${roleKey}`);
    
    // Modules requested by user:
    // 1. Inward GRN (via inventory)
    assert.equal(rolePerms.inventory, true);
    // 2. Vendor Directory (via vendors)
    assert.equal(rolePerms.vendors, true);
    // 3. Dispatch Challans & Packing Lists (via dispatch)
    assert.equal(rolePerms.dispatch, true);
    // 4. Employee Management (via employees)
    assert.equal(rolePerms.employees, true);
    // 5. Sales & Quotations (via sales)
    assert.equal(rolePerms.sales, true);
    // Dashboard navigation
    assert.equal(rolePerms.dashboard, true);

    // Modules that must NOT be granted to Accounts:
    assert.equal(rolePerms.purchase_orders, false);
    assert.equal(rolePerms.production_records, false);
    assert.equal(rolePerms.job_punching, false);
    assert.equal(rolePerms.orders, false);
    assert.equal(rolePerms.clients, false);
    assert.equal(rolePerms.job_masters, false);
    assert.equal(rolePerms.ink_management, false);
    assert.equal(rolePerms.material_indents, false);
    assert.equal(rolePerms.cylinders, false);
    assert.equal(rolePerms.printing_scheduler, false);
    assert.equal(rolePerms.user_management, false);
    assert.equal(rolePerms.audit_logs, false);
    assert.equal(rolePerms.supabase, false);
    assert.equal(rolePerms.doc_settings, false);
  }
});

test('bootAccess canReadPayroll includes Accounts Manager and Accounts', () => {
  assert.equal(canReadPayroll('Accounts Manager'), true);
  assert.equal(canReadPayroll('Accounts'), true);
  assert.equal(canReadPayroll(['Accounts Manager']), true);
  assert.equal(canReadPayroll('HR & Payroll Manager'), true);
  assert.equal(canReadPayroll('Admin'), true);
  assert.equal(canReadPayroll('Sales Manager'), false);
  assert.equal(canReadPayroll('QC Chemist'), false);
});

test('salaryAdvance helper permissions for Accounts role', () => {
  assert.equal(isAccountsRole('Accounts Manager'), true);
  assert.equal(isAccountsRole('Accounts'), true);
  assert.equal(isAccountsRole('accounts'), true);
  assert.equal(isAccountsRole(['Accounts Manager']), true);
  assert.equal(isAccountsRole('Admin'), false);
  assert.equal(isAccountsRole('HR & Payroll Manager'), false);

  // Disbursal authority:
  assert.equal(canDisburseSalaryAdvanceRole('Accounts Manager'), true);
  assert.equal(canDisburseSalaryAdvanceRole('Accounts'), true);
  assert.equal(canDisburseSalaryAdvanceRole('Admin'), true);
  assert.equal(canDisburseSalaryAdvanceRole('HR & Payroll Manager'), false);
  assert.equal(canDisburseSalaryAdvanceRole('Sales Manager'), false);
  assert.equal(canDisburseSalaryAdvanceRole('Accounts Manager', { anonymous: true }), false);

  // Employee decision authority stays exact Admin only:
  assert.equal(canDecideEmployeeAuthorization('Admin'), true);
  assert.equal(canDecideEmployeeAuthorization('Accounts Manager'), false);
  assert.equal(canApproveSalaryAdvanceRole('Accounts Manager'), false);
});

test('salaryAdvancePrimaryAction assigns disburse to Accounts for Approved advances only', () => {
  const reqAdv = { id: 'ADV-1', employeeId: 'EMP-1', status: 'Requested', advanceAmount: 5000 };
  const appAdv = { id: 'ADV-2', employeeId: 'EMP-2', status: 'Approved', advanceAmount: 5000 };
  const disbAdv = { id: 'ADV-3', employeeId: 'EMP-3', status: 'Disbursed', advanceAmount: 5000, remainingBalance: 5000 };

  // Accounts role:
  // Requested advance: cannot approve, must wait for Admin
  assert.equal(salaryAdvancePrimaryAction(reqAdv, [reqAdv], 'Accounts Manager'), 'awaiting-admin');
  // Approved advance: Accounts CAN disburse!
  assert.equal(salaryAdvancePrimaryAction(appAdv, [appAdv], 'Accounts Manager'), 'disburse');
  // Disbursed advance: recovery decision stays with Admin, Accounts gets history only
  assert.equal(salaryAdvancePrimaryAction(disbAdv, [disbAdv], 'Accounts Manager'), 'history');

  // Admin role:
  assert.equal(salaryAdvancePrimaryAction(reqAdv, [reqAdv], 'Admin'), 'approve');
  assert.equal(salaryAdvancePrimaryAction(appAdv, [appAdv], 'Admin'), 'disburse');
  assert.equal(salaryAdvancePrimaryAction(disbAdv, [disbAdv], 'Admin'), 'recover');
});

test('migration 20261120170000_accounts_department_role.sql exists and contains required guards', () => {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20261120170000_accounts_department_role.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(sql.includes("'Accounts Manager'"), 'SQL must include Accounts Manager');
  assert.ok(sql.includes('private.app_role()'), 'SQL must update private.app_role()');
  assert.ok(sql.includes('private.app_roles()'), 'SQL must update private.app_roles()');
  assert.ok(sql.includes('private.guard_salary_payment_authorization()'), 'SQL must update guard_salary_payment_authorization');
  assert.ok(sql.includes('private.guard_salary_advance()'), 'SQL must update guard_salary_advance');
  assert.ok(sql.includes('employees_accounts_select'), 'SQL must grant SELECT on employees to Accounts');
  assert.ok(sql.includes('employee_attendance_accounts_select'), 'SQL must grant SELECT on employee_attendance to Accounts');
  assert.ok(sql.includes('salary_advances_accounts'), 'SQL must grant access on salary_advances to Accounts');
  assert.ok(sql.includes('salary_payments_accounts'), 'SQL must grant access on salary_payments to Accounts');
  assert.ok(sql.includes('users_role_allowed'), 'SQL must update users_role_allowed check constraint');
});

test('migration 20261121120000_allow_accounts_role_in_users.sql allows Accounts Manager and Accounts in public.users', () => {
  const migrationPath = path.resolve(__dirname, '../supabase/migrations/20261121120000_allow_accounts_role_in_users.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(sql.includes('users_role_allowed'), 'SQL must drop and re-add users_role_allowed constraint');
  assert.ok(sql.includes("'Accounts Manager'"), 'SQL must allow Accounts Manager');
  assert.ok(sql.includes("'Accounts'"), 'SQL must allow Accounts');
});
