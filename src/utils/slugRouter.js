/**
 * Slug Router Utility for Samyak Flexi-ERP
 * Manages clean URL slug paths throughout the app with zero-404 fallback support
 */

export const TAB_SLUG_MAP = {
  dashboard: '/dashboard',
  sales: '/sales-management',
  production_records: '/production-records',
  job_punching: '/job-punching',
  orders: '/orders',
  clients: '/clients-directory',
  job_masters: '/job-masters',
  vendors: '/vendors',
  inventory: '/inventory',
  material_indents: '/material-indents',
  user_management: '/user-management',
  cylinders: '/rotogravure-cylinders',
  printing_scheduler: '/printing-scheduler',
  supabase: '/supabase-integration',
  doc_settings: '/letterhead-settings',
  audit_logs: '/audit-logs'
};

export const SLUG_TAB_MAP = {
  '/': 'dashboard',
  '': 'dashboard',
  '/index.html': 'dashboard',
  
  '/dashboard': 'dashboard',
  'dashboard': 'dashboard',

  '/sales-management': 'sales',
  'sales-management': 'sales',

  '/production-records': 'production_records',
  'production-records': 'production_records',

  '/job-punching': 'job_punching',
  'job-punching': 'job_punching',

  '/orders': 'orders',
  'orders': 'orders',

  '/job-datasheet': 'production_records',
  'job-datasheet': 'production_records',

  '/clients-directory': 'clients',
  'clients-directory': 'clients',

  '/job-masters': 'job_masters',
  'job-masters': 'job_masters',

  '/vendors': 'vendors',
  'vendors': 'vendors',

  '/inventory': 'inventory',
  'inventory': 'inventory',

  '/material-indents': 'material_indents',
  'material-indents': 'material_indents',

  '/user-management': 'user_management',
  'user-management': 'user_management',

  '/rotogravure-cylinders': 'cylinders',
  'rotogravure-cylinders': 'cylinders',

  '/printing-scheduler': 'printing_scheduler',
  'printing-scheduler': 'printing_scheduler',

  '/supabase-integration': 'supabase',
  'supabase-integration': 'supabase',

  '/letterhead-settings': 'doc_settings',
  'letterhead-settings': 'doc_settings',

  '/audit-logs': 'audit_logs',
  'audit-logs': 'audit_logs'
};

/**
 * Get active tab key from current URL path, hash or query string
 */
export function getTabFromUrl() {
  try {
    // 1. Check Query Params e.g. ?tab=orders or ?page=orders
    const searchParams = new URLSearchParams(window.location.search);
    const paramTab = searchParams.get('tab') || searchParams.get('page') || searchParams.get('p');
    if (paramTab && SLUG_TAB_MAP[paramTab]) {
      return SLUG_TAB_MAP[paramTab];
    }

    // 2. Check Hash e.g. #/orders or #orders
    const rawHash = window.location.hash ? window.location.hash.replace(/^#\/?/, '') : '';
    if (rawHash && SLUG_TAB_MAP[rawHash]) {
      return SLUG_TAB_MAP[rawHash];
    }

    // 3. Check Pathname e.g. /orders or /job-punching
    const rawPath = window.location.pathname ? window.location.pathname.toLowerCase() : '/';
    const path = rawPath.length > 1 ? rawPath.replace(/\/$/, '') : rawPath;
    if (SLUG_TAB_MAP[path]) {
      return SLUG_TAB_MAP[path];
    }

    return 'dashboard';
  } catch (e) {
    console.error("Error reading URL slug", e);
    return 'dashboard';
  }
}

/**
 * Get clean URL slug for a given tab key
 */
export function getSlugForTab(tabKey) {
  return TAB_SLUG_MAP[tabKey] || '/dashboard';
}

/**
 * Update browser URL path with history pushState
 */
export function pushSlugState(tabKey) {
  try {
    const targetSlug = getSlugForTab(tabKey);
    const currentPath = window.location.pathname;

    if (currentPath !== targetSlug && window.history && window.history.pushState) {
      window.history.pushState({ tab: tabKey }, '', targetSlug);
    }
  } catch (e) {
    console.warn("Failed to push state to history", e);
  }
}
