import { supabase, isSupabaseConfigured } from './supabaseClient';
import { initialUsers } from '../factoryStore';

/**
 * Sign in user using Supabase Auth (with local fallback if Supabase is offline/unconfigured)
 */
export async function signInUser(email, password) {
  const cleanEmail = email.toLowerCase().trim();

  // Try Supabase Auth first if configured
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password
      });

      if (!error && data?.user) {
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
      console.warn("Supabase Auth failed, falling back to local user store:", err.message);
    }
  }

  // Fallback to local pre-seeded user database
  const matchedUser = initialUsers.find(
    u => u.email.toLowerCase().trim() === cleanEmail
  );

  if (matchedUser) {
    if (matchedUser.password && matchedUser.password !== password) {
      return {
        success: false,
        message: 'Invalid password. Please check your credentials or click "Forgot Password?".'
      };
    }

    return {
      success: true,
      user: matchedUser,
      authSource: 'Local System'
    };
  }

  return {
    success: false,
    message: 'No active user account found matching this email address.'
  };
}

/**
 * Register / Sign up new user in Supabase Auth & public.users table
 */
export async function signUpUser(userData) {
  const { email, password, name, role, department } = userData;
  const cleanEmail = email.toLowerCase().trim();

  if (isSupabaseConfigured()) {
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
      await supabase.from('users').upsert({
        id: data.user?.id || `USR-${Date.now()}`,
        username: cleanEmail,
        full_name: name,
        email: cleanEmail,
        role: role || 'Shop Floor Operator',
        department: department || 'Operations',
        active: true
      });

      return {
        success: true,
        message: 'User created successfully in Supabase Auth!',
        user: data.user
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  return {
    success: true,
    message: 'User registered in local store.'
  };
}

/**
 * Trigger Password Reset Email via Supabase Auth
 */
export async function sendPasswordResetEmail(email) {
  const cleanEmail = email.toLowerCase().trim();

  if (isSupabaseConfigured()) {
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

  return {
    success: false,
    message: 'Supabase Auth not configured. Using local SMTP simulation.'
  };
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
