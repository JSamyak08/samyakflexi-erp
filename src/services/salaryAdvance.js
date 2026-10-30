import { rawRoleNames } from '../assignedRoles.js';

// Salary-advance stages and the outstanding-advance rule.
// Payroll recovery runs only after Disbursed. A second advance can be
// requested by an Admin, but the policy override is recorded at approval.

export const SALARY_ADVANCE_STATUSES = ['Requested', 'Approved', 'Disbursed', 'Fully Recovered'];

export const SALARY_ADVANCE_STATUS_FILTERS = SALARY_ADVANCE_STATUSES;

const OPEN_STATUSES = new Set(['Requested', 'Approved', 'Pending Approval']);

export function advanceRemainingBalance(adv) {
  if (!adv) return 0;
  if (adv.remainingBalance !== undefined && adv.remainingBalance !== null && adv.remainingBalance !== '') {
    return Number(adv.remainingBalance) || 0;
  }
  const amount = Number(adv.advanceAmount) || 0;
  const recovered = Number(adv.totalRecoveredAmount) || 0;
  return Math.max(0, amount - recovered);
}

export function isUnsettledSalaryAdvance(adv) {
  if (!adv) return false;
  const status = adv.status;
  if (status === 'Fully Recovered') return false;
  if (status === 'Disbursed' || status === 'Approved & Disbursed') {
    return advanceRemainingBalance(adv) > 0;
  }
  if (OPEN_STATUSES.has(status)) return true;
  return false;
}

export function findUnsettledAdvance(advances, employeeId, exceptId = '') {
  if (!employeeId) return null;
  return (advances || []).find((adv) => (
    String(adv.employeeId) === String(employeeId)
    && String(adv.id) !== String(exceptId || '')
    && isUnsettledSalaryAdvance(adv)
  )) || null;
}

// EMI and payslip deductions. The legacy combined status stays deductible
// only until the migration rewrites those rows.
export function isPayrollRecoverableAdvance(adv) {
  if (!adv) return false;
  if (advanceRemainingBalance(adv) <= 0) return false;
  return adv.status === 'Disbursed' || adv.status === 'Approved & Disbursed';
}

export function salaryAdvanceBadgeStyle(status) {
  if (status === 'Approved') {
    return { background: '#dbeafe', color: '#1d4ed8' };
  }
  if (status === 'Disbursed' || status === 'Approved & Disbursed') {
    return { background: '#dcfce7', color: '#166534' };
  }
  if (status === 'Fully Recovered') {
    return { background: '#f1f5f9', color: '#475569' };
  }
  return { background: '#fef9c3', color: '#854d0e' };
}

export function isExactAdminRole(role) {
  return rawRoleNames(role).some((name) => name.toLowerCase() === 'admin');
}

// Matches salary_advances RLS: Admin, or HR & Payroll Manager.
// Plant, director, and owner are not approvers.
export function canApproveSalaryAdvanceRole(role, { anonymous = false } = {}) {
  if (anonymous) return true;
  return rawRoleNames(role).some((name) => {
    const roleStr = name.toLowerCase();
    return roleStr === 'admin' || roleStr.includes('hr');
  });
}

// The action cell. An unsettled sibling blocks a new request and a
// non-admin approval. It does not block disbursal of a row that is
// already Approved, including an Admin policy override.
export function salaryAdvancePrimaryAction(adv, advances, role, { anonymous = false } = {}) {
  if (!adv) return 'history';
  const canApprove = canApproveSalaryAdvanceRole(role, { anonymous });
  const other = findUnsettledAdvance(advances, adv.employeeId, adv.id);
  if ((adv.status === 'Requested' || adv.status === 'Pending Approval') && canApprove) {
    if (other && !isExactAdminRole(role)) return 'awaiting-admin';
    return other ? 'approve-override' : 'approve';
  }
  if (adv.status === 'Approved' && canApprove) return 'disburse';
  if ((adv.status === 'Disbursed' || adv.status === 'Approved & Disbursed') && advanceRemainingBalance(adv) > 0) {
    return 'recover';
  }
  return 'history';
}

export function salaryAdvanceSaveErrorText(error) {
  const message = error?.message || error?.details || error?.hint;
  if (message) return String(message);
  return 'The database rejected the salary advance.';
}

// One writer. The screen used to call the parent save and the Supabase
// upsert together and not wait for either, so a rejected write still
// showed a success message and the list never moved.
export async function saveSalaryAdvanceRecord(record, { onSave, onUpdate, direct, mode } = {}) {
  if (mode === 'create' && onSave) {
    await onSave(record);
    return record;
  }
  if (mode !== 'create' && onUpdate) {
    await onUpdate(record);
    return record;
  }
  if (direct) {
    await direct(record);
    return record;
  }
  throw new Error('Cannot save salary advance: no save handler is available.');
}

export function buildApprovedSalaryAdvance(adv, { withOverride = false, actorName = 'Approver', approvedDate, overrideAt = null } = {}) {
  return {
    ...adv,
    status: 'Approved',
    approvedBy: actorName || 'Approver',
    approvedDate: approvedDate || new Date().toISOString().split('T')[0],
    disbursedDate: '',
    disbursedBy: '',
    paymentReference: '',
    policyOverride: Boolean(withOverride),
    policyOverrideBy: withOverride ? (actorName || 'Admin') : '',
    policyOverrideAt: withOverride ? overrideAt : null,
  };
}

export function buildDisbursedSalaryAdvance(adv, { paymentReference, disbursedDate, disbursedBy = '' } = {}) {
  const ref = String(paymentReference || '').trim();
  if (!ref) {
    throw new Error('A payment reference is required to disburse an approved advance.');
  }
  if (adv?.status !== 'Approved') {
    throw new Error('Only an approved advance can be disbursed.');
  }
  return {
    ...adv,
    status: 'Disbursed',
    paymentReference: ref,
    disbursedDate: disbursedDate || new Date().toISOString().split('T')[0],
    disbursedBy: disbursedBy || '',
  };
}

// Column shape posted by saveSalaryAdvanceToSupabase (upsert on id).
export function toSalaryAdvanceRow(adv, { updatedAt = new Date().toISOString() } = {}) {
  if (!adv?.id) {
    throw new Error('Salary advance is missing an id.');
  }
  return {
    id: adv.id,
    employee_id: adv.employeeId,
    employee_name: adv.employeeName,
    department: adv.department,
    request_date: adv.requestDate,
    advance_amount: adv.advanceAmount,
    repayment_tenure_months: adv.repaymentTenureMonths,
    monthly_emi_amount: adv.monthlyEmiAmount,
    reason: adv.reason,
    status: adv.status,
    approved_by: adv.approvedBy || '',
    approved_date: adv.approvedDate || '',
    disbursed_date: adv.disbursedDate || null,
    disbursed_by: adv.disbursedBy || null,
    payment_reference: adv.paymentReference ? String(adv.paymentReference).trim() : null,
    policy_override: Boolean(adv.policyOverride),
    policy_override_by: adv.policyOverrideBy || null,
    policy_override_at: adv.policyOverrideAt || null,
    total_recovered_amount: adv.totalRecoveredAmount || 0,
    remaining_balance: adv.remainingBalance || 0,
    deduction_history: adv.deductionHistory || [],
    updated_at: updatedAt,
  };
}
