/**
 * QC approvals that have waited more than 12 hours.
 * Opening Inventory, or any other page, must not email.
 * sendQcOverdueAlert runs only when a person clicks the button on that page.
 * Recipients are limited to @samyakinternational.in inside notifyQcOverdueDigest.
 */
import { notifyQcOverdueDigest } from './emailService';

const SLA_HOURS = 12;

export function cancelQcOverdueEscalationDigest() {
  // Kept so older callers can cancel a pass. Nothing is in flight from a page load.
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

export function selectOverdueGrns(grns, now = Date.now(), { includeAlreadySent = false } = {}) {
  const overdue = [];
  for (const grn of grns || []) {
    if (!grn) continue;
    if (!includeAlreadySent && (grn.escalated_at || grn.escalatedAt || grn.qcEscalationSent)) continue;
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

/**
 * Page loads used to call this after GRNs arrived. It must not email.
 */
export function runQcOverdueEscalationDigest() {
  return Promise.resolve({ claimed: [], sent: false, skipped: 'not-sent-on-load' });
}

/**
 * Send the QC-overdue list. Call this only from the Inventory button.
 * @param {{ grns?: array, users?: array, now?: number, notify?: function }} input
 */
export async function sendQcOverdueAlert({ grns, users, now = Date.now(), notify = notifyQcOverdueDigest } = {}) {
  const overdue = selectOverdueGrns(grns, now, { includeAlreadySent: true });
  if (overdue.length === 0) {
    return { sent: false, overdue, message: 'No QC approvals are overdue.' };
  }
  const result = await notify({ grns: overdue, users });
  const sent = Boolean(result && result.success !== false);
  return {
    sent,
    overdue,
    result,
    message: result?.message || (sent ? 'QC overdue alert sent.' : 'The QC overdue email was not sent.')
  };
}
