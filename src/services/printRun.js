import { supabase } from './supabaseClient';
import { ensureValidSession } from './supabaseDataService';
import { applyPrintRunResult, buildPrintRunPatch } from '../utils/printRun';

export { applyPrintRunResult, buildPrintRunPatch };

function rpcFailure(error, fallback) {
  const failure = new Error(error?.message || fallback);
  failure.code = error?.code || '';
  failure.details = error?.details || '';
  failure.hint = error?.hint || '';
  return failure;
}

function missingRpc(error) {
  const message = String(error?.message || error?.details || '');
  return /schema cache|could not find the function|PGRST202/i.test(message);
}

/**
 * Start, end, or update an active print run without writing order close columns.
 * The database keeps manual close and reopen Admin-only.
 * Ending a run goes through complete_print_run so the printed lot, balance
 * rolls, and printing scrap commit together.
 */
export async function recordPrintRun(orderId, action, fields) {
  if (!orderId) throw new Error('Order is missing.');
  await ensureValidSession();
  const patch = buildPrintRunPatch(fields);
  if (action === 'end') {
    const completed = await supabase.rpc('complete_print_run', {
      p_order_id: orderId,
      p_patch: patch
    });
    if (!completed.error) return completed.data || {};
    if (!missingRpc(completed.error)) {
      throw rpcFailure(completed.error, 'The print run was not saved.');
    }
  }
  const { data, error } = await supabase.rpc('record_print_run', {
    p_order_id: orderId,
    p_action: action,
    p_patch: patch
  });
  if (error) throw rpcFailure(error, 'The print run was not saved.');
  return data || {};
}

/** Hold a running press job. The database posts SFG or QC Hold and the balance roll. */
export async function holdPrintRun(orderId, fields) {
  if (!orderId) throw new Error('Order is missing.');
  await ensureValidSession();
  const patch = buildPrintRunPatch(fields);
  const { data, error } = await supabase.rpc('hold_print_run', {
    p_order_id: orderId,
    p_patch: patch
  });
  if (error) throw rpcFailure(error, 'The print job was not held.');
  return data || {};
}

/** Start a fresh run on a job that is Hold on Printing. */
export async function restartHeldPrintRun(orderId, fields) {
  if (!orderId) throw new Error('Order is missing.');
  await ensureValidSession();
  const patch = buildPrintRunPatch(fields);
  const { data, error } = await supabase.rpc('restart_held_print_run', {
    p_order_id: orderId,
    p_patch: patch
  });
  if (error) throw rpcFailure(error, 'The held print job was not restarted.');
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
