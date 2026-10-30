/**
 * Which boot reads and browser caches a signed-in role may keep.
 * A user may have several plant roles. Access is the union of those roles.
 * Admin can open every module. user_management and audit_logs stay Admin-only,
 * matching isTabAllowed. Payroll tables stay with Admin and HR even when the
 * employees flag is on for another role, because that screen does not load them.
 */

function asRoleList(roleOrRoles) {
  if (Array.isArray(roleOrRoles)) {
    return roleOrRoles
      .filter((role) => typeof role === 'string' && role.trim())
      .map((role) => role.trim());
  }
  if (typeof roleOrRoles === 'string' && roleOrRoles.trim()) return [roleOrRoles.trim()];
  return [];
}

export function roleHasModule(matrix, roleOrRoles, moduleKey) {
  const roles = asRoleList(roleOrRoles);
  if (!roles.length || !moduleKey) return false;
  if (roles.includes('Admin')) return true;
  if (moduleKey === 'user_management' || moduleKey === 'audit_logs') return false;
  return roles.some((role) => matrix?.[role]?.[moduleKey] === true);
}

export function roleNeedsAny(matrix, roleOrRoles, moduleKeys) {
  return (moduleKeys || []).some((key) => roleHasModule(matrix, roleOrRoles, key));
}

export function canReadPayroll(roleOrRoles) {
  const roles = asRoleList(roleOrRoles);
  return roles.includes('Admin') || roles.includes('HR & Payroll Manager');
}

export const BOOT_NEEDS = {
  orders: ['orders', 'job_punching', 'sales', 'production_records', 'printing_scheduler', 'dispatch', 'inventory', 'scrap_analytics'],
  jobMasters: ['job_masters', 'job_punching', 'orders', 'cylinders', 'printing_scheduler', 'production_records'],
  inventory: ['inventory', 'material_indents', 'purchase_orders', 'production_records', 'printing_scheduler', 'ink_management', 'pellet_fuel', 'dispatch'],
  cylinders: ['cylinders', 'job_masters', 'printing_scheduler', 'orders'],
  vendors: ['vendors', 'purchase_orders', 'inventory', 'ink_management', 'pellet_fuel'],
  clients: ['clients', 'sales', 'orders', 'job_punching', 'dispatch'],
  machines: ['printing_scheduler', 'production_records', 'doc_settings', 'material_indents'],
  schedules: ['printing_scheduler', 'production_records'],
  grns: ['inventory', 'purchase_orders', 'pellet_fuel'],
  productionRecords: ['production_records', 'scrap_analytics', 'printing_scheduler', 'dispatch'],
  datasheets: ['job_masters', 'production_records', 'scrap_analytics', 'job_punching'],
  rolls: ['inventory', 'material_indents', 'production_records', 'printing_scheduler'],
  shipments: ['dispatch', 'sales', 'inventory'],
  inks: ['ink_management', 'inventory'],
  sfg: ['production_records', 'inventory', 'printing_scheduler', 'sfg_store'],
  challans: ['dispatch', 'sales', 'inventory'],
  coas: ['inventory', 'production_records', 'dispatch'],
  pellets: ['pellet_fuel', 'inventory'],
  purchaseOrders: ['purchase_orders', 'inventory'],
  indents: ['material_indents', 'inventory'],
  barcodes: ['barcodes'],
};

const MODULE_CACHE_KEYS = {
  orders: ['samyak_cache_orders'],
  job_masters: ['samyak_cache_job_masters', 'samyak_cache_job_datasheets'],
  inventory: ['samyak_cache_inventory', 'samyak_cache_grns', 'samyak_cache_inventory_rolls'],
  cylinders: ['samyak_cache_cylinders'],
  vendors: ['samyak_cache_vendors'],
  clients: ['samyak_cache_clients'],
  printing_scheduler: ['samyak_cache_printing_machines', 'samyak_cache_production_schedules'],
  production_records: ['samyak_cache_production_records', 'samyak_cache_certificate_of_analyses'],
  ink_management: ['samyak_cache_inks'],
  dispatch: ['samyak_cache_dispatch_shipments', 'samyak_cache_delivery_challans'],
  sfg_store: ['samyak_cache_sfg_goods'],
  pellet_fuel: ['samyak_cache_pellet_inwards', 'samyak_cache_pellet_consumptions'],
  barcodes: ['samyak_cache_barcode_registry'],
  purchase_orders: ['samyak_cache_purchase_orders'],
  audit_logs: ['samyak_cache_audit_logs', 'samyak_erp_audit_logs'],
};

const PAYROLL_CACHE_KEYS = [
  'samyak_cache_employees',
  'samyak_cache_employee_attendance',
  'samyak_cache_salary_advances',
  'samyak_cache_salary_payments',
];

export function cachesToDrop(matrix, role) {
  const keys = [];
  Object.entries(MODULE_CACHE_KEYS).forEach(([moduleKey, storageKeys]) => {
    if (!roleHasModule(matrix, role, moduleKey)) keys.push(...storageKeys);
  });
  if (!canReadPayroll(role)) keys.push(...PAYROLL_CACHE_KEYS);
  return [...new Set(keys)];
}
