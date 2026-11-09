/** Browser-local open/closed state for the main navigation rail. */
export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'samyak.sidebar.collapsed';

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Missing, unreadable, or any value other than "collapsed" stays expanded. */
export function readSidebarCollapsed(storage) {
  const store = resolveStorage(storage);
  if (!store || typeof store.getItem !== 'function') return false;
  try {
    return String(store.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) || '').trim() === 'collapsed';
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed, storage) {
  const store = resolveStorage(storage);
  if (!store || typeof store.setItem !== 'function') return;
  try {
    store.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    /* private mode or a full quota should not block the layout */
  }
}

/** Flip the rail and persist the result. Returns the next collapsed flag. */
export function toggleStoredSidebarCollapsed(current, storage) {
  const next = !current;
  writeSidebarCollapsed(next, storage);
  return next;
}

/**
 * Ctrl+\ on Windows/Linux and Cmd+\ on macOS.
 * Alt+B and Ctrl+B stay reserved for the barcode scanner.
 */
export function isSidebarCollapseShortcut(event) {
  if (!event || event.repeat || event.altKey || event.shiftKey) return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key === '\\') return true;
  return event.code === 'Backslash' || event.code === 'IntlBackslash';
}

export function sidebarShortcutLabel(userAgent = '') {
  return /Mac|iPhone|iPad|iPod/i.test(String(userAgent)) ? '⌘\\' : 'Ctrl+\\';
}
