/**
 * Run and idle analytics is limited to Admin, Plant Manager, and Production Manager.
 * The role check is the gate. An explicit false in the permission matrix hides it
 * for Plant Manager and Production Manager. A missing key keeps the default, allow.
 * Admin is not locked out by the matrix. Other roles stay out even if the flag is on.
 */
import { assignedRolesOf } from '../assignedRoles.js';
import { PRINT_RUN_ANALYTICS_ROLES } from '../factoryStore.js';

export function canViewPrintRunAnalytics(user, matrix) {
  const roles = assignedRolesOf(user).filter((role) => PRINT_RUN_ANALYTICS_ROLES.includes(role));
  if (!roles.length) return false;
  if (roles.includes('Admin')) return true;
  if (!matrix || typeof matrix !== 'object') return true;
  return roles.some((role) => matrix[role]?.print_run_analytics !== false);
}
