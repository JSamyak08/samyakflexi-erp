import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLL_STATUS,
  SLIT_DISPATCH_TOLERANCE_KG,
  SLIT_DISPATCH_TOLERANCE_PCT,
  isBalanceRoll,
  isMatchableRollBarcode,
  isScrapRoll,
  packingItemRollBarcode,
  reconciliationBadge,
  reconcileSlitDispatch,
  withinSlitDispatchTolerance
} from '../src/utils/slitDispatchReconciliation.js';

const ORDER_ID = 'ORD-RECON-1';
const record = {
  id: 'PR-ORD-RECON-1',
  orderId: ORDER_ID,
  jobName: 'Reconciliation Sample',
  jobCode: 'JOB-RECON'
};

function fgRoll(barcode, netKg, extra = {}) {
  return {
    sfgBatchCode: barcode,
    orderId: ORDER_ID,
    jobName: 'Reconciliation Sample',
    jobCode: 'JOB-RECON',
    sfgType: 'Finished Goods (FG)',
    category: 'Finished Goods (FG)',
    rollType: 'FG',
    totalNetKg: netKg,
    availableKg: netKg,
    notes: 'Finished Goods derived from Slitting & Rewinding of SFG-BC-PARENT',
    ...extra
  };
}

function packingLine(barcode, netKg, extra = {}) {
  return {
    barcodeId: barcode,
    sourceFgBarcode: barcode,
    netWeightKg: netKg,
    grossWeightKg: netKg + 0.8,
    unit: 'Kg',
    ...extra
  };
}

function shipment(dispatchId, items, extra = {}) {
  return {
    id: `DISP-${dispatchId}`,
    dispatchId,
    orderId: ORDER_ID,
    jobName: 'Reconciliation Sample',
    items,
    totalNetWeightKg: items.reduce((sum, item) => sum + (Number(item.netWeightKg) || 0), 0),
    totalRolls: items.length,
    ...extra
  };
}

function challan(challanNo, packingListIds) {
  return {
    id: `id-${challanNo}`,
    challanNo,
    linkedPackingListIds: packingListIds,
    items: packingListIds.map((packingListId) => ({ packingListId, quantity: 1, unit: 'Kg' }))
  };
}

function sample() {
  return reconcileSlitDispatch({
    record,
    sfgGoods: [
      fgRoll('FG-BC-RECON-01', 100),
      fgRoll('FG-BC-RECON-02', 80),
      fgRoll('FG-BC-RECON-03', 50),
      fgRoll('FG-BC-RECON-04', 40),
      {
        sfgBatchCode: 'SFG-BC-RECON-BAL',
        orderId: ORDER_ID,
        jobName: 'Reconciliation Sample',
        sfgType: 'Balance Roll',
        category: 'Semi-Finished Goods (SFG)',
        rollType: 'SFG',
        totalNetKg: 12
      },
      {
        id: 'scrapref:1',
        orderId: ORDER_ID,
        jobName: 'Reconciliation Sample',
        sfgType: 'Scrap',
        status: 'Scrapped',
        totalNetKg: 3
      },
      {
        sfgBatchCode: 'SFG-BC-PARENT',
        orderId: ORDER_ID,
        jobName: 'Reconciliation Sample',
        sfgType: 'Laminated Rolls',
        category: 'Semi-Finished Goods (SFG)',
        rollType: 'SFG',
        totalNetKg: 290,
        balanceKeptKg: 8.5,
        balanceReason: 'Short run'
      },
      fgRoll('FG-BC-OTHER', 20, { orderId: 'ORD-OTHER', jobName: 'Other Job', jobCode: 'JOB-OTHER' })
    ],
    shipments: [
      shipment('PL-RECON-1', [
        packingLine('FG-BC-RECON-01', 100.4),
        packingLine('FG-BC-RECON-02', 79.2)
      ]),
      shipment('PL-RECON-2', [
        packingLine('FG-BC-RECON-03', 50),
        packingLine('FG-BC-RECON-99', 5)
      ])
    ],
    deliveryChallans: [challan('DC-RECON-1', ['PL-RECON-1'])]
  });
}

test('tolerance is ±0.5 kg or ±0.5 percent, inclusive', () => {
  assert.equal(SLIT_DISPATCH_TOLERANCE_KG, 0.5);
  assert.equal(SLIT_DISPATCH_TOLERANCE_PCT, 0.5);
  assert.equal(withinSlitDispatchTolerance(0.5, 2.5), true);
  assert.equal(withinSlitDispatchTolerance(-0.5, -2.5), true);
  assert.equal(withinSlitDispatchTolerance(4, 0.5), true);
  assert.equal(withinSlitDispatchTolerance(0.51, 0.51), false);
  assert.equal(withinSlitDispatchTolerance(0, null), true);
});

test('balance and scrap are recognised and packing labels are not slitting barcodes', () => {
  assert.equal(isBalanceRoll({ sfgBatchCode: 'RM-BC-1-BAL' }), true);
  assert.equal(isBalanceRoll({ sfgType: 'Balance Roll' }), true);
  assert.equal(isBalanceRoll(fgRoll('FG-BC-1', 1)), false);
  assert.equal(isScrapRoll({ id: 'scrapref:9', sfgType: 'Scrap' }), true);
  assert.equal(isScrapRoll(fgRoll('FG-BC-1', 1)), false);
  assert.equal(isMatchableRollBarcode('FG-DISP-1234-1'), false);
  assert.equal(isMatchableRollBarcode('FG-BC-RECON-01'), true);
  assert.equal(packingItemRollBarcode({ barcodeId: 'FG-DISP-1', sourceFgBarcode: 'FG-BC-RECON-01' }), 'FG-BC-RECON-01');
  assert.equal(packingItemRollBarcode({ barcodeId: 'FG-DISP-1' }), '');
});

test('matches rolls by barcode and reports gain, loss, and dispatch status', () => {
  const result = sample();
  assert.equal(result.matchMode, 'barcode');
  assert.equal(result.slittedRollCount, 4);
  assert.equal(result.slittedNetKg, 270);
  assert.equal(result.weighedRollCount, 4);
  assert.equal(result.weighedNetKg, 234.6);
  assert.equal(result.dispatchedRollCount, 2);
  assert.equal(result.dispatchedNetKg, 179.6);
  assert.equal(result.comparisonBasis, 'dispatched');
  assert.equal(result.differenceKg, -90.4);
  assert.equal(result.direction, 'loss');
  assert.equal(result.withinTolerance, false);
  assert.equal(result.scaleRollCount, 3);
  assert.equal(result.scaleDifferenceKg, -0.4);
  assert.equal(result.balanceRolls.length, 1);
  assert.equal(result.balanceRolls[0].netKg, 12);
  assert.equal(result.balanceKeptKg, 8.5);
  assert.equal(result.scrapExcludedCount, 1);
  assert.equal(result.missedWhileOthersDispatched, true);
  assert.equal(result.hasAlarm, true);
  assert.equal(reconciliationBadge(result).label, 'Dispatch gap');

  const byBarcode = Object.fromEntries(result.rows.map((row) => [row.barcode, row]));
  assert.equal(byBarcode['FG-BC-RECON-01'].status, ROLL_STATUS.DISPATCHED);
  assert.equal(byBarcode['FG-BC-RECON-01'].packingNetKg, 100.4);
  assert.equal(byBarcode['FG-BC-RECON-01'].varianceKg, 0.4);
  assert.equal(byBarcode['FG-BC-RECON-01'].packingListId, 'PL-RECON-1');
  assert.equal(byBarcode['FG-BC-RECON-01'].challanNo, 'DC-RECON-1');
  assert.equal(byBarcode['FG-BC-RECON-02'].status, ROLL_STATUS.DISPATCHED);
  assert.equal(byBarcode['FG-BC-RECON-02'].varianceKg, -0.8);
  assert.equal(byBarcode['FG-BC-RECON-03'].status, ROLL_STATUS.ON_PACKING_LIST);
  assert.equal(byBarcode['FG-BC-RECON-03'].challanNo, '');
  assert.equal(byBarcode['FG-BC-RECON-03'].packingListId, 'PL-RECON-2');
  assert.equal(byBarcode['FG-BC-RECON-04'].status, ROLL_STATUS.PENDING_FACTORY);
  assert.equal(byBarcode['FG-BC-RECON-04'].packingNetKg, null);
  assert.equal(byBarcode['FG-BC-RECON-99'].status, ROLL_STATUS.UNMATCHED_PACKING_LIST);
  assert.equal(byBarcode['FG-BC-RECON-99'].slittedNetKg, null);
  assert.equal(byBarcode['FG-BC-OTHER'], undefined);
  assert.equal(byBarcode['SFG-BC-RECON-BAL'], undefined);
});

test('a delivery challan can be linked by packing list id on the challan line', () => {
  const result = reconcileSlitDispatch({
    record,
    sfgGoods: [fgRoll('FG-BC-RECON-01', 10)],
    shipments: [shipment('PL-LINE', [packingLine('FG-BC-RECON-01', 10)])],
    deliveryChallans: [{
      id: 'dc-row',
      challanNo: 'DC-LINE',
      items: [{ packingListId: 'PL-LINE', quantity: 10, unit: 'Kg' }]
    }]
  });
  assert.equal(result.rows[0].status, ROLL_STATUS.DISPATCHED);
  assert.equal(result.rows[0].challanNo, 'DC-LINE');
  assert.equal(result.differenceKg, 0);
  assert.equal(result.withinTolerance, true);
  assert.equal(result.hasAlarm, false);
  assert.equal(reconciliationBadge(result), null);
});

test('shipment id is accepted when the challan does not store the display number', () => {
  const result = reconcileSlitDispatch({
    record,
    sfgGoods: [fgRoll('FG-BC-RECON-01', 10)],
    shipments: [shipment('PL-SHOW', [packingLine('FG-BC-RECON-01', 10.1)])],
    deliveryChallans: [challan('DC-BY-ID', ['DISP-PL-SHOW'])]
  });
  assert.equal(result.rows[0].status, ROLL_STATUS.DISPATCHED);
  assert.equal(result.rows[0].varianceKg, 0.1);
  assert.equal(result.withinTolerance, true);
});

test('nothing on a challan compares weighed net, and a small gain stays inside tolerance', () => {
  const result = reconcileSlitDispatch({
    record,
    sfgGoods: [fgRoll('FG-BC-RECON-01', 40)],
    shipments: [shipment('PL-OPEN', [packingLine('FG-BC-RECON-01', 40.4)])],
    deliveryChallans: []
  });
  assert.equal(result.comparisonBasis, 'weighed');
  assert.equal(result.dispatchedNetKg, 0);
  assert.equal(result.differenceKg, 0.4);
  assert.equal(result.direction, 'gain');
  assert.equal(result.withinTolerance, true);
  assert.equal(result.rows[0].status, ROLL_STATUS.ON_PACKING_LIST);
  assert.equal(result.hasAlarm, false);
});

test('a gain above both thresholds is a weight-gain alarm', () => {
  const result = reconcileSlitDispatch({
    record,
    sfgGoods: [fgRoll('FG-BC-RECON-01', 100)],
    shipments: [shipment('PL-GAIN', [packingLine('FG-BC-RECON-01', 101.2)])],
    deliveryChallans: [challan('DC-GAIN', ['PL-GAIN'])]
  });
  assert.equal(result.differenceKg, 1.2);
  assert.equal(result.differencePct, 1.2);
  assert.equal(result.direction, 'gain');
  assert.equal(result.withinTolerance, false);
  assert.equal(reconciliationBadge(result).label, 'Weight gain');
});

test('a large job stays inside tolerance on percent when the kg gap exceeds 0.5', () => {
  const result = reconcileSlitDispatch({
    record,
    sfgGoods: [fgRoll('FG-BC-RECON-01', 1000)],
    shipments: [shipment('PL-BIG', [packingLine('FG-BC-RECON-01', 996)])],
    deliveryChallans: [challan('DC-BIG', ['PL-BIG'])]
  });
  assert.equal(result.differenceKg, -4);
  assert.equal(result.differencePct, -0.4);
  assert.equal(result.withinTolerance, true);
  assert.equal(result.hasAlarm, false);
});

test('the same barcode on two packing lists is counted once, preferring the dispatched weigh', () => {
  const result = reconcileSlitDispatch({
    record,
    sfgGoods: [fgRoll('FG-BC-RECON-01', 10)],
    shipments: [
      shipment('PL-OLD', [packingLine('FG-BC-RECON-01', 9)]),
      shipment('PL-NEW', [packingLine('FG-BC-RECON-01', 10.2)])
    ],
    deliveryChallans: [challan('DC-NEW', ['PL-NEW'])]
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].packingNetKg, 10.2);
  assert.equal(result.rows[0].packingListId, 'PL-NEW');
  assert.equal(result.rows[0].status, ROLL_STATUS.DISPATCHED);
  assert.equal(result.weighedNetKg, 10.2);
  assert.equal(result.rows[0].duplicateWeighCount, 2);
});

test('packing lists without roll barcodes fall back to job totals', () => {
  const result = reconcileSlitDispatch({
    record,
    sfgGoods: [fgRoll('FG-BC-RECON-01', 30), fgRoll('FG-BC-RECON-02', 20)],
    shipments: [shipment('PL-BULK', [
      { barcodeId: 'FG-DISP-1001-1', netWeightKg: 30.1, unit: 'Kg' },
      { barcodeId: 'FG-DISP-1001-2', netWeightKg: 19.8, unit: 'Kg' }
    ])],
    deliveryChallans: [challan('DC-BULK', ['PL-BULK'])]
  });
  assert.equal(result.matchMode, 'job_totals');
  assert.match(result.jobTotalsReason, /do not carry roll barcodes/);
  assert.equal(result.slittedNetKg, 50);
  assert.equal(result.weighedNetKg, 49.9);
  assert.equal(result.dispatchedNetKg, 49.9);
  assert.equal(result.differenceKg, -0.1);
  assert.equal(result.withinTolerance, true);
  assert.equal(result.rows.filter((row) => row.status === ROLL_STATUS.JOB_TOTALS).length, 2);
  assert.equal(result.rows.filter((row) => row.status === ROLL_STATUS.NO_ROLL_BARCODE).length, 2);
  assert.equal(result.rows.some((row) => row.status === ROLL_STATUS.DISPATCHED), false);
  assert.equal(result.rows.some((row) => row.status === ROLL_STATUS.PENDING_FACTORY), false);
});

test('a header-only packing list uses its total weight', () => {
  const result = reconcileSlitDispatch({
    record,
    sfgGoods: [fgRoll('FG-BC-RECON-01', 15)],
    shipments: [{
      id: 'DISP-PL-HEAD',
      dispatchId: 'PL-HEAD',
      orderId: ORDER_ID,
      jobName: 'Reconciliation Sample',
      items: [],
      totalNetWeightKg: 14.8,
      totalRolls: 1
    }],
    deliveryChallans: [challan('DC-HEAD', ['PL-HEAD'])]
  });
  assert.equal(result.matchMode, 'job_totals');
  assert.equal(result.weighedNetKg, 14.8);
  assert.equal(result.dispatchedNetKg, 14.8);
  assert.equal(result.dispatchedRollCount, 1);
  assert.match(result.jobTotalsReason, /no itemised rolls/);
});

test('a line without a barcode is listed beside matched rolls', () => {
  const result = reconcileSlitDispatch({
    record,
    sfgGoods: [fgRoll('FG-BC-RECON-01', 10)],
    shipments: [shipment('PL-MIX', [
      packingLine('FG-BC-RECON-01', 10),
      { barcodeId: 'FG-DISP-9', netWeightKg: 2, unit: 'Kg' }
    ])],
    deliveryChallans: [challan('DC-MIX', ['PL-MIX'])]
  });
  assert.equal(result.matchMode, 'barcode');
  const extra = result.rows.find((row) => row.noRollBarcode);
  assert.equal(extra.status, ROLL_STATUS.UNMATCHED_PACKING_LIST);
  assert.equal(extra.packingNetKg, 2);
  assert.equal(result.weighedNetKg, 12);
  assert.equal(result.unmatchedCount, 1);
  assert.equal(result.hasAlarm, true);
});

test('pending rolls with nothing dispatched raise a pending badge, not a dispatch gap', () => {
  const result = reconcileSlitDispatch({
    record,
    sfgGoods: [fgRoll('FG-BC-RECON-01', 25)],
    shipments: [],
    deliveryChallans: []
  });
  assert.equal(result.rows[0].status, ROLL_STATUS.PENDING_FACTORY);
  assert.equal(result.comparisonBasis, 'weighed');
  assert.equal(result.differenceKg, -25);
  assert.equal(result.missedWhileOthersDispatched, false);
  assert.equal(reconciliationBadge(result).label, 'Pending dispatch');
});

test('a consumption log supplies a slitted roll that is not in stock yet', () => {
  const result = reconcileSlitDispatch({
    record: {
      ...record,
      sfgConsumptions: [{
        targetProcess: 'Pouching / Bag Making',
        orderId: ORDER_ID,
        jobName: 'Reconciliation Sample',
        outputRolls: [{ barcode: 'FG-BC-POUCH-1', netWeightKg: 6.5, outputType: 'FG', stage: 'Pouching / Bag Making' }]
      }]
    },
    sfgGoods: [],
    shipments: [],
    deliveryChallans: []
  });
  assert.equal(result.slittedRollCount, 1);
  assert.equal(result.slittedNetKg, 6.5);
  assert.equal(result.rows[0].stage, 'Pouching / Bag Making');
  assert.equal(result.rows[0].status, ROLL_STATUS.PENDING_FACTORY);
});

test('stock weight wins over a later consumption-log copy of the same roll', () => {
  const result = reconcileSlitDispatch({
    record,
    sfgGoods: [fgRoll('FG-BC-RECON-01', 11, {
      consumptionHistory: [{
        targetProcess: 'Slitting & Rewinding',
        orderId: ORDER_ID,
        outputRoll: { barcode: 'FG-BC-RECON-01', netWeightKg: 99, outputType: 'FG' }
      }]
    })],
    shipments: [],
    deliveryChallans: []
  });
  assert.equal(result.slittedNetKg, 11);
  assert.equal(result.slittedRollCount, 1);
});

test('lamination output is not treated as a slitted child roll', () => {
  const result = reconcileSlitDispatch({
    record,
    sfgGoods: [{
      sfgBatchCode: 'SFG-BC-LAM-1',
      orderId: ORDER_ID,
      jobName: 'Reconciliation Sample',
      sfgType: 'Laminated Rolls',
      category: 'Semi-Finished Goods (SFG)',
      rollType: 'SFG',
      totalNetKg: 40,
      stage: 'Lamination Pass 1',
      notes: 'Produced from Lamination Pass 1'
    }],
    shipments: [],
    deliveryChallans: []
  });
  assert.equal(result.slittedRollCount, 0);
  assert.equal(result.hasAlarm, false);
});

test('finished goods are matched to the order even when the record id carries a PR prefix', () => {
  const result = reconcileSlitDispatch({
    record: { id: 'PR-ORD-RECON-1', orderId: 'PR-ORD-RECON-1', jobName: 'Reconciliation Sample' },
    sfgGoods: [fgRoll('FG-BC-RECON-01', 4)],
    shipments: [shipment('PL-1', [packingLine('FG-BC-RECON-01', 4)])],
    deliveryChallans: [challan('DC-1', ['PL-1'])]
  });
  assert.equal(result.rows[0].status, ROLL_STATUS.DISPATCHED);
  assert.equal(result.differenceKg, 0);
});
