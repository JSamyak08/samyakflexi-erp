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
  const url = 
    localStorage.getItem('samyak_supabase_url') ||
    sessionStorage.getItem('samyak_supabase_url') ||
    getCookie('samyak_supabase_url') ||
    import.meta.env.VITE_SUPABASE_URL || '';

  const key = 
    localStorage.getItem('samyak_supabase_key') ||
    sessionStorage.getItem('samyak_supabase_key') ||
    getCookie('samyak_supabase_key') ||
    import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  return { url: url.trim(), key: key.trim() };
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
 * Test connectivity to Supabase and auto-persist active state
 */
export const checkSupabaseConnection = async () => {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      message: 'Supabase credentials are not configured in .env or settings.'
    };
  }

  try {
    const client = getSupabaseClient();
    
    // Lightweight database ping
    const { error } = await client.from('orders').select('count', { count: 'exact', head: true });
    
    if (error && (error.code === 'PGRST301' || error.code === 'PGRST204')) {
      return {
        connected: true,
        tablesExist: false,
        message: 'Connected to Supabase project! (Tables need initialization)'
      };
    } else if (error && error.code !== '42P01') {
      return {
        connected: true,
        tablesExist: true,
        error: error.message,
        message: `Connected to Supabase project (${error.message})`
      };
    }

    return {
      connected: true,
      tablesExist: true,
      message: 'Successfully connected to Supabase database!'
    };
  } catch (err) {
    return {
      connected: false,
      message: err.message || 'Failed to establish connection with Supabase.'
    };
  }
};

/**
 * Save custom Supabase credentials across LocalStorage, SessionStorage, and Cookies
 * to ensure persistent reconnection across cache clears and browser sessions.
 */
export const saveSupabaseCredentials = (supabaseUrl, supabaseAnonKey) => {
  const trimmedUrl = (supabaseUrl || '').trim();
  const trimmedKey = (supabaseAnonKey || '').trim();

  if (trimmedUrl) {
    localStorage.setItem('samyak_supabase_url', trimmedUrl);
    sessionStorage.setItem('samyak_supabase_url', trimmedUrl);
    setCookie('samyak_supabase_url', trimmedUrl);
  } else {
    localStorage.removeItem('samyak_supabase_url');
    sessionStorage.removeItem('samyak_supabase_url');
    removeCookie('samyak_supabase_url');
  }

  if (trimmedKey) {
    localStorage.setItem('samyak_supabase_key', trimmedKey);
    sessionStorage.setItem('samyak_supabase_key', trimmedKey);
    setCookie('samyak_supabase_key', trimmedKey);
  } else {
    localStorage.removeItem('samyak_supabase_key');
    sessionStorage.removeItem('samyak_supabase_key');
    removeCookie('samyak_supabase_key');
  }

  // Invalidate cached client so the next query immediately uses the new credentials
  currentClientInstance = null;
  currentClientKey = '';
};

/**
 * Clear custom Supabase credentials from all local storages
 */
export const clearSupabaseCredentials = () => {
  localStorage.removeItem('samyak_supabase_url');
  localStorage.removeItem('samyak_supabase_key');
  sessionStorage.removeItem('samyak_supabase_url');
  sessionStorage.removeItem('samyak_supabase_key');
  removeCookie('samyak_supabase_url');
  removeCookie('samyak_supabase_key');

  currentClientInstance = null;
  currentClientKey = '';
};
