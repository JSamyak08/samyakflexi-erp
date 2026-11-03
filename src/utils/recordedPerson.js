/**
 * Names printed on slips and written into audit fields.
 * A signature line stays blank unless the row or the directory has a real person.
 * The old store, plant, and stock-audit stand-ins are rejected by name.
 */

import { formatPlantDateTime } from './dbDates.js';

const DUMMY_PERSON_RE = /\b(virendra\s+singh|rajesh\s+sharma|dilip\s+joshi)\b/i;

const ROLE_ONLY = new Set([
  'admin',
  'superadmin',
  'super admin',
  'plant manager',
  'store manager',
  'store mgr',
  'production manager',
  'production head',
  'plant head',
  'quality manager',
  'quality qc chemist',
  'qc chemist',
  'qc inspector',
  'qa inspector',
  'quality store executive',
  'plant quality head',
  'procurement desk',
  'shift operator',
  'press operator',
  'shop floor operator',
  'printing operator',
  'store inward desk',
  'finance dept',
  'authorised staff',
  'authorized staff',
  'operator',
  'user',
]);

const RAISED_ID_KEYS = ['raisedByUserId', 'raisedById', 'createdById', 'createdByUserId', 'userId'];
const RAISED_EMAIL_KEYS = ['raisedByEmail', 'createdByEmail', 'userEmail'];
const VERIFIER_ID_KEYS = ['verifiedByUserId', 'verifiedById', 'storeVerifiedById'];
const VERIFIER_EMAIL_KEYS = ['verifiedByEmail', 'storeVerifiedByEmail'];
const VERIFIER_NAME_KEYS = ['verifiedBy', 'storeVerifiedBy', 'verifiedByName'];
const APPROVER_ID_KEYS = ['approvedByUserId', 'approvedById', 'rejectedByUserId', 'decisionByUserId'];
const APPROVER_EMAIL_KEYS = ['approvedByEmail', 'rejectedByEmail', 'decisionByEmail'];
const APPROVER_NAME_KEYS = ['approvedBy', 'rejectedBy', 'decisionBy'];
const APPROVED_AT_KEYS = ['approvedAt', 'approvalDate', 'decisionAt'];
const REJECTED_AT_KEYS = ['rejectedAt', 'approvedAt', 'approvalDate', 'decisionAt'];

export function isDummyPersonText(value) {
  return DUMMY_PERSON_RE.test(String(value || ''));
}

export function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function isRoleOnlyLabel(value) {
  const text = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return ROLE_ONLY.has(text);
}

/** Drop a stand-in. Keep a name that was actually stored. */
export function printablePersonName(value) {
  const text = String(value || '').trim();
  if (!text || isDummyPersonText(text) || isRoleOnlyLabel(text)) return '';
  return text;
}

export function parseNameAndRole(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!match) return { name: text, role: '' };
  return { name: match[1].trim(), role: match[2].trim() };
}

export function formatPersonLabel(name, role) {
  const parsed = parseNameAndRole(name);
  const person = printablePersonName(parsed.name);
  const job = String(role || parsed.role || '').trim();
  if (!person) return '';
  if (!job || isRoleOnlyLabel(person)) return person;
  if (person.toLowerCase().includes(`(${job.toLowerCase()})`)) return person;
  return `${person} (${job})`;
}

function cleanName(value) {
  const text = String(value || '').trim();
  if (!text || /^user$/i.test(text) || isDummyPersonText(text) || isRoleOnlyLabel(text)) return '';
  return text;
}

export function loggedInActor(user) {
  const empty = { userId: '', email: '', name: '', role: '', label: '' };
  if (!user || typeof user !== 'object') return empty;
  const email = String(user.email || '').trim();
  const name = cleanName(user.name || user.fullName || user.full_name || user.username || '');
  const role = String(
    user.role
    || (Array.isArray(user.roles) && user.roles.length ? user.roles[0] : '')
    || ''
  ).trim();
  const userId = user.id == null ? '' : String(user.id).trim();
  const label = formatPersonLabel(name, role)
    || (looksLikeEmail(email) && !isDummyPersonText(email) ? email : '');
  return { userId, email, name, role, label };
}

export function loggedInActorLabel(user) {
  return loggedInActor(user).label;
}

function directoryRole(row) {
  return String(row?.role || row?.designation || '').trim();
}

function directoryName(row) {
  return cleanName(row?.name || row?.fullName || row?.full_name || row?.username || '');
}

function remember(map, key, person, overwrite) {
  const id = String(key || '').trim();
  if (!id) return;
  if (overwrite || !map.has(id)) map.set(id, person);
}

export function buildDirectoryIndex(users = [], employees = []) {
  const byId = new Map();
  const byEmail = new Map();
  const byName = new Map();
  const add = (row, overwrite) => {
    if (!row || typeof row !== 'object') return;
    const name = directoryName(row);
    const email = String(row.email || '').trim().toLowerCase();
    const role = directoryRole(row);
    if (!name && !email) return;
    const person = {
      id: row.id == null ? '' : String(row.id).trim(),
      email,
      name,
      role,
      label: formatPersonLabel(name, role) || (looksLikeEmail(email) ? email : ''),
    };
    remember(byId, person.id, person, overwrite);
    remember(byId, row.auth_user_id || row.authUserId, person, overwrite);
    if (email) remember(byEmail, email, person, overwrite);
    const key = nameKey(name);
    if (key && !isDummyPersonText(name)) remember(byName, key, person, overwrite);
  };
  for (const row of employees || []) add(row, false);
  for (const row of users || []) add(row, true);
  return { byId, byEmail, byName };
}

function nameKey(value) {
  return parseNameAndRole(value).name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function emptyPerson() {
  return { id: '', email: '', name: '', role: '', label: '' };
}

function valuesOf(record, keys) {
  const out = [];
  for (const key of keys) {
    const text = String(record?.[key] ?? '').trim();
    if (text) out.push(text);
  }
  return out;
}

export function resolveRecordedPerson(record, directory, {
  idKeys = [],
  emailKeys = [],
  nameKeys = [],
  roleKeys = [],
} = {}) {
  const index = directory || buildDirectoryIndex();
  const ids = valuesOf(record, idKeys);
  const emails = valuesOf(record, emailKeys);
  const storedName = valuesOf(record, nameKeys)[0] || '';
  const storedRole = valuesOf(record, roleKeys)[0] || '';
  if (looksLikeEmail(storedName)) emails.push(storedName);

  for (const id of ids) {
    const hit = index.byId.get(id);
    if (hit?.label) return hit;
  }
  for (const email of emails) {
    const hit = index.byEmail.get(String(email).trim().toLowerCase());
    if (hit?.label) return hit;
  }

  const parsed = parseNameAndRole(storedName);
  const name = printablePersonName(parsed.name);
  if (!name) {
    if (looksLikeEmail(storedName) && !isDummyPersonText(storedName)) {
      return { ...emptyPerson(), email: storedName, label: storedName };
    }
    return emptyPerson();
  }
  const role = parsed.role || storedRole;
  return {
    ...emptyPerson(),
    name,
    role,
    label: formatPersonLabel(name, role),
  };
}

export function bindPersonFields(text, directory) {
  const index = directory || buildDirectoryIndex();
  const trimmed = String(text || '').trim();
  if (!trimmed || isDummyPersonText(trimmed) || isRoleOnlyLabel(trimmed)) {
    return emptyPerson();
  }
  if (looksLikeEmail(trimmed)) {
    const hit = index.byEmail.get(trimmed.toLowerCase());
    if (hit?.label) return hit;
    return { ...emptyPerson(), email: trimmed, label: trimmed };
  }
  const hit = index.byName.get(nameKey(trimmed));
  if (hit?.label) return hit;
  const parsed = parseNameAndRole(trimmed);
  const name = printablePersonName(parsed.name);
  if (!name) return emptyPerson();
  return {
    ...emptyPerson(),
    name,
    role: parsed.role,
    label: formatPersonLabel(name, parsed.role),
  };
}

export function bindEditedPerson(text, previous, directory) {
  const bound = bindPersonFields(text, directory);
  if (bound.id || !previous) return bound;
  const previousSlip = indentSlipSignatories(previous, { directory });
  const previousId = String(previous.raisedByUserId || previous.raisedById || '').trim();
  if (!previousId) return bound;
  if (String(text || '').trim() !== previousSlip.raisedBy.label) return bound;
  return {
    ...bound,
    id: previousId,
    email: previous.raisedByEmail || bound.email,
  };
}

export function indentDecisionKind(status) {
  const text = String(status || '').trim().toLowerCase();
  if (!text || text.includes('pending')) return 'pending';
  if (text.includes('reject')) return 'rejected';
  if (text.includes('issued')) return 'issued';
  if (text.includes('approv')) return 'approved';
  return 'other';
}

export function indentShowsApprover(status) {
  const kind = indentDecisionKind(status);
  return kind === 'approved' || kind === 'rejected' || kind === 'issued';
}

function decisionTime(record, status) {
  const keys = indentDecisionKind(status) === 'rejected' ? REJECTED_AT_KEYS : APPROVED_AT_KEYS;
  for (const key of keys) {
    const text = String(record?.[key] ?? '').trim();
    if (text) return formatPlantDateTime(text);
  }
  return '';
}

export function indentSlipSignatories(indent, options = {}) {
  const directory = options.directory || buildDirectoryIndex(options.users, options.employees);
  const record = indent || {};
  const raisedBy = resolveRecordedPerson(record, directory, {
    idKeys: RAISED_ID_KEYS,
    emailKeys: RAISED_EMAIL_KEYS,
    nameKeys: ['raisedBy', 'createdBy'],
    roleKeys: ['userRole', 'raisedByRole', 'role'],
  });
  const verifiedBy = resolveRecordedPerson(record, directory, {
    idKeys: VERIFIER_ID_KEYS,
    emailKeys: VERIFIER_EMAIL_KEYS,
    nameKeys: VERIFIER_NAME_KEYS,
    roleKeys: ['verifiedByRole'],
  });
  const showApprover = indentShowsApprover(record.status);
  const approvedBy = showApprover
    ? resolveRecordedPerson(record, directory, {
      idKeys: APPROVER_ID_KEYS,
      emailKeys: APPROVER_EMAIL_KEYS,
      nameKeys: APPROVER_NAME_KEYS,
      roleKeys: ['approvedByRole'],
    })
    : emptyPerson();
  return {
    raisedBy,
    verifiedBy,
    approvedBy: {
      ...approvedBy,
      atLabel: showApprover ? decisionTime(record, record.status) : '',
    },
  };
}

export function indentDecisionPatch(newStatus, actor, at = new Date()) {
  const kind = indentDecisionKind(newStatus);
  const when = at instanceof Date ? at.toISOString() : String(at || '');
  const stamp = loggedInActor(actor);
  if (kind === 'issued' || kind === 'other') {
    return { status: newStatus };
  }
  const cleared = {
    status: newStatus,
    approvedBy: '',
    approvedByUserId: '',
    approvedByEmail: '',
    approvedAt: '',
    rejectedBy: '',
    rejectedByUserId: '',
    rejectedByEmail: '',
    rejectedAt: '',
  };
  if (kind === 'pending') return cleared;
  const person = stamp.label || '';
  const decided = {
    ...cleared,
    approvedBy: person,
    approvedByUserId: stamp.userId,
    approvedByEmail: stamp.email,
    approvedAt: when,
  };
  if (kind === 'rejected') {
    decided.rejectedBy = person;
    decided.rejectedByUserId = stamp.userId;
    decided.rejectedByEmail = stamp.email;
    decided.rejectedAt = when;
  }
  return decided;
}

export function applyIndentStatusChange(previous, next, actor, at = new Date()) {
  const draft = next || {};
  const prevKind = indentDecisionKind(previous?.status);
  const nextKind = indentDecisionKind(draft.status);
  if (prevKind === nextKind) return draft;
  if (nextKind === 'issued' || nextKind === 'other') return draft;
  return { ...draft, ...indentDecisionPatch(draft.status, actor, at) };
}

export function emailSampleActors(user, recipientEmail = '') {
  const actor = loggedInActor(user);
  const recipient = String(recipientEmail || '').trim();
  return {
    filledBy: actor.label,
    approvedBy: actor.label,
    userName: actor.name,
    userEmail: recipient || actor.email,
    userRole: actor.role,
    userDepartment: String(user?.department || '').trim(),
  };
}
