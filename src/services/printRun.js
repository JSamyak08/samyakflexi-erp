import { supabase } from './supabaseClient';
import { ensureValidSession } from './supabaseDataService';
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
  if (error) {
    const failure = new Error(error.message || 'The print run was not saved.');
    failure.code = error.code || '';
    failure.details = error.details || '';
    failure.hint = error.hint || '';
    throw failure;
  }
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
  if (error) {
    const failure = new Error(error.message || 'The run and idle report could not be loaded.');
    failure.code = error.code || '';
    failure.details = error.details || '';
    failure.hint = error.hint || '';
    throw failure;
  }
  return data || { runs: [], shifts: [], asOf };
}
