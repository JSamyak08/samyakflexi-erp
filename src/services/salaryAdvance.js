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
  return String(role || '').trim().toLowerCase() === 'admin';
}

// Matches salary_advances RLS: Admin, or HR & Payroll Manager.
// Plant, director, and owner are not approvers.
export function canApproveSalaryAdvanceRole(role, { anonymous = false } = {}) {
  if (anonymous) return true;
  const roleStr = String(role || '').trim().toLowerCase();
  return roleStr === 'admin' || roleStr.includes('hr');
}
