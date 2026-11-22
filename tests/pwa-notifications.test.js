import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  NOTIFICATION_ACTION_TYPES,
  isUserTargetedForNotification,
  getUserStorageKey,
  getPrivateReadNotificationIds,
  markPrivateNotificationRead,
  markAllPrivateNotificationsRead,
  aggregateRoleBasedNotifications
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

test('NOTIFICATION_ACTION_TYPES provides all essential action types with valid routes', () => {
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

    // Verify target URL resolves through the ERP router
    const resolved = resolveInternalPath(def.defaultUrl);
    assert.strictEqual(resolved.ok, true, `Route ${def.defaultUrl} for ${type} must be a valid internal path`);
  });
});

test('Role-based targeting enforces role boundaries', () => {
  const adminUser = { id: 'usr-1', email: 'admin@samyak.com', role: 'Admin' };
  const qcUser = { id: 'usr-2', email: 'qc@samyak.com', role: 'QC Chemist' };
  const hrUser = { id: 'usr-3', email: 'hr@samyak.com', role: 'HR & Payroll Manager' };
  const operatorUser = { id: 'usr-4', email: 'press@samyak.com', role: 'Printing Operator' };
  const storeUser = { id: 'usr-5', email: 'store@samyak.com', role: 'Store Manager' };
  const shopFloorUser = { id: 'usr-6', email: 'worker@samyak.com', role: 'Shop Floor Operator' };

  // Admin has visibility across all action types
  Object.values(NOTIFICATION_ACTION_TYPES).forEach((def) => {
    assert.strictEqual(
      isUserTargetedForNotification(adminUser, def.targetRoles),
      true,
      `Admin should be targeted for ${def.actionType}`
    );
  });

  // QC Chemist receives QC inspection, but NOT HR or Printing alerts
  assert.strictEqual(
    isUserTargetedForNotification(qcUser, NOTIFICATION_ACTION_TYPES.qc_inspection.targetRoles),
    true
  );
  assert.strictEqual(
    isUserTargetedForNotification(qcUser, NOTIFICATION_ACTION_TYPES.salary_advance.targetRoles),
    false
  );
  assert.strictEqual(
    isUserTargetedForNotification(qcUser, NOTIFICATION_ACTION_TYPES.printing_deadline.targetRoles),
    false
  );

  // HR Manager receives Salary Advance, but NOT QC or Ink alerts
  assert.strictEqual(
    isUserTargetedForNotification(hrUser, NOTIFICATION_ACTION_TYPES.salary_advance.targetRoles),
    true
  );
  assert.strictEqual(
    isUserTargetedForNotification(hrUser, NOTIFICATION_ACTION_TYPES.qc_inspection.targetRoles),
    false
  );
  assert.strictEqual(
    isUserTargetedForNotification(hrUser, NOTIFICATION_ACTION_TYPES.low_stock_ink.targetRoles),
    false
  );

  // Printing Operator receives Printing Deadline, but NOT Salary Advances
  assert.strictEqual(
    isUserTargetedForNotification(operatorUser, NOTIFICATION_ACTION_TYPES.printing_deadline.targetRoles),
    true
  );
  assert.strictEqual(
    isUserTargetedForNotification(operatorUser, NOTIFICATION_ACTION_TYPES.salary_advance.targetRoles),
    false
  );

  // Store Manager receives Low Stock and Material Indents
  assert.strictEqual(
    isUserTargetedForNotification(storeUser, NOTIFICATION_ACTION_TYPES.low_stock_substrate.targetRoles),
    true
  );
  assert.strictEqual(
    isUserTargetedForNotification(storeUser, NOTIFICATION_ACTION_TYPES.material_indent.targetRoles),
    true
  );

  // Shop Floor Operator does not receive Admin/Manager alerts
  assert.strictEqual(
    isUserTargetedForNotification(shopFloorUser, NOTIFICATION_ACTION_TYPES.salary_advance.targetRoles),
    false
  );
  assert.strictEqual(
    isUserTargetedForNotification(shopFloorUser, NOTIFICATION_ACTION_TYPES.bug_report.targetRoles),
    false
  );
});

test('Private notification read status is strictly isolated per user', () => {
  const userA = { id: 'usr-alice', email: 'alice@samyak.com', role: 'Store Manager' };
  const userB = { id: 'usr-bob', email: 'bob@samyak.com', role: 'Store Manager' };

  window.localStorage.clear();

  // User A marks notif-1 as read
  markPrivateNotificationRead(userA, 'notif-1');

  // Verify User A has notif-1 marked as read
  const readA = getPrivateReadNotificationIds(userA);
  assert.strictEqual(readA.has('notif-1'), true);

  // Verify User B does NOT have notif-1 marked as read (private isolation)
  const readB = getPrivateReadNotificationIds(userB);
  assert.strictEqual(readB.has('notif-1'), false);

  // User B marks notif-2 as read
  markPrivateNotificationRead(userB, 'notif-2');
  assert.strictEqual(getPrivateReadNotificationIds(userB).has('notif-2'), true);
  assert.strictEqual(getPrivateReadNotificationIds(userA).has('notif-2'), false);
});

test('aggregateRoleBasedNotifications derives notifications and respects role filters', () => {
  const qcUser = { id: 'usr-qc', email: 'chemist@samyak.com', role: 'QC Chemist' };
  const hrUser = { id: 'usr-hr', email: 'hr@samyak.com', role: 'HR & Payroll Manager' };

  const sampleGrns = [
    { id: 'GRN-101', grn_number: 'GRN-101', qc_status: 'Pending', supplier: 'Polyplex' }
  ];
  const sampleAdvances = [
    { id: 'ADV-501', employee_name: 'Rajesh', amount: 5000, status: 'Pending Approval' }
  ];
  const sampleDelayedOrders = [
    { id: 'ORD-901', job_name: 'Biscuit Pouch', target_delivery_date: '2026-10-01', status: 'In Production' }
  ];

  // QC Chemist aggregation: MUST include GRN QC, MUST NOT include Salary Advance or Delayed Orders
  const qcResult = aggregateRoleBasedNotifications({
    currentUser: qcUser,
    grns: sampleGrns,
    salaryAdvances: sampleAdvances,
    orders: sampleDelayedOrders
  });

  assert.strictEqual(qcResult.notifications.length, 1);
  assert.strictEqual(qcResult.notifications[0].actionType, 'qc_inspection');
  assert.strictEqual(qcResult.notifications[0].url, '/inventory/qc');
  assert.strictEqual(qcResult.unreadCount, 1);

  // HR Manager aggregation: MUST include Salary Advance, MUST NOT include GRN QC or Delayed Orders
  const hrResult = aggregateRoleBasedNotifications({
    currentUser: hrUser,
    grns: sampleGrns,
    salaryAdvances: sampleAdvances,
    orders: sampleDelayedOrders
  });

  assert.strictEqual(hrResult.notifications.length, 1);
  assert.strictEqual(hrResult.notifications[0].actionType, 'salary_advance');
  assert.strictEqual(hrResult.notifications[0].url, '/employees/advances');
  assert.strictEqual(hrResult.unreadCount, 1);
});

test('Service Worker public/sw.js contains notificationclick handler redirecting to action url', () => {
  const swPath = path.resolve('public/sw.js');
  const swContent = fs.readFileSync(swPath, 'utf8');

  assert.ok(swContent.includes('notificationclick'), 'sw.js must have notificationclick listener');
  assert.ok(swContent.includes('NAVIGATE_TO'), 'sw.js must dispatch NAVIGATE_TO postMessage');
  assert.ok(swContent.includes('clients.openWindow'), 'sw.js must support opening new window if none active');
});
