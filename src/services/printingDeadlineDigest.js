/**
 * Daily pre-printing deadline summary.
 *
 * There is no Supabase cron, edge schedule, or Vercel cron in this app.
 * The first load of a plant day by Admin or Sales Manager writes the
 * summary and the per-order stage notices into erp_notifications.
 * A stable id makes a second load the same day a no-op. The summary email
 * uses the existing /api/send-email path and is skipped when that insert
 * did not create a new row.
 */

import { supabase } from './supabaseClient.js';
import { buildEmailTemplate, getEmailsForRoles, sendERPEmailNotification } from './emailService.js';
import {
  planPrintingDeadlineNotices,
  plantCalendarDate,
} from '../utils/orderDeadlineReminder.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

async function fetchExistingNotices(client) {
  const { data, error } = await client
    .from('erp_notifications')
    .select('id, payload')
    .like('id', 'PRINT-DEADLINE-%');
  if (error) throw error;
  return (data || []).map((row) => ({ ...(row.payload || {}), id: row.payload?.id || row.id }));
}

async function insertNotice(client, notice) {
  const now = new Date().toISOString();
  const { error } = await client.from('erp_notifications').insert({
    id: notice.id,
    payload: { ...notice, timestamp: now },
    created_at: now,
    updated_at: now,
  });
  if (!error) return 'created';
  if (error.code === '23505') return 'duplicate';
  throw error;
}

function summaryHtml(summary) {
  const section = (title, lines) => {
    if (!lines.length) return '';
    const rows = lines.map((line) => `<tr>
      <td><strong>${escapeHtml(line.orderId)}</strong></td>
      <td>${escapeHtml(line.jobName)}</td>
      <td>${escapeHtml(line.status)}</td>
      <td>${escapeHtml(line.label)}</td>
      <td>${escapeHtml((line.blockers || []).join('; ') || '—')}</td>
    </tr>`).join('');
    return `<h3 style="font-size:14px;margin:18px 0 8px;">${escapeHtml(title)}</h3>
      <table class="data-table"><thead><tr><th>Order</th><th>Job</th><th>Status</th><th>Deadline</th><th>Blocker</th></tr></thead><tbody>${rows}</tbody></table>`;
  };
  return `
    <p style="font-size:14px;color:#334155;margin-top:0;">Printing has not started on these orders. Overdue jobs stay on the list until a print run starts or the order is closed or cancelled.</p>
    ${section('Overdue', summary.overdue || [])}
    ${section('Due soon', summary.dueSoon || [])}
  `;
}

async function emailSummary(summary, users) {
  const to = getEmailsForRoles(users, ['Admin', 'Sales Manager'], 'admin@samyakinternational.in');
  const html = buildEmailTemplate({
    title: summary.title,
    badgeText: 'Deadline summary',
    badgeBg: '#b91c1c',
    contentHtml: summaryHtml(summary),
    footerNote: 'Sent once per plant day to Admin and Sales Manager.',
  });
  return sendERPEmailNotification({
    kind: 'automated',
    to,
    subject: summary.title,
    html,
    text: summary.message,
  });
}

/**
 * @param {{ reminders?: array, users?: array, plantDay?: string, today?: Date, client?: object, sendEmail?: boolean }} input
 */
export async function publishPrintingDeadlineDigest({
  reminders = [],
  users = [],
  plantDay,
  today = new Date(),
  client = supabase,
  sendEmail = true,
} = {}) {
  const day = plantDay || plantCalendarDate(today);
  const existing = await fetchExistingNotices(client);
  const plan = planPrintingDeadlineNotices({ reminders, plantDay: day, existing });
  const created = [];
  for (const notice of plan.stageNotices) {
    const outcome = await insertNotice(client, notice);
    if (outcome === 'created') created.push(notice);
  }

  let summary = null;
  if (plan.summary) {
    const outcome = await insertNotice(client, plan.summary);
    if (outcome === 'created') {
      summary = plan.summary;
      created.push(plan.summary);
      if (sendEmail) {
        await emailSummary(plan.summary, users).catch((err) => {
          console.warn('[deadline digest] Summary email was not sent.', err?.message || err);
        });
      }
    }
  }

  return {
    plantDay: day,
    created,
    summary,
    existingSummary: plan.existingSummary,
  };
}
