import { supabase, isSupabaseConfigured } from './supabaseClient';
import { isCompanyAddress, parseMailbox } from './emailPolicy';

const PROFILE_COLUMNS = 'id, full_name, email, role, department, status, active, auth_user_id';

function mapProfile(profile) {
  return {
    id: profile.id,
    name: profile.full_name || profile.email || 'User',
    email: profile.email,
    role: profile.role,
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

  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: `${window.location.origin}/reset-password`,
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

export async function signOutUser() {
  if (!isSupabaseConfigured()) return;
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.warn('Error signing out from Supabase', error);
  }
}
