/**
 * Slug Router Utility for Samyak Flexi-ERP
 * Manages clean URL slug paths, unique record/item IDs, sub-tabs, and shareable deep links.
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
  ink_management: '/ink-management',
  material_indents: '/material-indents',
  user_management: '/user-management',
  cylinders: '/rotogravure-cylinders',
  printing_scheduler: '/printing-scheduler',
  scrap_wastage: '/scrap-wastage',
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

  '/ink-management': 'ink_management',
  'ink-management': 'ink_management',

  '/material-indents': 'material_indents',
  'material-indents': 'material_indents',

  '/user-management': 'user_management',
  'user-management': 'user_management',

  '/rotogravure-cylinders': 'cylinders',
  'rotogravure-cylinders': 'cylinders',

  '/printing-scheduler': 'printing_scheduler',
  'printing-scheduler': 'printing_scheduler',

  '/scrap-wastage': 'scrap_wastage',
  'scrap-wastage': 'scrap_wastage',

  '/supabase-integration': 'supabase',
  'supabase-integration': 'supabase',

  '/letterhead-settings': 'doc_settings',
  'letterhead-settings': 'doc_settings',

  '/audit-logs': 'audit_logs',
  'audit-logs': 'audit_logs'
};

/**
 * Get active tab key and query parameters from current URL (path, hash, search)
 */
export function getRouteFromUrl() {
  try {
    let tab = 'dashboard';
    const params = {};

    // Parse search params from window.location.search
    if (typeof window !== 'undefined' && window.location) {
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.forEach((val, key) => {
        params[key] = val;
      });

      // Parse hash params if hash exists e.g. #/job-masters?id=JOB-001 or #job-masters?id=JOB-001
      const rawHash = window.location.hash ? window.location.hash.replace(/^#\/?/, '') : '';
      if (rawHash) {
        const hashParts = rawHash.split('?');
        const hashSlug = hashParts[0].replace(/\/$/, '');
        if (SLUG_TAB_MAP[hashSlug] || SLUG_TAB_MAP['/' + hashSlug]) {
          tab = SLUG_TAB_MAP[hashSlug] || SLUG_TAB_MAP['/' + hashSlug];
        }
        if (hashParts[1]) {
          const hashSearchParams = new URLSearchParams(hashParts[1]);
          hashSearchParams.forEach((val, key) => {
            params[key] = val;
          });
        }
      }

      // Check query params for tab= or page=
      if (params.tab && SLUG_TAB_MAP[params.tab]) {
        tab = SLUG_TAB_MAP[params.tab];
      } else if (params.page && SLUG_TAB_MAP[params.page]) {
        tab = SLUG_TAB_MAP[params.page];
      } else if (!window.location.hash) {
        // Check pathname e.g. /job-masters or /orders
        const rawPath = window.location.pathname ? window.location.pathname.toLowerCase() : '/';
        const path = rawPath.length > 1 ? rawPath.replace(/\/$/, '') : rawPath;
        if (SLUG_TAB_MAP[path]) {
          tab = SLUG_TAB_MAP[path];
        }
      }
    }

    return { tab, params };
  } catch (e) {
    console.error("Error reading URL route", e);
    return { tab: 'dashboard', params: {} };
  }
}

export function getTabFromUrl() {
  return getRouteFromUrl().tab;
}

export function getSlugForTab(tabKey) {
  return TAB_SLUG_MAP[tabKey] || '/dashboard';
}

/**
 * Update browser URL path & query string with history.pushState
 * @param {string} tabKey - Page tab key e.g. 'job_masters'
 * @param {Object} queryParams - Optional query params e.g. { id: 'JOB-001', tab: 'grn_inward' }
 */
export function pushSlugState(tabKey, queryParams = {}) {
  try {
    const targetSlug = getSlugForTab(tabKey);
    const searchParams = new URLSearchParams();
    
    Object.entries(queryParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        searchParams.set(k, v);
      }
    });

    const searchStr = searchParams.toString();
    const finalUrl = targetSlug + (searchStr ? `?${searchStr}` : '');

    if (typeof window !== 'undefined' && window.history && window.history.pushState) {
      window.history.pushState({ tab: tabKey, params: queryParams }, '', finalUrl);
    }
  } catch (e) {
    console.warn("Failed to push state to history", e);
  }
}
