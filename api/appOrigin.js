import { PRODUCTION_ORIGIN, isDisallowedAuthHost } from '../src/utils/canonicalOrigin.js';

function originError(message) {
  const error = new Error(message);
  error.status = 500;
  return error;
}

/**
 * Public origin for password links. The request body is never consulted.
 * A missing value, or a vercel.app / supabase.co host, uses the production ERP.
 */
export function resolveAppOrigin(env = process.env) {
  const raw = String((env || {}).PUBLIC_SITE_URL || (env || {}).APP_ORIGIN || '').trim();
  if (!raw) return PRODUCTION_ORIGIN;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw originError('APP_ORIGIN must be an absolute http or https origin.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw originError('APP_ORIGIN must be an absolute http or https origin.');
  }
  if (url.username || url.password) {
    throw originError('APP_ORIGIN must not include credentials.');
  }
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw originError('APP_ORIGIN must be an origin only, without a path, query, or hash.');
  }
  if (isDisallowedAuthHost(url.hostname)) return PRODUCTION_ORIGIN;
  return url.origin;
}
