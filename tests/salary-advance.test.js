import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import {
  buildApprovedSalaryAdvance,
  buildDisbursedSalaryAdvance,
  canApproveSalaryAdvanceRole,
  findUnsettledAdvance,
  isExactAdminRole,
  isPayrollRecoverableAdvance,
  isUnsettledSalaryAdvance,
  salaryAdvancePrimaryAction,
  salaryAdvanceSaveErrorText,
  saveSalaryAdvanceRecord,
  toSalaryAdvanceRow,
} from '../src/services/salaryAdvance.js';

await register(new URL('../scripts/resolve-js-hook.mjs', import.meta.url));

const { calculateEmployeeMonthlySalary } = await import('../src/factoryStore.js');

const emp = {
  id: 'EMP-1',
  empCode: 'E1',
  fullName: 'Asha',
  department: 'Printing',
  designation: 'Operator',
  shiftDurationHours: 12,
  salaryStructure: { basicSalary: 26000, hra: 0, otherAllowance: 0 },
  bankDetails: {},
};

function payslipDeduction(status, extra = {}) {
  const summary = calculateEmployeeMonthlySalary(emp, '2026-10', [], [{
    id: 'ADV-1',
    employeeId: 'EMP-1',
    status,
    advanceAmount: 10000,
    monthlyEmiAmount: 2500,
    remainingBalance: 10000,
    totalRecoveredAmount: 0,
    ...extra,
  }], 26);
  return summary.totalAdvanceDeduction;
}

test('payslip EMI is taken only from a disbursed advance with a balance', () => {
  assert.equal(payslipDeduction('Requested'), 0);
  assert.equal(payslipDeduction('Approved'), 0);
  assert.equal(payslipDeduction('Disbursed'), 2500);
  assert.equal(payslipDeduction('Fully Recovered', { remainingBalance: 0, totalRecoveredAmount: 10000 }), 0);
  assert.equal(payslipDeduction('Disbursed', { remainingBalance: 0, totalRecoveredAmount: 10000 }), 0);
  assert.equal(payslipDeduction('Approved & Disbursed'), 2500);
});

test('an open request or approval blocks another advance, a settled loan does not', () => {
  const rows = [
    { id: 'A1', employeeId: 'EMP-1', status: 'Disbursed', remainingBalance: 0, advanceAmount: 1000 },
    { id: 'A2', employeeId: 'EMP-1', status: 'Fully Recovered', remainingBalance: 0, advanceAmount: 1000 },
    { id: 'A3', employeeId: 'EMP-2', status: 'Approved', remainingBalance: 500, advanceAmount: 500 },
    { id: 'A4', employeeId: 'EMP-3', status: 'Requested', remainingBalance: 800, advanceAmount: 800 },
  ];
  assert.equal(isUnsettledSalaryAdvance(rows[0]), false);
  assert.equal(isUnsettledSalaryAdvance(rows[1]), false);
  assert.equal(findUnsettledAdvance(rows, 'EMP-1'), null);
  assert.equal(findUnsettledAdvance(rows, 'EMP-2').id, 'A3');
  assert.equal(findUnsettledAdvance(rows, 'EMP-3', 'A4'), null);
  assert.equal(isPayrollRecoverableAdvance(rows[0]), false);
  assert.equal(isPayrollRecoverableAdvance({ status: 'Disbursed', remainingBalance: 40 }), true);
  assert.equal(isPayrollRecoverableAdvance({ status: 'Approved', remainingBalance: 40 }), false);
});

test('only the Admin role may override, and only HR or Admin may approve', () => {
  assert.equal(isExactAdminRole('Admin'), true);
  assert.equal(isExactAdminRole(' admin '), true);
  assert.equal(isExactAdminRole('HR & Payroll Manager'), false);
  assert.equal(isExactAdminRole('Plant Manager'), false);
  assert.equal(isExactAdminRole('Director'), false);
  assert.equal(isExactAdminRole('Owner'), false);
  assert.equal(canApproveSalaryAdvanceRole('Admin'), true);
  assert.equal(canApproveSalaryAdvanceRole('HR & Payroll Manager'), true);
  assert.equal(canApproveSalaryAdvanceRole('Plant Manager'), false);
  assert.equal(canApproveSalaryAdvanceRole('Director'), false);
  assert.equal(canApproveSalaryAdvanceRole('', { anonymous: true }), true);
});

test('the advance screen does not approve and disburse in one step', () => {
  const ui = fs.readFileSync(new URL('../src/components/EmployeeManagement.jsx', import.meta.url), 'utf8');
  assert.equal(ui.includes("status: 'Approved & Disbursed'"), false);
  assert.equal(ui.includes('Approve & Disburse'), false);
  assert.match(ui, /status: 'Requested'/);
  assert.match(ui, /isExactAdmin && showOverrideModal/);
  assert.equal((ui.match(/salary-advance-override-control/g) || []).length, 1);
  assert.match(ui, /buildDisbursedSalaryAdvance/);
  assert.match(ui, /Could not disburse this salary advance/);
  assert.match(ui, /Could not approve this salary advance/);
  assert.equal(ui.includes('saveSalaryAdvanceToSupabase('), false);
  const service = fs.readFileSync(new URL('../src/services/supabaseDataService.js', import.meta.url), 'utf8');
  assert.match(service, /toSalaryAdvanceRow\(adv\)/);
  assert.match(service, /onConflict: 'id'/);
  assert.match(service, /policy_override_at/);
});

test('an approved advance offers Disburse even when another advance is unsettled', () => {
  const sibling = {
    id: 'ADV-OLD',
    employeeId: 'EMP-9',
    status: 'Disbursed',
    advanceAmount: 10000,
    remainingBalance: 4000,
  };
  const requested = {
    id: 'ADV-NEXT',
    employeeId: 'EMP-9',
    status: 'Requested',
    advanceAmount: 8000,
    remainingBalance: 8000,
  };
  const open = [sibling, requested];
  assert.equal(salaryAdvancePrimaryAction(requested, open, 'Admin'), 'approve-override');
  assert.equal(salaryAdvancePrimaryAction(requested, open, 'HR & Payroll Manager'), 'awaiting-admin');

  const approved = buildApprovedSalaryAdvance(requested, {
    withOverride: true,
    actorName: 'Samyak Jain',
    approvedDate: '2026-10-24',
    overrideAt: '2026-10-24T13:00:00.000Z',
  });
  assert.equal(approved.status, 'Approved');
  assert.equal(salaryAdvancePrimaryAction(approved, [sibling, approved], 'Admin'), 'disburse');
  assert.equal(salaryAdvancePrimaryAction(approved, [sibling, approved], 'HR & Payroll Manager'), 'disburse');

  const plain = buildApprovedSalaryAdvance({ ...requested, id: 'ADV-LONE', employeeId: 'EMP-1' }, {
    withOverride: false,
    actorName: 'Payroll Lead',
    approvedDate: '2026-10-24',
  });
  assert.equal(plain.policyOverride, false);
  assert.equal(salaryAdvancePrimaryAction(plain, [plain], 'HR & Payroll Manager'), 'disburse');
  assert.equal(salaryAdvancePrimaryAction(plain, [plain], 'Admin'), 'disburse');
});

test('disbursing sends status Disbursed and a rejected save is not swallowed', async () => {
  const approved = buildApprovedSalaryAdvance({
    id: 'ADV-NEXT',
    employeeId: 'EMP-9',
    employeeName: 'Neha',
    status: 'Requested',
    advanceAmount: 8000,
    remainingBalance: 8000,
    monthlyEmiAmount: 2000,
    policyOverride: true,
    policyOverrideBy: 'Samyak Jain',
    policyOverrideAt: '2026-10-24T13:00:00.000Z',
  }, { withOverride: true, actorName: 'Samyak Jain', approvedDate: '2026-10-24', overrideAt: '2026-10-24T13:00:00.000Z' });

  const disbursed = buildDisbursedSalaryAdvance(approved, {
    paymentReference: '  UTR-99  ',
    disbursedDate: '2026-10-24',
    disbursedBy: 'Payroll Lead',
  });
  assert.equal(disbursed.status, 'Disbursed');
  const row = toSalaryAdvanceRow(disbursed, { updatedAt: '2026-10-24T13:14:10.000Z' });
  assert.equal(row.status, 'Disbursed');
  assert.equal(row.payment_reference, 'UTR-99');
  assert.equal(row.policy_override, true);
  assert.equal(isPayrollRecoverableAdvance(disbursed), true);
  assert.equal(isPayrollRecoverableAdvance(approved), false);

  assert.throws(
    () => buildDisbursedSalaryAdvance(approved, { paymentReference: '   ' }),
    /payment reference is required/,
  );

  let directCalls = 0;
  const databaseError = { message: 'A new salary advance must start as Requested' };
  await assert.rejects(
    () => saveSalaryAdvanceRecord(disbursed, {
      mode: 'update',
      onUpdate: async () => { throw databaseError; },
      direct: async () => { directCalls += 1; },
    }),
    (error) => error === databaseError,
  );
  assert.equal(directCalls, 0);
  assert.match(salaryAdvanceSaveErrorText(databaseError), /must start as Requested/);
});
