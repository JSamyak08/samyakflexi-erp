import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  attendanceCalendarDate,
  attendanceMatchesEmployeeDate,
  attendanceSaveErrorText,
  buildEmployeeAttendanceRow,
  factoryCalendarDate,
  mapEmployeeAttendanceRow
} from '../src/services/employeeAttendance.js';

const migrationName = '20261022091500_employee_attendance_ot_window.sql';
const migrationSql = fs.readFileSync(
  new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
  'utf8'
);

const baselineColumns = [
  'id',
  'employee_id',
  'date',
  'shift_type',
  'shift_hours',
  'status',
  'check_in',
  'check_out',
  'total_hours_worked',
  'overtime_hours',
  'overtime_reason',
  'overtime_status',
  'overtime_approved_by',
  'overtime_approved_date',
  'dinner_allowance_eligible',
  'marked_by',
  'created_at',
  'updated_at',
  'pto_hours'
];

test('attendance migration is additive and later than the privilege guard', () => {
  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  const names = fs.readdirSync(dir).filter((name) => name.endsWith('.sql'));
  assert.ok(names.includes(migrationName));
  assert.ok(Number(migrationName.slice(0, 14)) > 20261022060000);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS overtime_start_time text/i);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS overtime_end_time text/i);
  assert.doesNotMatch(migrationSql, /DROP TABLE|DROP COLUMN|ALTER COLUMN/i);
});

test('saved attendance row only uses columns the migration can store', () => {
  const added = [...migrationSql.matchAll(/ADD COLUMN IF NOT EXISTS ([a-z0-9_]+)/gi)].map((match) => match[1]);
  const row = buildEmployeeAttendanceRow({
    id: 'ATT-20261022-EMP-1',
    employeeId: 'EMP-1',
    date: '22/10/2026',
    status: 'Present',
    shiftType: 'Shift A: Day (08:00 - 20:00)',
    shiftHours: 12,
    checkIn: '08:00',
    checkOut: '20:00',
    totalHoursWorked: 12,
    overtimeHours: 1,
    overtimeStartTime: '20:00',
    overtimeEndTime: '21:00',
    ptoHours: 0,
    overtimeReason: 'Extended run',
    overtimeStatus: 'Pending Approval',
    markedBy: 'QA Admin'
  });

  assert.equal(row.date, '2026-10-22');
  assert.equal(row.overtime_start_time, '20:00');
  assert.equal(row.overtime_end_time, '21:00');
  for (const column of Object.keys(row)) {
    assert.ok(
      baselineColumns.includes(column) || added.includes(column),
      `${column} is written but is not in the baseline table or the new migration`
    );
  }
});

test('a marked row is recognized across ISO timestamps, DD/MM dates, and id types', () => {
  const stored = mapEmployeeAttendanceRow({
    id: 'ATT-20261022-15',
    employee_id: 15,
    date: '2026-10-22T00:00:00+00:00',
    status: 'Present',
    overtime_start_time: '20:00',
    overtime_end_time: '21:00'
  });
  assert.equal(stored.date, '2026-10-22');
  assert.equal(stored.employeeId, 15);
  assert.equal(attendanceMatchesEmployeeDate(stored, '15', '22/10/2026'), true);
  assert.equal(attendanceMatchesEmployeeDate(stored, '15', '2026-10-23'), false);
  assert.equal(attendanceMatchesEmployeeDate(stored, '16', '2026-10-22'), false);
  assert.equal(attendanceCalendarDate('22/10/2026'), '2026-10-22');
});

test('the shift register day follows India time, not UTC', () => {
  const justAfterMidnightIst = new Date('2026-10-21T19:00:00.000Z');
  assert.equal(factoryCalendarDate(justAfterMidnightIst), '2026-10-22');
  assert.equal(justAfterMidnightIst.toISOString().slice(0, 10), '2026-10-21');
});

test('a database rejection is reported as an error', () => {
  const text = attendanceSaveErrorText({
    code: 'PGRST204',
    message: "Could not find the 'overtime_end_time' column of 'employee_attendance' in the schema cache"
  });
  assert.match(text, /overtime_end_time/);
  assert.equal(attendanceSaveErrorText(null), 'The database rejected the attendance record.');
});

test('the new columns accept an attendance insert', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.employee_attendance (
      id text PRIMARY KEY,
      employee_id text NOT NULL,
      date date NOT NULL,
      status text NOT NULL,
      overtime_hours numeric DEFAULT 0,
      updated_at timestamptz
    );
  `);
  await db.exec(migrationSql);
  await db.query(
    `INSERT INTO public.employee_attendance
      (id, employee_id, date, status, overtime_start_time, overtime_end_time)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    ['ATT-20261022-EMP-1', 'EMP-1', '2026-10-22', 'Present', '20:00', '21:00']
  );
  const { rows } = await db.query(
    `SELECT date::text AS date, status, overtime_start_time, overtime_end_time
     FROM public.employee_attendance WHERE id = $1`,
    ['ATT-20261022-EMP-1']
  );
  assert.equal(rows[0].date, '2026-10-22');
  assert.equal(rows[0].status, 'Present');
  assert.equal(rows[0].overtime_start_time, '20:00');
  assert.equal(rows[0].overtime_end_time, '21:00');
  await db.close();
});
