/**
 * One QC-overdue digest per plant day.
 * Inventory page loads must not call this. App boot may call it once;
 * a scheduled server job is the intended follow-up (see the PR).
 */
import { notifyQcOverdueDigest } from './emailService';
import { getEmailTemplates } from './settingsService';
import { claimGrnEscalations, hasQcEscalationSince } from './supabaseDataService';

const PLANT_TIME_ZONE = 'Asia/Kolkata';
const SESSION_KEY = 'samyak_qc_escalation_digest_day';
const SLA_HOURS = 12;

let generation = 0;
let running = null;
let queued = null;

export function cancelQcOverdueEscalationDigest() {
  generation += 1;
}

function plantDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PLANT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function plantDayStartIso(date = new Date()) {
  return new Date(`${plantDayKey(date)}T00:00:00+05:30`).toISOString();
}

function parseGrnTime(dateStr) {
  if (!dateStr) return NaN;
  const direct = new Date(dateStr).getTime();
  if (!Number.isNaN(direct)) return direct;
  const parts = String(dateStr).split(/[/.-]/);
  if (parts.length === 3) {
    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
  }
  return NaN;
}

function isPendingQc(grn) {
  const status = String(grn?.status || '');
  const qcStatus = String(grn?.qcStatus || '');
  return status === 'Pending QC Approval' || status === 'Pending QC'
    || qcStatus === 'Pending QC Approval' || qcStatus === 'Pending QC';
}

export function selectOverdueGrns(grns, now = Date.now()) {
  const overdue = [];
  for (const grn of grns || []) {
    if (!grn || grn.escalated_at || grn.escalatedAt || grn.qcEscalationSent) continue;
    if (!isPendingQc(grn)) continue;
    const grnTime = parseGrnTime(grn.receivedDate || grn.created_at || grn.inwardDatetime);
    if (Number.isNaN(grnTime)) continue;
    const hoursPending = (now - grnTime) / (1000 * 60 * 60);
    if (hoursPending >= SLA_HOURS) {
      overdue.push({ ...grn, hoursPending: Math.round(hoursPending) });
    }
  }
  return overdue;
}

function sessionAlreadyRanToday() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === plantDayKey();
  } catch (err) {
    return false;
  }
}

function markSessionRanToday() {
  try {
    sessionStorage.setItem(SESSION_KEY, plantDayKey());
  } catch (err) {
    // Private mode can block sessionStorage. The database claim still stops a second send.
  }
}

async function runOnce({ grns, users, isCancelled, token }) {
  const cancelled = () => token !== generation || (typeof isCancelled === 'function' && isCancelled());
  if (cancelled() || sessionAlreadyRanToday()) return { claimed: [] };

  const overdue = selectOverdueGrns(grns);
  if (overdue.length === 0) {
    markSessionRanToday();
    return { claimed: [] };
  }

  // Enabled is checked inside the mailer, but do it first so a disabled
  // template never stamps escalated_at.
  const template = getEmailTemplates().grn_qc_escalation_12h;
  if (!template || template.enabled === false) {
    markSessionRanToday();
    return { claimed: [], skipped: 'disabled' };
  }

  if (cancelled()) return { claimed: [] };

  const alreadyToday = await hasQcEscalationSince(plantDayStartIso());
  if (alreadyToday === null) {
    console.warn('[QC digest] escalated_at is not available. No escalation email was sent.');
    markSessionRanToday();
    return { claimed: [], skipped: 'column-missing' };
  }
  if (alreadyToday) {
    markSessionRanToday();
    return { claimed: [], skipped: 'already-sent-today' };
  }
  if (cancelled()) return { claimed: [] };

  const claimedAt = new Date().toISOString();
  const claimed = await claimGrnEscalations(overdue.map(grn => grn.id), claimedAt);
  if (claimed === null) {
    console.warn('[QC digest] Could not claim GRNs. No escalation email was sent.');
    markSessionRanToday();
    return { claimed: [], skipped: 'claim-failed' };
  }
  markSessionRanToday();
  if (cancelled() || claimed.length === 0) return { claimed };

  const claimedIds = new Set(claimed.map(row => String(row.id)));
  const digestRows = overdue.filter(grn => claimedIds.has(String(grn.id)));
  if (digestRows.length === 0 || cancelled()) return { claimed };

  await notifyQcOverdueDigest({ grns: digestRows, users }).catch(err => {
    console.warn('[QC digest] Email failed after GRNs were claimed. They will not be retried today.', err);
  });
  return { claimed };
}

/**
 * At most one attempt per browser session per plant day.
 * A newer call replaces a cancelled in-flight pass instead of stacking sends.
 */
export function runQcOverdueEscalationDigest(options) {
  if (sessionAlreadyRanToday()) return Promise.resolve({ claimed: [] });
  queued = options;
  if (running) return running;
  running = (async () => {
    let last = { claimed: [] };
    while (queued) {
      const next = queued;
      queued = null;
      last = await runOnce({ ...next, token: generation });
    }
    return last;
  })().finally(() => {
    running = null;
    if (queued) {
      const next = queued;
      queued = null;
      runQcOverdueEscalationDigest(next);
    }
  });
  return running;
}
