/**
 * Role-Based PWA Private Notification Service for SamyakFlexi ERP.
 *
 * Provides:
 * 1. Admin-controlled role notification assignments matrix.
 * 2. Spam prevention: only important/critical notifications get pushed to device.
 * 3. Freshness guarantee: when notifications are enabled, old historical alerts
 *    are never shared or pushed; only new events from that moment onward.
 * 4. User privacy: read/dismissed, sent, and baseline states are isolated per user.
 * 5. Direct action redirection: clicking a notification redirects to the specific action type/route.
 */

import { assignedRolesOf, userHasRole } from '../assignedRoles.js';
import { isOrderOverdue } from '../factoryStore.js';
import { SYSTEM_ROLES } from '../roles.js';

export const NOTIFICATION_ACTION_TYPES = {
  qc_inspection: {
    actionType: 'qc_inspection',
    label: 'Quality QC',
    description: 'Inward GRN material rolls require laboratory QC verification',
    targetRoles: ['Admin', 'Plant Manager', 'QC Chemist'],
    defaultUrl: '/inventory/qc',
    tone: 'warning',
    importance: 'critical',
    pushDefault: true
  },
  delayed_order: {
    actionType: 'delayed_order',
    label: 'Delayed Order',
    description: 'Customer order target delivery date has passed',
    targetRoles: ['Admin', 'Plant Manager', 'Sales Manager', 'Production Manager'],
    defaultUrl: '/orders',
    tone: 'danger',
    importance: 'critical',
    pushDefault: true
  },
  printing_deadline: {
    actionType: 'printing_deadline',
    label: 'Printing Deadline',
    description: 'Press schedule deadline approaching or overdue',
    targetRoles: ['Admin', 'Plant Manager', 'Production Manager', 'Printing Operator'],
    defaultUrl: '/printing',
    tone: 'warning',
    importance: 'high',
    pushDefault: true
  },
  low_stock_ink: {
    actionType: 'low_stock_ink',
    label: 'Low Ink Stock',
    description: 'Ink shade stock is below minimum safe reorder level',
    targetRoles: ['Admin', 'Store Manager', 'Purchase Manager'],
    defaultUrl: '/inks/stock',
    tone: 'warning',
    importance: 'normal',
    pushDefault: false // In-app only by default to prevent spam
  },
  low_stock_substrate: {
    actionType: 'low_stock_substrate',
    label: 'Low RM Stock',
    description: 'Raw material stock is below reorder threshold',
    targetRoles: ['Admin', 'Store Manager', 'Purchase Manager'],
    defaultUrl: '/inventory',
    tone: 'warning',
    importance: 'normal',
    pushDefault: false // In-app only by default to prevent spam
  },
  salary_advance: {
    actionType: 'salary_advance',
    label: 'Salary Advance',
    description: 'Employee salary advance request requires management approval',
    targetRoles: ['Admin', 'HR & Payroll Manager'],
    defaultUrl: '/employees/advances',
    tone: 'info',
    importance: 'high',
    pushDefault: true
  },
  material_indent: {
    actionType: 'material_indent',
    label: 'Material Indent',
    description: 'Department requisition pending store issue',
    targetRoles: ['Admin', 'Store Manager', 'Plant Manager'],
    defaultUrl: '/store/indents',
    tone: 'info',
    importance: 'normal',
    pushDefault: false // In-app only by default to prevent spam
  },
  structure_notice: {
    actionType: 'structure_notice',
    label: 'Structure Changed',
    description: 'Cylinder card or job master alteration on active order',
    targetRoles: ['Admin', 'Plant Manager', 'Production Manager', 'Purchase Manager', 'Store Manager'],
    defaultUrl: '/orders',
    tone: 'info',
    importance: 'high',
    pushDefault: true
  },
  revert_notice: {
    actionType: 'revert_notice',
    label: 'Reverted Roll',
    description: 'Roll consumption was rolled back',
    targetRoles: ['Admin', 'Plant Manager', 'Store Manager', 'Purchase Manager'],
    defaultUrl: '/inventory',
    tone: 'warning',
    importance: 'high',
    pushDefault: true
  },
  bug_report: {
    actionType: 'bug_report',
    label: 'Bug Report',
    description: 'New plant user bug report awaiting investigation',
    targetRoles: ['Admin'],
    defaultUrl: '/bug-reports',
    tone: 'danger',
    importance: 'high',
    pushDefault: true
  }
};

/**
 * Default role-to-notification assignments matrix.
 */
export const DEFAULT_ROLE_NOTIFICATION_MATRIX = {
  qc_inspection: ['Admin', 'Plant Manager', 'QC Chemist'],
  delayed_order: ['Admin', 'Plant Manager', 'Sales Manager', 'Production Manager'],
  printing_deadline: ['Admin', 'Plant Manager', 'Production Manager', 'Printing Operator'],
  low_stock_ink: ['Admin', 'Store Manager', 'Purchase Manager'],
  low_stock_substrate: ['Admin', 'Store Manager', 'Purchase Manager'],
  salary_advance: ['Admin', 'HR & Payroll Manager'],
  material_indent: ['Admin', 'Store Manager', 'Plant Manager'],
  structure_notice: ['Admin', 'Plant Manager', 'Production Manager', 'Purchase Manager', 'Store Manager'],
  revert_notice: ['Admin', 'Plant Manager', 'Store Manager', 'Purchase Manager'],
  bug_report: ['Admin']
};

/**
 * Default push enabled types (which ones trigger native device notifications).
 * Only important / critical ones are enabled by default.
 */
export const DEFAULT_PUSH_ENABLED_TYPES = {
  qc_inspection: true,
  delayed_order: true,
  printing_deadline: true,
  salary_advance: true,
  structure_notice: true,
  revert_notice: true,
  bug_report: true,
  low_stock_ink: false,
  low_stock_substrate: false,
  material_indent: false
};

const MATRIX_STORAGE_KEY = 'samyak_role_notification_matrix';
const PUSH_TYPES_STORAGE_KEY = 'samyak_push_enabled_types';

/**
 * Retrieves the current role notification matrix.
 */
export function getRoleNotificationMatrix() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_ROLE_NOTIFICATION_MATRIX };
  }
  try {
    const raw = window.localStorage.getItem(MATRIX_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ROLE_NOTIFICATION_MATRIX };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_ROLE_NOTIFICATION_MATRIX, ...parsed };
  } catch (e) {
    return { ...DEFAULT_ROLE_NOTIFICATION_MATRIX };
  }
}

/**
 * Saves role notification assignments matrix. STRICTLY ADMIN ONLY.
 */
export function saveRoleNotificationMatrix(adminUser, newMatrix) {
  if (!userHasRole(adminUser, 'Admin')) {
    throw new Error('Unauthorized: Only Admin can access and assign notification types for roles.');
  }
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(MATRIX_STORAGE_KEY, JSON.stringify(newMatrix));
    window.dispatchEvent(new CustomEvent('pwa-notifications-matrix-updated'));
  } catch (e) {
    console.warn('[PWA Notification] Failed to save role matrix:', e);
  }
}

/**
 * Retrieves which notification types are allowed to trigger native device push.
 */
export function getPushEnabledTypes() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_PUSH_ENABLED_TYPES };
  }
  try {
    const raw = window.localStorage.getItem(PUSH_TYPES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PUSH_ENABLED_TYPES };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PUSH_ENABLED_TYPES, ...parsed };
  } catch (e) {
    return { ...DEFAULT_PUSH_ENABLED_TYPES };
  }
}

/**
 * Saves push enabled notification types. STRICTLY ADMIN ONLY.
 */
export function savePushEnabledTypes(adminUser, newPushTypes) {
  if (!userHasRole(adminUser, 'Admin')) {
    throw new Error('Unauthorized: Only Admin can configure native push notification types.');
  }
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PUSH_TYPES_STORAGE_KEY, JSON.stringify(newPushTypes));
    window.dispatchEvent(new CustomEvent('pwa-notifications-matrix-updated'));
  } catch (e) {
    console.warn('[PWA Notification] Failed to save push types:', e);
  }
}

/**
 * Resets notification assignments matrix to defaults. STRICTLY ADMIN ONLY.
 */
export function resetRoleNotificationMatrix(adminUser) {
  if (!userHasRole(adminUser, 'Admin')) {
    throw new Error('Unauthorized: Only Admin can reset notification assignments.');
  }
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(MATRIX_STORAGE_KEY);
  window.localStorage.removeItem(PUSH_TYPES_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('pwa-notifications-matrix-updated'));
}

/**
 * Checks if the user is targeted for this action type based on assigned roles and Admin settings.
 */
export function isUserTargetedForNotification(user, targetRoles = [], roleMatrix = null) {
  if (!user) return false;
  const userRoles = assignedRolesOf(user);
  if (userRoles.includes('Admin')) return true; // Admin has supervisory visibility

  const allowedRoles = Array.isArray(targetRoles) ? targetRoles : [];
  return allowedRoles.some((role) => userRoles.includes(role));
}

/**
 * Returns a stable unique key for the logged in user for private storage.
 */
export function getUserStorageKey(user) {
  if (!user) return 'anonymous';
  return String(user.id || user.auth_user_id || user.email || 'user').toLowerCase().trim();
}

/**
 * Retrieves the timestamp (ms) when the user enabled notifications on this device.
 */
export function getPrivateNotificationEnabledAt(user) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const key = `samyak_notifs_enabled_at_${getUserStorageKey(user)}`;
  const val = window.localStorage.getItem(key);
  return val ? Number(val) : null;
}

/**
 * Sets the timestamp when notifications were enabled and baselines all existing alerts.
 * This guarantees NO OLD NOTIFICATIONS are pushed.
 */
export function enableAndBaselinePwaNotifications(user, currentNotifications = []) {
  if (!user || typeof window === 'undefined' || !window.localStorage) return;
  const userKey = getUserStorageKey(user);
  const now = Date.now();
  window.localStorage.setItem(`samyak_notifs_enabled_at_${userKey}`, String(now));

  // Baseline all currently existing notification IDs so they are never pushed
  const baselineKey = `samyak_notifs_baseline_${userKey}`;
  const existingBaseline = getPrivateBaselineNotificationIds(user);
  (currentNotifications || []).forEach((n) => existingBaseline.add(n.id));
  window.localStorage.setItem(baselineKey, JSON.stringify([...existingBaseline].slice(-300)));

  // Also record them in sent IDs to double-guard against re-push
  const sentKey = `samyak_pwa_notifs_sent_${userKey}`;
  const sentSet = getPrivateSentPwaIds(user);
  (currentNotifications || []).forEach((n) => sentSet.add(n.id));
  window.localStorage.setItem(sentKey, JSON.stringify([...sentSet].slice(-300)));
}

/**
 * Retrieves the set of baselined notification IDs that existed prior to enabling notifications.
 */
export function getPrivateBaselineNotificationIds(user) {
  if (typeof window === 'undefined' || !window.localStorage) return new Set();
  const key = `samyak_notifs_baseline_${getUserStorageKey(user)}`;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return new Set();
  }
}

/**
 * Retrieves the set of private read notification IDs for the logged in user.
 */
export function getPrivateReadNotificationIds(user) {
  if (typeof window === 'undefined' || !window.localStorage) return new Set();
  const key = `samyak_pwa_notifs_read_${getUserStorageKey(user)}`;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return new Set();
  }
}

/**
 * Marks a notification as read privately for the logged in user.
 */
export function markPrivateNotificationRead(user, notificationId) {
  if (!user || !notificationId || typeof window === 'undefined' || !window.localStorage) return;
  const key = `samyak_pwa_notifs_read_${getUserStorageKey(user)}`;
  try {
    const readSet = getPrivateReadNotificationIds(user);
    readSet.add(notificationId);
    window.localStorage.setItem(key, JSON.stringify([...readSet].slice(-200)));
    window.dispatchEvent(new CustomEvent('pwa-notifications-updated'));
  } catch (e) {
    console.warn('[PWA Notification] Failed to persist read status:', e);
  }
}

/**
 * Marks all notifications in the provided list as read for the logged in user.
 */
export function markAllPrivateNotificationsRead(user, notificationIds = []) {
  if (!user || typeof window === 'undefined' || !window.localStorage) return;
  const key = `samyak_pwa_notifs_read_${getUserStorageKey(user)}`;
  try {
    const readSet = getPrivateReadNotificationIds(user);
    notificationIds.forEach((id) => readSet.add(id));
    window.localStorage.setItem(key, JSON.stringify([...readSet].slice(-200)));
    window.dispatchEvent(new CustomEvent('pwa-notifications-updated'));
  } catch (e) {
    console.warn('[PWA Notification] Failed to mark all read:', e);
  }
}

/**
 * Retrieves set of notification IDs that have already been fired as native OS/PWA toasts.
 */
export function getPrivateSentPwaIds(user) {
  if (typeof window === 'undefined' || !window.localStorage) return new Set();
  const key = `samyak_pwa_notifs_sent_${getUserStorageKey(user)}`;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return new Set();
  }
}

/**
 * Records that a native OS/PWA notification was dispatched for this notification ID.
 */
export function recordPrivatePwaSent(user, notificationId) {
  if (!user || !notificationId || typeof window === 'undefined' || !window.localStorage) return;
  const key = `samyak_pwa_notifs_sent_${getUserStorageKey(user)}`;
  try {
    const sentSet = getPrivateSentPwaIds(user);
    sentSet.add(notificationId);
    window.localStorage.setItem(key, JSON.stringify([...sentSet].slice(-200)));
  } catch (e) {
    console.warn('[PWA Notification] Failed to persist sent status:', e);
  }
}

/**
 * Browser Notification Permission and PWA Capabilities.
 */
export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  return window.Notification.permission;
}

export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const result = await window.Notification.requestPermission();
    window.dispatchEvent(new CustomEvent('pwa-notification-permission-changed', { detail: result }));
    return result;
  } catch (e) {
    console.warn('[PWA Notification] Request permission failed:', e);
    return 'denied';
  }
}

/**
 * Dispatches a native PWA / Web Notification with click handler pointing to the action type.
 */
export async function sendPwaNativeNotification({
  id,
  title,
  body,
  url = '/dashboard',
  actionType = 'general',
  tag,
  icon = '/icons/icon-192x192.png',
  badge = '/samyak-logo.png',
  data = {}
}) {
  if (!isNotificationSupported() || window.Notification.permission !== 'granted') {
    return false;
  }

  const notificationTag = tag || `samyak-${actionType}-${id || Date.now()}`;
  const payloadData = {
    ...data,
    id,
    url,
    actionType,
    timestamp: new Date().toISOString()
  };

  // 1. Try Service Worker registration first (standard for PWAs, works in background)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon,
          badge,
          tag: notificationTag,
          renotify: false,
          data: payloadData
        });
        return true;
      }
    } catch (err) {
      console.warn('[PWA Notification] Service Worker notification failed, falling back:', err);
    }
  }

  // 2. Fallback to standard window Notification constructor
  try {
    const notif = new window.Notification(title, {
      body,
      icon,
      tag: notificationTag,
      data: payloadData
    });
    notif.onclick = function (e) {
      e.preventDefault();
      window.focus();
      notif.close();
      if (url) {
        window.dispatchEvent(
          new CustomEvent('pwa-notification-navigate', { detail: { url, actionType } })
        );
      }
    };
    return true;
  } catch (err) {
    console.warn('[PWA Notification] Window Notification creation failed:', err);
    return false;
  }
}

/**
 * Aggregates live role-based private notifications for the logged in user from state.
 */
export function aggregateRoleBasedNotifications({
  currentUser,
  orders = [],
  printingDeadlineReminders = [],
  lowStockInks = [],
  inventory = [],
  grns = [],
  salaryAdvances = [],
  indents = [],
  bugReports = [],
  erpNotifications = [],
  roleMatrixOverride = null
}) {
  if (!currentUser) {
    return { notifications: [], unreadCount: 0, totalCount: 0, permission: getNotificationPermission() };
  }

  const readIds = getPrivateReadNotificationIds(currentUser);
  const roleMatrix = roleMatrixOverride || getRoleNotificationMatrix();
  const items = [];

  // 1. Pending Inward QC Approvals
  const qcDef = NOTIFICATION_ACTION_TYPES.qc_inspection;
  const qcTargetRoles = roleMatrix[qcDef.actionType] || qcDef.targetRoles;
  if (isUserTargetedForNotification(currentUser, qcTargetRoles)) {
    (grns || []).forEach((grn) => {
      const isPending =
        (grn.qc_status && String(grn.qc_status).toLowerCase() === 'pending') ||
        (grn.qcStatus && String(grn.qcStatus).toLowerCase() === 'pending') ||
        (grn.status && String(grn.status).toLowerCase().includes('pending qc'));

      if (isPending) {
        const id = `qc-grn-${grn.id || grn.grn_number}`;
        const supplier = grn.supplier_name || grn.supplierName || grn.supplier || grn.vendor || 'Supplier';
        items.push({
          id,
          actionType: qcDef.actionType,
          categoryLabel: qcDef.label,
          title: `GRN #${grn.grn_number || grn.id} Pending QC`,
          message: `Inward raw materials from ${supplier} require quality inspection and approval.`,
          url: qcDef.defaultUrl,
          targetRoles: qcTargetRoles,
          tone: qcDef.tone,
          importance: qcDef.importance,
          timestamp: grn.created_at || grn.receipt_date || new Date().toISOString(),
          isRead: readIds.has(id),
          entityId: grn.id || grn.grn_number
        });
      }
    });
  }

  // 2. Delayed Customer Orders
  const delayedDef = NOTIFICATION_ACTION_TYPES.delayed_order;
  const delayedTargetRoles = roleMatrix[delayedDef.actionType] || delayedDef.targetRoles;
  if (isUserTargetedForNotification(currentUser, delayedTargetRoles)) {
    (orders || []).forEach((order) => {
      if (isOrderOverdue(order)) {
        const id = `delayed-order-${order.id}`;
        const client = order.client_name || order.clientName || 'Customer';
        const job = order.job_name || order.jobName || 'Packaging Job';
        const dDate = order.target_delivery_date || order.targetDeliveryDate || 'N/A';
        items.push({
          id,
          actionType: delayedDef.actionType,
          categoryLabel: delayedDef.label,
          title: `Order ${order.id} Overdue`,
          message: `${job} for ${client} passed delivery deadline on ${dDate}.`,
          url: delayedDef.defaultUrl,
          targetRoles: delayedTargetRoles,
          tone: delayedDef.tone,
          importance: delayedDef.importance,
          timestamp: order.target_delivery_date || order.created_at || new Date().toISOString(),
          isRead: readIds.has(id),
          entityId: order.id
        });
      }
    });
  }

  // 3. Printing Deadline Reminders
  const printDef = NOTIFICATION_ACTION_TYPES.printing_deadline;
  const printTargetRoles = roleMatrix[printDef.actionType] || printDef.targetRoles;
  if (isUserTargetedForNotification(currentUser, printTargetRoles)) {
    (printingDeadlineReminders || []).forEach((reminder) => {
      const order = reminder.order || reminder;
      const id = `print-deadline-${order.id || reminder.orderId}`;
      const stage = reminder.assessment?.stage || 'due_soon';
      const label = reminder.assessment?.label || 'Press deadline approaching';
      items.push({
        id,
        actionType: printDef.actionType,
        categoryLabel: printDef.label,
        title: `Press Run: ${order.job_name || order.jobName || order.id}`,
        message: `${label} — Delivery target: ${order.target_delivery_date || 'Upcoming'}`,
        url: printDef.defaultUrl,
        targetRoles: printTargetRoles,
        tone: stage === 'overdue' ? 'danger' : 'warning',
        importance: printDef.importance,
        timestamp: reminder.timestamp || new Date().toISOString(),
        isRead: readIds.has(id),
        entityId: order.id
      });
    });
  }

  // 4. Low Ink Stock Alerts
  const inkDef = NOTIFICATION_ACTION_TYPES.low_stock_ink;
  const inkTargetRoles = roleMatrix[inkDef.actionType] || inkDef.targetRoles;
  if (isUserTargetedForNotification(currentUser, inkTargetRoles)) {
    (lowStockInks || []).forEach((ink) => {
      const id = `low-ink-${ink.id || ink.shade_name || ink.name}`;
      const stockKg = Number(ink.stock_qty_kg || ink.stockQtyKg || 0);
      const minKg = Number(ink.min_stock_kg || ink.minStockKg || 20);
      items.push({
        id,
        actionType: inkDef.actionType,
        categoryLabel: inkDef.label,
        title: `Low Ink: ${ink.shade_name || ink.name || 'Ink Shade'}`,
        message: `Available stock is ${stockKg.toFixed(1)} kg (Minimum threshold: ${minKg} kg). Reorder needed.`,
        url: inkDef.defaultUrl,
        targetRoles: inkTargetRoles,
        tone: inkDef.tone,
        importance: inkDef.importance,
        timestamp: ink.updated_at || new Date().toISOString(),
        isRead: readIds.has(id),
        entityId: ink.id
      });
    });
  }

  // 5. Low Raw Material Substrate Stock
  const subDef = NOTIFICATION_ACTION_TYPES.low_stock_substrate;
  const subTargetRoles = roleMatrix[subDef.actionType] || subDef.targetRoles;
  if (isUserTargetedForNotification(currentUser, subTargetRoles)) {
    (inventory || []).forEach((item) => {
      const avail = Number(item.available_qty_kg ?? item.availableQtyKg ?? 0);
      const reorder = Number(item.reorder_level_kg ?? item.reorderLevelKg ?? 100);
      if (avail <= reorder && item.is_active !== false && item.active !== false) {
        const id = `low-stock-${item.id}`;
        const name = item.item_name || item.itemName || item.item_code || 'Film Substrate';
        items.push({
          id,
          actionType: subDef.actionType,
          categoryLabel: subDef.label,
          title: `Low RM Stock: ${name}`,
          message: `On-hand stock ${avail.toFixed(1)} kg is at or below reorder level ${reorder} kg.`,
          url: subDef.defaultUrl,
          targetRoles: subTargetRoles,
          tone: subDef.tone,
          importance: subDef.importance,
          timestamp: item.updated_at || new Date().toISOString(),
          isRead: readIds.has(id),
          entityId: item.id
        });
      }
    });
  }

  // 6. Pending Salary Advances
  const advDef = NOTIFICATION_ACTION_TYPES.salary_advance;
  const advTargetRoles = roleMatrix[advDef.actionType] || advDef.targetRoles;
  if (isUserTargetedForNotification(currentUser, advTargetRoles)) {
    (salaryAdvances || []).forEach((adv) => {
      const status = (adv.status || '').toLowerCase();
      if (status.includes('pending') || status === 'requested') {
        const id = `salary-adv-${adv.id}`;
        items.push({
          id,
          actionType: advDef.actionType,
          categoryLabel: advDef.label,
          title: `Salary Advance Request`,
          message: `${adv.employee_name || 'Employee'} requested ₹${adv.amount?.toLocaleString('en-IN') || '0'} (${adv.status || 'Pending'}).`,
          url: advDef.defaultUrl,
          targetRoles: advTargetRoles,
          tone: advDef.tone,
          importance: advDef.importance,
          timestamp: adv.created_at || adv.request_date || new Date().toISOString(),
          isRead: readIds.has(id),
          entityId: adv.id
        });
      }
    });
  }

  // 7. Material Indents Pending Issue
  const indDef = NOTIFICATION_ACTION_TYPES.material_indent;
  const indTargetRoles = roleMatrix[indDef.actionType] || indDef.targetRoles;
  if (isUserTargetedForNotification(currentUser, indTargetRoles)) {
    (indents || []).forEach((ind) => {
      const status = (ind.status || '').toLowerCase();
      if (status.includes('pending') || status === 'open' || status === 'partial') {
        const id = `indent-${ind.id || ind.indent_number}`;
        items.push({
          id,
          actionType: indDef.actionType,
          categoryLabel: indDef.label,
          title: `Store Indent #${ind.indent_number || ind.id}`,
          message: `${ind.department || 'Production'} requested ${ind.item_name || 'consumables'} (${ind.status || 'Pending Issue'}).`,
          url: indDef.defaultUrl,
          targetRoles: indTargetRoles,
          tone: indDef.tone,
          importance: indDef.importance,
          timestamp: ind.created_at || new Date().toISOString(),
          isRead: readIds.has(id),
          entityId: ind.id
        });
      }
    });
  }

  // 8. Open Bug Reports
  const bugDef = NOTIFICATION_ACTION_TYPES.bug_report;
  const bugTargetRoles = roleMatrix[bugDef.actionType] || bugDef.targetRoles;
  if (isUserTargetedForNotification(currentUser, bugTargetRoles)) {
    (bugReports || []).forEach((bug) => {
      const status = (bug.status || '').toLowerCase();
      if (status === 'open' || status === 'investigating' || status === 'new') {
        const id = `bug-${bug.id}`;
        items.push({
          id,
          actionType: bugDef.actionType,
          categoryLabel: bugDef.label,
          title: `Bug Report #${bug.id || ''}`,
          message: `${bug.title || 'Reported Issue'} [${bug.severity || 'Normal'}]`,
          url: bugDef.defaultUrl,
          targetRoles: bugTargetRoles,
          tone: bugDef.tone,
          importance: bugDef.importance,
          timestamp: bug.created_at || new Date().toISOString(),
          isRead: readIds.has(id),
          entityId: bug.id
        });
      }
    });
  }

  // 9. Database ERP Notifications (Structure changes, Consumption reverts, etc.)
  (erpNotifications || []).forEach((notif) => {
    const payload = notif.payload || {};
    const type = payload.type || notif.type;
    let def = null;

    if (type === 'STRUCTURE_CHANGED' || type === 'STRUCTURE_CHANGE_NOTICE') {
      def = NOTIFICATION_ACTION_TYPES.structure_notice;
    } else if (type === 'CONSUMPTION_REVERTED') {
      def = NOTIFICATION_ACTION_TYPES.revert_notice;
    }

    if (def) {
      const targetRoles = roleMatrix[def.actionType] || def.targetRoles;
      if (isUserTargetedForNotification(currentUser, targetRoles)) {
        const id = `db-notif-${notif.id}`;
        items.push({
          id,
          actionType: def.actionType,
          categoryLabel: def.label,
          title: payload.title || def.label,
          message: payload.message || payload.note || 'Plant operational structure change notice.',
          url: payload.url || def.defaultUrl,
          targetRoles: targetRoles,
          tone: def.tone,
          importance: def.importance,
          timestamp: notif.created_at || new Date().toISOString(),
          isRead: readIds.has(id) || notif.read === true,
          entityId: notif.id
        });
      }
    }
  });

  // Sort: Unread first, then newest first
  items.sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const unreadCount = items.filter((n) => !n.isRead).length;

  return {
    notifications: items,
    unreadCount,
    totalCount: items.length,
    permission: getNotificationPermission()
  };
}

/**
 * Checks whether a notification qualifies to be pushed natively as an OS/device alert.
 * ENFORCES:
 * 1. Only important / critical notifications (pushEnabledTypes[notif.actionType] === true).
 * 2. NO old notifications: Must have occurred AFTER enabledAt timestamp and NOT be in the baseline set.
 * 3. Never push already sent or read notifications.
 */
export function isNotificationEligibleForPush(notif, currentUser, { enabledAt, baselineIds, sentIds, pushEnabledTypes }) {
  if (!notif || !currentUser || !enabledAt) return false;
  if (notif.isRead) return false;

  // 1. Check if native push is enabled for this action type by Admin
  if (pushEnabledTypes && pushEnabledTypes[notif.actionType] === false) {
    return false;
  }

  // 2. Double-check importance (do not push normal routine alerts)
  if (notif.importance === 'normal' && (!pushEnabledTypes || !pushEnabledTypes[notif.actionType])) {
    return false;
  }

  // 3. Must not have been sent already
  if (sentIds.has(notif.id)) return false;

  // 4. Must NOT have existed in the baseline when notifications were enabled
  if (baselineIds.has(notif.id)) return false;

  // 5. Must NOT be older than enabledAt timestamp
  const notifTime = notif.timestamp ? new Date(notif.timestamp).getTime() : 0;
  if (notifTime > 0 && notifTime < enabledAt) {
    return false;
  }

  return true;
}

/**
 * Synchronizes and dispatches native PWA notifications for eligible NEW items only.
 * Throttled to prevent flooding (max 2 per cycle).
 */
export async function syncAndDispatchPwaNativeNotifications(currentUser, notifications = []) {
  if (!currentUser || getNotificationPermission() !== 'granted') return 0;

  const enabledAt = getPrivateNotificationEnabledAt(currentUser);
  if (!enabledAt) {
    // If not explicitly enabled and baselined yet, do NOT blast notifications!
    return 0;
  }

  const baselineIds = getPrivateBaselineNotificationIds(currentUser);
  const sentIds = getPrivateSentPwaIds(currentUser);
  const pushEnabledTypes = getPushEnabledTypes();

  let dispatchedCount = 0;
  const maxPerCycle = 2; // Strict throttle against spam

  for (const notif of notifications) {
    if (dispatchedCount >= maxPerCycle) break;

    const eligible = isNotificationEligibleForPush(notif, currentUser, {
      enabledAt,
      baselineIds,
      sentIds,
      pushEnabledTypes
    });

    if (eligible) {
      const success = await sendPwaNativeNotification({
        id: notif.id,
        title: notif.title,
        body: notif.message,
        url: notif.url,
        actionType: notif.actionType,
        tag: `samyak-${notif.id}`
      });
      if (success) {
        recordPrivatePwaSent(currentUser, notif.id);
        dispatchedCount++;
      }
    }
  }

  return dispatchedCount;
}
