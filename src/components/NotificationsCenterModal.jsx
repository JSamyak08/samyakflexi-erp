import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  ShieldAlert,
  Droplet,
  Layers,
  RotateCcw,
  Package,
  FileCheck,
  Send,
  Sparkles,
  CheckCheck,
  Settings,
  ShieldCheck,
  Save,
  ArrowLeft,
  Check,
  Smartphone
} from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import { assignedRolesOf, userHasRole } from '../assignedRoles';
import { SYSTEM_ROLES } from '../roles';
import {
  NOTIFICATION_ACTION_TYPES,
  getRoleNotificationMatrix,
  saveRoleNotificationMatrix,
  getPushEnabledTypes,
  savePushEnabledTypes,
  resetRoleNotificationMatrix,
  requestNotificationPermission,
  sendPwaNativeNotification,
  markPrivateNotificationRead,
  markAllPrivateNotificationsRead,
  enableAndBaselinePwaNotifications
} from '../services/pwaNotifications';

export default function NotificationsCenterModal({
  isOpen,
  onClose,
  currentUser,
  notifications = [],
  unreadCount = 0,
  permission = 'default',
  onPermissionChange,
  onNavigate
}) {
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'unread' | actionType
  const [testSent, setTestSent] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedRole, setSelectedRole] = useState('Plant Manager');
  const [roleMatrix, setRoleMatrix] = useState(() => getRoleNotificationMatrix());
  const [pushTypes, setPushTypes] = useState(() => getPushEnabledTypes());
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(null);

  const isAdmin = userHasRole(currentUser, 'Admin');
  const userRoles = assignedRolesOf(currentUser);

  useEffect(() => {
    if (isOpen) {
      setRoleMatrix(getRoleNotificationMatrix());
      setPushTypes(getPushEnabledTypes());
      setShowSettings(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filtered notifications
  const displayedNotifications = notifications.filter((notif) => {
    if (activeFilter === 'unread') return !notif.isRead;
    if (activeFilter !== 'all') return notif.actionType === activeFilter;
    return true;
  });

  const handleEnablePermission = async () => {
    const result = await requestNotificationPermission();
    if (result === 'granted') {
      // Hard guarantee: baseline all currently existing notifications so NO OLD ONES are pushed!
      enableAndBaselinePwaNotifications(currentUser, notifications);
    }
    if (typeof onPermissionChange === 'function') {
      onPermissionChange(result);
    }
  };

  const handleTestNotification = async () => {
    const sample = notifications[0] || {
      id: 'test-pwa-notif',
      title: 'SamyakFlexi ERP Notification',
      message: 'Role-based PWA notification test. Tap to view your action items.',
      url: '/dashboard',
      actionType: 'general'
    };

    const success = await sendPwaNativeNotification({
      id: `test-${Date.now()}`,
      title: sample.title || 'Plant Action Task Alert',
      body: sample.message || 'Notification test for your role.',
      url: sample.url || '/dashboard',
      actionType: sample.actionType || 'general'
    });

    if (success) {
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    }
  };

  const handleNotificationClick = (notif) => {
    markPrivateNotificationRead(currentUser, notif.id);
    onClose();
    if (typeof onNavigate === 'function') {
      onNavigate(notif.url, notif.actionType);
    }
  };

  const handleMarkAllRead = () => {
    const allIds = notifications.map((n) => n.id);
    markAllPrivateNotificationsRead(currentUser, allIds);
  };

  // Admin Role Matrix Toggle
  const handleToggleRolePermission = (actionType, role) => {
    if (!isAdmin) return;
    setRoleMatrix((prev) => {
      const currentRoles = prev[actionType] || [];
      const has = currentRoles.includes(role);
      const updated = has ? currentRoles.filter((r) => r !== role) : [...currentRoles, role];
      return { ...prev, [actionType]: updated };
    });
  };

  // Admin Push Toggle
  const handleTogglePushType = (actionType) => {
    if (!isAdmin) return;
    setPushTypes((prev) => ({
      ...prev,
      [actionType]: !prev[actionType]
    }));
  };

  const handleSaveSettings = () => {
    if (!isAdmin) return;
    try {
      saveRoleNotificationMatrix(currentUser, roleMatrix);
      savePushEnabledTypes(currentUser, pushTypes);
      setSaveSuccessMessage('Role notification assignments saved successfully!');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      alert(err.message || 'Failed to save settings.');
    }
  };

  const handleResetSettings = () => {
    if (!isAdmin) return;
    if (window.confirm('Reset all role notification assignments and push defaults to factory standard?')) {
      resetRoleNotificationMatrix(currentUser);
      setRoleMatrix(getRoleNotificationMatrix());
      setPushTypes(getPushEnabledTypes());
      setSaveSuccessMessage('Reset to factory default settings.');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    }
  };

  // Tone styles
  const getToneStyle = (tone) => {
    switch (tone) {
      case 'danger':
        return {
          border: '#fecaca',
          bg: '#fef2f2',
          badgeBg: '#fee2e2',
          badgeText: '#dc2626',
          iconColor: '#dc2626'
        };
      case 'warning':
        return {
          border: '#fde68a',
          bg: '#fffbeb',
          badgeBg: '#fef3c7',
          badgeText: '#b45309',
          iconColor: '#d97706'
        };
      case 'info':
      default:
        return {
          border: '#bae6fd',
          bg: '#f0f9ff',
          badgeBg: '#e0f2fe',
          badgeText: '#0369a1',
          iconColor: '#0284c7'
        };
    }
  };

  const targetRolesList = SYSTEM_ROLES.filter((r) => r !== 'Admin');

  return (
    <ModalOverlay onClose={onClose}>
      <div
        className="modal-content glass-card"
        style={{
          width: '740px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '0',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#ffffff',
            padding: '16px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}
            >
              <Bell size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#ffffff' }}>
                  {showSettings ? 'Role Notification Assignments' : 'Plant Action Notifications'}
                </h3>
                {!showSettings && unreadCount > 0 && (
                  <span
                    style={{
                      background: '#dc2626',
                      color: '#ffffff',
                      fontSize: '0.72rem',
                      fontWeight: '800',
                      padding: '2px 8px',
                      borderRadius: '999px'
                    }}
                  >
                    {unreadCount} unread
                  </span>
                )}
                {showSettings && (
                  <span
                    style={{
                      background: 'rgba(56, 189, 248, 0.2)',
                      color: '#7dd3fc',
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      border: '1px solid rgba(56, 189, 248, 0.3)'
                    }}
                  >
                    Admin Only Control
                  </span>
                )}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#94a3b8' }}>
                {showSettings
                  ? 'Only Admin can configure which notification types each role receives and what triggers device push.'
                  : `Private role alerts for ${currentUser?.name || 'User'} (${isAdmin ? 'Admin • All Plant Alerts' : userRoles.join(', ') || 'Staff'})`}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isAdmin && (
              <button
                type="button"
                data-testid="pwa-notification-settings-btn"
                className="btn-secondary"
                onClick={() => setShowSettings(!showSettings)}
                title={showSettings ? 'Back to notifications' : 'Role notification assignments settings'}
                style={{
                  background: showSettings ? '#38bdf8' : 'rgba(255,255,255,0.12)',
                  borderColor: showSettings ? '#38bdf8' : 'rgba(255,255,255,0.2)',
                  color: showSettings ? '#0f172a' : '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {showSettings ? <ArrowLeft size={14} /> : <Settings size={14} />}
                {showSettings ? 'Back to Alerts' : 'Role Settings'}
              </button>
            )}

            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              aria-label="Close notification panel"
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: 'none',
                color: '#ffffff',
                padding: '6px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* =========================================================================
            ADMIN SETTINGS PANEL VIEW
            ========================================================================= */}
        {showSettings && isAdmin ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', overflowY: 'auto' }}>
            {saveSuccessMessage && (
              <div
                style={{
                  margin: '14px 22px 0',
                  padding: '10px 16px',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '8px',
                  color: '#065f46',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <CheckCircle2 size={16} /> {saveSuccessMessage}
              </div>
            )}

            {/* Anti-Spam Guidance Box */}
            <div
              style={{
                margin: '14px 22px 10px',
                padding: '12px 16px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <ShieldCheck size={20} style={{ color: '#0284c7', flexShrink: 0 }} />
              <div style={{ fontSize: '0.78rem', color: '#334155', lineHeight: '1.4' }}>
                <strong>Anti-Spam Protection Active:</strong> When users enable notifications, old historical records are suppressed—only new events going forward are shared. Routine stock and indents stay in-app; only urgent and critical plant events trigger native PWA device alerts.
              </div>
            </div>

            {/* Role Selector Tabs */}
            <div style={{ padding: '0 22px 10px' }}>
              <div style={{ fontSize: '0.76rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                Select Plant Role to Assign Notification Types:
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {targetRolesList.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedRole(r)}
                    style={{
                      padding: '5px 10px',
                      fontSize: '0.76rem',
                      fontWeight: '700',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: selectedRole === r ? '#0f172a' : '#cbd5e1',
                      background: selectedRole === r ? '#0f172a' : '#ffffff',
                      color: selectedRole === r ? '#ffffff' : '#334155',
                      cursor: 'pointer'
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Types Table for Selected Role */}
            <div style={{ padding: '0 22px 16px', flex: '1 1 auto' }}>
              <table className="data-table" style={{ fontSize: '0.78rem', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ background: '#0f172a', color: '#ffffff' }}>Notification Type</th>
                    <th style={{ background: '#0f172a', color: '#ffffff', width: '120px' }}>Importance</th>
                    <th style={{ background: '#0f172a', color: '#ffffff', textAlign: 'center', width: '140px' }}>
                      Assigned to {selectedRole}
                    </th>
                    <th style={{ background: '#0f172a', color: '#ffffff', textAlign: 'center', width: '130px' }}>
                      Native PWA Push?
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(NOTIFICATION_ACTION_TYPES).map((def) => {
                    const assignedList = roleMatrix[def.actionType] || [];
                    const isAssigned = assignedList.includes(selectedRole);
                    const isPushEnabled = pushTypes[def.actionType] === true;

                    return (
                      <tr key={def.actionType}>
                        <td>
                          <div style={{ fontWeight: '700', color: '#0f172a' }}>{def.label}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{def.description}</div>
                          <div style={{ fontSize: '0.68rem', color: '#0284c7', marginTop: '2px' }}>
                            Route: {def.defaultUrl}
                          </div>
                        </td>

                        <td>
                          {def.importance === 'critical' ? (
                            <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontWeight: '800', fontSize: '0.68rem' }}>
                              CRITICAL
                            </span>
                          ) : def.importance === 'high' ? (
                            <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: '800', fontSize: '0.68rem' }}>
                              HIGH
                            </span>
                          ) : (
                            <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', fontSize: '0.68rem' }}>
                              ROUTINE
                            </span>
                          )}
                        </td>

                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={isAssigned}
                              onChange={() => handleToggleRolePermission(def.actionType, selectedRole)}
                            />
                            <span style={{ fontWeight: '700', color: isAssigned ? '#047857' : '#94a3b8' }}>
                              {isAssigned ? 'Assigned' : 'Off'}
                            </span>
                          </label>
                        </td>

                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <button
                            type="button"
                            onClick={() => handleTogglePushType(def.actionType)}
                            style={{
                              border: 'none',
                              background: isPushEnabled ? '#ecfdf5' : '#f1f5f9',
                              color: isPushEnabled ? '#059669' : '#64748b',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title={isPushEnabled ? 'Pushes native OS banner' : 'In-app notification only'}
                          >
                            <Smartphone size={12} />
                            {isPushEnabled ? 'Push ON' : 'In-App Only'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Admin Settings Footer Actions */}
            <div
              style={{
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                padding: '12px 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={handleResetSettings}
                style={{ fontSize: '0.78rem', padding: '6px 12px' }}
              >
                <RotateCcw size={14} /> Reset to Factory Standard
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowSettings(false)}
                  style={{ fontSize: '0.78rem', padding: '6px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="pwa-save-settings-btn"
                  className="btn-primary"
                  onClick={handleSaveSettings}
                  style={{ fontSize: '0.78rem', padding: '6px 16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Save size={14} /> Save Notification Settings
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================================
              STANDARD NOTIFICATIONS LIST VIEW
              ========================================================================= */
          <>
            {/* PWA Notification Permission Banner */}
            <div style={{ padding: '14px 22px 0 22px' }}>
              {permission === 'default' && (
                <div
                  style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Sparkles size={18} style={{ color: '#2563eb', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.82rem', color: '#1e40af', fontWeight: '600' }}>
                      Enable PWA Private Notifications for your role. Only fresh, critical plant alerts going forward will be pushed.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleEnablePermission}
                    style={{ padding: '6px 14px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                  >
                    Enable Notifications
                  </button>
                </div>
              )}

              {permission === 'granted' && (
                <div
                  style={{
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '10px',
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: '0.78rem',
                    color: '#047857'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={15} style={{ color: '#10b981' }} />
                    <span>PWA Device Notifications Active • Only new critical alerts trigger push; old ones stay in-app.</span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleTestNotification}
                    style={{
                      padding: '3px 10px',
                      fontSize: '0.74rem',
                      color: '#065f46',
                      borderColor: '#a7f3d0',
                      background: '#ffffff'
                    }}
                  >
                    {testSent ? '✓ Sent Test Toast' : 'Test PWA Alert'}
                  </button>
                </div>
              )}

              {permission === 'denied' && (
                <div
                  style={{
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    borderRadius: '10px',
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.78rem',
                    color: '#be123c'
                  }}
                >
                  <AlertTriangle size={15} style={{ color: '#e11d48', flexShrink: 0 }} />
                  <span>
                    Browser push notifications are blocked in device settings. You can still review and act on all alerts in this panel.
                  </span>
                </div>
              )}
            </div>

            {/* Filter Bar & Quick Actions */}
            <div
              style={{
                padding: '12px 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                borderBottom: '1px solid #e2e8f0'
              }}
            >
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn-secondary ${activeFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('all')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    background: activeFilter === 'all' ? '#0f172a' : '#f1f5f9',
                    color: activeFilter === 'all' ? '#ffffff' : '#334155',
                    border: 'none',
                    borderRadius: '6px'
                  }}
                >
                  All ({notifications.length})
                </button>
                <button
                  type="button"
                  className={`btn-secondary ${activeFilter === 'unread' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('unread')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    background: activeFilter === 'unread' ? '#0f172a' : '#f1f5f9',
                    color: activeFilter === 'unread' ? '#ffffff' : '#334155',
                    border: 'none',
                    borderRadius: '6px'
                  }}
                >
                  Unread ({unreadCount})
                </button>
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleMarkAllRead}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <CheckCheck size={14} /> Mark all read
                </button>
              )}
            </div>

            {/* Notifications Scroll List */}
            <div
              style={{
                padding: '16px 22px',
                overflowY: 'auto',
                maxHeight: '52vh',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              {displayedNotifications.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '36px 20px',
                    color: '#64748b',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    border: '1px dashed #cbd5e1'
                  }}
                >
                  <CheckCircle2 size={32} style={{ color: '#10b981', margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#1e293b' }}>
                    All clear! No pending action items.
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
                    {activeFilter === 'unread'
                      ? 'You have caught up with all action items.'
                      : 'There are no active alerts matching your role profile right now.'}
                  </p>
                </div>
              ) : (
                displayedNotifications.map((notif) => {
                  const tone = getToneStyle(notif.tone);
                  return (
                    <div
                      key={notif.id}
                      style={{
                        background: notif.isRead ? '#ffffff' : tone.bg,
                        border: `1px solid ${notif.isRead ? '#e2e8f0' : tone.border}`,
                        borderLeft: `4px solid ${tone.badgeText}`,
                        borderRadius: '10px',
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: notif.isRead ? 'none' : '0 2px 4px rgba(0,0,0,0.03)'
                      }}
                      onClick={() => handleNotificationClick(notif)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleNotificationClick(notif);
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              background: tone.badgeBg,
                              color: tone.badgeText,
                              fontSize: '0.7rem',
                              fontWeight: '800',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              textTransform: 'uppercase'
                            }}
                          >
                            {notif.categoryLabel || 'Action Item'}
                          </span>
                          <h4
                            style={{
                              margin: 0,
                              fontSize: '0.88rem',
                              fontWeight: notif.isRead ? '600' : '800',
                              color: '#0f172a'
                            }}
                          >
                            {notif.title}
                          </h4>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.74rem',
                              color: '#0284c7',
                              fontWeight: '700'
                            }}
                          >
                            Open Action <ExternalLink size={12} />
                          </span>
                        </div>
                      </div>

                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                        {notif.message}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                          Redirects to: <code style={{ color: '#334155' }}>{notif.url}</code>
                        </span>
                        {!notif.isRead && (
                          <span style={{ fontSize: '0.7rem', color: '#b45309', fontWeight: '700' }}>
                            ● New Unread
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                padding: '12px 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.78rem',
                color: '#64748b'
              }}
            >
              <span>
                {isAdmin
                  ? 'Admin access: Click "Role Settings" above to manage notification types for all plant roles.'
                  : 'Alerts are assigned to your role by Plant Admin. Clicking navigates directly to the action.'}
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                style={{ padding: '4px 14px', fontSize: '0.78rem' }}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </ModalOverlay>
  );
}
