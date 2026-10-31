import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getOrderStageInfo } from '../src/factoryStore.js';
import {
  assessPrintingDeadlineReminder,
  calendarDaysUntil,
  canManageOrderDeadline,
  derivePrintingBlockers,
  nextClientInformed,
  nextDeadlineRevision,
  orderNeedsPrintingDeadlineReminder,
  planPrintingDeadlineNotices,
  plantCalendarDate,
  printingDeadlineReminderRows,
  printingRunStarted,
  stageTrackReachedPrinting,
} from '../src/utils/orderDeadlineReminder.js';

const TODAY = '2026-10-30';

function filmOrder(overrides = {}) {
  return {
    id: 'ORD-44',
    jobName: 'Atta 5kg',
    clientName: 'Sharma Traders',
    orderQtyKg: 500,
    status: 'Scheduled',
    targetDeliveryDate: '2026-10-31',
    deliveryDate: '2026-10-31',
    ...overrides,
  };
}

test('calendar days treat a date two days out as not yet inside the window', () => {
  assert.equal(calendarDaysUntil('2026-11-01', TODAY), 2);
  assert.equal(calendarDaysUntil('2026-10-31', TODAY), 1);
  assert.equal(calendarDaysUntil('2026-10-30', TODAY), 0);
  assert.equal(calendarDaysUntil('2026-10-28', TODAY), -2);
});

test('a job due in under two days that is still before Printing needs a reminder', () => {
  const order = filmOrder();
  const stage = getOrderStageInfo(order, [], []);
  assert.equal(stage.stage, 'Pre-Production');
  assert.equal(stage.pipeline.find((step) => step.id === 'printing').isUpcoming, true);
  assert.equal(orderNeedsPrintingDeadlineReminder(order, stage, { today: TODAY }), true);

  const tomorrow = assessPrintingDeadlineReminder(order, stage, { today: TODAY });
  assert.equal(tomorrow.daysRemaining, 1);
  assert.equal(tomorrow.distanceLabel, 'tomorrow');

  const today = filmOrder({ targetDeliveryDate: '2026-10-30', deliveryDate: '2026-10-30' });
  assert.equal(orderNeedsPrintingDeadlineReminder(today, stage, { today: TODAY }), true);
  assert.equal(assessPrintingDeadlineReminder(today, stage, { today: TODAY }).distanceLabel, 'today');

  const past = filmOrder({ targetDeliveryDate: '2026-10-28', deliveryDate: '2026-10-28' });
  assert.equal(orderNeedsPrintingDeadlineReminder(past, getOrderStageInfo(past, [], []), { today: TODAY }), true);
});

test('the default lead time is 3 days, and a longer gap stays quiet', () => {
  const stage = getOrderStageInfo(filmOrder(), [], []);
  const onTheThirdDay = filmOrder({ targetDeliveryDate: '2026-11-02', deliveryDate: '2026-11-02' });
  assert.equal(calendarDaysUntil('2026-11-02', TODAY), 3);
  assert.equal(orderNeedsPrintingDeadlineReminder(onTheThirdDay, stage, { today: TODAY, leadDays: 3 }), true);
  const insideTwo = filmOrder({ targetDeliveryDate: '2026-11-01', deliveryDate: '2026-11-01' });
  assert.equal(calendarDaysUntil('2026-11-01', TODAY), 2);
  assert.equal(orderNeedsPrintingDeadlineReminder(insideTwo, stage, { today: TODAY, leadDays: 1 }), false);
  assert.equal(orderNeedsPrintingDeadlineReminder(insideTwo, stage, { today: TODAY, leadDays: 2 }), true);

  const later = filmOrder({ targetDeliveryDate: '2026-11-03', deliveryDate: '2026-11-03' });
  assert.equal(orderNeedsPrintingDeadlineReminder(later, getOrderStageInfo(later, [], []), { today: TODAY }), false);

  const done = filmOrder({ status: 'Completed' });
  assert.equal(orderNeedsPrintingDeadlineReminder(done, getOrderStageInfo(done, [], []), { today: TODAY }), false);

  const cylinder = filmOrder({ isCylinderOrder: true, orderType: 'Rotogravure Cylinder' });
  const cylinderStage = getOrderStageInfo(cylinder, [], []);
  assert.equal(stageTrackReachedPrinting(cylinderStage), false);
  assert.equal(orderNeedsPrintingDeadlineReminder(cylinder, cylinderStage, { today: TODAY }), false);
});

test('a print job run excludes the reminder, and the stage track alone does not', () => {
  const order = filmOrder();
  const printed = getOrderStageInfo(order, [{
    orderId: order.id,
    stage: 'Printing',
    sfgType: 'Printed Rolls',
    totalNetKg: 12,
    availableKg: 12,
  }], []);
  assert.equal(printed.stage, 'Printing (Pass 1)');
  assert.equal(stageTrackReachedPrinting(printed), true);
  assert.equal(printingRunStarted(order), false);
  assert.equal(orderNeedsPrintingDeadlineReminder(order, printed, { today: TODAY }), true);

  const running = filmOrder({ printingStatus: 'In Production', printingStartTime: '2026-10-30T02:00:00.000Z' });
  assert.equal(printingRunStarted(running), true);
  assert.equal(orderNeedsPrintingDeadlineReminder(running, printed, { today: TODAY }), false);

  const finishedOnRecord = filmOrder();
  assert.equal(printingRunStarted(finishedOnRecord, [{
    orderId: finishedOnRecord.id,
    printingEndTime: '2026-10-29T10:00:00.000Z',
    printingStatus: 'Completed',
  }]), true);
  assert.equal(orderNeedsPrintingDeadlineReminder(finishedOnRecord, printed, {
    today: TODAY,
    productionRecords: [{ orderId: finishedOnRecord.id, printingEndTime: '2026-10-29T10:00:00.000Z' }],
  }), false);

  const statusOnly = filmOrder({ status: 'In Production', printingStatus: 'In Production' });
  assert.equal(printingRunStarted(statusOnly), false);

  const laminated = getOrderStageInfo(order, [{
    orderId: order.id,
    stage: 'Lamination (Pass 1)',
    sfgType: 'Laminated',
    totalNetKg: 12,
    availableKg: 12,
  }], []);
  assert.equal(laminated.stage, 'Lamination (Pass 1)');
  assert.equal(orderNeedsPrintingDeadlineReminder(order, laminated, { today: TODAY }), true);

  const slit = getOrderStageInfo(order, [], [{ orderId: order.id, qtySlitting: '8' }]);
  assert.equal(slit.stage, 'Slitting & Rewinding');
  assert.equal(orderNeedsPrintingDeadlineReminder(order, slit, { today: TODAY }), true);

  const current = { pipeline: [{ id: 'printing', label: 'Printing', isCurrent: true, isCompleted: false }] };
  const doneStep = { pipeline: [{ id: 'printing', label: 'Printing', isCurrent: false, isCompleted: true }] };
  const waiting = { pipeline: [{ id: 'printing', label: 'Printing', isCurrent: false, isCompleted: false, isUpcoming: true }] };
  assert.equal(stageTrackReachedPrinting(current), true);
  assert.equal(stageTrackReachedPrinting(doneStep), true);
  assert.equal(stageTrackReachedPrinting(waiting), false);
});

test('client informed does not hide a job that is still waiting for the press', () => {
  const stage = getOrderStageInfo(filmOrder(), [], []);
  const toldWhileClose = filmOrder({
    originalDeadline: '2026-10-31',
    revisedDeadline: '2026-10-31',
    clientInformed: true,
    clientInformedBy: 'Sales',
  });
  const quiet = assessPrintingDeadlineReminder(toldWhileClose, stage, { today: TODAY });
  assert.equal(quiet.informedForRevision, true);
  assert.equal(quiet.clockDate, '2026-10-31');
  assert.equal(quiet.approaching, true);
  assert.equal(quiet.active, true);
  assert.equal(quiet.stage, 'due-soon');

  const farAndTold = filmOrder({ revisedDeadline: '2026-11-20', clientInformed: true });
  assert.equal(orderNeedsPrintingDeadlineReminder(farAndTold, stage, { today: TODAY }), false);

  const farNotTold = filmOrder({ revisedDeadline: '2026-11-20', clientInformed: false });
  assert.equal(orderNeedsPrintingDeadlineReminder(farNotTold, stage, { today: TODAY }), false);
  assert.equal(orderNeedsPrintingDeadlineReminder(farNotTold, stage, { today: '2026-11-19' }), true);

  const noRevisedDate = filmOrder({ clientInformed: true });
  assert.equal(orderNeedsPrintingDeadlineReminder(noRevisedDate, stage, { today: TODAY }), true);

  const revisedNear = nextDeadlineRevision(toldWhileClose, {
    revisedDeadline: '2026-10-30',
    reason: 'Press slot moved',
    actor: 'Asha Shah',
    now: '2026-10-30T06:00:00.000Z',
  });
  assert.equal(revisedNear.ok, true);
  assert.equal(revisedNear.order.clientInformed, false);
  assert.equal(orderNeedsPrintingDeadlineReminder(revisedNear.order, stage, { today: TODAY }), true);

  const toldAgain = nextClientInformed(revisedNear.order, {
    informed: true,
    actor: 'Asha Shah',
    now: '2026-10-30T07:00:00.000Z',
  });
  assert.equal(toldAgain.order.clientInformedDeadline, '2026-10-30');
  assert.equal(orderNeedsPrintingDeadlineReminder(toldAgain.order, stage, { today: TODAY }), true);

  const revisedFar = nextDeadlineRevision(toldAgain.order, {
    revisedDeadline: '2026-11-20',
    reason: 'Customer asked for a later date',
    actor: 'Asha Shah',
    now: '2026-10-30T08:00:00.000Z',
  });
  assert.equal(revisedFar.order.clientInformed, false);
  assert.equal(orderNeedsPrintingDeadlineReminder(revisedFar.order, stage, { today: TODAY }), false);
  assert.equal(orderNeedsPrintingDeadlineReminder(revisedFar.order, stage, { today: '2026-11-19' }), true);
});

test('a revision keeps the commercial date and clears client informed', () => {
  const order = filmOrder({
    targetDeliveryDate: '2026-10-31',
    deliveryDate: '2026-10-31',
    clientInformed: true,
    clientInformedBy: 'Asha',
    clientInformedAt: '2026-10-29T10:00:00.000Z',
  });
  const saved = nextDeadlineRevision(order, {
    revisedDeadline: '2026-11-12',
    reason: 'Cylinder not released',
    actor: 'Asha Shah',
    now: '2026-10-30T04:00:00.000Z',
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.order.targetDeliveryDate, '2026-10-31');
  assert.equal(saved.order.deliveryDate, '2026-10-31');
  assert.equal(saved.order.originalDeadline, '2026-10-31');
  assert.equal(saved.order.revisedDeadline, '2026-11-12');
  assert.equal(saved.order.deadlineRevisedBy, 'Asha Shah');
  assert.equal(saved.order.clientInformed, false);
  assert.equal(saved.order.clientInformedBy, null);
  assert.equal(saved.history.eventType, 'revision');
  assert.equal(saved.history.previousDeadline, '2026-10-31');
  assert.match(saved.audit, /Client informed was cleared/);

  const again = nextDeadlineRevision(saved.order, {
    revisedDeadline: '2026-11-12',
    reason: 'Same date',
    actor: 'Asha Shah',
  });
  assert.equal(again.ok, false);

  const missingReason = nextDeadlineRevision(order, {
    revisedDeadline: '2026-11-18',
    reason: '   ',
    actor: 'Asha Shah',
  });
  assert.equal(missingReason.ok, false);
});

test('client informed is recorded for the current revised date and is not an email', () => {
  const order = filmOrder({ revisedDeadline: '2026-11-12' });
  const marked = nextClientInformed(order, {
    informed: true,
    actor: 'Asha Shah',
    now: '2026-10-30T05:00:00.000Z',
  });
  assert.equal(marked.ok, true);
  assert.equal(marked.order.clientInformed, true);
  assert.equal(marked.order.clientInformedBy, 'Asha Shah');
  assert.equal(marked.order.clientInformedDeadline, '2026-11-12');
  assert.equal(marked.history.eventType, 'client_informed');
  assert.match(marked.audit, /2026-11-12/);

  const tooSoon = nextClientInformed(filmOrder(), {
    informed: true,
    actor: 'Asha Shah',
  });
  assert.equal(tooSoon.ok, false);
});

test('plant dates use India time, and overdue rows sort above due soon', () => {
  const instant = new Date('2026-10-30T20:30:00.000Z');
  assert.equal(plantCalendarDate(instant), '2026-10-31');
  assert.equal(calendarDaysUntil('2026-10-31', instant), 0);
  assert.equal(calendarDaysUntil('2026-10-30', instant), -1);

  const overdue = filmOrder({ id: 'ORD-LATE', targetDeliveryDate: '2026-10-28', deliveryDate: '2026-10-28' });
  const due = filmOrder({ id: 'ORD-SOON', targetDeliveryDate: '2026-11-01', deliveryDate: '2026-11-01' });
  const closed = filmOrder({ id: 'ORD-DONE', status: 'Completed', targetDeliveryDate: '2026-10-20', deliveryDate: '2026-10-20' });
  const cancelled = filmOrder({ id: 'ORD-STOP', status: 'Cancelled', targetDeliveryDate: '2026-10-20', deliveryDate: '2026-10-20' });
  const rows = printingDeadlineReminderRows([due, closed, overdue, cancelled], { today: TODAY, leadDays: 3 });
  assert.deepEqual(rows.map((row) => row.order.id), ['ORD-LATE', 'ORD-SOON']);
  assert.equal(rows[0].assessment.stage, 'overdue');
  assert.equal(rows[0].assessment.overdueLabel, 'Overdue by 2 days');
  assert.equal(rows[0].assessment.status, 'Scheduled');
  assert.equal(rows[1].assessment.stage, 'due-soon');
});

test('blockers come from stored purchase, stock, approval, and schedule data', () => {
  const order = filmOrder({
    jobMasterId: 'JM-1',
    materialRequirements: [{
      id: 'REQ-1',
      filmType: 'PET',
      micron: 12,
      widthMm: 500,
      qtyKg: 100,
      poIssued: false,
    }],
  });
  const poNotReleased = derivePrintingBlockers(order, {
    inventoryChecked: true,
    inventory: [],
    schedulesChecked: true,
    schedules: [],
    jobMastersChecked: true,
    jobMasters: [],
    cylindersChecked: true,
    cylinders: [],
  });
  assert.ok(poNotReleased.some((item) => item.label === 'Raw material PO not released'));
  assert.ok(poNotReleased.some((item) => item.label === 'Job Master missing'));
  assert.ok(poNotReleased.some((item) => item.label === 'Cylinder missing'));
  assert.ok(poNotReleased.some((item) => item.label === 'No machine or job scheduled'));
  assert.equal(poNotReleased.some((item) => item.label === 'Artwork missing'), false);

  const covered = filmOrder({
    machineId: 'MAC-1',
    materialRequirements: [{
      id: 'REQ-2',
      filmType: 'PET',
      micron: 12,
      widthMm: 500,
      qtyKg: 40,
      poIssued: true,
      poNumber: 'PO-9',
    }],
  });
  const pending = derivePrintingBlockers(covered, {
    inventoryChecked: true,
    inventory: [],
    purchaseOrdersChecked: true,
    purchaseOrders: [{ poNumber: 'PO-9', linkedOrderId: covered.id, status: 'Pending Delivery' }],
    grnsChecked: true,
    grns: [{ poNumber: 'PO-9', status: 'Pending QC Approval', qcStatus: 'Pending QC' }],
  });
  assert.ok(pending.some((item) => item.label === 'GRN pending QC'));
  assert.equal(pending.some((item) => item.label === 'Raw material PO not released'), false);

  const approvedButShort = derivePrintingBlockers(covered, {
    inventoryChecked: true,
    inventory: [],
    purchaseOrdersChecked: true,
    purchaseOrders: [{ poNumber: 'PO-9', linkedOrderId: covered.id, status: 'Pending Delivery' }],
    grnsChecked: true,
    grns: [{ poNumber: 'PO-9', status: 'Approved', qcStatus: 'Approved' }],
  });
  assert.ok(approvedButShort.some((item) => item.label === 'Material not in stock'));

  const inStock = derivePrintingBlockers(covered, {
    inventoryChecked: true,
    inventory: [{ id: 'INV-PET', filmType: 'PET', micron: 12, widthMm: 500, availableQtyKg: 80, category: 'Film Substrates' }],
    productionRecordsChecked: true,
    productionRecords: [],
    storeIssuesChecked: true,
    storeIssues: [],
    jobMastersChecked: true,
    jobMasters: [{ id: 'JM-9', jobName: covered.jobName, approvedByHead: false, jobCardFileUrl: '' }],
    cylindersChecked: true,
    cylinders: [{ id: 'CYL-9', jobName: covered.jobName, jobMasterId: 'JM-9', approvedByHead: false, artworkUrl: 'https://files/art.pdf' }],
    schedulesChecked: true,
    schedules: [{ orderId: covered.id, machineId: 'MAC-1', status: 'Scheduled' }],
  });
  assert.ok(inStock.some((item) => item.label === 'Material not issued'));
  assert.ok(inStock.some((item) => item.label === 'Job Master not approved'));
  assert.ok(inStock.some((item) => item.label === 'Cylinder not approved'));
  assert.equal(inStock.some((item) => item.label === 'Artwork missing'), false);
  assert.equal(inStock.some((item) => item.label === 'No machine or job scheduled'), false);

  const quiet = derivePrintingBlockers(filmOrder(), {});
  assert.deepEqual(quiet, []);
});

test('stage notices and the daily summary are written once', () => {
  const overdue = filmOrder({ id: 'ORD-LATE', targetDeliveryDate: '2026-10-28', deliveryDate: '2026-10-28', status: 'Scheduled' });
  const due = filmOrder({ id: 'ORD-SOON', targetDeliveryDate: '2026-11-01', deliveryDate: '2026-11-01', status: 'On Hold' });
  const reminders = printingDeadlineReminderRows([overdue, due], { today: TODAY, leadDays: 3 });
  const first = planPrintingDeadlineNotices({ reminders, plantDay: TODAY, existing: [] });
  assert.equal(first.stageNotices.length, 2);
  assert.equal(first.summary.id, 'PRINT-DEADLINE-SUMMARY-2026-10-30');
  assert.equal(first.summary.overdue.length, 1);
  assert.equal(first.summary.dueSoon[0].status, 'On Hold');
  assert.equal(first.summary.overdue[0].label, 'Overdue by 2 days');

  const second = planPrintingDeadlineNotices({
    reminders,
    plantDay: TODAY,
    existing: [...first.stageNotices, first.summary],
  });
  assert.deepEqual(second.stageNotices, []);
  assert.equal(second.summary, null);
  assert.equal(second.existingSummary.id, first.summary.id);

  const becameOverdue = printingDeadlineReminderRows([
    filmOrder({ id: 'ORD-SOON', targetDeliveryDate: '2026-10-29', deliveryDate: '2026-10-29' }),
  ], { today: TODAY, leadDays: 3 });
  const escalated = planPrintingDeadlineNotices({
    reminders: becameOverdue,
    plantDay: TODAY,
    existing: first.stageNotices,
  });
  assert.equal(escalated.stageNotices.length, 1);
  assert.equal(escalated.stageNotices[0].id, 'PRINT-DEADLINE-ORD-SOON-overdue');
  assert.equal(escalated.stageNotices[0].stage, 'overdue');
});

test('only admin and sales manager can see or update the reminder', () => {
  assert.equal(canManageOrderDeadline('Admin'), true);
  assert.equal(canManageOrderDeadline('Sales Manager'), true);
  assert.equal(canManageOrderDeadline('Plant Manager'), false);
  assert.equal(canManageOrderDeadline('Production Manager'), false);
  assert.equal(canManageOrderDeadline('Store Manager'), false);
  assert.equal(canManageOrderDeadline('Printing Operator'), false);
  assert.equal(canManageOrderDeadline('Purchase Manager'), false);
  assert.equal(canManageOrderDeadline(''), false);
});

test('the reminder screen never calls the email API', () => {
  const files = [
    'src/utils/orderDeadlineReminder.js',
    'src/services/orderDeadlineReminder.js',
    'src/components/OrderDeadlineReminder.jsx',
    'src/components/DeadlineReminderBanner.jsx',
  ];
  for (const file of files) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\/api\/send-email/);
    assert.doesNotMatch(source, /sendERPEmailNotification/);
    assert.doesNotMatch(source, /mailto:/);
    assert.doesNotMatch(source, /Review client message/);
    assert.doesNotMatch(source, /localStorage/);
  }
  const screen = fs.readFileSync(new URL('../src/components/OrderDeadlineReminder.jsx', import.meta.url), 'utf8');
  assert.match(screen, /Update the client about the revised date \(WhatsApp\)/);
  assert.match(screen, /Client informed/);
  assert.match(screen, /if \(!canManage \|\| !assessment\.active\) return null/);
  assert.doesNotMatch(screen, /Plant Manager/);
  assert.doesNotMatch(screen, /Production Manager/);
  const ordersScreen = fs.readFileSync(new URL('../src/components/OrderManagement.jsx', import.meta.url), 'utf8');
  const dashboard = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(ordersScreen, /canManageOrderDeadline\(currentUser\)/);
  assert.match(dashboard, /canManageOrderDeadline\(currentUser\)/);
  assert.match(ordersScreen, /canPlanPrinting/);
});
