/**
 * Normalise barcode, id, batch, GRN, and similar codes before trim / case folding.
 *
 * Inventory rows and scanner payloads sometimes store these as numbers (numeric
 * DB ids, scanner output). `(value || '').trim()` then throws
 * "trim is not a function" and the inventory Scan Barcode screen crashes.
 * String codes keep the previous trim + lowercase comparison.
 */

export function asCodeString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return '';
  return String(value);
}

/** Trimmed code text. Nullish and whitespace-only values become ''. */
export function codeText(value) {
  return asCodeString(value).trim();
}

/** Trimmed lowercase key used for barcode and id comparison. */
export function codeKey(value) {
  return codeText(value).toLowerCase();
}

/** First truthy candidate, same short-circuit as `a || b || c`. */
export function firstCodeValue(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return '';
}

export function codeKeyFrom(...values) {
  return codeKey(firstCodeValue(...values));
}

export function codeTextFrom(...values) {
  return codeText(firstCodeValue(...values));
}

/** String form of the first truthy value, without trim or case folding. */
export function textFrom(...values) {
  const value = firstCodeValue(...values);
  return value ? asCodeString(value) : '';
}

/** Case-sensitive prefix test. Numeric barcodes do not throw. */
export function codeStartsWith(value, prefix) {
  return textFrom(value).startsWith(asCodeString(prefix));
}

/**
 * `(record.barcodeId || record.id || '').trim().toLowerCase()`, safe for numbers.
 * A whitespace-only barcodeId stays selected (it is truthy) and trims to ''.
 */
export function barcodeIdentityKey(record) {
  if (record == null) return '';
  if (typeof record !== 'object') return codeKey(record);
  return codeKeyFrom(record.barcodeId, record.id);
}

/**
 * Compare a record's barcode identity with a scanned query.
 * @param {'exact'|'partial'|'dispatch'} mode
 * exact: full key equality
 * partial: identity contains the query (inventory fallback)
 * dispatch: equality, or either side contains the other when the query is at least 4 characters
 */
export function queryMatchesBarcodeIdentity(record, query, mode = 'exact') {
  const bId = barcodeIdentityKey(record);
  const q = codeKey(query);
  if (!bId || !q) return false;
  if (mode === 'partial') return bId.includes(q);
  if (mode === 'dispatch') {
    return bId === q || (q.length >= 4 && (bId.includes(q) || q.includes(bId)));
  }
  return bId === q;
}

/** True when both codes are non-blank and equal after trim + lowercase. */
export function codesEqual(left, right) {
  const a = codeKey(left);
  const b = codeKey(right);
  return Boolean(a) && a === b;
}

/**
 * Inventory roll lookup used by Scan Barcode:
 * exact barcode/id, then batch / invoice / GRN, then a partial barcode match.
 */
export function findInventoryRollByScan(rolls, query) {
  const q = codeKey(query);
  if (!q) return null;
  const list = Array.isArray(rolls) ? rolls : [];

  const exact = list.find((roll) => queryMatchesBarcodeIdentity(roll, q, 'exact'));
  if (exact) return exact;

  const byBatch = list.find((roll) => {
    const batchNo = codeKeyFrom(roll?.batchNo, roll?.lotNo);
    const invoiceNo = codeKey(roll?.invoiceNo);
    const grnNo = codeKeyFrom(roll?.grnNo, roll?.grn_no);
    return (batchNo && batchNo === q) || (invoiceNo && invoiceNo === q) || (grnNo && grnNo === q);
  });
  if (byBatch) return byBatch;

  if (q.length >= 4) {
    return list.find((roll) => queryMatchesBarcodeIdentity(roll, q, 'partial')) || null;
  }
  return null;
}

/** Dispatch shipment / challan line lookup. Documents are searched in order. */
export function findDispatchRollByScan(documents, query) {
  const q = codeKey(query);
  if (!q) return null;
  for (const doc of documents || []) {
    const item = (doc?.items || []).find((entry) => queryMatchesBarcodeIdentity(entry, q, 'dispatch'));
    if (item) return { item, parent: doc };
  }
  return null;
}
