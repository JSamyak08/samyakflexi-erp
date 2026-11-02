/**
 * Printing shift windows in Asia/Kolkata.
 * Day 08:00–20:00 and Night 20:00–08:00 are the plant default.
 * A shift that ends at or before its start crosses midnight.
 * Windows are half-open: 20:00 belongs to the shift that starts then.
 */

export const PRINTING_SHIFT_WINDOWS_SETTING = 'printing_shift_windows';

export const DEFAULT_PRINTING_SHIFTS = [
  { id: 'day', name: 'Day', start: '08:00', end: '20:00' },
  { id: 'night', name: 'Night', start: '20:00', end: '08:00' }
];

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pad(value) {
  return String(value).padStart(2, '0');
}

export function clockMinutes(value) {
  const match = CLOCK.exec(String(value || '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function normalizePrintingShifts(value) {
  const source = Array.isArray(value) ? value : [];
  const shifts = [];
  const seen = new Set();
  source.forEach((item, index) => {
    const start = String(item?.start || '').trim().slice(0, 5);
    const end = String(item?.end || '').trim().slice(0, 5);
    if (clockMinutes(start) === null || clockMinutes(end) === null) return;
    const name = String(item?.name || '').trim() || `Shift ${index + 1}`;
    const id = String(item?.id || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `shift-${index + 1}`;
    if (seen.has(id)) return;
    seen.add(id);
    shifts.push({ id, name, start, end });
  });
  return shifts.length ? shifts : DEFAULT_PRINTING_SHIFTS.map((shift) => ({ ...shift }));
}

export function istParts(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const read = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  let hour = read('hour');
  if (hour === 24) hour = 0;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second')
  };
}

export function istTimestamp(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+05:30`).getTime();
}

export function formatIstDate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function addCalendarDays(year, month, day, amount) {
  const utc = new Date(Date.UTC(year, month - 1, day + amount));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate()
  };
}

export function parsePlantDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function istToday(now = new Date()) {
  const parts = istParts(now);
  return formatIstDate(parts.year, parts.month, parts.day);
}

export function mondayOf(dateText) {
  const parsed = parsePlantDate(dateText);
  if (!parsed) return null;
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  const weekday = utc.getUTCDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  const monday = addCalendarDays(parsed.year, parsed.month, parsed.day, delta);
  return formatIstDate(monday.year, monday.month, monday.day);
}

function startOfPlantDate(dateText) {
  const parsed = parsePlantDate(dateText);
  if (!parsed) return null;
  return istTimestamp(parsed.year, parsed.month, parsed.day, 0, 0, 0);
}

function nextPlantDate(dateText) {
  const parsed = parsePlantDate(dateText);
  if (!parsed) return null;
  const next = addCalendarDays(parsed.year, parsed.month, parsed.day, 1);
  return formatIstDate(next.year, next.month, next.day);
}

/**
 * Exclusive end. Daily is one IST calendar date. Weekly starts Monday.
 * Monthly is the calendar month. Custom includes both selected dates.
 */
export function rangeForView({ mode = 'daily', anchorDate, fromDate, toDate, now = new Date() } = {}) {
  const anchor = parsePlantDate(anchorDate) ? anchorDate : istToday(now);
  if (mode === 'weekly') {
    const monday = mondayOf(anchor);
    const mondayParts = parsePlantDate(monday);
    const sunday = addCalendarDays(mondayParts.year, mondayParts.month, mondayParts.day, 6);
    const nextMonday = addCalendarDays(mondayParts.year, mondayParts.month, mondayParts.day, 7);
    return {
      mode,
      start: istTimestamp(mondayParts.year, mondayParts.month, mondayParts.day, 0, 0, 0),
      end: istTimestamp(nextMonday.year, nextMonday.month, nextMonday.day, 0, 0, 0),
      label: `Week ${monday} to ${formatIstDate(sunday.year, sunday.month, sunday.day)}`,
      fromDate: monday,
      toDate: formatIstDate(sunday.year, sunday.month, sunday.day)
    };
  }
  if (mode === 'monthly') {
    const parsed = parsePlantDate(anchor);
    const nextMonth = parsed.month === 12
      ? { year: parsed.year + 1, month: 1, day: 1 }
      : { year: parsed.year, month: parsed.month + 1, day: 1 };
    const last = addCalendarDays(nextMonth.year, nextMonth.month, nextMonth.day, -1);
    return {
      mode,
      start: istTimestamp(parsed.year, parsed.month, 1, 0, 0, 0),
      end: istTimestamp(nextMonth.year, nextMonth.month, nextMonth.day, 0, 0, 0),
      label: `${parsed.year}-${pad(parsed.month)}`,
      fromDate: formatIstDate(parsed.year, parsed.month, 1),
      toDate: formatIstDate(last.year, last.month, last.day)
    };
  }
  if (mode === 'custom') {
    let from = parsePlantDate(fromDate) ? fromDate : anchor;
    let to = parsePlantDate(toDate) ? toDate : from;
    if (from > to) {
      const swap = from;
      from = to;
      to = swap;
    }
    return {
      mode,
      start: startOfPlantDate(from),
      end: startOfPlantDate(nextPlantDate(to)),
      label: from === to ? from : `${from} to ${to}`,
      fromDate: from,
      toDate: to
    };
  }
  return {
    mode: 'daily',
    start: startOfPlantDate(anchor),
    end: startOfPlantDate(nextPlantDate(anchor)),
    label: anchor,
    fromDate: anchor,
    toDate: anchor
  };
}

export function formatIstStamp(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  const parts = istParts(date);
  return `${formatIstDate(parts.year, parts.month, parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatDurationMinutes(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${pad(mins)}m`;
}
