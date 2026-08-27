/**
 * System-wide String & Title Case Formatting Helpers
 * Ensures the first alphabet of every word is capitalised across the system.
 */

export function capitalizeWords(str) {
  if (!str || typeof str !== 'string') return str || '';
  return str.replace(/\b\w+/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
  });
}

export function toTitleCase(str) {
  return capitalizeWords(str);
}
