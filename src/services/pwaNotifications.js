/**
 * Role-Based PWA Private Notification Service for SamyakFlexi ERP.
 *
 * Provides:
 * 1. Role-based notification aggregation from ERP operational events.
 * 2. Strict user privacy: read/dismissed and sent states are isolated per logged-in user.
 * 3. Browser & PWA native Web Notification API integration with Service Worker click handling.
 * 4. Direct action redirection: clicking a notification redirects to the specific action type/route.
 */

import { assignedRolesOf } from '../assignedRoles.js';
import { isOrderOverdue } from '../factoryStore.js';

export const NOTIFICATION_ACTION_TYPES = {
  qc_inspection: {
    actionType: 'qc_inspection',
    label: 'Quality QC',
    description: 'Inward GRN material rolls require laboratory QC verification',
    targetRoles: ['Admin', 'Plant Manager', 'QC Chemist'],
    defaultUrl: '/inventory/qc',
    tone: 'warning'
  },
  delayed_order: {
    actionType: 'delayed_order',
    label: 'Delayed Order',
    description: 'Customer order target delivery date has passed',
    targetRoles: ['Admin', 'Plant Manager', 'Sales Manager', 'Production Manager'],
    defaultUrl: '/orders',
    tone: 'danger'
  },
  printing_deadline: {
    actionType: 'printing_deadline',
    label: 'Printing Deadline',
    description: 'Press schedule deadline approaching or overdue',
    targetRoles: ['Admin', 'Plant Manager', 'Production Manager', 'Printing Operator'],
    defaultUrl: '/printing',
    tone: 'warning'
  },
  low_stock_ink: {
    actionType: 'low_stock_ink',
    label: 'Low Ink Stock',
    description: 'Ink shade stock is below minimum safe reorder level',
    targetRoles: ['Admin', 'Plant Manager', 'Store Manager', 'Purchase Manager'],
    defaultUrl: '/inks/stock',
    tone: 'warning'
  },
  low_stock_substrate: {
    actionType: 'low_stock_substrate',
    label: 'Low RM Stock',
    description: 'Raw material stock is below reorder threshold',
    targetRoles: ['Admin', 'Plant Manager', 'Store Manager', 'Purchase Manager'],
    defaultUrl: '/inventory',
    tone: 'warning'
  },
  salary_advance: {
    actionType: 'salary_advance',
    label: 'Salary Advance',
    description: 'Employee salary advance request requires management approval',
    targetRoles: ['Admin', 'HR & Payroll Manager'],
    defaultUrl: '/employees/advances',
    tone: 'info'
  },
  material_indent: {
    actionType: 'material_indent',
    label: 'Material Indent',
    description: 'Department requisition pending store issue',
    targetRoles: ['Admin', 'Store Manager', 'Plant Manager'],
    defaultUrl: '/store/indents',
    tone: 'info'
  },
  structure_notice: {
    actionType: 'structure_notice',
    label: 'Structure Changed',
    description: 'Cylinder card or job master alteration on active order',
    targetRoles: ['Admin', 'Plant Manager', 'Production Manager', 'Purchase Manager', 'Store Manager'],
    defaultUrl: '/orders',
    tone: 'info'
  },
  revert_notice: {
    actionType: 'revert_notice',
    label: 'Reverted Roll',
    description: 'Roll consumption was rolled back',
    targetRoles: ['Admin', 'Plant Manager', 'Store Manager', 'Purchase Manager'],
    defaultUrl: '/inventory',
    tone: 'warning'
  },
  bug_report: {
    actionType: 'bug_report',
    label: 'Bug Report',
    description: 'New plant user bug report awaiting investigation',
    targetRoles: ['Admin'],
    defaultUrl: '/bug-reports',
    tone: 'danger'
  }
};

/**
 * Checks if the user is targeted for this action type based on assigned roles.
 * Admins have supervisory visibility across all operational notifications.
 */
export function isUserTargetedForNotification(user, targetRoles = []) {
  if (!user) return false;
  const userRoles = assignedRolesOf(user);
  if (userRoles.includes('Admin')) return true;
  return targetRoles.some((role) => userRoles.includes(role));
}

/**
 * Returns a stable unique key for the logged in user for private storage.
 */
export function getUserStorageKey(user) {
  if (!user) return 'anonymous';
  return String(user.id || user.auth_user_id || user.email || 'user').toLowerCase().trim();
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
  erpNotifications = []
}) {
  if (!currentUser) {
    return { notifications: [], unreadCount: 0, totalCount: 0, permission: getNotificationPermission() };
  }

  const readIds = getPrivateReadNotificationIds(currentUser);
  const items = [];

  // 1. Pending Inward QC Approvals
  const qcDef = NOTIFICATION_ACTION_TYPES.qc_inspection;
  if (isUserTargetedForNotification(currentUser, qcDef.targetRoles)) {
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
          targetRoles: qcDef.targetRoles,
          tone: qcDef.tone,
          timestamp: grn.created_at || grn.receipt_date || new Date().toISOString(),
          isRead: readIds.has(id),
          entityId: grn.id || grn.grn_number
        });
      }
    });
  }

  // 2. Delayed Customer Orders
  const delayedDef = NOTIFICATION_ACTION_TYPES.delayed_order;
  if (isUserTargetedForNotification(currentUser, delayedDef.targetRoles)) {
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
          targetRoles: delayedDef.targetRoles,
          tone: delayedDef.tone,
          timestamp: order.target_delivery_date || order.created_at || new Date().toISOString(),
          isRead: readIds.has(id),
          entityId: order.id
        });
      }
    });
  }

  // 3. Printing Deadline Reminders
  const printDef = NOTIFICATION_ACTION_TYPES.printing_deadline;
  if (isUserTargetedForNotification(currentUser, printDef.targetRoles)) {
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
        targetRoles: printDef.targetRoles,
        tone: stage === 'overdue' ? 'danger' : 'warning',
        timestamp: reminder.timestamp || new Date().toISOString(),
        isRead: readIds.has(id),
        entityId: order.id
      });
    });
  }

  // 4. Low Ink Stock Alerts
  const inkDef = NOTIFICATION_ACTION_TYPES.low_stock_ink;
  if (isUserTargetedForNotification(currentUser, inkDef.targetRoles)) {
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
        targetRoles: inkDef.targetRoles,
        tone: inkDef.tone,
        timestamp: ink.updated_at || new Date().toISOString(),
        isRead: readIds.has(id),
        entityId: ink.id
      });
    });
  }

  // 5. Low Raw Material Substrate Stock
  const subDef = NOTIFICATION_ACTION_TYPES.low_stock_substrate;
  if (isUserTargetedForNotification(currentUser, subDef.targetRoles)) {
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
          targetRoles: subDef.targetRoles,
          tone: subDef.tone,
          timestamp: item.updated_at || new Date().toISOString(),
          isRead: readIds.has(id),
          entityId: item.id
        });
      }
    });
  }

  // 6. Pending Salary Advances
  const advDef = NOTIFICATION_ACTION_TYPES.salary_advance;
  if (isUserTargetedForNotification(currentUser, advDef.targetRoles)) {
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
          targetRoles: advDef.targetRoles,
          tone: advDef.tone,
          timestamp: adv.created_at || adv.request_date || new Date().toISOString(),
          isRead: readIds.has(id),
          entityId: adv.id
        });
      }
    });
  }

  // 7. Material Indents Pending Issue
  const indDef = NOTIFICATION_ACTION_TYPES.material_indent;
  if (isUserTargetedForNotification(currentUser, indDef.targetRoles)) {
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
          targetRoles: indDef.targetRoles,
          tone: indDef.tone,
          timestamp: ind.created_at || new Date().toISOString(),
          isRead: readIds.has(id),
          entityId: ind.id
        });
      }
    });
  }

  // 8. Open Bug Reports
  const bugDef = NOTIFICATION_ACTION_TYPES.bug_report;
  if (isUserTargetedForNotification(currentUser, bugDef.targetRoles)) {
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
          targetRoles: bugDef.targetRoles,
          tone: bugDef.tone,
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

    if (def && isUserTargetedForNotification(currentUser, def.targetRoles)) {
      const id = `db-notif-${notif.id}`;
      items.push({
        id,
        actionType: def.actionType,
        categoryLabel: def.label,
        title: payload.title || def.label,
        message: payload.message || payload.note || 'Plant operational structure change notice.',
        url: payload.url || def.defaultUrl,
        targetRoles: def.targetRoles,
        tone: def.tone,
        timestamp: notif.created_at || new Date().toISOString(),
        isRead: readIds.has(id) || notif.read === true,
        entityId: notif.id
      });
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
 * Sends native PWA notifications for any newly arrived unread notifications that
 * have not yet triggered a native system banner/toast for this user.
 */
export async function syncAndDispatchPwaNativeNotifications(currentUser, notifications = []) {
  if (!currentUser || getNotificationPermission() !== 'granted') return 0;
  const sentIds = getPrivateSentPwaIds(currentUser);
  let dispatchedCount = 0;

  for (const notif of notifications) {
    if (notif.isRead || sentIds.has(notif.id)) continue;
    // Dispatch native PWA notification
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

  return dispatchedCount;
}
