import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Calendar, 
  Clock, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Search, 
  Filter, 
  Plus, 
  Edit3, 
  Trash2, 
  UserMinus, 
  Download, 
  Printer, 
  Building2, 
  ShieldCheck, 
  ArrowRight, 
  ChevronRight, 
  Coins, 
  Check, 
  X, 
  Percent, 
  Eye,
  AlertTriangle,
  Sun,
  Moon,
  Briefcase,
  Layers,
  FileSpreadsheet,
  Lock,
  CreditCard,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  BarChart2,
  TrendingUp
} from 'lucide-react';
import TablePagination, { usePagination } from './TablePagination';
import EmployeePayslipPDF from './EmployeePayslipPDF';
import SearchableSelect from './SearchableSelect';
import { 
  EMPLOYEE_DEPARTMENTS, 
  EMPLOYEE_DESIGNATIONS, 
  EMPLOYEE_STATUSES, 
  SHIFT_OPTIONS, 
  calculateEmployeeMonthlySalary
} from '../factoryStore';
import { 
  saveEmployeeToSupabase, 
  deleteEmployeeFromSupabase, 
  saveEmployeeAttendanceToSupabase, 
  saveSalaryAdvanceToSupabase,
  saveSalaryPaymentToSupabase 
} from '../services/supabaseDataService';
import { pushSlugState } from '../utils/slugRouter';
import { roundToTwo, formatUpToTwoDecimals } from '../utils/numberHelpers';

export function calculateOvertimeTimeWindow(att) {
  if (!att) return { otStartTime: '', otEndTime: '', displayStr: '' };

  const startTime = att.overtimeStartTime || att.overtime_start_time || '';
  const endTime = att.overtimeEndTime || att.overtime_end_time || '';
  if (startTime && endTime) {
    return {
      otStartTime: startTime,
      otEndTime: endTime,
      displayStr: `${startTime} - ${endTime}`
    };
  }

  const otHrs = Number(att.overtimeHours || att.overtime_hours) || 0;
  if (otHrs <= 0) {
    return { otStartTime: '', otEndTime: '', displayStr: '' };
  }

  const checkIn = att.checkIn || att.check_in || '';
  const checkOut = att.checkOut || att.check_out || '';
  const shiftHrs = Number(att.shiftHours || att.shift_hours) || 12;

  const formatHHMM = (totalMins) => {
    const norm = (Math.round(totalMins) % 1440 + 1440) % 1440;
    const h = Math.floor(norm / 60);
    const m = norm % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  if (checkOut && checkOut.includes(':')) {
    const [cOutH, cOutM] = checkOut.split(':').map(Number);
    if (!isNaN(cOutH) && !isNaN(cOutM)) {
      const outMins = cOutH * 60 + cOutM;
      const otMins = otHrs * 60;
      const startMins = outMins - otMins;
      const calculatedStart = formatHHMM(startMins);
      const calculatedEnd = formatHHMM(outMins);
      return {
        otStartTime: startTime || calculatedStart,
        otEndTime: endTime || calculatedEnd,
        displayStr: `${startTime || calculatedStart} - ${endTime || calculatedEnd}`
      };
    }
  }

  if (checkIn && checkIn.includes(':')) {
    const [cInH, cInM] = checkIn.split(':').map(Number);
    if (!isNaN(cInH) && !isNaN(cInM)) {
      const inMins = cInH * 60 + cInM;
      const shiftMins = shiftHrs * 60;
      const startMins = inMins + shiftMins;
      const endMins = startMins + (otHrs * 60);
      const calculatedStart = formatHHMM(startMins);
      const calculatedEnd = formatHHMM(endMins);
      return {
        otStartTime: startTime || calculatedStart,
        otEndTime: endTime || calculatedEnd,
        displayStr: `${startTime || calculatedStart} - ${endTime || calculatedEnd}`
      };
    }
  }

  return { otStartTime: startTime, otEndTime: endTime, displayStr: startTime && endTime ? `${startTime} - ${endTime}` : '' };
}

export function getRecordOtPayout(att, employees = []) {
  if (!att) return { hourlyRate: 0, payout: 0, emp: null, fixedGross: 0, shiftHrs: 12 };
  const emp = (employees || []).find(e => String(e.id) === String(att.employeeId));
  const struct = emp?.salaryStructure || {};
  const fixedGross = (Number(struct.basicSalary) || 0) + (Number(struct.hra) || 0) + (Number(struct.otherAllowance) || 0);
  const shiftHrs = Number(emp?.shiftDurationHours) || Number(att.shiftHours) || 12;
  const totalStandardMonthHours = 26 * shiftHrs;
  const hourlyRate = totalStandardMonthHours > 0 ? (fixedGross / totalStandardMonthHours) : 0;
  const otHrs = Number(att.overtimeHours) || 0;
  const payout = Math.round(hourlyRate * otHrs);
  return {
    hourlyRate: Math.round(hourlyRate),
    payout,
    emp,
    fixedGross,
    shiftHrs
  };
}

export function getWeekRangeInfo(dateStr) {
  if (!dateStr) return { key: 'unknown', label: 'Unknown Week', start: '', end: '', sortKey: '0000-00-00', weekNum: 0 };
  try {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return { key: dateStr, label: dateStr, start: dateStr, end: dateStr, sortKey: dateStr, weekNum: 0 };
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startStr = monday.toISOString().split('T')[0];
    const endStr = sunday.toISOString().split('T')[0];

    const tempDate = new Date(monday.getTime());
    tempDate.setHours(0, 0, 0, 0);
    tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
    const week1 = new Date(tempDate.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m1 = months[monday.getMonth()];
    const m2 = months[sunday.getMonth()];
    const label = `${String(monday.getDate()).padStart(2, '0')} ${m1} – ${String(sunday.getDate()).padStart(2, '0')} ${m2} ${sunday.getFullYear()} (Week ${weekNum})`;

    return {
      key: `${startStr}_${endStr}`,
      label,
      start: startStr,
      end: endStr,
      weekNum,
      sortKey: startStr
    };
  } catch (e) {
    return { key: dateStr, label: dateStr, start: dateStr, end: dateStr, sortKey: dateStr, weekNum: 0 };
  }
}

export function getMonthRangeInfo(dateStr) {
  if (!dateStr || dateStr.length < 7) return { key: 'unknown', label: 'Unknown Month', sortKey: '0000-00' };
  try {
    const monthKey = dateStr.slice(0, 7);
    const [year, month] = monthKey.split('-');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = months[parseInt(month, 10) - 1] || month;
    return {
      key: monthKey,
      label: `${monthName} ${year}`,
      sortKey: monthKey
    };
  } catch (e) {
    return { key: dateStr, label: dateStr, sortKey: dateStr };
  }
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthName = months[parseInt(m, 10) - 1] || m;
      return `${d} ${monthName} ${y}`;
    }
  } catch (e) {}
  return dateStr;
}

export default function EmployeeManagement({
  urlParams = {},
  employees = [],
  attendanceRecords = [],
  salaryAdvances = [],
  salaryPayments = [],
  currentUser,
  userRole = "Admin",
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onSaveAttendance,
  onSaveSalaryAdvance,
  onUpdateSalaryAdvance,
  onSaveSalaryPayment
}) {
  // Check RBAC Permissions
  const isAuthorized = useMemo(() => {
    if (!currentUser && !userRole) return true;
    const roleStr = String(currentUser?.role || userRole || '').toLowerCase().trim();
    return roleStr.includes('admin') || roleStr.includes('plant') || roleStr.includes('hr') || roleStr.includes('production') || roleStr.includes('director') || roleStr.includes('account');
  }, [currentUser, userRole]);

  const canApprove = useMemo(() => {
    if (!currentUser && !userRole) return true;
    const roleStr = String(currentUser?.role || userRole || '').toLowerCase().trim();
    return roleStr.includes('admin') || roleStr.includes('plant') || roleStr.includes('hr') || roleStr.includes('director');
  }, [currentUser, userRole]);

  const isAdmin = useMemo(() => {
    const roleStr = String(currentUser?.role || userRole || '').toLowerCase().trim();
    return roleStr === 'admin' || roleStr.includes('admin') || roleStr.includes('director') || roleStr.includes('owner');
  }, [currentUser, userRole]);

  // Sub-Tab Navigation: 'directory', 'attendance', 'overtime', 'advances', 'payroll'
  const [activeSubTab, setActiveSubTab] = useState(() => {
    return urlParams?.subTab || 'directory';
  });

  useEffect(() => {
    if (urlParams?.subTab) {
      setActiveSubTab(urlParams.subTab);
    }
  }, [urlParams?.subTab]);

  const handleSubTabChange = (sub) => {
    setActiveSubTab(sub);
    pushSlugState('employees', { subTab: sub });
  };

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [shiftFilter, setShiftFilter] = useState('ALL');

  // Overtime Approvals Filters & Views State
  const [otViewMode, setOtViewMode] = useState('register'); // 'register' | 'daily' | 'weekly' | 'monthly'
  const [otEmployeeFilter, setOtEmployeeFilter] = useState('ALL');
  const [otStatusFilter, setOtStatusFilter] = useState('ALL');
  const [otMonthFilter, setOtMonthFilter] = useState('ALL');
  const [otSearchQuery, setOtSearchQuery] = useState('');
  const [expandedOtPeriods, setExpandedOtPeriods] = useState({});

  const toggleOtPeriodExpand = (key) => {
    setExpandedOtPeriods(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Salary Advances Filter States
  const [advancesStartDate, setAdvancesStartDate] = useState('');
  const [advancesEndDate, setAdvancesEndDate] = useState('');
  const [advancesStatusFilter, setAdvancesStatusFilter] = useState('ALL');
  const [advancesDepartmentFilter, setAdvancesDepartmentFilter] = useState('ALL');
  const [advancesSearch, setAdvancesSearch] = useState('');

  // Available Months for Overtime Filtering
  const otAvailableMonths = useMemo(() => {
    const monthSet = new Set();
    (attendanceRecords || []).forEach(a => {
      const otHrs = Number(a.overtimeHours) || 0;
      if (otHrs > 0 && a.date && a.date.length >= 7) {
        monthSet.add(a.date.slice(0, 7));
      }
    });
    return Array.from(monthSet).sort().reverse();
  }, [attendanceRecords]);

  // Filtered Overtime Records
  const filteredOtRecords = useMemo(() => {
    return (attendanceRecords || []).filter(a => {
      const otHrs = Number(a.overtimeHours) || 0;
      if (otHrs <= 0) return false;

      if (otMonthFilter !== 'ALL' && !(a.date || '').startsWith(otMonthFilter)) {
        return false;
      }

      if (otEmployeeFilter !== 'ALL' && String(a.employeeId) !== String(otEmployeeFilter)) {
        return false;
      }

      if (otStatusFilter !== 'ALL' && (a.overtimeStatus || 'Pending Approval') !== otStatusFilter) {
        return false;
      }

      if (otSearchQuery.trim()) {
        const q = otSearchQuery.toLowerCase().trim();
        const emp = (employees || []).find(e => String(e.id) === String(a.employeeId));
        const nameMatch = (emp?.fullName || emp?.name || '').toLowerCase().includes(q);
        const codeMatch = (emp?.empCode || a.employeeId || '').toLowerCase().includes(q);
        const deptMatch = (emp?.department || '').toLowerCase().includes(q);
        const reasonMatch = (a.overtimeReason || '').toLowerCase().includes(q);
        const dateMatch = (a.date || '').toLowerCase().includes(q);
        if (!nameMatch && !codeMatch && !deptMatch && !reasonMatch && !dateMatch) return false;
      }

      return true;
    });
  }, [attendanceRecords, otMonthFilter, otEmployeeFilter, otStatusFilter, otSearchQuery, employees]);

  // Grand Totals across filtered Overtime records
  const otGrandTotals = useMemo(() => {
    let totalHours = 0;
    let approvedHours = 0;
    let pendingHours = 0;
    let rejectedHours = 0;
    let totalAmount = 0;
    let approvedAmount = 0;
    let pendingAmount = 0;
    let rejectedAmount = 0;
    const uniqueEmpIds = new Set();
    const pendingRecords = [];

    filteredOtRecords.forEach(att => {
      const otHrs = Number(att.overtimeHours) || 0;
      const { payout } = getRecordOtPayout(att, employees);
      const status = att.overtimeStatus || 'Pending Approval';
      uniqueEmpIds.add(String(att.employeeId));

      totalHours += otHrs;
      totalAmount += payout;

      if (status === 'Approved') {
        approvedHours += otHrs;
        approvedAmount += payout;
      } else if (status === 'Rejected') {
        rejectedHours += otHrs;
        rejectedAmount += payout;
      } else {
        pendingHours += otHrs;
        pendingAmount += payout;
        pendingRecords.push(att);
      }
    });

    return {
      totalHours: roundToTwo(totalHours),
      approvedHours: roundToTwo(approvedHours),
      pendingHours: roundToTwo(pendingHours),
      rejectedHours: roundToTwo(rejectedHours),
      totalAmount: Math.round(totalAmount),
      approvedAmount: Math.round(approvedAmount),
      pendingAmount: Math.round(pendingAmount),
      rejectedAmount: Math.round(rejectedAmount),
      uniqueEmployeesCount: uniqueEmpIds.size,
      recordsCount: filteredOtRecords.length,
      pendingCount: pendingRecords.length
    };
  }, [filteredOtRecords, employees]);

  // Daily Overtime Aggregates
  const otDailyAggregates = useMemo(() => {
    const map = {};
    filteredOtRecords.forEach(att => {
      const dateKey = att.date || 'Unknown';
      if (!map[dateKey]) {
        let dayName = '';
        try {
          const d = new Date(dateKey + 'T00:00:00');
          dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] || '';
        } catch (e) {}
        map[dateKey] = {
          key: dateKey,
          date: dateKey,
          dayName,
          records: [],
          uniqueEmpIds: new Set(),
          totalHours: 0,
          approvedHours: 0,
          pendingHours: 0,
          rejectedHours: 0,
          totalAmount: 0,
          approvedAmount: 0,
          pendingAmount: 0,
          rejectedAmount: 0
        };
      }
      const g = map[dateKey];
      const otHrs = Number(att.overtimeHours) || 0;
      const payoutInfo = getRecordOtPayout(att, employees);
      const status = att.overtimeStatus || 'Pending Approval';
      g.records.push({ att, ...payoutInfo });
      g.uniqueEmpIds.add(String(att.employeeId));
      g.totalHours += otHrs;
      g.totalAmount += payoutInfo.payout;
      if (status === 'Approved') {
        g.approvedHours += otHrs;
        g.approvedAmount += payoutInfo.payout;
      } else if (status === 'Rejected') {
        g.rejectedHours += otHrs;
        g.rejectedAmount += payoutInfo.payout;
      } else {
        g.pendingHours += otHrs;
        g.pendingAmount += payoutInfo.payout;
      }
    });

    return Object.values(map)
      .map(g => ({
        ...g,
        employeeCount: g.uniqueEmpIds.size,
        totalHours: roundToTwo(g.totalHours),
        approvedHours: roundToTwo(g.approvedHours),
        pendingHours: roundToTwo(g.pendingHours),
        rejectedHours: roundToTwo(g.rejectedHours),
        totalAmount: Math.round(g.totalAmount),
        approvedAmount: Math.round(g.approvedAmount),
        pendingAmount: Math.round(g.pendingAmount),
        rejectedAmount: Math.round(g.rejectedAmount)
      }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [filteredOtRecords, employees]);

  // Weekly Overtime Aggregates (Monday to Sunday)
  const otWeeklyAggregates = useMemo(() => {
    const map = {};
    filteredOtRecords.forEach(att => {
      const weekInfo = getWeekRangeInfo(att.date);
      const weekKey = weekInfo.key;
      if (!map[weekKey]) {
        map[weekKey] = {
          key: weekKey,
          label: weekInfo.label,
          start: weekInfo.start,
          end: weekInfo.end,
          weekNum: weekInfo.weekNum,
          sortKey: weekInfo.sortKey,
          records: [],
          uniqueEmpIds: new Set(),
          datesWorked: new Set(),
          totalHours: 0,
          approvedHours: 0,
          pendingHours: 0,
          rejectedHours: 0,
          totalAmount: 0,
          approvedAmount: 0,
          pendingAmount: 0,
          rejectedAmount: 0
        };
      }
      const g = map[weekKey];
      const otHrs = Number(att.overtimeHours) || 0;
      const payoutInfo = getRecordOtPayout(att, employees);
      const status = att.overtimeStatus || 'Pending Approval';
      g.records.push({ att, ...payoutInfo });
      g.uniqueEmpIds.add(String(att.employeeId));
      if (att.date) g.datesWorked.add(att.date);
      g.totalHours += otHrs;
      g.totalAmount += payoutInfo.payout;
      if (status === 'Approved') {
        g.approvedHours += otHrs;
        g.approvedAmount += payoutInfo.payout;
      } else if (status === 'Rejected') {
        g.rejectedHours += otHrs;
        g.rejectedAmount += payoutInfo.payout;
      } else {
        g.pendingHours += otHrs;
        g.pendingAmount += payoutInfo.payout;
      }
    });

    return Object.values(map)
      .map(g => ({
        ...g,
        employeeCount: g.uniqueEmpIds.size,
        daysCount: g.datesWorked.size,
        totalHours: roundToTwo(g.totalHours),
        approvedHours: roundToTwo(g.approvedHours),
        pendingHours: roundToTwo(g.pendingHours),
        rejectedHours: roundToTwo(g.rejectedHours),
        totalAmount: Math.round(g.totalAmount),
        approvedAmount: Math.round(g.approvedAmount),
        pendingAmount: Math.round(g.pendingAmount),
        rejectedAmount: Math.round(g.rejectedAmount)
      }))
      .sort((a, b) => (b.sortKey || '').localeCompare(a.sortKey || ''));
  }, [filteredOtRecords, employees]);

  // Monthly Overtime Aggregates
  const otMonthlyAggregates = useMemo(() => {
    const map = {};
    filteredOtRecords.forEach(att => {
      const mInfo = getMonthRangeInfo(att.date);
      const monthKey = mInfo.key;
      if (!map[monthKey]) {
        map[monthKey] = {
          key: monthKey,
          label: mInfo.label,
          sortKey: mInfo.sortKey,
          records: [],
          uniqueEmpIds: new Set(),
          datesWorked: new Set(),
          totalHours: 0,
          approvedHours: 0,
          pendingHours: 0,
          rejectedHours: 0,
          totalAmount: 0,
          approvedAmount: 0,
          pendingAmount: 0,
          rejectedAmount: 0
        };
      }
      const g = map[monthKey];
      const otHrs = Number(att.overtimeHours) || 0;
      const payoutInfo = getRecordOtPayout(att, employees);
      const status = att.overtimeStatus || 'Pending Approval';
      g.records.push({ att, ...payoutInfo });
      g.uniqueEmpIds.add(String(att.employeeId));
      if (att.date) g.datesWorked.add(att.date);
      g.totalHours += otHrs;
      g.totalAmount += payoutInfo.payout;
      if (status === 'Approved') {
        g.approvedHours += otHrs;
        g.approvedAmount += payoutInfo.payout;
      } else if (status === 'Rejected') {
        g.rejectedHours += otHrs;
        g.rejectedAmount += payoutInfo.payout;
      } else {
        g.pendingHours += otHrs;
        g.pendingAmount += payoutInfo.payout;
      }
    });

    return Object.values(map)
      .map(g => ({
        ...g,
        employeeCount: g.uniqueEmpIds.size,
        daysCount: g.datesWorked.size,
        totalHours: roundToTwo(g.totalHours),
        approvedHours: roundToTwo(g.approvedHours),
        pendingHours: roundToTwo(g.pendingHours),
        rejectedHours: roundToTwo(g.rejectedHours),
        totalAmount: Math.round(g.totalAmount),
        approvedAmount: Math.round(g.approvedAmount),
        pendingAmount: Math.round(g.pendingAmount),
        rejectedAmount: Math.round(g.rejectedAmount)
      }))
      .sort((a, b) => (b.sortKey || '').localeCompare(a.sortKey || ''));
  }, [filteredOtRecords, employees]);

  // Selected Date for Daily Attendance Register
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Selected Month for Payroll (Format: YYYY-MM)
  const [payrollMonth, setPayrollMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [workingDaysCount, setWorkingDaysCount] = useState(26);

  // Modals & Active Records
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [offboardingEmployee, setOffboardingEmployee] = useState(null);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [activePayslipData, setActivePayslipData] = useState(null); // { employee, salaryData }
  const [markingAttendanceEmp, setMarkingAttendanceEmp] = useState(null);

  // Form State for Onboarding / Editing Employee
  const [formEmpCode, setFormEmpCode] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formGender, setFormGender] = useState('Male');
  const [formDob, setFormDob] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDepartment, setFormDepartment] = useState('Rotogravure Printing');
  const [formDesignation, setFormDesignation] = useState('Printing Operator');
  const [formJoiningDate, setFormJoiningDate] = useState(new Date().toISOString().split('T')[0]);
  const [formStatus, setFormStatus] = useState('Active');
  const [formShiftHours, setFormShiftHours] = useState(12);
  const [formDefaultShift, setFormDefaultShift] = useState('Shift A: Day (08:00 - 20:00)');
  const [formAddress, setFormAddress] = useState('');
  const [formAadhar, setFormAadhar] = useState('');
  const [formPan, setFormPan] = useState('');
  const [formUan, setFormUan] = useState('');
  const [formEsic, setFormEsic] = useState('');
  const [formEmergencyContact, setFormEmergencyContact] = useState('');

  // Bank Form State
  const [formBankName, setFormBankName] = useState('State Bank of India');
  const [formAccountNumber, setFormAccountNumber] = useState('');
  const [formIfscCode, setFormIfscCode] = useState('');
  const [formAccountHolder, setFormAccountHolder] = useState('');
  const [formBranch, setFormBranch] = useState('');
  const [formPaymentMode, setFormPaymentMode] = useState('Bank Transfer (NEFT)');

  // Salary Form State
  const [formBasicSalary, setFormBasicSalary] = useState('');
  const [formHra, setFormHra] = useState('');
  const [formOtherAllowance, setFormOtherAllowance] = useState('');
  const [formOptDinner, setFormOptDinner] = useState(false);
  const [formDinnerPerNight, setFormDinnerPerNight] = useState(0);
  const [formFixedDinner, setFormFixedDinner] = useState(0);
  const [formOptPf, setFormOptPf] = useState(true);
  const [formOptEsic, setFormOptEsic] = useState(false);
  const [formPt, setFormPt] = useState(0);

  // Form State for Salary Advance Request
  const [advEmpId, setAdvEmpId] = useState('');
  const [advAmount, setAdvAmount] = useState('');
  const [advTenureMonths, setAdvTenureMonths] = useState(2);
  const [advReason, setAdvReason] = useState('');
  const [editingAdvance, setEditingAdvance] = useState(null);

  // Form State for Attendance Marking
  const [attStatus, setAttStatus] = useState('Present');
  const [attShiftType, setAttShiftType] = useState('Shift A: Day (08:00 - 20:00)');
  const [attCheckIn, setAttCheckIn] = useState('08:00');
  const [attCheckOut, setAttCheckOut] = useState('20:00');
  const [attOtHours, setAttOtHours] = useState(0);
  const [attOtStartTime, setAttOtStartTime] = useState('');
  const [attOtEndTime, setAttOtEndTime] = useState('');
  const [attPtoHours, setAttPtoHours] = useState('0');
  const [attOtReason, setAttOtReason] = useState('');

  // Form State for Offboarding
  const [offResignDate, setOffResignDate] = useState(new Date().toISOString().split('T')[0]);
  const [offRelieveDate, setOffRelieveDate] = useState('');
  const [offNoticeDays, setOffNoticeDays] = useState(30);
  const [offHandover, setOffHandover] = useState(false);
  const [offSettlementStatus, setOffSettlementStatus] = useState('In Process');
  const [offNotes, setOffNotes] = useState('');

  // Form State for Salary Payment Disbursal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentRowData, setPaymentRowData] = useState(null);
  const [paymentEmpData, setPaymentEmpData] = useState(null);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentTime, setPaymentTime] = useState(() => new Date().toTimeString().slice(0, 8));
  const [paymentMode, setPaymentMode] = useState('Bank Transfer (NEFT)');
  const [paymentTxnRef, setPaymentTxnRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Advance Recovery in Salary Disbursal State
  const [paymentConfirmAdvanceRecovery, setPaymentConfirmAdvanceRecovery] = useState(true);
  const [paymentAdvanceRecoveryAmount, setPaymentAdvanceRecoveryAmount] = useState('');
  const [paymentActiveAdvance, setPaymentActiveAdvance] = useState(null);

  // Standalone Advance Recovery Modal (Advances Tab)
  const [showAdvanceRecoveryModal, setShowAdvanceRecoveryModal] = useState(false);
  const [recoveryTargetAdvance, setRecoveryTargetAdvance] = useState(null);
  const [recoveryAmountInput, setRecoveryAmountInput] = useState('');
  const [recoveryModeInput, setRecoveryModeInput] = useState('SALARY_DEDUCTION');
  const [recoveryDateInput, setRecoveryDateInput] = useState(() => new Date().toISOString().split('T')[0]);
  const [recoveryTimeInput, setRecoveryTimeInput] = useState(() => new Date().toTimeString().slice(0, 8));
  const [recoveryNotesInput, setRecoveryNotesInput] = useState('');
  const [recoveryMonthInput, setRecoveryMonthInput] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Advance Recovery History Modal
  const [showAdvanceHistoryModal, setShowAdvanceHistoryModal] = useState(false);
  const [historyTargetAdvance, setHistoryTargetAdvance] = useState(null);

  // Open Onboard Modal
  const handleOpenOnboardModal = () => {
    setEditingEmployee(null);
    const nextCode = `EMP-${Math.floor(100 + Math.random() * 900)}`;
    setFormEmpCode(nextCode);
    setFormFullName('');
    setFormGender('Male');
    setFormDob('');
    setFormPhone('');
    setFormEmail('');
    setFormDepartment('Rotogravure Printing');
    setFormDesignation('Printing Operator');
    setFormJoiningDate(new Date().toISOString().split('T')[0]);
    setFormStatus('Active');
    setFormShiftHours(12);
    setFormDefaultShift('Shift A: Day (08:00 - 20:00)');
    setFormAddress('');
    setFormAadhar('');
    setFormPan('');
    setFormUan('');
    setFormEsic('');
    setFormEmergencyContact('');

    setFormBankName('State Bank of India');
    setFormAccountNumber('');
    setFormIfscCode('');
    setFormAccountHolder('');
    setFormBranch('');
    setFormPaymentMode('Bank Transfer (NEFT)');

    setFormBasicSalary('');
    setFormHra('');
    setFormOtherAllowance('');
    setFormOptDinner(false);
    setFormDinnerPerNight(0);
    setFormFixedDinner(0);
    setFormOptPf(true);
    setFormOptEsic(false);
    setFormPt(0);

    setShowOnboardModal(true);
  };

  // Open Edit Employee Modal
  const handleOpenEditModal = (emp) => {
    if (!isAdmin) {
      alert("⛔ Permission Denied: Only the Admin role is authorized to Edit employee records.");
      return;
    }
    setEditingEmployee(emp);
    setFormEmpCode(emp.empCode || emp.id);
    setFormFullName(emp.fullName || '');
    setFormGender(emp.gender || 'Male');
    setFormDob(emp.dob || '');
    setFormPhone(emp.phone || '');
    setFormEmail(emp.email || '');
    setFormDepartment(emp.department || 'Rotogravure Printing');
    setFormDesignation(emp.designation || 'Printing Operator');
    setFormJoiningDate(emp.joiningDate || '');
    setFormStatus(emp.status || 'Active');
    setFormShiftHours(emp.shiftDurationHours || 12);
    setFormDefaultShift(emp.defaultShift || 'Shift A: Day (08:00 - 20:00)');
    setFormAddress(emp.address || '');
    setFormAadhar(emp.aadharNo || '');
    setFormPan(emp.panNo || '');
    setFormUan(emp.uanNo || '');
    setFormEsic(emp.esicNo || '');
    setFormEmergencyContact(emp.emergencyContact || '');

    const bank = emp.bankDetails || {};
    setFormBankName(bank.bankName || 'State Bank of India');
    setFormAccountNumber(bank.accountNumber || '');
    setFormIfscCode(bank.ifscCode || '');
    setFormAccountHolder(bank.accountHolderName || emp.fullName || '');
    setFormBranch(bank.branch || '');
    setFormPaymentMode(bank.paymentMode || 'Bank Transfer (NEFT)');

    const struct = emp.salaryStructure || {};
    setFormBasicSalary(struct.basicSalary || 14000);
    setFormHra(struct.hra || 5600);
    setFormOtherAllowance(struct.otherAllowance || 2000);
    setFormOptDinner(struct.optDinner || Boolean(Number(struct.dinnerAllowancePerNight) > 0 || Number(struct.fixedDinnerAllowance) > 0));
    setFormDinnerPerNight(struct.dinnerAllowancePerNight || 0);
    setFormFixedDinner(struct.fixedDinnerAllowance || 0);
    setFormOptPf(struct.optPf ?? true);
    setFormOptEsic(struct.optEsic ?? false);
    setFormPt(struct.professionalTax ?? 200);

    setShowOnboardModal(true);
  };

  // Save Employee (New or Update)
  const handleSaveEmployee = (e) => {
    e.preventDefault();
    if (!formFullName.trim()) {
      alert("Employee Full Name is required!");
      return;
    }

    const empId = editingEmployee ? editingEmployee.id : `EMP-${Date.now().toString().slice(-4)}`;
    const empRecord = {
      id: empId,
      empCode: formEmpCode || empId,
      fullName: formFullName.trim(),
      gender: formGender,
      dob: formDob,
      phone: formPhone.trim(),
      email: formEmail.trim(),
      department: formDepartment,
      designation: formDesignation,
      joiningDate: formJoiningDate,
      status: formStatus,
      shiftDurationHours: Number(formShiftHours) || 12,
      defaultShift: formDefaultShift,
      address: formAddress.trim(),
      aadharNo: formAadhar.trim(),
      panNo: formPan.trim(),
      uanNo: formUan.trim(),
      esicNo: formEsic.trim(),
      emergencyContact: formEmergencyContact.trim(),
      bankDetails: {
        bankName: formBankName,
        accountNumber: formAccountNumber.trim(),
        ifscCode: formIfscCode.trim(),
        accountHolderName: formAccountHolder.trim() || formFullName.trim(),
        branch: formBranch,
        paymentMode: formPaymentMode
      },
      salaryStructure: {
        basicSalary: Number(formBasicSalary) || 0,
        hra: Number(formHra) || 0,
        otherAllowance: Number(formOtherAllowance) || 0,
        optDinner: Boolean(formOptDinner),
        dinnerAllowancePerNight: formOptDinner ? (Number(formDinnerPerNight) || 0) : 0,
        fixedDinnerAllowance: formOptDinner ? (Number(formFixedDinner) || 0) : 0,
        optPf: Boolean(formOptPf),
        optEsic: Boolean(formOptEsic),
        professionalTax: Number(formPt) || 0
      },
      offboarding: editingEmployee?.offboarding || {
        resignationDate: "",
        relievingDate: "",
        noticePeriodDays: 30,
        handoverComplete: false,
        settlementStatus: "N/A",
        notes: ""
      }
    };

    if (editingEmployee) {
      if (onUpdateEmployee) onUpdateEmployee(empRecord);
    } else {
      if (onAddEmployee) onAddEmployee(empRecord);
    }

    saveEmployeeToSupabase(empRecord);
    setShowOnboardModal(false);
    alert(`Employee "${empRecord.fullName}" (${empRecord.empCode}) saved successfully!`);
  };

  // Open Offboarding Modal
  const handleOpenOffboardModal = (emp) => {
    if (!isAdmin) {
      alert("⛔ Permission Denied: Only the Admin role is authorized to Offboard employees.");
      return;
    }
    setOffboardingEmployee(emp);
    const off = emp.offboarding || {};
    setOffResignDate(off.resignationDate || new Date().toISOString().split('T')[0]);
    const defaultRelieve = new Date();
    defaultRelieve.setDate(defaultRelieve.getDate() + 30);
    setOffRelieveDate(off.relievingDate || defaultRelieve.toISOString().split('T')[0]);
    setOffNoticeDays(off.noticePeriodDays || 30);
    setOffHandover(off.handoverComplete || false);
    setOffSettlementStatus(off.settlementStatus || 'In Process');
    setOffNotes(off.notes || '');
  };

  // Submit Offboarding
  const handleSaveOffboarding = () => {
    if (!offboardingEmployee) return;
    const updated = {
      ...offboardingEmployee,
      status: offSettlementStatus === 'Settled' ? 'Relieved' : 'Notice Period',
      offboarding: {
        resignationDate: offResignDate,
        relievingDate: offRelieveDate,
        noticePeriodDays: Number(offNoticeDays) || 30,
        handoverComplete: offHandover,
        settlementStatus: offSettlementStatus,
        notes: offNotes
      }
    };
    if (onUpdateEmployee) onUpdateEmployee(updated);
    saveEmployeeToSupabase(updated);
    setOffboardingEmployee(null);
    alert(`Offboarding details updated for ${updated.fullName}. Status set to "${updated.status}".`);
  };

  // Delete Employee
  const handleDeleteEmployee = (id, name) => {
    if (!isAdmin) {
      alert("⛔ Permission Denied: Only the Admin role is authorized to Delete employee records.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete employee "${name}"? This action cannot be undone.`)) return;
    if (onDeleteEmployee) onDeleteEmployee(id);
    deleteEmployeeFromSupabase(id);
  };

  // Open Attendance Modal for an Employee
  const handleOpenAttendanceModal = (emp) => {
    setMarkingAttendanceEmp(emp);
    const existing = attendanceRecords.find(a => a.employeeId === emp.id && a.date === attendanceDate);
    if (existing) {
      setAttStatus(existing.status || 'Present');
      setAttShiftType(existing.shiftType || emp.defaultShift || 'Shift A: Day (08:00 - 20:00)');
      setAttCheckIn(existing.checkIn || '08:00');
      setAttCheckOut(existing.checkOut || '20:00');
      setAttOtHours(existing.overtimeHours || 0);
      const otWin = calculateOvertimeTimeWindow(existing);
      setAttOtStartTime(existing.overtimeStartTime || existing.overtime_start_time || otWin.otStartTime || '');
      setAttOtEndTime(existing.overtimeEndTime || existing.overtime_end_time || otWin.otEndTime || '');
      setAttPtoHours(existing.ptoHours !== undefined ? String(existing.ptoHours) : (existing.pto_hours !== undefined ? String(existing.pto_hours) : '0'));
      setAttOtReason(existing.overtimeReason || '');
    } else {
      setAttStatus('Present');
      setAttShiftType(emp.defaultShift || 'Shift A: Day (08:00 - 20:00)');
      const cIn = emp.shiftDurationHours === 8 ? '09:00' : '08:00';
      const cOut = emp.shiftDurationHours === 8 ? '17:00' : emp.shiftDurationHours === 10 ? '18:00' : '20:00';
      setAttCheckIn(cIn);
      setAttCheckOut(cOut);
      setAttOtHours(0);
      setAttOtStartTime('');
      setAttOtEndTime('');
      setAttPtoHours('0');
      setAttOtReason('');
    }
  };

  // Save Attendance Record
  const handleSaveAttendance = () => {
    if (!markingAttendanceEmp) return;

    const isNight = attShiftType.toLowerCase().includes('night');
    const ot = parseFloat(attOtHours) || 0;
    const pto = Math.max(0, parseFloat(attPtoHours) || 0);
    const shiftHrs = markingAttendanceEmp.shiftDurationHours || 12;

    if (ot > 0 && !attOtReason.trim()) {
      alert("⚠️ Mandatory Requirement: Work / Machine Justification Note must be specified when logging Overtime Hours.");
      return;
    }

    const isExisting = Boolean(markingAttendanceEmp?.id && attendanceRecords.some(a => a.employeeId === markingAttendanceEmp.id && a.date === attendanceDate));
    if (isExisting && !isAdmin) {
      alert("⛔ Permission Denied: Attendance has already been marked for this employee. Only the Admin role is authorized to edit or modify locked attendance records.");
      return;
    }

    let otStart = attOtStartTime;
    let otEnd = attOtEndTime;
    if (ot > 0 && (!otStart || !otEnd)) {
      const otWin = calculateOvertimeTimeWindow({
        checkIn: attCheckIn,
        checkOut: attCheckOut,
        shiftHours: shiftHrs,
        overtimeHours: ot
      });
      otStart = otWin.otStartTime;
      otEnd = otWin.otEndTime;
    }

    const netShiftHours = attStatus === 'Present' 
      ? Math.max(0, (shiftHrs - pto + ot)) 
      : attStatus === 'Half Day' 
      ? Math.max(0, ((shiftHrs / 2) - pto + ot)) 
      : 0;

    const record = {
      id: `ATT-${attendanceDate.replace(/-/g, '')}-${markingAttendanceEmp.id}`,
      employeeId: markingAttendanceEmp.id,
      date: attendanceDate,
      shiftType: attShiftType,
      shiftHours: shiftHrs,
      status: attStatus,
      checkIn: attCheckIn,
      checkOut: attCheckOut,
      totalHoursWorked: Number(netShiftHours.toFixed(2)),
      overtimeHours: ot,
      overtimeStartTime: otStart,
      overtimeEndTime: otEnd,
      overtime_start_time: otStart,
      overtime_end_time: otEnd,
      ptoHours: pto,
      pto_hours: pto,
      overtimeReason: attOtReason.trim(),
      overtimeStatus: ot > 0 ? 'Pending Approval' : 'Approved',
      overtimeApprovedBy: '',
      overtimeApprovedDate: '',
      dinnerAllowanceEligible: Boolean(markingAttendanceEmp?.salaryStructure?.optDinner || Number(markingAttendanceEmp?.salaryStructure?.dinnerAllowancePerNight) > 0),
      markedBy: currentUser?.name || 'Shift Supervisor'
    };

    if (onSaveAttendance) onSaveAttendance(record);
    saveEmployeeAttendanceToSupabase(record);
    setMarkingAttendanceEmp(null);
    alert(`Attendance marked for ${markingAttendanceEmp.fullName} on ${attendanceDate} (${attStatus}, Net Hours: ${netShiftHours.toFixed(1)}h${pto > 0 ? `, PTO: ${pto}h deducted` : ''}${ot > 0 ? `, OT: ${ot}h Pending Approval` : ''})`);
  };

  // Bulk Mark All Present
  const handleBulkMarkPresent = () => {
    if (!window.confirm(`Mark active employees as PRESENT for ${attendanceDate}? (Already marked records will remain locked)`)) return;
    let markedCount = 0;
    let lockedCount = 0;

    employees.filter(e => e.status === 'Active' || e.status === 'On Probation').forEach(emp => {
      const alreadyMarked = attendanceRecords.some(a => a.employeeId === emp.id && a.date === attendanceDate);
      if (alreadyMarked && !isAdmin) {
        lockedCount += 1;
        return;
      }

      const shiftHrs = emp.shiftDurationHours || 12;
      const rec = {
        id: `ATT-${attendanceDate.replace(/-/g, '')}-${emp.id}`,
        employeeId: emp.id,
        date: attendanceDate,
        shiftType: emp.defaultShift || 'Shift A: Day (08:00 - 20:00)',
        shiftHours: shiftHrs,
        status: 'Present',
        checkIn: '08:00',
        checkOut: shiftHrs === 8 ? '17:00' : shiftHrs === 10 ? '18:00' : '20:00',
        totalHoursWorked: shiftHrs,
        overtimeHours: 0,
        overtimeReason: '',
        overtimeStatus: 'Approved',
        dinnerAllowanceEligible: Boolean(emp.salaryStructure?.optDinner || Number(emp.salaryStructure?.dinnerAllowancePerNight) > 0),
        markedBy: currentUser?.name || 'Shift Supervisor'
      };
      if (onSaveAttendance) onSaveAttendance(rec);
      saveEmployeeAttendanceToSupabase(rec);
      markedCount += 1;
    });

    alert(`Bulk attendance summary for ${attendanceDate}:\n• Marked Present: ${markedCount} employees\n${lockedCount > 0 ? `• Locked (Already Marked): ${lockedCount} employees (Admin required to change)` : ''}`);
  };

  // Approve / Reject Overtime
  const handleApproveOvertime = (attRecord, isApproved) => {
    if (!canApprove) {
      alert("Only Plant Head, HR Manager, or Admin can approve Overtime requests!");
      return;
    }
    const emp = (employees || []).find(e => String(e.id) === String(attRecord.employeeId));
    const empName = emp?.fullName || emp?.name || attRecord.employeeId;
    const { payout } = getRecordOtPayout(attRecord, employees);

    const actionText = isApproved ? 'Approve' : 'Reject';
    const confirmMsg = isApproved
      ? `Confirm Overtime Approval for ${empName}?\n• Date: ${attRecord.date}\n• Hours: ${attRecord.overtimeHours} hrs\n• Salary Payout Addition: ₹ ${(payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\nClick OK to approve and credit into monthly salary.`
      : `Confirm Overtime Rejection for ${empName}?\n• Date: ${attRecord.date}\n• Hours: ${attRecord.overtimeHours} hrs\n\nClick OK to reject this overtime request.`;

    if (!window.confirm(confirmMsg)) return;

    const updated = {
      ...attRecord,
      overtimeStatus: isApproved ? 'Approved' : 'Rejected',
      overtimeApprovedBy: currentUser?.name || 'Plant Head',
      overtimeApprovedDate: new Date().toISOString().split('T')[0],
      overtimeApprovalAmount: payout
    };
    if (onSaveAttendance) onSaveAttendance(updated);
    saveEmployeeAttendanceToSupabase(updated);
    alert(`Overtime request for ${empName} on ${attRecord.date} has been ${updated.overtimeStatus} (₹${(payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})!`);
  };

  // Revert Overtime Approval or Rejection
  const handleRevertOvertime = (attRecord) => {
    if (!canApprove) {
      alert("Only Plant Head, HR Manager, or Admin can revert Overtime approvals!");
      return;
    }
    const emp = (employees || []).find(e => String(e.id) === String(attRecord.employeeId));
    const empName = emp?.fullName || emp?.name || attRecord.employeeId;
    const currentStatus = attRecord.overtimeStatus || 'Pending Approval';
    const { payout } = getRecordOtPayout(attRecord, employees);

    const confirmMsg = currentStatus === 'Approved'
      ? `⚠️ REVERT OVERTIME APPROVAL?\n\nEmployee: ${empName} (${emp?.empCode || emp?.id})\nDate: ${attRecord.date} | Hours: ${attRecord.overtimeHours} hrs\nApproved Payout: ₹ ${(payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\nReverting will reset the status back to 'Pending Approval' and IMMEDIATELY DEDUCT ₹ ${(payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} from ${empName}'s calculated monthly salary.\n\nDo you want to proceed?`
      : `Revert overtime rejection for ${empName} on ${attRecord.date}?\nStatus will be reset to 'Pending Approval' for reconsideration.`;

    if (!window.confirm(confirmMsg)) return;

    const updated = {
      ...attRecord,
      overtimeStatus: 'Pending Approval',
      overtimeApprovedBy: null,
      overtimeApprovedDate: null,
      overtimeRevertedBy: currentUser?.name || 'Plant Head',
      overtimeRevertedDate: new Date().toISOString().split('T')[0]
    };
    if (onSaveAttendance) onSaveAttendance(updated);
    saveEmployeeAttendanceToSupabase(updated);

    if (currentStatus === 'Approved') {
      alert(`✅ Approval reverted for ${empName}!\n₹ ${(payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been deducted from their salary calculation.`);
    } else {
      alert(`✅ Rejection reverted for ${empName}. Request is now Pending Approval.`);
    }
  };

  // Export Overtime Data to CSV based on current active View
  const handleExportOtCSV = () => {
    if (otViewMode === 'daily') {
      let csv = "Date,Day,Unique Employees,Total Hours Worked,Approved Hours,Pending Hours,Rejected Hours,Total OT Amount (₹),Approved Amount (₹),Pending Amount (₹)\n";
      otDailyAggregates.forEach(row => {
        csv += `"${row.date}","${row.dayName}",${row.employeeCount},${row.totalHours},${row.approvedHours},${row.pendingHours},${row.rejectedHours},${row.totalAmount},${row.approvedAmount},${row.pendingAmount}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Overtime_Daily_Summary_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } else if (otViewMode === 'weekly') {
      let csv = "Week Period,Week No,Start Date,End Date,Days With OT,Unique Employees,Total Hours Worked,Approved Hours,Pending Hours,Rejected Hours,Total OT Amount (₹),Approved Amount (₹),Pending Amount (₹)\n";
      otWeeklyAggregates.forEach(row => {
        csv += `"${row.label}",${row.weekNum},"${row.start}","${row.end}",${row.daysCount},${row.employeeCount},${row.totalHours},${row.approvedHours},${row.pendingHours},${row.rejectedHours},${row.totalAmount},${row.approvedAmount},${row.pendingAmount}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Overtime_Weekly_Summary_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } else if (otViewMode === 'monthly') {
      let csv = "Month,Days With OT,Unique Employees,Total Hours Worked,Approved Hours,Pending Hours,Rejected Hours,Total OT Amount (₹),Approved Amount (₹),Pending Amount (₹)\n";
      otMonthlyAggregates.forEach(row => {
        csv += `"${row.label}",${row.daysCount},${row.employeeCount},${row.totalHours},${row.approvedHours},${row.pendingHours},${row.rejectedHours},${row.totalAmount},${row.approvedAmount},${row.pendingAmount}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Overtime_Monthly_Summary_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } else {
      let csv = "Date,Employee Code,Employee Name,Department,Standard Shift (Hrs),Check-In,Check-Out,OT Hours,OT Window,Hourly Rate (₹),Est Payout (₹),Status,Reason / Extension,Approved By,Approved Date\n";
      filteredOtRecords.forEach(att => {
        const payoutInfo = getRecordOtPayout(att, employees);
        const emp = payoutInfo.emp;
        const otWin = calculateOvertimeTimeWindow(att);
        csv += `"${att.date || ''}","${emp?.empCode || att.employeeId || ''}","${emp?.fullName || emp?.name || ''}","${emp?.department || ''}",${payoutInfo.shiftHrs},"${att.checkIn || ''}","${att.checkOut || ''}",${att.overtimeHours || 0},"${otWin.displayStr || ''}",${payoutInfo.hourlyRate},${payoutInfo.payout},"${att.overtimeStatus || 'Pending Approval'}","${(att.overtimeReason || '').replace(/"/g, '""')}","${att.overtimeApprovedBy || ''}","${att.overtimeApprovedDate || ''}"\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Overtime_Register_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    }
  };

  // Open New Salary Advance Request Modal
  const handleOpenNewAdvanceModal = () => {
    setEditingAdvance(null);
    setAdvEmpId('');
    setAdvAmount('');
    setAdvTenureMonths(1);
    setAdvReason('');
    setShowAdvanceModal(true);
  };

  // Edit Salary Advance (Admin Only)
  const handleEditAdvance = (adv) => {
    if (!isAdmin) {
      alert("⛔ Permission Denied: Only the Admin role is authorized to edit Salary Advances & Loans.");
      return;
    }
    setEditingAdvance(adv);
    setAdvEmpId(adv.employeeId);
    setAdvAmount(adv.advanceAmount || '');
    setAdvTenureMonths(adv.repaymentTenureMonths || 1);
    setAdvReason(adv.reason || '');
    setShowAdvanceModal(true);
  };

  // Save New or Edited Salary Advance Request
  const handleSaveSalaryAdvance = (e) => {
    e.preventDefault();
    if (!advEmpId || !advAmount || Number(advAmount) <= 0) {
      alert("Please select employee and enter a valid advance amount!");
      return;
    }
    const selectedEmp = employees.find(emp => emp.id === advEmpId);
    if (!selectedEmp) return;

    if (!editingAdvance) {
      // Rule Enforcement: Any employee with a previous outstanding advance cannot request a new advance before completion of old dues
      const activeExistingAdvance = salaryAdvances.find(adv => 
        adv.employeeId === selectedEmp.id && 
        (adv.status === 'Approved & Disbursed' || adv.status === 'Pending Approval') &&
        Number(adv.remainingBalance ?? (adv.advanceAmount - (adv.totalRecoveredAmount || 0))) > 0
      );

      if (activeExistingAdvance) {
        alert(`⚠️ Advance Blocked: ${selectedEmp.fullName} already has an active outstanding advance (${activeExistingAdvance.id}) with ₹${(Number(activeExistingAdvance.remainingBalance || activeExistingAdvance.advanceAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} remaining dues! New advances cannot be requested until previous dues are 100% completed.`);
        return;
      }
    }

    const amt = Number(advAmount);
    const tenure = Number(advTenureMonths) || 1;
    const emi = Math.round(amt / tenure);

    let advanceRecord;
    if (editingAdvance) {
      const recovered = Number(editingAdvance.totalRecoveredAmount) || 0;
      const remBal = Math.max(0, amt - recovered);
      advanceRecord = {
        ...editingAdvance,
        employeeId: selectedEmp.id,
        employeeName: selectedEmp.fullName,
        department: selectedEmp.department,
        advanceAmount: amt,
        repaymentTenureMonths: tenure,
        monthlyEmiAmount: emi,
        remainingBalance: remBal,
        reason: advReason.trim() || editingAdvance.reason || 'Salary Advance Request'
      };
    } else {
      advanceRecord = {
        id: `ADV-${Date.now().toString().slice(-4)}`,
        employeeId: selectedEmp.id,
        employeeName: selectedEmp.fullName,
        department: selectedEmp.department,
        requestDate: new Date().toISOString().split('T')[0],
        advanceAmount: amt,
        repaymentTenureMonths: tenure,
        monthlyEmiAmount: emi,
        reason: advReason.trim() || 'Salary Advance Request',
        status: canApprove ? 'Approved & Disbursed' : 'Pending Approval',
        approvedBy: canApprove ? (currentUser?.name || 'Plant Head') : '',
        approvedDate: canApprove ? new Date().toISOString().split('T')[0] : '',
        disbursedDate: canApprove ? new Date().toISOString().split('T')[0] : '',
        totalRecoveredAmount: 0,
        remainingBalance: amt,
        deductionHistory: []
      };
    }

    if (onSaveSalaryAdvance) onSaveSalaryAdvance(advanceRecord);
    saveSalaryAdvanceToSupabase(advanceRecord);
    setShowAdvanceModal(false);
    setEditingAdvance(null);
    setAdvEmpId('');
    setAdvAmount('');
    setAdvReason('');
    alert(`Salary Advance ${editingAdvance ? 'Updated' : 'Request recorded'} for ${selectedEmp.fullName} (₹${(amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})!`);
  };

  // Approve Salary Advance
  const handleApproveAdvance = (adv) => {
    if (!canApprove) {
      alert("Authorization required to approve salary advances!");
      return;
    }
    const updated = {
      ...adv,
      status: 'Approved & Disbursed',
      approvedBy: currentUser?.name || 'Plant Head',
      approvedDate: new Date().toISOString().split('T')[0],
      disbursedDate: new Date().toISOString().split('T')[0]
    };
    if (onUpdateSalaryAdvance) onUpdateSalaryAdvance(updated);
    saveSalaryAdvanceToSupabase(updated);
    alert(`Salary Advance of ₹${(adv.advanceAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for ${adv.employeeName} approved & disbursed! Monthly EMI: ₹${adv.monthlyEmiAmount}`);
  };

  // Open Payment Disbursal Modal with Advance Recovery Option
  const handleOpenPaymentModal = (row, emp) => {
    setPaymentRowData(row);
    setPaymentEmpData(emp);
    const now = new Date();
    setPaymentDate(now.toISOString().split('T')[0]);
    setPaymentTime(now.toTimeString().slice(0, 8));
    setPaymentMode(emp?.bankDetails?.paymentMode || 'Bank Transfer (NEFT)');
    setPaymentTxnRef(`UTR-${Date.now().toString().slice(-6)}`);
    setPaymentNotes(`${payrollMonth} monthly salary disbursed`);

    // Look for active approved advance for this employee
    const activeAdv = salaryAdvances.find(a => 
      String(a.employeeId) === String(row.employeeId) && 
      (a.status === 'Approved & Disbursed') && 
      Number(a.remainingBalance ?? (a.advanceAmount - (a.totalRecoveredAmount || 0))) > 0
    );

    if (activeAdv) {
      setPaymentActiveAdvance(activeAdv);
      const remBal = Number(activeAdv.remainingBalance ?? (activeAdv.advanceAmount - (activeAdv.totalRecoveredAmount || 0)));
      const scheduledEmi = Number(activeAdv.monthlyEmiAmount) || 0;
      const initialDeduction = Math.min(scheduledEmi > 0 ? scheduledEmi : remBal, remBal);
      setPaymentConfirmAdvanceRecovery(true);
      setPaymentAdvanceRecoveryAmount(initialDeduction > 0 ? String(initialDeduction) : '');
    } else {
      setPaymentActiveAdvance(null);
      setPaymentConfirmAdvanceRecovery(false);
      setPaymentAdvanceRecoveryAmount('');
    }

    setShowPaymentModal(true);
  };

  // Save Salary Payment Record with Confirmed Advance Recovery
  const handleSaveSalaryPaymentSubmit = (e) => {
    e.preventDefault();
    if (!paymentRowData || !paymentEmpData) return;

    const baseDeductions = (Number(paymentRowData.pfDeduction) || 0) + 
                           (Number(paymentRowData.esicDeduction) || 0) + 
                           (Number(paymentRowData.ptDeduction) || 0);
    const grossEarned = Number(paymentRowData.totalGrossEarned) || 0;

    let actualAdvanceDeduction = 0;
    const targetAdvance = paymentActiveAdvance;

    if (paymentConfirmAdvanceRecovery && targetAdvance) {
      const remBal = Number(targetAdvance.remainingBalance ?? (targetAdvance.advanceAmount - (targetAdvance.totalRecoveredAmount || 0)));
      const enteredAmt = parseFloat(paymentAdvanceRecoveryAmount) || 0;
      if (enteredAmt < 0) {
        alert("Advance recovery deduction amount cannot be negative.");
        return;
      }
      if (enteredAmt > remBal) {
        alert(`Advance recovery amount (₹${enteredAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) cannot exceed remaining balance (₹${remBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`);
        return;
      }
      actualAdvanceDeduction = Math.min(enteredAmt, remBal);
    }

    const calculatedNetPayable = Math.max(0, grossEarned - baseDeductions - actualAdvanceDeduction);

    const paymentRecord = {
      id: `PAY-${payrollMonth.replace(/-/g, '')}-${paymentRowData.employeeId}`,
      monthKey: payrollMonth,
      employeeId: paymentRowData.employeeId,
      employeeName: paymentRowData.fullName,
      empCode: paymentRowData.empCode,
      department: paymentRowData.department,
      netAmountPaid: calculatedNetPayable,
      advanceDeductionAmount: actualAdvanceDeduction,
      advanceRecoveryConfirmed: actualAdvanceDeduction > 0,
      advanceId: targetAdvance?.id || null,
      paymentDate: paymentDate,
      paymentTime: paymentTime,
      paymentTimestamp: `${paymentDate}T${paymentTime}`,
      paymentMode: paymentMode,
      transactionReference: paymentTxnRef.trim(),
      bankName: paymentEmpData?.bankDetails?.bankName || '',
      accountNumber: paymentEmpData?.bankDetails?.accountNumber || '',
      status: 'Paid',
      disbursedBy: currentUser?.name || 'Samyak Jain (Admin)',
      notes: paymentNotes.trim() + (actualAdvanceDeduction > 0 ? ` (₹${actualAdvanceDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} advance recovered)` : (targetAdvance ? ' (Advance recovery skipped this month)' : '')),
      createdAt: new Date().toISOString()
    };

    if (onSaveSalaryPayment) onSaveSalaryPayment(paymentRecord);
    saveSalaryPaymentToSupabase(paymentRecord);

    // Update active salary advance recovery if deduction was confirmed
    if (actualAdvanceDeduction > 0 && targetAdvance) {
      const prevRecovered = Number(targetAdvance.totalRecoveredAmount) || 0;
      const prevBal = Number(targetAdvance.remainingBalance ?? (targetAdvance.advanceAmount - prevRecovered));
      const newRecovered = prevRecovered + actualAdvanceDeduction;
      const newBal = Math.max(0, prevBal - actualAdvanceDeduction);
      const isFullyRecovered = newBal === 0;

      const deductionEntry = {
        id: `REC-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        monthKey: payrollMonth,
        type: 'SALARY_DEDUCTION',
        amount: actualAdvanceDeduction,
        recoveredDate: paymentDate,
        recoveredTime: paymentTime,
        paymentId: paymentRecord.id,
        paymentRef: paymentTxnRef.trim(),
        paymentMode: paymentMode,
        remainingBalanceAfter: newBal,
        confirmedBy: currentUser?.name || 'Admin',
        notes: `Confirmed & recovered via ${payrollMonth} monthly salary disbursal`
      };

      const updatedAdv = {
        ...targetAdvance,
        totalRecoveredAmount: newRecovered,
        remainingBalance: newBal,
        status: isFullyRecovered ? 'Fully Recovered' : targetAdvance.status,
        deductionHistory: [
          ...(targetAdvance.deductionHistory || []),
          deductionEntry
        ]
      };

      if (onUpdateSalaryAdvance) onUpdateSalaryAdvance(updatedAdv);
      saveSalaryAdvanceToSupabase(updatedAdv);
    }

    setShowPaymentModal(false);
    alert(`✅ Salary Payment Recorded Successfully!\n• Employee: ${paymentRowData.fullName} (${paymentRowData.empCode})\n• Net Disbursed: ₹${calculatedNetPayable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n• Advance Recovered in Salary: ₹${actualAdvanceDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${actualAdvanceDeduction > 0 ? ' (Confirmed ✓)' : ' (Skipped)'}\n• Date: ${paymentDate} at ${paymentTime}\n• Mode: ${paymentMode}\n• Ref: ${paymentTxnRef || 'N/A'}`);
  };

  // Open Direct / Standalone Advance Recovery Modal (Advances Tab)
  const handleOpenAdvanceRecoveryModal = (adv) => {
    setRecoveryTargetAdvance(adv);
    const remBal = Number(adv.remainingBalance ?? (adv.advanceAmount - (adv.totalRecoveredAmount || 0)));
    const emi = Number(adv.monthlyEmiAmount) || 0;
    setRecoveryAmountInput(String(Math.min(emi > 0 ? emi : remBal, remBal)));
    setRecoveryModeInput('SALARY_DEDUCTION');
    const now = new Date();
    setRecoveryDateInput(now.toISOString().split('T')[0]);
    setRecoveryTimeInput(now.toTimeString().slice(0, 8));
    setRecoveryMonthInput(payrollMonth || now.toISOString().slice(0, 7));
    setRecoveryNotesInput(`Advance recovery confirmed for ${adv.employeeName}`);
    setShowAdvanceRecoveryModal(true);
  };

  // Submit Direct / Standalone Advance Recovery
  const handleDirectAdvanceRecoverySubmit = (e) => {
    e.preventDefault();
    if (!recoveryTargetAdvance) return;

    const remBal = Number(recoveryTargetAdvance.remainingBalance ?? (recoveryTargetAdvance.advanceAmount - (recoveryTargetAdvance.totalRecoveredAmount || 0)));
    const amt = parseFloat(recoveryAmountInput) || 0;

    if (amt <= 0) {
      alert("Please enter a valid recovery amount greater than 0.");
      return;
    }
    if (amt > remBal) {
      alert(`Recovery amount (₹${amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) cannot exceed remaining balance (₹${remBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`);
      return;
    }

    const prevRecovered = Number(recoveryTargetAdvance.totalRecoveredAmount) || 0;
    const newRecovered = prevRecovered + amt;
    const newBal = Math.max(0, remBal - amt);
    const isFullyRecovered = newBal === 0;

    const recoveryEntry = {
      id: `REC-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      monthKey: recoveryModeInput === 'SALARY_DEDUCTION' ? recoveryMonthInput : '',
      type: recoveryModeInput,
      amount: amt,
      recoveredDate: recoveryDateInput,
      recoveredTime: recoveryTimeInput,
      paymentId: '',
      paymentRef: '',
      paymentMode: recoveryModeInput === 'SALARY_DEDUCTION' ? 'Salary Deduction Adjustment' : 'Direct Repayment',
      remainingBalanceAfter: newBal,
      confirmedBy: currentUser?.name || 'Admin',
      notes: recoveryNotesInput.trim() || `Confirmed recovery of ₹${amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    };

    const updatedAdv = {
      ...recoveryTargetAdvance,
      totalRecoveredAmount: newRecovered,
      remainingBalance: newBal,
      status: isFullyRecovered ? 'Fully Recovered' : recoveryTargetAdvance.status,
      deductionHistory: [
        ...(recoveryTargetAdvance.deductionHistory || []),
        recoveryEntry
      ]
    };

    if (onUpdateSalaryAdvance) onUpdateSalaryAdvance(updatedAdv);
    saveSalaryAdvanceToSupabase(updatedAdv);

    setShowAdvanceRecoveryModal(false);
    alert(`✅ Advance Recovery Confirmed!\n• Employee: ${recoveryTargetAdvance.employeeName}\n• Recovered Amount: ₹${amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n• Remaining Balance: ₹${newBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n• Status: ${isFullyRecovered ? 'Fully Recovered 🎉' : 'Active (In Progress)'}`);
  };

  // Filtered Employee List
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        (emp.fullName || '').toLowerCase().includes(q) ||
        (emp.empCode || '').toLowerCase().includes(q) ||
        (emp.phone || '').toLowerCase().includes(q) ||
        (emp.department || '').toLowerCase().includes(q) ||
        (emp.designation || '').toLowerCase().includes(q);

      const matchesDept = departmentFilter === 'ALL' || emp.department === departmentFilter;
      const matchesStatus = statusFilter === 'ALL' || emp.status === statusFilter;
      const matchesShift = shiftFilter === 'ALL' || String(emp.shiftDurationHours) === shiftFilter;

      return matchesSearch && matchesDept && matchesStatus && matchesShift;
    });
  }, [employees, searchQuery, departmentFilter, statusFilter, shiftFilter]);

  // Monthly Payroll Computations for all active employees
  const monthlyPayrollSummary = useMemo(() => {
    const activeEmps = employees.filter(e => e.status !== 'Relieved' && e.status !== 'Terminated');
    return activeEmps.map(emp => {
      return calculateEmployeeMonthlySalary(emp, payrollMonth, attendanceRecords, salaryAdvances, workingDaysCount);
    }).filter(Boolean);
  }, [employees, payrollMonth, attendanceRecords, salaryAdvances, workingDaysCount]);

  // Payroll Metrics Totals
  const payrollTotals = useMemo(() => {
    return monthlyPayrollSummary.reduce((acc, row) => {
      acc.totalGross += row.totalGrossEarned || 0;
      acc.totalNet += row.netPayable || 0;
      acc.totalOtPay += row.earnedOtPay || 0;
      acc.totalPf += row.pfDeduction || 0;
      acc.totalEsic += row.esicDeduction || 0;
      acc.totalAdvanceRecovered += row.totalAdvanceDeduction || 0;
      acc.totalOtHours += row.approvedOtHours || 0;
      return acc;
    }, { totalGross: 0, totalNet: 0, totalOtPay: 0, totalPf: 0, totalEsic: 0, totalAdvanceRecovered: 0, totalOtHours: 0 });
  }, [monthlyPayrollSummary]);

  // Pending OT Requests across all records
  const pendingOtList = useMemo(() => {
    return attendanceRecords.filter(a => Number(a.overtimeHours) > 0 && a.overtimeStatus === 'Pending Approval');
  }, [attendanceRecords]);

  // Department List Options
  const departmentListOptions = useMemo(() => {
    return Array.isArray(EMPLOYEE_DEPARTMENTS) ? EMPLOYEE_DEPARTMENTS : [];
  }, []);

  // Filtered Salary Advances Schedule
  const filteredSalaryAdvances = useMemo(() => {
    return salaryAdvances.filter(adv => {
      // Date Range Filter (against requestDate or disbursementDate)
      if (advancesStartDate && adv.requestDate && adv.requestDate < advancesStartDate) {
        return false;
      }
      if (advancesEndDate && adv.requestDate && adv.requestDate > advancesEndDate) {
        return false;
      }

      // Status Filter
      if (advancesStatusFilter !== 'ALL' && adv.status !== advancesStatusFilter) {
        return false;
      }

      // Department Filter
      if (advancesDepartmentFilter !== 'ALL' && adv.department !== advancesDepartmentFilter) {
        return false;
      }

      // Search Query Filter
      if (advancesSearch.trim()) {
        const q = advancesSearch.toLowerCase().trim();
        const empName = (adv.employeeName || '').toLowerCase();
        const empCode = (adv.employeeCode || '').toLowerCase();
        const reason = (adv.reason || '').toLowerCase();
        const dept = (adv.department || '').toLowerCase();
        if (!empName.includes(q) && !empCode.includes(q) && !reason.includes(q) && !dept.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [salaryAdvances, advancesStartDate, advancesEndDate, advancesStatusFilter, advancesDepartmentFilter, advancesSearch]);

  // Salary Advances Summary Metrics
  const advancesMetrics = useMemo(() => {
    return filteredSalaryAdvances.reduce((acc, adv) => {
      acc.totalDisbursed += (adv.advanceAmount || 0);
      acc.totalRecovered += (adv.totalRecoveredAmount || 0);
      acc.totalBalance += (adv.remainingBalance || 0);
      acc.count += 1;
      return acc;
    }, { totalDisbursed: 0, totalRecovered: 0, totalBalance: 0, count: 0 });
  }, [filteredSalaryAdvances]);

  // Export Salary Advances Schedule to CSV
  const handleExportAdvancesCSV = () => {
    let csv = "Request Date,Disbursement Date,Employee Code,Employee Name,Department,Advance Amount (₹),Repayment Tenure (Months),Monthly EMI (₹),Total Recovered (₹),Remaining Balance (₹),Status,Reason,Approved By\n";
    filteredSalaryAdvances.forEach(adv => {
      csv += `"${adv.requestDate || ''}","${adv.disbursementDate || ''}","${adv.employeeCode || ''}","${adv.employeeName || ''}","${adv.department || ''}",${adv.advanceAmount || 0},${adv.repaymentTenureMonths || 0},${adv.monthlyEmiAmount || 0},${adv.totalRecoveredAmount || 0},${adv.remainingBalance || 0},"${adv.status || ''}","${(adv.reason || '').replace(/"/g, '""')}","${adv.approvedBy || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateRangeStr = (advancesStartDate || advancesEndDate) 
      ? `_${advancesStartDate || 'Start'}_to_${advancesEndDate || 'End'}`
      : '';
    link.download = `Salary_Advances_Schedule${dateRangeStr}.csv`;
    link.click();
  };

  // Export Monthly Salary Sheet to CSV
  const handleExportPayrollCSV = () => {
    let csv = "Employee Code,Employee Name,Department,Designation,Shift Hours,Working Days,Present Days,Half Days,Night Shifts,Approved OT Hours,Basic Salary (₹),HRA (₹),Other Allowance (₹),Dinner Allowance (₹),Overtime Pay (₹),Total Gross (₹),PF Deduction (₹),ESIC Deduction (₹),PT (₹),Advance EMI (₹),Total Deductions (₹),Net Payable (₹),Bank Name,Account Number,IFSC\n";
    monthlyPayrollSummary.forEach(row => {
      const bank = row.bankDetails || {};
      csv += `"${row.empCode}","${row.fullName}","${row.department}","${row.designation}",${row.shiftDurationHours},${row.totalWorkingDays},${row.presentCount},${row.halfDayCount},${row.nightShiftCount},${row.approvedOtHours},${row.earnedBasic},${row.earnedHra},${row.earnedOther},${row.dinnerAllowance},${row.earnedOtPay},${row.totalGrossEarned},${row.pfDeduction},${row.esicDeduction},${row.ptDeduction},${row.totalAdvanceDeduction},${row.totalDeductions},${row.netPayable},"${bank.bankName || ''}","${bank.accountNumber || ''}","${bank.ifscCode || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Samyak_Salary_Sheet_${payrollMonth}.csv`;
    link.click();
  };

  return (
    <div className="tab-container" style={{ padding: '20px 24px' }}>
      
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--primary-brand)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={26} /> Employee Management & Payroll HR Engine
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage staff onboarding, 8h/10h/12h shift attendance, daily overtime approvals, salary advances, statutory PF/ESIC, & monthly payroll processing.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            type="button" 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}
            onClick={handleOpenNewAdvanceModal}
          >
            <Coins size={16} /> Request Salary Advance
          </button>

          <button 
            type="button" 
            className="btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}
            onClick={handleOpenOnboardModal}
          >
            <UserPlus size={16} /> Onboard New Employee
          </button>
        </div>
      </div>

      {/* Sub-Tabs Bar */}
      <div className="nav-tabs" style={{ marginBottom: '20px', borderBottom: '2px solid #e2e8f0', display: 'flex', gap: '8px' }}>
        <button 
          className={`nav-tab-btn ${activeSubTab === 'directory' ? 'active' : ''}`}
          onClick={() => handleSubTabChange('directory')}
          style={{ padding: '8px 18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Users size={16} /> Employee Directory ({employees.length})
        </button>

        <button 
          className={`nav-tab-btn ${activeSubTab === 'attendance' ? 'active' : ''}`}
          onClick={() => handleSubTabChange('attendance')}
          style={{ padding: '8px 18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Calendar size={16} /> Daily Shift Register (8h / 10h / 12h)
        </button>

        <button 
          className={`nav-tab-btn ${activeSubTab === 'overtime' ? 'active' : ''}`}
          onClick={() => handleSubTabChange('overtime')}
          style={{ padding: '8px 18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Clock size={16} /> Overtime Approvals
          {pendingOtList.length > 0 && (
            <span style={{ background: '#ef4444', color: '#ffffff', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px', fontWeight: '900' }}>
              {pendingOtList.length} Pending
            </span>
          )}
        </button>

        <button 
          className={`nav-tab-btn ${activeSubTab === 'advances' ? 'active' : ''}`}
          onClick={() => handleSubTabChange('advances')}
          style={{ padding: '8px 18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Coins size={16} /> Salary Advances & Loans
        </button>

        <button 
          className={`nav-tab-btn ${activeSubTab === 'payroll' ? 'active' : ''}`}
          onClick={() => handleSubTabChange('payroll')}
          style={{ padding: '8px 18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <FileSpreadsheet size={16} /> Monthly Salary Sheet & Payslips
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: EMPLOYEE DIRECTORY & ONBOARDING / OFFBOARDING                 */}
      {/* ========================================================================= */}
      {activeSubTab === 'directory' && (
        <div>
          {/* Quick Metrics Bar */}
          <div className="stat-cards-grid">
            <div className="stat-card">
              <div className="stat-card-title">Active Factory Strength</div>
              <div className="stat-card-val" style={{ color: '#0f172a' }}>
                {employees.filter(e => e.status === 'Active').length} <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'normal' }}>/ {employees.length} Total</span>
              </div>
              <div className="stat-card-sub">Printing, Lamination, Slitting, QC, Stores</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-title">12h vs 10h vs 8h Shifts</div>
              <div className="stat-card-val" style={{ color: '#0284c7' }}>
                {employees.filter(e => e.shiftDurationHours === 12).length} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>12h</span> | {employees.filter(e => e.shiftDurationHours === 10).length} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>10h</span> | {employees.filter(e => e.shiftDurationHours === 8).length} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>8h</span>
              </div>
              <div className="stat-card-sub">Selectable & editable per employee</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-title">Statutory Enrolments</div>
              <div className="stat-card-val" style={{ color: '#059669' }}>
                {employees.filter(e => e.salaryStructure?.optPf).length} PF <span style={{ fontSize: '0.85rem', color: '#64748b' }}>| {employees.filter(e => e.salaryStructure?.optEsic).length} ESIC</span>
              </div>
              <div className="stat-card-sub">Optional compliance deductions</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-title">Active Salary Advances</div>
              <div className="stat-card-val" style={{ color: '#d97706' }}>
                ₹ {salaryAdvances.filter(a => a.status === 'Approved & Disbursed').reduce((acc, a) => acc + (a.remainingBalance || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="stat-card-sub">Recoverable outstanding balance</div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="glass-panel" style={{ padding: '14px 18px', marginBottom: '18px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input 
                type="text"
                className="form-control"
                style={{ paddingLeft: '32px' }}
                placeholder="Search employee by name, code, phone, department..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Filter size={15} style={{ color: '#64748b' }} />
              <SearchableSelect className="form-control" style={{ minWidth: '160px' }} value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}>
                <option value="ALL">All Departments</option>
                {EMPLOYEE_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </SearchableSelect>

              <SearchableSelect className="form-control" style={{ minWidth: '160px' }} value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}>
                <option value="ALL">All Shift Durations</option>
                <option value="12">12 Hours Shift</option>
                <option value="10">10 Hours Shift</option>
                <option value="8">8 Hours Shift</option>
              </SearchableSelect>

              <SearchableSelect className="form-control" style={{ minWidth: '140px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="ALL">All Statuses</option>
                {EMPLOYEE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </SearchableSelect>
            </div>
          </div>

          {/* Employee Directory Table */}
          <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
            <table className="data-table" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr>
                  <th>Emp Code & Name</th>
                  <th>Department & Designation</th>
                  <th>Configured Shift</th>
                  <th>Monthly Gross CTC</th>
                  <th>Statutory (PF/ESIC)</th>
                  <th>Bank Details</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      No employees found matching the filters.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map(emp => {
                    const struct = emp.salaryStructure || {};
                    const gross = (struct.basicSalary || 0) + (struct.hra || 0) + (struct.otherAllowance || 0);
                    const bank = emp.bankDetails || {};
                    const shiftHrs = emp.shiftDurationHours || 12;

                    return (
                      <tr key={emp.id}>
                        <td>
                          <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.88rem' }}>
                            {emp.fullName}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                            ID: <b>{emp.empCode || emp.id}</b> | Ph: {emp.phone || '—'}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '700', color: '#1e293b' }}>{emp.department}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{emp.designation}</div>
                        </td>
                        <td>
                          <span style={{ 
                            background: shiftHrs === 12 ? '#f0fdf4' : shiftHrs === 10 ? '#eff6ff' : '#fef3c7',
                            color: shiftHrs === 12 ? '#166534' : shiftHrs === 10 ? '#1e40af' : '#92400e',
                            border: `1px solid ${shiftHrs === 12 ? '#bbf7d0' : shiftHrs === 10 ? '#bfdbfe' : '#fde68a'}`,
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            display: 'inline-block'
                          }}>
                            {shiftHrs} Hours Shift
                          </span>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                            {emp.defaultShift || 'Day Shift'}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '800', color: '#0f172a' }}>₹ {(gross || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            Basic: ₹{(struct.basicSalary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | HRA: ₹{(struct.hra || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <span style={{ 
                              background: struct.optPf ? '#ecfdf5' : '#f1f5f9', 
                              color: struct.optPf ? '#059669' : '#94a3b8',
                              padding: '1px 6px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: '800', border: '1px solid #cbd5e1'
                            }}>
                              PF {struct.optPf ? '✓' : '✗'}
                            </span>
                            <span style={{ 
                              background: struct.optEsic ? '#ecfdf5' : '#f1f5f9', 
                              color: struct.optEsic ? '#059669' : '#94a3b8',
                              padding: '1px 6px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: '800', border: '1px solid #cbd5e1'
                            }}>
                              ESIC {struct.optEsic ? '✓' : '✗'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: (struct.dinnerAllowancePerNight > 0 || struct.fixedDinnerAllowance > 0) ? '#64748b' : '#94a3b8', marginTop: '2px' }}>
                            {(struct.dinnerAllowancePerNight > 0 || struct.fixedDinnerAllowance > 0) 
                              ? `Dinner: ₹${struct.dinnerAllowancePerNight || struct.fixedDinnerAllowance}/night (Opted)` 
                              : 'Dinner: Optional (None)'}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.76rem', color: '#1e293b', fontWeight: '700' }}>{bank.bankName || '—'}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
                            A/C: {bank.accountNumber ? `••••${bank.accountNumber.slice(-4)}` : '—'}
                          </div>
                        </td>
                        <td>
                          <span style={{ 
                            background: emp.status === 'Active' ? '#dcfce7' : emp.status === 'Notice Period' ? '#fee2e2' : '#f1f5f9',
                            color: emp.status === 'Active' ? '#15803d' : emp.status === 'Notice Period' ? '#b91c1c' : '#475569',
                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '800'
                          }}>
                            {emp.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isAdmin ? (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                style={{ padding: '3px 8px', fontSize: '0.75rem', color: '#0284c7' }}
                                onClick={() => handleOpenEditModal(emp)}
                                title="Edit Employee & Shift Hours (Admin Only)"
                              >
                                <Edit3 size={13} /> Edit
                              </button>
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                style={{ padding: '3px 8px', fontSize: '0.75rem', color: '#d97706' }}
                                onClick={() => handleOpenOffboardModal(emp)}
                                title="Offboard / Relieving / Settlement (Admin Only)"
                              >
                                <UserMinus size={13} /> Offboard
                              </button>
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                style={{ padding: '3px 8px', fontSize: '0.75rem', color: '#ef4444' }}
                                onClick={() => handleDeleteEmployee(emp.id, emp.fullName)}
                                title="Delete Record (Admin Only)"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ) : (
                            <span 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '4px', 
                                padding: '3px 8px', 
                                fontSize: '0.72rem', 
                                fontWeight: '700', 
                                color: '#64748b', 
                                background: '#f1f5f9', 
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1'
                              }}
                              title="Edit, Offboard, and Delete permissions are restricted to Admin role."
                            >
                              <Lock size={12} style={{ color: '#64748b' }} /> Admin Only
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: DAILY ATTENDANCE & SHIFT REGISTER (8h, 10h, 12h)               */}
      {/* ========================================================================= */}
      {activeSubTab === 'attendance' && (
        <div>
          {/* Top Date & Bulk Action Bar */}
          <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', display: 'block', marginBottom: '3px' }}>
                  SELECT ATTENDANCE DATE
                </label>
                <input 
                  type="date" 
                  className="form-control" 
                  style={{ fontWeight: '800', color: 'var(--primary-brand)' }}
                  value={attendanceDate}
                  onChange={e => setAttendanceDate(e.target.value)}
                />
              </div>

              <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: '16px' }}>
                Showing shift roster for: <b style={{ color: '#0f172a' }}>{new Date(attendanceDate).toDateString()}</b>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0', fontWeight: '800' }}
                onClick={handleBulkMarkPresent}
              >
                <CheckCircle2 size={16} /> Mark All Active as Present
              </button>
            </div>
          </div>

          {/* Daily Attendance Table */}
          <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
            <table className="data-table" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr>
                  <th>Employee Name & Dept</th>
                  <th>Configured Shift</th>
                  <th>Shift Assigned</th>
                  <th>Status</th>
                  <th>Check In / Out</th>
                  <th>Overtime Logged</th>
                  <th>OT Approval Status</th>
                  <th>Dinner Allowance</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {employees.filter(e => e.status !== 'Relieved' && e.status !== 'Terminated').map(emp => {
                  const att = attendanceRecords.find(a => a.employeeId === emp.id && a.date === attendanceDate);
                  const status = att?.status || 'Not Marked';
                  const shiftHrs = emp.shiftDurationHours || 12;
                  const otHours = att?.overtimeHours || 0;
                  const otStatus = att?.overtimeStatus || (otHours > 0 ? 'Pending Approval' : '—');
                  const isNight = att?.dinnerAllowanceEligible || (att?.shiftType && att.shiftType.toLowerCase().includes('night'));

                  return (
                    <tr key={emp.id}>
                      <td>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>{emp.fullName}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{emp.department} • {emp.empCode || emp.id}</div>
                      </td>
                      <td>
                        <span style={{ 
                          background: shiftHrs === 12 ? '#f0fdf4' : shiftHrs === 10 ? '#eff6ff' : '#fef3c7',
                          color: shiftHrs === 12 ? '#166534' : shiftHrs === 10 ? '#1e40af' : '#92400e',
                          border: `1px solid ${shiftHrs === 12 ? '#bbf7d0' : shiftHrs === 10 ? '#bfdbfe' : '#fde68a'}`,
                          fontSize: '0.72rem',
                          fontWeight: '800',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}>
                          {shiftHrs}h Standard
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {isNight ? <Moon size={14} style={{ color: '#7c3aed' }} /> : <Sun size={14} style={{ color: '#d97706' }} />}
                          {att?.shiftType || emp.defaultShift || 'Shift A: Day'}
                        </div>
                      </td>
                      <td>
                        <span style={{ 
                          background: status === 'Present' ? '#dcfce7' : status === 'Half Day' ? '#fef3c7' : status === 'Paid Leave' ? '#e0f2fe' : status === 'Absent' ? '#fee2e2' : '#f1f5f9',
                          color: status === 'Present' ? '#15803d' : status === 'Half Day' ? '#b45309' : status === 'Paid Leave' ? '#0369a1' : status === 'Absent' ? '#b91c1c' : '#64748b',
                          padding: '3px 8px', borderRadius: '4px', fontSize: '0.74rem', fontWeight: '800'
                        }}>
                          {status}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: '700' }}>
                          {att ? `${att.checkIn || '—'} → ${att.checkOut || '—'}` : '—'}
                        </div>
                      </td>
                      <td>
                        {otHours > 0 ? (
                          <div>
                            <div style={{ fontWeight: '800', color: '#059669', fontSize: '0.82rem' }}>
                              +{otHours} hrs OT
                            </div>
                            {calculateOvertimeTimeWindow(att).displayStr ? (
                              <div style={{ fontSize: '0.68rem', color: '#15803d', fontWeight: '700' }}>
                                {calculateOvertimeTimeWindow(att).displayStr}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>None</span>
                        )}
                      </td>
                      <td>
                        {otHours > 0 ? (
                          <span style={{ 
                            background: otStatus === 'Approved' ? '#dcfce7' : otStatus === 'Rejected' ? '#fee2e2' : '#fef9c3',
                            color: otStatus === 'Approved' ? '#166534' : otStatus === 'Rejected' ? '#991b1b' : '#854d0e',
                            padding: '2px 6px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: '800'
                          }}>
                            {otStatus}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>
                      <td>
                        {(att?.dinnerAllowanceEligible || (emp.salaryStructure?.optDinner && (Number(emp.salaryStructure?.dinnerAllowancePerNight) > 0 || Number(emp.salaryStructure?.fixedDinnerAllowance) > 0))) ? (
                          <span style={{ background: '#f5f3ff', color: '#6d28d9', padding: '2px 6px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: '800', border: '1px solid #ddd6fe' }}>
                            🍲 ₹{emp.salaryStructure?.dinnerAllowancePerNight || emp.salaryStructure?.fixedDinnerAllowance}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Optional (None)</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {att ? (
                          isAdmin ? (
                            <button 
                              type="button" 
                              className="btn-secondary" 
                              style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#0284c7', fontWeight: '700' }}
                              onClick={() => handleOpenAttendanceModal(emp)}
                              title="Edit Attendance Record (Admin Authorization)"
                            >
                              <Edit3 size={13} /> Edit Log
                            </button>
                          ) : (
                            <span 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '4px', 
                                padding: '4px 8px', 
                                fontSize: '0.72rem', 
                                fontWeight: '700', 
                                color: '#64748b', 
                                background: '#f1f5f9', 
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1'
                              }}
                              title="Attendance already recorded. Locked for non-admin roles."
                            >
                              <Lock size={12} style={{ color: '#64748b' }} /> Locked (Admin Only)
                            </span>
                          )
                        ) : (
                          <button 
                            type="button" 
                            className="btn-primary" 
                            style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: '700' }}
                            onClick={() => handleOpenAttendanceModal(emp)}
                          >
                            <Calendar size={13} /> Mark Att
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: OVERTIME (OT) APPROVALS                                        */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* SUB-TAB 3: OVERTIME (OT) APPROVALS & MULTI-VIEW AUDIT                     */}
      {/* ========================================================================= */}
      {activeSubTab === 'overtime' && (() => {
        // Sub-table renderer for expandable groups in Daily, Weekly, and Monthly views
        const renderOtSubTable = (records, periodTitle) => (
          <div style={{ padding: '14px 18px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderRadius: '0 0 8px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Employee Breakdown • {periodTitle} ({records.length} {records.length === 1 ? 'Record' : 'Records'})
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                Total Payout: <strong style={{ color: '#0f172a' }}>₹ {(records.reduce((sum, r) => sum + (r.payout || 0), 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
            </div>
            <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <table className="data-table" style={{ width: '100%', margin: 0, fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '8px 10px' }}>Date</th>
                    <th style={{ padding: '8px 10px' }}>Employee</th>
                    <th style={{ padding: '8px 10px' }}>Shift & Timing</th>
                    <th style={{ padding: '8px 10px' }}>OT Hours</th>
                    <th style={{ padding: '8px 10px' }}>Reason / Extension</th>
                    <th style={{ padding: '8px 10px' }}>Rate & Payout</th>
                    <th style={{ padding: '8px 10px' }}>Status</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Approval & Revert Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(({ att, payout, hourlyRate, emp, shiftHrs }) => {
                    const otWin = calculateOvertimeTimeWindow(att);
                    const status = att.overtimeStatus || 'Pending Approval';
                    return (
                      <tr key={att.id}>
                        <td style={{ padding: '8px 10px', fontWeight: '800', color: '#0f172a', whiteSpace: 'nowrap' }}>
                          {formatDateDisplay(att.date)}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: '800', color: '#0f172a' }}>{emp?.fullName || emp?.name || att.employeeId}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{emp?.department || 'General'} • {emp?.empCode || emp?.id}</div>
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                            {shiftHrs}h Shift
                          </span>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>
                            {att.checkIn || '08:00'} - {att.checkOut || '20:00'}
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: '900', color: '#059669', fontSize: '0.85rem' }}>+{att.overtimeHours} hrs</div>
                          {otWin.displayStr && <div style={{ fontSize: '0.68rem', color: '#166534', fontWeight: '700' }}>{otWin.displayStr}</div>}
                        </td>
                        <td style={{ padding: '8px 10px', maxWidth: '220px', fontSize: '0.75rem', color: '#334155' }}>
                          {att.overtimeReason || 'Production job extended.'}
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: '800', color: '#0f172a' }}>₹ {(payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b' }}>@ ₹{hourlyRate}/hr</div>
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            background: status === 'Approved' ? '#dcfce7' : status === 'Rejected' ? '#fee2e2' : '#fef3c7',
                            color: status === 'Approved' ? '#166534' : status === 'Rejected' ? '#991b1b' : '#92400e',
                            border: `1px solid ${status === 'Approved' ? '#bbf7d0' : status === 'Rejected' ? '#fecaca' : '#fde68a'}`,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: '800'
                          }}>
                            {status}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {status === 'Pending Approval' ? (
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ padding: '3px 8px', fontSize: '0.72rem', background: '#059669', borderColor: '#059669', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                onClick={() => handleApproveOvertime(att, true)}
                                title="Approve overtime and add to monthly salary"
                              >
                                <Check size={12} /> Approve
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '3px 6px', fontSize: '0.72rem', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                onClick={() => handleApproveOvertime(att, false)}
                                title="Reject overtime request"
                              >
                                <X size={12} /> Reject
                              </button>
                            </div>
                          ) : status === 'Approved' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '0.72rem',
                                  color: '#b45309',
                                  background: '#fffbeb',
                                  borderColor: '#fcd34d',
                                  fontWeight: '800',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                onClick={() => handleRevertOvertime(att)}
                                title={`Revert approval and automatically deduct ₹${(payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} from employee's monthly salary`}
                              >
                                <RotateCcw size={12} /> Revert (Deduct ₹{(payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                              </button>
                              <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                by {att.overtimeApprovedBy || 'Admin'}
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '0.72rem',
                                  color: '#475569',
                                  background: '#f8fafc',
                                  fontWeight: '700',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                onClick={() => handleRevertOvertime(att)}
                                title="Revert rejection and restore to Pending Approval"
                              >
                                <RotateCcw size={12} /> Revert Rejection
                              </button>
                              <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                by {att.overtimeApprovedBy || 'Admin'}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );

        return (
          <div>
            {/* Protocol Notice Banner */}
            <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ShieldCheck size={26} style={{ color: '#16a34a', flexShrink: 0 }} />
                <div>
                  <h4 style={{ margin: 0, fontWeight: '800', color: '#166534', fontSize: '0.95rem' }}>
                    Factory Overtime Authorization Protocol & Wage Impact
                  </h4>
                  <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#15803d', lineHeight: '1.4' }}>
                    Rule Enforcement: Overtime logged on shop floor beyond standard shifts (8h, 10h, 12h) requires plant authorization. 
                    Approved overtime is automatically credited to the employee’s monthly gross earnings. 
                    <strong> Reverting an approval will immediately deduct the added overtime pay from the employee’s calculated monthly salary.</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* View Mode Switcher & Export Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', gap: '4px', border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setOtViewMode('register')}
                  style={{
                    padding: '7px 14px',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    borderRadius: '7px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: otViewMode === 'register' ? '#0f172a' : 'transparent',
                    color: otViewMode === 'register' ? '#ffffff' : '#64748b',
                    boxShadow: otViewMode === 'register' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FileText size={14} />
                  Detailed Register ({filteredOtRecords.length})
                </button>
                <button
                  type="button"
                  onClick={() => setOtViewMode('daily')}
                  style={{
                    padding: '7px 14px',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    borderRadius: '7px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: otViewMode === 'daily' ? '#0f172a' : 'transparent',
                    color: otViewMode === 'daily' ? '#ffffff' : '#64748b',
                    boxShadow: otViewMode === 'daily' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Calendar size={14} />
                  Daily View ({otDailyAggregates.length} Days)
                </button>
                <button
                  type="button"
                  onClick={() => setOtViewMode('weekly')}
                  style={{
                    padding: '7px 14px',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    borderRadius: '7px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: otViewMode === 'weekly' ? '#0f172a' : 'transparent',
                    color: otViewMode === 'weekly' ? '#ffffff' : '#64748b',
                    boxShadow: otViewMode === 'weekly' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <BarChart2 size={14} />
                  Weekly View ({otWeeklyAggregates.length} Weeks)
                </button>
                <button
                  type="button"
                  onClick={() => setOtViewMode('monthly')}
                  style={{
                    padding: '7px 14px',
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    borderRadius: '7px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: otViewMode === 'monthly' ? '#0f172a' : 'transparent',
                    color: otViewMode === 'monthly' ? '#ffffff' : '#64748b',
                    boxShadow: otViewMode === 'monthly' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <TrendingUp size={14} />
                  Monthly View ({otMonthlyAggregates.length} Months)
                </button>
              </div>

              {/* CSV Export Button */}
              <button
                type="button"
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '800', padding: '7px 14px' }}
                onClick={handleExportOtCSV}
              >
                <Download size={14} /> Export {otViewMode === 'register' ? 'Register' : otViewMode === 'daily' ? 'Daily Summary' : otViewMode === 'weekly' ? 'Weekly Summary' : 'Monthly Summary'} (CSV)
              </button>
            </div>

            {/* KPI Cards: Total Amount, Total Hours, No. of Employees, Pending Approvals */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '18px' }}>
              {/* Card 1: Total Overtime Amount */}
              <div className="glass-panel" style={{ padding: '16px 18px', borderLeft: '4px solid #10b981', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Total Overtime Amount
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: '900', color: '#0f172a', marginTop: '4px' }}>
                      ₹ {(otGrandTotals?.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ background: '#ecfdf5', padding: '8px', borderRadius: '8px', color: '#059669' }}>
                    <Coins size={20} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px', fontSize: '0.72rem', color: '#64748b' }}>
                  <span>Approved: <strong style={{ color: '#059669' }}>₹ {(otGrandTotals?.approvedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  <span>•</span>
                  <span>Pending: <strong style={{ color: '#d97706' }}>₹ {(otGrandTotals?.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                </div>
              </div>

              {/* Card 2: Total Hours Worked */}
              <div className="glass-panel" style={{ padding: '16px 18px', borderLeft: '4px solid #2563eb', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Total Hours Worked
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: '900', color: '#0f172a', marginTop: '4px' }}>
                      {formatUpToTwoDecimals(otGrandTotals.totalHours)} hrs
                    </div>
                  </div>
                  <div style={{ background: '#eff6ff', padding: '8px', borderRadius: '8px', color: '#2563eb' }}>
                    <Clock size={20} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px', fontSize: '0.72rem', color: '#64748b' }}>
                  <span>Approved: <strong style={{ color: '#059669' }}>{formatUpToTwoDecimals(otGrandTotals.approvedHours)}h</strong></span>
                  <span>•</span>
                  <span>Pending: <strong style={{ color: '#d97706' }}>{formatUpToTwoDecimals(otGrandTotals.pendingHours)}h</strong></span>
                </div>
              </div>

              {/* Card 3: Employees Working OT */}
              <div className="glass-panel" style={{ padding: '16px 18px', borderLeft: '4px solid #9333ea', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Employees Working OT
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: '900', color: '#0f172a', marginTop: '4px' }}>
                      {otGrandTotals.uniqueEmployeesCount} Personnel
                    </div>
                  </div>
                  <div style={{ background: '#faf5ff', padding: '8px', borderRadius: '8px', color: '#9333ea' }}>
                    <Users size={20} />
                  </div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#64748b' }}>
                  Logged across <strong style={{ color: '#0f172a' }}>{otGrandTotals.recordsCount}</strong> individual shifts
                </div>
              </div>

              {/* Card 4: Pending Authorizations */}
              <div className="glass-panel" style={{ padding: '16px 18px', borderLeft: '4px solid #f59e0b', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Pending Authorizations
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: '900', color: otGrandTotals.pendingCount > 0 ? '#d97706' : '#059669', marginTop: '4px' }}>
                      {otGrandTotals.pendingCount} Pending
                    </div>
                  </div>
                  <div style={{ background: '#fffbeb', padding: '8px', borderRadius: '8px', color: '#d97706' }}>
                    <AlertCircle size={20} />
                  </div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#64748b' }}>
                  Pending Wage Value: <strong style={{ color: '#d97706' }}>₹ {(otGrandTotals?.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
              </div>
            </div>

            {/* Filter Bar: Month, Employee, Status, Search Text */}
            <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px', borderRadius: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'end' }}>
                {/* Month Filter */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>
                    🗓️ FILTER BY MONTH
                  </label>
                  <SearchableSelect
                    className="form-control"
                    value={otMonthFilter}
                    onChange={e => setOtMonthFilter(e.target.value)}
                  >
                    <option value="ALL">All Months ({otAvailableMonths.length} Active)</option>
                    {otAvailableMonths.map(m => {
                      const mInfo = getMonthRangeInfo(m);
                      return (
                        <option key={m} value={m}>
                          {mInfo.label} ({m})
                        </option>
                      );
                    })}
                  </SearchableSelect>
                </div>

                {/* Employee Filter */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>
                    🔍 SELECT EMPLOYEE
                  </label>
                  <SearchableSelect
                    value={otEmployeeFilter}
                    onChange={e => {
                      const selectedVal = e?.target?.value !== undefined ? e.target.value : (typeof e === 'object' && e?.value !== undefined ? e.value : e);
                      setOtEmployeeFilter(selectedVal || 'ALL');
                    }}
                    placeholder="Filter by employee..."
                    options={[
                      { value: 'ALL', label: 'All Employees' },
                      ...(employees || []).map(e => ({
                        value: e.id,
                        label: `${e.fullName || e.name || 'Employee'} (${e.empCode || e.id})`,
                        subtitle: `${e.department || 'General'} • ${e.designation || 'Staff'}`
                      }))
                    ]}
                  />
                </div>

                {/* Approval Status Filter */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>
                    APPROVAL STATUS
                  </label>
                  <SearchableSelect 
                    className="form-control" 
                    value={otStatusFilter} 
                    onChange={e => setOtStatusFilter(e.target.value)}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="Pending Approval">Pending Approval</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </SearchableSelect>
                </div>

                {/* Search query */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>
                    SEARCH REASON / DEPT / DATE
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input 
                      type="text" 
                      className="form-control" 
                      style={{ paddingLeft: '32px' }}
                      placeholder="Search name, code, reason, dept..." 
                      value={otSearchQuery} 
                      onChange={e => setOtSearchQuery(e.target.value)} 
                    />
                  </div>
                </div>

                {/* Reset Filters */}
                {(otMonthFilter !== 'ALL' || otEmployeeFilter !== 'ALL' || otStatusFilter !== 'ALL' || otSearchQuery) && (
                  <div>
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      style={{ width: '100%', fontSize: '0.78rem', padding: '8px' }}
                      onClick={() => {
                        setOtMonthFilter('ALL');
                        setOtEmployeeFilter('ALL');
                        setOtStatusFilter('ALL');
                        setOtSearchQuery('');
                      }}
                    >
                      Reset Filters
                    </button>
                  </div>
                )}
              </div>

              {/* Active Filter Metrics Strip */}
              <div style={{ display: 'flex', gap: '16px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#64748b', flexWrap: 'wrap' }}>
                <div>Records: <strong style={{ color: '#0f172a' }}>{filteredOtRecords.length}</strong></div>
                <div>Pending: <strong style={{ color: '#d97706' }}>{otGrandTotals.pendingCount}</strong></div>
                <div>Approved: <strong style={{ color: '#059669' }}>{filteredOtRecords.filter(a => a.overtimeStatus === 'Approved').length}</strong></div>
                <div>Rejected: <strong style={{ color: '#dc2626' }}>{filteredOtRecords.filter(a => a.overtimeStatus === 'Rejected').length}</strong></div>
                <div>Active Employees: <strong style={{ color: '#0f172a' }}>{otGrandTotals.uniqueEmployeesCount}</strong></div>
              </div>
            </div>

            {/* ================================================================= */}
            {/* VIEW 1: DETAILED REGISTER                                         */}
            {/* ================================================================= */}
            {otViewMode === 'register' && (
              <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', borderRadius: '12px' }}>
                <table className="data-table" style={{ width: '100%', margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Employee Name & Dept</th>
                      <th>Standard Shift</th>
                      <th>Overtime Hours</th>
                      <th>Reason / Machine Extension</th>
                      <th>Est. OT Payout (1x)</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'center' }}>Approval & Revert Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOtRecords.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                          No overtime records found matching the selected filters.
                        </td>
                      </tr>
                    ) : (
                      filteredOtRecords.map(att => {
                        const payoutInfo = getRecordOtPayout(att, employees);
                        const emp = payoutInfo.emp;
                        const otWin = calculateOvertimeTimeWindow(att);
                        const status = att.overtimeStatus || 'Pending Approval';

                        return (
                          <tr key={att.id}>
                            <td style={{ fontWeight: '800', color: '#0f172a', whiteSpace: 'nowrap' }}>
                              {formatDateDisplay(att.date)}
                            </td>
                            <td>
                              <div style={{ fontWeight: '800', color: '#0f172a' }}>{emp?.fullName || emp?.name || att.employeeId}</div>
                              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{emp?.department || 'General'} • {emp?.empCode || emp?.id}</div>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: '800', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                                {payoutInfo.shiftHrs} Hours Shift
                              </span>
                              <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>
                                Shift: {att.checkIn || '08:00'} - {att.checkOut || '20:00'}
                              </div>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: '900', color: '#059669', fontSize: '0.9rem' }}>
                                +{formatUpToTwoDecimals(att.overtimeHours)} Hrs
                              </div>
                              {otWin.displayStr ? (
                                <div style={{ fontSize: '0.74rem', color: '#15803d', fontWeight: '800', marginTop: '2px' }}>
                                  Time: {otWin.displayStr}
                                </div>
                              ) : null}
                            </td>
                            <td style={{ maxWidth: '280px', fontSize: '0.8rem', color: '#334155' }}>
                              {att.overtimeReason || 'Production job run extended.'}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: '800', color: '#0f172a' }}>₹ {(payoutInfo?.payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>@ ₹{payoutInfo.hourlyRate}/hr</div>
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span style={{ 
                                background: status === 'Approved' ? '#dcfce7' : status === 'Rejected' ? '#fee2e2' : '#fef3c7',
                                color: status === 'Approved' ? '#166534' : status === 'Rejected' ? '#991b1b' : '#92400e',
                                border: `1px solid ${status === 'Approved' ? '#bbf7d0' : status === 'Rejected' ? '#fecaca' : '#fde68a'}`,
                                padding: '3px 8px', borderRadius: '4px', fontSize: '0.74rem', fontWeight: '800'
                              }}>
                                {status}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {status === 'Pending Approval' ? (
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                  <button 
                                    type="button" 
                                    className="btn-primary" 
                                    style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#059669', borderColor: '#059669', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => handleApproveOvertime(att, true)}
                                    title="Approve overtime and credit to monthly salary"
                                  >
                                    <Check size={13} /> Approve
                                  </button>
                                  <button 
                                    type="button" 
                                    className="btn-secondary" 
                                    style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => handleApproveOvertime(att, false)}
                                    title="Reject overtime request"
                                  >
                                    <X size={13} /> Reject
                                  </button>
                                </div>
                              ) : status === 'Approved' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{
                                      padding: '4px 10px',
                                      fontSize: '0.75rem',
                                      color: '#b45309',
                                      background: '#fffbeb',
                                      borderColor: '#fcd34d',
                                      fontWeight: '800',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                    onClick={() => handleRevertOvertime(att)}
                                    title={`Revert approval and immediately deduct ₹${(payoutInfo?.payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} from employee's monthly salary`}
                                  >
                                    <RotateCcw size={13} /> Revert (Deduct ₹{(payoutInfo?.payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                  </button>
                                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                    Approved by {att.overtimeApprovedBy || 'Admin'}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{
                                      padding: '4px 10px',
                                      fontSize: '0.75rem',
                                      color: '#475569',
                                      background: '#f8fafc',
                                      fontWeight: '700',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                    onClick={() => handleRevertOvertime(att)}
                                    title="Revert rejection and return to Pending Approval"
                                  >
                                    <RotateCcw size={13} /> Revert Rejection
                                  </button>
                                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                    Rejected by {att.overtimeApprovedBy || 'Admin'}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ================================================================= */}
            {/* VIEW 2: DAILY OVERTIME VIEW                                       */}
            {/* ================================================================= */}
            {otViewMode === 'daily' && (
              <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', borderRadius: '12px' }}>
                <table className="data-table" style={{ width: '100%', margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Date & Day</th>
                      <th>No. of Employees</th>
                      <th>Hours Worked</th>
                      <th>Total OT Amount</th>
                      <th>Approval Breakdown</th>
                      <th style={{ textAlign: 'center' }}>Details & Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otDailyAggregates.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                          No daily overtime records found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      otDailyAggregates.map(dayGroup => {
                        const isExpanded = Boolean(expandedOtPeriods[dayGroup.key]);
                        return (
                          <React.Fragment key={dayGroup.key}>
                            <tr style={{ background: isExpanded ? '#f0fdf4' : 'transparent', transition: 'background 0.15s ease' }}>
                              <td style={{ fontWeight: '800', color: '#0f172a' }}>
                                <div style={{ fontSize: '0.92rem' }}>{formatDateDisplay(dayGroup.date)}</div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{dayGroup.dayName || 'Shift Day'}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Users size={15} style={{ color: '#9333ea' }} />
                                  {dayGroup.employeeCount} {dayGroup.employeeCount === 1 ? 'Employee' : 'Employees'}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  {dayGroup.records.length} {dayGroup.records.length === 1 ? 'Shift' : 'Shifts'} logged
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: '900', color: '#2563eb', fontSize: '0.95rem' }}>
                                  {formatUpToTwoDecimals(dayGroup.totalHours)} hrs
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  Appr: <span style={{ color: '#059669', fontWeight: '700' }}>{formatUpToTwoDecimals(dayGroup.approvedHours)}h</span> • Pend: <span style={{ color: '#d97706', fontWeight: '700' }}>{formatUpToTwoDecimals(dayGroup.pendingHours)}h</span>
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: '900', color: '#0f172a', fontSize: '0.95rem' }}>
                                  ₹ {(dayGroup?.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  Appr: <span style={{ color: '#059669', fontWeight: '700' }}>₹{(dayGroup?.approvedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> • Pend: <span style={{ color: '#d97706', fontWeight: '700' }}>₹{(dayGroup?.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {dayGroup.approvedHours > 0 && (
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px' }}>
                                      {dayGroup.records.filter(r => r.att.overtimeStatus === 'Approved').length} Approved
                                    </span>
                                  )}
                                  {dayGroup.pendingHours > 0 && (
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px' }}>
                                      {dayGroup.records.filter(r => (r.att.overtimeStatus || 'Pending Approval') === 'Pending Approval').length} Pending
                                    </span>
                                  )}
                                  {dayGroup.rejectedHours > 0 && (
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: '4px' }}>
                                      {dayGroup.records.filter(r => r.att.overtimeStatus === 'Rejected').length} Rejected
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{
                                    padding: '5px 12px',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    color: isExpanded ? '#166534' : '#0f172a',
                                    background: isExpanded ? '#dcfce7' : '#ffffff',
                                    borderColor: isExpanded ? '#86efac' : '#cbd5e1'
                                  }}
                                  onClick={() => toggleOtPeriodExpand(dayGroup.key)}
                                >
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  {isExpanded ? 'Hide Details' : `View ${dayGroup.records.length} Employees`}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} style={{ padding: 0, borderTop: 'none' }}>
                                  {renderOtSubTable(dayGroup.records, `${formatDateDisplay(dayGroup.date)} (${dayGroup.dayName})`)}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ================================================================= */}
            {/* VIEW 3: WEEKLY OVERTIME VIEW                                      */}
            {/* ================================================================= */}
            {otViewMode === 'weekly' && (
              <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', borderRadius: '12px' }}>
                <table className="data-table" style={{ width: '100%', margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Week Period</th>
                      <th>Days With OT</th>
                      <th>No. of Employees</th>
                      <th>Hours Worked</th>
                      <th>Total OT Amount</th>
                      <th style={{ textAlign: 'center' }}>Details & Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otWeeklyAggregates.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                          No weekly overtime records found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      otWeeklyAggregates.map(weekGroup => {
                        const isExpanded = Boolean(expandedOtPeriods[weekGroup.key]);
                        return (
                          <React.Fragment key={weekGroup.key}>
                            <tr style={{ background: isExpanded ? '#f0fdf4' : 'transparent', transition: 'background 0.15s ease' }}>
                              <td style={{ fontWeight: '800', color: '#0f172a' }}>
                                <div style={{ fontSize: '0.92rem' }}>{weekGroup.label}</div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                  {formatDateDisplay(weekGroup.start)} to {formatDateDisplay(weekGroup.end)}
                                </div>
                              </td>
                              <td>
                                <span style={{ fontSize: '0.75rem', fontWeight: '800', background: '#eff6ff', color: '#1e40af', padding: '3px 8px', borderRadius: '4px' }}>
                                  {weekGroup.daysCount} {weekGroup.daysCount === 1 ? 'Day' : 'Days'} Active
                                </span>
                              </td>
                              <td>
                                <div style={{ fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Users size={15} style={{ color: '#9333ea' }} />
                                  {weekGroup.employeeCount} {weekGroup.employeeCount === 1 ? 'Employee' : 'Employees'}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  {weekGroup.records.length} Overtime Shifts
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: '900', color: '#2563eb', fontSize: '0.95rem' }}>
                                  {formatUpToTwoDecimals(weekGroup.totalHours)} hrs
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  Appr: <span style={{ color: '#059669', fontWeight: '700' }}>{formatUpToTwoDecimals(weekGroup.approvedHours)}h</span> • Pend: <span style={{ color: '#d97706', fontWeight: '700' }}>{formatUpToTwoDecimals(weekGroup.pendingHours)}h</span>
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: '900', color: '#0f172a', fontSize: '0.95rem' }}>
                                  ₹ {(weekGroup?.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  Appr: <span style={{ color: '#059669', fontWeight: '700' }}>₹{(weekGroup?.approvedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> • Pend: <span style={{ color: '#d97706', fontWeight: '700' }}>₹{(weekGroup?.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{
                                    padding: '5px 12px',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    color: isExpanded ? '#166534' : '#0f172a',
                                    background: isExpanded ? '#dcfce7' : '#ffffff',
                                    borderColor: isExpanded ? '#86efac' : '#cbd5e1'
                                  }}
                                  onClick={() => toggleOtPeriodExpand(weekGroup.key)}
                                >
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  {isExpanded ? 'Hide Details' : `View ${weekGroup.records.length} Records`}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} style={{ padding: 0, borderTop: 'none' }}>
                                  {renderOtSubTable(weekGroup.records, weekGroup.label)}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ================================================================= */}
            {/* VIEW 4: MONTHLY OVERTIME VIEW                                     */}
            {/* ================================================================= */}
            {otViewMode === 'monthly' && (
              <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', borderRadius: '12px' }}>
                <table className="data-table" style={{ width: '100%', margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Days With OT</th>
                      <th>No. of Employees</th>
                      <th>Hours Worked</th>
                      <th>Total OT Amount</th>
                      <th style={{ textAlign: 'center' }}>Details & Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otMonthlyAggregates.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                          No monthly overtime records found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      otMonthlyAggregates.map(monthGroup => {
                        const isExpanded = Boolean(expandedOtPeriods[monthGroup.key]);
                        return (
                          <React.Fragment key={monthGroup.key}>
                            <tr style={{ background: isExpanded ? '#f0fdf4' : 'transparent', transition: 'background 0.15s ease' }}>
                              <td style={{ fontWeight: '800', color: '#0f172a' }}>
                                <div style={{ fontSize: '0.95rem' }}>{monthGroup.label}</div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Period Key: {monthGroup.key}</div>
                              </td>
                              <td>
                                <span style={{ fontSize: '0.75rem', fontWeight: '800', background: '#eff6ff', color: '#1e40af', padding: '3px 8px', borderRadius: '4px' }}>
                                  {monthGroup.daysCount} {monthGroup.daysCount === 1 ? 'Day' : 'Days'} with OT
                                </span>
                              </td>
                              <td>
                                <div style={{ fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Users size={15} style={{ color: '#9333ea' }} />
                                  {monthGroup.employeeCount} {monthGroup.employeeCount === 1 ? 'Employee' : 'Employees'}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  {monthGroup.records.length} Overtime Shifts
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: '900', color: '#2563eb', fontSize: '0.95rem' }}>
                                  {formatUpToTwoDecimals(monthGroup.totalHours)} hrs
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  Appr: <span style={{ color: '#059669', fontWeight: '700' }}>{formatUpToTwoDecimals(monthGroup.approvedHours)}h</span> • Pend: <span style={{ color: '#d97706', fontWeight: '700' }}>{formatUpToTwoDecimals(monthGroup.pendingHours)}h</span>
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: '900', color: '#0f172a', fontSize: '0.95rem' }}>
                                  ₹ {(monthGroup?.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  Appr: <span style={{ color: '#059669', fontWeight: '700' }}>₹{(monthGroup?.approvedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> • Pend: <span style={{ color: '#d97706', fontWeight: '700' }}>₹{(monthGroup?.pendingAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{
                                    padding: '5px 12px',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    color: isExpanded ? '#166534' : '#0f172a',
                                    background: isExpanded ? '#dcfce7' : '#ffffff',
                                    borderColor: isExpanded ? '#86efac' : '#cbd5e1'
                                  }}
                                  onClick={() => toggleOtPeriodExpand(monthGroup.key)}
                                >
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  {isExpanded ? 'Hide Details' : `View ${monthGroup.records.length} Records`}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} style={{ padding: 0, borderTop: 'none' }}>
                                  {renderOtSubTable(monthGroup.records, monthGroup.label)}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: SALARY ADVANCES & AMORTIZATION                                  */}
      {/* ========================================================================= */}
      {activeSubTab === 'advances' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              💳 Employee Salary Advances & EMI Recovery Schedule
            </h4>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}
                onClick={handleExportAdvancesCSV}
                title="Export filtered salary advances schedule to CSV"
              >
                <Download size={16} /> Download CSV
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={handleOpenNewAdvanceModal}
              >
                <Plus size={16} /> New Advance Request
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '16px', borderRadius: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                  From Date
                </label>
                <input 
                  type="date" 
                  className="input-field" 
                  value={advancesStartDate} 
                  onChange={(e) => setAdvancesStartDate(e.target.value)} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                  To Date
                </label>
                <input 
                  type="date" 
                  className="input-field" 
                  value={advancesEndDate} 
                  onChange={(e) => setAdvancesEndDate(e.target.value)} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                  Status Filter
                </label>
                <SearchableSelect 
                  className="input-field" 
                  value={advancesStatusFilter} 
                  onChange={(e) => setAdvancesStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Pending Approval">Pending Approval</option>
                  <option value="Approved & Disbursed">Approved & Disbursed</option>
                  <option value="Fully Recovered">Fully Recovered</option>
                </SearchableSelect>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                  Department Filter
                </label>
                <SearchableSelect 
                  className="input-field" 
                  value={advancesDepartmentFilter} 
                  onChange={(e) => setAdvancesDepartmentFilter(e.target.value)}
                >
                  <option value="ALL">All Departments</option>
                  {departmentListOptions.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </SearchableSelect>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                  Search Employee / Reason
                </label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Search name, code, reason..." 
                  value={advancesSearch} 
                  onChange={(e) => setAdvancesSearch(e.target.value)} 
                />
              </div>

              {(advancesStartDate || advancesEndDate || advancesStatusFilter !== 'ALL' || advancesDepartmentFilter !== 'ALL' || advancesSearch) && (
                <div>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ width: '100%', fontSize: '0.78rem', padding: '8px' }}
                    onClick={() => {
                      setAdvancesStartDate('');
                      setAdvancesEndDate('');
                      setAdvancesStatusFilter('ALL');
                      setAdvancesDepartmentFilter('ALL');
                      setAdvancesSearch('');
                    }}
                  >
                    Reset Filters
                  </button>
                </div>
              )}
            </div>

            {/* KPI Summary Strip */}
            <div style={{ display: 'flex', gap: '16px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Total Records: <strong style={{ color: '#0f172a' }}>{advancesMetrics.count}</strong>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Total Disbursed: <strong style={{ color: '#0284c7' }}>₹ {(advancesMetrics?.totalDisbursed || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Total Recovered: <strong style={{ color: '#059669' }}>₹ {(advancesMetrics?.totalRecovered || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Outstanding Balance: <strong style={{ color: '#d97706' }}>₹ {(advancesMetrics?.totalBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
            <table className="data-table" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr>
                  <th>Request Date</th>
                  <th>Employee Name & Dept</th>
                  <th>Advance Amount</th>
                  <th>Repayment Terms</th>
                  <th>Monthly EMI</th>
                  <th>Recovered / Balance</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSalaryAdvances.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      No salary advances found matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredSalaryAdvances.map(adv => (
                    <tr key={adv.id}>
                      <td style={{ fontWeight: '700' }}>{adv.requestDate}</td>
                      <td>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>{adv.employeeName}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{adv.department} • Reason: {adv.reason}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '900', color: '#0f172a', fontSize: '0.92rem' }}>
                          ₹ {(adv.advanceAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0284c7', background: '#e0f2fe', padding: '2px 6px', borderRadius: '3px' }}>
                          {adv.repaymentTenureMonths} Months
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '800', color: '#dc2626' }}>
                          ₹ {(adv.monthlyEmiAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mo
                        </div>
                      </td>
                      <td>
                        {(() => {
                          const remBal = Number(adv.remainingBalance ?? (adv.advanceAmount - (adv.totalRecoveredAmount || 0)));
                          return (
                            <div style={{ fontSize: '0.8rem', fontWeight: '700' }}>
                              <span style={{ color: '#059669' }}>₹{(adv.totalRecoveredAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> / <span style={{ color: remBal > 0 ? '#d97706' : '#64748b' }}>₹{remBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bal</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td>
                        <span style={{ 
                          background: adv.status === 'Approved & Disbursed' ? '#dcfce7' : adv.status === 'Fully Recovered' ? '#f1f5f9' : '#fef9c3',
                          color: adv.status === 'Approved & Disbursed' ? '#166534' : adv.status === 'Fully Recovered' ? '#475569' : '#854d0e',
                          padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '800'
                        }}>
                          {adv.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                          {isAdmin && (
                            <button 
                              type="button" 
                              className="btn-secondary" 
                              style={{ padding: '3px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              onClick={() => handleEditAdvance(adv)}
                              title="Edit Salary Advance / Loan (Admin Only)"
                            >
                              <Edit3 size={13} /> Edit
                            </button>
                          )}
                          {adv.status === 'Pending Approval' ? (
                            <button 
                              type="button" 
                              className="btn-primary" 
                              style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#059669', borderColor: '#059669', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              onClick={() => handleApproveAdvance(adv)}
                            >
                              <Check size={13} /> Approve & Disburse
                            </button>
                          ) : (
                            <>
                              {Number(adv.remainingBalance ?? (adv.advanceAmount - (adv.totalRecoveredAmount || 0))) > 0 && (
                                <button
                                  type="button"
                                  className="btn-primary"
                                  style={{ padding: '3px 8px', fontSize: '0.73rem', background: '#16a34a', borderColor: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '700' }}
                                  onClick={() => handleOpenAdvanceRecoveryModal(adv)}
                                  title="Confirm recovery of advance in salary or direct payment"
                                >
                                  <Coins size={13} /> Confirm Recovery
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '3px 8px', fontSize: '0.73rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => {
                                  setHistoryTargetAdvance(adv);
                                  setShowAdvanceHistoryModal(true);
                                }}
                                title="View advance deduction and recovery audit history"
                              >
                                <RotateCcw size={13} /> History {adv.deductionHistory?.length ? `(${adv.deductionHistory.length})` : ''}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 5: MONTHLY SALARY SHEET & PAYSLIPS                                */}
      {/* ========================================================================= */}
      {activeSubTab === 'payroll' && (
        <div>
          {/* Top Month Controls & Summary Bar */}
          <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', display: 'block', marginBottom: '3px' }}>
                  SALARY PROCESSING MONTH
                </label>
                <input 
                  type="month" 
                  className="form-control" 
                  style={{ fontWeight: '800', color: 'var(--primary-brand)' }}
                  value={payrollMonth}
                  onChange={e => setPayrollMonth(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', display: 'block', marginBottom: '3px' }}>
                  TOTAL WORKING DAYS
                </label>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{ width: '90px', fontWeight: '800' }}
                  value={workingDaysCount}
                  onChange={e => setWorkingDaysCount(Number(e.target.value) || 26)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={handleExportPayrollCSV}
              >
                <Download size={16} /> Export Salary Sheet (CSV)
              </button>
            </div>
          </div>

          {/* Payroll KPI Summary Cards */}
          <div className="stat-cards-grid">
            <div className="stat-card">
              <div className="stat-card-title">Net Salary Payout</div>
              <div className="stat-card-val" style={{ color: '#0284c7' }}>
                ₹ {(payrollTotals?.totalNet || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="stat-card-sub">For {monthlyPayrollSummary.length} employees</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-title">Disbursed / Paid</div>
              <div className="stat-card-val" style={{ color: '#16a34a' }}>
                ₹ {salaryPayments.filter(p => p.monthKey === payrollMonth).reduce((acc, p) => acc + (p.netAmountPaid || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="stat-card-sub">
                {salaryPayments.filter(p => p.monthKey === payrollMonth).length} / {monthlyPayrollSummary.length} Paid
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-title">Approved OT Payout</div>
              <div className="stat-card-val" style={{ color: '#059669' }}>
                ₹ {(payrollTotals?.totalOtPay || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="stat-card-sub">{payrollTotals?.totalOtHours || 0} Approved OT hrs</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-title">Total PF & ESIC</div>
              <div className="stat-card-val" style={{ color: '#7c3aed' }}>
                ₹ {((payrollTotals?.totalPf || 0) + (payrollTotals?.totalEsic || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="stat-card-sub">PF: ₹{(payrollTotals?.totalPf || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | ESIC: ₹{(payrollTotals?.totalEsic || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-title">Advance Recovered</div>
              <div className="stat-card-val" style={{ color: '#dc2626' }}>
                ₹ {(payrollTotals?.totalAdvanceRecovered || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="stat-card-sub">Monthly EMI deductions</div>
            </div>
          </div>

          {/* Master Salary Sheet Table */}
          <div className="glass-panel" style={{ padding: '0', overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', minWidth: '1180px', margin: 0 }}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Shift</th>
                  <th>Attendance</th>
                  <th>Earned Basic</th>
                  <th>HRA & Other</th>
                  <th>Dinner Allw.</th>
                  <th>Approved OT</th>
                  <th>Total Gross</th>
                  <th>PF / ESIC</th>
                  <th>Advance EMI</th>
                  <th>Net Payable</th>
                  <th>Payment Status & Disbursal</th>
                  <th style={{ textAlign: 'center' }}>Payslip</th>
                </tr>
              </thead>
              <tbody>
                {monthlyPayrollSummary.map(row => {
                  const emp = employees.find(e => e.id === row.employeeId);
                  const matchingPayment = salaryPayments.find(p => p.monthKey === payrollMonth && p.employeeId === row.employeeId);

                  return (
                    <tr key={row.employeeId}>
                      <td>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>{row.fullName}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{row.department} • {row.empCode}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.72rem', fontWeight: '800', background: '#f1f5f9', padding: '2px 6px', borderRadius: '3px' }}>
                          {row.shiftDurationHours}h Shift
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.78rem', fontWeight: '700' }}>
                          <span style={{ color: '#059669' }}>{row.presentCount}P</span>
                          {row.halfDayCount > 0 && <span style={{ color: '#d97706' }}> +{row.halfDayCount}HD</span>}
                          {row.paidLeaveCount > 0 && <span style={{ color: '#0284c7' }}> +{row.paidLeaveCount}PL</span>}
                          {row.absentCount > 0 && <span style={{ color: '#dc2626' }}> -{row.absentCount}A</span>}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                          Paid: {row.effectivePaidDays}/{row.totalWorkingDays} days
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '700' }}>₹ {(row.earnedBasic || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                          HRA: ₹{(row.earnedHra || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br/>
                          Other: ₹{(row.earnedOther || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '700', color: row.dinnerAllowance > 0 ? '#7c3aed' : '#94a3b8' }}>
                          ₹ {(row.dinnerAllowance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{row.nightShiftCount} Nights</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '800', color: row.earnedOtPay > 0 ? '#059669' : '#94a3b8' }}>
                          ₹ {(row.earnedOtPay || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{row.approvedOtHours} hrs approved</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>
                          ₹ {(row.totalGrossEarned || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.76rem', color: '#334155' }}>
                          PF: ₹{(row.pfDeduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br/>
                          ESIC: ₹{(row.esicDeduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td>
                        {matchingPayment ? (
                          <div>
                            <div style={{ fontWeight: '800', color: (matchingPayment.advanceDeductionAmount || 0) > 0 ? '#16a34a' : '#64748b' }}>
                              ₹ {Number(matchingPayment.advanceDeductionAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {(matchingPayment.advanceDeductionAmount || 0) > 0 ? (
                              <span style={{ background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '3px', fontSize: '0.68rem', fontWeight: '800', display: 'inline-block', marginTop: '2px' }}>
                                ✓ Recovered in Salary
                              </span>
                            ) : row.totalAdvanceDeduction > 0 ? (
                              <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '3px', fontSize: '0.68rem', fontWeight: '700', display: 'inline-block', marginTop: '2px' }}>
                                Skipped
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.68rem' }}>None</span>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontWeight: '800', color: row.totalAdvanceDeduction > 0 ? '#dc2626' : '#94a3b8' }}>
                              ₹ {(row.totalAdvanceDeduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {row.totalAdvanceDeduction > 0 && (
                              <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 6px', borderRadius: '3px', fontSize: '0.68rem', fontWeight: '700', display: 'inline-block', marginTop: '2px' }}>
                                Scheduled EMI
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#0284c7' }}>
                          ₹ {(matchingPayment ? (matchingPayment.netAmountPaid !== undefined ? matchingPayment.netAmountPaid : row.netPayable) : (row.netPayable || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td>
                        {matchingPayment ? (
                          <div>
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '4px', fontSize: '0.74rem', fontWeight: '900', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle2 size={13} style={{ color: '#16a34a' }} /> PAID
                            </span>
                            <div style={{ fontSize: '0.7rem', color: '#0f172a', fontWeight: '700', marginTop: '3px' }}>
                              📅 {matchingPayment.paymentDate} <span style={{ color: '#64748b', fontWeight: 'normal' }}>at {matchingPayment.paymentTime}</span>
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                              {matchingPayment.paymentMode} {matchingPayment.transactionReference ? `• Ref: ${matchingPayment.transactionReference}` : ''}
                            </div>
                          </div>
                        ) : (
                          <button 
                            type="button" 
                            className="btn-primary" 
                            style={{ padding: '4px 10px', fontSize: '0.74rem', fontWeight: '800', background: '#0284c7', borderColor: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => handleOpenPaymentModal(row, emp)}
                          >
                            <CreditCard size={13} /> Record Payment
                          </button>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '700' }}
                          onClick={() => {
                            const slipSalaryData = matchingPayment ? {
                              ...row,
                              totalAdvanceDeduction: matchingPayment.advanceDeductionAmount !== undefined ? matchingPayment.advanceDeductionAmount : row.totalAdvanceDeduction,
                              totalDeductions: (row.pfDeduction || 0) + (row.esicDeduction || 0) + (row.ptDeduction || 0) + (matchingPayment.advanceDeductionAmount !== undefined ? matchingPayment.advanceDeductionAmount : row.totalAdvanceDeduction),
                              netPayable: matchingPayment.netAmountPaid !== undefined ? matchingPayment.netAmountPaid : row.netPayable
                            } : row;
                            setActivePayslipData({ employee: emp, salaryData: slipSalaryData, payment: matchingPayment });
                          }}
                        >
                          <Printer size={13} /> View Slip
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ONBOARD / EDIT EMPLOYEE                                          */}
      {/* ========================================================================= */}
      {showOnboardModal && (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.75)', zIndex: 1050 }}>
          <div className="modal-content glass-panel" style={{ width: '840px', maxHeight: '90vh', overflowY: 'auto', padding: '26px', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontWeight: '900', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} /> {editingEmployee ? `Edit Employee: ${editingEmployee.fullName}` : 'Onboard New Employee'}
              </h3>
              <button type="button" className="btn-secondary" onClick={() => setShowOnboardModal(false)}>
                <X size={16} /> Cancel
              </button>
            </div>

            <form onSubmit={handleSaveEmployee}>
              
              {/* SECTION A: Personal & Deployment Info */}
              <h5 style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                👤 Personal & Department Deployment
              </h5>
              
              <div className="form-grid-3" style={{ marginBottom: '16px' }}>
                <div>
                  <label className="form-label">Employee Code / ID *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formEmpCode} 
                    onChange={e => setFormEmpCode(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <label className="form-label">Full Name *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formFullName} 
                    onChange={e => setFormFullName(e.target.value)} 
                    placeholder="e.g. Rameshwar Prasad Sharma" 
                    required 
                  />
                </div>
                <div>
                  <label className="form-label">Gender</label>
                  <SearchableSelect className="form-control" value={formGender} onChange={e => setFormGender(e.target.value)}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </SearchableSelect>
                </div>
                <div>
                  <label className="form-label">Department *</label>
                  <SearchableSelect className="form-control" value={formDepartment} onChange={e => setFormDepartment(e.target.value)}>
                    {EMPLOYEE_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </SearchableSelect>
                </div>
                <div>
                  <label className="form-label">Designation *</label>
                  <SearchableSelect className="form-control" value={formDesignation} onChange={e => setFormDesignation(e.target.value)}>
                    {EMPLOYEE_DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </SearchableSelect>
                </div>
                <div>
                  <label className="form-label">Joining Date</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={formJoiningDate} 
                    onChange={e => setFormJoiningDate(e.target.value)} 
                  />
                </div>
              </div>

              {/* SECTION B: Standard Shift Selection (8h, 10h, 12h) */}
              <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
                <h5 style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0284c7', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={16} /> Configured Standard Shift Duration (Selectable & Editable)
                </h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {SHIFT_OPTIONS.map(opt => (
                    <div 
                      key={opt.id}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: `2px solid ${formShiftHours === opt.hours ? '#0284c7' : '#cbd5e1'}`,
                        background: formShiftHours === opt.hours ? '#f0f9ff' : '#ffffff',
                        cursor: 'pointer'
                      }}
                      onClick={() => setFormShiftHours(opt.hours)}
                    >
                      <div style={{ fontWeight: '800', fontSize: '0.85rem', color: '#0f172a' }}>{opt.label}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>{opt.desc}</div>
                    </div>
                  ))}
                </div>

                <div className="form-grid-2" style={{ marginTop: '12px' }}>
                  <div>
                    <label className="form-label">Shift Hours Per Day</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={formShiftHours} 
                      onChange={e => setFormShiftHours(Number(e.target.value) || 12)} 
                      min="4" 
                      max="16" 
                      required 
                    />
                  </div>
                  <div>
                    <label className="form-label">Default Assigned Shift</label>
                    <SearchableSelect className="form-control" value={formDefaultShift} onChange={e => setFormDefaultShift(e.target.value)}>
                      <option value="Shift A: Day (08:00 - 20:00)">Shift A: Day Shift (08:00 - 20:00, 12h)</option>
                      <option value="Shift B: Night (20:00 - 08:00)">Shift B: Night Shift (20:00 - 08:00, 12h)</option>
                      <option value="Shift A: Day (08:00 - 18:00)">Shift A: Day Shift (08:00 - 18:00, 10h)</option>
                      <option value="Shift B: Night (20:00 - 06:00)">Shift B: Night Shift (20:00 - 06:00, 10h)</option>
                      <option value="General Shift (09:00 - 17:00)">General Shift (09:00 - 17:00, 8h)</option>
                    </SearchableSelect>
                  </div>
                </div>
              </div>

              {/* SECTION C: Contact, Identity & KYC */}
              <h5 style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                🪪 Contact Info & KYC
              </h5>
              <div className="form-grid-3" style={{ marginBottom: '16px' }}>
                <div>
                  <label className="form-label">Mobile Phone</label>
                  <input type="text" className="form-control" value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="+91 98260 00000" />
                </div>
                <div>
                  <label className="form-label">Email Address</label>
                  <input type="email" className="form-control" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="name@samyakpackaging.com" />
                </div>
                <div>
                  <label className="form-label">Emergency Contact</label>
                  <input type="text" className="form-control" value={formEmergencyContact} onChange={e => setFormEmergencyContact(e.target.value)} placeholder="Name & Phone" />
                </div>
                <div>
                  <label className="form-label">Aadhar Card No</label>
                  <input type="text" className="form-control" value={formAadhar} onChange={e => setFormAadhar(e.target.value)} placeholder="12-digit UID" />
                </div>
                <div>
                  <label className="form-label">PAN Number</label>
                  <input type="text" className="form-control" value={formPan} onChange={e => setFormPan(e.target.value)} placeholder="ABCDE1234F" />
                </div>
                <div>
                  <label className="form-label">UAN / PF Number</label>
                  <input type="text" className="form-control" value={formUan} onChange={e => setFormUan(e.target.value)} placeholder="101xxxxxxxx" />
                </div>
                <div className="form-group-full">
                  <label className="form-label">Residential Address</label>
                  <input type="text" className="form-control" value={formAddress} onChange={e => setFormAddress(e.target.value)} placeholder="Address with Pincode" />
                </div>
              </div>

              {/* SECTION D: Salary Structure & Statutory Deductions */}
              <h5 style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                💰 Salary Structure, Allowances & Statutory Deductions
              </h5>
              <div className="form-grid-3" style={{ marginBottom: '16px' }}>
                <div>
                  <label className="form-label">Basic Salary (₹/mo) *</label>
                  <input type="number" className="form-control" value={formBasicSalary} onChange={e => setFormBasicSalary(e.target.value)} required />
                </div>
                <div>
                  <label className="form-label">House Rent Allowance (HRA) (₹/mo)</label>
                  <input type="number" className="form-control" value={formHra} onChange={e => setFormHra(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Other Allowance (₹/mo)</label>
                  <input type="number" className="form-control" value={formOtherAllowance} onChange={e => setFormOtherAllowance(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Dinner Allowance (₹/Night Shift)</label>
                  <input type="number" className="form-control" value={formDinnerPerNight} onChange={e => setFormDinnerPerNight(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Fixed Monthly Dinner (₹/mo)</label>
                  <input type="number" className="form-control" value={formFixedDinner} onChange={e => setFormFixedDinner(e.target.value)} placeholder="0 if per night" />
                </div>
                <div>
                  <label className="form-label">Professional Tax (PT) (₹/mo)</label>
                  <input type="number" className="form-control" value={formPt} onChange={e => setFormPt(e.target.value)} />
                </div>
              </div>

              {/* Statutory & Optional Allowances Opt-Ins Toggle Box */}
              <div style={{ background: '#f8fafc', padding: '12px 18px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '18px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '800', fontSize: '0.84rem' }}>
                  <input 
                    type="checkbox" 
                    checked={formOptPf} 
                    onChange={e => setFormOptPf(e.target.checked)} 
                  />
                  <span>Deduct PF (12% on Basic)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '800', fontSize: '0.84rem' }}>
                  <input 
                    type="checkbox" 
                    checked={formOptEsic} 
                    onChange={e => setFormOptEsic(e.target.checked)} 
                  />
                  <span>Deduct ESIC (0.75% on Gross)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '800', fontSize: '0.84rem' }}>
                  <input 
                    type="checkbox" 
                    checked={formOptDinner} 
                    onChange={e => setFormOptDinner(e.target.checked)} 
                  />
                  <span>Optional Dinner Allowance</span>
                </label>
              </div>

              {formOptDinner && (
                <div className="form-grid-3" style={{ marginBottom: '16px', background: '#faf5ff', padding: '12px 16px', borderRadius: '6px', border: '1px solid #e9d5ff' }}>
                  <div>
                    <label className="form-label" style={{ color: '#6b21a8' }}>Dinner Allowance (₹/Night Shift)</label>
                    <input type="number" className="form-control" value={formDinnerPerNight} onChange={e => setFormDinnerPerNight(e.target.value)} placeholder="e.g. 150" />
                  </div>
                  <div>
                    <label className="form-label" style={{ color: '#6b21a8' }}>Fixed Monthly Dinner (₹/mo)</label>
                    <input type="number" className="form-control" value={formFixedDinner} onChange={e => setFormFixedDinner(e.target.value)} placeholder="0 if per night" />
                  </div>
                </div>
              )}

              {/* SECTION E: Bank Account Details */}
              <h5 style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                🏦 Bank Account & Disbursal Details
              </h5>
              <div className="form-grid-3" style={{ marginBottom: '20px' }}>
                <div>
                  <label className="form-label">Bank Name</label>
                  <input type="text" className="form-control" value={formBankName} onChange={e => setFormBankName(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Account Number</label>
                  <input type="text" className="form-control" value={formAccountNumber} onChange={e => setFormAccountNumber(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">IFSC Code</label>
                  <input type="text" className="form-control" value={formIfscCode} onChange={e => setFormIfscCode(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Account Holder Name</label>
                  <input type="text" className="form-control" value={formAccountHolder} onChange={e => setFormAccountHolder(e.target.value)} placeholder="As per bank record" />
                </div>
                <div>
                  <label className="form-label">Bank Branch</label>
                  <input type="text" className="form-control" value={formBranch} onChange={e => setFormBranch(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Payment Mode</label>
                  <SearchableSelect className="form-control" value={formPaymentMode} onChange={e => setFormPaymentMode(e.target.value)}>
                    <option value="Bank Transfer (NEFT)">Bank Transfer (NEFT/RTGS)</option>
                    <option value="UPI / IMPS">UPI / IMPS</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                  </SearchableSelect>
                </div>
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowOnboardModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '8px 24px' }}>
                  {editingEmployee ? 'Update Employee Profile' : 'Complete Onboarding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: OFFBOARDING / RELIEVING WORKFLOW                                 */}
      {/* ========================================================================= */}
      {offboardingEmployee && (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.75)', zIndex: 1050 }}>
          <div className="modal-content glass-panel" style={{ width: '560px', padding: '24px', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontWeight: '900', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserMinus size={20} /> Offboard Employee: {offboardingEmployee.fullName}
              </h3>
              <button type="button" className="btn-secondary" onClick={() => setOffboardingEmployee(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="form-grid-2" style={{ marginBottom: '14px' }}>
              <div>
                <label className="form-label">Resignation Date</label>
                <input type="date" className="form-control" value={offResignDate} onChange={e => setOffResignDate(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Expected Relieving Date</label>
                <input type="date" className="form-control" value={offRelieveDate} onChange={e => setOffRelieveDate(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Notice Period (Days)</label>
                <input type="number" className="form-control" value={offNoticeDays} onChange={e => setOffNoticeDays(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Settlement Status</label>
                <SearchableSelect className="form-control" value={offSettlementStatus} onChange={e => setOffSettlementStatus(e.target.value)}>
                  <option value="In Process">In Process</option>
                  <option value="Settled">Full & Final Settled</option>
                  <option value="Terminated">Terminated</option>
                </SearchableSelect>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800', fontSize: '0.84rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={offHandover} onChange={e => setOffHandover(e.target.checked)} />
                <span>Asset & ID Badge Handover Completed</span>
              </label>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label className="form-label">Handover / Exit Interview Notes</label>
              <textarea 
                className="form-control" 
                rows={3} 
                value={offNotes} 
                onChange={e => setOffNotes(e.target.value)} 
                placeholder="Exit interview comments, reasons, or clearance remarks..."
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setOffboardingEmployee(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" style={{ background: '#b91c1c', borderColor: '#b91c1c' }} onClick={handleSaveOffboarding}>
                Confirm Offboarding
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: MARK / EDIT ATTENDANCE                                           */}
      {/* ========================================================================= */}
      {markingAttendanceEmp && (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.75)', zIndex: 1050 }}>
          <div className="modal-content glass-panel" style={{ width: '540px', padding: '24px', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontWeight: '900', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} /> Mark Attendance: {markingAttendanceEmp.fullName}
              </h3>
              <button type="button" className="btn-secondary" onClick={() => setMarkingAttendanceEmp(null)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '14px' }}>
              Date: <b>{attendanceDate}</b> | Configured Standard Shift: <b style={{ color: '#0284c7' }}>{markingAttendanceEmp.shiftDurationHours || 12} Hours</b>
            </div>

            <div className="form-grid-2" style={{ marginBottom: '14px' }}>
              <div>
                <label className="form-label">Attendance Status *</label>
                <SearchableSelect className="form-control" value={attStatus} onChange={e => setAttStatus(e.target.value)}>
                  <option value="Present">Present (Full Shift)</option>
                  <option value="Half Day">Half Day (50% Pay)</option>
                  <option value="Paid Leave">Paid Leave (PL)</option>
                  <option value="Absent">Absent (LOP - Loss of Pay)</option>
                  <option value="Comp Off">Comp Off</option>
                  <option value="Weekly Off">Weekly Off</option>
                </SearchableSelect>
              </div>

              <div>
                <label className="form-label">Shift Type Assigned</label>
                <SearchableSelect className="form-control" value={attShiftType} onChange={e => setAttShiftType(e.target.value)}>
                  <option value="Shift A: Day (08:00 - 20:00)">Shift A: Day (08:00 - 20:00, 12h)</option>
                  <option value="Shift B: Night (20:00 - 08:00)">Shift B: Night (20:00 - 08:00, 12h)</option>
                  <option value="Shift A: Day (08:00 - 18:00)">Shift A: Day (08:00 - 18:00, 10h)</option>
                  <option value="Shift B: Night (20:00 - 06:00)">Shift B: Night (20:00 - 06:00, 10h)</option>
                  <option value="General Shift (09:00 - 17:00)">General Shift (09:00 - 17:00, 8h)</option>
                </SearchableSelect>
              </div>

              <div>
                <label className="form-label">Check-In Time</label>
                <input type="time" className="form-control" value={attCheckIn} onChange={e => setAttCheckIn(e.target.value)} />
              </div>

              <div>
                <label className="form-label">Check-Out Time</label>
                <input type="time" className="form-control" value={attCheckOut} onChange={e => setAttCheckOut(e.target.value)} />
              </div>
            </div>

            {/* Personal Time Off (PTO) Hours Logging Section */}
            <div style={{ background: '#fff7ed', padding: '12px 16px', borderRadius: '6px', border: '1px solid #ffedd5', marginBottom: '16px' }}>
              <div style={{ fontWeight: '800', fontSize: '0.85rem', color: '#c2410c', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={16} /> 🏖️ Personal Time Off (PTO) Hours in this Shift
              </div>
              <div style={{ fontSize: '0.76rem', color: '#9a3412', marginBottom: '8px' }}>
                Hours taken off for personal work during shift. Deducted from total shift working hours.
              </div>
              <div className="form-grid-2">
                <div>
                  <label className="form-label" style={{ color: '#9a3412' }}>PTO Hours (Deducted)</label>
                  <input 
                    type="number" 
                    step="0.5"
                    min="0"
                    max={markingAttendanceEmp.shiftDurationHours || 12}
                    className="form-control" 
                    value={attPtoHours} 
                    onChange={e => setAttPtoHours(e.target.value)} 
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="form-label">Net Shift Working Hours</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={`${Math.max(0, (attStatus === 'Present' ? ((markingAttendanceEmp.shiftDurationHours || 12) - (parseFloat(attPtoHours) || 0) + (parseFloat(attOtHours) || 0)) : attStatus === 'Half Day' ? (((markingAttendanceEmp.shiftDurationHours || 12) / 2) - (parseFloat(attPtoHours) || 0) + (parseFloat(attOtHours) || 0)) : 0)).toFixed(1)} Hours`} 
                    disabled 
                    style={{ background: '#ffffff', fontWeight: '900', color: '#0f172a', borderColor: '#fdba74' }}
                  />
                </div>
              </div>
            </div>

            {/* Overtime Logging Section */}
            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '18px' }}>
              <div style={{ fontWeight: '800', fontSize: '0.85rem', color: '#0f172a', marginBottom: '8px' }}>
                ⏱️ Overtime Hours & Time Window (Beyond {markingAttendanceEmp.shiftDurationHours || 12}h Standard Shift)
              </div>
              <div className="form-grid-2" style={{ marginBottom: '10px' }}>
                <div>
                  <label className="form-label">OT Hours Logged</label>
                  <input 
                    type="number" 
                    step="0.25" 
                    className="form-control" 
                    value={attOtHours} 
                    onChange={e => {
                      const val = e.target.value;
                      setAttOtHours(val);
                      if (Number(val) > 0 && (!attOtStartTime || !attOtEndTime)) {
                        const win = calculateOvertimeTimeWindow({
                          checkIn: attCheckIn,
                          checkOut: attCheckOut,
                          shiftHours: markingAttendanceEmp.shiftDurationHours || 12,
                          overtimeHours: parseFloat(val) || 0
                        });
                        setAttOtStartTime(win.otStartTime);
                        setAttOtEndTime(win.otEndTime);
                      }
                    }} 
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="form-label">OT Approval State</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={Number(attOtHours) > 0 ? "Pending Plant Head Approval" : "N/A"} 
                    disabled 
                    style={{ background: '#f1f5f9' }}
                  />
                </div>
              </div>

              {Number(attOtHours) > 0 && (
                <div className="form-grid-2" style={{ marginBottom: '10px' }}>
                  <div>
                    <label className="form-label">Overtime Start Time</label>
                    <input 
                      type="time" 
                      className="form-control" 
                      value={attOtStartTime} 
                      onChange={e => setAttOtStartTime(e.target.value)} 
                    />
                  </div>
                  <div>
                    <label className="form-label">Overtime End Time</label>
                    <input 
                      type="time" 
                      className="form-control" 
                      value={attOtEndTime} 
                      onChange={e => setAttOtEndTime(e.target.value)} 
                    />
                  </div>
                </div>
              )}
              <div style={{ marginTop: '8px' }}>
                <label className="form-label">Work / Machine Justification Note</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={attOtReason} 
                  onChange={e => setAttOtReason(e.target.value)} 
                  placeholder="e.g. Extended run on Rotomec 8-Color for urgent order dispatch"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setMarkingAttendanceEmp(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveAttendance}>
                Save Attendance Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: SALARY ADVANCE REQUEST                                           */}
      {/* ========================================================================= */}
      {showAdvanceModal && (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.75)', zIndex: 1050 }}>
          <div className="modal-content glass-panel" style={{ width: '520px', padding: '24px', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontWeight: '900', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Coins size={20} /> {editingAdvance ? `Edit Salary Advance / Loan (${editingAdvance.id})` : 'Request Salary Advance'}
              </h3>
              <button type="button" className="btn-secondary" onClick={() => { setShowAdvanceModal(false); setEditingAdvance(null); }}>
                <X size={16} />
              </button>
            </div>

            {/* Advance Request Form */}
            {(() => {
              const selectedEmpActiveAdvance = advEmpId ? salaryAdvances.find(adv => 
                adv.employeeId === advEmpId && 
                adv.id !== editingAdvance?.id &&
                (adv.status === 'Approved & Disbursed' || adv.status === 'Pending Approval') &&
                Number(adv.remainingBalance ?? (adv.advanceAmount - (adv.totalRecoveredAmount || 0))) > 0
              ) : null;

              return (
                <form onSubmit={handleSaveSalaryAdvance}>
                  <div style={{ marginBottom: '12px' }}>
                    <label className="form-label">Select Employee *</label>
                    <SearchableSelect 
                      className="form-control" 
                      value={advEmpId} 
                      onChange={e => setAdvEmpId(e.target.value)} 
                      disabled={Boolean(editingAdvance || selectedEmpActiveAdvance)}
                      required
                      placeholder="-- Choose Employee --"
                    >
                      <option value="">-- Choose Employee --</option>
                      {employees.filter(e => e.status === 'Active' || e.status === 'On Probation').map(e => {
                        const hasActive = salaryAdvances.find(adv => 
                          adv.employeeId === e.id && 
                          adv.id !== editingAdvance?.id &&
                          (adv.status === 'Approved & Disbursed' || adv.status === 'Pending Approval') &&
                          Number(adv.remainingBalance ?? (adv.advanceAmount - (adv.totalRecoveredAmount || 0))) > 0
                        );
                        return (
                          <option key={e.id} value={e.id}>
                            {e.fullName} ({e.empCode || e.id}) - {e.department} {hasActive ? `[⚠️ Advance Due: ₹${(Number(hasActive.remainingBalance || hasActive.advanceAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}]` : ''}
                          </option>
                        );
                      })}
                    </SearchableSelect>
                  </div>

                  {selectedEmpActiveAdvance && (
                    <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', padding: '14px 16px', borderRadius: '8px', marginBottom: '16px', color: '#991b1b', fontSize: '0.84rem' }}>
                      <div style={{ fontWeight: '900', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', color: '#b91c1c' }}>
                        <AlertTriangle size={18} style={{ color: '#dc2626' }} /> Advance Request Blocked — Outstanding Advance Pending
                      </div>
                      <div>
                        This employee already has an active advance (<b>{selectedEmpActiveAdvance.id}</b>) with an outstanding balance of <b style={{ color: '#b91c1c' }}>₹{(Number(selectedEmpActiveAdvance.remainingBalance || selectedEmpActiveAdvance.advanceAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> ({selectedEmpActiveAdvance.status}). As per factory policy, a new advance cannot be requested before completion of old dues.
                      </div>
                    </div>
                  )}

                  <div className="form-grid-2" style={{ marginBottom: '12px' }}>
                    <div>
                      <label className="form-label">Advance Amount (₹) *</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={advAmount} 
                        onChange={e => setAdvAmount(e.target.value)} 
                        placeholder="e.g. 10000" 
                        disabled={Boolean(selectedEmpActiveAdvance)}
                        required 
                      />
                    </div>

                    <div>
                      <label className="form-label">Repayment Tenure (Months)</label>
                      <SearchableSelect 
                        className="form-control" 
                        value={advTenureMonths} 
                        onChange={e => setAdvTenureMonths(Number(e.target.value) || 1)}
                        disabled={Boolean(selectedEmpActiveAdvance)}
                      >
                        <option value={1}>1 Month (Full in next salary)</option>
                        <option value={2}>2 Months (50% EMI)</option>
                        <option value={3}>3 Months (33.3% EMI)</option>
                        <option value={4}>4 Months (25% EMI)</option>
                        <option value={6}>6 Months (16.6% EMI)</option>
                      </SearchableSelect>
                    </div>
                  </div>

                  {Number(advAmount) > 0 && !selectedEmpActiveAdvance && (
                    <div style={{ background: '#f0fdf4', padding: '10px 14px', borderRadius: '6px', border: '1px solid #bbf7d0', marginBottom: '14px', fontSize: '0.84rem', color: '#166534' }}>
                      💰 Monthly Salary EMI Deduction: <b>₹{Math.round(Number(advAmount) / (Number(advTenureMonths) || 1)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / month</b>
                    </div>
                  )}

                  <div style={{ marginBottom: '18px' }}>
                    <label className="form-label">Reason for Advance Request</label>
                    <textarea 
                      className="form-control" 
                      rows={2} 
                      value={advReason} 
                      onChange={e => setAdvReason(e.target.value)} 
                      placeholder="e.g. Family medical emergency, festival, children school fee..."
                      disabled={Boolean(selectedEmpActiveAdvance)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={() => { setShowAdvanceModal(false); setEditingAdvance(null); }}>
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="btn-primary"
                      disabled={Boolean(selectedEmpActiveAdvance)}
                      style={{
                        opacity: selectedEmpActiveAdvance ? 0.5 : 1,
                        cursor: selectedEmpActiveAdvance ? 'not-allowed' : 'pointer'
                      }}
                      title={selectedEmpActiveAdvance ? 'Request blocked due to outstanding advance' : (editingAdvance ? 'Update Salary Advance Details' : 'Submit Advance Request')}
                    >
                      {editingAdvance ? 'Update Salary Advance' : 'Submit Advance Request'}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: RECORD SALARY PAYMENT DISBURSAL                                  */}
      {/* ========================================================================= */}
      {showPaymentModal && paymentRowData && (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.75)', zIndex: 1050 }}>
          <div className="modal-content glass-panel" style={{ width: '560px', padding: '24px', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontWeight: '900', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard size={20} /> Record Salary Payment
              </h3>
              <button type="button" className="btn-secondary" onClick={() => setShowPaymentModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSalaryPaymentSubmit}>
              {/* Employee Summary Card with Dynamic Live Net Payable */}
              {(() => {
                const baseDed = (Number(paymentRowData.pfDeduction) || 0) + (Number(paymentRowData.esicDeduction) || 0) + (Number(paymentRowData.ptDeduction) || 0);
                const gross = Number(paymentRowData.totalGrossEarned) || 0;
                const advDed = (paymentConfirmAdvanceRecovery && paymentActiveAdvance) ? (parseFloat(paymentAdvanceRecoveryAmount) || 0) : 0;
                const liveNetPay = Math.max(0, gross - baseDed - advDed);

                return (
                  <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '900', fontSize: '1rem', color: '#0f172a' }}>{paymentRowData.fullName}</div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        {paymentRowData.department} • {paymentRowData.empCode}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '3px' }}>
                        Bank: <b>{paymentEmpData?.bankDetails?.bankName || '—'}</b> | A/C: <b>{paymentEmpData?.bankDetails?.accountNumber || '—'}</b>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '800' }}>Net Disbursal Amount</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0284c7' }}>
                        ₹ {liveNetPay.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        Gross: ₹{gross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {advDed > 0 ? `| Adv Rec: -₹${advDed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ADVANCE RECOVERY CONFIRMATION OPTION CARD */}
              {paymentActiveAdvance ? (
                <div style={{ 
                  background: paymentConfirmAdvanceRecovery ? '#f0fdf4' : '#fffbeb', 
                  border: `1.5px solid ${paymentConfirmAdvanceRecovery ? '#86efac' : '#fde68a'}`, 
                  borderRadius: '8px', 
                  padding: '14px 16px', 
                  marginBottom: '16px' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Coins size={18} style={{ color: paymentConfirmAdvanceRecovery ? '#16a34a' : '#d97706' }} />
                      <span style={{ fontWeight: '900', fontSize: '0.88rem', color: paymentConfirmAdvanceRecovery ? '#166534' : '#92400e' }}>
                        Advance Recovery Confirmation in Salary
                      </span>
                    </div>
                    <span style={{ 
                      background: paymentConfirmAdvanceRecovery ? '#dcfce7' : '#fef3c7', 
                      color: paymentConfirmAdvanceRecovery ? '#166534' : '#b45309', 
                      fontSize: '0.72rem', 
                      fontWeight: '800', 
                      padding: '2px 8px', 
                      borderRadius: '4px' 
                    }}>
                      {paymentConfirmAdvanceRecovery ? 'RECOVERY ACTIVE' : 'RECOVERY POSTPONED'}
                    </span>
                  </div>

                  {/* Active Advance Loan Metrics */}
                  {(() => {
                    const remBal = Number(paymentActiveAdvance.remainingBalance ?? (paymentActiveAdvance.advanceAmount - (paymentActiveAdvance.totalRecoveredAmount || 0)));
                    const enteredDed = parseFloat(paymentAdvanceRecoveryAmount) || 0;
                    const balAfterThisPay = Math.max(0, remBal - (paymentConfirmAdvanceRecovery ? enteredDed : 0));

                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', background: '#ffffff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '10px', fontSize: '0.75rem' }}>
                          <div>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Total Advance</span>
                            <b style={{ color: '#0f172a' }}>₹ {(paymentActiveAdvance.advanceAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Already Recovered</span>
                            <b style={{ color: '#16a34a' }}>₹ {(paymentActiveAdvance.totalRecoveredAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Outstanding Balance</span>
                            <b style={{ color: '#dc2626' }}>₹ {remBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                          </div>
                        </div>

                        {/* Confirmation Toggle / Checkbox */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '800', color: '#1e293b', marginBottom: paymentConfirmAdvanceRecovery ? '10px' : '4px' }}>
                          <input 
                            type="checkbox" 
                            checked={paymentConfirmAdvanceRecovery} 
                            onChange={e => {
                              const checked = e.target.checked;
                              setPaymentConfirmAdvanceRecovery(checked);
                              if (checked && !paymentAdvanceRecoveryAmount) {
                                const emi = Number(paymentActiveAdvance.monthlyEmiAmount) || 0;
                                setPaymentAdvanceRecoveryAmount(String(Math.min(emi > 0 ? emi : remBal, remBal)));
                              }
                            }}
                            style={{ width: '16px', height: '16px', accentColor: '#16a34a' }}
                          />
                          <span>Confirm recovery and deduct advance amount from this month's salary</span>
                        </label>

                        {paymentConfirmAdvanceRecovery ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.73rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                                  Recovery Amount to Deduct (₹) *
                                </label>
                                <input 
                                  type="number" 
                                  className="form-control" 
                                  style={{ fontWeight: '800', color: '#dc2626', fontSize: '0.95rem' }}
                                  value={paymentAdvanceRecoveryAmount} 
                                  onChange={e => setPaymentAdvanceRecoveryAmount(e.target.value)} 
                                  min="0"
                                  max={remBal}
                                  required={paymentConfirmAdvanceRecovery}
                                />
                              </div>

                              {/* Quick Fill Buttons */}
                              <div style={{ display: 'flex', gap: '4px', alignSelf: 'flex-end' }}>
                                <button 
                                  type="button" 
                                  className="btn-secondary" 
                                  style={{ padding: '6px 8px', fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                                  onClick={() => {
                                    const emi = Number(paymentActiveAdvance.monthlyEmiAmount) || 0;
                                    setPaymentAdvanceRecoveryAmount(String(Math.min(emi > 0 ? emi : remBal, remBal)));
                                  }}
                                  title="Set to standard monthly EMI"
                                >
                                  Std EMI (₹{(paymentActiveAdvance.monthlyEmiAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                </button>
                                <button 
                                  type="button" 
                                  className="btn-secondary" 
                                  style={{ padding: '6px 8px', fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                                  onClick={() => setPaymentAdvanceRecoveryAmount(String(remBal))}
                                  title="Clear full remaining balance in this salary"
                                >
                                  Full Balance (₹{remBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                </button>
                              </div>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '5px' }}>
                              💡 Balance remaining after this salary payment: <strong style={{ color: balAfterThisPay === 0 ? '#16a34a' : '#d97706' }}>₹{balAfterThisPay.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> {balAfterThisPay === 0 && '🎉 (Will be Fully Recovered)'}
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: '4px', fontStyle: 'italic' }}>
                            ⚠️ Advance recovery is postponed for this month. The outstanding loan balance (₹{remBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) will remain intact.
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '6px', padding: '8px 12px', marginBottom: '14px', fontSize: '0.74rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={14} style={{ color: '#059669' }} />
                  <span>No active advance balance pending for recovery for this employee.</span>
                </div>
              )}

              {/* Payment Date and Time Capture */}
              <div className="form-grid-2" style={{ marginBottom: '14px' }}>
                <div>
                  <label className="form-label">Payment Disbursal Date *</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={paymentDate} 
                    onChange={e => setPaymentDate(e.target.value)} 
                    required 
                  />
                </div>

                <div>
                  <label className="form-label">Payment Time (HH:MM:SS) *</label>
                  <input 
                    type="time" 
                    step="1"
                    className="form-control" 
                    value={paymentTime} 
                    onChange={e => setPaymentTime(e.target.value)} 
                    required 
                  />
                </div>
              </div>

              <div className="form-grid-2" style={{ marginBottom: '14px' }}>
                <div>
                  <label className="form-label">Payment Mode</label>
                  <SearchableSelect className="form-control" value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                    <option value="Bank Transfer (NEFT)">Bank Transfer (NEFT)</option>
                    <option value="RTGS">RTGS</option>
                    <option value="IMPS">IMPS</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                  </SearchableSelect>
                </div>

                <div>
                  <label className="form-label">Transaction / UTR Reference No</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={paymentTxnRef} 
                    onChange={e => setPaymentTxnRef(e.target.value)} 
                    placeholder="e.g. UTR123456789" 
                  />
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label className="form-label">Payment Notes / Remarks</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={paymentNotes} 
                  onChange={e => setPaymentNotes(e.target.value)} 
                  placeholder="e.g. August 2026 Salary transferred via SBI corporate net banking" 
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowPaymentModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ background: '#16a34a', borderColor: '#16a34a' }}>
                  <CheckCircle2 size={16} /> Confirm & Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: PRINTABLE PAYSLIP PREVIEW                                        */}
      {/* ========================================================================= */}
      {activePayslipData && (
        <EmployeePayslipPDF 
          employee={activePayslipData.employee} 
          salaryData={activePayslipData.salaryData} 
          monthKey={payrollMonth} 
          payment={activePayslipData.payment}
          onClose={() => setActivePayslipData(null)} 
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: STANDALONE CONFIRM ADVANCE RECOVERY                             */}
      {/* ========================================================================= */}
      {showAdvanceRecoveryModal && recoveryTargetAdvance && (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.75)', zIndex: 1060 }}>
          <div className="modal-content glass-panel" style={{ width: '560px', padding: '24px', background: '#ffffff', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontWeight: '900', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Coins size={20} /> Confirm Advance Recovery
              </h3>
              <button type="button" className="btn-secondary" onClick={() => setShowAdvanceRecoveryModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleDirectAdvanceRecoverySubmit}>
              {/* Target Advance Summary Card */}
              {(() => {
                const remBal = Number(recoveryTargetAdvance.remainingBalance ?? (recoveryTargetAdvance.advanceAmount - (recoveryTargetAdvance.totalRecoveredAmount || 0)));
                const emi = Number(recoveryTargetAdvance.monthlyEmiAmount) || 0;
                const enteredAmt = parseFloat(recoveryAmountInput) || 0;
                const projectedBal = Math.max(0, remBal - enteredAmt);

                return (
                  <>
                    <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: '900', fontSize: '1rem', color: '#0f172a' }}>{recoveryTargetAdvance.employeeName}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            {recoveryTargetAdvance.department} • Loan Req: {recoveryTargetAdvance.requestDate}
                          </div>
                        </div>
                        <span style={{ 
                          background: recoveryTargetAdvance.status === 'Approved & Disbursed' ? '#dcfce7' : '#fef9c3', 
                          color: recoveryTargetAdvance.status === 'Approved & Disbursed' ? '#166534' : '#854d0e',
                          fontSize: '0.72rem', fontWeight: '800', padding: '2px 8px', borderRadius: '4px' 
                        }}>
                          {recoveryTargetAdvance.status}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '12px', borderTop: '1px dashed #cbd5e1', paddingTop: '10px' }}>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Total Advance</span>
                          <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a' }}>
                            ₹ {(recoveryTargetAdvance.advanceAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Already Recovered</span>
                          <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#059669' }}>
                            ₹ {(recoveryTargetAdvance.totalRecoveredAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Current Balance</span>
                          <span style={{ fontSize: '0.92rem', fontWeight: '900', color: '#d97706' }}>
                            ₹ {remBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Recovery Mechanism / Channel */}
                    <div style={{ marginBottom: '14px' }}>
                      <label className="form-label">Recovery Channel / Mode *</label>
                      <SearchableSelect 
                        className="form-control" 
                        value={recoveryModeInput} 
                        onChange={e => setRecoveryModeInput(e.target.value)}
                        required
                      >
                        <option value="SALARY_DEDUCTION">Salary Deduction Adjustment (Linked to Payroll)</option>
                        <option value="DIRECT_RECOVERY">Direct Settlement / Cash / UPI Return from Employee</option>
                      </SearchableSelect>
                    </div>

                    {recoveryModeInput === 'SALARY_DEDUCTION' && (
                      <div style={{ marginBottom: '14px' }}>
                        <label className="form-label">Adjust Against Salary Month *</label>
                        <input 
                          type="month" 
                          className="form-control" 
                          value={recoveryMonthInput} 
                          onChange={e => setRecoveryMonthInput(e.target.value)} 
                          required 
                        />
                      </div>
                    )}

                    {/* Recovery Amount */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label className="form-label" style={{ margin: 0 }}>Confirmed Recovery Amount (₹) *</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button 
                            type="button" 
                            className="btn-secondary" 
                            style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                            onClick={() => setRecoveryAmountInput(String(Math.min(emi > 0 ? emi : remBal, remBal)))}
                          >
                            1 EMI (₹{(emi || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                          </button>
                          <button 
                            type="button" 
                            className="btn-secondary" 
                            style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                            onClick={() => setRecoveryAmountInput(String(remBal))}
                          >
                            Full Balance (₹{remBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                          </button>
                        </div>
                      </div>
                      <input 
                        type="number" 
                        className="form-control" 
                        style={{ fontSize: '1.05rem', fontWeight: '800', color: '#166534' }}
                        value={recoveryAmountInput} 
                        onChange={e => setRecoveryAmountInput(e.target.value)} 
                        min="1"
                        max={remBal}
                        required 
                      />
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                        Balance remaining after recovery: <strong style={{ color: projectedBal === 0 ? '#166534' : '#d97706' }}>₹{projectedBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> {projectedBal === 0 && '🎉 (Loan will be Marked Fully Recovered)'}
                      </div>
                    </div>

                    {/* Date and Time */}
                    <div className="form-grid-2" style={{ marginBottom: '14px' }}>
                      <div>
                        <label className="form-label">Recovery Date *</label>
                        <input 
                          type="date" 
                          className="form-control" 
                          value={recoveryDateInput} 
                          onChange={e => setRecoveryDateInput(e.target.value)} 
                          required 
                        />
                      </div>
                      <div>
                        <label className="form-label">Recovery Time *</label>
                        <input 
                          type="time" 
                          step="1"
                          className="form-control" 
                          value={recoveryTimeInput} 
                          onChange={e => setRecoveryTimeInput(e.target.value)} 
                          required 
                        />
                      </div>
                    </div>

                    {/* Notes / Reference */}
                    <div style={{ marginBottom: '20px' }}>
                      <label className="form-label">Recovery Notes / Receipt Ref</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={recoveryNotesInput} 
                        onChange={e => setRecoveryNotesInput(e.target.value)} 
                        placeholder="e.g. Deducted in salary / cash deposited / UPI ref" 
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button type="button" className="btn-secondary" onClick={() => setShowAdvanceRecoveryModal(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" style={{ background: '#16a34a', borderColor: '#16a34a' }}>
                        <CheckCircle2 size={16} /> Confirm & Save Recovery
                      </button>
                    </div>
                  </>
                );
              })()}
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: ADVANCE RECOVERY AUDIT HISTORY                                   */}
      {/* ========================================================================= */}
      {showAdvanceHistoryModal && historyTargetAdvance && (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.75)', zIndex: 1060 }}>
          <div className="modal-content glass-panel" style={{ width: '680px', maxHeight: '85vh', overflowY: 'auto', padding: '24px', background: '#ffffff', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RotateCcw size={20} style={{ color: '#0284c7' }} /> Advance Recovery & Deduction History
              </h3>
              <button type="button" className="btn-secondary" onClick={() => setShowAdvanceHistoryModal(false)}>
                <X size={16} />
              </button>
            </div>

            {/* Advance Header Summary */}
            {(() => {
              const totalAdv = Number(historyTargetAdvance.advanceAmount) || 0;
              const totalRec = Number(historyTargetAdvance.totalRecoveredAmount) || 0;
              const remBal = Number(historyTargetAdvance.remainingBalance ?? (totalAdv - totalRec));
              const pct = totalAdv > 0 ? Math.min(100, Math.round((totalRec / totalAdv) * 100)) : 0;
              const history = historyTargetAdvance.deductionHistory || [];

              return (
                <div>
                  <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontWeight: '900', fontSize: '1.05rem', color: '#0f172a' }}>{historyTargetAdvance.employeeName}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                          {historyTargetAdvance.department} • Loan Reason: {historyTargetAdvance.reason}
                        </div>
                      </div>
                      <span style={{ 
                        background: historyTargetAdvance.status === 'Fully Recovered' ? '#f1f5f9' : '#dcfce7',
                        color: historyTargetAdvance.status === 'Fully Recovered' ? '#475569' : '#166534',
                        padding: '3px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '800'
                      }}>
                        {historyTargetAdvance.status}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '10px', fontSize: '0.78rem' }}>
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Total Advance</span>
                        <b style={{ color: '#0f172a' }}>₹ {totalAdv.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Monthly EMI</span>
                        <b style={{ color: '#0284c7' }}>₹ {(historyTargetAdvance.monthlyEmiAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Total Recovered</span>
                        <b style={{ color: '#059669' }}>₹ {totalRec.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({pct}%)</b>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Outstanding</span>
                        <b style={{ color: remBal > 0 ? '#d97706' : '#64748b' }}>₹ {remBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#10b981' : '#0284c7', transition: 'width 0.3s ease' }} />
                      </div>
                    </div>
                  </div>

                  {/* History Log Table */}
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', fontWeight: '800', color: '#334155' }}>
                      Recovery Audit Log ({history.length} {history.length === 1 ? 'record' : 'records'})
                    </h4>

                    {history.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '0.82rem' }}>
                        No advance deductions or recoveries recorded yet for this loan.
                      </div>
                    ) : (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                        <table className="data-table" style={{ width: '100%', margin: 0, fontSize: '0.78rem' }}>
                          <thead style={{ background: '#f1f5f9' }}>
                            <tr>
                              <th>Date & Time</th>
                              <th>Month / Channel</th>
                              <th style={{ textAlign: 'right' }}>Amount</th>
                              <th style={{ textAlign: 'right' }}>Balance After</th>
                              <th>Confirmed By / Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.map((h, idx) => (
                              <tr key={h.id || idx}>
                                <td style={{ fontWeight: '700' }}>
                                  {h.recoveredDate || h.date || '—'}
                                  {h.recoveredTime && <span style={{ color: '#64748b', fontWeight: 'normal', marginLeft: '4px' }}>{h.recoveredTime}</span>}
                                </td>
                                <td>
                                  <span style={{ 
                                    background: h.type === 'DIRECT_RECOVERY' ? '#fef3c7' : '#e0f2fe', 
                                    color: h.type === 'DIRECT_RECOVERY' ? '#92400e' : '#0369a1',
                                    padding: '1px 6px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: '700'
                                  }}>
                                    {h.monthKey ? `Salary (${h.monthKey})` : (h.paymentMode || 'Direct')}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: '800', color: '#16a34a' }}>
                                  ₹ {Number(h.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: '700', color: '#d97706' }}>
                                  ₹ {Number(h.remainingBalanceAfter !== undefined ? h.remainingBalanceAfter : (h.remainingBalance || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td>
                                  <div style={{ fontSize: '0.72rem', color: '#334155' }}>
                                    {h.notes || 'Recovery confirmed'}
                                  </div>
                                  {h.confirmedBy && (
                                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                      By: {h.confirmedBy}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={() => setShowAdvanceHistoryModal(false)}>
                      Close
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
}
