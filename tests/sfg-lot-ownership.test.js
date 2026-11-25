import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARLIER_ORDER_LOT_MESSAGE,
  buildSfgFgBatchPlan,
  expectedRollMeters,
  lotBelongsToOrder,
  rollMetreWarnings,
  sumPrintedLotMeters
} from '../src/utils/sfgFgBatchEntry.js';

const chocolateLot = {
  id: 'lot-chocolate',
  sfgBatchCode: 'SFG-LOT-ORD-2026-252',
  orderId: 'ORD-2026-252',
  jobName: 'Chocolate bite inner 90mm',
  jobCode: 'CYL-2026-230',
  jobMasterId: 'JM-CHOCO',
  clientName: 'Nyra Chocolates',
  createdAt: '2026-11-24T11:10:12.000Z',
  totalNetKg: 487,
  totalMeters: 30863,
  consumedKg: 421.8,
  availableKg: 65.2,
  childRolls: [
    { barcodeId: 'SFG-PRN-CYL2026230-R01', netWeightKg: 194.8, lengthMeters: 23956 },
    { barcodeId: 'SFG-PRN-CYL2026230-R02', netWeightKg: 292.2, lengthMeters: 6907 }
  ]
};

function bambaiyaEntry(overrides = {}) {
  return {
    mode: 'SFG',
    stageType: 'Printed Rolls',
    isOpeningBalance: true,
    orderId: 'ORD-2026-252',
    orderCreatedAt: '2026-11-24T12:06:21.000Z',
    jobName: 'Bambaiya Premium Choco Gold Inner Rs.2',
    jobCode: 'CYL-2026-346',
    jobMasterId: 'JM-2026-446',
    clientName: 'S K Products',
    filmType: 'PET',
    micron: 12,
    widthMm: 910,
    machineName: 'Press 1',
    operatorName: 'Samyak',
    shift: 'Day Shift (8 AM - 8 PM)',
    storageBay: 'Bay A',
    productionDate: '2026-11-24',
    enteredBy: 'Samyak',
    enteredAt: '2026-11-24T12:49:49.000Z',
    outputRolls: [{
      barcodeId: 'SFG-PRN-CYL2026346-R01',
      grossWeightKg: 285.4,
      tareWeightKg: 0,
      netWeightKg: 285.4,
      lengthMeters: 18668
    }],
    existingLot: chocolateLot,
    sfgGoods: [chocolateLot],
    ...overrides
  };
}

test('a later order does not merge into a lot left by the same order number', () => {
  assert.equal(lotBelongsToOrder(chocolateLot, {
    id: 'ORD-2026-252',
    createdAt: '2026-11-24T12:06:21.000Z',
    jobName: 'Bambaiya Premium Choco Gold Inner Rs.2',
    jobCode: 'CYL-2026-346',
    jobMasterId: 'JM-2026-446'
  }), false);

  const plan = buildSfgFgBatchPlan(bambaiyaEntry());
  assert.equal(plan.ok, false);
  assert.match(plan.errors.join('\n'), new RegExp(EARLIER_ORDER_LOT_MESSAGE.replace(/[.]/g, '\\.')));
  assert.equal(plan.printedLot, undefined);
  assert.equal(chocolateLot.jobName, 'Chocolate bite inner 90mm');
  assert.equal(chocolateLot.childRolls.length, 2);
});

test('the same refusal holds after the leftover lot was already relabeled', () => {
  const relabeled = {
    ...chocolateLot,
    jobName: 'Bambaiya Premium Choco Gold Inner Rs.2',
    jobCode: 'CYL-2026-346',
    jobMasterId: 'JM-2026-446',
    clientName: 'S K Products'
  };
  const plan = buildSfgFgBatchPlan(bambaiyaEntry({ existingLot: relabeled, sfgGoods: [relabeled] }));
  assert.equal(plan.ok, false);
  assert.match(plan.errors.join('\n'), /earlier order/);
});

test('a second batch on the same order still adds to that order lot', () => {
  const plan = buildSfgFgBatchPlan(bambaiyaEntry({
    orderCreatedAt: '2026-11-24T10:00:00.000Z',
    jobName: chocolateLot.jobName,
    jobCode: chocolateLot.jobCode,
    jobMasterId: chocolateLot.jobMasterId,
    clientName: chocolateLot.clientName,
    isOpeningBalance: false,
    actualMeters: 4000,
    inkGsm: 1.5,
    inkKg: 1,
    inkItemId: 'INK',
    plainSettingKg: 0,
    printingWastageKg: 0,
    inputRolls: [{ barcode: 'RM-1', consumedKg: 10, initialKg: 20, balanceLeftKg: 10 }],
    inventory: [{ id: 'INK', itemName: 'Ink', category: 'Inks', availableQtyKg: 5 }],
    outputRolls: [{
      barcodeId: 'SFG-PRN-CYL2026230-R03',
      grossWeightKg: 40,
      tareWeightKg: 0,
      netWeightKg: 40,
      lengthMeters: 4000
    }]
  }));
  assert.equal(plan.ok, true, plan.errors?.join('\n'));
  assert.equal(plan.printedLot.orderId, 'ORD-2026-252');
  assert.equal(plan.printedLot.jobName, 'Chocolate bite inner 90mm');
  assert.deepEqual(
    plan.printedLot.childRolls.map((roll) => roll.barcodeId),
    ['SFG-PRN-CYL2026230-R01', 'SFG-PRN-CYL2026230-R02', 'SFG-PRN-CYL2026230-R03']
  );
  assert.equal(plan.printedLot.totalMeters, 23956 + 6907 + 4000);
});

test('lot metres add each batch instead of keeping only the last one', () => {
  const existing = {
    totalMeters: 10000,
    childRolls: [
      { barcodeId: 'R1', lengthMeters: 6000 },
      { barcodeId: 'R2', lengthMeters: 4000 }
    ]
  };
  const merged = [
    ...existing.childRolls,
    { barcodeId: 'R3', lengthMeters: 2500 }
  ];
  assert.equal(sumPrintedLotMeters({ existingLot: existing, children: merged, batchMeters: 2500 }), 12500);
  assert.equal(sumPrintedLotMeters({
    existingLot: { totalMeters: 9000, childRolls: [{ barcodeId: 'OLD', netWeightKg: 10 }] },
    children: [{ barcodeId: 'OLD', netWeightKg: 10 }, { barcodeId: 'NEW', lengthMeters: 4000 }],
    batchMeters: 4000
  }), 13000);
});

test('a roll warns when its metres are more than 10 percent from the film formula', () => {
  assert.equal(expectedRollMeters({ netKg: 194.8, widthMm: 910, micron: 12, density: 1.4 }), 12742);
  const warnings = rollMetreWarnings([
    { barcodeId: 'R01', netWeightKg: 194.8, lengthMeters: 23956 },
    { barcodeId: 'R03', netWeightKg: 285.4, lengthMeters: 18668 }
  ], { widthMm: 910, micron: 12, density: 1.4 });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].barcodeId, 'R01');
  assert.ok(warnings[0].percent > 10);
});
