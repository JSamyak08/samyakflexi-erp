const REQUIRED_SMTP = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS'];

function configError(message) {
  const error = new Error(message);
  error.status = 500;
  return error;
}

/**
 * SMTP settings are required. Port 465 does not imply TLS, and certificates are verified.
 */
export function readSmtpConfig(env = process.env) {
  const source = env || {};
  const host = String(source.SMTP_HOST || '').trim();
  const portRaw = String(source.SMTP_PORT ?? '').trim();
  const secureRaw = String(source.SMTP_SECURE ?? '').trim();
  const user = String(source.SMTP_USER || '').trim();
  const pass = source.SMTP_PASS == null ? '' : String(source.SMTP_PASS);
  const port = Number(portRaw);
  const missing = [];
  if (!host) missing.push('SMTP_HOST');
  if (!portRaw || !Number.isFinite(port) || port <= 0) missing.push('SMTP_PORT');
  if (secureRaw !== 'true' && secureRaw !== 'false') missing.push('SMTP_SECURE');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (missing.length) {
    throw configError(`SMTP is not configured. Set ${missing.join(', ')}.`);
  }
  return {
    host,
    port,
    secure: secureRaw === 'true',
    auth: { user, pass },
  };
}

export { REQUIRED_SMTP };
