/**
 * Slug Router Utility for Samyak Flexi-ERP
 * Manages clean URL slug paths, unique record/item IDs, sub-tabs, and shareable deep links.
 */

export const TAB_SLUG_MAP = {
  login: '/login',
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
  
  '/login': 'login',
  'login': 'login',

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
  '/ink-master': 'ink_management',
  'ink-master': 'ink_management',
  '/ink-costing': 'ink_management',
  'ink-costing': 'ink_management',
  '/inks': 'ink_management',
  'inks': 'ink_management',

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

      // Parse hash params if hash exists e.g. #/production-records?id=REC-001 or #production-records/REC-001
      const rawHash = window.location.hash ? window.location.hash.replace(/^#\/?/, '') : '';
      if (rawHash) {
        const hashParts = rawHash.split('?');
        const hashPath = hashParts[0].replace(/\/$/, '');
        const hashSegments = hashPath.split('/').filter(Boolean);

        if (hashSegments.length > 0) {
          const rootSlug = '/' + hashSegments[0].toLowerCase();
          if (SLUG_TAB_MAP[rootSlug] || SLUG_TAB_MAP[hashSegments[0]]) {
            tab = SLUG_TAB_MAP[rootSlug] || SLUG_TAB_MAP[hashSegments[0]];
            if (hashSegments[1] && !params.id) {
              params.id = decodeURIComponent(hashSegments[1]);
            }
          }
        } else if (SLUG_TAB_MAP[hashPath] || SLUG_TAB_MAP['/' + hashPath]) {
          tab = SLUG_TAB_MAP[hashPath] || SLUG_TAB_MAP['/' + hashPath];
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
        // Check pathname e.g. /production-records/REC-2026-001 or /job-masters/JOB-001
        const rawPath = window.location.pathname ? window.location.pathname.toLowerCase() : '/';
        const pathSegments = rawPath.split('/').filter(Boolean);

        if (pathSegments.length > 0) {
          const rootSlug = '/' + pathSegments[0];
          if (SLUG_TAB_MAP[rootSlug] || SLUG_TAB_MAP[pathSegments[0]]) {
            tab = SLUG_TAB_MAP[rootSlug] || SLUG_TAB_MAP[pathSegments[0]];
            if (pathSegments[1] && !params.id) {
              params.id = decodeURIComponent(pathSegments[1]);
            }
          }
        } else {
          const path = rawPath.length > 1 ? rawPath.replace(/\/$/, '') : rawPath;
          if (SLUG_TAB_MAP[path]) {
            tab = SLUG_TAB_MAP[path];
          }
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
 * Update browser URL path & query string with history.pushState or history.replaceState
 * @param {string} tabKey - Page tab key e.g. 'production_records'
 * @param {Object} queryParams - Optional query params e.g. { id: 'REC-001', tab: 'list' }
 * @param {boolean} replace - Use replaceState instead of pushState if true
 */
export function pushSlugState(tabKey, queryParams = {}, replace = false) {
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

    if (typeof window !== 'undefined' && window.history) {
      if (replace && window.history.replaceState) {
        window.history.replaceState({ tab: tabKey, params: queryParams }, '', finalUrl);
      } else if (window.history.pushState) {
        window.history.pushState({ tab: tabKey, params: queryParams }, '', finalUrl);
      }
    }
  } catch (e) {
    console.warn("Failed to push state to history", e);
  }
}
