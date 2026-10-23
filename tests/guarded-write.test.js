import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PartialSaveError,
  writeWithRetry,
  unsavedItemsMessage,
  planDispatchSfgDeductions,
  planDispatchRollDeductions,
  commitSequentialUpdates,
  applyCommittedByIndex,
  assertAllSaved
} from '../src/services/guardedWrite.js';

test('writeWithRetry retries a Supabase error object and then returns success', async () => {
  const calls = [];
  const result = await writeWithRetry(() => {
    calls.push('write');
    if (calls.length === 1) return { error: { message: 'new row violates row-level security' } };
    return { data: { id: 'SFG-1' }, error: null };
  });
  assert.equal(calls.length, 2);
  assert.equal(result.data.id, 'SFG-1');
});

test('writeWithRetry throws the last error when every attempt fails', async () => {
  let calls = 0;
  await assert.rejects(
    () => writeWithRetry(() => {
      calls += 1;
      throw new Error('insert into sfg_goods failed');
    }),
    (error) => {
      assert.equal(error.message, 'insert into sfg_goods failed');
      return true;
    }
  );
  assert.equal(calls, 2);
});

test('a failed printed-roll write names the barcode and does not claim the job is fully saved', () => {
  const message = unsavedItemsMessage({
    completed: 'The printing job for "Chips Laminate" was NOT marked complete.',
    failed: [{ label: 'printed roll SFG-BC-JOB-1 in sfg_goods', error: { message: 'null value in column id' } }]
  });
  assert.match(message, /was NOT marked complete/);
  assert.match(message, /SFG-BC-JOB-1/);
  assert.match(message, /was NOT saved/);
  assert.match(message, /null value in column id/);
  assert.match(message, /not shown as saved/);
});

test('packing-list balance plan reduces the matched roll and leaves the other roll alone', () => {
  const goods = [
    { id: 'a', sfgBatchCode: 'FG-100', totalNetKg: 25, availableKg: 25, dispatchedKg: 0, jobName: 'Chips', rollType: 'FG' },
    { id: 'b', sfgBatchCode: 'FG-200', totalNetKg: 10, availableKg: 10, dispatchedKg: 0, jobName: 'Chips', rollType: 'FG' }
  ];
  const plan = planDispatchSfgDeductions(goods, {
    id: 'DISP-1',
    dispatchId: 'PL-9',
    dispatchDate: '2026-10-22',
    totalNetWeightKg: 12.5,
    items: [{ sourceFgBarcode: 'FG-100', netWeightKg: 12.5 }]
  });
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].index, 0);
  assert.equal(plan.updates[0].after.availableKg, 12.5);
  assert.equal(plan.updates[0].after.dispatchedKg, 12.5);
  assert.equal(plan.updates[0].after.status, 'Partially Dispatched');
  assert.equal(plan.updates[0].before.availableKg, 25);
  assert.match(plan.updates[0].label, /FG-100/);
  assert.match(plan.updates[0].label, /12\.5 kg/);
});

test('packing-list balance falls back to the job FG roll when the barcode is not on the list', () => {
  const goods = [
    { id: 'rm', sfgBatchCode: 'SFG-1', totalNetKg: 20, availableKg: 20, jobName: 'Chips', rollType: 'SFG', sfgType: 'Printed Rolls' },
    { id: 'fg', sfgBatchCode: 'FG-9', totalNetKg: 8, availableKg: 8, jobName: 'Chips', rollType: 'FG', orderId: 'ORD-1' }
  ];
  const plan = planDispatchSfgDeductions(goods, {
    id: 'DISP-2',
    dispatchId: 'PL-10',
    dispatchDate: '2026-10-22',
    jobName: 'Chips',
    orderId: 'ORD-1',
    totalNetWeightKg: 5,
    items: [{ barcodeId: 'MISSING', netWeightKg: 5 }]
  });
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].index, 1);
  assert.equal(plan.updates[0].after.availableKg, 3);
  assert.equal(plan.updates[0].after.status, 'Partially Dispatched');
});

test('a failed SFG balance write is not applied to the list that the screen will show', async () => {
  const goods = [
    { id: 'a', sfgBatchCode: 'FG-100', totalNetKg: 25, availableKg: 25, dispatchedKg: 0, rollType: 'FG' },
    { id: 'b', sfgBatchCode: 'FG-200', totalNetKg: 10, availableKg: 10, dispatchedKg: 0, jobName: 'Chips', rollType: 'FG', orderId: 'ORD-1' }
  ];
  const shipment = {
    id: 'DISP-3',
    dispatchId: 'PL-11',
    dispatchDate: '2026-10-22',
    jobName: 'Chips',
    orderId: 'ORD-1',
    totalNetWeightKg: 4,
    items: [
      { sourceFgBarcode: 'FG-100', netWeightKg: 4 },
      { barcodeId: 'FG-200', netWeightKg: 0 }
    ]
  };
  const plan = planDispatchSfgDeductions(goods, shipment);
  const result = await commitSequentialUpdates(plan.updates, async (row) => {
    if (row.sfgBatchCode === 'FG-100') throw new Error('sfg_goods update failed');
    return { error: null };
  }, { attempts: 1 });

  const shown = applyCommittedByIndex(goods, result.committed);
  assert.equal(shown[0].availableKg, 25);
  assert.equal(shown[0].status, undefined);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].label, /FG-100/);

  const message = unsavedItemsMessage({
    completed: 'Packing list PL-11 was saved. Do not create this packing list again.',
    failed: result.failed
  });
  assert.match(message, /Packing list PL-11 was saved/);
  assert.match(message, /Do not create this packing list again/);
  assert.match(message, /FG-100/);
  assert.match(message, /was NOT saved/);
  assert.match(message, /sfg_goods update failed/);
});

test('a later deduction of the same SFG row is skipped when the first write fails', async () => {
  const goods = [
    { id: 'a', sfgBatchCode: 'FG-100', totalNetKg: 25, availableKg: 25, dispatchedKg: 0, jobName: 'Chips', rollType: 'FG', orderId: 'ORD-1' }
  ];
  const plan = planDispatchSfgDeductions(goods, {
    id: 'DISP-4',
    dispatchId: 'PL-12',
    dispatchDate: '2026-10-22',
    jobName: 'Chips',
    orderId: 'ORD-1',
    totalNetWeightKg: 10,
    items: [{ sourceFgBarcode: 'FG-100', netWeightKg: 6 }]
  });
  assert.equal(plan.updates.length, 2);
  const saved = [];
  const result = await commitSequentialUpdates(plan.updates, async (row) => {
    saved.push(row.dispatchedKg);
    if (saved.length === 1) throw new Error('first write failed');
    return { error: null };
  }, { attempts: 1 });
  assert.deepEqual(saved, [6]);
  assert.equal(result.committed.size, 0);
  assert.equal(result.failed.length, 2);
  assert.match(result.failed[1].error.message, /earlier save/);
  assert.equal(applyCommittedByIndex(goods, result.committed)[0].availableKg, 25);
});

test('inventory roll balances stay unchanged when the roll write fails', async () => {
  const rolls = [
    { id: 'r1', barcodeId: 'FG-100', netWeightKg: 20, availableWeightKg: 20, dispatchedKg: 0, rollType: 'FG' }
  ];
  const plan = planDispatchRollDeductions(rolls, {
    id: 'DISP-5',
    dispatchId: 'PL-13',
    totalNetWeightKg: 7,
    items: [{ sourceFgBarcode: 'FG-100', netWeightKg: 7 }]
  });
  const result = await commitSequentialUpdates(plan.updates, async () => {
    throw new Error('inventory_rolls update failed');
  }, { attempts: 1 });
  const shown = applyCommittedByIndex(rolls, result.committed);
  assert.equal(shown[0].availableWeightKg, 20);
  assert.equal(shown[0].status, undefined);
  assert.match(result.failed[0].label, /FG-100/);
});

test('assertAllSaved throws PartialSaveError only when something failed', () => {
  assert.doesNotThrow(() => assertAllSaved('done', []));
  assert.throws(
    () => assertAllSaved('Job master JM-1 was saved.', [{ label: 'order ORD-9', error: new Error('timeout') }]),
    (error) => {
      assert.equal(error.name, 'PartialSaveError');
      assert.match(error.message, /JM-1 was saved/);
      assert.match(error.message, /ORD-9 was NOT saved/);
      assert.match(error.message, /timeout/);
      return true;
    }
  );
});
