const PLANT_TIME_ZONE = 'Asia/Kolkata';
const PLANT_OFFSET = '+05:30';

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function fallbackNow(now) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now;
  if (now === null) return null;
  return new Date();
}

function clockFromMatch(hourText, minuteText, secondText, ampmText) {
  let hour = hourText === undefined ? 0 : Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  const ampm = (ampmText || '').toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

function timestampFromParts(year, month, day, clock) {
  if (!clock || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(clock.hour)}:${pad(clock.minute)}:${pad(clock.second)}${PLANT_OFFSET}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const check = new Intl.DateTimeFormat('en-GB', {
    timeZone: PLANT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(parsed);
  if (check !== `${pad(day)}/${pad(month)}/${year}`) return null;
  return parsed.toISOString();
}

/**
 * Value for a Postgres timestamptz / timestamp column.
 * Locale display strings are read as day/month in Asia/Kolkata.
 * A missing value uses `now`. Pass `now: null` to return null instead.
 */
export function toDatabaseTimestamp(value, now = new Date()) {
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return value.toISOString();
    const fallback = fallbackNow(now);
    return fallback ? fallback.toISOString() : null;
  }

  const text = value === undefined || value === null ? '' : String(value).trim();
  if (!text) {
    const fallback = fallbackNow(now);
    return fallback ? fallback.toISOString() : null;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(text) || /^\d{4}-\d{2}-\d{2} /.test(text)) {
    const parsed = new Date(text.includes(' ') && !text.includes('T') ? text.replace(' ', 'T') : text);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return timestampFromParts(Number(text.slice(0, 4)), Number(text.slice(5, 7)), Number(text.slice(8, 10)), { hour: 0, minute: 0, second: 0 });
  }

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?)?$/i);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const clock = clockFromMatch(slash[4], slash[5], slash[6], slash[7]);
    const iso = timestampFromParts(year, Number(slash[2]), Number(slash[1]), clock || { hour: 0, minute: 0, second: 0 });
    if (iso) return iso;
  }

  const named = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?)?$/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    const clock = clockFromMatch(named[4], named[5], named[6], named[7]);
    const iso = timestampFromParts(Number(named[3]), month, Number(named[1]), clock || { hour: 0, minute: 0, second: 0 });
    if (iso) return iso;
  }

  const fallback = fallbackNow(now);
  return fallback ? fallback.toISOString() : null;
}

/**
 * Value for a Postgres date column: YYYY-MM-DD.
 * A date-only day/month string keeps that calendar day.
 */
export function toDatabaseDate(value, now = new Date()) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }
  const fallbackDate = (fallbackNow(now) || new Date()).toISOString().split('T')[0];
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (!text) return fallbackDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10);

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const month = Number(slash[2]);
    const day = Number(slash[1]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  const named = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    const day = Number(named[1]);
    if (month && day >= 1 && day <= 31) return `${named[3]}-${pad(month)}-${pad(day)}`;
  }

  const stamp = toDatabaseTimestamp(text, null);
  return stamp ? stamp.split('T')[0] : fallbackDate;
}

/** Columns written by saveInventoryRollToSupabase. */
export function inventoryRollDateFields(roll, now = new Date()) {
  const inward = toDatabaseTimestamp(roll?.inwardDatetime, now);
  const hasProductionDate = roll?.productionDate !== undefined
    && roll?.productionDate !== null
    && String(roll.productionDate).trim() !== '';
  return {
    inward_datetime: inward,
    production_date: hasProductionDate ? toDatabaseDate(roll.productionDate, now) : inward.split('T')[0]
  };
}

function isIsoLike(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

/** Locale text for the screen. Strings that are already display text are left as stored. */
export function formatPlantDateTime(value) {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value).trim();
  if (!isIsoLike(text)) return text;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const parsed = new Date(
    dateOnly
      ? `${text}T12:00:00${PLANT_OFFSET}`
      : (text.includes('T') || text.includes(' ') ? text : `${text}T00:00:00${PLANT_OFFSET}`)
  );
  if (Number.isNaN(parsed.getTime())) return text;
  if (dateOnly) {
    return parsed.toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: PLANT_TIME_ZONE });
  }
  return parsed.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: PLANT_TIME_ZONE
  });
}

/** Locale date for printed job cards. Display strings such as 24/10/2026 stay as stored. */
export function formatPlantDate(value) {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value).trim();
  if (!isIsoLike(text)) return text;
  const parsed = new Date(text.includes('T') ? text : `${text.slice(0, 10)}T12:00:00${PLANT_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString('en-GB', { timeZone: PLANT_TIME_ZONE });
}
