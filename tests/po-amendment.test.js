import test from 'node:test';
import assert from 'node:assert/strict';
import {
  amendmentQtyBlockReason,
  buildPurchaseOrderAmendment,
  canAmendPurchaseOrder,
  displayAmendmentLabel,
  documentHistoryEntries,
  formatAmendmentLabel,
  nextRevisionNumber,
  revisionFieldsForStorage,
  revisionNumber,
} from '../src/utils/poAmendment.js';

function originalPo(overrides = {}) {
  return {
    id: 'SIL/PO/26-27/278',
    poNumber: 'SIL/PO/26-27/278',
    poDate: '2026-10-26',
    promisedDeliveryDate: '2026-11-02',
    deliveryDate: '2026-11-02',
    vendorId: 'V-1',
    vendorName: 'Creative marketing',
    vendor: { companyName: 'Creative marketing', gstin: '23AAQFC4167Q1ZT' },
    category: 'Adhesives & Hardener',
    items: [
      { id: 'line-1', itemDesc: 'Bostik HERB 2K', qtyKg: 900, rate: 280, amount: 252000, unit: 'Kg' },
    ],
    totalQtyKg: 900,
    subtotal: 252000,
    taxAmount: 45360,
    totalAmount: 297360,
    paymentTerms: '30 Days Net',
    logisticDetails: 'Freight Included within Indore',
    notes: 'COA required',
    status: 'Pending Delivery',
    createdBy: 'Samyak Jain',
    createdAt: '2026-10-26T06:30:00.000Z',
    ...overrides,
  };
}

function draftFrom(po, patch) {
  return {
    poNumber: po.poNumber,
    poDate: po.poDate,
    promisedDeliveryDate: po.promisedDeliveryDate,
    vendorId: po.vendorId,
    vendorName: po.vendorName,
    vendor: po.vendor,
    category: po.category,
    items: po.items.map((item) => ({ ...item })),
    totalQtyKg: po.totalQtyKg,
    subtotal: po.subtotal,
    taxAmount: po.taxAmount,
    totalAmount: po.totalAmount,
    paymentTerms: po.paymentTerms,
    logisticDetails: po.logisticDetails,
    notes: po.notes,
    ...patch,
  };
}

test('an untouched purchase order is Rev 00 and the first amend is Rev 01', () => {
  const po = originalPo();
  assert.equal(revisionNumber(po), 0);
  assert.equal(displayAmendmentLabel(po), 'Rev 00');
  assert.equal(displayAmendmentLabel({ amendmentNo: '0' }), 'Rev 00');
  assert.deepEqual(revisionFieldsForStorage(po), {
    revisionNo: null,
    amendmentNo: null,
    amendedAt: null,
    amendedBy: null,
    amendmentReason: null,
  });
  assert.equal(nextRevisionNumber(po), 1);
  assert.equal(formatAmendmentLabel(1), 'Rev 01');
  assert.equal(formatAmendmentLabel(10), 'Rev 10');

  const grns = [{ id: 'GRN-1', poNumber: po.poNumber, netWeightKg: 200, itemName: 'Bostik HERB 2K' }];
  const first = buildPurchaseOrderAmendment({
    previous: { ...po, totalInwardQty: 200, totalPoQty: 900, deliveryStatus: 'Partially Received' },
    draft: draftFrom(po, {
      items: [{ id: 'line-1', itemDesc: 'Bostik HERB 2K', qtyKg: 1200, rate: 275, amount: 330000, unit: 'Kg' }],
      totalQtyKg: 1200,
      subtotal: 330000,
      taxAmount: 59400,
      totalAmount: 389400,
      paymentTerms: '45 Days Net',
      promisedDeliveryDate: '2026-11-18',
    }),
    grns,
    actor: 'Samyak Jain',
    now: '2026-10-26T11:00:00.000Z',
    reason: 'Vendor confirmed a higher lot and a later dispatch.',
  });

  assert.equal(first.ok, true);
  assert.equal(first.updated.poNumber, 'SIL/PO/26-27/278');
  assert.equal(first.updated.id, po.id);
  assert.equal(first.updated.revisionNo, 1);
  assert.equal(first.updated.amendmentNo, 'Rev 01');
  assert.equal(first.updated.amendmentReason, 'Vendor confirmed a higher lot and a later dispatch.');
  assert.equal(first.updated.amendedBy, 'Samyak Jain');
  assert.equal(first.updated.createdAt, po.createdAt);
  assert.equal(first.updated.status, 'Pending Delivery');
  assert.equal(first.superseded.revisionNo, 0);
  assert.equal(first.superseded.amendmentNo, 'Rev 00');
  assert.equal(first.superseded.payload.items[0].qtyKg, 900);
  assert.equal(first.superseded.payload.paymentTerms, '30 Days Net');
  assert.equal(first.current.revisionNo, 1);
  assert.equal(first.current.payload.items[0].qtyKg, 1200);
  assert.equal(first.current.payload.items[0].rate, 275);
  assert.match(first.current.changeSummary, /Qty 900 → 1200 kg/);
  assert.match(first.current.changeSummary, /Payment terms updated/);
  assert.doesNotMatch(first.current.changeSummary, /Notes updated/);
  assert.equal(grns[0].poNumber, 'SIL/PO/26-27/278');
  assert.equal(grns.length, 1);

  const second = buildPurchaseOrderAmendment({
    previous: first.updated,
    draft: draftFrom(first.updated, {
      items: [{ id: 'line-1', itemDesc: 'Bostik HERB 2K', qtyKg: 1200, rate: 270, amount: 324000, unit: 'Kg' }],
      totalAmount: 382320,
    }),
    grns,
    actor: 'Store Desk',
    now: '2026-10-27T08:00:00.000Z',
    reason: 'Rate revised',
  });
  assert.equal(second.ok, true);
  assert.equal(second.updated.revisionNo, 2);
  assert.equal(second.updated.amendmentNo, 'Rev 02');
  assert.equal(second.updated.poNumber, po.poNumber);
  assert.equal(second.superseded.payload.revisionNo, 1);
  assert.equal(second.superseded.payload.items[0].rate, 275);
});

test('each amend increments the revision, including past Rev 09', () => {
  const po = originalPo({
    revisionNo: 9,
    amendmentNo: 'Rev 09',
    amendedAt: '2026-10-01T00:00:00.000Z',
    amendedBy: 'Desk',
    amendmentReason: 'Earlier change'
  });
  assert.equal(nextRevisionNumber(po), 10);
  const next = buildPurchaseOrderAmendment({
    previous: po,
    draft: draftFrom(po, { notes: 'Updated inspection note' }),
    actor: 'Samyak Jain',
    now: '2026-10-26T11:00:00.000Z',
    reason: 'Tenth revision'
  });
  assert.equal(next.ok, true);
  assert.equal(next.updated.revisionNo, 10);
  assert.equal(next.updated.amendmentNo, 'Rev 10');
  assert.equal(next.updated.poNumber, po.poNumber);
  assert.equal(next.superseded.revisionNo, 9);
  assert.equal(next.superseded.payload.notes, 'COA required');
  assert.equal(next.current.payload.notes, 'Updated inspection note');
});

test('fully received and cancelled purchase orders cannot be amended', () => {
  const open = originalPo();
  assert.equal(canAmendPurchaseOrder(open).ok, true);

  const received = canAmendPurchaseOrder({
    ...open,
    deliveryStatus: 'Fully Received',
    totalInwardQty: 900,
    totalPoQty: 900,
  });
  assert.equal(received.ok, false);
  assert.match(received.reason, /fully received/i);

  const coveredByGrn = buildPurchaseOrderAmendment({
    previous: open,
    draft: draftFrom(open, {}),
    grns: [{ poNumber: open.poNumber, netWeightKg: 900, itemName: 'Bostik HERB 2K' }],
  });
  assert.equal(coveredByGrn.ok, false);
  assert.match(coveredByGrn.reason, /fully received/i);

  const cancelled = buildPurchaseOrderAmendment({
    previous: { ...open, status: 'Cancelled' },
    draft: draftFrom(open, {}),
  });
  assert.equal(cancelled.ok, false);
  assert.match(cancelled.reason, /cancelled/i);
});

test('a partial receipt stays linked and the amended quantity cannot fall below it', () => {
  const po = originalPo({ totalInwardQty: 400, totalPoQty: 900, deliveryStatus: 'Partially Received' });
  const grns = [
    {
      poNumber: po.poNumber,
      netWeightKg: 400,
      itemName: 'Bostik HERB 2K',
      lineItems: [{ itemName: 'Bostik HERB 2K', netWeightKg: 250 }, { itemName: 'Bostik HERB 2K', netWeightKg: 150 }],
    },
  ];
  const tooLow = buildPurchaseOrderAmendment({
    previous: po,
    draft: draftFrom(po, {
      items: [{ id: 'line-1', itemDesc: 'Bostik HERB 2K', qtyKg: 300, rate: 280, amount: 84000, unit: 'Kg' }],
      totalQtyKg: 300,
    }),
    grns,
  });
  assert.equal(tooLow.ok, false);
  assert.match(tooLow.reason, /already received/);

  const renamedAway = buildPurchaseOrderAmendment({
    previous: po,
    draft: draftFrom(po, {
      items: [{ id: 'line-1', itemDesc: 'Different adhesive', qtyKg: 900, rate: 280, amount: 252000, unit: 'Kg' }],
    }),
    grns,
  });
  assert.equal(renamedAway.ok, false);
  assert.match(renamedAway.reason, /Bostik HERB 2K/);

  const exact = buildPurchaseOrderAmendment({
    previous: po,
    draft: draftFrom(po, {
      items: [{ id: 'line-1', itemDesc: 'Bostik HERB 2K', qtyKg: 400, rate: 280, amount: 112000, unit: 'Kg' }],
      totalQtyKg: 400,
    }),
    grns,
    actor: 'Samyak Jain',
    now: '2026-10-26T12:00:00.000Z',
  });
  assert.equal(exact.ok, true);
  assert.equal(exact.updated.poNumber, po.poNumber);
  assert.equal(amendmentQtyBlockReason(po, exact.updated.items, grns), '');
  assert.equal(grns[0].poNumber, po.poNumber);
});

test('document history lists each revision and can reopen the previous payload', () => {
  const po = originalPo();
  const untouched = documentHistoryEntries(po, []);
  assert.equal(untouched.length, 1);
  assert.equal(untouched[0].amendmentNo, 'Rev 00');
  assert.equal(untouched[0].changeSummary, 'Original issue');
  assert.equal(untouched[0].isCurrent, true);

  const amended = buildPurchaseOrderAmendment({
    previous: po,
    draft: draftFrom(po, {
      items: [{ id: 'line-1', itemDesc: 'Bostik HERB 2K', qtyKg: 1000, rate: 280, amount: 280000, unit: 'Kg' }],
      totalQtyKg: 1000,
    }),
    actor: 'Samyak Jain',
    now: '2026-10-26T11:30:00.000Z',
    reason: 'Extra 100 kg',
  });
  const history = documentHistoryEntries(amended.updated, [amended.superseded, amended.current]);
  assert.deepEqual(history.map((row) => row.amendmentNo), ['Rev 01', 'Rev 00']);
  assert.equal(history[0].isCurrent, true);
  assert.equal(history[0].reason, 'Extra 100 kg');
  assert.equal(history[0].amendedBy, 'Samyak Jain');
  assert.equal(history[1].payload.items[0].qtyKg, 900);
  assert.equal(history[1].payload.poNumber, po.poNumber);
  assert.equal(displayAmendmentLabel(history[1].payload), 'Rev 00');
});
