/**
 * Plant roles. Keep this list in step with private.app_role() in
 * supabase/migrations/20261024023000_auth_rls_lockdown.sql and with
 * private.app_roles() in
 * supabase/migrations/20261030210000_user_assigned_roles.sql.
 */
export const SYSTEM_ROLES = [
  'Admin',
  'Plant Manager',
  'HR & Payroll Manager',
  'Production Manager',
  'Store Manager',
  'QC Chemist',
  'Purchase Manager',
  'Sales Manager',
  'Printing Operator',
  'Shop Floor Operator',
];
