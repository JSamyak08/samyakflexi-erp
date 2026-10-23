/**
 * Employee attendance is stored in public.employee_attendance.
 * Dates are calendar days (YYYY-MM-DD). The factory day is Asia/Kolkata,
 * so a mark made after midnight in Indore is not stored as the previous UTC day.
 */

import { getCompanyProfile, requireCompanyField } from './companyProfile.js';
import { resolveShiftHours } from './operationalConfig.js';

export function attendanceCalendarDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const str = String(value).trim();
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Indian factory dates are DD/MM/YYYY. A timestamp prefix is handled above.
  const dmy = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return '';
}

export function factoryCalendarDate(now = new Date(), timeZone) {
  const zone = timeZone || String(requireCompanyField(getCompanyProfile(), 'timeZone'));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  const year = pick('year');
  const month = pick('month');
  const day = pick('day');
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

export function formatAttendanceHeading(value) {
  const key = attendanceCalendarDate(value);
  if (!key) return '';
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toDateString();
}

export function attendanceMatchesEmployeeDate(record, employeeId, date) {
  if (!record) return false;
  const recordEmployee = record.employeeId ?? record.employee_id;
  const recordDate = attendanceCalendarDate(record.date);
  const targetDate = attendanceCalendarDate(date);
  return recordDate !== ''
    && targetDate !== ''
    && recordDate === targetDate
    && String(recordEmployee ?? '') === String(employeeId ?? '');
}

export function attendanceSaveErrorText(error) {
  const message = error?.message || error?.details || error?.hint;
  if (message) return String(message);
  return 'The database rejected the attendance record.';
}

export function buildEmployeeAttendanceRow(record) {
  const date = attendanceCalendarDate(record?.date);
  const employeeId = record?.employeeId ?? record?.employee_id;
  if (!record?.id || employeeId == null || employeeId === '' || !date) {
    throw new Error('Attendance record is missing an id, employee, or a valid date.');
  }
  if (!record.status) {
    throw new Error('Attendance record is missing a status.');
  }

  return {
    id: String(record.id),
    employee_id: String(employeeId),
    date,
    shift_type: record.shiftType || record.shift_type || '',
    shift_hours: resolveShiftHours(record),
    status: record.status,
    check_in: record.checkIn || record.check_in || '',
    check_out: record.checkOut || record.check_out || '',
    total_hours_worked: record.totalHoursWorked || record.total_hours_worked || 0,
    overtime_hours: record.overtimeHours || record.overtime_hours || 0,
    overtime_start_time: record.overtimeStartTime || record.overtime_start_time || '',
    overtime_end_time: record.overtimeEndTime || record.overtime_end_time || '',
    pto_hours: Number(record.ptoHours ?? record.pto_hours) || 0,
    overtime_reason: record.overtimeReason || record.overtime_reason || '',
    overtime_status: record.overtimeStatus || record.overtime_status || 'Pending Approval',
    overtime_approved_by: record.overtimeApprovedBy || record.overtime_approved_by || '',
    overtime_approved_date: record.overtimeApprovedDate || record.overtime_approved_date || '',
    dinner_allowance_eligible: Boolean(record.dinnerAllowanceEligible ?? record.dinner_allowance_eligible),
    marked_by: record.markedBy || record.marked_by || '',
    updated_at: record.updatedAt || record.updated_at || new Date().toISOString()
  };
}

export function mapEmployeeAttendanceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id || row.employeeId,
    date: attendanceCalendarDate(row.date),
    shiftType: row.shift_type || row.shiftType,
    shiftHours: row.shift_hours == null || row.shift_hours === '' ? null : Number(row.shift_hours),
    status: row.status,
    checkIn: row.check_in || row.checkIn,
    checkOut: row.check_out || row.checkOut,
    totalHoursWorked: Number(row.total_hours_worked || row.totalHoursWorked) || 0,
    overtimeHours: Number(row.overtime_hours || row.overtimeHours) || 0,
    overtimeStartTime: row.overtime_start_time || row.overtimeStartTime || row.overtime_start || '',
    overtimeEndTime: row.overtime_end_time || row.overtimeEndTime || row.overtime_end || '',
    ptoHours: Number(row.pto_hours || row.ptoHours) || 0,
    overtimeReason: row.overtime_reason || row.overtimeReason || '',
    overtimeStatus: row.overtime_status || row.overtimeStatus || 'Pending Approval',
    overtimeApprovedBy: row.overtime_approved_by || row.overtimeApprovedBy || '',
    overtimeApprovedDate: row.overtime_approved_date || row.overtimeApprovedDate || '',
    dinnerAllowanceEligible: row.dinner_allowance_eligible ?? row.dinnerAllowanceEligible ?? false,
    markedBy: row.marked_by || row.markedBy || ''
  };
}
