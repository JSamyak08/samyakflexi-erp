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

/**
 * Run and idle history for one IST window.
 * The database rejects every role except Admin, Plant Manager, and Production Manager.
 */
export async function fetchPrintMachineRunIdle({ rangeStart, rangeEnd, asOf }) {
  await ensureValidSession();
  const { data, error } = await supabase.rpc('print_machine_run_idle', {
    p_range_start: rangeStart,
    p_range_end: rangeEnd,
    p_as_of: asOf || new Date().toISOString()
  });
  if (error) handleSupabaseError(error, 'print machine run and idle');
  return data || { runs: [], shifts: [], asOf };
}
