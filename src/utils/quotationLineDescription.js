// Optional sales-quotation line note. Stored on the item JSON.
// Cylinder specifications stay on `description` and are not this field.

export function quotationLineDescription(value) {
  return String(value ?? '').trim();
}

export function applyQuotationLineDescription(item) {
  const next = { ...(item || {}) };
  const text = quotationLineDescription(next.lineDescription);
  if (text) next.lineDescription = text;
  else delete next.lineDescription;
  return next;
}
