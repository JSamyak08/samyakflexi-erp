import { resolvePublicOrigin } from './canonicalOrigin.js';

const OTP_TYPES = new Set(['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']);

export function isOtpType(type) {
  return OTP_TYPES.has(String(type || ''));
}

/** Relative in-app path only. Blocks protocol-relative and absolute URLs. */
export function safeNextPath(next, fallback = '/') {
  const value = String(next || '').trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('://')) {
    return fallback;
  }
  return value;
}

/**
 * In-app confirm link. The host is the public ERP origin, never supabase.co.
 */
export function authConfirmUrl(origin, { tokenHash, type, next } = {}) {
  const base = resolvePublicOrigin({ configured: origin });
  const url = new URL('/auth/confirm', base);
  url.searchParams.set('token_hash', String(tokenHash || ''));
  url.searchParams.set('type', String(type || 'recovery'));
  if (next) url.searchParams.set('next', safeNextPath(next, ''));
  return url.toString();
}

export function passwordRedirectUrl(origin) {
  return `${resolvePublicOrigin({ configured: origin })}/auth/confirm`;
}
