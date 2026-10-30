/**
 * Persist a revised order deadline and the client-informed checklist.
 * Mail is not sent from here. The screen only opens a draft the user sends.
 */

import { supabase } from './supabaseClient.js';
import { ensureValidSession, handleSupabaseError } from './supabaseDataService.js';
import {
  mapDeadlineRevisionRow,
  nextClientInformed,
  nextDeadlineRevision,
} from '../utils/orderDeadlineReminder.js';

function revisionRow(history) {
  return {
    id: history.id,
    order_id: history.orderId,
    event_type: history.eventType,
    original_deadline: history.originalDeadline,
    previous_deadline: history.previousDeadline,
    revised_deadline: history.revisedDeadline,
    reason: history.reason,
    actor: history.actor,
    acted_at: history.actedAt,
    client_informed: history.clientInformed,
  };
}

function orderDeadlinePatch(order) {
  return {
    original_deadline: order.originalDeadline || null,
    revised_deadline: order.revisedDeadline || null,
    deadline_revised_at: order.deadlineRevisedAt || null,
    deadline_revised_by: order.deadlineRevisedBy || null,
    deadline_revision_reason: order.deadlineRevisionReason || null,
    client_informed: order.clientInformed === true,
    client_informed_at: order.clientInformedAt || null,
    client_informed_by: order.clientInformedBy || null,
  };
}

async function writeDeadlineChange(order, history) {
  await ensureValidSession();
  const { data, error } = await supabase
    .from('orders')
    .update(orderDeadlinePatch(order))
    .eq('id', order.id)
    .select('id')
    .maybeSingle();
  if (error) handleSupabaseError(error, 'orders deadline');
  if (!data) {
    throw new Error('The revised deadline was not saved. Check that your role can update this order.');
  }
  const { error: historyError } = await supabase
    .from('order_deadline_revisions')
    .insert(revisionRow(history));
  if (historyError) handleSupabaseError(historyError, 'order_deadline_revisions');
}

export async function saveRevisedOrderDeadline(order, input) {
  const next = nextDeadlineRevision(order, input);
  if (!next.ok) {
    const error = new Error(next.error);
    error.validation = true;
    throw error;
  }
  await writeDeadlineChange(next.order, next.history);
  return next;
}

export async function saveOrderClientInformed(order, input) {
  const next = nextClientInformed(order, input);
  if (!next.ok) {
    const error = new Error(next.error);
    error.validation = true;
    throw error;
  }
  await writeDeadlineChange(next.order, next.history);
  return next;
}

export async function fetchOrderDeadlineHistory(orderId) {
  if (!orderId) return [];
  await ensureValidSession();
  const { data, error } = await supabase
    .from('order_deadline_revisions')
    .select('*')
    .eq('order_id', orderId)
    .order('acted_at', { ascending: false });
  if (error) handleSupabaseError(error, 'order_deadline_revisions');
  return (data || []).map(mapDeadlineRevisionRow);
}
