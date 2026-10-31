/**
 * The header "Active User" switch is an Admin preview of another directory
 * account. The decision uses the signed-in profile, never the account the
 * screen is currently showing. A stored preview, a legacy localStorage
 * profile, and impersonation query params do not change a non-Admin.
 */

import { userHasRole } from '../assignedRoles.js';
import { activeUserLabel } from './activeUserLabel.js';

export const ACTIVE_USER_PREVIEW_KEY = 'samyak_erp_ui_role_preview';
export const ACTIVE_USER_LEGACY_STORAGE_KEY = 'samyak_erp_current_user';

export const ACTIVE_USER_QUERY_KEYS = [
  'activeUser',
  'active_user',
  'impersonate',
  'asUser',
  'previewUser',
];

export function realUserCanSwitchActiveUser(sessionUser) {
  return userHasRole(sessionUser, 'Admin');
}

export function activeUserReadonlyLabel(user) {
  const name = String(user?.name || user?.fullName || user?.full_name || '').trim();
  if (name) return name;
  const email = String(user?.email || '').trim();
  if (email) return email;
  return activeUserLabel(user);
}

function asParams(search) {
  if (!search) return new URLSearchParams();
  if (typeof URLSearchParams !== 'undefined' && search instanceof URLSearchParams) return new URLSearchParams(search);
  return new URLSearchParams(String(search).replace(/^\?/, ''));
}

export function activeUserQueryPresent(search) {
  const params = asParams(search);
  return ACTIVE_USER_QUERY_KEYS.some((key) => params.has(key));
}

export function stripActiveUserQuery(search) {
  const params = asParams(search);
  for (const key of ACTIVE_USER_QUERY_KEYS) params.delete(key);
  const next = params.toString();
  return next ? `?${next}` : '';
}

function previewWithId(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.id == null || String(value.id).trim() === '') return null;
  return value;
}

export function readStoredActiveUserPreview(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(ACTIVE_USER_PREVIEW_KEY);
    if (!raw) return null;
    return previewWithId(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * sessionUser is the authenticated directory row.
 * preview is a previously stored switch, ignored unless sessionUser is Admin.
 * search is never a way to become someone else.
 */
export function resolveActiveUser({ sessionUser, preview, search } = {}) {
  const stripQuery = activeUserQueryPresent(search);
  if (!sessionUser) {
    return { user: null, allowSwitch: false, clearPreview: true, stripQuery };
  }
  const allowSwitch = realUserCanSwitchActiveUser(sessionUser);
  if (!allowSwitch) {
    return { user: sessionUser, allowSwitch: false, clearPreview: true, stripQuery };
  }
  const stored = previewWithId(preview);
  return {
    user: stored || sessionUser,
    allowSwitch: true,
    clearPreview: false,
    stripQuery,
  };
}

/**
 * Apply a dropdown choice. Non-Admins cannot switch, and an Admin who picks
 * their own row drops the stored preview so the next load is themselves.
 */
export function chooseActiveUser(sessionUser, selectedUser) {
  if (!realUserCanSwitchActiveUser(sessionUser)) {
    return { ok: false, user: sessionUser || null, clearPreview: true };
  }
  const selected = previewWithId(selectedUser);
  if (!selected) return { ok: false, user: sessionUser, clearPreview: false };
  const backToSelf = String(selected.id) === String(sessionUser.id);
  return { ok: true, user: selected, clearPreview: backToSelf };
}

export function clearActiveUserOverride(sessionStore, localStore) {
  for (const store of [sessionStore, localStore]) {
    if (!store || typeof store.removeItem !== 'function') continue;
    try { store.removeItem(ACTIVE_USER_PREVIEW_KEY); } catch { /* private mode */ }
    try { store.removeItem(ACTIVE_USER_LEGACY_STORAGE_KEY); } catch { /* private mode */ }
  }
}

export function writeActiveUserPreview(storage, user) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(ACTIVE_USER_PREVIEW_KEY, JSON.stringify(user));
    return true;
  } catch {
    return false;
  }
}
