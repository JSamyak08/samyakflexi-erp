import { isSupabaseConfigured, supabase } from './supabaseClient';

/**
 * Opens and settles a QZ spooler job through the barcode-print-job Edge Function.
 * The browser never sends job_status = 'printed'. The function maps the spooler word.
 */
export async function openBarcodePrintJob({ printer, barcode, sourceModule, printedBy }) {
  if (!isSupabaseConfigured()) return null;
  const jobId = globalThis.crypto?.randomUUID?.() || `qz-${Date.now()}`;
  const { data, error } = await supabase.functions.invoke('barcode-print-job', {
    body: {
      action: 'open',
      jobId,
      printer,
      barcode,
      sourceModule: sourceModule || null,
      printedBy: printedBy || 'Operator',
    },
  });
  if (error || !data?.job_id) {
    console.warn('[barcode print] open job', error?.message || error || data);
    return null;
  }
  return data;
}

export async function settleBarcodePrintJob({ jobId, printer, spoolerStatus }) {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase.functions.invoke('barcode-print-job', {
    body: {
      action: 'settle',
      jobId,
      printer,
      spoolerStatus,
    },
  });
  if (error || !data?.job_id) {
    console.warn('[barcode print] settle job', error?.message || error || data);
    return null;
  }
  return data;
}
