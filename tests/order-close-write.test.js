import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closeColumnsForOrderSave,
  explicitCloseMode,
  statusForOrderSave
} from '../src/utils/orderCloseWrite.js';
import { applyPrintRunResult, buildPrintRunPatch } from '../src/utils/printRun.js';
import { alertOnce, resetAlertOnce } from '../src/utils/alertOnce.js';

test('an explicit null close mode is not replaced by a nested manual flag', () => {
  const order = {
    id: 'ORD-1',
    closeMode: null,
    jobDetails: { closeMode: 'manual', closedBy: 'Old Admin' }
  };
  assert.equal(explicitCloseMode(order), null);
  assert.equal(closeColumnsForOrderSave(order), null);
});

test('only an intentional close writes close columns', () => {
  const ordinary = { id: 'ORD-1', closeMode: 'manual', status: 'Completed' };
  assert.equal(closeColumnsForOrderSave(ordinary), null);

  const manual = closeColumnsForOrderSave({
    closeWrite: true,
    closeMode: 'manual',
    closedBy: 'Admin',
    closedAt: '2026-10-31T00:00:00.000Z',
    closeReason: 'Customer took the balance',
    overDispatchWarning: null
  });
  assert.equal(manual.close_mode, 'manual');
  assert.equal(manual.closed_by, 'Admin');

  const reopen = closeColumnsForOrderSave({
    closeWrite: true,
    closeMode: null,
    closedBy: null,
    jobDetails: { closeMode: 'manual', closedBy: 'Admin' }
  });
  assert.equal(reopen.close_mode, null);
  assert.equal(reopen.closed_by, null);
});

test('a partial order patch does not invent a status', () => {
  assert.equal(statusForOrderSave({ id: 'ORD-1', orderQtyKg: 10 }), undefined);
  assert.equal(statusForOrderSave({ status: 'In Production' }), 'In Production');
  assert.equal(statusForOrderSave({ status: '   ' }), undefined);
});

test('a print run patch keeps press fields and drops close or status fields', () => {
  const patch = buildPrintRunPatch({
    machineId: 'MAC-1',
    inputRollsList: [{ barcodeId: 'RM-1', consumedWeightKg: '12' }],
    nextProcess: 'Lamination Machine',
    status: 'Completed',
    closeMode: 'manual',
    closedBy: 'Operator',
    close_mode: 'manual'
  });
  assert.deepEqual(Object.keys(patch).sort(), ['inputRollsList', 'machineId', 'nextProcess']);
  assert.equal(patch.closeMode, undefined);
  assert.equal(patch.status, undefined);
});

test('applying a print run result does not turn printing completion into an order close', () => {
  const next = applyPrintRunResult({
    id: 'ORD-1',
    status: 'In Production',
    closeMode: null,
    jobDetails: { closeMode: null, structure: 'PET' }
  }, {
    status: 'In Production',
    closeMode: null,
    printingStatus: 'Completed',
    isPrintingCompleted: true,
    nextProcess: 'Slitting Machine',
    inputRollsList: [{ barcodeId: 'RM-9' }]
  });
  assert.equal(next.status, 'In Production');
  assert.equal(next.closeMode, null);
  assert.equal(next.printingStatus, 'Completed');
  assert.equal(next.isPrintingCompleted, true);
  assert.equal(next.nextProcess, 'Slitting Machine');
  assert.equal(next.jobDetails.closeMode, null);
  assert.equal(next.jobDetails.structure, 'PET');
});

test('a repeated save failure alerts once', () => {
  resetAlertOnce();
  const seen = [];
  const options = { alertFn: (message) => seen.push(message), windowMs: 8000 };
  assert.equal(alertOnce('Failed to update order ORD-1 in Supabase database: blocked', options), true);
  assert.equal(alertOnce('Failed to update order ORD-1 in Supabase database: blocked', options), false);
  assert.equal(alertOnce('Failed to update order ORD-2 in Supabase database: blocked', options), true);
  assert.deepEqual(seen, [
    'Failed to update order ORD-1 in Supabase database: blocked',
    'Failed to update order ORD-2 in Supabase database: blocked'
  ]);
});
