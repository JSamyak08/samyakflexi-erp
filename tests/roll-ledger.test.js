import test from 'node:test';
import assert from 'node:assert/strict';
import {
  materialCoveredByRollLedger,
  openRollConsumptionWarnings,
  rollLedgerJobLink,
  rollLedgerTransactions
} from '../src/utils/rollLedger.js';

test('open roll warnings are the rows a user still has to resolve', () => {
  const open = openRollConsumptionWarnings([
    { status: 'open', reason: 'Barcode RM-9 did not match exactly one inventory item.', barcode: 'RM-9' },
    { status: 'resolved', reason: 'Already linked.', barcode: 'RM-1' },
    { status: 'open', reason: '   ', barcode: 'RM-2' }
  ]);
  assert.equal(open.length, 1);
  assert.equal(open[0].barcode, 'RM-9');
});

test('a roll issue links to the order and names the stage', () => {
  const link = rollLedgerJobLink({
    orderId: 'ORD-2026-14',
    jobName: 'Peas Pouch',
    stage: 'Printing'
  });
  assert.equal(link.href, '/orders/ORD-2026-14');
  assert.equal(link.label, 'ORD-2026-14 · Printing');
});

test('a record without an order links to the production record', () => {
  const link = rollLedgerJobLink({
    productionRecordId: 'REC-9',
    jobName: 'Rice Pouch',
    stage: 'Lamination (Pass 1)'
  });
  assert.equal(link.href, '/production/records/REC-9');
  assert.equal(link.label, 'Rice Pouch · Lamination (Pass 1)');
});

test('issue plus balance receipt net to the consumed weight and hide the duplicate material line', () => {
  const lines = rollLedgerTransactions([
    {
      id: 'issue-1',
      entryKind: 'issue',
      barcode: 'RM-100',
      qtyKg: 80,
      consumedKg: 47.5,
      orderId: 'ORD-1',
      jobName: 'Peas Pouch',
      stage: 'Printing',
      occurredAt: '2026-11-02T06:00:00.000Z'
    },
    {
      id: 'return-1',
      entryKind: 'balance_receipt',
      barcode: 'RM-100-BAL',
      qtyKg: 32.5,
      orderId: 'ORD-1',
      jobName: 'Peas Pouch',
      stage: 'Printing',
      occurredAt: '2026-11-02T06:00:01.000Z'
    }
  ]);
  const issue = lines.find((line) => line.category === 'usage');
  const receipt = lines.find((line) => line.category === 'inward');
  assert.equal(issue.outwardQtyKg, 80);
  assert.equal(receipt.inwardQtyKg, 32.5);
  assert.equal(issue.outwardQtyKg - receipt.inwardQtyKg, 47.5);
  assert.equal(issue.jobLink.href, '/orders/ORD-1');
  assert.equal(materialCoveredByRollLedger(
    { barcode: 'RM-100', netConsumedQtyKg: 47.5 },
    { id: 'REC-1', orderId: 'ORD-1' },
    [{ entryKind: 'issue', barcode: 'RM-100', orderId: 'ORD-1' }]
  ), true);
  assert.equal(materialCoveredByRollLedger(
    { barcode: 'RM-200', netConsumedQtyKg: 10 },
    { id: 'REC-1', orderId: 'ORD-1' },
    [{ entryKind: 'issue', barcode: 'RM-100', orderId: 'ORD-1' }]
  ), false);
});
