/**
 * App-wide switch for raw-material stock reserved against active orders.
 * Stored in system_settings like the other factory settings.
 * Missing, blank, and anything other than an explicit on value mean off.
 * Off does not delete orders or stock. Turning it on runs the same
 * reservation math the screens used before this switch existed.
 */

export const STOCK_RESERVATION_SETTING = 'stock_reservation_for_orders';
export const DEFAULT_STOCK_RESERVATION_ENABLED = false;

export function normalizeStockReservationEnabled(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined || value === '') return false;
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'on' || text === 'yes';
}

/**
 * Exclusive reservations run only when the caller asks for them.
 * A missing option is off, which is the platform default.
 */
export function stockReservationsRequested(options) {
  if (options === true) return true;
  if (!options || typeof options !== 'object') return false;
  return options.enabled === true || options.stockReservationEnabled === true;
}
