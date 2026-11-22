import { userHasAnyRole } from '../assignedRoles.js';

/** This browser only. It is not written to Supabase. */
export const MANTINE_TRIAL_STORAGE_KEY = 'samyak_ui_mantine_inventory';

export const MANTINE_TRIAL_ROLES = ['Admin', 'Plant Manager'];

export function classicUiForced(search = '') {
  const query = String(search || '').replace(/^\?/, '');
  return new URLSearchParams(query).get('ui') === 'classic';
}

export function canToggleMantineTrial(user) {
  return userHasAnyRole(user, MANTINE_TRIAL_ROLES);
}

export function readMantineTrialPreference(storage) {
  try {
    return storage?.getItem(MANTINE_TRIAL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeMantineTrialPreference(storage, enabled) {
  if (!storage || typeof storage.setItem !== 'function') return;
  storage.setItem(MANTINE_TRIAL_STORAGE_KEY, enabled ? '1' : '0');
}

/**
 * The new tables show only for Admin and Plant Manager, only on this device,
 * and only when the address is not forcing the current table.
 */
export function mantineTrialActive({ user, search = '', storage } = {}) {
  if (classicUiForced(search)) return false;
  if (!canToggleMantineTrial(user)) return false;
  return readMantineTrialPreference(storage);
}
