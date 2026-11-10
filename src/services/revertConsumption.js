import { supabase } from './supabaseClient';

export async function previewSfgConsumptionRevert(batch, logId) {
  const { data, error } = await supabase.rpc('preview_sfg_consumption_revert', {
    p_batch: batch,
    p_log_id: logId
  });
  if (error) {
    const failure = new Error(error.message || 'The revert could not be checked.');
    failure.cause = error;
    throw failure;
  }
  return data || {};
}

export async function revertSfgConsumption(batch, logId, reason) {
  const { data, error } = await supabase.rpc('revert_sfg_consumption', {
    p_batch: batch,
    p_log_id: logId,
    p_reason: reason
  });
  if (error) {
    const failure = new Error(error.message || 'The consumption was not reverted.');
    failure.cause = error;
    throw failure;
  }
  return data || {};
}
