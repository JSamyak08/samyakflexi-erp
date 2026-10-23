import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { randomBytes } from 'node:crypto';
import { resolveOutboundRecipients } from '../src/services/emailPolicy.js';
import { readUsername } from '../src/utils/activeUserLabel.js';
import { resolveAppOrigin } from './appOrigin.js';
import { readSmtpConfig } from './smtpConfig.js';

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

const PROFILE_COLUMNS = 'id, username, full_name, email, role, department, status, active, auth_user_id';

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

function safeOrigin() {
  return resolveAppOrigin(process.env);
}

const SECRET_RESPONSE_KEY = /action_?link|hashed_?token|verification_?token|recovery_?token|email_otp|confirmation_url|redirect_to|^properties$/i;

export function publicAdminPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.map(item => publicAdminPayload(item));
  const clean = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SECRET_RESPONSE_KEY.test(key)) continue;
    if (typeof value === 'string' && /https?:\/\//i.test(value) && /(token|verify|recover|type=)/i.test(value)) {
      continue;
    }
    clean[key] = value && typeof value === 'object' ? publicAdminPayload(value) : value;
  }
  return clean;
}

function reply(res, status, payload) {
  return res.status(status).json(publicAdminPayload(payload));
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

const ACCOUNT_MAIL_SUBJECT = 'Set your FlexiERP password';

export async function deliverAccountEmail({
  to,
  name,
  actionLink,
  kind = 'automated',
  env = process.env,
  createTransport,
} = {}) {
  const resolved = resolveOutboundRecipients({ to, kind, env });
  if (!actionLink) {
    return { emailed: false, blocked: false, resolved };
  }
  if (resolved.blocked || !resolved.to) {
    return { emailed: false, blocked: true, resolved };
  }

  const smtp = readSmtpConfig(env);
  const openTransport = createTransport || (options => nodemailer.createTransport(options));
  const transporter = openTransport(smtp);

  await transporter.sendMail({
    from: `"Samyak International ERP" <${smtp.auth.user}>`,
    to: resolved.to,
    ...(resolved.cc ? { cc: resolved.cc } : {}),
    ...(resolved.bcc ? { bcc: resolved.bcc } : {}),
    ...(resolved.replyTo ? { replyTo: resolved.replyTo } : {}),
    subject: ACCOUNT_MAIL_SUBJECT,
    text: `Hello ${name || 'there'},\n\nAn administrator created or reset your FlexiERP account. Set your password here:\n${actionLink}\n\nIf you were not expecting this, contact the plant administrator.`,
    html: `<p>Hello ${name || 'there'},</p><p>An administrator created or reset your FlexiERP account. The password is not stored in the ERP.</p><p><a href="${actionLink}">Set your password</a></p>`,
  });
  return { emailed: true, blocked: false, resolved };
}

async function sendSetupMail(to, name, actionLink, options = {}) {
  const result = await deliverAccountEmail({
    to,
    name,
    actionLink,
    kind: options.kind,
    createTransport: options.createTransport,
  });
  if (!result.emailed) {
    console.error('Account email was not delivered', {
      to: String(to || '').slice(0, 200),
      kind: result.resolved?.kind || options.kind || 'automated',
      blocked: Boolean(result.blocked),
    });
    if (options.service && options.authUserId) {
      try {
        const logged = await options.service.rpc('log_blocked_email_send', {
          p_user: options.authUserId,
          p_to: String(to || '').slice(0, 500),
          p_subject: ACCOUNT_MAIL_SUBJECT,
          p_kind: result.resolved?.kind || options.kind || 'automated',
        });
        if (logged && logged.error) {
          console.error('Failed to log undelivered account email');
        }
      } catch {
        console.error('Failed to log undelivered account email');
      }
    }
  }
  return result;
}

async function issueRecovery(service, email, name, options = {}) {
  const redirectTo = `${safeOrigin()}/reset-password`;
  const { data, error } = await service.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });
  if (error) {
    console.error('Account email was not delivered', {
      to: String(email || '').slice(0, 200),
      kind: options.kind || 'automated',
      blocked: false,
    });
    const failure = new Error('Could not prepare the password email.');
    failure.status = 400;
    throw failure;
  }
  const actionLink = data?.properties?.action_link || '';
  const delivery = await sendSetupMail(email, name, actionLink, {
    kind: options.kind,
    service,
    authUserId: options.authUserId,
    createTransport: options.createTransport,
  }).catch((error) => {
    if (error && error.status) throw error;
    return null;
  });
  const emailed = Boolean(delivery && delivery.emailed);
  return {
    emailed,
    emailStatus: emailed ? 'sent' : 'not_delivered',
    deliveredTo: emailed ? (delivery?.resolved?.to || '') : '',
  };
}

function publicUser(row) {
  return {
    id: row.id,
    username: readUsername(row),
    name: row.full_name || row.email,
    email: row.email,
    role: row.role,
    department: row.department || '',
    status: row.status || (row.active === false ? 'Inactive' : 'Active'),
  };
}

async function createAccount(service, res, body, callerAuthId, deps = {}) {
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const role = body.role;
  const status = body.status === 'Inactive' ? 'Inactive' : 'Active';
  assertEmail(email);
  assertRole(role);
  if (!name) {
    return reply(res, 400, { success: false, message: 'Name is required.' });
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
      return reply(res, 400, { success: false, message: 'Could not create the auth account.' });
    }
    authId = await findAuthUserId(service, email);
  }
  if (!authId) {
    return reply(res, 400, { success: false, message: 'Could not create the auth account.' });
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
    if (error) return reply(res, 400, { success: false, message: 'Could not save the user profile.' });
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
    if (error) return reply(res, 400, { success: false, message: 'Could not save the user profile.' });
  }

  const user = publicUser({ id, ...profile });
  let mail;
  try {
    mail = await issueRecovery(service, email, name, {
      kind: 'automated',
      authUserId: callerAuthId,
      createTransport: deps.createTransport,
    });
  } catch (error) {
    if (error && error.status) {
      return reply(res, error.status, {
        success: false,
        emailStatus: 'not_delivered',
        user,
        message: `Account created, but the setup email was not sent. ${error.message}`,
      });
    }
    throw error;
  }
  if (!mail.emailed) {
    return reply(res, 200, {
      success: false,
      emailStatus: 'not_delivered',
      user,
      message: 'Account created, but the setup email could not be delivered.',
    });
  }
  return reply(res, 200, {
    success: true,
    emailed: true,
    emailStatus: 'sent',
    user,
    message: `Password setup email sent to ${mail.deliveredTo}.`,
  });
}

async function updateAccount(service, res, body, caller) {
  const id = String(body.id || '');
  const role = body.role;
  const status = body.status === 'Inactive' ? 'Inactive' : 'Active';
  assertRole(role);
  if (!id || id.startsWith('USR-SETTING-')) {
    return reply(res, 400, { success: false, message: 'That account cannot be edited here.' });
  }
  if (caller.id === id && (role !== 'Admin' || status !== 'Active')) {
    return reply(res, 400, { success: false, message: 'You cannot remove your own Admin access.' });
  }

  const { data: current, error: readError } = await service
    .from('users')
    .select(PROFILE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (readError || !current) {
    return reply(res, 404, { success: false, message: 'User not found.' });
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
  if (error) return reply(res, 400, { success: false, message: 'Could not save the user profile.' });

  if (current.auth_user_id) {
    await service.auth.admin.updateUserById(current.auth_user_id, {
      email,
      app_metadata: { role },
      user_metadata: { full_name: profile.full_name },
    });
  }

  return reply(res, 200, {
    success: true,
    user: publicUser({ id, auth_user_id: current.auth_user_id, ...profile }),
    message: 'User updated.',
  });
}

async function deleteAccount(service, res, body, caller) {
  const id = String(body.id || '');
  if (!id || id.startsWith('USR-SETTING-')) {
    return reply(res, 400, { success: false, message: 'That account cannot be deleted here.' });
  }
  if (caller.id === id) {
    return reply(res, 400, { success: false, message: 'You cannot delete your own Admin account.' });
  }
  const { data: current } = await service
    .from('users')
    .select('id, auth_user_id')
    .eq('id', id)
    .maybeSingle();
  if (!current) return reply(res, 404, { success: false, message: 'User not found.' });
  if (current.auth_user_id) {
    await service.auth.admin.deleteUser(current.auth_user_id);
  }
  const { error } = await service.from('users').delete().eq('id', id);
  if (error) return reply(res, 400, { success: false, message: 'Could not delete the user profile.' });
  return reply(res, 200, { success: true, message: 'User deleted.' });
}

async function sendReset(service, res, body, callerAuthId, deps = {}) {
  const email = String(body.email || '').trim().toLowerCase();
  assertEmail(email);
  const mail = await issueRecovery(service, email, body.name || email, {
    kind: 'manual',
    authUserId: callerAuthId,
    createTransport: deps.createTransport,
  });
  if (!mail.emailed) {
    return reply(res, 200, {
      success: false,
      emailStatus: 'not_delivered',
      message: 'The password email could not be delivered.',
    });
  }
  return reply(res, 200, {
    success: true,
    emailed: true,
    emailStatus: 'sent',
    message: `Password setup email sent to ${mail.deliveredTo}.`,
  });
}

export async function handleAdminUsers(req, res, deps = {}) {
  if (req.method !== 'POST') {
    return reply(res, 405, { success: false, message: 'Method not allowed. Use POST.' });
  }

  try {
    const header = req.headers.authorization || '';
    const jwt = String(header).replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return reply(res, 401, { success: false, message: 'Sign in as an Admin before managing users.' });
    }

    const openService = deps.serviceClient || serviceClient;
    const service = openService();
    const { data: verified, error: verifyError } = await service.auth.getUser(jwt);
    if (verifyError || !verified?.user) {
      return reply(res, 401, { success: false, message: 'Session expired. Sign in again.' });
    }

    // The bearer token is validated with Supabase above. The caller's role is
    // the public.users row for that auth id, read with the service role.
    // body.role is only the target account's role. JWT app_metadata,
    // user_metadata, and any caller role in the body are ignored.
    const caller = await loadProfileByAuthId(service, verified.user.id);
    const callerActive = caller && caller.active !== false && (!caller.status || caller.status === 'Active');
    if (!callerActive || caller.role !== 'Admin') {
      return reply(res, 403, { success: false, message: 'Only an Admin can manage user accounts.' });
    }

    const body = { ...(req.body || {}) };
    delete body.callerRole;
    delete body.caller_role;
    delete body.isAdmin;
    delete body.is_admin;
    if (body.action === 'create') return await createAccount(service, res, body, verified.user.id, deps);
    if (body.action === 'update') return await updateAccount(service, res, body, caller);
    if (body.action === 'delete') return await deleteAccount(service, res, body, caller);
    if (body.action === 'send_reset') return await sendReset(service, res, body, verified.user.id, deps);
    return reply(res, 400, { success: false, message: 'Unknown action.' });
  } catch (error) {
    const raw = String(error?.message || '');
    const safe = error?.status && !/https?:\/\/|token|action_link|hashed_token/i.test(raw)
      ? raw
      : 'User administration failed.';
    return reply(res, error.status || 500, {
      success: false,
      message: safe,
    });
  }
}

export default function handler(req, res) {
  return handleAdminUsers(req, res);
}
