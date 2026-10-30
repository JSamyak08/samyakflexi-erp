import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { generateFullRolePermissions } from '../src/factoryStore.js';
import { roleHasModule, canReadPayroll, cachesToDrop } from '../src/bootAccess.js';
import {
  assignedRolesOf,
  primaryRole,
  resolveAccountRoles,
  userHasRole,
} from '../src/assignedRoles.js';
import { mapDirectoryUser } from '../src/utils/activeUserLabel.js';
import { canManageOrderDeadline } from '../src/utils/orderDeadlineReminder.js';

const matrix = generateFullRolePermissions(false);

test('a single role keeps the same module result as before', () => {
  assert.equal(roleHasModule(matrix, 'Store Manager', 'purchase_orders'), true);
  assert.equal(roleHasModule(matrix, 'Store Manager', 'sales'), false);
  assert.equal(roleHasModule(matrix, 'Sales Manager', 'sales'), true);
  assert.equal(roleHasModule(matrix, 'Sales Manager', 'purchase_orders'), false);
  assert.equal(roleHasModule(matrix, 'QC Chemist', 'production_records'), true);
  assert.equal(roleHasModule(matrix, 'QC Chemist', 'sales'), false);
  assert.equal(roleHasModule(matrix, 'Plant Manager', 'user_management'), false);
  assert.equal(roleHasModule(matrix, 'Plant Manager', 'audit_logs'), false);
  assert.equal(roleHasModule(matrix, 'Admin', 'audit_logs'), true);
  assert.equal(roleHasModule(matrix, 'Admin', 'user_management'), true);
  assert.equal(canReadPayroll('Store Manager'), false);
  assert.equal(canReadPayroll('HR & Payroll Manager'), true);
  assert.equal(canReadPayroll('Admin'), true);
});

test('effective permissions are the union of every assigned role', () => {
  const roles = ['Store Manager', 'Sales Manager'];
  assert.equal(roleHasModule(matrix, roles, 'purchase_orders'), true);
  assert.equal(roleHasModule(matrix, roles, 'sales'), true);
  assert.equal(roleHasModule(matrix, roles, 'clients'), true);
  assert.equal(roleHasModule(matrix, roles, 'production_records'), false);
  assert.equal(roleHasModule(matrix, roles, 'user_management'), false);
  assert.equal(roleHasModule(matrix, roles, 'audit_logs'), false);
  assert.equal(roleHasModule(matrix, ['Plant Manager', 'Store Manager'], 'user_management'), false);
  assert.equal(roleHasModule(matrix, ['Admin', 'Store Manager'], 'audit_logs'), true);
  assert.equal(canReadPayroll(['Store Manager', 'Sales Manager']), false);
  assert.equal(canReadPayroll(['Store Manager', 'HR & Payroll Manager']), true);

  const user = { role: 'Store Manager', roles };
  assert.equal(userHasRole(user, 'Sales Manager'), true);
  assert.equal(userHasRole(user, 'Admin'), false);
  assert.equal(canManageOrderDeadline('Store Manager'), false);
  assert.equal(canManageOrderDeadline(roles), true);
  assert.equal(canManageOrderDeadline(user), true);

  const dropped = cachesToDrop(matrix, roles);
  assert.equal(dropped.includes('samyak_cache_inventory'), false);
  assert.equal(dropped.includes('samyak_cache_audit_logs'), true);
});

test('backfill and primary role keep the existing role unless Admin is assigned', () => {
  const stored = mapDirectoryUser({
    id: 'USR-QA-STORE-MANAGER',
    username: 'store.lead',
    full_name: 'Store Lead',
    role: 'Store Manager',
    department: 'Store & Raw Material',
    active: true,
    status: 'Active',
  });
  assert.deepEqual(stored.roles, ['Store Manager']);
  assert.equal(stored.role, 'Store Manager');

  const kept = resolveAccountRoles(
    { roles: ['Sales Manager', 'Store Manager'] },
    'Store Manager',
  );
  assert.deepEqual(kept.roles, ['Store Manager', 'Sales Manager']);
  assert.equal(kept.role, 'Store Manager');
  assert.equal(primaryRole(kept.roles, 'Store Manager'), 'Store Manager');

  const promoted = resolveAccountRoles(
    { roles: ['Store Manager', 'Admin'] },
    'Store Manager',
  );
  assert.equal(promoted.role, 'Admin');
  assert.deepEqual(promoted.roles, ['Admin', 'Store Manager']);

  const legacy = resolveAccountRoles({ role: 'QC Chemist' }, 'Store Manager');
  assert.deepEqual(legacy.roles, ['QC Chemist']);
  assert.equal(legacy.role, 'QC Chemist');

  const cleared = resolveAccountRoles({ roles: ['Made Up Role'] }, 'Store Manager');
  assert.deepEqual(cleared.roles, []);
  assert.equal(cleared.role, '');

  const fromColumn = assignedRolesOf({ role: 'Shop Floor Operator' });
  assert.deepEqual(fromColumn, ['Shop Floor Operator']);
});

test('the plant role field is a multi-select of the FlexiERP roles', async () => {
  const server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const mod = await server.ssrLoadModule('/src/components/AssignedPlantRoleField.jsx');
    const Field = mod.default;
    const html = renderToStaticMarkup(
      React.createElement(Field, {
        roles: ['Store Manager', 'Sales Manager'],
        primary: 'Store Manager',
        onToggle: () => {},
      }),
    );
    const boxes = html.match(/type="checkbox"/g) || [];
    assert.equal(boxes.length, 10);
    assert.match(html, /Store Manager/);
    assert.match(html, /Sales Manager/);
    assert.match(html, /Plant Manager/);
    assert.match(html, /Operations &amp; Plant/);
    assert.match(html, /QC Chemist/);
    assert.match(html, /Purchase Manager/);
    assert.match(html, /Shop Floor Operator/);
    assert.match(html, /Admin/);
    assert.match(html, /Primary/);
    assert.match(html, /value="Store Manager"/);
    assert.match(html, /value="Sales Manager"/);
  } finally {
    await server.close();
  }
});
