import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTING_PHASE,
  buildCanonical,
  buildHref,
  getRouteFromUrl,
  parseLocation,
  pushSlugState,
  sameRoute,
  isRecoveryLocation,
  isAuthCallbackLocation,
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
  ['/auth/confirm', 'login', 'confirm'],
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
  ['/printing/jobs/ORD-1', 'printing_scheduler', 'job'],
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
  ['/barcodes', 'barcodes', 'registry'],
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

test('routing phase keeps legacy selectors in the parser and out of new links', () => {
  assert.equal(ROUTING_PHASE, 7);
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
  const confirm = parse('/auth/confirm?token_hash=abc&type=recovery&next=/reset-password');
  assert.equal(confirm.tab, 'login');
  assert.equal(confirm.section, 'confirm');
  assert.equal(isRecoveryLocation({ pathname: '/auth/confirm', search: '?token_hash=abc&type=recovery', hash: '' }), true);
  assert.equal(isAuthCallbackLocation({ pathname: '/auth/confirm', search: '?token_hash=abc&type=signup', hash: '' }), true);
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

test('phase 7 still opens the detail paths and does not write legacy selector query keys', () => {
  for (const href of [
    buildHref('inventory', { tab: 'grn_inward' }),
    buildHref('employees', { subTab: 'payroll' }),
    buildHref('orders', { subtab: 'requirements' }),
    buildHref('dispatch', { subTab: 'challans', id: 'DC-1' }),
    buildHref('ink_management', { section: 'calculator' }),
  ]) {
    assert.equal(href.includes('tab='), false, href);
    assert.equal(href.includes('subTab='), false, href);
    assert.equal(href.includes('subtab='), false, href);
  }
  assert.equal(buildHref('inventory', { tab: 'grn_inward' }), '/inventory/grn');
  assert.equal(buildHref('employees', { subTab: 'payroll' }), '/employees/payroll');
  assert.equal(buildHref('orders', { subtab: 'requirements' }), '/orders/requirements');
});

test('phase 6 puts record ids in the path', () => {
  assert.equal(buildHref('orders', { id: 'ORD-1' }), '/orders/ORD-1');
  assert.equal(buildHref('orders', { subtab: 'requirements' }), '/orders/requirements');
  assert.equal(buildHref('production_records', { tab: 'list', id: 'REC-1' }), '/production/records/REC-1');
  assert.equal(buildHref('production_records', { tab: 'job_cards', jobCardId: 'JC-1' }), '/production/job-cards/JC-1');
  assert.equal(buildHref('production_records', { tab: 'new_record', orderId: 'ORD-1' }), '/production/records/new?orderId=ORD-1');
  assert.equal(buildHref('inventory', { tab: 'stock', id: 'ITEM-1' }), '/inventory/stock/ITEM-1');
  assert.equal(buildHref('inventory', { tab: 'grn_inward' }), '/inventory/grn');
  assert.equal(buildHref('clients', { id: 'CL-1' }), '/clients/CL-1');
  assert.equal(buildHref('job_masters', { id: 'JM-1' }), '/job-masters/JM-1');
  assert.equal(buildHref('vendors', { id: 'VEN-1' }), '/vendors/VEN-1');
  assert.equal(buildHref('cylinders', { id: 'CYL-1' }), '/cylinders/CYL-1');
  assert.equal(buildHref('ink_management', { id: 'INK-1' }), '/inks/INK-1');
  assert.equal(buildHref('ink_management', { subTab: 'calculator' }), '/inks/calculator');
  assert.equal(buildHref('dispatch', { subTab: 'challans', id: 'DC-1' }), '/dispatch/challans/DC-1');
  assert.equal(buildHref('dispatch', { subTab: 'coas', coaId: 'COA-1' }), '/dispatch/coas/COA-1');
  assert.equal(buildHref('employees', { id: 'EMP-1' }), '/employees/EMP-1');
  assert.equal(buildHref('employees', { subTab: 'payroll', id: 'EMP-1' }), '/employees/EMP-1/payslip');
  assert.equal(buildHref('sfg_store', { id: 'BATCH-1' }), '/sfg-fg/BATCH-1');
  assert.equal(buildHref('purchase_orders', { id: 'PO-1' }), '/purchase-orders/PO-1');
  assert.equal(buildHref('sales', { id: 'QTN-1' }), '/sales/quotations/QTN-1');
  assert.equal(buildHref('job_datasheet'), '/production/job-data-sheets');
  assert.equal(buildHref('job_datasheet', { id: 'JDS-1' }), '/production/job-data-sheets/JDS-1');
  assert.equal(buildHref('job_punching', { jobMasterId: 'JM-1' }), '/job-punching?jobMasterId=JM-1');
  assert.equal(buildHref('material_indents', { subTab: 'pellet_fuel' }), '/pellet-fuel');
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

function installHistory(initialHref) {
  const url = new URL(initialHref, 'http://erp.local');
  const loc = { pathname: url.pathname, search: url.search, hash: url.hash };
  const entries = [initialHref.startsWith('/') ? initialHref : `${url.pathname}${url.search}${url.hash}`];
  let index = 0;
  const listeners = { 'erp-slug-navigate': [], popstate: [] };
  const previous = globalThis.window;
  const apply = (next) => {
    const parsed = new URL(next, 'http://erp.local');
    loc.pathname = parsed.pathname;
    loc.search = parsed.search;
    loc.hash = parsed.hash;
  };
  globalThis.window = {
    location: loc,
    history: {
      pushState(_state, _title, next) {
        entries.splice(index + 1);
        entries.push(next);
        index = entries.length - 1;
        apply(next);
      },
      replaceState(_state, _title, next) {
        entries[index] = next;
        apply(next);
      },
      back() {
        if (index > 0) {
          index -= 1;
          apply(entries[index]);
          listeners.popstate.forEach((fn) => fn());
        }
      },
      forward() {
        if (index < entries.length - 1) {
          index += 1;
          apply(entries[index]);
          listeners.popstate.forEach((fn) => fn());
        }
      },
    },
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== fn);
    },
    dispatchEvent(event) {
      (listeners[event.type] || []).forEach((fn) => fn(event));
      return true;
    },
  };
  return {
    listeners,
    entries: () => entries.slice(),
    index: () => index,
    href: () => `${loc.pathname}${loc.search}${loc.hash}`,
    restore() {
      if (previous === undefined) delete globalThis.window;
      else globalThis.window = previous;
    },
  };
}

test('an open production record does not echo its own URL', () => {
  const history = installHistory('/production/records/new?orderId=ORD-2026-198');
  let echoes = 0;
  try {
    window.addEventListener('erp-slug-navigate', () => {
      echoes += 1;
      if (echoes > 5) throw new Error('production deep link echoed its URL in a loop');
      const route = getRouteFromUrl();
      if (route.tab === 'production_records' && route.params.orderId) {
        pushSlugState('production_records', { orderId: route.params.orderId, section: 'new_record' });
      }
    });
    const href = pushSlugState('production_records', { orderId: 'ORD-2026-198', section: 'new_record' });
    assert.equal(href, '/production/records/new?orderId=ORD-2026-198');
    assert.equal(echoes, 0);
    assert.deepEqual(history.entries(), ['/production/records/new?orderId=ORD-2026-198']);
  } finally {
    history.restore();
  }
});

test('sidebar navigation leaves a production record and back returns to it', () => {
  const history = installHistory('/production/records/new?orderId=ORD-2026-198');
  let route = getRouteFromUrl();
  const sync = () => {
    const next = getRouteFromUrl();
    route = sameRoute(route, next) ? route : next;
  };
  try {
    window.addEventListener('erp-slug-navigate', sync);
    window.addEventListener('popstate', sync);
    window.addEventListener('erp-slug-navigate', () => {
      if (route.tab === 'production_records' && route.params.orderId) {
        pushSlugState('production_records', { orderId: route.params.orderId, section: 'new_record' });
      }
    });

    pushSlugState('dashboard');
    sync();
    assert.equal(route.tab, 'dashboard');
    assert.equal(history.href(), '/dashboard');

    pushSlugState('printing_scheduler');
    sync();
    assert.equal(route.tab, 'printing_scheduler');
    assert.equal(history.href(), '/printing');

    pushSlugState('sales');
    sync();
    assert.equal(route.tab, 'sales');
    assert.equal(history.href(), '/sales');

    window.history.back();
    assert.equal(route.tab, 'printing_scheduler');
    assert.equal(history.href(), '/printing');
    window.history.back();
    assert.equal(route.tab, 'dashboard');
    window.history.back();
    assert.equal(route.tab, 'production_records');
    assert.equal(route.params.orderId, 'ORD-2026-198');
    assert.equal(history.href(), '/production/records/new?orderId=ORD-2026-198');
    window.history.forward();
    assert.equal(route.tab, 'dashboard');
    assert.equal(history.href(), '/dashboard');
  } finally {
    history.restore();
  }
});

test('sameRoute ignores a fresh parse of the page that is already open', () => {
  const left = parse('/production/records/new?orderId=ORD-2026-198');
  const right = parse('/production/records/new?orderId=ORD-2026-198');
  assert.equal(sameRoute(left, right), true);
  assert.equal(sameRoute(left, parse('/dashboard')), false);
  assert.equal(sameRoute(left, parse('/printing')), false);
});

test('scrap store filters round-trip and do not echo their own URL', () => {
  const params = {
    section: 'scrap',
    preset: 'custom',
    from: '2026-10-01',
    to: '2026-10-27',
    stage: 'QC Hold',
    type: 'Lamination Plain Substrate (L2)',
    source: 'process',
    orderId: 'ORD-2026-210',
    jobMasterId: 'JM-NYRA',
    customer: 'Nyra Foods',
    machine: 'MAC-ROTO-1',
    operator: 'Ravi Patel',
    material: 'PET',
    kgMin: '1',
    kgMax: '40',
    high: '1',
    status: 'In stock',
    q: 'nyra',
    page: '2'
  };
  const href = buildHref('sfg_store', params);
  const route = parse(href);
  assert.equal(route.tab, 'sfg_store');
  assert.equal(route.section, 'scrap');
  assert.equal(route.params.stage, 'QC Hold');
  assert.equal(route.params.type, 'Lamination Plain Substrate (L2)');
  assert.equal(route.params.customer, 'Nyra Foods');
  assert.equal(route.params.high, '1');
  assert.equal(route.params.kgMin, '1');
  assert.equal(route.params.page, '2');
  assert.equal(route.canonical, href);
  const again = buildHref('sfg_store', {
    section: 'scrap',
    preset: route.params.preset,
    from: route.params.from,
    to: route.params.to,
    stage: route.params.stage,
    type: route.params.type,
    source: route.params.source,
    orderId: route.params.orderId,
    jobMasterId: route.params.jobMasterId,
    customer: route.params.customer,
    machine: route.params.machine,
    operator: route.params.operator,
    material: route.params.material,
    kgMin: route.params.kgMin,
    kgMax: route.params.kgMax,
    high: route.params.high,
    status: route.params.status,
    q: route.params.q,
    page: route.params.page
  });
  assert.equal(again, href);

  const history = installHistory('/sfg-fg/scrap');
  let echoes = 0;
  try {
    window.addEventListener('erp-slug-navigate', () => {
      echoes += 1;
      if (echoes > 2) throw new Error('scrap filter URL echoed in a loop');
      const current = getRouteFromUrl();
      pushSlugState('sfg_store', {
        section: 'scrap',
        preset: current.params.preset,
        from: current.params.from,
        to: current.params.to,
        stage: current.params.stage,
        type: current.params.type,
        source: current.params.source,
        orderId: current.params.orderId,
        jobMasterId: current.params.jobMasterId,
        customer: current.params.customer,
        machine: current.params.machine,
        operator: current.params.operator,
        material: current.params.material,
        kgMin: current.params.kgMin,
        kgMax: current.params.kgMax,
        high: current.params.high,
        status: current.params.status,
        q: current.params.q,
        page: current.params.page
      }, true);
    });
    const written = pushSlugState('sfg_store', params);
    assert.equal(written, href);
    assert.equal(echoes, 1);
    assert.equal(history.href(), href);
  } finally {
    history.restore();
  }
});

test('canonical table covers every module that the sidebar can open', () => {
  const modules = new Set(CANONICAL.map((row) => row[1]));
  for (const key of [
    'login', 'dashboard', 'sales', 'scrap_analytics', 'job_punching', 'orders', 'job_masters',
    'clients', 'printing_scheduler', 'production_records', 'sfg_store', 'cylinders',
    'purchase_orders', 'inventory', 'ink_management', 'material_indents', 'pellet_fuel', 'barcodes',
    'vendors', 'dispatch', 'employees', 'user_management', 'supabase', 'doc_settings', 'audit_logs',
  ]) {
    assert.ok(modules.has(key), key);
  }
});
