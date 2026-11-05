import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { userHasAnyRole } from '../src/assignedRoles.js';
import {
  PRESS_QUEUE_REORDER_ROLES,
  createQueueSaveBatch,
  dropPressQueueItem,
  guardReorderEvent,
  movePressQueueItem,
  normalizePressQueue,
  queueMoveAvailability,
  resolveActiveRunModal,
  sameQueueIds,
} from '../src/utils/pressQueueReorder.js';

const running = { id: 'RUN', printingStatus: 'In Production', printingStartTime: '2026-11-05T06:00:00.000Z' };
const waiting = (id) => ({ id, printingStatus: 'Pending' });

test('a queue sequence is unique and contiguous, with the running job pinned first', () => {
  const normalized = normalizePressQueue(
    ['B', 'RUN', 'B', '', '  A  ', null, 'C', 'RUN'],
    { runningIds: ['RUN'], knownIds: ['RUN', 'A', 'B', 'C', 'D'] },
  );
  assert.deepEqual(normalized, ['RUN', 'B', 'A', 'C', 'D']);
  assert.equal(new Set(normalized).size, normalized.length);
  normalized.forEach((id, index) => {
    assert.equal(normalized.indexOf(id), index);
  });
});

test('up and down stop at the ends and cannot pass a running job', () => {
  const order = ['RUN', 'A', 'B', 'C'];
  const runningIds = ['RUN'];
  assert.equal(movePressQueueItem(order, 'A', 'up', { runningIds }).moved, false);
  assert.equal(movePressQueueItem(order, 'RUN', 'down', { runningIds }).reason, 'running');
  assert.deepEqual(movePressQueueItem(order, 'C', 'up', { runningIds }).order, ['RUN', 'A', 'C', 'B']);
  assert.deepEqual(movePressQueueItem(order, 'B', 'down', { runningIds }).order, ['RUN', 'A', 'C', 'B']);
  assert.equal(movePressQueueItem(order, 'C', 'down', { runningIds }).reason, 'edge');

  const top = movePressQueueItem(['RUN', 'A', 'B', 'C'], 'C', 'top', { runningIds });
  assert.deepEqual(top.order, ['RUN', 'C', 'A', 'B']);
  assert.equal(movePressQueueItem(top.order, 'C', 'top', { runningIds }).moved, false);

  const availability = queueMoveAvailability(['RUN', 'A', 'B'], 1, ['RUN']);
  assert.equal(availability.up, false);
  assert.equal(availability.down, true);
  assert.equal(availability.top, false);
  assert.equal(availability.drag, true);
  assert.deepEqual(queueMoveAvailability(['RUN', 'A', 'B'], 0, ['RUN']), {
    up: false,
    down: false,
    top: false,
    drag: false,
  });
  const last = queueMoveAvailability(['RUN', 'A', 'B'], 2, ['RUN']);
  assert.equal(last.down, false);
  assert.equal(last.top, true);
});

test('a drop inserts before the target and will not displace a running job', () => {
  const runningIds = ['RUN'];
  assert.deepEqual(
    dropPressQueueItem(['RUN', 'A', 'B', 'C'], 'C', 'A', { runningIds }).order,
    ['RUN', 'C', 'A', 'B'],
  );
  assert.equal(dropPressQueueItem(['RUN', 'A', 'B'], 'B', 'RUN', { runningIds }).reason, 'locked');
  assert.equal(dropPressQueueItem(['RUN', 'A', 'B'], 'A', 'A', { runningIds }).moved, false);
});

test('five moves in a row save once, and the later save wins', async () => {
  const saves = [];
  const batch = createQueueSaveBatch({
    delayMs: 40,
    save: async (order) => {
      saves.push(order);
    },
  });
  let order = ['RUN', 'A', 'B', 'C', 'D', 'E'];
  const runningIds = ['RUN'];
  const moves = [
    ['B', 'up'],
    ['C', 'up'],
    ['D', 'down'],
    ['E', 'top'],
    ['C', 'down'],
  ];
  const pending = [];
  for (const [id, direction] of moves) {
    const result = movePressQueueItem(order, id, direction, { runningIds });
    assert.equal(result.moved, true);
    order = result.order;
    pending.push(batch.push(order, pending.length + 1));
  }
  assert.deepEqual(saves, []);
  const savedEpoch = await pending.at(-1);
  assert.equal(savedEpoch, 5);
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0], order);
  assert.equal(order[0], 'RUN');
  assert.equal(new Set(order).size, order.length);
  assert.ok(sameQueueIds(order, normalizePressQueue(order, { runningIds })));

  const later = createQueueSaveBatch({
    delayMs: 20,
    save: async (next) => {
      saves.push(next);
    },
  });
  const first = later.push(['RUN', 'A', 'B'], 1);
  const second = later.push(['RUN', 'B', 'A'], 2);
  const epoch = await second;
  await first;
  assert.equal(epoch, 2);
  assert.deepEqual(saves.at(-1), ['RUN', 'B', 'A']);
  batch.cancel();
  later.cancel();
});

test('arrow, drag, refresh, and realtime do not open the active run modal', () => {
  const job = waiting('A');
  let modal = null;
  for (const type of ['arrow', 'drag', 'move-top', 'queue-refresh', 'realtime', 'reorder-save']) {
    modal = resolveActiveRunModal(modal, { type, job: running, savedJob: running, activeOrder: running });
    assert.equal(modal, null, type);
  }
  modal = resolveActiveRunModal(null, { type: 'view-run', job });
  assert.equal(modal, job);
  modal = resolveActiveRunModal(modal, { type: 'arrow', job: running, savedJob: running });
  assert.equal(modal, job);
  modal = resolveActiveRunModal(modal, { type: 'banner-open', job: running });
  assert.equal(modal, running);
  modal = resolveActiveRunModal(modal, { type: 'close' });
  assert.equal(modal, null);
  assert.equal(resolveActiveRunModal(null, { type: 'start-job', job: running }), running);
});

test('an arrow click is swallowed before a card click can open the run', () => {
  let opened = false;
  let moved = false;
  const event = {
    defaultPrevented: false,
    stopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  const openIfNotStopped = () => {
    if (!event.stopped) opened = true;
  };
  guardReorderEvent(event);
  moved = true;
  openIfNotStopped();
  assert.equal(moved, true);
  assert.equal(opened, false);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.stopped, true);

  const cardClick = { opened: false };
  const parent = {
    preventDefault() {},
    stopPropagation() {},
    stopped: false,
  };
  parent.stopPropagation = () => { parent.stopped = true; };
  guardReorderEvent(parent);
  if (!parent.stopped) cardClick.opened = true;
  assert.equal(cardClick.opened, false);
});

test('printing and shop floor operators cannot reorder, and managers still can', () => {
  assert.equal(userHasAnyRole({ role: 'Admin' }, PRESS_QUEUE_REORDER_ROLES), true);
  assert.equal(userHasAnyRole({ role: 'Plant Manager' }, PRESS_QUEUE_REORDER_ROLES), true);
  assert.equal(userHasAnyRole({ role: 'Production Manager' }, PRESS_QUEUE_REORDER_ROLES), true);
  assert.equal(userHasAnyRole({ role: 'Printing Operator' }, PRESS_QUEUE_REORDER_ROLES), false);
  assert.equal(userHasAnyRole({ role: 'Shop Floor Operator' }, PRESS_QUEUE_REORDER_ROLES), false);
  assert.equal(userHasAnyRole({ role: 'Sales Manager', roles: ['Sales Manager', 'Printing Operator'] }, PRESS_QUEUE_REORDER_ROLES), false);

  const scheduler = fs.readFileSync(new URL('../src/components/ProductionScheduler.jsx', import.meta.url), 'utf8');
  assert.match(scheduler, /PRESS_QUEUE_REORDER_ROLES/);
  assert.doesNotMatch(scheduler, /setActiveRunningJobState\(activeInOrders\)/);
  assert.doesNotMatch(scheduler, /setActiveRunningJobState\(initialPressActiveRunningJob\)/);
  assert.match(scheduler, /type: 'queue-refresh'/);
  assert.match(scheduler, /noteReorderDoesNotOpenRun/);
});

test('arrow click does not open the active print run modal', async () => {
  const { Window } = await import('happy-dom');
  const win = new Window({ url: 'http://localhost/printing' });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
  };
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.Node = win.Node;
  globalThis.Event = win.Event;
  globalThis.MouseEvent = win.MouseEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const mod = await server.ssrLoadModule('/src/components/PressQueueReorderControls.jsx');
    const Controls = mod.default;
    const html = renderToStaticMarkup(React.createElement(Controls, {
      orderId: 'B',
      position: 3,
      canUp: true,
      canDown: true,
      canTop: true,
      canDrag: true,
    }));
    assert.match(html, /data-testid="queue-move-up"/);
    assert.match(html, /type="button"/);
    assert.match(html, /data-testid="queue-drag-handle"/);
    assert.match(html, /data-testid="queue-move-top"/);

    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    const host = win.document.createElement('div');
    win.document.body.appendChild(host);
    const root = createRoot(host);
    let modal = null;
    let order = ['RUN', 'A', 'B', 'C'];
    const runningIds = ['RUN'];

    function Harness() {
      return React.createElement(
        'div',
        {
          'data-testid': 'job-card',
          onClick: () => { modal = running; },
        },
        React.createElement(Controls, {
          orderId: 'B',
          position: 3,
          canUp: true,
          canDown: true,
          canTop: true,
          canDrag: true,
          onUp: () => {
            const result = movePressQueueItem(order, 'B', 'up', { runningIds });
            order = result.order;
            modal = resolveActiveRunModal(modal, { type: 'arrow', job: running, savedJob: running });
          },
          onDown: () => {
            const result = movePressQueueItem(order, 'B', 'down', { runningIds });
            order = result.order;
            modal = resolveActiveRunModal(modal, { type: 'arrow', job: running, savedJob: running });
          },
        }),
      );
    }

    await act(async () => {
      root.render(React.createElement(Harness));
    });
    const up = win.document.querySelector('[data-testid="queue-move-up"]');
    assert.ok(up);
    await act(async () => {
      up.click();
    });
    assert.equal(modal, null);
    assert.deepEqual(order, ['RUN', 'B', 'A', 'C']);
    assert.equal(win.document.querySelector('[data-testid="active-print-run-modal"]'), null);

    await act(async () => {
      up.click();
    });
    assert.equal(modal, null);
    assert.equal(movePressQueueItem(order, 'B', 'up', { runningIds }).moved, false);

    const down = win.document.querySelector('[data-testid="queue-move-down"]');
    await act(async () => {
      down.click();
      down.click();
    });
    assert.equal(modal, null);
    assert.deepEqual(order, ['RUN', 'A', 'C', 'B']);
    await act(async () => {
      root.unmount();
    });
  } finally {
    await server.close();
    win.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.Event = previous.Event;
    globalThis.MouseEvent = previous.MouseEvent;
  }
});
