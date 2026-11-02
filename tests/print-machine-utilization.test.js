import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildPrintMachineUtilization } from '../src/utils/printMachineUtilization.js';
import { DEFAULT_PRINTING_SHIFTS, normalizePrintingShifts, rangeForView } from '../src/utils/printingShifts.js';
import {
  buildPrintUtilizationPdf,
  buildPrintUtilizationSheet,
  buildPrintUtilizationWorkbook,
  PRINT_UTILIZATION_HEADERS
} from '../src/utils/printUtilizationExport.js';
import {
  duplicateActiveGroups,
  findActivePrintConflict,
  parseActivePrintRunConflict
} from '../src/utils/printRunConflict.js';
import { canViewPrintRunAnalytics } from '../src/utils/printRunAccess.js';
import { generateFullRolePermissions, applyPrintRunAnalyticsBoundary, grantAllRolePermissions } from '../src/factoryStore.js';

function ist(date, time) {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

const shifts = DEFAULT_PRINTING_SHIFTS;

test('an open run counts until now and does not invent idle after it', () => {
  const report = buildPrintMachineUtilization({
    runs: [{
      orderId: 'ORD-1',
      machineId: 'MAC-1',
      jobName: 'Peas Pouch',
      operatorName: 'Ravi',
      startedAt: ist('2026-11-01', '08:00'),
      endedAt: null
    }],
    rangeStart: ist('2026-11-01', '00:00'),
    rangeEnd: ist('2026-11-02', '00:00'),
    asOf: ist('2026-11-01', '10:30'),
    shifts
  });
  assert.equal(report.runCount, 1);
  assert.equal(report.gapCount, 0);
  assert.ok(Math.abs(report.runMinutes - 150) < 0.01);
  assert.equal(report.idleMinutes, 0);
  assert.equal(report.segments.length, 1);
  assert.equal(report.segments[0].shiftName, 'Day');
  assert.equal(report.segments[0].operatorName, 'Ravi');
});

test('runs and gaps that cross a shift or midnight are split in IST', () => {
  const report = buildPrintMachineUtilization({
    runs: [
      {
        orderId: 'ORD-1',
        machineId: 'MAC-1',
        jobName: 'First',
        operatorName: 'Ravi',
        startedAt: ist('2026-11-01', '18:00'),
        endedAt: ist('2026-11-01', '19:30')
      },
      {
        orderId: 'ORD-2',
        machineId: 'MAC-1',
        jobName: 'Second',
        operatorName: 'Mina',
        startedAt: ist('2026-11-01', '22:00'),
        endedAt: ist('2026-11-02', '02:00')
      }
    ],
    rangeStart: ist('2026-11-01', '00:00'),
    rangeEnd: ist('2026-11-02', '00:00'),
    asOf: ist('2026-11-03', '12:00'),
    shifts
  });
  const day = report.segments.filter((segment) => segment.kind === 'run' && segment.shiftName === 'Day');
  const night = report.segments.filter((segment) => segment.kind === 'run' && segment.shiftName === 'Night');
  assert.equal(day.length, 1);
  assert.ok(Math.abs(day[0].durationMinutes - 90) < 0.01);
  assert.equal(night.length, 1);
  assert.ok(Math.abs(night[0].durationMinutes - 120) < 0.01);
  assert.equal(report.runCount, 2);
  const idle = report.segments.filter((segment) => segment.kind === 'idle');
  assert.equal(idle.length, 2);
  const idleDay = idle.find((segment) => segment.shiftName === 'Day');
  const idleNight = idle.find((segment) => segment.shiftName === 'Night');
  assert.ok(Math.abs(idleDay.durationMinutes - 30) < 0.01);
  assert.ok(Math.abs(idleNight.durationMinutes - 120) < 0.01);
  assert.match(idleNight.jobName, /First/);
  assert.match(idleNight.jobName, /Second/);

  const nextDay = buildPrintMachineUtilization({
    runs: [
      {
        orderId: 'ORD-2',
        machineId: 'MAC-1',
        jobName: 'Second',
        startedAt: ist('2026-11-01', '22:00'),
        endedAt: ist('2026-11-02', '02:00')
      },
      {
        orderId: 'ORD-3',
        machineId: 'MAC-1',
        jobName: 'Third',
        startedAt: ist('2026-11-02', '06:00'),
        endedAt: ist('2026-11-02', '09:00')
      }
    ],
    rangeStart: ist('2026-11-02', '00:00'),
    rangeEnd: ist('2026-11-03', '00:00'),
    asOf: ist('2026-11-03', '12:00'),
    shifts
  });
  const nightTail = nextDay.segments.find((segment) => segment.kind === 'run' && segment.shiftName === 'Night' && segment.orderId === 'ORD-2');
  const dayPart = nextDay.segments.find((segment) => segment.kind === 'run' && segment.orderId === 'ORD-3' && segment.shiftName === 'Day');
  const idleMorning = nextDay.segments.find((segment) => segment.kind === 'idle' && segment.shiftName === 'Night');
  assert.ok(Math.abs(nightTail.durationMinutes - 120) < 0.01);
  assert.ok(Math.abs(dayPart.durationMinutes - 60) < 0.01);
  assert.ok(Math.abs(idleMorning.durationMinutes - 240) < 0.01);
  assert.equal(nextDay.runCount, 2);
  assert.ok(nextDay.longestIdle.durationMinutes > 240 - 0.01);
});

test('weekly and custom ranges clip gaps and keep run versus idle shares', () => {
  const week = rangeForView({ mode: 'weekly', anchorDate: '2026-11-01' });
  assert.equal(week.fromDate, '2026-10-26');
  assert.equal(week.toDate, '2026-11-01');
  const runs = [
    {
      orderId: 'ORD-1',
      machineId: 'MAC-1',
      jobName: 'Week job',
      startedAt: ist('2026-10-31', '20:00'),
      endedAt: ist('2026-11-01', '04:00')
    },
    {
      orderId: 'ORD-2',
      machineId: 'MAC-1',
      jobName: 'Later',
      startedAt: ist('2026-11-01', '08:00'),
      endedAt: ist('2026-11-01', '10:00')
    }
  ];
  const weekly = buildPrintMachineUtilization({
    runs,
    rangeStart: week.start,
    rangeEnd: week.end,
    asOf: ist('2026-11-02', '12:00'),
    shifts
  });
  assert.equal(weekly.runCount, 2);
  assert.ok(weekly.idleMinutes > 0);
  assert.ok(Math.abs(weekly.runPercent + weekly.idlePercent - 100) < 0.2);

  const custom = rangeForView({ mode: 'custom', fromDate: '2026-11-01', toDate: '2026-10-31' });
  assert.equal(custom.fromDate, '2026-10-31');
  assert.equal(custom.toDate, '2026-11-01');
  const ranged = buildPrintMachineUtilization({
    runs,
    rangeStart: custom.start,
    rangeEnd: custom.end,
    asOf: ist('2026-11-02', '12:00'),
    shifts
  });
  assert.equal(ranged.runCount, 2);

  const filtered = buildPrintMachineUtilization({
    runs: [...runs, {
      orderId: 'ORD-9',
      machineId: 'MAC-9',
      jobName: 'Other press',
      startedAt: ist('2026-11-01', '08:00'),
      endedAt: ist('2026-11-01', '12:00')
    }],
    rangeStart: custom.start,
    rangeEnd: custom.end,
    asOf: ist('2026-11-02', '12:00'),
    shifts,
    machineId: 'MAC-9'
  });
  assert.equal(filtered.runCount, 1);
  assert.equal(filtered.segments.every((segment) => segment.machineId === 'MAC-9'), true);
});

test('edited shifts split a crossing run and invalid settings fall back to the default', () => {
  const customShifts = normalizePrintingShifts([
    { id: 'early', name: 'Early', start: '06:00', end: '14:00' },
    { id: 'late', name: 'Late', start: '14:00', end: '22:00' }
  ]);
  const report = buildPrintMachineUtilization({
    runs: [{
      orderId: 'ORD-1',
      machineId: 'MAC-1',
      jobName: 'Cross',
      startedAt: ist('2026-11-01', '13:00'),
      endedAt: ist('2026-11-01', '15:00')
    }],
    rangeStart: ist('2026-11-01', '00:00'),
    rangeEnd: ist('2026-11-02', '00:00'),
    asOf: ist('2026-11-02', '00:00'),
    shifts: customShifts
  });
  const early = report.segments.find((segment) => segment.shiftName === 'Early');
  const late = report.segments.find((segment) => segment.shiftName === 'Late');
  assert.ok(Math.abs(early.durationMinutes - 60) < 0.01);
  assert.ok(Math.abs(late.durationMinutes - 60) < 0.01);
  assert.deepEqual(normalizePrintingShifts([{ start: 'nope' }]).map((shift) => shift.name), ['Day', 'Night']);
});

test('excel and pdf contain every row, not a single page', () => {
  const runs = Array.from({ length: 12 }, (_, index) => ({
    orderId: `ORD-${index + 1}`,
    machineId: 'MAC-1',
    jobName: `Job ${index + 1}`,
    operatorName: `Operator ${index + 1}`,
    startedAt: ist('2026-11-01', `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '20'}`),
    endedAt: ist('2026-11-01', `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '10' : '30'}`)
  }));
  const report = buildPrintMachineUtilization({
    runs,
    rangeStart: ist('2026-11-01', '00:00'),
    rangeEnd: ist('2026-11-02', '00:00'),
    asOf: ist('2026-11-02', '00:00'),
    shifts
  });
  const page = report.segments.slice(0, 5);
  assert.ok(report.segments.length > page.length);
  const sheet = buildPrintUtilizationSheet(report);
  assert.equal(sheet.length, report.segments.length + 1);
  assert.deepEqual(sheet[0], PRINT_UTILIZATION_HEADERS);
  const workbook = buildPrintUtilizationWorkbook(report, { mode: 'daily', label: '2026-11-01', fromDate: '2026-11-01', toDate: '2026-11-01' });
  const reread = XLSX.utils.sheet_to_json(workbook.Sheets['Runs and gaps'], { header: 1 });
  assert.equal(reread.length, report.segments.length + 1);
  const jobRows = reread.slice(1).filter((row) => String(row[3]).startsWith('Job'));
  assert.equal(jobRows.length, report.segments.filter((segment) => segment.kind === 'run').length);
  const pdf = new TextDecoder().decode(buildPrintUtilizationPdf(report, { mode: 'daily', label: '2026-11-01', fromDate: '2026-11-01', toDate: '2026-11-01' }));
  assert.match(pdf, /^%PDF-1\.4/);
  report.segments.forEach((segment) => {
    if (segment.kind === 'run') assert.match(pdf, new RegExp(segment.jobName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});

test('conflicts name the running job and duplicates are grouped without being closed', () => {
  const orders = [
    { id: 'ORD-1', jobName: 'Peas Pouch', machineId: 'MAC-1', printingStatus: 'In Production', printingStartTime: '2026-11-01T02:30:00.000Z', printingEndTime: null },
    { id: 'ORD-2', jobName: 'Rice Pouch', machineId: 'MAC-1', printingStatus: 'In Production', printingStartTime: '2026-11-01T03:00:00.000Z', printingEndTime: null },
    { id: 'ORD-3', jobName: 'Oil Pouch', machineId: 'MAC-2', printingStatus: 'Pending', printingStartTime: null, printingEndTime: null }
  ];
  const conflict = findActivePrintConflict(orders, { orderId: 'ORD-3', machineId: 'MAC-1' });
  assert.equal(conflict.orderId, 'ORD-1');
  assert.equal(conflict.jobName, 'Peas Pouch');
  assert.equal(findActivePrintConflict(orders, { orderId: 'ORD-3', machineId: 'MAC-2' }), null);
  const groups = duplicateActiveGroups(orders);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].runs.length, 2);
  assert.equal(groups[0].runs[0].printingStartTime !== null, true);

  const parsed = parseActivePrintRunConflict(new Error('PRINT_RUN_BUSY {"orderId":"ORD-1","machineId":"MAC-1","jobName":"Peas Pouch","scope":"machine"}\nAnother print run is still active on machine MAC-1: Peas Pouch (ORD-1). End that run before starting another job.'));
  assert.equal(parsed.orderId, 'ORD-1');
  assert.equal(parsed.jobName, 'Peas Pouch');
  assert.match(parsed.message, /End that run/);

  const loose = [
    { id: 'ORD-A', jobName: 'Loose', printingStatus: 'In Production', printingStartTime: '2026-11-01T02:30:00.000Z', printingEndTime: null },
    { id: 'ORD-B', jobName: 'Pressed', machineId: 'MAC-9', printingStatus: 'In Production', printingStartTime: '2026-11-01T03:00:00.000Z', printingEndTime: null }
  ];
  assert.equal(findActivePrintConflict(loose, { orderId: 'ORD-C', machineId: 'MAC-2' }).orderId, 'ORD-A');
  assert.equal(duplicateActiveGroups(loose)[0].runs.length, 2);
});

test('analytics permission stays with admin, plant manager, and production manager', () => {
  const defaults = generateFullRolePermissions(false);
  assert.equal(defaults.Admin.print_run_analytics, true);
  assert.equal(defaults['Plant Manager'].print_run_analytics, true);
  assert.equal(defaults['Production Manager'].print_run_analytics, true);
  assert.equal(defaults['Printing Operator'].print_run_analytics, false);
  assert.equal(defaults['Shop Floor Operator'].print_run_analytics, false);
  assert.equal(defaults['HR & Payroll Manager'].print_run_analytics, false);
  assert.equal(defaults['Printing Operator'].sfg_store, 'view');

  const granted = applyPrintRunAnalyticsBoundary(grantAllRolePermissions());
  assert.equal(granted['Printing Operator'].print_run_analytics, false);
  assert.equal(granted['Printing Operator'].inventory, true);
  assert.equal(granted.Admin.print_run_analytics, true);

  assert.equal(canViewPrintRunAnalytics({ role: 'Printing Operator' }, defaults), false);
  assert.equal(canViewPrintRunAnalytics({ role: 'Shop Floor Operator' }, defaults), false);
  assert.equal(canViewPrintRunAnalytics({ role: 'Sales Manager', roles: ['Sales Manager', 'Printing Operator'] }, granted), false);
  assert.equal(canViewPrintRunAnalytics({ role: 'Plant Manager' }, defaults), true);
  assert.equal(canViewPrintRunAnalytics({ role: 'Production Manager' }, { 'Production Manager': { print_run_analytics: false } }), false);
  assert.equal(canViewPrintRunAnalytics({ role: 'Admin' }, { Admin: { print_run_analytics: false } }), true);
  assert.equal(canViewPrintRunAnalytics({ role: 'Plant Manager' }, {}), true);
});
