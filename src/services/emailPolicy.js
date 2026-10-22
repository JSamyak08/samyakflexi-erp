/**
 * Who may receive FlexiERP mail.
 *
 * Automated mail (alerts, page-load checks, save side effects) may go only to
 * a parsed address whose domain is exactly samyakinternational.in.
 * Manual mail is a signed-in user clicking Send. While ALLOW_EXTERNAL_MANUAL_EMAIL
 * is not the string "true", manual mail keeps today's behaviour: anything that
 * is not an internal address is replaced with admin@samyakinternational.in
 * and is not delivered to the original recipient.
 * Reply-To is company-only in every mode. The switch does not relax it.
 */

export const COMPANY_DOMAIN = 'samyakinternational.in';
export const ADMIN_REROUTE = 'admin@samyakinternational.in';
export const EXTERNAL_MANUAL_EMAIL_ENV = 'ALLOW_EXTERNAL_MANUAL_EMAIL';

const LEGACY_INTERNAL_DOMAINS = [
  'samyakinternational.in',
  'plant.com',
  'samyak.com',
  'samyakflexi.com',
];

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

export function isCompanyAddress(parsed) {
  return Boolean(parsed) && parsed.domain === COMPANY_DOMAIN;
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
 * Historical recipient rewrite used by /api/send-email before this lock.
 * A token is kept only when the raw string ends with an internal domain and
 * does not contain vendor/customer/client/supplier. Display names are not
 * parsed. An empty result is replaced with defaultInternal (admin@ for To).
 */
export function legacyFilterInternalRecipients(emailInput, defaultInternal = ADMIN_REROUTE) {
  if (!emailInput) return defaultInternal;
  const internalDomainRegex = /@(samyakinternational\.in|plant\.com|samyak\.com|samyakflexi\.com)$/i;
  const emails = String(emailInput)
    .split(/[,;]/)
    .map(entry => entry.trim())
    .filter(Boolean);
  const internalOnly = emails.filter(entry => {
    const clean = entry.toLowerCase();
    if (clean.includes('vendor') || clean.includes('customer') || clean.includes('client') || clean.includes('supplier')) {
      return false;
    }
    return internalDomainRegex.test(clean);
  });
  return internalOnly.length > 0 ? internalOnly.join(', ') : defaultInternal;
}

function legacyDomainAllowed(domain) {
  return LEGACY_INTERNAL_DOMAINS.includes(domain);
}

/**
 * Apply the historical rewrite, then parse the result. A token the suffix
 * check lets through but that is not one clean internal mailbox (for example
 * `user@gmail.com admin@samyakinternational.in`) is not given to SMTP. To
 * falls back to admin@; Cc and Bcc fall back to empty.
 */
function manualField(input, emptyDefault) {
  const legacy = legacyFilterInternalRecipients(input, emptyDefault);
  if (!legacy) return '';
  const kept = [];
  for (const token of splitAddressList(legacy)) {
    const parsed = parseMailbox(token);
    if (parsed && legacyDomainAllowed(parsed.domain)) kept.push(parsed.address);
  }
  const unique = dedupe(kept);
  if (unique.length === 0) return emptyDefault || '';
  return unique.join(', ');
}

function passthrough(input) {
  const kept = [];
  for (const token of splitAddressList(input)) {
    const parsed = parseMailbox(token);
    if (parsed) kept.push(parsed.address);
  }
  return dedupe(kept).join(', ');
}

function companyReplyTo(replyTo) {
  const parsed = splitAddressList(replyTo).map(parseMailbox).find(isCompanyAddress);
  return parsed ? parsed.address : '';
}

export function resolveOutboundRecipients({ to, cc, bcc, replyTo, kind, env } = {}) {
  const normalizedKind = normalizeKind(kind);
  const safeReplyTo = companyReplyTo(replyTo);
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
    const toList = manualField(to, ADMIN_REROUTE);
    const ccList = cc ? manualField(cc, '') : '';
    const bccList = bcc ? manualField(bcc, '') : '';
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
