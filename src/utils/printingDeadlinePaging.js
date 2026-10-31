/**
 * Page size and collapse memory for the pre-printing deadline lists.
 * The lists themselves stay in the order they were given (overdue first).
 */

export const PRINTING_DEADLINE_PAGE_SIZE = 7;

export function collapsedStorageKey(section, userKey) {
  const who = String(userKey || '').trim() || 'anonymous';
  const name = section === 'summary' ? 'summary' : 'list';
  return `samyak.printing-deadline.${name}.collapsed.${who}`;
}

export function readCollapsed(storage, key) {
  if (!storage || !key) return false;
  try {
    const value = storage.getItem(key);
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

export function writeCollapsed(storage, key, collapsed) {
  if (!storage || !key) return false;
  try {
    storage.setItem(key, collapsed ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}

/**
 * Slice a list into pages of 7. A requested page past the end resets to 1
 * so a refresh that shortens the list does not land on a missing page.
 */
export function pageOf(items, requestedPage, pageSize = PRINTING_DEADLINE_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : PRINTING_DEADLINE_PAGE_SIZE;
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const requested = Number.isFinite(Number(requestedPage)) ? Math.floor(Number(requestedPage)) : 1;
  const page = requested >= 1 && requested <= pageCount ? requested : 1;
  const start = (page - 1) * size;
  const end = Math.min(start + size, total);
  return {
    page,
    pageCount,
    pageSize: size,
    total,
    items: list.slice(start, end),
    showingFrom: total === 0 ? 0 : start + 1,
    showingTo: end,
    showControls: total > size,
  };
}
