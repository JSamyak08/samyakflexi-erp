// Optional QZ Tray signing. Unsigned sites show QZ Tray's Allow prompt.
// Set these function secrets in the Supabase dashboard. Do not commit them.
//   QZ_CERTIFICATE  — the site certificate PEM (digital-certificate.txt)
//   QZ_PRIVATE_KEY  — PKCS#8 PEM (-----BEGIN PRIVATE KEY-----)
// If QZ Site Manager gave you "BEGIN RSA PRIVATE KEY", convert it once:
//   openssl pkcs8 -topk8 -nocrypt -in private-key.pem -out private-key-pkcs8.pem
// Deploy with: supabase functions deploy qz-sign
// The function requires a signed-in user. It does not record print status.

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

function pemToDer(pem: string) {
  const body = pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signRequest(privateKeyPem: string, request: string) {
  if (!privateKeyPem.includes('BEGIN PRIVATE KEY')) {
    throw new Error('QZ_PRIVATE_KEY must be a PKCS#8 PEM');
  }
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(request),
  );
  const bytes = new Uint8Array(signature);
  let raw = '';
  bytes.forEach((value) => {
    raw += String.fromCharCode(value);
  });
  return btoa(raw);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const authorization = req.headers.get('Authorization') || '';
  if (!supabaseUrl || !anonKey || !authorization) return json({ error: 'missing credentials' }, 500);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json({ error: 'sign in required' }, 401);

  const certificate = Deno.env.get('QZ_CERTIFICATE') || '';
  const privateKey = Deno.env.get('QZ_PRIVATE_KEY') || '';
  if (!certificate || !privateKey) {
    return json({ error: 'QZ signing secrets are not configured' }, 404);
  }

  const body = await req.json().catch(() => ({}));
  if (body.action === 'certificate') return json({ certificate });

  const request = String(body.request || '');
  if (!request) return json({ error: 'request is required' }, 400);
  try {
    const signature = await signRequest(privateKey, request);
    return json({ signature });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'sign failed' }, 500);
  }
});
