import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { resolveOutboundRecipients } from '../src/services/emailPolicy.js';
import { readSmtpConfig } from './smtpConfig.js';
import { SYSTEM_ROLES as ROLES } from '../src/roles.js';

const USER_DAILY_CAP = 50;
const GLOBAL_DAILY_CAP = 60;

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

function attemptedRecipients(body) {
  return [body?.to, body?.cc, body?.bcc]
    .filter(value => value != null && String(value).trim() !== '')
    .map(value => String(value))
    .join(', ')
    .slice(0, 500);
}

async function logBlockedEmail(service, userId, body, subject, kind) {
  try {
    const logged = await service.rpc('log_blocked_email_send', {
      p_user: userId,
      p_to: attemptedRecipients(body),
      p_subject: String(subject).slice(0, 300),
      p_kind: kind,
    });
    if (logged && logged.error) {
      console.error('Failed to log blocked email:', logged.error.message || logged.error);
    }
  } catch (logError) {
    console.error('Failed to log blocked email:', logError);
  }
}

async function loadProfile(service, authId) {
  const { data } = await service
    .from('users')
    .select('id, role, status, active, auth_user_id')
    .eq('auth_user_id', authId)
    .maybeSingle();
  if (data) return data;
  const second = await service
    .from('users')
    .select('id, role, status, active, auth_user_id')
    .eq('id', authId)
    .maybeSingle();
  return second.data || null;
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  return String(Array.isArray(header) ? header[0] : header).replace(/^Bearer\s+/i, '').trim();
}

async function releaseEmailClaim(service, claimId) {
  if (!service || claimId == null || claimId === '') return;
  try {
    // rpc() returns a filter builder. It is awaitable (then) and has no catch method.
    const released = await service.rpc('release_email_send', { p_id: claimId });
    if (released && released.error) {
      console.error('Failed to release email send slot:', released.error.message || released.error);
    }
  } catch (releaseError) {
    console.error('Failed to release email send slot:', releaseError);
  }
}

function failureResponse(res, error) {
  const status = Number(error && error.status);
  const httpStatus = status >= 400 && status < 600 ? status : 500;
  const message = status >= 400 && status < 600 && error && error.message
    ? error.message
    : 'Failed to send email.';
  try {
    return res.status(httpStatus).json({ success: false, message });
  } catch (responseError) {
    console.error('Failed to write email error response:', responseError);
    return undefined;
  }
}

export async function handleSendEmail(req, res, deps = {}) {
  const openService = deps.serviceClient || serviceClient;
  const openTransport = deps.createTransport || (options => nodemailer.createTransport(options));

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  let claimId = null;
  let service = null;

  try {
    const jwt = bearerToken(req);
    if (!jwt) {
      return res.status(401).json({ success: false, message: 'Sign in before sending mail.' });
    }

    service = openService();
    const { data: verified, error: verifyError } = await service.auth.getUser(jwt);
    if (verifyError || !verified?.user) {
      return res.status(401).json({ success: false, message: 'Session expired. Sign in again.' });
    }

    const profile = await loadProfile(service, verified.user.id);
    const active = profile
      && profile.active !== false
      && (!profile.status || profile.status === 'Active')
      && ROLES.includes(profile.role);
    if (!active) {
      return res.status(403).json({ success: false, message: 'Only an active plant user can send mail.' });
    }

    const body = req.body || {};
    const subject = body.subject;
    if (!subject) {
      return res.status(400).json({ success: false, message: 'Recipient internal email and subject are required.' });
    }

    // Missing kind is automated. Manual still requires the session checked above.
    // ALLOW_EXTERNAL_MANUAL_EMAIL must be exactly "true" before a manual send
    // can leave the historical admin@ reroute. It is off unless that env is set.
    const resolved = resolveOutboundRecipients({
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      replyTo: body.replyTo,
      kind: body.kind,
      env: process.env,
    });

    if (resolved.blocked) {
      await logBlockedEmail(service, verified.user.id, body, subject, resolved.kind);
      return res.status(200).json({
        success: false,
        blocked: true,
        kind: resolved.kind,
        message: 'No allowed recipient remained, so the email was not sent.',
      });
    }

    const deliveredTo = [resolved.to, resolved.cc, resolved.bcc].filter(Boolean).join(', ');
    const claim = await service.rpc('claim_email_send', {
      p_user: verified.user.id,
      p_to: deliveredTo,
      p_subject: String(subject),
    });
    if (claim.error) {
      console.error('Email cap check failed:', claim.error.message);
      return res.status(503).json({
        success: false,
        message: 'Mail is temporarily unavailable. The send was not attempted.',
      });
    }

    const status = claim.data?.status;
    claimId = claim.data?.id || null;
    if (status === 'user') {
      claimId = null;
      return res.status(429).json({
        success: false,
        message: `You have reached the daily email limit (${USER_DAILY_CAP}). Try again tomorrow.`,
      });
    }
    if (status === 'global') {
      claimId = null;
      return res.status(429).json({
        success: false,
        message: `The plant mailbox has reached its daily email limit (${GLOBAL_DAILY_CAP}). Try again tomorrow.`,
      });
    }
    if (status !== 'ok' || !claimId) {
      claimId = null;
      return res.status(403).json({ success: false, message: 'Only an active plant user can send mail.' });
    }

    const smtp = readSmtpConfig(process.env);
    const transporter = openTransport(smtp);

    const info = await transporter.sendMail({
      from: `"Samyak International ERP" <${smtp.auth.user}>`,
      ...(resolved.to ? { to: resolved.to } : {}),
      ...(resolved.cc ? { cc: resolved.cc } : {}),
      ...(resolved.bcc ? { bcc: resolved.bcc } : {}),
      ...(resolved.replyTo ? { replyTo: resolved.replyTo } : {}),
      subject,
      text: body.text,
      html: body.html,
    });

    claimId = null;
    return res.status(200).json({
      success: true,
      messageId: info.messageId,
      deliveredTo: resolved.to,
      kind: resolved.kind,
    });
  } catch (error) {
    console.error('Notification email error:', error);
    await releaseEmailClaim(service, claimId);
    return failureResponse(res, error);
  }
}

export default function handler(req, res) {
  return handleSendEmail(req, res);
}
