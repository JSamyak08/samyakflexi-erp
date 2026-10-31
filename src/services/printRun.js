import { supabase } from './supabaseClient';
import { ensureValidSession, handleSupabaseError } from './supabaseDataService';
import { applyPrintRunResult, buildPrintRunPatch } from '../utils/printRun';

export { applyPrintRunResult, buildPrintRunPatch };

/**
 * Start, end, or update an active print run without writing order close columns.
 * The database keeps manual close and reopen Admin-only.
 */
export async function recordPrintRun(orderId, action, fields) {
  if (!orderId) throw new Error('Order is missing.');
  await ensureValidSession();
  const patch = buildPrintRunPatch(fields);
  const { data, error } = await supabase.rpc('record_print_run', {
    p_order_id: orderId,
    p_action: action,
    p_patch: patch
  });
  if (error) handleSupabaseError(error, 'print run');
  return data || {};
}
