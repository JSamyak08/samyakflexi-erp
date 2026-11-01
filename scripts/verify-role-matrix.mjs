import fs from 'node:fs';
import { generateFullRolePermissions } from '../src/factoryStore.js';

const perms = generateFullRolePermissions(true);
const roles = Object.keys(perms);
if (roles.length !== 10) {
  throw new Error(`Expected 10 roles, found ${roles.length}: ${roles.join(', ')}`);
}

function expect(role, key, value) {
  if (perms[role][key] !== value) {
    throw new Error(`${role}.${key} is ${perms[role][key]}, expected ${value}`);
  }
}

expect('Admin', 'employees', true);
expect('Admin', 'user_management', true);
expect('Admin', 'purchase_orders', true);
expect('Admin', 'audit_logs', true);

expect('Plant Manager', 'employees', true);
expect('Plant Manager', 'user_management', true);
expect('Plant Manager', 'purchase_orders', true);

expect('HR & Payroll Manager', 'employees', true);
expect('HR & Payroll Manager', 'user_management', true);
expect('HR & Payroll Manager', 'purchase_orders', false);

expect('Production Manager', 'employees', true);
expect('Production Manager', 'user_management', false);
expect('Production Manager', 'purchase_orders', true);
expect('Production Manager', 'sales', true);

expect('Store Manager', 'purchase_orders', true);
expect('Store Manager', 'employees', false);
expect('Purchase Manager', 'purchase_orders', true);
expect('Sales Manager', 'purchase_orders', false);
expect('QC Chemist', 'purchase_orders', false);
expect('Printing Operator', 'purchase_orders', false);
expect('Shop Floor Operator', 'purchase_orders', false);

expect('Printing Operator', 'printing_scheduler', true);
expect('Printing Operator', 'dashboard', false);
expect('Printing Operator', 'inventory', true);
expect('Shop Floor Operator', 'production_records', false);
expect('Shop Floor Operator', 'printing_scheduler', true);
expect('Shop Floor Operator', 'inventory', true);

for (const role of ['Printing Operator', 'Shop Floor Operator']) {
  expect(role, 'inventory', true);
  expect(role, 'printing_scheduler', true);
  expect(role, 'sfg_store', 'view');
  expect(role, 'dispatch', false);
  expect(role, 'pellet_fuel', false);
  expect(role, 'dashboard', false);
  expect(role, 'production_records', false);
  expect(role, 'audit_logs', false);
}

expect('Admin', 'dispatch', true);
expect('Admin', 'sfg_store', true);
expect('Admin', 'pellet_fuel', true);
expect('Store Manager', 'dispatch', true);
expect('Store Manager', 'pellet_fuel', true);
expect('Sales Manager', 'dispatch', true);
expect('Sales Manager', 'pellet_fuel', false);
expect('QC Chemist', 'dispatch', true);
expect('QC Chemist', 'pellet_fuel', true);
expect('Purchase Manager', 'dispatch', false);
expect('Purchase Manager', 'pellet_fuel', true);
expect('Production Manager', 'sfg_store', true);

for (const role of roles) {
  expect(role, 'audit_logs', role === 'Admin');
}

const auth = fs.readFileSync(new URL('../src/services/authService.js', import.meta.url), 'utf8');
if (auth.includes('password_hash') || auth.includes('samyak_erp_users')) {
  throw new Error('Login still consults the old password store');
}

const data = fs.readFileSync(new URL('../src/services/supabaseDataService.js', import.meta.url), 'utf8');
if (data.includes('password_hash') || data.includes('smtp_pass') || data.includes('USR-SETTING-${')) {
  throw new Error('Data service still writes a secret or a fake settings user');
}
if (data.includes("next.employees = role === 'Admin'")) {
  throw new Error('Saving the matrix still strips the live employees grants');
}

console.log('role matrix and secret-write checks passed');
