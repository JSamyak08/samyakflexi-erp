/** Changelog rules shared by the screen and the tests. */

export const CHANGELOG_TYPES = ['Added', 'Removed', 'Revised', 'Bug Fixed'];
const IST = 'Asia/Kolkata';

export function changelogLine(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function formatIst(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** datetime-local value in India Standard Time. */
export function istLocalInput(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  const hour = part('hour');
  return `${part('year')}-${part('month')}-${part('day')}T${hour === '24' ? '00' : hour}:${part('minute')}`;
}

/** Interpret a datetime-local value as IST and return an ISO timestamp. */
export function istInputToIso(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return '';
  const date = new Date(`${text}:00+05:30`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

export function filterChangelogEntries(rows, { type = 'All', query = '' } = {}) {
  const wanted = String(type || 'All');
  const needle = String(query || '').trim().toLowerCase();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row) return false;
    if (wanted !== 'All' && row.entryType !== wanted) return false;
    if (!needle) return true;
    const haystack = [row.title, row.description, row.module, row.entryType, row.prNumber]
      .filter((item) => item !== null && item !== undefined && item !== '')
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function validateChangelogDraft(draft = {}) {
  const errors = {};
  const title = changelogLine(draft.title);
  const description = changelogLine(draft.description);
  if (!title) errors.title = 'Title is required.';
  else if (title.length > 160) errors.title = 'Keep the title under 160 characters.';
  if (!description) errors.description = 'Description is required.';
  else if (description.length > 400) errors.description = 'Keep the description to one short line.';
  if (!CHANGELOG_TYPES.includes(draft.entryType)) errors.entryType = 'Choose a type.';
  const pr = String(draft.prNumber ?? '').trim();
  if (pr && (!/^\d+$/.test(pr) || Number(pr) <= 0)) errors.prNumber = 'PR number must be a positive whole number.';
  if (!istInputToIso(draft.implementedAt)) errors.implementedAt = 'Enter the date and time.';
  return errors;
}

export function bugToChangelogEntry(report, note) {
  const title = changelogLine(report?.title || 'Bug fixed').slice(0, 160) || 'Bug fixed';
  const description = (changelogLine(note) || changelogLine(report?.description) || 'Marked resolved.').slice(0, 400);
  const moduleName = changelogLine(report?.module).slice(0, 80);
  return {
    implementedAt: new Date().toISOString(),
    entryType: 'Bug Fixed',
    title,
    description,
    prNumber: null,
    module: moduleName || null,
    bugReportId: report?.id || null,
  };
}
