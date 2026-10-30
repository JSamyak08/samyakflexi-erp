import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getOrderStageInfo } from '../src/factoryStore.js';
import {
  assessPrintingDeadlineReminder,
  buildClientDelayMessage,
  calendarDaysUntil,
  canManageOrderDeadline,
  mailtoHref,
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

test('the reminder quiets only after a revised date and client informed, then returns when that date nears', () => {
  const order = filmOrder({
    originalDeadline: '2026-10-31',
    revisedDeadline: '2026-11-20',
    clientInformed: true,
  });
  const stage = getOrderStageInfo(order, [], []);
  const quiet = assessPrintingDeadlineReminder(order, stage, { today: TODAY });
  assert.equal(quiet.quieted, true);
  assert.equal(quiet.clockDate, '2026-11-20');
  assert.equal(quiet.active, false);

  const notTold = filmOrder({ revisedDeadline: '2026-11-20', clientInformed: false });
  assert.equal(orderNeedsPrintingDeadlineReminder(notTold, stage, { today: TODAY }), true);

  const noDate = filmOrder({ clientInformed: true });
  assert.equal(orderNeedsPrintingDeadlineReminder(noDate, stage, { today: TODAY }), true);

  const stillClose = filmOrder({
    revisedDeadline: '2026-10-31',
    clientInformed: true,
    clientInformedBy: 'Sales',
  });
  const again = assessPrintingDeadlineReminder(stillClose, stage, { today: TODAY });
  assert.equal(again.clockDate, '2026-10-31');
  assert.equal(again.active, true);
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

test('client informed records who and when, and does not invent a send', () => {
  const order = filmOrder({ revisedDeadline: '2026-11-12' });
  const marked = nextClientInformed(order, {
    informed: true,
    actor: 'Asha Shah',
    now: '2026-10-30T05:00:00.000Z',
  });
  assert.equal(marked.ok, true);
  assert.equal(marked.order.clientInformed, true);
  assert.equal(marked.order.clientInformedBy, 'Asha Shah');
  assert.equal(marked.order.revisedDeadline, '2026-11-12');
  assert.equal(marked.history.eventType, 'client_informed');

  const draft = buildClientDelayMessage(marked.order, { contactPerson: 'Ravi' });
  assert.equal(draft.to, '');
  assert.equal(draft.sendsAutomatically, false);
  assert.match(draft.subject, /Atta 5kg/);
  assert.match(draft.body, /Original delivery date: 2026-10-31/);
  assert.match(draft.body, /Revised delivery date: 2026-11-12/);
  assert.match(draft.body, /Hello Ravi/);
  const href = mailtoHref(draft);
  assert.match(href, /^mailto:/);
  assert.doesNotMatch(href, /send-email/);
  assert.doesNotMatch(href, /api/);
});

test('only sales, plant, production, and admin can update the reminder', () => {
  assert.equal(canManageOrderDeadline('Admin'), true);
  assert.equal(canManageOrderDeadline('Plant Manager'), true);
  assert.equal(canManageOrderDeadline('Production Manager'), true);
  assert.equal(canManageOrderDeadline('Sales Manager'), true);
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
    assert.doesNotMatch(source, /localStorage/);
  }
});
