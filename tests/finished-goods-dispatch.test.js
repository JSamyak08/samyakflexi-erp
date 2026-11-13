import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrderStageInfo } from '../src/factoryStore.js';
import { readyForDispatchLots, evaluateOrderAutoClose } from '../src/utils/orderAutoClose.js';
import {
  isFinishedGoodsStock,
  dispatchSelectableLots
} from '../src/utils/finishedGoods.js';
import { planDispatchSfgDeductions, planDispatchRollDeductions } from '../src/services/guardedWrite.js';
import { collectBarcodes, BARCODE_SOURCE } from '../src/utils/barcodeRegistry.js';
import { buildOrderReportRows } from '../src/utils/orderCsvReport.js';

const palekar = {
  id: 'ORD-2026-224',
  jobName: 'Palekar Cream Doughnut',
  clientName: 'Insta Foods',
  orderQtyKg: 500,
  status: 'In Production',
  printingStatus: 'Completed',
  isPrintingCompleted: true,
  jobDetails: { nextProcess: 'Lamination Machine' }
};

function printedLot(extra = {}) {
  return {
    orderId: 'ORD-2026-224',
    sfgBatchCode: 'SFG-LOT-ORD-2026-224',
    sfgType: 'Printed Rolls',
    category: 'Semi-Finished Goods (SFG)',
    rollType: 'SFG',
    status: 'In Stock (WIP)',
    storageBay: 'SFG Store (Bay B - Pre-Lamination)',
    totalNetKg: 150.8,
    availableKg: 150.8,
    consumedKg: 0,
    dispatchedKg: 0,
    ...extra
  };
}

test('semi-finished text is not finished goods', () => {
  assert.equal(isFinishedGoodsStock(printedLot()), false);
  assert.equal(isFinishedGoodsStock({
    category: 'Semi-Finished Goods (SFG)',
    sfgType: 'Printed Rolls'
  }), false);
  assert.equal(isFinishedGoodsStock({
    sfgBatchCode: 'SFG-BC-ORD-2026-224-1',
    sfgType: 'Finished Goods (FG)',
    rollType: 'SFG'
  }), false);
  assert.equal(isFinishedGoodsStock({
    id: 'FG-BC-1',
    sfgType: 'Finished Goods (FG)',
    category: 'Finished Goods (FG)',
    rollType: 'FG',
    availableKg: 400.2
  }), true);
  assert.equal(isFinishedGoodsStock({
    barcodeId: 'FG-BC-ORD2026201-2096',
    rollType: 'FINISHED_GOODS',
    category: 'Finished Goods (FG)'
  }), true);
});

test('printed SFG does not make an order ready for dispatch', () => {
  const stage = getOrderStageInfo(palekar, [printedLot()], []);
  assert.equal(stage.stage, 'Printing (Pass 1)');
  assert.match(stage.stageLabel, /awaiting lamination/);
  assert.equal(stage.fgAvailableKg, 0);
  assert.equal(stage.sfgAvailableKg, 150.8);
  assert.equal(readyForDispatchLots(stage).length, 0);

  const tagged = getOrderStageInfo(palekar, [printedLot({ status: 'Ready for Dispatch' })], []);
  assert.notEqual(tagged.stage, 'Ready for Dispatch');
  assert.equal(tagged.fgAvailableKg, 0);
});

test('the same printed-WIP rule covers the other reported lots', () => {
  const rows = [
    { id: 'ORD-2026-221', kg: 299.2, code: 'SFG-LOT-ORD-2026-221' },
    { id: 'ORD-2026-218', kg: 273.3, code: 'SFG-LOT-ORD-2026-218' }
  ];
  rows.forEach((row) => {
    const stage = getOrderStageInfo(
      { ...palekar, id: row.id, jobDetails: { nextProcess: 'Lamination Machine' } },
      [printedLot({ orderId: row.id, sfgBatchCode: row.code, totalNetKg: row.kg, availableKg: row.kg })],
      []
    );
    assert.equal(stage.stage, 'Printing (Pass 1)', row.id);
    assert.equal(stage.fgAvailableKg, 0, row.id);
    assert.match(stage.stageLabel, /awaiting lamination/);
  });
});

test('real finished goods still count, and slitting or balance WIP does not', () => {
  const ready = getOrderStageInfo(
    { id: 'ORD-2026-201', orderQtyKg: 700, status: 'In Production' },
    [{
      orderId: 'ORD-2026-201',
      sfgBatchCode: 'FG-BC-ORD2026201-2096',
      sfgType: 'Finished Goods (FG)',
      category: 'Finished Goods (FG)',
      rollType: 'FG',
      status: 'Ready for Dispatch',
      storageBay: 'Bay A',
      totalNetKg: 400.2,
      availableKg: 400.2
    }],
    []
  );
  assert.equal(ready.stage, 'Ready for Dispatch');
  assert.equal(ready.fgAvailableKg, 400.2);
  assert.equal(readyForDispatchLots(ready).length, 1);

  const slit = getOrderStageInfo(
    { id: 'ORD-SLIT', orderQtyKg: 100, status: 'In Production' },
    [{
      orderId: 'ORD-SLIT',
      sfgBatchCode: 'SFG-BC-SLIT-1',
      sfgType: 'Slit Rolls',
      category: 'Semi-Finished Goods (SFG)',
      rollType: 'SFG',
      stage: 'Slitting & Rewinding',
      status: 'In Stock (WIP)',
      totalNetKg: 40,
      availableKg: 40
    }],
    []
  );
  assert.equal(slit.stage, 'Slitting & Rewinding');
  assert.equal(slit.fgAvailableKg, 0);

  const balance = getOrderStageInfo(
    { id: 'ORD-BAL', orderQtyKg: 100, status: 'In Production' },
    [{
      orderId: 'ORD-BAL',
      sfgBatchCode: 'SFG-BC-ORD-BAL-1',
      sfgType: 'Balance Roll',
      category: 'Semi-Finished Goods (SFG)',
      rollType: 'SFG',
      status: 'In Stock (WIP)',
      totalNetKg: 12,
      availableKg: 12
    }],
    []
  );
  assert.equal(balance.stage, 'Pre-Production');
  assert.equal(balance.fgAvailableKg, 0);
});

test('dispatch can select and deduct finished goods only', () => {
  const sfg = printedLot();
  const fg = {
    id: 'fg',
    orderId: 'ORD-2026-224',
    jobName: 'Palekar Cream Doughnut',
    sfgBatchCode: 'FG-BC-224',
    sfgType: 'Finished Goods (FG)',
    category: 'Finished Goods (FG)',
    rollType: 'FG',
    availableKg: 20,
    totalNetKg: 20
  };
  assert.deepEqual(dispatchSelectableLots([sfg, fg]).map((row) => row.sfgBatchCode), ['FG-BC-224']);

  const namedSfg = planDispatchSfgDeductions([sfg, fg], {
    id: 'DISP-224',
    dispatchId: 'PL-224',
    dispatchDate: '2026-11-09',
    jobName: 'Palekar Cream Doughnut',
    orderId: 'ORD-2026-224',
    totalNetWeightKg: 10,
    items: [{ sourceFgBarcode: 'SFG-LOT-ORD-2026-224', netWeightKg: 10 }]
  });
  assert.equal(namedSfg.updates.length, 1);
  assert.equal(namedSfg.updates[0].after.sfgBatchCode, 'FG-BC-224');
  assert.equal(namedSfg.updates[0].after.availableKg, 10);

  const onlySfg = planDispatchSfgDeductions([sfg], {
    id: 'DISP-224B',
    dispatchId: 'PL-224B',
    jobName: 'Palekar Cream Doughnut',
    orderId: 'ORD-2026-224',
    totalNetWeightKg: 10,
    items: [{ sourceFgBarcode: 'SFG-LOT-ORD-2026-224', netWeightKg: 10 }]
  });
  assert.equal(onlySfg.updates.length, 0);

  const rolls = planDispatchRollDeductions([
    { id: 'r-sfg', barcodeId: 'SFG-BC-ORD-2026-224-1', rollType: 'SEMI_FINISHED_GOODS', category: 'Semi-Finished Goods (SFG)', netWeightKg: 150.8, availableWeightKg: 150.8, orderId: 'ORD-2026-224' },
    { id: 'r-fg', barcodeId: 'FG-BC-224', rollType: 'FG', category: 'Finished Goods (FG)', netWeightKg: 20, availableWeightKg: 20, orderId: 'ORD-2026-224' }
  ], {
    id: 'DISP-ROLL',
    dispatchId: 'PL-ROLL',
    orderId: 'ORD-2026-224',
    totalNetWeightKg: 8,
    items: [{ sourceFgBarcode: 'SFG-BC-ORD-2026-224-1', netWeightKg: 8 }]
  });
  assert.equal(rolls.updates.length, 1);
  assert.equal(rolls.updates[0].after.barcodeId, 'FG-BC-224');
});

test('the order csv uses the same stage the screen shows', () => {
  const sfgRows = buildOrderReportRows({
    kind: 'pending',
    today: '2026-11-09',
    orders: [palekar],
    sfgGoods: [printedLot()]
  });
  assert.equal(sfgRows[0]['Current Stage'], 'Printed — awaiting lamination');
  assert.equal(sfgRows[0]['Current Stage'].includes('Ready for Dispatch'), false);

  const fgRows = buildOrderReportRows({
    kind: 'pending',
    today: '2026-11-09',
    orders: [{ id: 'ORD-2026-201', jobName: 'Chocovalley', clientName: 'QA', orderQtyKg: 700, status: 'In Production', targetDeliveryDate: '2026-12-01' }],
    sfgGoods: [{
      orderId: 'ORD-2026-201',
      sfgBatchCode: 'FG-BC-ORD2026201-2096',
      sfgType: 'Finished Goods (FG)',
      category: 'Finished Goods (FG)',
      rollType: 'FG',
      status: 'Ready for Dispatch',
      storageBay: 'Bay A',
      totalNetKg: 40,
      availableKg: 40
    }]
  });
  assert.equal(fgRows[0]['Current Stage'], 'Ready for Dispatch (40kg)');
});

test('a semi-finished lot stays an SFG barcode and does not block a dispatched close', () => {
  const rows = collectBarcodes({
    sfgGoods: [printedLot({ jobName: 'Palekar Cream Doughnut' })]
  });
  assert.equal(rows[0].sourceModule, BARCODE_SOURCE.sfg);

  const decision = evaluateOrderAutoClose({
    order: { id: 'ORD-2026-224', jobName: 'Palekar Cream Doughnut', orderQtyKg: 500, status: 'In Production' },
    challans: [{ id: 'DC-1', orderId: 'ORD-2026-224', status: 'Issued', items: [{ quantity: '500', unit: 'Kg' }] }],
    sfgGoods: [printedLot({ sfgBatchCode: 'SFG-BC-ORD-2026-224-1', isPrintedLot: false })],
    settings: { enabled: true, tolerancePct: 10 }
  });
  assert.equal(decision.action, 'close');
  assert.equal(decision.order.status, 'Completed');
});
