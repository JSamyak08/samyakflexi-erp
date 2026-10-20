// Interim stop for the Inventory overdue-QC mail loop (B-028).
//
// PR #2 (cursor/fix-functional-bugs-7215) removes the Inventory auto-send
// and replaces it with a once-per-plant-day digest in qcEscalationDigest.js.
// That digest stamps grns.escalated_at and sends nothing until the column
// exists. The column migration is not applied. This guard is the stand-in:
// one attempt per GRN for this browser tab, kept even when the send fails.
//
// The session key is intentionally not samyak_qc_escalation_digest_day.
// When PR #2 merges, delete the Inventory effect and this module so the
// digest is the only sender. Do not run both.

export const QC_ESCALATION_SESSION_KEY = 'samyak_qc_escalation_attempted_v1';

const claimedKeys = new Set();

function storage() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

function readStoredKeys() {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(QC_ESCALATION_SESSION_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(key => String(key)) : [];
  } catch {
    return [];
  }
}

function writeStoredKeys() {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(QC_ESCALATION_SESSION_KEY, JSON.stringify([...claimedKeys]));
  } catch {
    // Private mode can reject the write. The in-memory set still covers this page.
  }
}

function rememberStoredKeys() {
  for (const key of readStoredKeys()) claimedKeys.add(key);
}

export function grnEscalationKey(grn) {
  const raw = grn?.grnNo ?? grn?.grn_number ?? grn?.id;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  return String(raw).trim();
}

export function claimQcEscalationSend(grn) {
  const key = grnEscalationKey(grn);
  if (!key || grn?.qcEscalationSent) return false;
  rememberStoredKeys();
  if (claimedKeys.has(key)) return false;
  claimedKeys.add(key);
  writeStoredKeys();
  return true;
}

export function resetQcEscalationGuard({ memoryOnly = false } = {}) {
  claimedKeys.clear();
  if (memoryOnly) return;
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(QC_ESCALATION_SESSION_KEY);
  } catch {
    // ignore
  }
}

function isPendingQc(grn) {
  return grn?.status === 'Pending QC Approval'
    || grn?.qcStatus === 'Pending QC Approval'
    || grn?.status === 'Pending QC'
    || grn?.qcStatus === 'Pending QC';
}

function receivedAt(grn) {
  const dateStr = grn?.receivedDate || grn?.created_at || grn?.inwardDatetime;
  if (!dateStr) return null;
  let grnTime = new Date(dateStr).getTime();
  if (Number.isNaN(grnTime)) {
    const parts = String(dateStr).split(/[/.-]/);
    if (parts.length === 3) {
      grnTime = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
    }
  }
  return Number.isNaN(grnTime) ? null : grnTime;
}

export function overdueQcHours(grn, now = Date.now()) {
  if (!isPendingQc(grn) || grn?.qcEscalationSent) return null;
  const grnTime = receivedAt(grn);
  if (grnTime == null) return null;
  const hoursPending = (now - grnTime) / (1000 * 60 * 60);
  return hoursPending >= 12 ? hoursPending : null;
}

/**
 * One page-load pass. Claims every overdue GRN synchronously, before any
 * send, so a re-render that starts a second pass cannot send again.
 * A failed send stays claimed: there is no automatic retry.
 */
export async function dispatchOverdueQcAlerts({
  grns,
  users,
  now = Date.now(),
  notify,
  onUpdateGRN,
  isCancelled = () => false,
}) {
  const claimed = [];
  for (const grn of grns || []) {
    const hoursPending = overdueQcHours(grn, now);
    if (hoursPending == null) continue;
    if (!claimQcEscalationSend(grn)) continue;
    claimed.push({ grn, hoursPending });
  }

  const sent = [];
  const failed = [];
  for (const { grn, hoursPending } of claimed) {
    const key = grnEscalationKey(grn);
    console.log(`[QC SLA Check] GRN #${key} pending QC for ${hoursPending.toFixed(1)} hrs. One alert for this session.`);
    try {
      const result = await notify({
        grn,
        hoursPending: Math.round(hoursPending),
        users,
      });
      if (result && result.success === false) {
        failed.push(key);
        console.warn('[QC SLA Check] Escalation email failed:', result.message || result);
        continue;
      }
      sent.push(key);
    } catch (error) {
      failed.push(key);
      console.warn('[QC SLA Check] Escalation email failed:', error);
      continue;
    }

    if (isCancelled() || typeof onUpdateGRN !== 'function') continue;
    try {
      await onUpdateGRN({
        ...grn,
        qcEscalationSent: true,
        qcEscalationSentAt: new Date(now).toISOString(),
      });
    } catch (error) {
      console.warn('[QC SLA Check] Could not record the escalation flag:', error);
    }
  }

  return { claimed: claimed.map(({ grn }) => grnEscalationKey(grn)), sent, failed };
}
