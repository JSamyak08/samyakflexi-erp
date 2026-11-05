/**
 * Printing queue reorder.
 *
 * The stored sequence is the order of ids in press_board.queue_order.
 * Position 1 is index 0. A saved sequence is unique and contiguous: blanks
 * and duplicates are dropped, and nothing is left between the remaining ids.
 * Two writers each replace the whole array. The later commit wins, and the
 * database trigger normalizes that array so the winner cannot contain gaps
 * or repeated positions.
 *
 * Running jobs stay pinned at the front. Reorder gestures never open the
 * Active Print Run modal; only an explicit open does.
 */

import { isActivePrintRun } from './printRunConflict.js';

export const PRESS_QUEUE_REORDER_ROLES = ['Admin', 'Plant Manager', 'Production Manager'];

const EXPLICIT_RUN_MODAL = new Set(['view-run', 'banner-open', 'start-job']);

export function runningPressOrderIds(orders) {
  const ids = [];
  const seen = new Set();
  (orders || []).forEach((order) => {
    if (!order || !isActivePrintRun(order)) return;
    const id = String(order.id ?? '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

export function sameQueueIds(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

/**
 * Unique, contiguous id sequence. Running ids are pinned first, in the
 * order they already had. When knownIds is set, unknown ids are dropped and
 * missing known ids are appended (running ones join the pinned front).
 */
export function normalizePressQueue(ids, { runningIds = [], knownIds = null } = {}) {
  const running = new Set((runningIds || []).map((id) => String(id)));
  const known = Array.isArray(knownIds) ? knownIds.map((id) => String(id)) : null;
  const knownSet = known ? new Set(known) : null;
  const seen = new Set();
  const pinned = [];
  const rest = [];

  const take = (value) => {
    const id = String(value ?? '').trim();
    if (!id || seen.has(id)) return;
    if (knownSet && !knownSet.has(id)) return;
    seen.add(id);
    if (running.has(id)) pinned.push(id);
    else rest.push(id);
  };

  (Array.isArray(ids) ? ids : []).forEach(take);
  if (known) known.forEach(take);
  return [...pinned, ...rest];
}

function placeBefore(order, id, targetId) {
  const without = order.filter((item) => item !== id);
  const index = without.indexOf(targetId);
  if (index < 0) return order.slice();
  const next = without.slice();
  next.splice(index, 0, id);
  return next;
}

export function movePressQueueItem(fullIds, orderId, direction, { runningIds = [], visibleIds = null } = {}) {
  const running = (runningIds || []).map((id) => String(id));
  const order = normalizePressQueue(fullIds, { runningIds: running });
  const visible = (visibleIds ? [...visibleIds].map((id) => String(id)) : order).filter((id) => order.includes(id));
  const id = String(orderId ?? '').trim();
  const runningSet = new Set(running);
  if (!id || runningSet.has(id)) return { order, moved: false, reason: 'running' };
  const visIdx = visible.indexOf(id);
  if (visIdx < 0) return { order, moved: false, reason: 'missing' };

  if (direction === 'top') {
    const anchor = visible.find((item) => !runningSet.has(item));
    if (!anchor || anchor === id) return { order, moved: false, reason: 'edge' };
    const next = normalizePressQueue(placeBefore(order, id, anchor), { runningIds: running });
    return { order: next, moved: !sameQueueIds(order, next) };
  }

  const delta = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  if (!delta) return { order, moved: false, reason: 'direction' };
  const targetIdx = visIdx + delta;
  if (targetIdx < 0 || targetIdx >= visible.length) return { order, moved: false, reason: 'edge' };
  const targetId = visible[targetIdx];
  if (runningSet.has(targetId)) return { order, moved: false, reason: 'locked' };
  const next = order.slice();
  const from = next.indexOf(id);
  const to = next.indexOf(targetId);
  next[from] = targetId;
  next[to] = id;
  return { order: normalizePressQueue(next, { runningIds: running }), moved: true };
}

export function dropPressQueueItem(fullIds, draggedId, targetId, { runningIds = [] } = {}) {
  const running = (runningIds || []).map((id) => String(id));
  const order = normalizePressQueue(fullIds, { runningIds: running });
  const from = String(draggedId ?? '').trim();
  const to = String(targetId ?? '').trim();
  const runningSet = new Set(running);
  if (!from || !to || from === to) return { order, moved: false, reason: 'same' };
  if (runningSet.has(from) || runningSet.has(to)) return { order, moved: false, reason: 'locked' };
  if (!order.includes(from) || !order.includes(to)) return { order, moved: false, reason: 'missing' };
  const next = normalizePressQueue(placeBefore(order, from, to), { runningIds: running });
  return { order: next, moved: !sameQueueIds(order, next), reason: sameQueueIds(order, next) ? 'same' : 'dropped' };
}

export function queueMoveAvailability(visibleIds, index, runningIds = []) {
  const visible = [...(visibleIds || [])].map((id) => String(id));
  const running = new Set((runningIds || []).map((id) => String(id)));
  const id = visible[index];
  const selfRunning = Boolean(id) && running.has(id);
  const prev = index > 0 ? visible[index - 1] : null;
  const next = index < visible.length - 1 ? visible[index + 1] : null;
  const firstWaiting = visible.findIndex((item) => !running.has(item));
  return {
    up: !selfRunning && index > 0 && !(prev && running.has(prev)),
    down: !selfRunning && next != null && !(next && running.has(next)),
    top: !selfRunning && firstWaiting !== -1 && index !== firstWaiting,
    drag: !selfRunning,
  };
}

/**
 * Queue refreshes, realtime echoes, and reorder gestures keep the modal as
 * it already is. They never open it. View Run, the running-job banner, and
 * a successful Start Job do.
 */
export function resolveActiveRunModal(current, event = {}) {
  const type = String(event.type || '');
  if (type === 'close') return null;
  if (EXPLICIT_RUN_MODAL.has(type)) return event.job || null;
  return current || null;
}

export function guardReorderEvent(event, { allowDefault = false } = {}) {
  if (!event) return;
  if (!allowDefault && typeof event.preventDefault === 'function') event.preventDefault();
  if (typeof event.stopPropagation === 'function') event.stopPropagation();
}

/**
 * Coalesce a burst of local sequences into one save of the latest array.
 * A newer push replaces an unsent snapshot. A push that arrives while a
 * save is in flight is written after that save, so the last sequence wins.
 */
export function createQueueSaveBatch({ delayMs = 400, save, onStatus } = {}) {
  let timer = null;
  let hideTimer = null;
  let pendingOrder = null;
  let pendingEpoch = 0;
  let inflight = false;
  let waiters = [];

  const notify = (status) => {
    if (typeof onStatus === 'function') onStatus(status);
  };

  const settle = (error, epoch) => {
    const current = waiters;
    waiters = [];
    current.forEach((waiter) => {
      if (error) waiter.reject(error);
      else waiter.resolve(epoch);
    });
  };

  const flush = () => {
    timer = null;
    if (pendingOrder == null || inflight) return;
    const order = pendingOrder;
    const epoch = pendingEpoch;
    pendingOrder = null;
    inflight = true;
    notify('saving');
    Promise.resolve()
      .then(() => (typeof save === 'function' ? save(order) : null))
      .then(() => {
        inflight = false;
        if (pendingOrder == null) {
          settle(null, epoch);
          notify('saved');
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(() => notify('idle'), 5000);
        } else {
          flush();
        }
      })
      .catch((error) => {
        inflight = false;
        if (pendingOrder == null) {
          settle(error, epoch);
          notify('failed');
        } else {
          flush();
        }
      });
  };

  const enqueue = (order, epoch, immediate) => {
    pendingOrder = order;
    pendingEpoch = epoch;
    notify(immediate ? 'saving' : 'pending');
    if (timer) clearTimeout(timer);
    timer = null;
    const promise = new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
    if (immediate) flush();
    else timer = setTimeout(flush, delayMs);
    return promise;
  };

  return {
    push(order, epoch = 0) {
      return enqueue(order, epoch, false);
    },
    flushNow(order, epoch = 0) {
      return enqueue(order, epoch, true);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
    },
    get hasPending() {
      return pendingOrder != null || inflight;
    },
  };
}
