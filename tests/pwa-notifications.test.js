import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  NOTIFICATION_ACTION_TYPES,
  DEFAULT_ROLE_NOTIFICATION_MATRIX,
  DEFAULT_PUSH_ENABLED_TYPES,
  getRoleNotificationMatrix,
  saveRoleNotificationMatrix,
  getPushEnabledTypes,
  savePushEnabledTypes,
  resetRoleNotificationMatrix,
  isUserTargetedForNotification,
  getUserStorageKey,
  getPrivateReadNotificationIds,
  markPrivateNotificationRead,
  markAllPrivateNotificationsRead,
  aggregateRoleBasedNotifications,
  isNotificationEligibleForPush,
  enableAndBaselinePwaNotifications,
  getPrivateNotificationEnabledAt
} from '../src/services/pwaNotifications.js';
import { resolveInternalPath } from '../src/utils/slugRouter.js';

// Mock localStorage for Node test runner
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

globalThis.window = {
  localStorage: new MockLocalStorage(),
  dispatchEvent: () => true
};
globalThis.CustomEvent = class {
  constructor(type, detail) {
    this.type = type;
    this.detail = detail;
  }
};

test('NOTIFICATION_ACTION_TYPES provides all essential action types with valid routes and importance levels', () => {
  const expectedTypes = [
    'qc_inspection',
    'delayed_order',
    'printing_deadline',
    'low_stock_ink',
    'low_stock_substrate',
    'salary_advance',
    'material_indent',
    'structure_notice',
    'revert_notice',
    'bug_report'
  ];

  expectedTypes.forEach((type) => {
    const def = NOTIFICATION_ACTION_TYPES[type];
    assert.ok(def, `Action type ${type} must be defined`);
    assert.ok(Array.isArray(def.targetRoles) && def.targetRoles.length > 0, `${type} must have target roles`);
    assert.ok(def.defaultUrl && def.defaultUrl.startsWith('/'), `${type} must have default url`);
    assert.ok(['critical', 'high', 'normal'].includes(def.importance), `${type} must have importance level`);

    // Verify target URL resolves through the ERP router
    const resolved = resolveInternalPath(def.defaultUrl);
    assert.strictEqual(resolved.ok, true, `Route ${def.defaultUrl} for ${type} must be a valid internal path`);
  });
});

test('Role notification assignments matrix: ONLY Admin can save or configure settings', () => {
  window.localStorage.clear();

  const adminUser = { id: 'usr-admin', email: 'admin@samyak.com', role: 'Admin' };
  const plantManagerUser = { id: 'usr-pm', email: 'pm@samyak.com', role: 'Plant Manager' };
  const chemistUser = { id: 'usr-qc', email: 'qc@samyak.com', role: 'QC Chemist' };

  const customMatrix = {
    ...DEFAULT_ROLE_NOTIFICATION_MATRIX,
    qc_inspection: ['Admin', 'QC Chemist'] // Removed Plant Manager from QC
  };

  // 1. Non-Admin (Plant Manager) attempt MUST be rejected
  assert.throws(
    () => saveRoleNotificationMatrix(plantManagerUser, customMatrix),
    /Unauthorized: Only Admin can access and assign notification types for roles/
  );

  // 2. Non-Admin (QC Chemist) attempt MUST be rejected
  assert.throws(
    () => saveRoleNotificationMatrix(chemistUser, customMatrix),
    /Unauthorized: Only Admin can access and assign notification types for roles/
  );

  // 3. Admin attempt MUST succeed
  assert.doesNotThrow(() => {
    saveRoleNotificationMatrix(adminUser, customMatrix);
  });

  const storedMatrix = getRoleNotificationMatrix();
  assert.deepStrictEqual(storedMatrix.qc_inspection, ['Admin', 'QC Chemist']);

  // 4. Non-Admin cannot reset settings
  assert.throws(
    () => resetRoleNotificationMatrix(plantManagerUser),
    /Unauthorized/
  );

  // 5. Admin can reset settings
  resetRoleNotificationMatrix(adminUser);
  const resetMatrix = getRoleNotificationMatrix();
  assert.deepStrictEqual(resetMatrix.qc_inspection, DEFAULT_ROLE_NOTIFICATION_MATRIX.qc_inspection);
});

test('Admin push types configuration: ONLY Admin can configure native push types', () => {
  const adminUser = { id: 'usr-admin', email: 'admin@samyak.com', role: 'Admin' };
  const regularUser = { id: 'usr-staff', email: 'staff@samyak.com', role: 'Store Manager' };

  const updatedPush = {
    ...DEFAULT_PUSH_ENABLED_TYPES,
    low_stock_ink: true // Admin enables low ink for push
  };

  assert.throws(() => savePushEnabledTypes(regularUser, updatedPush), /Unauthorized/);
  assert.doesNotThrow(() => savePushEnabledTypes(adminUser, updatedPush));

  const saved = getPushEnabledTypes();
  assert.strictEqual(saved.low_stock_ink, true);
});

test('Freshness guarantee: old notifications are NEVER pushed when user enables notifications', () => {
  const user = { id: 'usr-qc-1', email: 'qc1@samyak.com', role: 'QC Chemist' };
  window.localStorage.clear();

  const oldTime = new Date('2026-11-20T10:00:00Z').toISOString();
  const existingAlert = {
    id: 'qc-grn-old',
    actionType: 'qc_inspection',
    importance: 'critical',
    title: 'Old GRN Pending',
    timestamp: oldTime,
    isRead: false
  };

  // User enables notifications right now
  enableAndBaselinePwaNotifications(user, [existingAlert]);

  const enabledAt = getPrivateNotificationEnabledAt(user);
  assert.ok(enabledAt && enabledAt > 0, 'enabledAt must be set');

  const baselineIds = new Set(['qc-grn-old']);
  const sentIds = new Set();
  const pushEnabledTypes = { qc_inspection: true };

  // 1. Verify old pre-existing alert is NOT eligible for push
  const oldEligible = isNotificationEligibleForPush(existingAlert, user, {
    enabledAt,
    baselineIds,
    sentIds,
    pushEnabledTypes
  });
  assert.strictEqual(oldEligible, false, 'Old alert created prior to enabling MUST NOT be pushed');

  // 2. A brand new alert created AFTER enabledAt timestamp IS eligible for push
  const freshTime = new Date(Date.now() + 5000).toISOString();
  const freshAlert = {
    id: 'qc-grn-fresh-101',
    actionType: 'qc_inspection',
    importance: 'critical',
    title: 'Fresh Inward GRN QC Needed',
    timestamp: freshTime,
    isRead: false
  };

  const freshEligible = isNotificationEligibleForPush(freshAlert, user, {
    enabledAt,
    baselineIds,
    sentIds,
    pushEnabledTypes
  });
  assert.strictEqual(freshEligible, true, 'Fresh alert created after enabling MUST be pushed');
});

test('Spam prevention: routine normal alerts do not trigger native device push by default', () => {
  const user = { id: 'usr-store', email: 'store@samyak.com', role: 'Store Manager' };
  const enabledAt = Date.now() - 10000;
  const baselineIds = new Set();
  const sentIds = new Set();
  const pushEnabledTypes = { ...DEFAULT_PUSH_ENABLED_TYPES };

  const normalStockAlert = {
    id: 'low-stock-99',
    actionType: 'low_stock_substrate',
    importance: 'normal',
    title: 'Routine Low Stock Item',
    timestamp: new Date().toISOString(),
    isRead: false
  };

  // Routine normal alerts should not be pushed (pushEnabledTypes[low_stock_substrate] === false)
  const eligible = isNotificationEligibleForPush(normalStockAlert, user, {
    enabledAt,
    baselineIds,
    sentIds,
    pushEnabledTypes
  });
  assert.strictEqual(eligible, false, 'Routine low stock alerts should not spam native device push');
});

test('Private notification read status is strictly isolated per user', () => {
  const userA = { id: 'usr-alice', email: 'alice@samyak.com', role: 'Store Manager' };
  const userB = { id: 'usr-bob', email: 'bob@samyak.com', role: 'Store Manager' };

  window.localStorage.clear();

  markPrivateNotificationRead(userA, 'notif-1');

  const readA = getPrivateReadNotificationIds(userA);
  assert.strictEqual(readA.has('notif-1'), true);

  const readB = getPrivateReadNotificationIds(userB);
  assert.strictEqual(readB.has('notif-1'), false);
});

test('aggregateRoleBasedNotifications respects Admin custom role assignments matrix', () => {
  const chemistUser = { id: 'usr-chem', email: 'chemist@samyak.com', role: 'QC Chemist' };

  const sampleGrns = [{ id: 'GRN-101', grn_number: 'GRN-101', qc_status: 'Pending', supplier: 'Polyplex' }];
  const sampleDelayedOrders = [{ id: 'ORD-901', job_name: 'Pouch', targetDeliveryDate: '2026-10-01', target_delivery_date: '2026-10-01', status: 'In Production' }];

  // 1. With default matrix: Chemist sees QC, does not see Delayed Orders
  const res1 = aggregateRoleBasedNotifications({
    currentUser: chemistUser,
    grns: sampleGrns,
    orders: sampleDelayedOrders
  });
  assert.strictEqual(res1.notifications.length, 1);
  assert.strictEqual(res1.notifications[0].actionType, 'qc_inspection');

  // 2. Admin custom matrix: Admin explicitly adds QC Chemist to Delayed Orders
  const customMatrix = {
    ...DEFAULT_ROLE_NOTIFICATION_MATRIX,
    delayed_order: ['Admin', 'Plant Manager', 'QC Chemist']
  };

  const res2 = aggregateRoleBasedNotifications({
    currentUser: chemistUser,
    grns: sampleGrns,
    orders: sampleDelayedOrders,
    roleMatrixOverride: customMatrix
  });

  assert.strictEqual(res2.notifications.length, 2);
  const types = res2.notifications.map((n) => n.actionType);
  assert.ok(types.includes('qc_inspection') && types.includes('delayed_order'));
});

test('Service Worker public/sw.js contains notificationclick handler redirecting to action url', () => {
  const swPath = path.resolve('public/sw.js');
  const swContent = fs.readFileSync(swPath, 'utf8');

  assert.ok(swContent.includes('notificationclick'), 'sw.js must have notificationclick listener');
  assert.ok(swContent.includes('NAVIGATE_TO'), 'sw.js must dispatch NAVIGATE_TO postMessage');
  assert.ok(swContent.includes('clients.openWindow'), 'sw.js must support opening new window if none active');
});
