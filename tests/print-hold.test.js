import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPrintRunResult } from '../src/utils/printRun.js';
import {
  PRINT_HOLD_REASONS,
  PRINT_HOLD_STATUS,
  balancePrintPrompt,
  canHoldPrintJob,
  holdHistoryOf,
  isHeldPrintJob,
  isPressPrintingCompleted,
  remainingPrintKg,
  usablePrintedKg,
  validatePrintHold
} from '../src/utils/printHold.js';

const rolls = [{
  barcodeId: 'RM-1',
  initialWeightKg: 100,
  consumedWeightKg: 40,
  balanceLengthMeters: 500
}];

test('hold reasons match the approved list and Other needs a note', () => {
  assert.deepEqual(PRINT_HOLD_REASONS, [
    'Cylinder Chroming Issue',
    'Cylinder Damage Issue',
    'Machine Maintenance',
    'Urgent Job Changeover',
    'Rubber Roller Issue',
    'Raw Material Issue',
    'Other Reason'
  ]);
  const missing = validatePrintHold({
    reason: 'Other Reason',
    note: '  ',
    meters: 10,
    printedKg: 2,
    usable: true,
    inputRolls: rolls
  });
  assert.equal(missing.ok, false);
  const ok = validatePrintHold({
    reason: 'Other Reason',
    note: 'Gear noise',
    meters: 10,
    printedKg: 2,
    usable: false,
    inputRolls: rolls
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.usable, false);
});

test('a leftover input roll needs its own balance meters', () => {
  const result = validatePrintHold({
    reason: 'Machine Maintenance',
    meters: 10,
    printedKg: 2,
    usable: true,
    inputRolls: [{ barcodeId: 'RM-1', initialWeightKg: 100, consumedWeightKg: 40 }]
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /balance length/i);
});

test('usable kilograms reduce the remaining order quantity and unusable kilograms do not', () => {
  const order = {
    orderQtyKg: 100,
    printHoldHistory: [
      { usable: true, printedKg: 25 },
      { usable: false, printedKg: 10 }
    ]
  };
  assert.equal(usablePrintedKg(order), 25);
  assert.equal(remainingPrintKg(order), 75);
  assert.match(balancePrintPrompt(order), /75\.00 kg/);
  assert.equal(balancePrintPrompt({ orderQtyKg: 100, printHoldHistory: [{ usable: false, printedKg: 10 }] }), '');
});

test('hold history is read from the order or from job details', () => {
  assert.equal(holdHistoryOf({ printHoldHistory: [{ reason: 'A' }] }).length, 1);
  assert.equal(holdHistoryOf({ jobDetails: { printHoldHistory: [{ reason: 'B' }, { reason: 'C' }] } }).length, 2);
});

test('a held job is not treated as a completed press run', () => {
  const held = {
    printingStatus: PRINT_HOLD_STATUS,
    printingEndTime: '2026-11-11T10:00:00.000Z',
    printingStartTime: '2026-11-11T08:00:00.000Z'
  };
  assert.equal(isHeldPrintJob(held), true);
  assert.equal(isPressPrintingCompleted(held, { stages: { printing: { status: 'Completed' } } }), false);
  const finished = { printingStatus: 'Completed', printingEndTime: '2026-11-11T10:00:00.000Z' };
  assert.equal(isPressPrintingCompleted(finished), true);
});

test('a stale progress payload cannot mark a held job completed', () => {
  const next = applyPrintRunResult({
    id: 'ORD-1',
    printingStatus: PRINT_HOLD_STATUS,
    printingEndTime: '2026-11-11T10:00:00.000Z',
    isPrintingCompleted: false,
    printHoldHistory: [{ reason: 'Machine Maintenance', meters: 10 }]
  }, {
    printingStatus: PRINT_HOLD_STATUS,
    printingEndTime: '2026-11-11T10:00:00.000Z',
    isPrintingCompleted: true,
    inputRollsList: [{ barcodeId: 'STALE' }]
  });
  assert.equal(next.isPrintingCompleted, false);
  assert.equal(next.printingStatus, PRINT_HOLD_STATUS);
  assert.equal(next.jobDetails.isPrintingCompleted, false);
  assert.equal(next.printHoldHistory[0].reason, 'Machine Maintenance');
});

test('hold and restart follow the role list and combined roles', () => {
  const matrix = {
    'Printing Operator': { printing_scheduler: true },
    'Shop Floor Operator': { printing_scheduler: true },
    'Production Manager': { printing_scheduler: false },
    'Plant Manager': { printing_scheduler: true },
    'Sales Manager': { printing_scheduler: true },
    Admin: { printing_scheduler: false }
  };
  assert.equal(canHoldPrintJob({ role: 'Printing Operator' }, matrix), true);
  assert.equal(canHoldPrintJob({ role: 'Shop Floor Operator' }, matrix), true);
  assert.equal(canHoldPrintJob({ role: 'Plant Manager' }, matrix), true);
  assert.equal(canHoldPrintJob({ role: 'Admin' }, matrix), true);
  assert.equal(canHoldPrintJob({ role: 'Production Manager' }, matrix), false);
  assert.equal(canHoldPrintJob({ role: 'Sales Manager' }, matrix), false);
  assert.equal(canHoldPrintJob({
    role: 'Sales Manager',
    roles: ['Sales Manager', 'Printing Operator']
  }, matrix), true);
});
