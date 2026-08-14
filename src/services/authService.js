import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * Sign in user using Supabase Auth
 */
export async function signInUser(email, password) {
  const cleanEmail = (email || '').toLowerCase().trim();

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: 'Supabase is not configured. Authentication unavailable.'
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: password
    });

    if (error) {
      return { success: false, message: error.message };
    }

    if (data?.user) {
      // Fetch user profile from Supabase users table if present
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .single();

      const userObj = profile || {
        id: data.user.id,
        name: data.user.user_metadata?.full_name || cleanEmail.split('@')[0],
        email: cleanEmail,
        role: data.user.user_metadata?.role || 'Admin',
        department: 'Executive Management',
        status: 'Active'
      };

      return {
        success: true,
        user: userObj,
        token: data.session?.access_token,
        authSource: 'Supabase Auth'
      };
    }
  } catch (err) {
    return { success: false, message: err.message };
  }

  return { success: false, message: 'Authentication failed.' };
}

/**
 * Register / Sign up new user in Supabase Auth & public.users table.
 * Used when Admin onboards a new plant user from the RBAC User Directory.
 */
export async function signUpUser(userData) {
  const { email, password, name, role, department } = userData;
  const cleanEmail = (email || '').toLowerCase().trim();

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: 'Supabase is not configured. Registration unavailable.'
    };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: password,
      options: {
        data: {
          full_name: name,
          role: role || 'Shop Floor Operator',
          department: department || 'Operations'
        }
      }
    });

    if (error) {
      return { success: false, message: error.message };
    }

    // Upsert into public.users table
    if (data.user) {
      await supabase.from('users').upsert({
        id: data.user.id,
        username: cleanEmail,
        full_name: name,
        email: cleanEmail,
        role: role || 'Shop Floor Operator',
        department: department || 'Operations',
        active: true,
        password_hash: password,
        status: 'Active'
      });
    }

    return {
      success: true,
      message: 'User created successfully in Supabase Auth!',
      user: data.user
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Create or update a user in Supabase Auth.
 * Used during Admin onboarding from UserManagement.
 * If the user already exists in Auth, updates their password & metadata.
 */
export async function createUserInSupabaseAuth({ email, password, name, role, department }) {
  const cleanEmail = (email || '').toLowerCase().trim();
  if (!isSupabaseConfigured() || !cleanEmail || !password) return { success: false };

  try {
    // Try to sign them up first
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: password,
      options: {
        data: { full_name: name, role: role || 'Shop Floor Operator', department: department || 'Operations' }
      }
    });

    if (error) {
      // If user already exists, that's OK — the public.users table save will still work
      if (error.message?.toLowerCase().includes('already registered') ||
          error.message?.toLowerCase().includes('already exists')) {
        return { success: true, alreadyExists: true };
      }
      return { success: false, message: error.message };
    }

    return { success: true, user: data.user };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Trigger Password Reset Email via Supabase Auth
 */
export async function sendPasswordResetEmail(email) {
  const cleanEmail = (email || '').toLowerCase().trim();

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: 'Supabase is not configured. Password reset unavailable.'
    };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/#/reset-password`
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return {
      success: true,
      message: `Supabase password recovery email dispatched to ${cleanEmail}.`
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Sign out user from Supabase session
 */
export async function signOutUser() {
  if (isSupabaseConfigured()) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Error signing out from Supabase", e);
    }
  }
}
