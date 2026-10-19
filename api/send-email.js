import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

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

const USER_DAILY_CAP = 20;
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

function filterInternalRecipientsOnly(emailInput, defaultInternal = 'admin@samyakinternational.in') {
  if (!emailInput) return defaultInternal;
  const internalDomainRegex = /@(samyakinternational\.in|plant\.com|samyak\.com|samyakflexi\.com)$/i;

  const emails = String(emailInput)
    .split(/[,;]/)
    .map(e => e.trim())
    .filter(Boolean);

  const internalOnly = emails.filter(e => {
    const clean = e.toLowerCase();
    if (clean.includes('vendor') || clean.includes('customer') || clean.includes('client') || clean.includes('supplier')) {
      return false;
    }
    return internalDomainRegex.test(clean);
  });

  return internalOnly.length > 0 ? internalOnly.join(', ') : defaultInternal;
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

export default async function handler(req, res) {
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

    service = serviceClient();
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

    const { to, cc, subject, html, text } = req.body || {};
    const sanitizedTo = filterInternalRecipientsOnly(to, 'admin@samyakinternational.in');
    const sanitizedCc = cc ? filterInternalRecipientsOnly(cc, '') : '';
    if (!sanitizedTo || !subject) {
      return res.status(400).json({ success: false, message: 'Recipient internal email and subject are required.' });
    }

    const claim = await service.rpc('claim_email_send', {
      p_user: verified.user.id,
      p_to: sanitizedTo,
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

    const smtpUser = serverEnv('SMTP_USER');
    const smtpPass = serverEnv('SMTP_PASS');
    if (!smtpUser || !smtpPass) {
      throw new Error('SMTP is not configured.');
    }

    const port = parseInt(serverEnv('SMTP_PORT', '465'), 10);
    const transporter = nodemailer.createTransport({
      host: serverEnv('SMTP_HOST', 'smtp.hostinger.com'),
      port,
      secure: serverEnv('SMTP_SECURE', 'true') === 'true' || port === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const info = await transporter.sendMail({
      from: `"Samyak International ERP" <${smtpUser}>`,
      to: sanitizedTo,
      ...(sanitizedCc ? { cc: sanitizedCc } : {}),
      subject,
      text,
      html,
    });

    claimId = null;
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    if (service && claimId) {
      await service.rpc('release_email_send', { p_id: claimId }).catch(() => {});
    }
    console.error('Notification email error:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Failed to send email.',
    });
  }
}
