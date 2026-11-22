import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canToggleUiTrial,
  isUiTrialEnabled,
  setUiTrialEnabled,
  UI_TRIAL_STORAGE_KEY,
  UI_TRIAL_CHANGE_EVENT
} from '../src/utils/uiTrialSwitch.js';

test('UI trial is restricted to Admin and Plant Manager roles', () => {
  assert.equal(canToggleUiTrial(null), false);
  assert.equal(canToggleUiTrial({ role: 'Store Manager' }), false);
  assert.equal(canToggleUiTrial({ role: 'Purchase Manager' }), false);
  assert.equal(canToggleUiTrial({ role: 'Production Manager' }), false);
  assert.equal(canToggleUiTrial({ role: 'Printing Operator' }), false);
  assert.equal(canToggleUiTrial({ role: 'Shop Floor Operator' }), false);

  assert.equal(canToggleUiTrial({ role: 'Admin' }), true);
  assert.equal(canToggleUiTrial({ role: 'Plant Manager' }), true);
  assert.equal(canToggleUiTrial({ role: 'Store Manager', assigned_roles: ['Store Manager', 'Plant Manager'] }), true);
  assert.equal(canToggleUiTrial({ role: 'Accounts Manager', assigned_roles: ['Accounts Manager', 'Admin'] }), true);
});

test('UI trial defaults to OFF (false)', () => {
  // Mock localStorage and window
  const storage = new Map();
  global.window = {
    location: { search: '' },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, val) => storage.set(key, String(val)),
      removeItem: (key) => storage.delete(key),
    },
    dispatchEvent: () => {},
  };

  const admin = { role: 'Admin' };
  assert.equal(isUiTrialEnabled(admin), false);
});

test('UI trial switches ON and OFF via setUiTrialEnabled for allowed roles', () => {
  const storage = new Map();
  let dispatched = null;
  global.window = {
    location: { search: '' },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, val) => storage.set(key, String(val)),
      removeItem: (key) => storage.delete(key),
    },
    dispatchEvent: (e) => { dispatched = e; },
  };

  const admin = { role: 'Admin' };
  assert.equal(isUiTrialEnabled(admin), false);

  setUiTrialEnabled(true);
  assert.equal(storage.get(UI_TRIAL_STORAGE_KEY), 'true');
  assert.equal(isUiTrialEnabled(admin), true);

  setUiTrialEnabled(false);
  assert.equal(storage.get(UI_TRIAL_STORAGE_KEY), 'false');
  assert.equal(isUiTrialEnabled(admin), false);
});

test('UI trial returns false for disallowed roles even if localStorage is true', () => {
  const storage = new Map([[UI_TRIAL_STORAGE_KEY, 'true']]);
  global.window = {
    location: { search: '' },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, val) => storage.set(key, String(val)),
    },
    dispatchEvent: () => {},
  };

  const storeManager = { role: 'Store Manager' };
  const operator = { role: 'Printing Operator' };
  assert.equal(isUiTrialEnabled(storeManager), false);
  assert.equal(isUiTrialEnabled(operator), false);

  const plantManager = { role: 'Plant Manager' };
  assert.equal(isUiTrialEnabled(plantManager), true);
});

test('query parameter ?ui=classic overrides localStorage and forces classic design', () => {
  const storage = new Map([[UI_TRIAL_STORAGE_KEY, 'true']]);
  global.window = {
    location: { search: '?ui=classic' },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, val) => storage.set(key, String(val)),
    },
    dispatchEvent: () => {},
  };

  const admin = { role: 'Admin' };
  assert.equal(isUiTrialEnabled(admin), false);

  // When query is not classic, it should be enabled
  global.window.location.search = '?tab=inventory';
  assert.equal(isUiTrialEnabled(admin), true);
});
