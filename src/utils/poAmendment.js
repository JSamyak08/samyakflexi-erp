/**
 * Purchase-order amendments.
 *
 * Rev 00 is the original issue. Each amend keeps that PO number and stores
 * the previous revision as a snapshot, the same way a sales quotation copies
 * its lines into the next revision. A row that has never been amended has no
 * revision columns set and is treated as Rev 00.
 */

const QTY_EPSILON = 0.0001;

export function formatAmendmentLabel(revisionNo) {
  const n = Number(revisionNo);
  const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return `Rev ${String(safe).padStart(2, '0')}`;
}

export function revisionNumber(po) {
  if (!po) return 0;
  const raw = po.revisionNo ?? po.revision_no;
  if (raw !== null && raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  const label = String(po.amendmentNo ?? po.amendment_no ?? '').trim();
  const match = label.match(/(\d+)\s*$/);
  if (match) return Number(match[1]);
  return 0;
}

export function displayAmendmentLabel(po) {
  return formatAmendmentLabel(revisionNumber(po));
}

export function nextRevisionNumber(po) {
  return revisionNumber(po) + 1;
}

function hasExplicitRevision(po) {
  if (!po) return false;
  return po.revisionNo != null
    || po.revision_no != null
    || Boolean(po.amendmentNo)
    || Boolean(po.amendment_no)
    || Boolean(po.amendedAt)
    || Boolean(po.amended_at)
    || Boolean(po.amendedBy)
    || Boolean(po.amended_by)
    || po.amendmentReason != null
    || po.amendment_reason != null;
}

/** Null fields mean "never amended". Callers must not invent Rev 00 in the database. */
export function revisionFieldsForStorage(po) {
  if (!hasExplicitRevision(po)) {
    return {
      revisionNo: null,
      amendmentNo: null,
      amendedAt: null,
      amendedBy: null,
      amendmentReason: null,
    };
  }
  const revisionNo = revisionNumber(po);
  return {
    revisionNo,
    amendmentNo: formatAmendmentLabel(revisionNo),
    amendedAt: po.amendedAt || po.amended_at || null,
    amendedBy: po.amendedBy || po.amended_by || null,
    amendmentReason: po.amendmentReason ?? po.amendment_reason ?? null,
  };
}

export function amendmentActorName(user) {
  return user?.name || user?.fullName || user?.email || 'Procurement Desk';
}

export function purchaseOrderRevisionId(poNumber, revisionNo) {
  return `po-rev:${String(poNumber || '').trim()}:${String(revisionNumber({ revisionNo })).padStart(2, '0')}`;
}

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function lineQty(items) {
  return (items || []).reduce((sum, item) => sum + (Number(item?.qtyKg ?? item?.qty ?? item?.quantity) || 0), 0);
}

function poNumberOf(po) {
  return String(po?.poNumber || po?.po_number || '').trim();
}

function isCancelled(po) {
  const status = norm(po?.status);
  const delivery = norm(po?.deliveryStatus || po?.delivery_status);
  return status === 'cancelled' || delivery === 'cancelled';
}

function isFullyReceived(po, receivedQty, orderedQty) {
  const status = norm(po?.status);
  const delivery = norm(po?.deliveryStatus || po?.delivery_status);
  if (delivery === 'fully received' || status === 'fully received' || status === 'received') return true;
  return orderedQty > QTY_EPSILON && receivedQty + QTY_EPSILON >= orderedQty && receivedQty > QTY_EPSILON;
}

export function grnsForPurchaseOrder(grns, poNumber) {
  const target = norm(poNumber);
  if (!target) return [];
  return (grns || []).filter((grn) => norm(grn?.poNumber || grn?.po_number) === target);
}

/**
 * Receipts stay on the PO number. Line weights are taken from line items when
 * the GRN has them, otherwise from the GRN header, so a receipt is not counted twice.
 */
export function receivedQtyForPurchaseOrder(grns, poNumber) {
  const byItem = new Map();
  let total = 0;
  for (const grn of grnsForPurchaseOrder(grns, poNumber)) {
    const lines = Array.isArray(grn.lineItems) && grn.lineItems.length ? grn.lineItems : null;
    if (lines) {
      for (const line of lines) {
        const qty = Number(line.netWeightKg ?? line.weightKg ?? line.receivedQtyKg ?? line.qtyKg) || 0;
        if (qty <= 0) continue;
        total += qty;
        const label = String(line.itemName || line.itemDesc || line.description || '').trim();
        const name = norm(label);
        if (name) {
          const prev = byItem.get(name);
          byItem.set(name, { qty: (prev?.qty || 0) + qty, label: prev?.label || label });
        }
      }
      continue;
    }
    const qty = Number(grn.netWeightKg ?? grn.receivedQtyKg ?? grn.received_qty_kg) || 0;
    if (qty <= 0) continue;
    total += qty;
    const label = String(grn.itemName || grn.originalPoItemName || grn.item_name || '').trim();
    const name = norm(label);
    if (name) {
      const prev = byItem.get(name);
      byItem.set(name, { qty: (prev?.qty || 0) + qty, label: prev?.label || label });
    }
  }
  return { total, byItem };
}

function receivedQtyOf(po, grns) {
  if (po && po.totalInwardQty != null && po.totalInwardQty !== '') {
    return Number(po.totalInwardQty) || 0;
  }
  return receivedQtyForPurchaseOrder(grns, poNumberOf(po)).total;
}

function orderedQtyOf(po) {
  if (po && po.totalPoQty != null && po.totalPoQty !== '') return Number(po.totalPoQty) || 0;
  if (po && po.totalQtyKg != null && po.totalQtyKg !== '') return Number(po.totalQtyKg) || 0;
  return lineQty(po?.items);
}

export function canAmendPurchaseOrder(po, grns = []) {
  if (!po || !poNumberOf(po)) {
    return { ok: false, reason: 'Purchase order was not found.' };
  }
  if (isCancelled(po)) {
    return { ok: false, reason: `Purchase order ${poNumberOf(po)} is cancelled and cannot be amended.` };
  }
  const received = receivedQtyOf(po, grns);
  const ordered = orderedQtyOf(po);
  if (isFullyReceived(po, received, ordered)) {
    return {
      ok: false,
      reason: `Purchase order ${poNumberOf(po)} is fully received and cannot be amended. Raise a new purchase order for any further quantity.`,
    };
  }
  return { ok: true, reason: '' };
}

function qtyByItem(items) {
  const map = new Map();
  for (const item of items || []) {
    const name = norm(item.itemDesc || item.itemName || item.description);
    const qty = Number(item.qtyKg ?? item.qty ?? item.quantity) || 0;
    if (!name) continue;
    map.set(name, (map.get(name) || 0) + qty);
  }
  return map;
}

export function amendmentQtyBlockReason(previous, nextItems, grns = []) {
  const poNumber = poNumberOf(previous);
  const received = receivedQtyForPurchaseOrder(grns, poNumber);
  const headerReceived = previous?.totalInwardQty != null && previous.totalInwardQty !== ''
    ? Number(previous.totalInwardQty) || 0
    : received.total;
  const ceiling = Math.max(headerReceived, received.total);
  const nextTotal = lineQty(nextItems);
  if (ceiling > QTY_EPSILON && nextTotal + QTY_EPSILON < ceiling) {
    return `Amended quantity ${formatKg(nextTotal)} kg is below the ${formatKg(ceiling)} kg already received against ${poNumber}. Existing GRNs stay linked, so the amended quantity has to cover them.`;
  }
  const nextItemsByName = qtyByItem(nextItems);
  for (const [name, receivedLine] of received.byItem) {
    const allowed = nextItemsByName.get(name) || 0;
    if (allowed + QTY_EPSILON < receivedLine.qty) {
      return `Received ${formatKg(receivedLine.qty)} kg of "${receivedLine.label}" is already on a GRN for ${poNumber}. The amended line has to stay at or above that quantity.`;
    }
  }
  return '';
}

function formatKg(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

export function summarizePoAmendment(previous, next) {
  const changes = [];
  const prevVendor = previous?.vendorName || previous?.vendor?.companyName || previous?.vendor?.name || '';
  const nextVendor = next?.vendorName || next?.vendor?.companyName || next?.vendor?.name || '';
  if (norm(prevVendor) !== norm(nextVendor)) {
    changes.push(`Vendor ${prevVendor || '—'} → ${nextVendor || '—'}`);
  }
  if (norm(previous?.paymentTerms) !== norm(next?.paymentTerms)) changes.push('Payment terms updated');
  if (norm(previous?.logisticDetails) !== norm(next?.logisticDetails)) changes.push('Delivery terms updated');
  const prevDate = previous?.promisedDeliveryDate || previous?.deliveryDate || '';
  const nextDate = next?.promisedDeliveryDate || next?.deliveryDate || '';
  if (String(prevDate) !== String(nextDate)) {
    changes.push(`Delivery ${prevDate || '—'} → ${nextDate || '—'}`);
  }
  const prevQty = lineQty(previous?.items);
  const nextQty = lineQty(next?.items);
  if (Math.abs(prevQty - nextQty) > QTY_EPSILON) {
    changes.push(`Qty ${formatKg(prevQty)} → ${formatKg(nextQty)} kg`);
  }
  const rateKey = (items) => (items || []).map((item) => `${norm(item.itemDesc || item.itemName)}:${Number(item.rate) || 0}`).join('|');
  if (rateKey(previous?.items) !== rateKey(next?.items)) changes.push('Rates updated');
  if ((previous?.items || []).length !== (next?.items || []).length) {
    changes.push(`Lines ${(previous?.items || []).length} → ${(next?.items || []).length}`);
  }
  const prevNotes = previous?.notes || previous?.remarks || '';
  const nextNotes = next?.notes ?? next?.remarks ?? '';
  if (norm(prevNotes) !== norm(nextNotes)) changes.push('Notes updated');
  if (!changes.length) changes.push('Commercial fields saved with no detected change');
  const text = changes.join('; ');
  return text.length > 280 ? `${text.slice(0, 277)}…` : text;
}

export function purchaseOrderSnapshot(po, revisionOverride = null) {
  const revisionNo = revisionOverride == null ? revisionNumber(po) : revisionNumber({ revisionNo: revisionOverride });
  const fields = revisionOverride == null && !hasExplicitRevision(po)
    ? revisionFieldsForStorage(po)
    : {
      revisionNo,
      amendmentNo: formatAmendmentLabel(revisionNo),
      amendedAt: po?.amendedAt || po?.amended_at || null,
      amendedBy: po?.amendedBy || po?.amended_by || null,
      amendmentReason: po?.amendmentReason ?? po?.amendment_reason ?? null,
    };
  return {
    id: po?.id || poNumberOf(po),
    poNumber: poNumberOf(po),
    poDate: po?.poDate || po?.po_date || '',
    deliveryDate: po?.deliveryDate || po?.promisedDeliveryDate || po?.delivery_date || '',
    promisedDeliveryDate: po?.promisedDeliveryDate || po?.deliveryDate || po?.promised_delivery_date || '',
    vendorId: po?.vendorId || po?.vendor_id || po?.vendor?.id || null,
    vendorName: po?.vendorName || po?.vendor?.companyName || po?.vendor?.name || '',
    vendor: po?.vendor && typeof po.vendor === 'object' ? { ...po.vendor } : {},
    category: po?.category || '',
    items: (po?.items || []).map((item) => ({ ...item })),
    totalQtyKg: Number(po?.totalQtyKg ?? po?.total_qty_kg ?? lineQty(po?.items)) || 0,
    subtotal: Number(po?.subtotal) || 0,
    taxAmount: Number(po?.taxAmount ?? po?.tax_amount) || 0,
    totalAmount: Number(po?.totalAmount ?? po?.total_amount) || 0,
    paymentTerms: po?.paymentTerms || po?.payment_terms || '',
    logisticDetails: po?.logisticDetails || po?.logistic_details || '',
    notes: po?.notes || '',
    remarks: po?.remarks || po?.notes || '',
    status: po?.status || 'Pending Delivery',
    source: po?.source || '',
    linkedOrderId: po?.linkedOrderId || po?.linked_order_id || null,
    linkedOrderName: po?.linkedOrderName || po?.linked_order_name || null,
    linkedRequirements: Array.isArray(po?.linkedRequirements) ? po.linkedRequirements : [],
    createdBy: po?.createdBy || po?.created_by || '',
    createdAt: po?.createdAt || po?.created_at || null,
    updatedAt: po?.updatedAt || po?.updated_at || null,
    revisionNo: fields.revisionNo,
    amendmentNo: fields.amendmentNo,
    amendedAt: fields.amendedAt,
    amendedBy: fields.amendedBy,
    amendmentReason: fields.amendmentReason,
  };
}

function revisionEntry({ po, revisionNo, amendedBy, amendedAt, reason, changeSummary }) {
  const payload = purchaseOrderSnapshot(
    {
      ...po,
      revisionNo,
      amendmentNo: formatAmendmentLabel(revisionNo),
      amendedBy,
      amendedAt,
      amendmentReason: reason || '',
    },
    revisionNo
  );
  payload.amendmentReason = reason || '';
  payload.amendedBy = amendedBy || '';
  payload.amendedAt = amendedAt || null;
  return {
    id: purchaseOrderRevisionId(payload.poNumber, revisionNo),
    poId: payload.id || null,
    poNumber: payload.poNumber,
    revisionNo,
    amendmentNo: formatAmendmentLabel(revisionNo),
    payload,
    amendedBy: amendedBy || '',
    amendedAt: amendedAt || null,
    reason: reason || '',
    changeSummary: changeSummary || '',
  };
}

export function buildPurchaseOrderAmendment({ previous, draft, grns = [], actor, now, reason }) {
  const gate = canAmendPurchaseOrder(previous, grns);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  const poNumber = poNumberOf(previous);
  if (norm(draft?.poNumber) !== norm(poNumber)) {
    return { ok: false, reason: 'The purchase order number stays the same when it is amended.' };
  }
  const items = Array.isArray(draft?.items) ? draft.items.map((item) => ({ ...item })) : [];
  if (!items.length) return { ok: false, reason: 'Add at least one line item before saving the amendment.' };
  if (!String(draft?.vendorName || '').trim()) return { ok: false, reason: 'Select a vendor before saving the amendment.' };
  const qtyReason = amendmentQtyBlockReason(previous, items, grns);
  if (qtyReason) return { ok: false, reason: qtyReason };

  const fromRev = revisionNumber(previous);
  const toRev = fromRev + 1;
  const amendedAt = now || new Date().toISOString();
  const amendedBy = actor || 'Procurement Desk';
  const cleanReason = String(reason || '').trim();
  const summary = summarizePoAmendment(previous, { ...draft, items });
  const superseded = revisionEntry({
    po: previous,
    revisionNo: fromRev,
    amendedBy: previous?.amendedBy || previous?.createdBy || '',
    amendedAt: previous?.amendedAt || previous?.createdAt || amendedAt,
    reason: fromRev === 0 ? '' : (previous?.amendmentReason || ''),
    changeSummary: fromRev === 0 ? 'Original issue' : (previous?.amendmentSummary || ''),
  });
  const updated = {
    ...purchaseOrderSnapshot(previous, fromRev),
    id: previous.id || poNumber,
    poNumber,
    poDate: draft.poDate || previous.poDate,
    deliveryDate: draft.promisedDeliveryDate || draft.deliveryDate || previous.promisedDeliveryDate || '',
    promisedDeliveryDate: draft.promisedDeliveryDate || draft.deliveryDate || previous.promisedDeliveryDate || '',
    vendorId: draft.vendorId || null,
    vendorName: draft.vendorName,
    vendor: draft.vendor || previous.vendor || {},
    category: draft.category || previous.category,
    items,
    totalQtyKg: Number(draft.totalQtyKg) || lineQty(items),
    subtotal: Number(draft.subtotal) || 0,
    taxAmount: Number(draft.taxAmount) || 0,
    totalAmount: Number(draft.totalAmount) || 0,
    paymentTerms: draft.paymentTerms || '',
    logisticDetails: draft.logisticDetails || '',
    notes: draft.notes || '',
    remarks: draft.notes || draft.remarks || '',
    status: previous.status && norm(previous.status) !== 'cancelled' ? previous.status : (previous.status || 'Pending Delivery'),
    source: previous.source || 'Direct PO Module',
    linkedOrderId: previous.linkedOrderId || null,
    linkedOrderName: previous.linkedOrderName || null,
    linkedRequirements: previous.linkedRequirements || [],
    createdBy: previous.createdBy || amendedBy,
    createdAt: previous.createdAt || amendedAt,
    updatedAt: amendedAt,
    revisionNo: toRev,
    amendmentNo: formatAmendmentLabel(toRev),
    amendedAt,
    amendedBy,
    amendmentReason: cleanReason,
    amendmentSummary: summary,
  };
  const current = revisionEntry({
    po: updated,
    revisionNo: toRev,
    amendedBy,
    amendedAt,
    reason: cleanReason,
    changeSummary: summary,
  });
  return { ok: true, updated, superseded, current };
}

export function revisionToRow(entry) {
  return {
    id: entry.id,
    po_id: entry.poId || null,
    po_number: entry.poNumber,
    revision_no: entry.revisionNo,
    amendment_no: entry.amendmentNo,
    payload: entry.payload || {},
    amended_by: entry.amendedBy || null,
    amended_at: entry.amendedAt || null,
    reason: entry.reason || null,
    change_summary: entry.changeSummary || null,
  };
}

export function revisionFromRow(row) {
  if (!row) return null;
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    id: row.id,
    poId: row.po_id || payload.id || null,
    poNumber: row.po_number || payload.poNumber || '',
    revisionNo: row.revision_no == null ? revisionNumber(payload) : Number(row.revision_no),
    amendmentNo: row.amendment_no || payload.amendmentNo || formatAmendmentLabel(row.revision_no),
    payload,
    amendedBy: row.amended_by || payload.amendedBy || '',
    amendedAt: row.amended_at || payload.amendedAt || null,
    reason: row.reason || payload.amendmentReason || '',
    changeSummary: row.change_summary || '',
  };
}

export function mergeRevisionLists(localRows = [], remoteRows = []) {
  const map = new Map();
  for (const row of [...localRows, ...remoteRows]) {
    if (!row) continue;
    const key = Number(row.revisionNo);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }
    map.set(key, {
      ...existing,
      ...row,
      payload: row.payload && Object.keys(row.payload).length ? row.payload : existing.payload,
      reason: row.reason || existing.reason,
      changeSummary: row.changeSummary || existing.changeSummary,
      amendedBy: row.amendedBy || existing.amendedBy,
      amendedAt: row.amendedAt || existing.amendedAt,
    });
  }
  return [...map.values()].sort((a, b) => a.revisionNo - b.revisionNo);
}

export function documentHistoryEntries(po, storedRevisions = []) {
  const currentRev = revisionNumber(po);
  const stored = mergeRevisionLists([], storedRevisions).filter((row) => row.poNumber === poNumberOf(po) || !row.poNumber);
  const rows = stored.map((row) => ({
    ...row,
    amendmentNo: row.amendmentNo || formatAmendmentLabel(row.revisionNo),
    isCurrent: Number(row.revisionNo) === currentRev,
  }));
  if (!rows.some((row) => Number(row.revisionNo) === currentRev)) {
    rows.push({
      id: purchaseOrderRevisionId(poNumberOf(po), currentRev),
      poNumber: poNumberOf(po),
      revisionNo: currentRev,
      amendmentNo: displayAmendmentLabel(po),
      amendedAt: po?.amendedAt || po?.createdAt || po?.poDate || null,
      amendedBy: po?.amendedBy || po?.createdBy || '',
      reason: po?.amendmentReason || (currentRev === 0 ? '' : ''),
      changeSummary: po?.amendmentSummary || (currentRev === 0 ? 'Original issue' : ''),
      payload: purchaseOrderSnapshot(po, currentRev),
      isCurrent: true,
    });
  }
  return rows.sort((a, b) => b.revisionNo - a.revisionNo);
}
