// Settles a QZ Tray spooler result. The browser is not granted printed.
// Deploy with: supabase functions deploy barcode-print-job
// Requires the service role key in the function environment (supplied by Supabase)
// and the migration 20261024070000_barcode_qz_print.sql. Do not put a printer
// secret in the repo. A client-reported spooler word is weaker than a webhook:
// this function checks the signed-in user's barcodes permission, that the job
// was opened first, and that the printer name is on barcode_printer_allowlist.
// It cannot see the Windows spooler itself.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const authorization = req.headers.get('Authorization') || '';
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization) {
    return json({ error: 'missing function credentials' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: allowed, error: gateError } = await userClient.rpc('caller_has_barcodes');
  if (gateError || allowed !== true) return json({ error: 'barcodes permission required' }, 403);

  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  const printedBy = user?.user_metadata?.full_name || user?.email || 'Operator';

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '').toLowerCase();
  const admin = createClient(supabaseUrl, serviceKey);
  const { data, error } = await admin.rpc('settle_barcode_print_job', {
    p_action: action,
    p_job_id: body.jobId || '',
    p_printer: body.printer || '',
    p_barcode: body.barcode || '',
    p_spooler_status: body.spoolerStatus || '',
    p_printed_by: printedBy,
    p_source_module: body.sourceModule || null,
  });
  if (error) return json({ error: error.message }, 400);
  return json(data);
});
