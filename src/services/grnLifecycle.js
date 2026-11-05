/**
 * Edit and cancel an inward GRN only before QC approval.
 * Cancelling keeps the receipt and voids its rolls. It does not add stock.
 */

import { userHasAnyRole } from '../assignedRoles.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../factoryStore.js';
import { summarizeReceiptLines } from './grnDocument.js';

export function isQcApprovedStatus(status) {
  return String(status || '').toLowerCase().includes('approved');
}

export function isGrnCancelled(grn) {
  const blob = `${grn?.status || ''} ${grn?.qcStatus || ''}`.toLowerCase();
  return blob.includes('cancel');
}

export function isGrnDeleted(grn) {
  const blob = `${grn?.status || ''} ${grn?.qcStatus || ''}`.toLowerCase();
  return blob.includes('delet');
}

/** Cancelled receipts still follow the older totals. Deleted receipts do not. */
export function grnCountsAsReceipt(grn) {
  return Boolean(grn) && !isGrnDeleted(grn);
}

export function receiptKg(grn) {
  if (!grnCountsAsReceipt(grn)) return 0;
  return Number(grn.netWeightKg ?? grn.receivedQtyKg ?? grn.received_qty_kg ?? grn.quantity) || 0;
}

export function canDeleteInwardQcInspection(user) {
  return userHasAnyRole(user, 'Admin');
}

export function grnHasQcApproval(grn) {
  if (!grn) return false;
  if (isQcApprovedStatus(grn.status) || isQcApprovedStatus(grn.qcStatus)) return true;
  return (Array.isArray(grn.lineItems) ? grn.lineItems : []).some((line) => (
    isQcApprovedStatus(line?.status) || isQcApprovedStatus(line?.qcStatus)
  ));
}

/**
 * The same people who can open Inventory, GRN & QC can edit or cancel a receipt.
 * That matrix is the role permission already used for this screen.
 */
export function canManageInwardGrn(role, matrix = DEFAULT_ROLE_PERMISSIONS) {
  if (!role) return false;
  if (role === 'Admin') return true;
  return matrix?.[role]?.inventory === true;
}

export function grnChangeBlockReason(grn, role, matrix = DEFAULT_ROLE_PERMISSIONS) {
  if (!canManageInwardGrn(role, matrix)) {
    return 'Your role cannot edit or cancel inward GRNs.';
  }
  if (grnHasQcApproval(grn)) {
    return 'This GRN is locked because a line has been QC-approved. Stock already posted cannot be edited or cancelled here.';
  }
  if (isGrnDeleted(grn)) {
    return 'This GRN is deleted and cannot be edited or approved.';
  }
  if (isGrnCancelled(grn)) {
    return 'This GRN is already cancelled.';
  }
  return '';
}

export function deleteInwardQcBlockReason(grn, user) {
  if (!canDeleteInwardQcInspection(user)) {
    return 'Only an Admin can delete an inward QC inspection.';
  }
  if (!grn) return 'This GRN was not found.';
  if (isGrnDeleted(grn)) return 'This GRN is already deleted.';
  if (grnHasQcApproval(grn)) {
    return 'This GRN was already QC-approved and posted to inventory. It cannot be deleted, and stock is not reversed.';
  }
  return '';
}

function lockedError(grn) {
  const error = new Error(grnHasQcApproval(grn)
    ? 'This GRN is locked because a line has been QC-approved.'
    : (isGrnDeleted(grn)
      ? 'This GRN is deleted and cannot be edited or approved.'
      : 'This GRN is already cancelled.'));
  error.code = 'GRN_LOCKED';
  return error;
}

/**
 * Header and line edits before QC. The receipt goes back to the QC queue.
 * inventoryDeltaKg is always 0: editing does not post stock.
 */
export function editInwardGrn(grn, { header = {}, lines, actor, now } = {}) {
  if (grnHasQcApproval(grn) || isGrnCancelled(grn) || isGrnDeleted(grn)) throw lockedError(grn);
  const nextLines = Array.isArray(lines) && lines.length > 0 ? lines : (grn.lineItems || []);
  const summary = summarizeReceiptLines(nextLines);
  const at = now || new Date().toISOString();
  const who = typeof actor === 'string' ? actor : (actor?.name || '');
  return {
    grn: {
      ...grn,
      ...header,
      ...summary,
      id: grn.id,
      grnNo: grn.grnNo || grn.id,
      lineItems: nextLines,
      status: 'Pending QC Approval',
      qcStatus: 'Pending QC Approval',
      editedBy: who,
      editedAt: at
    },
    inventoryDeltaKg: 0
  };
}

export function rollsForGrn(rolls, grn) {
  const ids = new Set([grn?.id, grn?.grnNo, grn?.grn_number].filter(Boolean).map((value) => String(value)));
  return (rolls || []).filter((roll) => (
    ids.has(String(roll?.grnId || roll?.grn_id || ''))
    || ids.has(String(roll?.grnNo || roll?.grn_no || ''))
  ));
}

/**
 * Cancel keeps the row, who cancelled it, and why.
 * Rolls are voided with zero available weight. Stock is not increased.
 */
export function cancelInwardGrn(grn, { actor, reason, now, rolls = [] } = {}) {
  if (grnHasQcApproval(grn) || isGrnDeleted(grn)) throw lockedError(grn);
  const at = now || new Date().toISOString();
  const who = typeof actor === 'string' ? actor : (actor?.name || '');
  const why = String(reason || '').trim();
  if (isGrnCancelled(grn)) {
    return { grn, rolls, inventoryDeltaKg: 0, alreadyCancelled: true };
  }
  if (!why) {
    const error = new Error('Cancellation needs a reason.');
    error.code = 'GRN_REASON';
    throw error;
  }
  const voided = (rolls || []).map((roll) => ({
    ...roll,
    status: 'Void',
    qcStatus: 'Void',
    availableWeightKg: 0,
    voidReason: why,
    voidedAt: at
  }));
  return {
    grn: {
      ...grn,
      status: 'Cancelled',
      qcStatus: 'Cancelled',
      cancelledBy: who,
      cancelledAt: at,
      cancelReason: why
    },
    rolls: voided,
    inventoryDeltaKg: 0,
    alreadyCancelled: false
  };
}
