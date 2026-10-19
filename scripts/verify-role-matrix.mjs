import fs from 'node:fs';
import { generateFullRolePermissions } from '../src/factoryStore.js';

const perms = generateFullRolePermissions(true);
const roles = Object.keys(perms);
if (roles.length !== 10) {
  throw new Error(`Expected 10 roles, found ${roles.length}: ${roles.join(', ')}`);
}

for (const role of roles) {
  const payroll = perms[role].employees === true;
  const allowed = role === 'Admin' || role === 'HR & Payroll Manager';
  if (payroll !== allowed) {
    throw new Error(`${role} employees flag is ${perms[role].employees}`);
  }
  if (perms[role].user_management === true && role !== 'Admin') {
    throw new Error(`${role} can open user management`);
  }
  if (perms[role].audit_logs === true && role !== 'Admin') {
    throw new Error(`${role} can open audit logs`);
  }
}

if (perms['Printing Operator'].printing_scheduler !== true || perms['Printing Operator'].dashboard !== true) {
  throw new Error('Printing Operator lost the scheduler screen');
}
if (perms['Printing Operator'].dispatch === true) {
  throw new Error('Printing Operator should not see dispatch');
}
if (perms['Shop Floor Operator'].production_records !== true) {
  throw new Error('Shop Floor Operator lost production records');
}

const auth = fs.readFileSync(new URL('../src/services/authService.js', import.meta.url), 'utf8');
if (auth.includes('password_hash') || auth.includes('samyak_erp_users')) {
  throw new Error('Login still consults the old password store');
}

const data = fs.readFileSync(new URL('../src/services/supabaseDataService.js', import.meta.url), 'utf8');
if (data.includes('password_hash') || data.includes('smtp_pass') || data.includes('USR-SETTING-${')) {
  throw new Error('Data service still writes a secret or a fake settings user');
}

console.log('role matrix and secret-write checks passed');
