/**
 * Pre-printing deadline reminder.
 *
 * The clock is the revised deadline once one is saved, otherwise the
 * commercial date. Client informed belongs to that revision: saving it
 * quiets the reminder even when the revised date is still under two days.
 * A new revision clears the tick. The reminder returns only when that new
 * date is under two days away and the client has not been marked informed
 * for it. Jobs whose stage track has reached Printing are excluded.
 * Only Admin and Sales Manager see or save this reminder. Clients are told
 * on WhatsApp by the team. This module does not draft or send mail.
 */

import { isCylinderOrder } from './orderAutoClose.js';

export const NEAR_PRINTING_DEADLINE_DAYS = 2;

export const DEADLINE_REMINDER_ROLES = [
  'Admin',
  'Sales Manager',
];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function canManageOrderDeadline(role) {
  return DEADLINE_REMINDER_ROLES.includes(String(role || '').trim());
}

export function deadlineActorLabel(user) {
  const name = String(user?.name || '').trim();
  if (name) return name;
  const email = String(user?.email || '').trim();
  if (email) return email;
  return 'User';
}

export function dateOnlyString(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  const text = String(value).trim();
  const iso = text.match(DATE_ONLY) || text.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
      return null;
    }
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!dmy) return null;
  const day = Number(dmy[1]);
  const month = Number(dmy[2]);
  const year = Number(dmy[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function utcMidnight(dateString) {
  const iso = dateOnlyString(dateString);
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Whole calendar days from today until the date. Negative means already past. */
export function calendarDaysUntil(dateValue, today = new Date()) {
  const target = utcMidnight(dateValue);
  const start = utcMidnight(today);
  if (target == null || start == null) return null;
  return Math.round((target - start) / 86400000);
}

export function formatDeadlineDistance(daysRemaining) {
  if (daysRemaining == null) return 'no delivery date';
  if (daysRemaining < 0) {
    const past = Math.abs(daysRemaining);
    return past === 1 ? '1 day past' : `${past} days past`;
  }
  if (daysRemaining === 0) return 'today';
  if (daysRemaining === 1) return 'tomorrow';
  return `in ${daysRemaining} days`;
}

/**
 * Printing is step 1 on the film stage track from getOrderStageInfo.
 * A track with no Printing step (cylinder engraving) has not reached Printing.
 */
export function stageTrackReachedPrinting(stageInfo) {
  if (!stageInfo || typeof stageInfo !== 'object') return false;
  const steps = Array.isArray(stageInfo.pipeline) ? stageInfo.pipeline : [];
  const printing = steps.find((step) => {
    if (!step) return false;
    if (step.id === 'printing') return true;
    return String(step.label || '').trim().toLowerCase() === 'printing';
  });
  if (printing) return Boolean(printing.isCompleted || printing.isCurrent);
  if (steps.length > 0) return false;
  const index = Number(stageInfo.stageIndex);
  return Number.isFinite(index) && index >= 1;
}

export function commercialDeadline(order) {
  return dateOnlyString(order?.originalDeadline)
    || dateOnlyString(order?.targetDeliveryDate)
    || dateOnlyString(order?.deliveryDate);
}

export function assessPrintingDeadlineReminder(order, stageInfo, options = {}) {
  const today = options.today || new Date();
  const reachedPrinting = stageTrackReachedPrinting(stageInfo);
  const cylinder = isCylinderOrder(order);
  const completed = String(order?.status || '') === 'Completed';
  const originalDate = commercialDeadline(order);
  const revisedDate = dateOnlyString(order?.revisedDeadline);
  const clientInformed = order?.clientInformed === true;
  const informedForRevision = Boolean(revisedDate) && clientInformed;
  const clockDate = revisedDate || originalDate;
  const daysRemaining = calendarDaysUntil(clockDate, today);
  const approaching = daysRemaining !== null && daysRemaining < NEAR_PRINTING_DEADLINE_DAYS;
  const active = Boolean(order) && !cylinder && !completed && !reachedPrinting && approaching && !informedForRevision;
  return {
    active,
    reachedPrinting,
    cylinder,
    completed,
    originalDate,
    revisedDate,
    clientInformed,
    informedForRevision,
    quieted: informedForRevision,
    clockDate,
    daysRemaining,
    approaching,
    distanceLabel: formatDeadlineDistance(daysRemaining),
  };
}

export function orderNeedsPrintingDeadlineReminder(order, stageInfo, options = {}) {
  return assessPrintingDeadlineReminder(order, stageInfo, options).active;
}

export function deadlineFieldsFromRow(row) {
  if (!row) {
    return {
      originalDeadline: null,
      revisedDeadline: null,
      deadlineRevisedAt: null,
      deadlineRevisedBy: null,
      deadlineRevisionReason: null,
      clientInformed: false,
      clientInformedAt: null,
      clientInformedBy: null,
    };
  }
  return {
    originalDeadline: row.original_deadline || null,
    revisedDeadline: row.revised_deadline || null,
    deadlineRevisedAt: row.deadline_revised_at || null,
    deadlineRevisedBy: row.deadline_revised_by || null,
    deadlineRevisionReason: row.deadline_revision_reason || null,
    clientInformed: row.client_informed === true,
    clientInformedAt: row.client_informed_at || null,
    clientInformedBy: row.client_informed_by || null,
  };
}

export function mapDeadlineRevisionRow(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    eventType: row.event_type,
    originalDeadline: row.original_deadline || null,
    previousDeadline: row.previous_deadline || null,
    revisedDeadline: row.revised_deadline || null,
    reason: row.reason || '',
    actor: row.actor || '',
    actedAt: row.acted_at || row.created_at || null,
    clientInformed: row.client_informed === true,
  };
}

function revisionId(orderId, now) {
  const stamp = String(now || Date.now()).replace(/[^0-9A-Za-z]/g, '').slice(0, 24);
  const rand = Math.random().toString(36).slice(2, 8);
  return `ODR-${orderId}-${stamp}-${rand}`;
}

export function nextDeadlineRevision(order, { revisedDeadline, reason, actor, now } = {}) {
  if (!order?.id) return { ok: false, error: 'This order has no id.' };
  const date = dateOnlyString(revisedDeadline);
  if (!date) return { ok: false, error: 'Enter a revised deadline date.' };
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) return { ok: false, error: 'Add a short reason for the new date.' };
  if (cleanReason.length > 500) return { ok: false, error: 'Keep the reason under 500 characters.' };
  const who = String(actor || '').trim();
  if (!who) return { ok: false, error: 'The signed-in user could not be identified.' };
  const currentRevised = dateOnlyString(order.revisedDeadline);
  if (currentRevised && currentRevised === date) {
    return { ok: false, error: 'That revised deadline is already saved.' };
  }
  const actedAt = now || new Date().toISOString();
  const originalDate = commercialDeadline(order);
  const previousDate = currentRevised || originalDate;
  const hadInformed = order.clientInformed === true;
  const nextOrder = {
    ...order,
    originalDeadline: originalDate,
    revisedDeadline: date,
    deadlineRevisedAt: actedAt,
    deadlineRevisedBy: who,
    deadlineRevisionReason: cleanReason,
    clientInformed: false,
    clientInformedAt: null,
    clientInformedBy: null,
    clientInformedDeadline: null,
    targetDeliveryDate: order.targetDeliveryDate,
    deliveryDate: order.deliveryDate,
  };
  const history = {
    id: revisionId(order.id, actedAt),
    orderId: order.id,
    eventType: 'revision',
    originalDeadline: originalDate,
    previousDeadline: previousDate,
    revisedDeadline: date,
    reason: cleanReason,
    actor: who,
    actedAt,
    clientInformed: false,
  };
  const cleared = hadInformed ? ' Client informed was cleared until the client is told about this date.' : '';
  return {
    ok: true,
    order: nextOrder,
    history,
    audit: `Revised deadline for ${order.id} from ${previousDate || 'unset'} to ${date}. Original deadline stays ${originalDate || 'unset'}.${cleared}`,
  };
}

export function nextClientInformed(order, { informed, actor, now } = {}) {
  if (!order?.id) return { ok: false, error: 'This order has no id.' };
  const who = String(actor || '').trim();
  if (!who) return { ok: false, error: 'The signed-in user could not be identified.' };
  const checked = informed === true;
  const revisedDate = dateOnlyString(order.revisedDeadline);
  if (checked && !revisedDate) {
    return { ok: false, error: 'Save a revised deadline before marking the client informed.' };
  }
  if (checked === (order.clientInformed === true) && !checked) {
    return { ok: false, error: 'Client informed is already clear.' };
  }
  if (checked && order.clientInformed === true) {
    return { ok: false, error: 'Client informed is already recorded.' };
  }
  const actedAt = now || new Date().toISOString();
  const nextOrder = {
    ...order,
    clientInformed: checked,
    clientInformedAt: checked ? actedAt : null,
    clientInformedBy: checked ? who : null,
    clientInformedDeadline: checked ? revisedDate : null,
  };
  const history = {
    id: revisionId(order.id, actedAt),
    orderId: order.id,
    eventType: checked ? 'client_informed' : 'client_informed_cleared',
    originalDeadline: commercialDeadline(order),
    previousDeadline: dateOnlyString(order.revisedDeadline) || commercialDeadline(order),
    revisedDeadline: dateOnlyString(order.revisedDeadline),
    reason: checked ? 'Client informed' : 'Client informed cleared',
    actor: who,
    actedAt,
    clientInformed: checked,
  };
  const audit = checked
    ? `Marked client informed for ${order.id} on revised date ${revisedDate} (${who}).`
    : `Cleared client informed for ${order.id}.`;
  return { ok: true, order: nextOrder, history, audit };
}
