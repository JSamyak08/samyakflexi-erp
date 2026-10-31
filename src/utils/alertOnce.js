const shownAt = new Map();

/**
 * Show a browser alert the first time this message appears.
 * A retry or autosave loop that repeats the same failure stays quiet.
 * Returns true when the alert was shown.
 */
export function alertOnce(message, { windowMs = 8000, alertFn } = {}) {
  const text = String(message || '').trim();
  if (!text) return false;
  const now = Date.now();
  const previous = shownAt.get(text) || 0;
  if (now - previous < windowMs) return false;
  shownAt.set(text, now);
  const notify = alertFn || (typeof alert === 'function' ? alert : null);
  if (notify) notify(text);
  return true;
}

export function resetAlertOnce() {
  shownAt.clear();
}

export function orderSaveAlert(orderId, error) {
  const detail = error?.message || String(error || 'Unknown database error');
  return `Failed to update order ${orderId} in Supabase database: ${detail}`;
}

export function alertOrderSaveError(orderId, error, options) {
  const shown = alertOnce(orderSaveAlert(orderId, error), options);
  const wrapped = error instanceof Error ? error : new Error(error?.message || String(error || 'Unknown database error'));
  if (shown || wrapped.alreadyAlerted) wrapped.alreadyAlerted = true;
  else wrapped.alreadyAlerted = true;
  return wrapped;
}
