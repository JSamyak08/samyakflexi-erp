import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canManageInwardGrn,
  cancelInwardGrn,
  editInwardGrn,
  grnChangeBlockReason,
  grnHasQcApproval
} from '../src/services/grnLifecycle.js';

const pending = {
  id: 'SIL/GRN/26-27/160',
  grnNo: 'SIL/GRN/26-27/160',
  status: 'Pending QC Approval',
  qcStatus: 'Pending QC Approval',
  vendorName: 'Acme',
  invoiceNo: 'INV-1',
  itemName: 'PET-670-12',
  netWeightKg: 100,
  lineItems: [{
    id: 'SIL/GRN/26-27/160-L1',
    lineNo: 1,
    itemName: 'PET-670-12',
    category: 'Film Substrates',
    netWeightKg: 100,
    purchaseRate: 155,
    stockItemId: 'INVT-0011',
    masterItemId: 'INVT-0011',
    rolls: [{ barcodeId: 'RM-BC-1', netWeightKg: 100 }]
  }]
};

test('a pending GRN can be edited and the edit does not post stock', () => {
  const result = editInwardGrn(pending, {
    header: { invoiceNo: 'INV-1-REVISED', vendorName: 'Acme' },
    lines: [{
      ...pending.lineItems[0],
      netWeightKg: 90,
      rolls: [{ barcodeId: 'RM-BC-1', netWeightKg: 90 }]
    }],
    actor: { name: 'Store Clerk', role: 'Store Manager' },
    now: '2026-10-30T09:00:00.000Z'
  });
  assert.equal(result.inventoryDeltaKg, 0);
  assert.equal(result.grn.status, 'Pending QC Approval');
  assert.equal(result.grn.qcStatus, 'Pending QC Approval');
  assert.equal(result.grn.invoiceNo, 'INV-1-REVISED');
  assert.equal(result.grn.netWeightKg, 90);
  assert.equal(result.grn.editedBy, 'Store Clerk');
  assert.equal(result.grn.id, pending.id);
});

test('cancelling a pending GRN voids rolls and does not change inventory', () => {
  const result = cancelInwardGrn(pending, {
    actor: { name: 'Store Clerk', role: 'Store Manager' },
    reason: 'Entered against the wrong invoice',
    now: '2026-10-30T09:05:00.000Z',
    rolls: [{ barcodeId: 'RM-BC-1', grnId: pending.id, netWeightKg: 100, availableWeightKg: 100, status: 'Pending QC' }]
  });
  assert.equal(result.inventoryDeltaKg, 0);
  assert.equal(result.grn.status, 'Cancelled');
  assert.equal(result.grn.qcStatus, 'Cancelled');
  assert.equal(result.grn.cancelledBy, 'Store Clerk');
  assert.equal(result.grn.cancelReason, 'Entered against the wrong invoice');
  assert.equal(result.grn.id, pending.id);
  assert.equal(result.rolls[0].status, 'Void');
  assert.equal(result.rolls[0].qcStatus, 'Void');
  assert.equal(result.rolls[0].availableWeightKg, 0);
});

test('QC approval locks edit and cancel, including a single approved line', () => {
  const approved = { ...pending, status: 'Approved', qcStatus: 'Approved' };
  assert.equal(grnHasQcApproval(approved), true);
  assert.match(grnChangeBlockReason(approved, 'Store Manager'), /QC-approved/);
  assert.throws(() => editInwardGrn(approved, { actor: 'Store Clerk' }), /QC-approved/);
  assert.throws(() => cancelInwardGrn(approved, { actor: 'Store Clerk', reason: 'oops' }), /QC-approved/);

  const mixed = {
    ...pending,
    status: 'Pending QC Approval',
    lineItems: [{ ...pending.lineItems[0], qcStatus: 'Approved' }]
  };
  assert.equal(grnHasQcApproval(mixed), true);
  assert.throws(() => cancelInwardGrn(mixed, { reason: 'too late', actor: 'Admin' }), /QC-approved/);
});

test('QC hold can still be cancelled, and a cancel needs a reason', () => {
  const held = { ...pending, status: 'QC Hold', qcStatus: 'Rejected' };
  assert.equal(grnHasQcApproval(held), false);
  const result = cancelInwardGrn(held, { actor: 'QC Chemist', reason: 'Wrong film', rolls: [] });
  assert.equal(result.grn.status, 'Cancelled');
  assert.equal(result.inventoryDeltaKg, 0);
  assert.throws(() => cancelInwardGrn(pending, { actor: 'Store', reason: '   ' }), /reason/);
});

test('edit and cancel follow the inventory role, not a new permission', () => {
  assert.equal(canManageInwardGrn('Store Manager'), true);
  assert.equal(canManageInwardGrn('QC Chemist'), true);
  assert.equal(canManageInwardGrn('Purchase Manager'), true);
  assert.equal(canManageInwardGrn('Admin'), true);
  assert.equal(canManageInwardGrn('Sales Manager'), false);
  assert.equal(canManageInwardGrn('Printing Operator'), false);
  assert.match(grnChangeBlockReason(pending, 'Sales Manager'), /cannot edit or cancel/);
});

test('the inward screen edits and cancels without writing inventory on cancel', () => {
  const source = fs.readFileSync(new URL('../src/components/InventoryManagement.jsx', import.meta.url), 'utf8');
  const cancel = source.slice(source.indexOf('const handleCancelInwardGrn'), source.indexOf('// QC Approval / Rejection'));
  assert.match(cancel, /cancelInwardGrn/);
  assert.match(cancel, /onUpdateGRN/);
  assert.doesNotMatch(cancel, /onSaveInventoryItem/);
  assert.match(source, /openEditInwardGrn/);
  assert.match(source, /No stock is added until QC approval/);
});
