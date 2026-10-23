/**
 * Who may receive FlexiERP mail.
 *
 * The internal domain is COMPANY_EMAIL_DOMAIN (browser: VITE_COMPANY_EMAIL_DOMAIN).
 * Automated mail may go only to a parsed address on that domain. Manual mail is
 * a signed-in user clicking Send. While ALLOW_EXTERNAL_MANUAL_EMAIL is not the
 * string "true", a manual To that is not on that domain is replaced with
 * ADMIN_REROUTE and is not delivered to the original recipient. Cc and Bcc
 * outsiders are dropped. Reply-To is company-only in every mode.
 */

export const EXTERNAL_MANUAL_EMAIL_ENV = 'ALLOW_EXTERNAL_MANUAL_EMAIL';

function viteMailValue(name) {
  try {
    if (name === 'COMPANY_EMAIL_DOMAIN') return String(import.meta.env.VITE_COMPANY_EMAIL_DOMAIN || '').trim();
    if (name === 'ADMIN_REROUTE') return String(import.meta.env.VITE_ADMIN_REROUTE || '').trim();
  } catch {
    return '';
  }
  return '';
}

function configuredValue(name, env) {
  const fromEnv = env && env[name] != null ? String(env[name]).trim() : '';
  if (fromEnv) return fromEnv;
  return viteMailValue(name);
}

export function companyDomain(env = typeof process !== 'undefined' ? process.env : {}) {
  const domain = configuredValue('COMPANY_EMAIL_DOMAIN', env).toLowerCase();
  if (!domain || !domain.includes('.')) {
    const error = new Error('COMPANY_EMAIL_DOMAIN is not configured.');
    error.status = 500;
    throw error;
  }
  return domain;
}

export function adminReroute(env = typeof process !== 'undefined' ? process.env : {}) {
  const address = configuredValue('ADMIN_REROUTE', env);
  const parsed = address ? parseMailbox(address) : null;
  if (!parsed || parsed.domain !== companyDomain(env)) {
    const error = new Error('ADMIN_REROUTE must be a mailbox on COMPANY_EMAIL_DOMAIN.');
    error.status = 500;
    throw error;
  }
  return parsed.address;
}

export function normalizeKind(kind) {
  return kind === 'manual' ? 'manual' : 'automated';
}

export function externalManualDeliveryEnabled(env = process.env) {
  return String(env?.[EXTERNAL_MANUAL_EMAIL_ENV] ?? '').trim().toLowerCase() === 'true';
}

export function splitAddressList(input) {
  if (Array.isArray(input)) {
    return input.flatMap(part => splitAddressList(part));
  }
  const text = input == null ? '' : String(input);
  const tokens = [];
  let current = '';
  let quote = false;
  let angle = 0;
  for (const ch of text) {
    if (ch === '"') {
      quote = !quote;
      current += ch;
      continue;
    }
    if (!quote && ch === '<') {
      angle += 1;
      current += ch;
      continue;
    }
    if (!quote && ch === '>' && angle > 0) {
      angle -= 1;
      current += ch;
      continue;
    }
    if (!quote && angle === 0 && (ch === ',' || ch === ';' || ch === '\n' || ch === '\r')) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

/**
 * Pull the mailbox out of one header token.
 * `x@gmail.com <a@samyakinternational.in>` yields a@samyakinternational.in.
 * A token with two addresses, or with more than one angle pair, is refused
 * rather than guessed.
 */
export function parseMailbox(token) {
  const raw = String(token ?? '').trim();
  if (!raw || /[\u0000-\u001F\u007F]/.test(raw)) return null;

  const openAngles = raw.split('<').length - 1;
  const closeAngles = raw.split('>').length - 1;
  if (openAngles > 1 || closeAngles > 1) return null;

  let address;
  if (openAngles === 1) {
    const match = raw.match(/<([^<>]*)>/);
    if (!match || closeAngles !== 1) return null;
    address = match[1].trim();
  } else if (closeAngles !== 0) {
    return null;
  } else {
    const withoutComments = raw.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const quotedLocal = withoutComments.match(/^("(?:[^"\\]|\\.)+")@([^@\s]+)$/);
    if (quotedLocal) {
      address = `${quotedLocal[1]}@${quotedLocal[2]}`;
    } else {
      const matches = withoutComments.match(/[^\s,;<>"]+@[^\s,;<>"]+/g) || [];
      if (matches.length !== 1 || withoutComments !== matches[0]) return null;
      address = matches[0];
    }
  }

  address = address.replace(/^mailto:/i, '').trim();
  if (!address || /[\s,;<>]/.test(address)) return null;

  const at = address.lastIndexOf('@');
  if (at <= 0 || at === address.length - 1) return null;
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  const quotedLocal = /^"(?:[^"\\]|\\.)+"$/.test(local);
  if (!quotedLocal) {
    if (address.indexOf('@') !== at) return null;
    if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(domain)) {
    return null;
  }

  return {
    address: `${local}@${domain.toLowerCase()}`,
    domain: domain.toLowerCase(),
  };
}

export function isCompanyAddress(parsed, env) {
  return Boolean(parsed) && parsed.domain === companyDomain(env);
}

function dedupe(addresses) {
  const seen = new Set();
  const kept = [];
  for (const address of addresses) {
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(address);
  }
  return kept;
}

export function companyRecipients(input) {
  const kept = [];
  const dropped = [];
  for (const token of splitAddressList(input)) {
    const parsed = parseMailbox(token);
    if (isCompanyAddress(parsed)) kept.push(parsed.address);
    else dropped.push(token);
  }
  return { kept: dedupe(kept), dropped };
}

/**
 * Keep parsed mailboxes on samyakinternational.in. Anything else, including
 * plant.com, samyak.com, and samyakflexi.com, is removed. An empty result is
 * replaced with defaultInternal (admin@ for To, empty for Cc and Bcc).
 * The local part is not keyword-filtered: customer@samyakinternational.in
 * is an internal mailbox.
 */
export function legacyFilterInternalRecipients(emailInput, defaultInternal) {
  const fallback = defaultInternal === undefined ? adminReroute() : defaultInternal;
  return companyField(emailInput, fallback);
}

function companyField(input, emptyDefault) {
  const { kept } = companyRecipients(input);
  if (kept.length === 0) return emptyDefault || '';
  return kept.join(', ');
}

function passthrough(input) {
  const kept = [];
  for (const token of splitAddressList(input)) {
    const parsed = parseMailbox(token);
    if (parsed) kept.push(parsed.address);
  }
  return dedupe(kept).join(', ');
}

function companyReplyTo(replyTo, env) {
  const parsed = splitAddressList(replyTo).map(parseMailbox).find(item => isCompanyAddress(item, env));
  return parsed ? parsed.address : '';
}

export function resolveOutboundRecipients({ to, cc, bcc, replyTo, kind, env } = {}) {
  const normalizedKind = normalizeKind(kind);
  const safeReplyTo = companyReplyTo(replyTo, env);
  const allowExternal = normalizedKind === 'manual' && externalManualDeliveryEnabled(env);

  if (normalizedKind === 'automated') {
    const toRes = companyRecipients(to);
    const ccRes = companyRecipients(cc);
    const bccRes = companyRecipients(bcc);
    const toList = toRes.kept.join(', ');
    const ccList = ccRes.kept.join(', ');
    const bccList = bccRes.kept.join(', ');
    return {
      kind: 'automated',
      blocked: !toList && !ccList && !bccList,
      to: toList,
      cc: ccList,
      bcc: bccList,
      replyTo: safeReplyTo,
      dropped: [...toRes.dropped, ...ccRes.dropped, ...bccRes.dropped],
      externalDelivery: false,
    };
  }

  if (!allowExternal) {
    const toList = companyField(to, adminReroute(env));
    const ccList = cc ? companyField(cc, '') : '';
    const bccList = bcc ? companyField(bcc, '') : '';
    return {
      kind: 'manual',
      blocked: !toList && !ccList && !bccList,
      to: toList,
      cc: ccList,
      bcc: bccList,
      replyTo: safeReplyTo,
      dropped: [],
      externalDelivery: false,
    };
  }

  const toList = passthrough(to);
  const ccList = passthrough(cc);
  const bccList = passthrough(bcc);
  return {
    kind: 'manual',
    blocked: !toList && !ccList && !bccList,
    to: toList,
    cc: ccList,
    bcc: bccList,
    replyTo: safeReplyTo,
    dropped: [],
    externalDelivery: true,
  };
}
