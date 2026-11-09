export function openRollConsumptionWarnings(rows) {
  return (rows || []).filter((row) => String(row?.status || 'open') === 'open' && String(row?.reason || '').trim());
}

export function rollLedgerJobLink(entry) {
  const orderId = String(entry?.orderId || entry?.order_id || '').trim();
  const recordId = String(entry?.productionRecordId || entry?.production_record_id || '').trim();
  const stage = String(entry?.stage || '').trim();
  const jobName = String(entry?.jobName || entry?.job_name || '').trim();
  let href = '';
  if (orderId) href = `/orders/${encodeURIComponent(orderId)}`;
  else if (recordId) href = `/production/records/${encodeURIComponent(recordId)}`;
  const label = [orderId || jobName, stage].filter(Boolean).join(' · ');
  return { orderId, recordId, stage, jobName, href, label };
}

export function mapRollLedgerRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    entryKind: row.entry_kind || row.entryKind || '',
    barcode: row.barcode || '',
    parentBarcode: row.parent_barcode || row.parentBarcode || '',
    qtyKg: Number(row.qty_kg ?? row.qtyKg) || 0,
    consumedKg: Number(row.consumed_kg ?? row.consumedKg) || 0,
    orderId: row.order_id || row.orderId || '',
    productionRecordId: row.production_record_id || row.productionRecordId || '',
    jobName: row.job_name || row.jobName || '',
    jobCode: row.job_code || row.jobCode || '',
    stage: row.stage || '',
    stockItemId: row.stock_item_id || row.stockItemId || '',
    occurredAt: row.occurred_at || row.occurredAt || null,
    itemName: row.item_name || row.itemName || '',
    filmType: row.film_type || row.filmType || ''
  };
}

export function materialCoveredByRollLedger(material, record, entries) {
  const barcode = String(material?.barcode || material?.barcodeId || material?.barcode_id || '').trim().toLowerCase();
  if (!barcode) return false;
  const recordOrder = String(record?.orderId || record?.order_id || material?.orderId || material?.order_id || '').trim();
  const recordId = String(record?.id || '').trim();
  return (entries || []).some((entry) => {
    const kind = entry.entryKind || entry.entry_kind;
    if (kind !== 'issue') return false;
    if (String(entry.barcode || '').trim().toLowerCase() !== barcode) return false;
    const orderId = String(entry.orderId || entry.order_id || '').trim();
    const entryRecord = String(entry.productionRecordId || entry.production_record_id || '').trim();
    return (recordOrder && orderId && recordOrder === orderId)
      || (recordId && entryRecord && recordId === entryRecord);
  });
}

/** Ledger lines for one posted roll consumption. Net quantity is the consumed weight. */
export function rollLedgerTransactions(entries) {
  return (entries || []).filter(Boolean).flatMap((entry) => {
    const link = rollLedgerJobLink(entry);
    const common = {
      date: entry.occurredAt,
      refNo: link.jobName || link.orderId || 'Job',
      subRef: link.label,
      jobLink: link,
      orderId: link.orderId,
      stage: link.stage,
      partyName: link.jobName || 'Production job',
      subParty: link.stage || 'Roll consumption',
      barcode: entry.barcode || '',
      batchNo: entry.barcode || '',
      ratePerKg: 0,
      unitPrice: 0,
      totalValue: 0,
      adjQtyKg: 0,
      legacy: false
    };
    if (entry.entryKind === 'balance_receipt') {
      return [{
        ...common,
        txId: entry.id,
        category: 'inward',
        type: '📥 Balance roll returned',
        isPendingQC: false,
        isRejected: false,
        inwardQtyKg: entry.qtyKg,
        outwardQtyKg: 0,
        status: 'In Stock (RM)',
        notes: `Balance roll ${entry.barcode || ''} returned to stock. ${link.label}`
      }];
    }
    if (entry.entryKind !== 'issue') return [];
    return [{
      ...common,
      txId: entry.id,
      category: 'usage',
      type: '📤 Job roll issue',
      inwardQtyKg: 0,
      outwardQtyKg: entry.qtyKg,
      status: 'Issued to job',
      notes: `Net consumed ${entry.consumedKg || 0} kg. ${link.label}`
    }];
  });
}
