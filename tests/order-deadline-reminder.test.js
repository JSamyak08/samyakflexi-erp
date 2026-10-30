import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getOrderStageInfo } from '../src/factoryStore.js';
import {
  assessPrintingDeadlineReminder,
  calendarDaysUntil,
  canManageOrderDeadline,
  nextClientInformed,
  nextDeadlineRevision,
  orderNeedsPrintingDeadlineReminder,
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

test('two days out, a completed job, and a cylinder job stay quiet', () => {
  const later = filmOrder({ targetDeliveryDate: '2026-11-01', deliveryDate: '2026-11-01' });
  assert.equal(orderNeedsPrintingDeadlineReminder(later, getOrderStageInfo(later, [], []), { today: TODAY }), false);

  const done = filmOrder({ status: 'Completed' });
  assert.equal(orderNeedsPrintingDeadlineReminder(done, getOrderStageInfo(done, [], []), { today: TODAY }), false);

  const cylinder = filmOrder({ isCylinderOrder: true, orderType: 'Rotogravure Cylinder' });
  const cylinderStage = getOrderStageInfo(cylinder, [], []);
  assert.equal(stageTrackReachedPrinting(cylinderStage), false);
  assert.equal(orderNeedsPrintingDeadlineReminder(cylinder, cylinderStage, { today: TODAY }), false);
});

test('Printing and every later stage on the track are excluded', () => {
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
  assert.equal(orderNeedsPrintingDeadlineReminder(order, printed, { today: TODAY }), false);

  const laminated = getOrderStageInfo(order, [{
    orderId: order.id,
    stage: 'Lamination (Pass 1)',
    sfgType: 'Laminated',
    totalNetKg: 12,
    availableKg: 12,
  }], []);
  assert.equal(laminated.stage, 'Lamination (Pass 1)');
  assert.equal(orderNeedsPrintingDeadlineReminder(order, laminated, { today: TODAY }), false);

  const slit = getOrderStageInfo(order, [], [{ orderId: order.id, qtySlitting: '8' }]);
  assert.equal(slit.stage, 'Slitting & Rewinding');
  assert.equal(orderNeedsPrintingDeadlineReminder(order, slit, { today: TODAY }), false);

  const current = { pipeline: [{ id: 'printing', label: 'Printing', isCurrent: true, isCompleted: false }] };
  const doneStep = { pipeline: [{ id: 'printing', label: 'Printing', isCurrent: false, isCompleted: true }] };
  const waiting = { pipeline: [{ id: 'printing', label: 'Printing', isCurrent: false, isCompleted: false, isUpcoming: true }] };
  assert.equal(stageTrackReachedPrinting(current), true);
  assert.equal(stageTrackReachedPrinting(doneStep), true);
  assert.equal(stageTrackReachedPrinting(waiting), false);
});

test('client informed quiets the current revision even inside 2 days, and a new date starts again', () => {
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
  assert.equal(quiet.active, false);

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
  assert.equal(orderNeedsPrintingDeadlineReminder(toldAgain.order, stage, { today: TODAY }), false);

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
  assert.match(ordersScreen, /canManageOrderDeadline\(currentUser\?\.role\)/);
  assert.match(dashboard, /canManageOrderDeadline\(currentUser\?\.role\)/);
  assert.match(ordersScreen, /canPlanPrinting/);
});
