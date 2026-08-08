import { createClient } from '@supabase/supabase-js';

// Helper to set cookie for extra persistence against cache wipes
const setCookie = (name, value, days = 365) => {
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
  } catch (e) {
    // Ignore cookie errors in restricted environments
  }
};

const getCookie = (name) => {
  try {
    return document.cookie.split('; ').reduce((r, v) => {
      const parts = v.split('=');
      return parts[0] === name ? decodeURIComponent(parts[1]) : r;
    }, '');
  } catch (e) {
    return '';
  }
};

const removeCookie = (name) => {
  try {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  } catch (e) {}
};

/**
 * Multi-layer credential retrieval (LocalStorage -> SessionStorage -> Cookie -> Env)
 */
export const getSupabaseCredentials = () => {
  let url = '';
  let key = '';

  const cleanVal = (val) => {
    if (!val) return '';
    const s = String(val).trim();
    if (
      s === 'null' || 
      s === 'undefined' || 
      s === '[object Object]' || 
      s === 'placeholder' ||
      s.includes('your-supabase-project') ||
      s.includes('your-supabase-anon-key')
    ) {
      return '';
    }
    return s;
  };

  try { url = cleanVal(localStorage.getItem('samyak_supabase_url')); } catch (e) {}
  if (!url) try { url = cleanVal(sessionStorage.getItem('samyak_supabase_url')); } catch (e) {}
  if (!url) url = cleanVal(getCookie('samyak_supabase_url'));
  if (!url) url = cleanVal(import.meta.env.VITE_SUPABASE_URL || 'https://eamstsaqkbeiywfaanhi.supabase.co');

  try { key = cleanVal(localStorage.getItem('samyak_supabase_key')); } catch (e) {}
  if (!key) try { key = cleanVal(sessionStorage.getItem('samyak_supabase_key')); } catch (e) {}
  if (!key) key = cleanVal(getCookie('samyak_supabase_key'));
  if (!key) key = cleanVal(import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhbXN0c2Fxa2JlaXl3ZmFhbmhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNTg1NTYsImV4cCI6MjEwMDYzNDU1Nn0.qLcMES3SvNut2zS1wZqqT_NDefXlreGEyVr_I9FInaU');
  console.log("[Supabase Env Debug] VITE_SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL, "VITE_SUPABASE_ANON_KEY length:", import.meta.env.VITE_SUPABASE_ANON_KEY ? import.meta.env.VITE_SUPABASE_ANON_KEY.length : 0);
  console.log("[Supabase Credentials Debug] resolved url:", url, "resolved key length:", key ? key.length : 0);

  return { url, key };
};

/**
 * Check if valid non-placeholder credentials are present
 */
export const isSupabaseConfigured = () => {
  const { url, key } = getSupabaseCredentials();
  return Boolean(
    url && 
    key && 
    url.startsWith('http') &&
    !url.includes('your-supabase-project') && 
    !key.includes('your-supabase-anon-key')
  );
};

// Internal active client cache
let currentClientInstance = null;
let currentClientKey = '';

/**
 * Returns the live active Supabase client, re-instantiating automatically
 * if credentials have changed or were newly provided.
 */
export const getSupabaseClient = () => {
  const { url, key } = getSupabaseCredentials();
  const credentialHash = `${url}::${key}`;

  if (!currentClientInstance || currentClientKey !== credentialHash) {
    const validUrl = url && url.startsWith('http') ? url : 'https://placeholder.supabase.co';
    const validKey = key || 'placeholder-key';

    currentClientInstance = createClient(validUrl, validKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: { 'x-application-name': 'SamyakFlexiERP' }
      }
    });
    currentClientKey = credentialHash;
  }

  return currentClientInstance;
};

/**
 * Dynamic Proxy for `supabase` export.
 * Guarantees that calls to `supabase.from(...)` or `supabase.auth` ALWAYS use
 * the latest configured client instance even if credentials were updated at runtime.
 */
export const supabase = new Proxy({}, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

/**
 * Test connectivity to Supabase (both PostgreSQL tables and Storage Buckets)
 */
export const checkSupabaseConnection = async () => {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      databaseOnline: false,
      storageOnline: false,
      tablesExist: false,
      message: 'Supabase credentials are not configured in .env or settings.'
    };
  }

  const result = {
    connected: false,
    databaseOnline: false,
    storageOnline: false,
    tablesExist: false,
    storageBucket: null,
    message: '',
    error: null
  };

  try {
    const client = getSupabaseClient();
    
    // 1. Check PostgreSQL Database Connectivity
    const { error: dbError } = await client.from('orders').select('count', { count: 'exact', head: true });
    
    if (dbError && (dbError.code === 'PGRST301' || dbError.code === 'PGRST204')) {
      result.connected = true;
      result.databaseOnline = true;
      result.tablesExist = false;
      result.message = 'Connected to Supabase project! (Tables need initialization via SQL schema)';
    } else if (dbError && dbError.code === '42P01') {
      result.connected = true;
      result.databaseOnline = true;
      result.tablesExist = false;
      result.message = 'Connected to Supabase! Table "orders" not yet created. Run the SQL schema script.';
    } else if (dbError) {
      result.connected = true;
      result.databaseOnline = true;
      result.tablesExist = true;
      result.error = dbError.message;
      result.message = `Connected to Supabase project (${dbError.message})`;
    } else {
      result.connected = true;
      result.databaseOnline = true;
      result.tablesExist = true;
      result.message = 'Successfully connected to Supabase database!';
    }

    // 2. Check Cloud Storage Buckets Connectivity
    try {
      const { data: buckets, error: storageError } = await client.storage.listBuckets();
      if (!storageError && Array.isArray(buckets)) {
        const erpBucket = buckets.find(b => b.name === 'erp-files' || b.name === 'artwork' || b.name === 'artworks');
        if (erpBucket) {
          result.storageOnline = true;
          result.storageBucket = erpBucket.name;
        } else {
          result.storageOnline = buckets.length > 0;
          result.storageBucket = buckets[0]?.name || 'default';
        }
      } else {
        // Direct probe on 'erp-files' or 'artwork'
        const { data: files } = await client.storage.from('erp-files').list('', { limit: 1 });
        if (files) {
          result.storageOnline = true;
          result.storageBucket = 'erp-files';
        }
      }
    } catch (sErr) {
      console.warn('[Supabase Client] Storage check notice:', sErr);
    }

    return result;
  } catch (err) {
    return {
      connected: false,
      databaseOnline: false,
      storageOnline: false,
      tablesExist: false,
      error: err.message,
      message: err.message || 'Failed to establish connection with Supabase.'
    };
  }
};

/**
 * Save custom Supabase credentials across LocalStorage, SessionStorage, and Cookies
 * to ensure persistent reconnection across cache clears and browser sessions.
 * Automatically broadcasts a custom event to notify all components.
 */
export const saveSupabaseCredentials = (supabaseUrl, supabaseAnonKey) => {
  const trimmedUrl = (supabaseUrl || '').trim();
  const trimmedKey = (supabaseAnonKey || '').trim();

  if (trimmedUrl) {
    try { localStorage.setItem('samyak_supabase_url', trimmedUrl); } catch (e) {}
    try { sessionStorage.setItem('samyak_supabase_url', trimmedUrl); } catch (e) {}
    setCookie('samyak_supabase_url', trimmedUrl);
  } else {
    try { localStorage.removeItem('samyak_supabase_url'); } catch (e) {}
    try { sessionStorage.removeItem('samyak_supabase_url'); } catch (e) {}
    removeCookie('samyak_supabase_url');
  }

  if (trimmedKey) {
    try { localStorage.setItem('samyak_supabase_key', trimmedKey); } catch (e) {}
    try { sessionStorage.setItem('samyak_supabase_key', trimmedKey); } catch (e) {}
    setCookie('samyak_supabase_key', trimmedKey);
  } else {
    try { localStorage.removeItem('samyak_supabase_key'); } catch (e) {}
    try { sessionStorage.removeItem('samyak_supabase_key'); } catch (e) {}
    removeCookie('samyak_supabase_key');
  }

  // Invalidate cached client so the next query immediately uses the new credentials
  currentClientInstance = null;
  currentClientKey = '';

  // Notify the entire application of credential update
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('supabase-credentials-changed', {
      detail: { url: trimmedUrl, key: trimmedKey, configured: isSupabaseConfigured() }
    }));
  }
};

/**
 * Clear custom Supabase credentials from all local storages
 */
export const clearSupabaseCredentials = () => {
  try { localStorage.removeItem('samyak_supabase_url'); } catch (e) {}
  try { localStorage.removeItem('samyak_supabase_key'); } catch (e) {}
  try { sessionStorage.removeItem('samyak_supabase_url'); } catch (e) {}
  try { sessionStorage.removeItem('samyak_supabase_key'); } catch (e) {}
  removeCookie('samyak_supabase_url');
  removeCookie('samyak_supabase_key');

  currentClientInstance = null;
  currentClientKey = '';

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('supabase-credentials-changed', {
      detail: { url: '', key: '', configured: false }
    }));
  }
};
