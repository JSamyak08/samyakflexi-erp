/**
 * System-wide String & Title Case Formatting Helpers
 * Ensures the first alphabet of every word is capitalised across the system.
 * Email addresses and UUIDs are left unchanged.
 */

const UUID_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shouldPreserveToken(token) {
  const bare = String(token || '').replace(/^[("'`]+|[)"'`,.;:]+$/g, '');
  return bare.includes('@') || UUID_TOKEN.test(bare);
}

export function capitalizeWords(str) {
  if (!str || typeof str !== 'string') return str || '';
  if (shouldPreserveToken(str.trim())) return str;
  return str.split(/(\s+)/).map((part) => {
    if (!part || /^\s+$/.test(part) || shouldPreserveToken(part)) return part;
    return part.replace(/\b\w+/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
  }).join('');
}

export function toTitleCase(str) {
  return capitalizeWords(str);
}

const PLACEHOLDER_PARTY_NAMES = new Set(['client', 'general client', 'valued client', 'standard client']);

export function isPlaceholderPartyName(name) {
  const value = String(name || '').trim().toLowerCase();
  return !value || value === 'n/a' || value === '#n/a' || value === '-' || PLACEHOLDER_PARTY_NAMES.has(value);
}

/** Display name for a customer/vendor party. Placeholder values render as an em dash. */
export function displayPartyName(name, fallback = '—') {
  if (isPlaceholderPartyName(name)) return fallback;
  return String(name).trim();
}
