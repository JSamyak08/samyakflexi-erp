import { supabase, isSupabaseConfigured } from './supabaseClient';
import { isCompanyAddress, parseMailbox } from './emailPolicy';
import { readUsername } from '../utils/activeUserLabel';
import { assignedRolesOf, primaryRole } from '../assignedRoles';
import { resolvePublicOrigin } from '../utils/canonicalOrigin';
import { isOtpType, safeNextPath } from '../utils/authLinks';

const PROFILE_COLUMNS = 'id, username, full_name, email, role, assigned_roles, department, status, active, auth_user_id';

function mapProfile(profile) {
  const username = readUsername(profile);
  const roles = assignedRolesOf({ roles: profile.assigned_roles, role: profile.role });
  return {
    id: profile.id,
    username,
    name: profile.full_name || username || profile.email || 'User',
    email: profile.email,
    role: primaryRole(roles, profile.role) || profile.role,
    roles,
    department: profile.department || '',
    status: profile.status || (profile.active === false ? 'Inactive' : 'Active'),
  };
}

function isInactive(profile) {
  if (!profile) return false;
  if (profile.active === false) return true;
  return Boolean(profile.status && profile.status !== 'Active');
}

/**
 * Load the signed-in person's directory row.
 * Role comes only from public.users, never from user metadata.
 */
export async function fetchSessionProfile() {
  if (!isSupabaseConfigured()) return null;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.user) return null;

  const authUser = sessionData.session.user;
  const { data: byAuth } = await supabase
    .from('users')
    .select(PROFILE_COLUMNS)
    .eq('auth_user_id', authUser.id)
    .maybeSingle();

  let profile = byAuth;
  if (!profile) {
    const { data: byId } = await supabase
      .from('users')
      .select(PROFILE_COLUMNS)
      .eq('id', authUser.id)
      .maybeSingle();
    profile = byId;
  }

  if (!profile) {
    return { pending: true, email: authUser.email || '' };
  }
  if (isInactive(profile)) {
    return { inactive: true, email: profile.email || authUser.email || '' };
  }
  if (!profile.role) {
    return { pending: true, email: profile.email || authUser.email || '' };
  }

  return mapProfile(profile);
}

export async function signInUser(email, password) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const inputPassword = password || '';

  if (!cleanEmail || !inputPassword.trim()) {
    return { success: false, message: 'Please enter both your work email and password.' };
  }
  if (cleanEmail.includes('<') || cleanEmail.includes('>') || cleanEmail.includes('"')) {
    return { success: false, message: 'Invalid characters detected in email address.' };
  }
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase is not configured. Sign-in is unavailable.' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password: inputPassword,
  });

  if (error || !data?.user) {
    return { success: false, message: 'Invalid work email or password. Access denied.' };
  }

  const profile = await fetchSessionProfile();
  if (!profile || profile.pending) {
    await supabase.auth.signOut().catch(() => {});
    return {
      success: false,
      message: 'Your account is waiting for an administrator to assign a role.',
    };
  }
  if (profile.inactive) {
    await supabase.auth.signOut().catch(() => {});
    return {
      success: false,
      message: 'Your account has been deactivated. Please contact the Plant Administrator.',
    };
  }

  return {
    success: true,
    user: profile,
    token: data.session?.access_token,
    authSource: 'Supabase Auth',
  };
}

export async function sendPasswordResetEmail(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  // Forgot-password is not a signed-in Send click. Supabase Auth would mail
  // whatever address is typed, so non-company addresses never reach that API.
  if (!isCompanyAddress(parseMailbox(cleanEmail))) {
    return {
      success: true,
      suppressed: true,
      message: `If ${cleanEmail} is a registered account, a password setup link is on its way.`,
    };
  }
  if (!isSupabaseConfigured()) {
    return { success: false, message: 'Supabase is not configured. Password reset unavailable.' };
  }

  const origin = resolvePublicOrigin({
    configured: import.meta.env.VITE_PUBLIC_SITE_URL || import.meta.env.VITE_APP_ORIGIN || '',
    locationOrigin: typeof window !== 'undefined' ? window.location.origin : '',
  });

  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: `${origin}/auth/confirm`,
  });

  if (error) return { success: false, message: error.message };
  return {
    success: true,
    message: `If ${cleanEmail} is a registered account, a password setup link is on its way.`,
  };
}

export async function updateOwnPassword(newPassword) {
  if (!newPassword || newPassword.length < 8) {
    return { success: false, message: 'Use at least 8 characters.' };
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { success: false, message: error.message };
  return { success: true };
}

const RECOVERY_OTP = new Set(['recovery', 'invite']);
let redirectTask = null;
let redirectKey = '';

function callbackLocation(loc) {
  if (loc && loc.href) return new URL(loc.href);
  if (typeof window === 'undefined') return null;
  return new URL(window.location.href);
}

function stripAuthParams(nextPath) {
  if (typeof window === 'undefined') return;
  const path = safeNextPath(nextPath, '/login');
  window.history.replaceState({ tab: path === '/reset-password' ? 'login' : 'login' }, '', path);
}

/**
 * Finish a password, invite, or confirm link inside the ERP.
 * token_hash is verified here. A PKCE code is exchanged when the client
 * has not already consumed it. The supabase.co host is never opened.
 */
export async function completeAuthRedirect(loc) {
  const url = callbackLocation(loc);
  if (!url || !isSupabaseConfigured()) return { status: 'none' };
  const key = `${url.pathname}${url.search}${url.hash}`;
  if (redirectTask && redirectKey === key) return redirectTask;
  redirectKey = key;
  redirectTask = runAuthRedirect(url).catch((error) => {
    redirectTask = null;
    return { status: 'error', message: error?.message || 'This link is invalid or has expired. Request a new one.' };
  });
  return redirectTask;
}

async function runAuthRedirect(url) {
  const hashParams = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
  const tokenHash = url.searchParams.get('token_hash') || hashParams.get('token_hash') || '';
  const type = url.searchParams.get('type') || hashParams.get('type') || '';
  const code = url.searchParams.get('code') || '';
  const next = safeNextPath(url.searchParams.get('next') || '', type === 'recovery' || type === 'invite' ? '/reset-password' : '/');

  if (tokenHash) {
    if (!isOtpType(type)) {
      return { status: 'error', message: 'This sign-in link is not recognized. Request a new one.' };
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      return { status: 'error', message: 'This link is invalid or has expired. Request a new one.' };
    }
    if (RECOVERY_OTP.has(type)) {
      stripAuthParams('/reset-password');
      return { status: 'recovery' };
    }
    stripAuthParams(next === '/reset-password' ? '/' : next);
    return { status: 'signed-in' };
  }

  if (code) {
    const existing = await supabase.auth.getSession();
    if (!existing.data?.session) {
      const exchanged = await supabase.auth.exchangeCodeForSession(code);
      if (exchanged.error) {
        const again = await supabase.auth.getSession();
        if (!again.data?.session) {
          return { status: 'error', message: 'This link is invalid or has expired. Request a new one.' };
        }
      }
    }
    const recovery = type === 'recovery' || url.pathname === '/reset-password';
    stripAuthParams(recovery ? '/reset-password' : (next === '/reset-password' ? '/' : next));
    return { status: recovery ? 'recovery' : 'signed-in' };
  }

  if (type === 'recovery' || String(url.hash || '').includes('type=recovery')) {
    return { status: 'recovery' };
  }
  return { status: 'none' };
}

export async function signOutUser() {
  if (!isSupabaseConfigured()) return;
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.warn('Error signing out from Supabase', error);
  }
}
