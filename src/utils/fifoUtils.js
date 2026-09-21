import { getInventoryAgeingSettings, DEFAULT_AGEING_SETTINGS } from '../services/settingsService';

/**
 * Parses flexible raw date strings or Date objects into a valid Date object
 */
export function parseDateFlexible(rawDate) {
  if (!rawDate) return null;
  if (rawDate instanceof Date) return isNaN(rawDate.getTime()) ? null : rawDate;
  
  // Try standard Date parsing
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
 * Dynamically resolves the true oldest inward date for an item across its matching GRNs, rolls, and metadata.
 */
export function getItemInwardDate(item, grns = [], rolls = []) {
  if (!item) return null;

  const dates = [];

  // 1. Direct explicit date fields on item
  const explicitFields = [item.inwardDate, item.inwardDatetime, item.dateReceived, item.receivedDate, item.grnDate, item.createdDate, item.createdAt, item.date];
  explicitFields.forEach(f => {
    const parsed = parseDateFlexible(f);
    if (parsed) dates.push(parsed);
  });

  // 2. Check matching GRNs if provided
  const matchingGrnsList = Array.isArray(grns) && grns.length > 0 ? grns.filter(g => {
    if (!g) return false;
    if (g.itemId && (g.itemId === item.id || g.itemId === item.itemCode)) return true;
    if (g.stockItemId && (g.stockItemId === item.id || g.stockItemId === item.itemCode)) return true;
    const gName = (g.itemName || g.filmType || '').toLowerCase().trim();
    const iName = (item.itemName || item.filmType || '').toLowerCase().trim();
    return gName && iName && (gName === iName || gName.includes(iName) || iName.includes(gName));
  }) : (item.matchingGRNs || []);

  matchingGrnsList.forEach(g => {
    const parsed = parseDateFlexible(g.receivedDate || g.grnDate || g.inwardDate || g.createdAt || g.createdDate || g.date);
    if (parsed) dates.push(parsed);
  });

  // 3. Check matching Rolls if provided
  if (Array.isArray(rolls) && rolls.length > 0) {
    const matchingRolls = rolls.filter(r => r && (r.itemId === item.id || (r.itemName && r.itemName.toLowerCase() === (item.itemName || '').toLowerCase())));
    matchingRolls.forEach(r => {
      const parsed = parseDateFlexible(r.inwardDatetime || r.date || r.createdAt || r.inwardDate);
      if (parsed) dates.push(parsed);
    });
  }

  // 4. Fallback to lastUpdated only if no explicit inward/creation date was found
  if (dates.length === 0 && item.lastUpdated) {
    const parsed = parseDateFlexible(item.lastUpdated);
    if (parsed) dates.push(parsed);
  }

  if (dates.length === 0) return null;

  // Return the EARLIEST (oldest) date
  return new Date(Math.min(...dates.map(d => d.getTime())));
}

/**
 * Calculates item storage age in calendar days from its true oldest inward date
 */
export function getItemAgeInDays(item, grns = [], rolls = []) {
  const d = getItemInwardDate(item, grns, rolls);
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
export function isItemOverAged(item, settings = null, grns = [], rolls = []) {
  if (!item) return false;
  const ageDays = getItemAgeInDays(item, grns, rolls);
  const threshold = getCategoryAgeingThreshold(item.category, settings);
  return ageDays > threshold;
}

/**
 * Sorts inventory items by FIFO rules (Oldest stock first at the top)
 */
export function sortInventoryByFifo(items = [], grns = [], rolls = []) {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => {
    const ageA = getItemAgeInDays(a, grns, rolls);
    const ageB = getItemAgeInDays(b, grns, rolls);
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
