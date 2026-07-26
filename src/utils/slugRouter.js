/**
 * Slug Router Utility for Samyak Flexi-ERP
 * Manages clean URL slug paths throughout the app
 */

export const TAB_SLUG_MAP = {
  dashboard: '/dashboard',
  production_records: '/production-records',
  job_punching: '/job-punching',
  orders: '/orders',
  job_datasheet: '/job-datasheet',
  vendors: '/vendors',
  inventory: '/inventory',
  user_management: '/user-management',
  cylinders: '/rotogravure-cylinders',
  supabase: '/supabase-integration',
  doc_settings: '/letterhead-settings'
};

export const SLUG_TAB_MAP = {
  '/': 'dashboard',
  '/dashboard': 'dashboard',
  '/production-records': 'production_records',
  '/job-punching': 'job_punching',
  '/orders': 'orders',
  '/job-datasheet': 'job_datasheet',
  '/vendors': 'vendors',
  '/inventory': 'inventory',
  '/user-management': 'user_management',
  '/rotogravure-cylinders': 'cylinders',
  '/supabase-integration': 'supabase',
  '/letterhead-settings': 'doc_settings'
};

/**
 * Get active tab key from current URL path or hash
 */
export function getTabFromUrl() {
  const path = window.location.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const hash = window.location.hash.replace('#', '').toLowerCase();

  if (hash && SLUG_TAB_MAP[hash]) {
    return SLUG_TAB_MAP[hash];
  }
  
  if (SLUG_TAB_MAP[path]) {
    return SLUG_TAB_MAP[path];
  }

  return 'dashboard';
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
  const targetSlug = getSlugForTab(tabKey);
  const currentPath = window.location.pathname;

  if (currentPath !== targetSlug) {
    window.history.pushState({ tab: tabKey }, '', targetSlug);
  }
}
