import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { printingDeadlineReminderRows } from '../src/utils/orderDeadlineReminder.js';
import {
  PRINTING_DEADLINE_PAGE_SIZE,
  collapsedStorageKey,
  pageOf,
  readCollapsed,
  writeCollapsed,
} from '../src/utils/printingDeadlinePaging.js';

const TODAY = '2026-10-30';

function order(id, date) {
  return {
    id,
    jobName: id,
    status: 'Scheduled',
    targetDeliveryDate: date,
    deliveryDate: date,
  };
}

function memoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
}

test('each deadline list shows 7 rows and hides the pager at 7 or fewer', () => {
  assert.equal(PRINTING_DEADLINE_PAGE_SIZE, 7);
  const seven = pageOf(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 1);
  assert.equal(seven.showControls, false);
  assert.equal(seven.pageCount, 1);
  assert.equal(seven.showingFrom, 1);
  assert.equal(seven.showingTo, 7);
  assert.equal(seven.total, 7);

  const eight = Array.from({ length: 8 }, (_, index) => index + 1);
  const first = pageOf(eight, 1);
  assert.equal(first.showControls, true);
  assert.equal(first.page, 1);
  assert.equal(first.pageCount, 2);
  assert.deepEqual(first.items, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(first.showingFrom, 1);
  assert.equal(first.showingTo, 7);
  const second = pageOf(eight, 2);
  assert.deepEqual(second.items, [8]);
  assert.equal(second.showingFrom, 8);
  assert.equal(second.showingTo, 8);
  assert.equal(second.page, 2);
});

test('a refresh that removes the current page resets to page 1 without reordering', () => {
  const sixteen = Array.from({ length: 16 }, (_, index) => `row-${index + 1}`);
  assert.equal(pageOf(sixteen, 3).page, 3);
  assert.deepEqual(pageOf(sixteen, 3).items, ['row-15', 'row-16']);
  const shortened = sixteen.slice(0, 7);
  const reset = pageOf(shortened, 3);
  assert.equal(reset.page, 1);
  assert.deepEqual(reset.items, shortened);
  assert.equal(pageOf(sixteen, 0).page, 1);
  assert.equal(pageOf(sixteen, 99).page, 1);
  assert.deepEqual(pageOf(sixteen, 99).items, sixteen.slice(0, 7));
});

test('pages keep the overdue-first reminder order', () => {
  const orders = [];
  for (let day = 20; day <= 29; day += 1) {
    orders.push(order(`ORD-O-${day}`, `2026-10-${day}`));
  }
  for (const date of ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-10-30', '2026-11-01']) {
    orders.push(order(`ORD-D-${orders.length}`, date));
  }
  const rows = printingDeadlineReminderRows(orders, { today: TODAY, leadDays: 3 });
  assert.equal(rows.length, 16);
  assert.equal(rows[0].assessment.stage, 'overdue');
  assert.equal(rows[0].order.id, 'ORD-O-20');
  assert.ok(rows[0].assessment.daysRemaining < rows[6].assessment.daysRemaining);
  const page1 = pageOf(rows, 1);
  const page2 = pageOf(rows, 2);
  assert.equal(page1.items.length, 7);
  assert.equal(page1.items[0].order.id, 'ORD-O-20');
  assert.equal(page1.items.every((item) => item.assessment.stage === 'overdue'), true);
  assert.equal(page2.items[0].order.id, rows[7].order.id);
  assert.equal(page2.items[0].assessment.daysRemaining >= page1.items[6].assessment.daysRemaining, true);
  assert.equal(pageOf(rows, 4).page, 1);
});

test('collapsed state is remembered per user and defaults to expanded', () => {
  const storage = memoryStorage();
  const adminList = collapsedStorageKey('list', 'admin-1');
  const adminSummary = collapsedStorageKey('summary', 'admin-1');
  const salesList = collapsedStorageKey('list', 'sales-2');
  assert.notEqual(adminList, adminSummary);
  assert.notEqual(adminList, salesList);
  assert.equal(readCollapsed(storage, adminList), false);
  assert.equal(readCollapsed(null, adminList), false);
  writeCollapsed(storage, adminList, true);
  assert.equal(readCollapsed(storage, adminList), true);
  assert.equal(readCollapsed(storage, salesList), false);
  assert.equal(readCollapsed(storage, adminSummary), false);
  writeCollapsed(storage, adminSummary, true);
  writeCollapsed(storage, adminList, false);
  assert.equal(readCollapsed(storage, adminList), false);
  assert.equal(readCollapsed(storage, adminSummary), true);
});

test('both deadline sections collapse and page without dropping links or dismiss', () => {
  const banner = fs.readFileSync(new URL('../src/components/DeadlineReminderBanner.jsx', import.meta.url), 'utf8');
  const summary = fs.readFileSync(new URL('../src/components/PrintingDeadlineSummaryCard.jsx', import.meta.url), 'utf8');
  const section = fs.readFileSync(new URL('../src/components/printingDeadlineSection.jsx', import.meta.url), 'utf8');
  for (const source of [banner, summary, section]) {
    assert.doesNotMatch(source, /\/api\/send-email/);
    assert.doesNotMatch(source, /sendERPEmailNotification/);
    assert.doesNotMatch(source, /\.sort\(/);
  }
  assert.match(banner, /Plan printing/);
  assert.match(banner, /Dismiss for now/);
  assert.match(banner, /useCollapsedSection\('list'/);
  assert.match(banner, /printing-deadline-toggle/);
  assert.match(banner, /data-collapsed/);
  assert.match(summary, /useCollapsedSection\('summary'/);
  assert.match(summary, /printing-deadline-summary-toggle/);
  assert.match(summary, /buildHref\('orders'/);
  assert.match(section, /Showing \{view\.showingFrom\}–\{view\.showingTo\} of \{view\.total\}/);
  assert.match(section, /Page \{view\.page\} of \{view\.pageCount\}/);
  assert.match(section, /localStorage/);
  assert.doesNotMatch(banner, /localStorage/);
  assert.doesNotMatch(summary, /localStorage/);
});
