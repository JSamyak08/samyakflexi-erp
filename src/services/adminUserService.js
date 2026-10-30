import { supabase } from './supabaseClient';

async function postAdmin(body) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    return { success: false, message: 'Your session has expired. Sign in again.' };
  }

  const response = await fetch('/api/admin-users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...body, origin: window.location.origin }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    return {
      success: false,
      message: payload?.message || 'User administration failed.',
    };
  }
  return payload;
}

export function createDirectoryUser(user) {
  return postAdmin({
    action: 'create',
    email: user.email,
    name: user.name,
    role: user.role,
    roles: user.roles,
    department: user.department,
    status: user.status || 'Active',
  });
}

export function updateDirectoryUser(user) {
  return postAdmin({
    action: 'update',
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    roles: user.roles,
    department: user.department,
    status: user.status || 'Active',
  });
}

export function deleteDirectoryUser(id) {
  return postAdmin({ action: 'delete', id });
}

export function sendDirectoryPasswordReset(email) {
  return postAdmin({ action: 'send_reset', email });
}
