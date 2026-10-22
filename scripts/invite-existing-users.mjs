/**
 * Create Supabase Auth accounts for real FlexiERP users and email each person
 * a link to choose their own password.
 *
 * Run only after 20261019040439_auth_identity_prep.sql. Do not pass passwords
 * on the command line and do not read public.users.password_hash.
 *
 * A row that already has auth_user_id is skipped. No reset link is emailed
 * for that person. Use Forgot password, or Authentication → Users → Send
 * password recovery, for accounts that are already linked.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SMTP_USER=... SMTP_PASS=... \
 *     node scripts/invite-existing-users.mjs
 */
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { randomBytes } from 'node:crypto';
import { resolveOutboundRecipients } from '../src/services/emailPolicy.js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const origin = 'https://erp.samyakinternational.in';

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function sendMail(to, name, actionLink) {
  const resolved = resolveOutboundRecipients({ to, kind: 'automated' });
  if (resolved.blocked || !resolved.to) return false;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return false;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: `"Samyak International ERP" <${user}>`,
    to: resolved.to,
    subject: 'Set your FlexiERP password',
    text: `Hello ${name},\n\nSet your FlexiERP password with this one-time link:\n${actionLink}\n`,
  });
  return true;
}

const { data: rows, error } = await service
  .from('users')
  .select('id, email, full_name, role, status, active, auth_user_id')
  .not('id', 'like', 'USR-SETTING-%')
  .neq('role', 'System');

if (error) {
  console.error(error.message);
  process.exit(1);
}

let linked = 0;
let invited = 0;
for (const row of rows || []) {
  const email = (row.email || '').trim().toLowerCase();
  if (!email || !row.role) {
    console.log(`skip ${row.id}: no email or role`);
    continue;
  }
  if (row.auth_user_id) {
    linked += 1;
    console.log(`already linked ${email} — skipped, no reset link sent`);
    continue;
  }

  const created = await service.auth.admin.createUser({
    email,
    password: randomBytes(32).toString('base64url'),
    email_confirm: true,
    user_metadata: { full_name: row.full_name || email },
    app_metadata: { role: row.role },
  });

  let authId = created.data?.user?.id;
  if (created.error) {
    const existing = await service.auth.admin.generateLink({ type: 'recovery', email });
    authId = existing.data?.user?.id;
    if (!authId) {
      console.error(`failed ${email}: ${created.error.message}`);
      continue;
    }
  }

  const { error: updateError } = await service
    .from('users')
    .update({ auth_user_id: authId })
    .eq('id', row.id);
  if (updateError) {
    console.error(`link failed ${email}: ${updateError.message}`);
    continue;
  }

  const recovery = await service.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${origin}/reset-password` },
  });
  const actionLink = recovery.data?.properties?.action_link;
  const mailed = actionLink ? await sendMail(email, row.full_name || email, actionLink).catch(() => false) : false;
  invited += 1;
  if (mailed) {
    console.log(`invited ${email} (${row.role}) by email`);
  } else {
    console.error(`invited ${email} (${row.role}) but the setup email was not delivered`);
  }
}

console.log(`Done. Already linked: ${linked}. Newly invited: ${invited}.`);
