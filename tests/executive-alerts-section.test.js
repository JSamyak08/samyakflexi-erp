import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('ExecutiveAlertsSection component exists and contains structured warnings hub', () => {
  const componentPath = path.join(rootDir, 'src', 'components', 'ExecutiveAlertsSection.jsx');
  assert.ok(fs.existsSync(componentPath), 'ExecutiveAlertsSection.jsx must exist');

  const source = fs.readFileSync(componentPath, 'utf8');

  // Verify props and export
  assert.match(source, /export default function ExecutiveAlertsSection/);
  assert.match(source, /delayedOrders/);
  assert.match(source, /delayedOrdersCount/);
  assert.match(source, /printingDeadlineReminders/);
  assert.match(source, /lowStockInks/);
  assert.match(source, /canPlanPrinting/);
  assert.match(source, /canManageDeadline/);
  assert.match(source, /onNavigateTab/);

  // Verify UI elements: category filtering, collapse toggle, action buttons
  assert.match(source, /Operational Warnings & Action Center/);
  assert.match(source, /All Warnings/);
  assert.match(source, /Delivery Overdue/);
  assert.match(source, /Print Deadlines/);
  assert.match(source, /Low Inks/);
  assert.match(source, /samyak_exec_alerts_collapsed/);
  assert.match(source, /Manage/);
  assert.match(source, /Schedule/);
  assert.match(source, /Reorder/);
});

test('App.jsx renders Metrics Overview Grid first and ExecutiveAlertsSection right below it', () => {
  const appPath = path.join(rootDir, 'src', 'App.jsx');
  const source = fs.readFileSync(appPath, 'utf8');

  // Verify import
  assert.match(source, /import ExecutiveAlertsSection from '\.\/components\/ExecutiveAlertsSection'/);

  // Verify ExecutiveAlertsSection usage in dashboard
  assert.match(source, /<ExecutiveAlertsSection/);
  assert.match(source, /canManageOrderDeadline\(currentUser\)/);

  // Verify ordering: Metrics Overview Grid appears BEFORE ExecutiveAlertsSection in activeTab === 'dashboard'
  const dashboardIndex = source.indexOf("activeTab === 'dashboard'");
  assert.ok(dashboardIndex > 0, 'Dashboard section must be present in App.jsx');

  const dashboardSlice = source.slice(dashboardIndex);
  const metricsGridIndex = dashboardSlice.indexOf('Metrics Overview Grid');
  const alertsSectionIndex = dashboardSlice.indexOf('<ExecutiveAlertsSection');

  assert.ok(metricsGridIndex > 0, 'Metrics Overview Grid must be present in dashboard');
  assert.ok(alertsSectionIndex > 0, 'ExecutiveAlertsSection must be present in dashboard');
  assert.ok(metricsGridIndex < alertsSectionIndex, 'Metrics Overview Grid must appear BEFORE ExecutiveAlertsSection so KPIs are at the top');
});

test('OrderManagement preserves DeadlineReminderBanner and PrintingDeadlineSummaryCard', () => {
  const orderMgmtPath = path.join(rootDir, 'src', 'components', 'OrderManagement.jsx');
  const source = fs.readFileSync(orderMgmtPath, 'utf8');

  assert.match(source, /DeadlineReminderBanner/);
  assert.match(source, /PrintingDeadlineSummaryCard/);
});
