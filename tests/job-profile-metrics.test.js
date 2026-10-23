import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGsmValue,
  calculateUtilisation,
  getJobPrintedQtyKg,
  getCylinderPrintedQtyKg,
  productionRecordPrintedKg
} from '../src/dataStore.js';

test('parseGsmValue keeps 0 and positive numbers, and defaults only when unset', () => {
  assert.equal(parseGsmValue(0), 0);
  assert.equal(parseGsmValue('0'), 0);
  assert.equal(parseGsmValue(2.5), 2.5);
  assert.equal(parseGsmValue('3.2'), 3.2);
  assert.equal(parseGsmValue(''), 1.5);
  assert.equal(parseGsmValue(null), 1.5);
  assert.equal(parseGsmValue(undefined), 1.5);
  assert.equal(parseGsmValue('abc'), 1.5);
});

test('calculateUtilisation uses printed kilograms and stays a percentage', () => {
  assert.equal(calculateUtilisation(0, 10000), '0.0');
  assert.equal(calculateUtilisation(8000, 10000), '80.0');
  assert.equal(calculateUtilisation(15000, 10000), '100.0');
  assert.equal(calculateUtilisation(undefined, 10000), '0.0');
});

test('job printed quantity comes from production records, not a stored cylinder placeholder', () => {
  const job = { id: 'JM-1', skuCode: 'SKU-1', jobName: 'Purasure Premium Tea 1Kg', utilisationLimit: 10000 };
  const cylinder = {
    id: 'CYL-1',
    sku: 'SKU-1',
    jobName: 'Purasure Premium Tea 1Kg',
    jobMasterId: 'JM-1',
    dispatchedQty: 0,
    layer1PrintedQtyKg: 385,
    utilisationLimit: 10000
  };
  const firstPrint = {
    id: 'REC-1',
    orderId: 'ORD-1',
    jobName: 'Purasure Premium Tea 1Kg',
    qtyFirstPassL1: 63.9,
    printedOutputKg: 63.9,
    grossProductionKg: 63.9
  };

  assert.equal(getJobPrintedQtyKg(job, { productionRecords: [], orders: [], cylinder }), 0);
  assert.equal(getJobPrintedQtyKg(job, { productionRecords: [firstPrint], orders: [], cylinder }), 63.9);

  const secondPrint = {
    id: 'REC-2',
    orderId: 'ORD-2',
    jobMasterId: 'JM-1',
    qtyFirstPassL1: 0,
    printedOutputKg: 40,
    grossProductionKg: 40
  };
  assert.equal(
    getJobPrintedQtyKg(job, { productionRecords: [firstPrint, secondPrint], orders: [], cylinder }),
    103.9
  );
  assert.equal(productionRecordPrintedKg(secondPrint), 40);
});

test('order printed quantity is included once when no production record exists', () => {
  const job = { id: 'JM-2', jobName: 'Black Light Inner', skuCode: 'SKU-2' };
  const order = { id: 'ORD-9', jobMasterId: 'JM-2', jobName: 'Black Light Inner', printedOutputKg: 49 };
  const record = { id: 'REC-9', orderId: 'ORD-9', jobName: 'Black Light Inner', qtyFirstPassL1: 49, printedOutputKg: 49 };

  assert.equal(getJobPrintedQtyKg(job, { productionRecords: [], orders: [order] }), 49);
  assert.equal(getJobPrintedQtyKg(job, { productionRecords: [record], orders: [order] }), 49);
});

test('cylinder directory still prefers actual print quantity over the stored placeholder', () => {
  const cylinder = {
    id: 'CYL-9',
    sku: 'SKU-9',
    jobName: 'Super 30 Inner',
    layer1PrintedQtyKg: 385,
    dispatchedQty: 0
  };
  assert.equal(getCylinderPrintedQtyKg(cylinder, [], []), 385);

  const record = { id: 'REC-3', jobName: 'Super 30 Inner', qtyFirstPassL1: 270, grossProductionKg: 270 };
  assert.equal(getCylinderPrintedQtyKg(cylinder, [record], []), 270);
});
