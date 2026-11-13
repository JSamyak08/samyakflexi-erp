import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  dispatchProductionJobFromRow,
  displayProductionJobName,
  ordersOrDispatchJobs,
  packingListParty,
  withStoredShipmentNames,
} from '../src/utils/dispatchProductionJobs.js';

const service = fs.readFileSync(new URL('../src/services/supabaseDataService.js', import.meta.url), 'utf8');

test('the display name stops before the costing envelope', () => {
  assert.equal(
    displayProductionJobName('QA Flow Finished Goods ||| {"jobDetails":{"calculationDetails":{"rate":99}}}'),
    'QA Flow Finished Goods',
  );
  assert.equal(displayProductionJobName('Plain Job'), 'Plain Job');
  assert.equal(displayProductionJobName(''), 'Untitled Job');
});

test('a dispatch job row keeps only the packing-list fields', () => {
  const job = dispatchProductionJobFromRow({
    id: 'ORD-FG-1',
    job_name: 'QA Flow Finished Goods ||| {"rate":99}',
    client_name: 'Insta Foods',
    status: 'In Production',
    po_number: 'PO-77',
    order_qty_kg: 500,
    job_details: { calculationDetails: { rate: 99 } },
  });
  assert.deepEqual(job, {
    id: 'ORD-FG-1',
    jobName: 'QA Flow Finished Goods',
    clientName: 'Insta Foods',
    customerName: 'Insta Foods',
    status: 'In Production',
    poNo: 'PO-77',
    poNumber: 'PO-77',
  });
  assert.equal('job_details' in job, false);
  assert.equal('order_qty_kg' in job, false);
});

test('a full order list is kept and an empty order read uses the job projection', () => {
  const full = [{ id: 'ORD-1', jobName: 'Kept', clientName: 'Client', orderQtyKg: 10 }];
  const projected = [{ id: 'ORD-2', job_name: 'Projected', client_name: 'Other', status: 'Open', po_number: '' }];
  assert.equal(ordersOrDispatchJobs(full, projected), full);
  assert.deepEqual(ordersOrDispatchJobs([], projected), [{
    id: 'ORD-2',
    jobName: 'Projected',
    clientName: 'Other',
    customerName: 'Other',
    status: 'Open',
    poNo: '',
    poNumber: '',
  }]);
  assert.deepEqual(ordersOrDispatchJobs(null, []), []);
});

test('a blank payload name falls back to the shipment columns', () => {
  const named = withStoredShipmentNames(
    { jobName: 'Stored Job', clientName: 'Stored Client', orderId: 'ORD-1' },
    { job_name: 'Column Job', client_name: 'Column Client', order_id: 'ORD-OTHER' },
  );
  assert.equal(named.jobName, 'Stored Job');
  assert.equal(named.clientName, 'Stored Client');
  assert.equal(named.orderId, 'ORD-1');

  const blank = withStoredShipmentNames(
    { jobName: '', clientName: '   ', orderId: '' },
    { job_name: 'Column Job', client_name: 'Column Client', order_id: 'ORD-9' },
  );
  assert.equal(blank.jobName, 'Column Job');
  assert.equal(blank.clientName, 'Column Client');
  assert.equal(blank.orderId, 'ORD-9');
});

test('the packing list table fills a missing name from the job list', () => {
  const orders = [{ id: 'ORD-FG-1', jobName: 'QA Flow Finished Goods', clientName: 'Insta Foods' }];
  assert.deepEqual(
    packingListParty({ orderId: 'ORD-FG-1', jobName: '', clientName: '' }, orders),
    { jobName: 'QA Flow Finished Goods', clientName: 'Insta Foods' },
  );
  assert.deepEqual(
    packingListParty({ jobName: 'Listed Job', clientName: 'Listed Client' }, orders),
    { jobName: 'Listed Job', clientName: 'Listed Client' },
  );
});

test('order fetch falls back to the dispatch projection only when orders returns nothing', () => {
  const fetchStart = service.indexOf('export async function fetchOrders()');
  const fetchBody = service.slice(fetchStart, service.indexOf('export function orderDuplicateMessage'));
  assert.match(fetchBody, /data\.length === 0/);
  assert.match(fetchBody, /fetchDispatchProductionJobs\(\)/);
  assert.match(service, /from\('dispatch_production_jobs'\)/);
  assert.match(service, /select\('id, job_name, client_name, status, po_number'\)/);
  assert.match(service, /withStoredShipmentNames\(record, d\)/);
  assert.doesNotMatch(service, /eamstsaqkbeiywfaanhi/);
});
