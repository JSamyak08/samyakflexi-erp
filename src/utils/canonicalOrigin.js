export const PRODUCTION_ORIGIN = 'https://erp.samyakinternational.in';

const PRODUCTION_VERCEL_HOSTS = new Set([
  'samyakflexi-erp.vercel.app',
  'samyakflexi-erp-samyak-international-ltd.vercel.app',
  'samyakflexi-erp-git-main-samyak-international-ltd.vercel.app',
]);

export function isDisallowedAuthHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'vercel.app' || host.endsWith('.vercel.app') || host === 'supabase.co' || host.endsWith('.supabase.co');
}

/**
 * An absolute http(s) origin. vercel.app and supabase.co are rejected so an
 * auth link cannot keep the person on a deployment host or the project URL.
 */
export function parseHttpOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (url.username || url.password) return '';
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) return '';
  if (isDisallowedAuthHost(url.hostname)) return '';
  return url.origin;
}

/**
 * Public site used in auth emails. A configured origin wins. The page origin
 * is used only when it is not a vercel.app or supabase.co host. Otherwise
 * the link is the production ERP.
 */
export function resolvePublicOrigin({ configured = '', locationOrigin = '' } = {}) {
  return parseHttpOrigin(configured) || parseHttpOrigin(locationOrigin) || PRODUCTION_ORIGIN;
}

export function shouldRedirectVercelHost(hostname) {
  return PRODUCTION_VERCEL_HOSTS.has(String(hostname || '').toLowerCase());
}

export function redirectProductionVercelHost(location) {
  if (!location || !shouldRedirectVercelHost(location.hostname)) return '';
  const path = `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
  return `${PRODUCTION_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
