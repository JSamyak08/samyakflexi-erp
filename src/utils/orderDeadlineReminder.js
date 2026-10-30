/**
 * Pre-printing deadline reminder.
 *
 * The clock is the revised deadline once one is saved, otherwise the
 * commercial date, compared as Asia/Kolkata calendar days. Admin sets how
 * many days ahead the reminder opens (default 3). It stays up until a print
 * job run has started or finished, or the order is closed or cancelled.
 * Client informed is the WhatsApp checklist for a revised date. It does not
 * hide this reminder. Only Admin and Sales Manager see or save it.
 * This module does not draft or send mail.
 */

import { isCylinderOrder } from './orderAutoClose.js';
import { assignedRolesOf } from '../assignedRoles.js';
import { resolveJobMaster } from './jobMasterGuardrails.js';
import { linkedRequirementMatches, matchRequirementToInventoryItem } from '../factoryStore.js';

export const DEFAULT_PRINTING_LEAD_DAYS = 3;
export const PRINTING_LEAD_DAYS_SETTING = 'printing_deadline_lead_days';
export const PRINTING_LEAD_DAYS_MIN = 1;
export const PRINTING_LEAD_DAYS_MAX = 30;
const PLANT_TIME_ZONE = 'Asia/Kolkata';

export const DEADLINE_NOTICE_STAGE = 'PRINTING_DEADLINE_STAGE';
export const DEADLINE_NOTICE_SUMMARY = 'PRINTING_DEADLINE_SUMMARY';

const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'canceled', 'closed', 'dispatched', 'delivered']);

export const DEADLINE_REMINDER_ROLES = [
  'Admin',
  'Sales Manager',
];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function canManageOrderDeadline(roleOrUser) {
  return assignedRolesOf(roleOrUser).some((role) => DEADLINE_REMINDER_ROLES.includes(role));
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

/** Asia/Kolkata calendar day as YYYY-MM-DD. A date-only string is kept as written. */
export function plantCalendarDate(value = new Date()) {
  if (typeof value === 'string') {
    const direct = dateOnlyString(value);
    if (direct && DATE_ONLY.test(String(value).trim())) return direct;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PLANT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Whole calendar days from the plant today until the date. Negative means already past. */
export function calendarDaysUntil(dateValue, today = new Date()) {
  const target = utcMidnight(dateValue);
  const start = utcMidnight(today instanceof Date ? plantCalendarDate(today) : today);
  if (target == null || start == null) return null;
  return Math.round((target - start) / 86400000);
}

export function normalizePrintingLeadDays(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PRINTING_LEAD_DAYS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_PRINTING_LEAD_DAYS;
  const whole = Math.round(parsed);
  if (whole < PRINTING_LEAD_DAYS_MIN) return PRINTING_LEAD_DAYS_MIN;
  if (whole > PRINTING_LEAD_DAYS_MAX) return PRINTING_LEAD_DAYS_MAX;
  return whole;
}

export function overdueByLabel(daysRemaining) {
  const past = Math.abs(Number(daysRemaining) || 0);
  return past === 1 ? 'Overdue by 1 day' : `Overdue by ${past} days`;
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

function sameId(left, right) {
  return String(left || '') !== '' && String(left) === String(right || '');
}

function recordMatchesOrder(record, order) {
  if (!record || !order) return false;
  if (sameId(record.orderId, order.id) || sameId(record.order_id, order.id) || sameId(record.id, order.id)) return true;
  const code = String(order.jobCode || '').trim().toLowerCase();
  const recordCode = String(record.jobCode || record.job_code || '').trim().toLowerCase();
  return Boolean(code) && code === recordCode;
}

function sourceHasPrintRun(source) {
  if (!source || typeof source !== 'object') return false;
  if (source.printingStartTime || source.printing_start_time || source.printingEndTime || source.printing_end_time) return true;
  if (source.isPrintingCompleted === true) return true;
  const stageStatus = String(source.stages?.printing?.status || '').trim();
  if (stageStatus === 'In Production' || stageStatus === 'Completed') return true;
  const status = String(source.printingStatus || source.printing_status || '').trim();
  if (status === 'Completed') return true;
  if (status === 'In Production' && (source.printingStartTime || source.printing_start_time)) return true;
  return false;
}

/**
 * Printing has started when the order or one of its production records has
 * an active press run (started, not merely status In Production) or a
 * completed print run. The stage track alone does not count.
 */
export function printingRunStarted(order, productionRecords = []) {
  if (sourceHasPrintRun(order)) return true;
  return (productionRecords || []).some((record) => recordMatchesOrder(record, order) && sourceHasPrintRun(record));
}

export function orderIsClosedOrCancelled(order) {
  const status = String(order?.status || '').trim().toLowerCase();
  return CLOSED_STATUSES.has(status);
}

function storedRequirements(order) {
  const lists = [order?.materialRequirements, order?.rawMaterialRequirements, order?.jobDetails?.raw_material_requirements];
  for (const list of lists) {
    if (Array.isArray(list) && list.length) return list.filter(Boolean);
  }
  return [];
}

function isFilmRequirement(req) {
  const name = String(req?.filmType || req?.itemName || '').trim().toLowerCase();
  if (!name) return false;
  if (name.includes('ink') || name.includes('adhesive') || name.includes('solvent')) return false;
  return true;
}

function lineCoveredByStock(req, inventory) {
  const need = Number(req?.qtyKg) || 0;
  if (need <= 0) return true;
  const match = matchRequirementToInventoryItem(req, inventory || []);
  if (!match) return false;
  const available = Number(match.availableQtyKg ?? match.stockQtyKg ?? match.stock_qty_kg ?? 0) || 0;
  return available + 0.05 >= need;
}

function poCancelled(po) {
  return /cancel/i.test(String(po?.status || po?.deliveryStatus || ''));
}

function grnCancelled(grn) {
  return /cancel/i.test(String(grn?.status || grn?.qcStatus || ''));
}

function grnPendingQc(grn) {
  const status = `${grn?.status || ''} ${grn?.qcStatus || ''}`.toLowerCase();
  return status.includes('pending qc');
}

function grnApproved(grn) {
  if (grnCancelled(grn) || grnPendingQc(grn)) return false;
  const status = `${grn?.status || ''} ${grn?.qcStatus || ''}`.toLowerCase();
  return status.includes('approved') || status.includes('received');
}

function purchaseOrdersForOrder(order, requirements, purchaseOrders) {
  const numbers = new Set(
    requirements.map((req) => String(req?.poNumber || '').trim().toLowerCase()).filter(Boolean)
  );
  if (order?.poNumber) numbers.add(String(order.poNumber).trim().toLowerCase());
  return (purchaseOrders || []).filter((po) => {
    if (!po || poCancelled(po)) return false;
    if (sameId(po.linkedOrderId, order.id) || sameId(po.orderId, order.id)) return true;
    const poNumber = String(po.poNumber || po.id || '').trim().toLowerCase();
    if (poNumber && numbers.has(poNumber)) return true;
    return requirements.some((req) => linkedRequirementMatches(po.linkedRequirements, order.id, req.id, po.linkedOrderId));
  });
}

function artworkUrlOf(row) {
  return String(row?.artworkUrl || row?.jobCardFileUrl || row?.artwork_url || row?.job_card_file_url || '').trim();
}

function jobApproved(row) {
  return row?.approvedByHead === true || row?.productionApproved === true;
}

function materialIssued(order, productionRecords, storeIssues) {
  for (const record of productionRecords || []) {
    if (!recordMatchesOrder(record, order)) continue;
    for (const mat of record.materialsList || record.materials_list || []) {
      const issued = Number(mat?.issueQtyKg) || 0;
      const net = Number(mat?.netConsumedQtyKg);
      if (issued > 0 || (Number.isFinite(net) && net > 0)) return true;
    }
  }
  const orderName = String(order?.jobName || '').trim().toLowerCase();
  const orderId = String(order?.id || '').trim().toLowerCase();
  for (const tx of storeIssues || []) {
    if (!tx || String(tx.issueType || 'issue').toLowerCase() === 'return') continue;
    if (!(Number(tx.qtyKg) > 0)) continue;
    const job = String(tx.jobName || tx.orderId || '').trim().toLowerCase();
    if (sameId(tx.orderId, order.id) || (job && (job === orderName || job === orderId))) return true;
  }
  return false;
}

function pushBlocker(list, code, label) {
  if (list.some((item) => item.code === code)) return;
  list.push({ code, label });
}

/**
 * Blockers the order screens already store. A source that was not loaded
 * (the flag is false or the list is omitted) is skipped rather than guessed.
 */
export function derivePrintingBlockers(order, context = {}) {
  const blockers = [];
  const requirements = storedRequirements(order).filter(isFilmRequirement);
  const inventoryChecked = context.inventoryChecked === true && Array.isArray(context.inventory);
  const poChecked = context.purchaseOrdersChecked === true && Array.isArray(context.purchaseOrders);
  const grnChecked = context.grnsChecked === true && Array.isArray(context.grns);
  const issueChecked = (context.productionRecordsChecked === true && Array.isArray(context.productionRecords))
    || (context.storeIssuesChecked === true && Array.isArray(context.storeIssues));

  if (requirements.length && inventoryChecked) {
    const uncovered = requirements.filter((req) => !inventoryChecked || !lineCoveredByStock(req, context.inventory));
    const needsPurchase = uncovered.filter((req) => req.poIssued !== true && !req.poNumber);
    if (needsPurchase.length) pushBlocker(blockers, 'po_not_released', 'Raw material PO not released');

    const purchased = uncovered.filter((req) => req.poIssued === true || req.poNumber);
    const linkedPos = poChecked ? purchaseOrdersForOrder(order, requirements, context.purchaseOrders) : [];
    if (purchased.length || linkedPos.length) {
      const pos = linkedPos.length ? linkedPos : purchased.map((req) => ({ poNumber: req.poNumber, linkedOrderId: order.id }));
      const poNumbers = new Set(pos.map((po) => String(po.poNumber || po.id || '').trim().toLowerCase()).filter(Boolean));
      const grns = grnChecked
        ? (context.grns || []).filter((grn) => {
          if (!grn || grnCancelled(grn)) return false;
          const poNumber = String(grn.poNumber || grn.po_number || '').trim().toLowerCase();
          return poNumber && poNumbers.has(poNumber);
        })
        : [];
      const pending = grns.filter(grnPendingQc);
      const approved = grns.filter(grnApproved);
      if (grnChecked && pending.length && approved.length === 0) {
        pushBlocker(blockers, 'grn_pending', 'GRN pending QC');
      } else if (grnChecked && approved.length === 0 && pending.length === 0 && uncovered.length && needsPurchase.length === 0) {
        pushBlocker(blockers, 'not_received', 'Raw material not received');
      } else if (!grnChecked && inventoryChecked && uncovered.length && needsPurchase.length === 0) {
        pushBlocker(blockers, 'not_in_stock', 'Material not in stock');
      }
      if (inventoryChecked && uncovered.length && needsPurchase.length === 0 && approved.length > 0) {
        pushBlocker(blockers, 'not_in_stock', 'Material not in stock');
      }
    } else if (inventoryChecked && uncovered.length && needsPurchase.length === 0) {
      pushBlocker(blockers, 'not_in_stock', 'Material not in stock');
    }
  }

  if (issueChecked && requirements.length && !blockers.some((item) => ['po_not_released', 'grn_pending', 'not_received', 'not_in_stock'].includes(item.code))) {
    const covered = !inventoryChecked || requirements.every((req) => lineCoveredByStock(req, context.inventory));
    if (covered && !materialIssued(order, context.productionRecords, context.storeIssues)) {
      pushBlocker(blockers, 'not_issued', 'Material not issued');
    }
  }

  if (context.jobMastersChecked === true && Array.isArray(context.jobMasters)) {
    const resolution = resolveJobMaster({ order, jobMasters: context.jobMasters });
    if (resolution.status !== 'linked') {
      pushBlocker(blockers, 'job_master_missing', 'Job Master missing');
    } else if (!jobApproved(resolution.jobMaster)) {
      pushBlocker(blockers, 'job_master_unapproved', 'Job Master not approved');
    }
    const masterArt = resolution.status === 'linked' ? artworkUrlOf(resolution.jobMaster) : '';
    const cylinders = context.cylindersChecked === true && Array.isArray(context.cylinders) ? context.cylinders : [];
    const matchedCylinders = cylinders.filter((cyl) => {
      if (!cyl) return false;
      const masterId = resolution.jobMaster?.id || order.jobMasterId;
      if (masterId && (sameId(cyl.jobMasterId, masterId) || sameId(cyl.id, masterId))) return true;
      const name = String(order.jobName || '').trim().toLowerCase();
      return Boolean(name) && String(cyl.jobName || '').trim().toLowerCase() === name;
    });
    if (context.cylindersChecked === true) {
      if (!matchedCylinders.length) pushBlocker(blockers, 'cylinder_missing', 'Cylinder missing');
      else if (!matchedCylinders.some(jobApproved)) pushBlocker(blockers, 'cylinder_unapproved', 'Cylinder not approved');
    }
    const cylinderArt = matchedCylinders.some((cyl) => artworkUrlOf(cyl));
    if (resolution.status === 'linked' && !masterArt && !cylinderArt) {
      pushBlocker(blockers, 'artwork_missing', 'Artwork missing');
    }
  }

  const scheduleChecked = context.schedulesChecked === true || context.machineAssignmentsChecked === true;
  if (scheduleChecked) {
    const assigned = Boolean(order?.machineId)
      || Boolean(context.machineAssignments && context.machineAssignments[order.id]);
    const scheduled = Array.isArray(context.schedules) && context.schedules.some((row) => {
      if (!sameId(row?.orderId, order.id)) return false;
      if (!row.machineId) return false;
      return !/cancel/i.test(String(row.status || ''));
    });
    if (!assigned && !scheduled) pushBlocker(blockers, 'not_scheduled', 'No machine or job scheduled');
  }

  return blockers;
}

export function assessPrintingDeadlineReminder(order, stageInfo, options = {}) {
  const today = options.today || new Date();
  const leadDays = normalizePrintingLeadDays(options.leadDays);
  const productionRecords = options.productionRecords || [];
  const reachedPrinting = stageTrackReachedPrinting(stageInfo);
  const printingStarted = printingRunStarted(order, productionRecords);
  const cylinder = isCylinderOrder(order);
  const closed = orderIsClosedOrCancelled(order);
  const completed = closed;
  const originalDate = commercialDeadline(order);
  const revisedDate = dateOnlyString(order?.revisedDeadline);
  const clientInformed = order?.clientInformed === true;
  const informedForRevision = Boolean(revisedDate) && clientInformed;
  const clockDate = revisedDate || originalDate;
  const daysRemaining = calendarDaysUntil(clockDate, today);
  const overdue = daysRemaining !== null && daysRemaining < 0;
  const dueSoon = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= leadDays;
  const approaching = dueSoon || overdue;
  const stage = overdue ? 'overdue' : (dueSoon ? 'due-soon' : null);
  const blockers = order ? derivePrintingBlockers(order, options) : [];
  const blockersChecked = Boolean(
    options.inventoryChecked
    || options.jobMastersChecked
    || options.cylindersChecked
    || options.schedulesChecked
    || options.machineAssignmentsChecked
    || options.grnsChecked
    || options.purchaseOrdersChecked
    || options.productionRecordsChecked
    || options.storeIssuesChecked
  );
  const active = Boolean(order) && !cylinder && !closed && !printingStarted && approaching;
  return {
    active,
    stage,
    leadDays,
    reachedPrinting,
    printingStarted,
    cylinder,
    completed,
    closed,
    status: order?.status || '',
    blockers,
    blockersChecked,
    originalDate,
    revisedDate,
    clientInformed,
    informedForRevision,
    quieted: false,
    clockDate,
    daysRemaining,
    approaching,
    overdue,
    dueSoon,
    overdueLabel: overdue ? overdueByLabel(daysRemaining) : '',
    distanceLabel: overdue ? overdueByLabel(daysRemaining) : formatDeadlineDistance(daysRemaining),
  };
}

export function comparePrintingDeadlineReminders(left, right) {
  const a = left?.assessment || {};
  const b = right?.assessment || {};
  if (a.stage === 'overdue' && b.stage !== 'overdue') return -1;
  if (b.stage === 'overdue' && a.stage !== 'overdue') return 1;
  const days = (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0);
  if (days !== 0) return days;
  return String(left?.order?.id || '').localeCompare(String(right?.order?.id || ''));
}

export function printingDeadlineReminderRows(orders, context = {}) {
  const rows = [];
  for (const order of orders || []) {
    if (!order) continue;
    const stageInfo = typeof context.getStageInfo === 'function' ? context.getStageInfo(order) : null;
    const assessment = assessPrintingDeadlineReminder(order, stageInfo, context);
    if (assessment.active) rows.push({ order, stageInfo, assessment });
  }
  rows.sort(comparePrintingDeadlineReminders);
  return rows;
}

export function stageNoticeId(orderId, stage) {
  return `PRINT-DEADLINE-${orderId}-${stage === 'overdue' ? 'overdue' : 'due-soon'}`;
}

export function summaryNoticeId(plantDay) {
  return `PRINT-DEADLINE-SUMMARY-${plantDay}`;
}

function noticeLine(item) {
  const blockers = (item.assessment?.blockers || []).map((blocker) => blocker.label);
  return {
    orderId: item.order.id,
    jobName: item.order.jobName || '',
    status: item.assessment.status || item.order.status || '',
    stage: item.assessment.stage,
    daysRemaining: item.assessment.daysRemaining,
    label: item.assessment.distanceLabel,
    deadline: item.assessment.clockDate,
    blockers,
    href: `/orders/${encodeURIComponent(item.order.id)}`,
  };
}

/**
 * One in-app notice per order per stage, plus one summary per plant day.
 * Ids already stored are left out so a second load does not send them again.
 */
export function planPrintingDeadlineNotices({ reminders = [], plantDay, existing = [] } = {}) {
  const day = dateOnlyString(plantDay) || plantCalendarDate(plantDay || new Date());
  const existingIds = new Set((existing || []).map((row) => String(row?.id || '')));
  const stageNotices = [];
  for (const item of reminders || []) {
    if (!item?.order?.id || !item.assessment?.stage) continue;
    const id = stageNoticeId(item.order.id, item.assessment.stage);
    if (existingIds.has(id)) continue;
    const line = noticeLine(item);
    stageNotices.push({
      id,
      type: DEADLINE_NOTICE_STAGE,
      stage: item.assessment.stage,
      orderId: item.order.id,
      title: item.assessment.stage === 'overdue'
        ? `${item.order.id} is overdue and printing has not started`
        : `${item.order.id} is due before printing starts`,
      message: `${line.jobName || item.order.id} · ${line.status || 'Open'} · ${line.label}${line.blockers.length ? ` · ${line.blockers.join('; ')}` : ''}`,
      audience: ['Admin', 'Sales Manager'],
      plantDay: day,
      line,
      read: false,
    });
  }

  const summaryId = summaryNoticeId(day);
  const existingSummary = (existing || []).find((row) => String(row?.id || '') === summaryId) || null;
  let summary = null;
  if (!existingIds.has(summaryId) && (reminders || []).length) {
    const lines = (reminders || []).map(noticeLine);
    const overdue = lines.filter((line) => line.stage === 'overdue');
    const dueSoon = lines.filter((line) => line.stage === 'due-soon');
    summary = {
      id: summaryId,
      type: DEADLINE_NOTICE_SUMMARY,
      title: 'Daily summary: orders at risk before printing starts',
      message: `${overdue.length} overdue and ${dueSoon.length} due soon. Printing has not started.`,
      audience: ['Admin', 'Sales Manager'],
      plantDay: day,
      overdue,
      dueSoon,
      read: false,
    };
  }

  return { plantDay: day, stageNotices, summary, existingSummary };
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
