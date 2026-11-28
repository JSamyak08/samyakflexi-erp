import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canSeeStructureChangeNotice,
  planStructureSync,
  rebuildMaterialLines,
  resetStructureSyncMemory,
  syncJobMasterStructure,
} from '../src/services/structureSync.js';
import { buildOcnAmendment } from '../src/utils/ocnAmendment.js';
import {
  calculateOrderStockReservations,
  getOrderMaterialRequirements,
  isSupersededMaterialLine,
} from '../src/factoryStore.js';

function jobMaster(overrides = {}) {
  return {
    id: 'JM-1',
    skuCode: 'SKU-1',
    jobName: 'Biscuits 50g',
    clientName: 'Acme',
    layers: [
      { filmType: 'PET', micron: 12, widthMm: 520 },
      { filmType: 'Natural GP LD', micron: 40, widthMm: 530 },
    ],
    printWidthMm: 500,
    repeatLengthMm: 400,
    faceLengthMm: 800,
    pouchOpenWidth: 0,
    pouchHeight: 0,
    inkGsm: 1.5,
    adhesiveGsm: 1.5,
    colorsCount: 6,
    ...overrides,
  };
}

function activeOrder(overrides = {}) {
  return {
    id: 'ORD-1',
    jobName: 'Biscuits 50g',
    clientName: 'Acme',
    jobMasterId: 'JM-1',
    status: 'In Progress',
    printingStatus: 'Pending',
    orderQtyKg: 1000,
    printWidthMm: 500,
    repeatLengthMm: 400,
    layers: [
      { filmType: 'PET', micron: 12, widthMm: 520 },
      { filmType: 'Natural GP LD', micron: 40, widthMm: 530 },
    ],
    rawMaterialRequirements: [
      { id: 'REQ-PET', filmType: 'PET', micron: 12, widthMm: 520, qtyKg: 300, poIssued: true, poNumber: 'PO-PET', preferredVendor: 'FlexiPoly Films Ltd' },
      { id: 'REQ-LD', filmType: 'Natural GP LD', micron: 40, widthMm: 530, qtyKg: 700, poIssued: true, poNumber: 'PO-LD', preferredVendor: 'Malwa Extrusions Pvt Ltd' },
    ],
    ...overrides,
  };
}

const changedJob = () => jobMaster({
  layers: [
    { filmType: 'PET', micron: 10, widthMm: 520 },
    { filmType: 'Natural GP LD', micron: 40, widthMm: 530 },
  ],
});

test('no job master change is a no-op', () => {
  const plan = planStructureSync({
    previousJm: jobMaster(),
    updatedJm: jobMaster(),
    orders: [activeOrder()],
    confirmations: [{ id: 'OCN-1', ocnNumber: 'OCN-1', orderId: 'ORD-1', status: 'Confirmed' }],
  });
  assert.equal(plan.changed, false);
  assert.equal(plan.orderWrites.length, 0);
  assert.equal(plan.scheduleWrites.length, 0);
  assert.equal(plan.ocnAmendments.length, 0);
  assert.equal(plan.notice, null);
});

test('a structure change rebuilds lines, supersedes the old PO film, and keeps the PO flag on the film that remains', () => {
  const inventory = [
    { id: 'PET12', itemName: 'PET 12', filmType: 'PET', micron: 12, widthMm: 520, availableQtyKg: 250, allocatedQtyKg: 40 },
    { id: 'PET10', itemName: 'PET 10', filmType: 'PET', micron: 10, widthMm: 520, availableQtyKg: 80, allocatedQtyKg: 40 },
    { id: 'LD', itemName: 'Natural GP LD', filmType: 'Natural GP LD', micron: 40, widthMm: 530, availableQtyKg: 100, allocatedQtyKg: 15 },
  ];
  const allocatedBefore = inventory.map((item) => item.allocatedQtyKg);
  const plan = planStructureSync({
    previousJm: jobMaster(),
    updatedJm: changedJob(),
    orders: [activeOrder()],
    inventory,
    schedules: [
      { id: 'SCHED-DONE', orderId: 'ORD-1', status: 'Completed', filmType: 'PET', micron: 12, widthMm: 500, orderQtyKg: 1000, maxSpeedMpm: 200, rollChangeoverMins: 0, jobChangeoverMins: 0, totalLengthMeters: 10, runTimeMins: 1 },
      { id: 'SCHED-RUN', orderId: 'ORD-1', status: 'In Production', filmType: 'PET', micron: 12, widthMm: 500, orderQtyKg: 1000, maxSpeedMpm: 200, rollChangeoverMins: 20, jobChangeoverMins: 60, totalLengthMeters: 10, runTimeMins: 1, jobName: 'Biscuits 50g', clientName: 'Acme' },
    ],
    confirmations: [{ id: 'SIL/OCN/26-27/12', ocnNumber: 'SIL/OCN/26-27/12', orderId: 'ORD-1', status: 'Confirmed', revisionNo: 0, layers: jobMaster().layers }],
    actor: 'Samyak',
    at: '2026-11-18T05:00:00.000Z',
    noticeId: 'STRUCT-TEST-1',
  });

  assert.equal(plan.changed, true);
  assert.equal(plan.structureChanged, true);
  assert.equal(plan.orderWrites.length, 1);
  const lines = plan.orderWrites[0].rawMaterialRequirements;
  const superseded = lines.filter(isSupersededMaterialLine);
  assert.equal(superseded.length, 1);
  assert.equal(superseded[0].filmType, 'PET');
  assert.equal(Number(superseded[0].micron), 12);
  assert.equal(superseded[0].poNumber, 'PO-PET');
  assert.equal(superseded[0].status, 'PO issued – superseded spec');

  const pet10 = lines.find((line) => line.filmType === 'PET' && Number(line.micron) === 10 && !isSupersededMaterialLine(line));
  assert.ok(pet10);
  assert.equal(pet10.poIssued, false);
  assert.equal(pet10.poNumber, '');
  assert.ok(pet10.qtyKg > 0);

  const ld = lines.find((line) => line.filmType === 'Natural GP LD' && !isSupersededMaterialLine(line));
  assert.equal(ld.poNumber, 'PO-LD');
  assert.equal(ld.poIssued, true);
  assert.equal(plan.orderWrites[0].jobDetails.layers[0].filmType, 'PET');
  assert.equal(Number(plan.orderWrites[0].jobDetails.layers[0].micron), 10);
  assert.equal(plan.orderWrites[0].jobDetails.jobMasterId, 'JM-1');

  assert.deepEqual(plan.scheduleWrites.map((row) => row.id), ['SCHED-RUN']);
  assert.equal(plan.scheduleWrites[0].filmType, 'PET');
  assert.equal(Number(plan.scheduleWrites[0].micron), 10);

  assert.equal(plan.ocnAmendments.length, 1);
  const amended = buildOcnAmendment(plan.ocnAmendments[0].ocn, plan.ocnAmendments[0].patch, 'Samyak');
  assert.equal(amended.revisionNo, 1);
  assert.equal(amended.amendmentNo, 'Rev 01');
  assert.equal(Number(amended.layers[0].micron), 10);

  const modules = plan.notice.orders.find((row) => row.orderId === 'ORD-1' && !row.skipped).modules.map((item) => item.module);
  assert.ok(modules.includes('Order'));
  assert.ok(modules.includes('Material lines and reservations'));
  assert.ok(modules.includes('Printing scheduler'));
  assert.ok(modules.includes('OCN amendment'));
  assert.ok(modules.includes('Superseded PO lines'));
  assert.match(plan.notice.message, /Samyak/);
  assert.equal(plan.notice.type, 'STRUCTURE_CHANGED');

  assert.deepEqual(inventory.map((item) => item.allocatedQtyKg), allocatedBefore);
  const stock = calculateOrderStockReservations(plan.orderWrites, inventory, [], { enabled: true });
  const supersededInfo = stock.getReqStockInfo(superseded[0], 'ORD-1');
  assert.equal(supersededInfo.reservedKg, 0);
  assert.equal(supersededInfo.balanceKg, 0);
  lines.filter((line) => !isSupersededMaterialLine(line)).forEach((line) => {
    const info = stock.getReqStockInfo(line, 'ORD-1');
    assert.ok(info.balanceKg <= info.grossKg);
    assert.ok(info.balanceKg <= Number((info.grossKg - info.reservedKg).toFixed(2)) + 0.001);
    assert.equal(info.reservedKg <= info.grossKg, true);
  });
  const pool = stock.pool.PET12;
  assert.equal(pool.totalReservedKg, 0);
});

test('completed, dispatched and cancelled orders stay untouched, including while another order is printing or on hold', () => {
  const orders = [
    activeOrder({ id: 'DONE', status: 'Completed' }),
    activeOrder({ id: 'SHIP', status: 'Dispatched' }),
    activeOrder({ id: 'STOP', status: 'Cancelled' }),
    activeOrder({ id: 'US', status: 'Canceled' }),
    activeOrder({ id: 'CLOSED', status: 'Closed' }),
    activeOrder({ id: 'DELIVERED', status: 'Delivered' }),
    activeOrder({ id: 'PRINT', status: 'In Production', printingStatus: 'In Production' }),
    activeOrder({ id: 'HOLD', status: 'On Hold', printingStatus: 'Hold on Printing' }),
    activeOrder({ id: 'PRINTED', status: 'In Progress', printingStatus: 'Completed' }),
    activeOrder({ id: 'BALANCE', status: 'Balance Dispatch Pending' }),
  ];
  const plan = planStructureSync({
    previousJm: jobMaster(),
    updatedJm: changedJob(),
    orders,
  });
  assert.deepEqual(plan.orderWrites.map((row) => row.id).sort(), ['BALANCE', 'HOLD', 'PRINT', 'PRINTED']);
  ['DONE', 'SHIP', 'STOP', 'US', 'CLOSED', 'DELIVERED'].forEach((id) => {
    assert.equal(plan.orderWrites.some((row) => row.id === id), false);
    assert.ok(plan.skipped.some((row) => row.orderId === id));
  });
});

test('orders that match only by job name are ignored', () => {
  const named = activeOrder({ id: 'NAME-ONLY', jobMasterId: '', jobName: 'Biscuits 50g' });
  const plan = planStructureSync({
    previousJm: jobMaster(),
    updatedJm: changedJob(),
    orders: [named],
  });
  assert.equal(plan.orderWrites.length, 0);
  assert.equal(plan.ignoredNameOnly.length, 1);
  assert.equal(plan.ignoredNameOnly[0].orderId, 'NAME-ONLY');
  assert.match(plan.notice.orders.find((row) => row.orderId === 'NAME-ONLY').modules[0].detail, /job name only/i);
});

test('a different job name still syncs when the job master id matches', () => {
  const plan = planStructureSync({
    previousJm: jobMaster(),
    updatedJm: changedJob(),
    orders: [activeOrder({ id: 'BY-ID', jobName: 'A different printed name' })],
  });
  assert.deepEqual(plan.orderWrites.map((row) => row.id), ['BY-ID']);
  assert.equal(plan.ignoredNameOnly.length, 0);
});

test('artwork and station inks update the order without rebuilding lines or amending the OCN', () => {
  const plan = planStructureSync({
    previousJm: jobMaster(),
    updatedJm: jobMaster({
      artworkUrl: 'https://files.example/art.pdf',
      stationWiseInks: [{ stationNo: 1, shadeName: 'Cyan', productCode: 'INK-1' }],
      colorsCount: 1,
    }),
    orders: [activeOrder()],
    confirmations: [{ id: 'OCN-1', ocnNumber: 'OCN-1', orderId: 'ORD-1', status: 'Confirmed', revisionNo: 0 }],
  });
  assert.equal(plan.structureChanged, false);
  assert.equal(plan.ocnAmendments.length, 0);
  assert.equal(plan.orderWrites[0].artworkUrl, 'https://files.example/art.pdf');
  assert.equal(plan.orderWrites[0].rawMaterialRequirements[0].poNumber, 'PO-PET');
  assert.equal(isSupersededMaterialLine(plan.orderWrites[0].rawMaterialRequirements[0]), false);
  assert.equal(plan.orderWrites[0].rawMaterialRequirements.filter(isSupersededMaterialLine).length, 0);
});

test('requirement recalculation does not move a PO flag onto the film that now sits in that array slot', () => {
  const resolved = getOrderMaterialRequirements({
    id: 'ORD-SWAP',
    orderQtyKg: 1000,
    printWidthMm: 500,
    repeatLengthMm: 400,
    _forceRecalculateRequirements: true,
    layers: [
      { filmType: 'Natural GP LD', micron: 40, widthMm: 530 },
      { filmType: 'PET', micron: 12, widthMm: 520 },
    ],
    materialRequirements: [
      { id: 'REQ-PET', filmType: 'PET', micron: 12, widthMm: 520, qtyKg: 100, poIssued: true, poNumber: 'PO-PET', preferredVendor: 'FlexiPoly Films Ltd' },
      { id: 'REQ-LD', filmType: 'Natural GP LD', micron: 40, widthMm: 530, qtyKg: 200, poIssued: false, poNumber: '', preferredVendor: 'Malwa Extrusions Pvt Ltd' },
    ],
  });
  const pet = resolved.find((line) => line.filmType === 'PET');
  const ld = resolved.find((line) => line.filmType === 'Natural GP LD');
  assert.equal(pet.poNumber, 'PO-PET');
  assert.equal(pet.poIssued, true);
  assert.equal(ld.poIssued, false);
  assert.equal(ld.poNumber, '');
});

test('rebuild keeps a PO line that no longer matches and does not copy it by position', () => {
  const rebuilt = rebuildMaterialLines(activeOrder(), changedJob());
  const freshPet = rebuilt.lines.find((line) => line.filmType === 'PET' && Number(line.micron) === 10);
  assert.equal(freshPet.poIssued, false);
  assert.equal(rebuilt.superseded[0].poNumber, 'PO-PET');
  assert.notEqual(freshPet.id, 'REQ-PET');
});

test('the cylinder job card double save syncs orders once', async () => {
  resetStructureSyncMemory();
  let calls = 0;
  const previous = jobMaster();
  const updated = changedJob();
  const orders = [activeOrder()];
  const apply = async (plan) => {
    calls += 1;
    return { orders: plan.orderWrites, schedules: plan.scheduleWrites || [], failures: [] };
  };
  await Promise.all([
    syncJobMasterStructure(updated, { previousJobMaster: previous, orders, apply, confirmations: [] }),
    syncJobMasterStructure(updated, { previousJobMaster: previous, orders, apply, confirmations: [] }),
  ]);
  assert.equal(calls, 1);
  resetStructureSyncMemory();
});

test('job card artwork, file removal, and press station inks save through the job master update', () => {
  const directory = fs.readFileSync(new URL('../src/components/JobMasterDirectory.jsx', import.meta.url), 'utf8');
  const scheduler = fs.readFileSync(new URL('../src/components/ProductionScheduler.jsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const upload = directory.slice(directory.indexOf('const handleFileUpload'), directory.indexOf('const handleRemoveFile'));
  const remove = directory.slice(directory.indexOf('const handleRemoveFile'), directory.indexOf('const renderJobMasterModals'));
  assert.match(upload, /if \(onUpdateJobMaster\) await onUpdateJobMaster\(updatedJob\)/);
  assert.match(remove, /if \(onUpdateJobMaster\) await onUpdateJobMaster\(updatedJob\)/);
  assert.doesNotMatch(upload, /if \(onAddJobMaster\) onAddJobMaster\(updatedJob\)/);
  assert.doesNotMatch(remove, /if \(onAddJobMaster\) onAddJobMaster\(updatedJob\)/);
  assert.match(scheduler, /if \(onUpdateJobMaster\) await onUpdateJobMaster\(updatedJM\)/);
  assert.match(app, /onUpdateJobMaster=\{handleUpdateJobMaster\}/);
  assert.doesNotMatch(app, /syncJobMasterToOrders/);
  assert.doesNotMatch(app, /targetJobName && \(o\.jobName/);
});

test('store and purchase roles see the notice, including as a second assigned role', () => {
  assert.equal(canSeeStructureChangeNotice({ role: 'Printing Operator', assigned_roles: ['Store Manager'] }), true);
  assert.equal(canSeeStructureChangeNotice({ role: 'Shop Floor Operator', roles: ['Purchase Manager'] }), true);
  assert.equal(canSeeStructureChangeNotice('Sales Manager'), true);
  assert.equal(canSeeStructureChangeNotice('Admin'), true);
  assert.equal(canSeeStructureChangeNotice({ role: 'QC Chemist' }), false);
  assert.equal(canSeeStructureChangeNotice({ role: 'Printing Operator' }), false);
});
