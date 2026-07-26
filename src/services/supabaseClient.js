import { createClient } from '@supabase/supabase-js';

// Retrieve credentials from environment variables or custom runtime storage
const getSupabaseCredentials = () => {
  const customUrl = localStorage.getItem('samyak_supabase_url');
  const customKey = localStorage.getItem('samyak_supabase_key');

  const url = customUrl || import.meta.env.VITE_SUPABASE_URL || '';
  const key = customKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  return { url, key };
};

const { url, key } = getSupabaseCredentials();

// Check if valid credentials are supplied (not empty and not default placeholders)
export const isSupabaseConfigured = () => {
  const { url: currentUrl, key: currentKey } = getSupabaseCredentials();
  return Boolean(
    currentUrl && 
    currentKey && 
    !currentUrl.includes('your-supabase-project') && 
    !currentKey.includes('your-supabase-anon-key')
  );
};

// Instantiate client (safely handles empty credentials to avoid immediate crash)
const validUrl = url && url.startsWith('http') ? url : 'https://placeholder.supabase.co';
const validKey = key || 'placeholder-key';

export const supabase = createClient(validUrl, validKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

/**
 * Test connectivity to Supabase
 */
export const checkSupabaseConnection = async () => {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      message: 'Supabase credentials are not configured in .env or settings.'
    };
  }

  try {
    const { url: activeUrl, key: activeKey } = getSupabaseCredentials();
    const tempClient = createClient(activeUrl, activeKey);
    
    // Perform a lightweight query against database
    const { error } = await tempClient.from('orders').select('count', { count: 'exact', head: true });
    
    if (error && error.code === 'PGRST301') {
      // Table doesn't exist yet, but connection to database URL & API key works!
      return {
        connected: true,
        tablesExist: false,
        message: 'Connected to Supabase! (Database tables need initialization)'
      };
    } else if (error && error.code !== '42P01') {
      // Other database error or permission error
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
 * Save custom Supabase credentials directly from ERP UI
 */
export const saveSupabaseCredentials = (supabaseUrl, supabaseAnonKey) => {
  if (supabaseUrl) localStorage.setItem('samyak_supabase_url', supabaseUrl.trim());
  else localStorage.removeItem('samyak_supabase_url');

  if (supabaseAnonKey) localStorage.setItem('samyak_supabase_key', supabaseAnonKey.trim());
  else localStorage.removeItem('samyak_supabase_key');
};

/**
 * Clear custom Supabase credentials from local storage
 */
export const clearSupabaseCredentials = () => {
  localStorage.removeItem('samyak_supabase_url');
  localStorage.removeItem('samyak_supabase_key');
};
