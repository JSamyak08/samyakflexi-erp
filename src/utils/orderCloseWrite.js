/**
 * Close columns are Admin-controlled. Ordinary saves must not turn a missing
 * close mode into a write, and an explicit null must not be replaced by an
 * older closeMode still sitting inside jobDetails.
 */

export function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

export function explicitCloseMode(order) {
  if (!order || typeof order !== 'object') return null;
  const value = hasOwn(order, 'closeMode') ? order.closeMode : order.jobDetails?.closeMode;
  if (value === 'manual' || value === 'auto') return value;
  return null;
}

export function orderWritesClose(order) {
  return order?.closeWrite === true;
}

export function closeDetail(order, key) {
  if (!order || typeof order !== 'object') return null;
  if (order.closeWrite === true || hasOwn(order, key)) return order[key] ?? null;
  return order.jobDetails?.[key] ?? null;
}

export function statusForOrderSave(order) {
  const status = typeof order?.status === 'string' ? order.status.trim() : '';
  return status || undefined;
}

/**
 * Columns for an intentional close, reopen, or auto-close.
 * Returns null when this save must leave the database close columns alone.
 */
export function closeColumnsForOrderSave(order) {
  if (!orderWritesClose(order)) return null;
  return {
    closed_by: closeDetail(order, 'closedBy'),
    closed_at: closeDetail(order, 'closedAt'),
    close_reason: closeDetail(order, 'closeReason'),
    close_mode: explicitCloseMode(order),
    over_dispatch_warning: closeDetail(order, 'overDispatchWarning')
  };
}
