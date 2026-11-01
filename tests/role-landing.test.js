import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { firstAllowedModule } from '../src/bootAccess.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/factoryStore.js';

const productionLike = {
  ...DEFAULT_ROLE_PERMISSIONS,
  'Printing Operator': {
    ...DEFAULT_ROLE_PERMISSIONS['Printing Operator'],
    dashboard: false,
    printing_scheduler: true,
    production_records: false,
  },
  'Shop Floor Operator': {
    ...DEFAULT_ROLE_PERMISSIONS['Shop Floor Operator'],
    dashboard: false,
    printing_scheduler: true,
    production_records: true,
  },
  'Store Manager': {
    ...DEFAULT_ROLE_PERMISSIONS['Store Manager'],
    dashboard: false,
    inventory: true,
  },
  'Sales Manager': {
    ...DEFAULT_ROLE_PERMISSIONS['Sales Manager'],
    dashboard: false,
    sales: true,
  },
  'QC Chemist': {
    ...DEFAULT_ROLE_PERMISSIONS['QC Chemist'],
    dashboard: false,
    production_records: true,
    inventory: true,
  },
};

test('denied dashboard landings open the first module that role can use', () => {
  assert.equal(firstAllowedModule(productionLike, 'Printing Operator'), 'printing_scheduler');
  assert.equal(firstAllowedModule(productionLike, { role: 'Printing Operator', roles: ['Printing Operator'] }), 'printing_scheduler');
  assert.equal(firstAllowedModule(productionLike, 'Shop Floor Operator'), 'production_records');
  assert.equal(firstAllowedModule(productionLike, 'Store Manager'), 'inventory');
  assert.equal(firstAllowedModule(productionLike, 'Sales Manager'), 'sales');
  assert.equal(firstAllowedModule(productionLike, 'QC Chemist'), 'production_records');
  assert.equal(firstAllowedModule(productionLike, 'Admin'), 'dashboard');
  assert.equal(firstAllowedModule(DEFAULT_ROLE_PERMISSIONS, 'Admin'), 'dashboard');
  assert.equal(firstAllowedModule(DEFAULT_ROLE_PERMISSIONS, 'Printing Operator'), 'printing_scheduler');
  assert.equal(firstAllowedModule(DEFAULT_ROLE_PERMISSIONS, 'Shop Floor Operator'), 'printing_scheduler');
});

test('sign-in does not write an audit row and the restricted screen uses the lucide Lock', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const lucide = app.match(/import\s*\{[\s\S]*?\}\s*from\s*'lucide-react'/);
  assert.ok(lucide);
  assert.match(lucide[0], /\bLock\b/);
  assert.doesNotMatch(app, /logAudit\('AUTH'/);
  assert.match(app, /firstAllowedModule\(/);
  assert.match(app, /assignedRolesOf\(currentUser \|\| sessionProfile\)\.includes\('Admin'\)/);
});
