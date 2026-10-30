/**
 * Multiple plant roles for one user.
 *
 * public.users.role stays the primary role so older screens and the Admin
 * check keep working. assigned_roles holds every role. Effective access is
 * the union. Admin in the set becomes the primary role, which is the same
 * Admin check the directory already uses.
 */
import { SYSTEM_ROLES } from './roles.js';

export const PLANT_ROLE_OPTIONS = [
  { role: 'Admin', dept: 'Executive Management' },
  { role: 'Plant Manager', dept: 'Operations & Plant' },
  { role: 'HR & Payroll Manager', dept: 'Human Resources & Admin' },
  { role: 'Production Manager', dept: 'Operations & Plant' },
  { role: 'Store Manager', dept: 'Store & Raw Material' },
  { role: 'QC Chemist', dept: 'Quality Control Lab' },
  { role: 'Purchase Manager', dept: 'Purchase & Commercial' },
  { role: 'Sales Manager', dept: 'Sales & Commercial' },
  { role: 'Printing Operator', dept: 'Rotogravure Printing' },
  { role: 'Shop Floor Operator', dept: 'Lamination & Printing' },
];

export function departmentForRole(role) {
  return PLANT_ROLE_OPTIONS.find((item) => item.role === role)?.dept || '';
}

export function normalizeAssignedRoles(roles) {
  const seen = new Set();
  const incoming = Array.isArray(roles) ? roles : [];
  incoming.forEach((value) => {
    const role = typeof value === 'string' ? value.trim() : '';
    if (SYSTEM_ROLES.includes(role)) seen.add(role);
  });
  return SYSTEM_ROLES.filter((role) => seen.has(role));
}

/**
 * Roles that actually grant access: the stored list plus the primary column.
 * A string or a bare array is accepted so older single-role checks still work.
 */
export function assignedRolesOf(user) {
  if (!user) return [];
  if (typeof user === 'string') return normalizeAssignedRoles([user]);
  if (Array.isArray(user)) return normalizeAssignedRoles(user);
  return normalizeAssignedRoles([
    ...(Array.isArray(user.roles) ? user.roles : []),
    ...(Array.isArray(user.assigned_roles) ? user.assigned_roles : []),
    user.role,
  ]);
}

export function userHasRole(user, role) {
  return assignedRolesOf(user).includes(role);
}

/**
 * Primary role written back to users.role.
 * Admin wins so directory Admin checks stay aligned with the assignment.
 * Otherwise the previous primary is kept when it is still selected.
 */
export function primaryRole(roles, previousPrimary = '') {
  const list = normalizeAssignedRoles(roles);
  if (list.includes('Admin')) return 'Admin';
  const previous = typeof previousPrimary === 'string' ? previousPrimary.trim() : '';
  if (previous && list.includes(previous)) return previous;
  return list[0] || '';
}

/**
 * Form and admin API payload.
 * An explicit roles array is the whole assignment, even when empty.
 * A missing roles array keeps the single role field used by older clients.
 */
export function resolveAccountRoles(input, previousRole = '') {
  const hasRolesField = Array.isArray(input?.roles);
  const roles = hasRolesField
    ? normalizeAssignedRoles(input.roles)
    : normalizeAssignedRoles([input?.role || previousRole]);
  return {
    roles,
    role: primaryRole(roles, previousRole || input?.role || ''),
  };
}
