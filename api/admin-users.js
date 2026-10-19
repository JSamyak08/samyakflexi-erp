import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { randomBytes } from 'node:crypto';

const ROLES = [
  'Admin',
  'Plant Manager',
  'HR & Payroll Manager',
  'Production Manager',
  'Store Manager',
  'QC Chemist',
  'Purchase Manager',
  'Sales Manager',
  'Printing Operator',
  'Shop Floor Operator',
];

const PROFILE_COLUMNS = 'id, full_name, email, role, department, status, active, auth_user_id';

function serverEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

function serviceClient() {
  const url = serverEnv('SUPABASE_URL', serverEnv('VITE_SUPABASE_URL'));
  const key = serverEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    const error = new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server.');
    error.status = 500;
    throw error;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function safeOrigin(req, body) {
  const candidates = [
    body?.origin,
    req.headers.origin,
    process.env.APP_ORIGIN,
    'https://erp.samyakinternational.in',
  ];
  for (const value of candidates) {
    if (!value) continue;
    try {
      const url = new URL(value);
      const host = url.hostname;
      const allowed = host === 'erp.samyakinternational.in'
        || host === 'localhost'
        || host === '127.0.0.1'
        || host.endsWith('.vercel.app');
      if (allowed) return url.origin;
    } catch {
      // Ignore malformed origins.
    }
  }
  return 'https://erp.samyakinternational.in';
}

async function loadProfileByAuthId(service, authId) {
  const { data } = await service
    .from('users')
    .select(PROFILE_COLUMNS)
    .eq('auth_user_id', authId)
    .maybeSingle();
  if (data) return data;
  const second = await service
    .from('users')
    .select(PROFILE_COLUMNS)
    .eq('id', authId)
    .maybeSingle();
  return second.data || null;
}

function assertRole(role) {
  if (!ROLES.includes(role)) {
    const error = new Error('Choose one of the ten plant roles.');
    error.status = 400;
    throw error;
  }
}

function assertEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('A valid work email is required.');
    error.status = 400;
    throw error;
  }
}

async function findAuthUserId(service, email) {
  const link = await service.auth.admin.generateLink({ type: 'recovery', email });
  if (link?.data?.user?.id) return link.data.user.id;
  return null;
}

async function sendSetupMail(to, name, actionLink) {
  const user = serverEnv('SMTP_USER');
  const pass = serverEnv('SMTP_PASS');
  if (!user || !pass || !actionLink) return false;

  const port = parseInt(serverEnv('SMTP_PORT', '465'), 10);
  const transporter = nodemailer.createTransport({
    host: serverEnv('SMTP_HOST', 'smtp.hostinger.com'),
    port,
    secure: serverEnv('SMTP_SECURE', 'true') === 'true' || port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"Samyak International ERP" <${user}>`,
    to,
    subject: 'Set your FlexiERP password',
    text: `Hello ${name || 'there'},\n\nAn administrator created or reset your FlexiERP account. Set your password here:\n${actionLink}\n\nIf you were not expecting this, contact the plant administrator.`,
    html: `<p>Hello ${name || 'there'},</p><p>An administrator created or reset your FlexiERP account. The password is not stored in the ERP.</p><p><a href="${actionLink}">Set your password</a></p>`,
  });
  return true;
}

async function issueRecovery(service, req, body, email, name) {
  const redirectTo = `${safeOrigin(req, body)}/reset-password`;
  const { data, error } = await service.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });
  if (error) {
    const failure = new Error(error.message);
    failure.status = 400;
    throw failure;
  }
  const actionLink = data?.properties?.action_link || '';
  const emailed = await sendSetupMail(email, name, actionLink).catch(() => false);
  return { emailed, actionLink: emailed ? undefined : actionLink };
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.full_name || row.email,
    email: row.email,
    role: row.role,
    department: row.department || '',
    status: row.status || (row.active === false ? 'Inactive' : 'Active'),
  };
}

async function createAccount(service, req, res, body) {
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const role = body.role;
  const status = body.status === 'Inactive' ? 'Inactive' : 'Active';
  assertEmail(email);
  assertRole(role);
  if (!name) {
    return res.status(400).json({ success: false, message: 'Name is required.' });
  }

  const created = await service.auth.admin.createUser({
    email,
    password: randomBytes(32).toString('base64url'),
    email_confirm: true,
    user_metadata: { full_name: name },
    app_metadata: { role },
  });

  let authId = created.data?.user?.id || null;
  if (created.error) {
    if (!/already/i.test(created.error.message || '')) {
      return res.status(400).json({ success: false, message: created.error.message });
    }
    authId = await findAuthUserId(service, email);
  }
  if (!authId) {
    return res.status(400).json({ success: false, message: 'Could not create the auth account.' });
  }

  await service.auth.admin.updateUserById(authId, {
    app_metadata: { role },
    user_metadata: { full_name: name },
  });

  const profile = {
    full_name: name,
    email,
    username: email,
    role,
    department: body.department || null,
    status,
    active: status === 'Active',
    auth_user_id: authId,
  };

  const { data: existing } = await service
    .from('users')
    .select('id')
    .ilike('email', email)
    .not('id', 'like', 'USR-SETTING-%');

  let id = existing?.[0]?.id;
  if (id) {
    const { error } = await service.from('users').update(profile).eq('id', id);
    if (error) return res.status(400).json({ success: false, message: error.message });
  } else {
    const { data: linked } = await service
      .from('users')
      .select('id')
      .eq('auth_user_id', authId)
      .maybeSingle();
    id = linked?.id || authId;
    const write = linked
      ? service.from('users').update(profile).eq('id', id)
      : service.from('users').insert({ id, ...profile });
    const { error } = await write;
    if (error) return res.status(400).json({ success: false, message: error.message });
  }

  const mail = await issueRecovery(service, req, body, email, name);
  return res.status(200).json({
    success: true,
    user: publicUser({ id, ...profile }),
    emailed: mail.emailed,
    actionLink: mail.actionLink,
    message: mail.emailed
      ? `Password setup email sent to ${email}.`
      : 'Account created. Email could not be sent, so share the setup link with the user.',
  });
}

async function updateAccount(service, res, body, caller) {
  const id = String(body.id || '');
  const role = body.role;
  const status = body.status === 'Inactive' ? 'Inactive' : 'Active';
  assertRole(role);
  if (!id || id.startsWith('USR-SETTING-')) {
    return res.status(400).json({ success: false, message: 'That account cannot be edited here.' });
  }
  if (caller.id === id && (role !== 'Admin' || status !== 'Active')) {
    return res.status(400).json({ success: false, message: 'You cannot remove your own Admin access.' });
  }

  const { data: current, error: readError } = await service
    .from('users')
    .select(PROFILE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (readError || !current) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const email = String(body.email || current.email || '').trim().toLowerCase();
  assertEmail(email);
  const profile = {
    full_name: String(body.name || current.full_name || '').trim(),
    email,
    username: email,
    role,
    department: body.department || null,
    status,
    active: status === 'Active',
  };
  const { error } = await service.from('users').update(profile).eq('id', id);
  if (error) return res.status(400).json({ success: false, message: error.message });

  if (current.auth_user_id) {
    await service.auth.admin.updateUserById(current.auth_user_id, {
      email,
      app_metadata: { role },
      user_metadata: { full_name: profile.full_name },
    });
  }

  return res.status(200).json({
    success: true,
    user: publicUser({ id, auth_user_id: current.auth_user_id, ...profile }),
    message: 'User updated.',
  });
}

async function deleteAccount(service, res, body, caller) {
  const id = String(body.id || '');
  if (!id || id.startsWith('USR-SETTING-')) {
    return res.status(400).json({ success: false, message: 'That account cannot be deleted here.' });
  }
  if (caller.id === id) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own Admin account.' });
  }
  const { data: current } = await service
    .from('users')
    .select('id, auth_user_id')
    .eq('id', id)
    .maybeSingle();
  if (!current) return res.status(404).json({ success: false, message: 'User not found.' });
  if (current.auth_user_id) {
    await service.auth.admin.deleteUser(current.auth_user_id);
  }
  const { error } = await service.from('users').delete().eq('id', id);
  if (error) return res.status(400).json({ success: false, message: error.message });
  return res.status(200).json({ success: true, message: 'User deleted.' });
}

async function sendReset(service, req, res, body) {
  const email = String(body.email || '').trim().toLowerCase();
  assertEmail(email);
  const mail = await issueRecovery(service, req, body, email, body.name || email);
  return res.status(200).json({
    success: true,
    emailed: mail.emailed,
    actionLink: mail.actionLink,
    message: mail.emailed
      ? `Password setup email sent to ${email}.`
      : 'Email could not be sent. Share the setup link with the user.',
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  try {
    const header = req.headers.authorization || '';
    const jwt = String(header).replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return res.status(401).json({ success: false, message: 'Sign in as an Admin before managing users.' });
    }

    const service = serviceClient();
    const { data: verified, error: verifyError } = await service.auth.getUser(jwt);
    if (verifyError || !verified?.user) {
      return res.status(401).json({ success: false, message: 'Session expired. Sign in again.' });
    }

    const caller = await loadProfileByAuthId(service, verified.user.id);
    const callerActive = caller && caller.active !== false && (!caller.status || caller.status === 'Active');
    if (!callerActive || caller.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Only an Admin can manage user accounts.' });
    }

    const body = req.body || {};
    if (body.action === 'create') return await createAccount(service, req, res, body);
    if (body.action === 'update') return await updateAccount(service, res, body, caller);
    if (body.action === 'delete') return await deleteAccount(service, res, body, caller);
    if (body.action === 'send_reset') return await sendReset(service, req, res, body);
    return res.status(400).json({ success: false, message: 'Unknown action.' });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'User administration failed.',
    });
  }
}
