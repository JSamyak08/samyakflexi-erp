import { supabase } from './supabaseClient';
import { saveSystemSetting, fetchSystemSetting } from './supabaseDataService';
import {
  GAIN_LOSS_THRESHOLD_SETTING,
  normalizeThresholdPct
} from '../utils/dispatchPacking';

export async function recordDispatchPackingConsumption(entry) {
  if (!entry?.id) throw new Error('consumption id is required');
  const { data, error } = await supabase.rpc('record_dispatch_packing_consumption', { p_entry: entry });
  if (error) {
    const failure = new Error(error.message || 'Dispatch packing consumption was not recorded.');
    failure.cause = error;
    throw failure;
  }
  return data || {};
}

export async function fetchPackingGainLossReport(filters = {}) {
  const { data, error } = await supabase.rpc('packing_gain_loss_report', {
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_search: filters.search || null,
    p_status: filters.status && filters.status !== 'all' ? filters.status : null,
    p_only_over: Boolean(filters.onlyOver)
  });
  if (error) {
    const failure = new Error(error.message || 'The gain/loss report could not be loaded.');
    failure.cause = error;
    throw failure;
  }
  return Array.isArray(data) ? data : [];
}

export async function fetchGainLossThresholdPct() {
  const stored = await fetchSystemSetting(GAIN_LOSS_THRESHOLD_SETTING);
  return normalizeThresholdPct(stored);
}

export async function saveGainLossThresholdPct(value) {
  const thresholdPct = normalizeThresholdPct(value);
  await saveSystemSetting(GAIN_LOSS_THRESHOLD_SETTING, thresholdPct);
  return thresholdPct;
}
