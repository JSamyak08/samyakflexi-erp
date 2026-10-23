import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTING_PHASE,
  buildCanonical,
  buildHref,
  getRouteFromUrl,
  parseLocation,
  isRecoveryLocation,
  rememberReturnTo,
  consumeReturnTo,
  clearReturnTo,
  listReservedSections,
  resolveInternalPath,
} from '../src/utils/slugRouter.js';

const memory = new Map();
globalThis.sessionStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};

function parse(href) {
  const url = new URL(href, 'http://erp.local');
  return parseLocation({ pathname: url.pathname, search: url.search, hash: url.hash });
}

function canonical(href) {
  const route = parse(href);
  assert.equal(route.unknown, false, `${href} should resolve`);
  return route.canonical;
}

const CANONICAL = [
  ['/login', 'login', 'signin'],
  ['/login/forgot-password', 'login', 'forgot-password'],
  ['/reset-password', 'login', 'recovery'],
  ['/dashboard', 'dashboard', 'home'],
  ['/sales', 'sales', 'quotations'],
  ['/sales/quotations/new', 'sales', 'quotation-new'],
  ['/sales/quotations/QTN-1', 'sales', 'quotation'],
  ['/scrap', 'scrap_analytics', 'registry'],
  ['/job-punching', 'job_punching', 'form'],
  ['/orders', 'orders', 'orders'],
  ['/orders/requirements', 'orders', 'requirements'],
  ['/orders/ORD-1', 'orders', 'order'],
  ['/job-masters', 'job_masters', 'directory'],
  ['/job-masters/new', 'job_masters', 'new'],
  ['/job-masters/JM-1', 'job_masters', 'job'],
  ['/job-masters/JM-1/job-card', 'job_masters', 'job-card'],
  ['/clients', 'clients', 'directory'],
  ['/clients/new', 'clients', 'new'],
  ['/clients/CL-1', 'clients', 'client'],
  ['/printing', 'printing_scheduler', 'queue'],
  ['/printing/completed', 'printing_scheduler', 'completed'],
  ['/printing/presses', 'printing_scheduler', 'presses'],
  ['/production', 'production_records', 'punched-jobs'],
  ['/production/records', 'production_records', 'records'],
  ['/production/records/new', 'production_records', 'record-new'],
  ['/production/records/REC-1', 'production_records', 'record'],
  ['/production/job-cards', 'production_records', 'job-cards'],
  ['/production/job-cards/JC-1', 'production_records', 'job-card'],
  ['/production/scrap', 'production_records', 'scrap'],
  ['/production/job-data-sheets', 'production_records', 'job-data-sheets'],
  ['/production/job-data-sheets/new', 'production_records', 'sheet-new'],
  ['/production/job-data-sheets/JDS-1', 'production_records', 'sheet'],
  ['/sfg-fg', 'sfg_store', 'available'],
  ['/sfg-fg/qc-hold', 'sfg_store', 'qc-hold'],
  ['/sfg-fg/scrap', 'sfg_store', 'scrap'],
  ['/sfg-fg/BATCH-1', 'sfg_store', 'batch'],
  ['/sfg-fg/BATCH-1/consume', 'sfg_store', 'consume'],
  ['/cylinders', 'cylinders', 'directory'],
  ['/cylinders/new', 'cylinders', 'new'],
  ['/cylinders/CYL-1', 'cylinders', 'cylinder'],
  ['/cylinders/CYL-1/job-card', 'cylinders', 'job-card'],
  ['/purchase-orders', 'purchase_orders', 'register'],
  ['/purchase-orders/new', 'purchase_orders', 'new'],
  ['/purchase-orders/PO-1', 'purchase_orders', 'po'],
  ['/inventory', 'inventory', 'stock'],
  ['/inventory/stock/ITEM-1', 'inventory', 'stock-item'],
  ['/inventory/issued-pos', 'inventory', 'issued-pos'],
  ['/inventory/grn', 'inventory', 'grn'],
  ['/inventory/grn/new', 'inventory', 'grn-new'],
  ['/inventory/qc', 'inventory', 'qc'],
  ['/inventory/reconciliation', 'inventory', 'reconciliation'],
  ['/inventory/issue-return', 'inventory', 'issue-return'],
  ['/inks', 'ink_management', 'directory'],
  ['/inks/calculator', 'ink_management', 'calculator'],
  ['/inks/stock', 'ink_management', 'stock'],
  ['/inks/new', 'ink_management', 'new'],
  ['/inks/INK-1', 'ink_management', 'ink'],
  ['/store', 'material_indents', 'store'],
  ['/store/indents', 'material_indents', 'indents'],
  ['/store/indents/new', 'material_indents', 'indent-new'],
  ['/store/indents/IND-1', 'material_indents', 'indent'],
  ['/store/issues', 'material_indents', 'issues'],
  ['/store/issues/new', 'material_indents', 'issue-new'],
  ['/pellet-fuel', 'pellet_fuel', 'consumption'],
  ['/pellet-fuel/inward', 'pellet_fuel', 'inward'],
  ['/pellet-fuel/consumption/new', 'pellet_fuel', 'consumption-new'],
  ['/pellet-fuel/consumption/CON-1', 'pellet_fuel', 'consumption-item'],
  ['/pellet-fuel/inward/new', 'pellet_fuel', 'inward-new'],
  ['/pellet-fuel/inward/GRN-1', 'pellet_fuel', 'inward-item'],
  ['/vendors', 'vendors', 'directory'],
  ['/vendors/new', 'vendors', 'new'],
  ['/vendors/VEN-1', 'vendors', 'vendor'],
  ['/dispatch', 'dispatch', 'packing'],
  ['/dispatch/packing/new', 'dispatch', 'packing-new'],
  ['/dispatch/challans', 'dispatch', 'challans'],
  ['/dispatch/challans/new', 'dispatch', 'challan-new'],
  ['/dispatch/challans/DC-1', 'dispatch', 'challan'],
  ['/dispatch/challans/DC-1/returns', 'dispatch', 'challan-returns'],
  ['/dispatch/coas', 'dispatch', 'coas'],
  ['/dispatch/coas/new', 'dispatch', 'coa-new'],
  ['/dispatch/coas/COA-1', 'dispatch', 'coa'],
  ['/employees', 'employees', 'directory'],
  ['/employees/new', 'employees', 'new'],
  ['/employees/attendance', 'employees', 'attendance'],
  ['/employees/overtime', 'employees', 'overtime'],
  ['/employees/advances', 'employees', 'advances'],
  ['/employees/advances/new', 'employees', 'advance-new'],
  ['/employees/payroll', 'employees', 'payroll'],
  ['/employees/EMP-1', 'employees', 'employee'],
  ['/employees/EMP-1/payslip', 'employees', 'payslip'],
  ['/users', 'user_management', 'directory'],
  ['/users/new', 'user_management', 'new'],
  ['/users/permissions', 'user_management', 'permissions'],
  ['/users/USR-1', 'user_management', 'user'],
  ['/supabase', 'supabase', 'status'],
  ['/supabase/credentials', 'supabase', 'credentials'],
  ['/supabase/schema', 'supabase', 'schema'],
  ['/supabase/auth', 'supabase', 'auth'],
  ['/settings', 'doc_settings', 'documents'],
  ['/settings/machines', 'doc_settings', 'machines'],
  ['/settings/machines/new', 'doc_settings', 'machine-new'],
  ['/settings/machines/MAC-1', 'doc_settings', 'machine'],
  ['/settings/material-rates', 'doc_settings', 'material-rates'],
  ['/settings/film-substrates', 'doc_settings', 'film-substrates'],
  ['/settings/storage-bays', 'doc_settings', 'storage-bays'],
  ['/settings/inventory-ageing', 'doc_settings', 'inventory-ageing'],
  ['/settings/email', 'doc_settings', 'email'],
  ['/settings/email-templates', 'doc_settings', 'email-templates'],
  ['/audit-logs', 'audit_logs', 'ledger'],
];

const LEGACY = [
  ['/', '/dashboard'],
  ['/index.html', '/dashboard'],
  ['/sales-management', '/sales'],
  ['/clients-directory', '/clients'],
  ['/employee-management', '/employees'],
  ['/payroll', '/employees/payroll'],
  ['/attendance', '/employees/attendance'],
  ['/production-records', '/production'],
  ['/production-records?tab=list', '/production/records'],
  ['/production-records?tab=list&id=REC-1', '/production/records/REC-1'],
  ['/production-records?tab=new_record&orderId=ORD-1', '/production/records/new?orderId=ORD-1'],
  ['/production-records?tab=job_cards', '/production/job-cards'],
  ['/production-records?tab=job_cards&jobCardId=JC-1', '/production/job-cards/JC-1'],
  ['/production-records?tab=scrap_inventory', '/production/scrap'],
  ['/production-records?tab=punched_jobs', '/production'],
  ['/production-records/REC-1', '/production/records/REC-1'],
  ['/production-records?action=add_sfg', '/production?action=add-sfg'],
  ['/job-datasheet', '/production/job-data-sheets'],
  ['/job-datasheet/JDS-1', '/production/job-data-sheets/JDS-1'],
  ['/sfg-fg-store', '/sfg-fg'],
  ['/sfg-store', '/sfg-fg'],
  ['/printing-scheduler', '/printing'],
  ['/rotogravure-cylinders', '/cylinders'],
  ['/rotogravure-cylinders/CYL-1', '/cylinders/CYL-1'],
  ['/ink-management', '/inks'],
  ['/ink-master', '/inks'],
  ['/ink-costing', '/inks/calculator'],
  ['/material-indents', '/store'],
  ['/material-indents?subTab=indents', '/store/indents'],
  ['/material-indents?subTab=issues', '/store/issues'],
  ['/material-indents?subTab=pellet_fuel', '/pellet-fuel'],
  ['/purchase-orders', '/purchase-orders'],
  ['/purchase-order-management', '/purchase-orders'],
  ['/purchase-orders-hub', '/purchase-orders'],
  ['/issued-pos', '/inventory/issued-pos'],
  ['/inventory?tab=stock', '/inventory'],
  ['/inventory?tab=grn_inward', '/inventory/grn'],
  ['/inventory?tab=qc_approval', '/inventory/qc'],
  ['/inventory?tab=reconciliation', '/inventory/reconciliation'],
  ['/inventory?tab=issued_pos', '/inventory/issued-pos'],
  ['/inventory?tab=stock&id=ITEM-1', '/inventory/stock/ITEM-1'],
  ['/inventory/ITEM-1', '/inventory/stock/ITEM-1'],
  ['/finished-goods-dispatch', '/dispatch'],
  ['/dispatch-hub', '/dispatch'],
  ['/delivery-challan', '/dispatch/challans'],
  ['/delivery-challans', '/dispatch/challans'],
  ['/coa-hub', '/dispatch/coas'],
  ['/finished-goods-dispatch?subTab=coas', '/dispatch/coas'],
  ['/finished-goods-dispatch?subTab=challans&id=DC-1', '/dispatch/challans/DC-1'],
  ['/finished-goods-dispatch?coaId=COA-1', '/dispatch/coas/COA-1'],
  ['/user-management', '/users'],
  ['/supabase-integration', '/supabase'],
  ['/letterhead-settings', '/settings'],
  ['/letterhead-settings?tab=email_config', '/settings/email'],
  ['/letterhead-settings?tab=material_costs', '/settings/material-rates'],
  ['/scrap-wastage', '/scrap'],
  ['/scrap-analytics', '/scrap'],
  ['/orders?id=ORD-1', '/orders/ORD-1'],
  ['/orders?subtab=requirements', '/orders/requirements'],
  ['/job-masters?id=JM-1', '/job-masters/JM-1'],
  ['/clients-directory?id=CL-1', '/clients/CL-1'],
  ['/employee-management?subTab=attendance', '/employees/attendance'],
  ['/employee-management?subTab=overtime', '/employees/overtime'],
  ['/employee-management?subTab=advances', '/employees/advances'],
  ['/employee-management?subTab=payroll', '/employees/payroll'],
  ['/employee-management?subTab=directory', '/employees'],
  ['/inks?subTab=calculator', '/inks/calculator'],
  ['/inks?subTab=stock', '/inks/stock'],
  ['/pellet-fuel?subTab=inward', '/pellet-fuel/inward'],
  ['/sales-management?id=QTN-1', '/sales/quotations/QTN-1'],
  ['/vendors?id=VEN-1', '/vendors/VEN-1'],
  ['#/production-records?id=REC-1', '/production/records/REC-1'],
  ['#/production-records/REC-9', '/production/records/REC-9'],
  ['#production-records/REC-2', '/production/records/REC-2'],
  ['/?tab=inventory', '/inventory'],
  ['/?page=orders', '/orders'],
  ['/scrap?fy=FY%202026-27&filter=ALERTS_ONLY', '/scrap?fy=FY+2026-27&filter=ALERTS_ONLY'],
];

test('routing phase writes a path for every module section', () => {
  assert.equal(ROUTING_PHASE, 5);
});

test('every canonical URL round-trips through parse and build', () => {
  for (const [href, moduleKey, section] of CANONICAL) {
    const route = parse(href);
    assert.equal(route.unknown, false, href);
    assert.equal(route.tab, moduleKey, href);
    assert.equal(route.section, section, href);
    assert.equal(route.canonical, href, href);
    assert.equal(buildCanonical(route.tab, route.params), href, href);
  }
});

test('every legacy bookmark resolves to its canonical URL', () => {
  for (const [from, to] of LEGACY) {
    assert.equal(canonical(from), to, from);
  }
});

test('reserved section names are not swallowed as record ids', () => {
  const reserved = listReservedSections('inventory');
  for (const name of ['grn', 'qc', 'reconciliation', 'issued-pos', 'issue-return']) {
    assert.ok(reserved.includes(name), name);
    const route = parse(`/inventory/${name}`);
    assert.notEqual(route.section, 'stock-item', name);
  }
  const item = parse('/inventory/ITEM-1');
  assert.equal(item.section, 'stock-item');
  assert.equal(item.params.id, 'ITEM-1');
  const order = parse('/orders/requirements');
  assert.equal(order.section, 'requirements');
  const orderId = parse('/orders/ORD-1');
  assert.equal(orderId.section, 'order');
  assert.equal(orderId.params.id, 'ORD-1');
});

test('recovery hashes stay on the recovery screen and are not treated as routes', () => {
  const hash = '#access_token=abc&type=recovery';
  const route = parse(`/reset-password${hash}`);
  assert.equal(route.recovery, true);
  assert.equal(route.tab, 'login');
  assert.equal(route.section, 'recovery');
  assert.equal(isRecoveryLocation({ pathname: '/reset-password', search: '', hash }), true);
  assert.equal(isRecoveryLocation({ pathname: '/login', search: '', hash }), true);
  assert.equal(isRecoveryLocation({ pathname: '/inventory', search: '', hash: '' }), false);
  const code = parse('/reset-password?code=pkce-code');
  assert.equal(code.tab, 'login');
  assert.equal(isRecoveryLocation({ pathname: '/reset-password', search: '?code=pkce-code', hash: '' }), true);
});

test('return-to remembers a deep link and ignores the login page', () => {
  clearReturnTo();
  rememberReturnTo('/inventory/grn?q=pet');
  assert.equal(consumeReturnTo(), '/inventory/grn?q=pet');
  assert.equal(consumeReturnTo(), null);
  rememberReturnTo('/login');
  assert.equal(consumeReturnTo(), null);
  rememberReturnTo('/reset-password');
  assert.equal(consumeReturnTo(), null);
});

test('phase 5 writes section paths for the remaining modules and keeps record ids in the query', () => {
  assert.equal(buildHref('production_records', { tab: 'list', id: 'REC-1' }), '/production/records?id=REC-1');
  assert.equal(buildHref('inventory', { tab: 'grn_inward' }), '/inventory/grn');
  assert.equal(buildHref('employees', { subTab: 'payroll' }), '/employees/payroll');
  assert.equal(buildHref('dispatch', { subTab: 'coas', coaId: 'COA-1' }), '/dispatch/coas?coaId=COA-1');
  assert.equal(buildHref('ink_management', { subTab: 'calculator' }), '/inks/calculator');
  assert.equal(buildHref('ink_management', { subTab: 'stock' }), '/inks/stock');
  assert.equal(buildHref('pellet_fuel', { subTab: 'inward' }), '/pellet-fuel/inward');
  assert.equal(buildHref('material_indents', { subTab: 'indents' }), '/store/indents');
  assert.equal(buildHref('material_indents', { subTab: 'issues' }), '/store/issues');
  assert.equal(buildHref('material_indents', { subTab: 'pellet_fuel' }), '/pellet-fuel');
  assert.equal(buildHref('sales', { subTab: 'create' }), '/sales/quotations/new');
  assert.equal(buildHref('orders', { subtab: 'requirements' }), '/orders/requirements');
  assert.equal(buildHref('orders', { id: 'ORD-1' }), '/orders?id=ORD-1');
  assert.equal(buildHref('printing_scheduler', { tab: 'completed' }), '/printing/completed');
  assert.equal(buildHref('printing_scheduler', { tab: 'machines' }), '/printing/presses');
  assert.equal(buildHref('sfg_store', { tab: 'qchold' }), '/sfg-fg/qc-hold');
  assert.equal(buildHref('sfg_store', { tab: 'scrap' }), '/sfg-fg/scrap');
  assert.equal(buildHref('doc_settings', { tab: 'email_config' }), '/settings/email');
  assert.equal(buildHref('doc_settings', { tab: 'material_costs' }), '/settings/material-rates');
  assert.equal(buildHref('user_management', { subTab: 'rbac' }), '/users/permissions');
  assert.equal(buildHref('supabase', { subTab: 'schema' }), '/supabase/schema');
  assert.equal(buildHref('supabase', { subTab: 'config' }), '/supabase/credentials');
  assert.equal(buildHref('login', { section: 'forgot-password' }), '/login/forgot-password');
});

test('unknown paths and API paths stay distinguishable', () => {
  const missing = parse('/this-page-is-not-real');
  assert.equal(missing.unknown, true);
  assert.equal(resolveInternalPath('/api/send-email').kind, 'api');
  assert.equal(resolveInternalPath('/login').ok, true);
  assert.equal(resolveInternalPath('/nope').ok, false);
});

test('getRouteFromUrl keeps an unknown path instead of sending it to the dashboard', () => {
  const previous = globalThis.window;
  globalThis.window = { location: { pathname: '/this-page-is-not-real', search: '', hash: '' } };
  try {
    const route = getRouteFromUrl();
    assert.equal(route.unknown, true);
    assert.equal(route.tab, null);
    assert.equal(route.canonical, '/this-page-is-not-real');
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('canonical table covers every module that the sidebar can open', () => {
  const modules = new Set(CANONICAL.map((row) => row[1]));
  for (const key of [
    'login', 'dashboard', 'sales', 'scrap_analytics', 'job_punching', 'orders', 'job_masters',
    'clients', 'printing_scheduler', 'production_records', 'sfg_store', 'cylinders',
    'purchase_orders', 'inventory', 'ink_management', 'material_indents', 'pellet_fuel',
    'vendors', 'dispatch', 'employees', 'user_management', 'supabase', 'doc_settings', 'audit_logs',
  ]) {
    assert.ok(modules.has(key), key);
  }
});
