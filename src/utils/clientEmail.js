/**
 * Blank is allowed. A filled value needs a local part, an @, and a domain with a dot.
 * This is the check on the client directory form, not a full RFC parser.
 */
export function isOptionalClientEmail(value) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

export function clientEmailForSave(value) {
  const text = String(value ?? '').trim();
  return text || null;
}
