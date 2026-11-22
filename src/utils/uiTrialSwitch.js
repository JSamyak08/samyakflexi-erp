/**
 * UI Trial Switch (Rollback & Role Gated)
 * 
 * Rules:
 * - Visible to Admin and Plant Manager only
 * - Stored in localStorage on that device only ('samyak_ui_trial_enabled')
 * - Default: OFF (false)
 * - Query param ?ui=classic forces classic design (returns false)
 */

import { useState, useEffect, useCallback } from 'react';
import { userHasRole } from '../assignedRoles.js';

export const UI_TRIAL_STORAGE_KEY = 'samyak_ui_trial_enabled';
export const UI_TRIAL_CHANGE_EVENT = 'samyak_ui_trial_change';

/**
 * Checks whether the current user is permitted to toggle and view the UI trial.
 * Only Admin and Plant Manager roles are granted access.
 */
export function canToggleUiTrial(user) {
  if (!user) return false;
  return userHasRole(user, 'Admin') || userHasRole(user, 'Plant Manager');
}

/**
 * Returns whether the UI trial is currently active for the given user.
 * Honors the ?ui=classic query override, role gates, and localStorage state (default false).
 */
export function isUiTrialEnabled(user) {
  if (typeof window === 'undefined') return false;

  // 1. Query param override: ?ui=classic forces classic UI unconditionally
  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('ui') === 'classic') {
      return false;
    }
  } catch {
    // Ignore URL parsing errors
  }

  // 2. Role restriction: only Admin and Plant Manager can enable/view
  if (!canToggleUiTrial(user)) {
    return false;
  }

  // 3. Device localStorage persistence: default is OFF (false)
  try {
    const stored = window.localStorage.getItem(UI_TRIAL_STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

/**
 * Sets the UI trial status in localStorage and notifies active listeners.
 */
export function setUiTrialEnabled(enabled) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UI_TRIAL_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage quota/permission errors
  }
  try {
    window.dispatchEvent(new CustomEvent(UI_TRIAL_CHANGE_EVENT, { detail: { enabled: !!enabled } }));
  } catch {
    // Ignore dispatch errors
  }
}

/**
 * React hook to observe and toggle the UI trial state reactively.
 */
export function useUiTrial(user) {
  const [enabled, setEnabledState] = useState(() => isUiTrialEnabled(user));
  const canToggle = canToggleUiTrial(user);

  useEffect(() => {
    // Re-check whenever user changes
    setEnabledState(isUiTrialEnabled(user));

    const handleCustomChange = (e) => {
      if (canToggleUiTrial(user)) {
        setEnabledState(Boolean(e?.detail?.enabled));
      } else {
        setEnabledState(false);
      }
    };

    const handleStorageChange = (e) => {
      if (e.key === UI_TRIAL_STORAGE_KEY) {
        if (canToggleUiTrial(user)) {
          setEnabledState(e.newValue === 'true');
        } else {
          setEnabledState(false);
        }
      }
    };

    window.addEventListener(UI_TRIAL_CHANGE_EVENT, handleCustomChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(UI_TRIAL_CHANGE_EVENT, handleCustomChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [user]);

  const toggle = useCallback((nextState) => {
    if (!canToggle) return;
    const resolved = typeof nextState === 'boolean' ? nextState : !enabled;
    setUiTrialEnabled(resolved);
    setEnabledState(resolved);
  }, [canToggle, enabled]);

  return {
    enabled: canToggle && enabled,
    canToggle,
    toggle,
    setEnabled: toggle,
  };
}
