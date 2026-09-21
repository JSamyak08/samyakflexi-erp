import { getInventoryAgeingSettings, DEFAULT_AGEING_SETTINGS } from '../services/settingsService';

/**
 * Parses any date field on an item and returns a valid Date object or null
 */
export function getItemInwardDate(item) {
  if (!item) return null;
  const rawDate = item.inwardDate || item.inwardDatetime || item.dateReceived || item.receivedDate || item.grnDate || item.createdAt || item.date || item.lastUpdated;
  if (!rawDate) return null;
  
  const d = new Date(rawDate);
  if (!isNaN(d.getTime())) return d;
  
  // Attempt string parsing for DD/MM/YYYY or DD-MM-YYYY formats (Indian date format)
  if (typeof rawDate === 'string') {
    const parts = rawDate.split(/[\/\-\s,:]+/);
    if (parts.length >= 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10) > 100 ? parseInt(parts[2], 10) : 2000 + parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const parsed = new Date(year, month, day);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    }
  }
  return null;
}

/**
 * Calculates item storage age in calendar days
 */
export function getItemAgeInDays(item) {
  const d = getItemInwardDate(item);
  if (!d) return 0;
  const now = new Date();
  const diffTime = Math.max(0, now - d);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Returns the maximum storage age limit (in days) for a given category
 */
export function getCategoryAgeingThreshold(category, settings = null) {
  const cfg = settings || getInventoryAgeingSettings();
  if (category && cfg[category] !== undefined && cfg[category] !== null) {
    return Number(cfg[category]) || 90;
  }
  return Number(cfg.defaultDays) || 90;
}

/**
 * Checks if an inventory item has exceeded its category ageing threshold
 */
export function isItemOverAged(item, settings = null) {
  if (!item) return false;
  const ageDays = getItemAgeInDays(item);
  const threshold = getCategoryAgeingThreshold(item.category, settings);
  return ageDays > threshold;
}

/**
 * Sorts inventory items by FIFO rules (Oldest stock first at the top)
 */
export function sortInventoryByFifo(items = []) {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => {
    const ageA = getItemAgeInDays(a);
    const ageB = getItemAgeInDays(b);
    return ageB - ageA; // Higher age = older inward date = placed FIRST
  });
}

/**
 * Sorts batch / roll options by FIFO rules (Oldest date first at the top)
 * Flags the top available batch as the FIFO recommended choice.
 */
export function sortBatchesByFifo(batches = []) {
  if (!Array.isArray(batches)) return [];
  
  const sorted = [...batches].sort((a, b) => {
    const dateA = getItemInwardDate(a) || new Date(0);
    const dateB = getItemInwardDate(b) || new Date(0);
    return dateA - dateB; // Ascending date = oldest batch first
  });

  return sorted.map((batch, index) => ({
    ...batch,
    isFifoPriority: index === 0,
    fifoBadge: index === 0 ? '🌟 FIFO CONSUME FIRST (Oldest Batch)' : null
  }));
}
