import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateFullRolePermissions, ALL_MODULES, SYSTEM_ROLES } from '../src/factoryStore.js';
import {
  roleHasModule,
  roleCanEditSfgStore,
  firstAllowedModule,
  nextModuleForDeniedTab,
} from '../src/bootAccess.js';
import { nextSfgStorePermission, sfgStoreUi } from '../src/sfgStoreAccess.js';

const defaults = generateFullRolePermissions(false);
const operators = ['Printing Operator', 'Shop Floor Operator'];
const operatorModules = ['inventory', 'printing_scheduler', 'sfg_store'];

test('operator defaults open only inventory, printing, and view-only SFG store', () => {
  operators.forEach((role) => {
    const row = defaults[role];
    ALL_MODULES.forEach((mod) => {
      if (mod.key === 'inventory' || mod.key === 'printing_scheduler') {
        assert.equal(row[mod.key], true, `${role} ${mod.key}`);
      } else if (mod.key === 'sfg_store') {
        assert.equal(row[mod.key], 'view', role);
      } else {
        assert.equal(row[mod.key], false, `${role} ${mod.key}`);
      }
    });
    assert.equal(roleHasModule(defaults, role, 'inventory'), true);
    assert.equal(roleHasModule(defaults, role, 'printing_scheduler'), true);
    assert.equal(roleHasModule(defaults, role, 'sfg_store'), true);
    assert.equal(roleHasModule(defaults, role, 'dispatch'), false);
    assert.equal(roleHasModule(defaults, role, 'pellet_fuel'), false);
    assert.equal(roleHasModule(defaults, role, 'dashboard'), false);
    assert.equal(roleHasModule(defaults, role, 'production_records'), false);
    assert.equal(roleCanEditSfgStore(defaults, role), false);
    assert.equal(firstAllowedModule(defaults, role), 'printing_scheduler');
  });
});

test('operators keep full write on inventory and the printing scheduler', () => {
  operators.forEach((role) => {
    assert.equal(defaults[role].inventory, true);
    assert.equal(defaults[role].printing_scheduler, true);
    assert.equal(roleHasModule(defaults, role, 'inventory'), true);
    assert.equal(roleHasModule(defaults, role, 'printing_scheduler'), true);
    assert.notEqual(defaults[role].inventory, 'view');
    assert.notEqual(defaults[role].printing_scheduler, 'view');
  });

  const scheduler = fs.readFileSync(new URL('../src/components/ProductionScheduler.jsx', import.meta.url), 'utf8');
  const inventory = fs.readFileSync(new URL('../src/components/InventoryManagement.jsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(scheduler, /onStartJob/);
  assert.match(scheduler, /onEndJob/);
  assert.doesNotMatch(scheduler, /sfgStoreUi|canEditStore|view-only/);
  assert.match(inventory, /Add Stock Item/);
  assert.match(inventory, /Inward GRN/);
  assert.doesNotMatch(inventory, /sfgStoreUi|canEditStore/);
  assert.match(app, /recordPrintRun\(order\.id, 'start'/);
  assert.match(app, /recordPrintRun\(order\.id, 'end'/);
  assert.match(app, /handleSaveInventoryItem/);
});

test('another role is unioned, and other roles keep their own modules', () => {
  const combined = {
    ...defaults,
    'Store Manager': {
      ...defaults['Store Manager'],
      sfg_store: true,
      inventory: true,
    },
  };
  const both = ['Printing Operator', 'Store Manager'];
  assert.equal(roleHasModule(combined, both, 'sfg_store'), true);
  assert.equal(roleCanEditSfgStore(combined, both), true);
  assert.equal(roleHasModule(combined, both, 'dispatch'), true);
  assert.equal(roleHasModule(combined, both, 'purchase_orders'), true);
  assert.equal(roleCanEditSfgStore(combined, { role: 'Printing Operator', roles: both }), true);

  assert.equal(roleCanEditSfgStore(defaults, 'Store Manager'), true);
  assert.equal(roleCanEditSfgStore(defaults, 'Sales Manager'), false);
  assert.equal(defaults['Sales Manager'].dispatch, true);
  assert.equal(defaults['Sales Manager'].pellet_fuel, false);
  assert.equal(defaults['QC Chemist'].dispatch, true);
  assert.equal(defaults['Production Manager'].sfg_store, true);
  assert.equal(defaults.Admin.audit_logs, true);
  assert.equal(SYSTEM_ROLES.includes('Printing Operator'), true);
});

test('denied dispatch and pellet links go to the first allowed module', () => {
  operators.forEach((role) => {
    assert.equal(nextModuleForDeniedTab(defaults, role, 'dispatch'), 'printing_scheduler');
    assert.equal(nextModuleForDeniedTab(defaults, role, 'pellet_fuel'), 'printing_scheduler');
    assert.equal(nextModuleForDeniedTab(defaults, role, 'dashboard'), 'printing_scheduler');
    assert.equal(nextModuleForDeniedTab(defaults, role, 'inventory'), 'inventory');
    assert.equal(nextModuleForDeniedTab(defaults, role, 'printing_scheduler'), 'printing_scheduler');
    assert.equal(nextModuleForDeniedTab(defaults, role, 'sfg_store'), 'sfg_store');
  });
  assert.equal(nextModuleForDeniedTab(defaults, 'Admin', 'dispatch'), 'dispatch');
  assert.equal(nextModuleForDeniedTab(defaults, 'Admin', 'pellet_fuel'), 'pellet_fuel');

  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /nextModuleForDeniedTab\(/);
});

test('SFG store view-only hides mutations and keeps search', () => {
  const view = sfgStoreUi(false);
  assert.equal(view.canSearch, true);
  assert.equal(view.canFilter, true);
  assert.equal(view.canLookup, true);
  assert.equal(view.canAddBatch, false);
  assert.equal(view.canConsume, false);
  assert.equal(view.canMove, false);
  assert.equal(view.canDispatch, false);
  assert.equal(view.canAdjust, false);
  assert.equal(view.canDelete, false);
  assert.equal(view.canApproveHold, false);
  assert.equal(view.canScrap, false);

  const edit = sfgStoreUi(true);
  assert.equal(edit.canAddBatch, true);
  assert.equal(edit.canConsume, true);
  assert.equal(edit.canDelete, true);

  assert.equal(nextSfgStorePermission(false), true);
  assert.equal(nextSfgStorePermission('view'), false);
  assert.equal(nextSfgStorePermission(true), 'view');

  operatorModules.forEach((key) => assert.ok(ALL_MODULES.some((mod) => mod.key === key)));
  const screen = fs.readFileSync(new URL('../src/components/SFGStoreManagement.jsx', import.meta.url), 'utf8');
  assert.match(screen, /data-testid="sfg-store-search"/);
  assert.match(screen, /data-testid="sfg-store-view-only"/);
  assert.match(screen, /storeUi\.canAddBatch/);
  assert.match(screen, /storeUi\.canConsume/);
  assert.match(screen, /storeUi\.canMove/);
  assert.match(screen, /storeUi\.canScrap/);
});
