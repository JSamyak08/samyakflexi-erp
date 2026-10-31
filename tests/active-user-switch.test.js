import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  activeUserQueryPresent,
  activeUserReadonlyLabel,
  chooseActiveUser,
  clearActiveUserOverride,
  readStoredActiveUserPreview,
  realUserCanSwitchActiveUser,
  resolveActiveUser,
  stripActiveUserQuery,
  ACTIVE_USER_LEGACY_STORAGE_KEY,
  ACTIVE_USER_PREVIEW_KEY,
} from '../src/utils/activeUserSwitch.js';

const admin = {
  id: 'admin-1',
  name: 'Plant Admin',
  email: 'admin@samyakinternational.in',
  role: 'Admin',
  roles: ['Admin'],
};
const sales = {
  id: 'sales-1',
  name: 'Rita Sales',
  email: 'rita.sales@samyakinternational.in',
  username: 'rita.sales',
  role: 'Sales Manager',
  roles: ['Sales Manager'],
};
const dualRole = {
  id: 'dual-1',
  name: 'Dual Lead',
  email: 'dual.lead@samyakinternational.in',
  role: 'Sales Manager',
  roles: ['Sales Manager', 'Admin'],
};

function memoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    dump: () => Object.fromEntries(store),
  };
}

test('only a real Admin can switch, including Admin held beside another plant role', () => {
  assert.equal(realUserCanSwitchActiveUser(admin), true);
  assert.equal(realUserCanSwitchActiveUser(dualRole), true);
  assert.equal(realUserCanSwitchActiveUser(sales), false);
  assert.equal(realUserCanSwitchActiveUser({ role: 'Plant Manager', roles: ['Plant Manager'] }), false);
  assert.equal(realUserCanSwitchActiveUser(null), false);
  assert.equal(activeUserReadonlyLabel(sales), 'Rita Sales');
  assert.equal(activeUserReadonlyLabel({ email: 'store.lead@samyakinternational.in' }), 'store.lead@samyakinternational.in');
});

test('a non-Admin stale preview and impersonation URL are dropped', () => {
  const preview = { ...admin, id: 'admin-1' };
  const search = '?e2e=active-user&activeUser=%7B%22id%22%3A%22admin-1%22%7D&impersonate=admin-1';
  const resolved = resolveActiveUser({ sessionUser: sales, preview, search });
  assert.equal(resolved.allowSwitch, false);
  assert.equal(resolved.user.id, sales.id);
  assert.equal(resolved.user.name, 'Rita Sales');
  assert.equal(resolved.clearPreview, true);
  assert.equal(resolved.stripQuery, true);
  assert.equal(stripActiveUserQuery(search), '?e2e=active-user');
  assert.equal(activeUserQueryPresent('?asUser=admin-1'), true);
  assert.equal(activeUserQueryPresent('?e2eRole=Sales+Manager'), false);

  const session = memoryStorage({
    [ACTIVE_USER_PREVIEW_KEY]: JSON.stringify(preview),
  });
  const local = memoryStorage({
    [ACTIVE_USER_LEGACY_STORAGE_KEY]: JSON.stringify(preview),
    [ACTIVE_USER_PREVIEW_KEY]: JSON.stringify(preview),
  });
  clearActiveUserOverride(session, local);
  assert.deepEqual(session.dump(), {});
  assert.deepEqual(local.dump(), {});
  assert.equal(readStoredActiveUserPreview(session), null);
});

test('an Admin keeps a stored switch and can switch back without losing the control', () => {
  const switched = resolveActiveUser({
    sessionUser: admin,
    preview: sales,
    search: '?previewUser=sales-1',
  });
  assert.equal(switched.allowSwitch, true);
  assert.equal(switched.user.id, sales.id);
  assert.equal(switched.clearPreview, false);
  assert.equal(switched.stripQuery, true);

  const blockedUrl = resolveActiveUser({
    sessionUser: admin,
    preview: null,
    search: '?activeUser=%7B%22id%22%3A%22sales-1%22%7D',
  });
  assert.equal(blockedUrl.user.id, admin.id);
  assert.equal(blockedUrl.allowSwitch, true);

  const toSales = chooseActiveUser(admin, sales);
  assert.equal(toSales.ok, true);
  assert.equal(toSales.user.id, sales.id);
  assert.equal(toSales.clearPreview, false);

  const back = chooseActiveUser(admin, admin);
  assert.equal(back.ok, true);
  assert.equal(back.user.id, admin.id);
  assert.equal(back.clearPreview, true);

  const rejected = chooseActiveUser(sales, admin);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.user.id, sales.id);
  assert.equal(rejected.clearPreview, true);

  const whileImpersonating = chooseActiveUser(admin, sales);
  assert.equal(whileImpersonating.ok, true);
  assert.equal(realUserCanSwitchActiveUser(admin), true);
  assert.equal(realUserCanSwitchActiveUser(sales), false);
});

test('a preview without an id is ignored, and a dual-role Admin can switch', () => {
  const session = memoryStorage({
    [ACTIVE_USER_PREVIEW_KEY]: JSON.stringify({ role: 'Admin', email: 'admin@samyakinternational.in' }),
  });
  assert.equal(readStoredActiveUserPreview(session), null);
  const kept = resolveActiveUser({
    sessionUser: dualRole,
    preview: readStoredActiveUserPreview(session),
    search: '',
  });
  assert.equal(kept.allowSwitch, true);
  assert.equal(kept.user.id, dualRole.id);

  const applied = resolveActiveUser({ sessionUser: dualRole, preview: sales, search: '' });
  assert.equal(applied.user.id, sales.id);
  assert.equal(applied.allowSwitch, true);
});

test('the header switch is gated on the signed-in profile, not the active preview', () => {
  const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const headerStart = source.indexOf('data-testid="active-user-control"');
  const headerEnd = source.indexOf('btn-signout', headerStart);
  const header = source.slice(headerStart, headerEnd);
  assert.ok(headerStart > 0, 'active user control is missing');
  assert.match(source, /const canSwitchActiveUser = realUserCanSwitchActiveUser\(sessionProfile\)/);
  assert.match(header, /canSwitchActiveUser \?/);
  assert.match(header, /active-user-label/);
  assert.match(header, /chooseActiveUser\(sessionProfile, selectedUser\)/);
  assert.doesNotMatch(header, /userHasRole\(currentUser/);
  assert.doesNotMatch(header, /disabled=\{/);
  assert.match(source, /resolveActiveUser\(\{ sessionUser: profile, preview, search \}\)/);
  assert.match(source, /resolveActiveUser\(\{ sessionUser: stub, preview, search \}\)/);
  assert.doesNotMatch(source, /preview\.role && preview\.email/);
  assert.match(source, /value: String\(u\.id\)/);
  assert.match(source, /label: activeUserLabel\(u\)/);
  assert.match(source, /const selectedId = e\.target\.value/);
  assert.match(source, /activeUsersList\.find\(u => String\(u\.id\) === String\(selectedId\)\)/);
});
