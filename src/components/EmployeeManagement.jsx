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
  Lock
} from 'lucide-react';
import TablePagination, { usePagination } from './TablePagination';
import EmployeePayslipPDF from './EmployeePayslipPDF';
import { 
  EMPLOYEE_DEPARTMENTS, 
  EMPLOYEE_DESIGNATIONS, 
  EMPLOYEE_STATUSES, 
  SHIFT_OPTIONS, 
  initialEmployees, 
  initialAttendanceRecords, 
  initialSalaryAdvances,
  calculateEmployeeMonthlySalary
} from '../factoryStore';
import { 
  saveEmployeeToSupabase, 
  deleteEmployeeFromSupabase, 
  saveEmployeeAttendanceToSupabase, 
  saveSalaryAdvanceToSupabase 
} from '../services/supabaseDataService';
import { pushSlugState } from '../utils/slugRouter';

export default function EmployeeManagement({
  urlParams = {},
  employees = initialEmployees,
  attendanceRecords = initialAttendanceRecords,
  salaryAdvances = initialSalaryAdvances,
  currentUser,
  userRole = "Admin",
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onSaveAttendance,
  onSaveSalaryAdvance,
  onUpdateSalaryAdvance
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
  const [formDob, setFormDob] = useState('1992-01-01');
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
  const [formBranch, setFormBranch] = useState('Pithampur Sector 3');
  const [formPaymentMode, setFormPaymentMode] = useState('Bank Transfer (NEFT)');

  // Salary Form State
  const [formBasicSalary, setFormBasicSalary] = useState(15000);
  const [formHra, setFormHra] = useState(6000);
  const [formOtherAllowance, setFormOtherAllowance] = useState(2000);
  const [formOptDinner, setFormOptDinner] = useState(false);
  const [formDinnerPerNight, setFormDinnerPerNight] = useState(0);
  const [formFixedDinner, setFormFixedDinner] = useState(0);
  const [formOptPf, setFormOptPf] = useState(true);
  const [formOptEsic, setFormOptEsic] = useState(false);
  const [formPt, setFormPt] = useState(200);

  // Form State for Salary Advance Request
  const [advEmpId, setAdvEmpId] = useState('');
  const [advAmount, setAdvAmount] = useState('');
  const [advTenureMonths, setAdvTenureMonths] = useState(2);
  const [advReason, setAdvReason] = useState('');

  // Form State for Attendance Marking
  const [attStatus, setAttStatus] = useState('Present');
  const [attShiftType, setAttShiftType] = useState('Shift A: Day (08:00 - 20:00)');
  const [attCheckIn, setAttCheckIn] = useState('08:00');
  const [attCheckOut, setAttCheckOut] = useState('20:00');
  const [attOtHours, setAttOtHours] = useState(0);
  const [attOtReason, setAttOtReason] = useState('');

  // Form State for Offboarding
  const [offResignDate, setOffResignDate] = useState(new Date().toISOString().split('T')[0]);
  const [offRelieveDate, setOffRelieveDate] = useState('');
  const [offNoticeDays, setOffNoticeDays] = useState(30);
  const [offHandover, setOffHandover] = useState(false);
  const [offSettlementStatus, setOffSettlementStatus] = useState('In Process');
  const [offNotes, setOffNotes] = useState('');

  // Open Onboard Modal
  const handleOpenOnboardModal = () => {
    setEditingEmployee(null);
    const nextCode = `SIL-${Math.floor(100 + Math.random() * 900)}`;
    setFormEmpCode(nextCode);
    setFormFullName('');
    setFormGender('Male');
    setFormDob('1995-01-01');
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
    setFormIfscCode('SBIN0004521');
    setFormAccountHolder('');
    setFormBranch('Pithampur Sector 3');
    setFormPaymentMode('Bank Transfer (NEFT)');

    setFormBasicSalary(14000);
    setFormHra(5600);
    setFormOtherAllowance(2000);
    setFormOptDinner(false);
    setFormDinnerPerNight(0);
    setFormFixedDinner(0);
    setFormOptPf(true);
    setFormOptEsic(false);
    setFormPt(200);

    setShowOnboardModal(true);
  };

  // Open Edit Employee Modal
  const handleOpenEditModal = (emp) => {
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
      setAttOtReason(existing.overtimeReason || '');
    } else {
      setAttStatus('Present');
      setAttShiftType(emp.defaultShift || 'Shift A: Day (08:00 - 20:00)');
      setAttCheckIn(emp.shiftDurationHours === 8 ? '09:00' : '08:00');
      setAttCheckOut(emp.shiftDurationHours === 8 ? '17:00' : emp.shiftDurationHours === 10 ? '18:00' : '20:00');
      setAttOtHours(0);
      setAttOtReason('');
    }
  };

  // Save Attendance Record
  const handleSaveAttendance = () => {
    if (!markingAttendanceEmp) return;

    const isNight = attShiftType.toLowerCase().includes('night');
    const ot = parseFloat(attOtHours) || 0;
    const shiftHrs = markingAttendanceEmp.shiftDurationHours || 12;

    const isExisting = Boolean(markingAttendanceEmp?.id && attendanceRecords.some(a => a.employeeId === markingAttendanceEmp.id && a.date === attendanceDate));
    if (isExisting && !isAdmin) {
      alert("⛔ Permission Denied: Attendance has already been marked for this employee. Only the Admin role is authorized to edit or modify locked attendance records.");
      return;
    }

    const record = {
      id: `ATT-${attendanceDate.replace(/-/g, '')}-${markingAttendanceEmp.id}`,
      employeeId: markingAttendanceEmp.id,
      date: attendanceDate,
      shiftType: attShiftType,
      shiftHours: shiftHrs,
      status: attStatus,
      checkIn: attCheckIn,
      checkOut: attCheckOut,
      totalHoursWorked: attStatus === 'Present' ? (shiftHrs + ot) : attStatus === 'Half Day' ? (shiftHrs / 2) : 0,
      overtimeHours: ot,
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
    alert(`Attendance marked for ${markingAttendanceEmp.fullName} on ${attendanceDate} (${attStatus}${ot > 0 ? `, OT: ${ot} hrs Pending Approval` : ''})`);
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
    const updated = {
      ...attRecord,
      overtimeStatus: isApproved ? 'Approved' : 'Rejected',
      overtimeApprovedBy: currentUser?.name || 'Plant Head',
      overtimeApprovedDate: new Date().toISOString().split('T')[0]
    };
    if (onSaveAttendance) onSaveAttendance(updated);
    saveEmployeeAttendanceToSupabase(updated);
    alert(`Overtime request for ${attRecord.employeeId} on ${attRecord.date} has been marked as ${updated.overtimeStatus}!`);
  };

  // Save New Salary Advance Request
  const handleSaveSalaryAdvance = (e) => {
    e.preventDefault();
    if (!advEmpId || !advAmount || Number(advAmount) <= 0) {
      alert("Please select employee and enter a valid advance amount!");
      return;
    }
    const selectedEmp = employees.find(emp => emp.id === advEmpId);
    if (!selectedEmp) return;

    // Rule Enforcement: Any employee with a previous outstanding advance cannot request a new advance before completion of old dues
    const activeExistingAdvance = salaryAdvances.find(adv => 
      adv.employeeId === selectedEmp.id && 
      (adv.status === 'Approved & Disbursed' || adv.status === 'Pending Approval') &&
      Number(adv.remainingBalance ?? (adv.advanceAmount - (adv.totalRecoveredAmount || 0))) > 0
    );

    if (activeExistingAdvance) {
      alert(`⚠️ Advance Blocked: ${selectedEmp.fullName} already has an active outstanding advance (${activeExistingAdvance.id}) with ₹${Number(activeExistingAdvance.remainingBalance || activeExistingAdvance.advanceAmount).toLocaleString()} remaining dues! New advances cannot be requested until previous dues are 100% completed.`);
      return;
    }

    const amt = Number(advAmount);
    const tenure = Number(advTenureMonths) || 1;
    const emi = Math.round(amt / tenure);

    const advanceRecord = {
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

    if (onSaveSalaryAdvance) onSaveSalaryAdvance(advanceRecord);
    saveSalaryAdvanceToSupabase(advanceRecord);
    setShowAdvanceModal(false);
    setAdvEmpId('');
    setAdvAmount('');
    setAdvReason('');
    alert(`Salary Advance Request of ₹${amt.toLocaleString()} recorded for ${selectedEmp.fullName} (${advanceRecord.status})!`);
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
    alert(`Salary Advance of ₹${adv.advanceAmount.toLocaleString()} for ${adv.employeeName} approved & disbursed! Monthly EMI: ₹${adv.monthlyEmiAmount}`);
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
            onClick={() => setShowAdvanceModal(true)}
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
                ₹ {salaryAdvances.filter(a => a.status === 'Approved & Disbursed').reduce((acc, a) => acc + (a.remainingBalance || 0), 0).toLocaleString()}
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
              <select className="form-control" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}>
                <option value="ALL">All Departments</option>
                {EMPLOYEE_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              <select className="form-control" value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}>
                <option value="ALL">All Shift Durations</option>
                <option value="12">12 Hours Shift</option>
                <option value="10">10 Hours Shift</option>
                <option value="8">8 Hours Shift</option>
              </select>

              <select className="form-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="ALL">All Statuses</option>
                {EMPLOYEE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
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
                          <div style={{ fontWeight: '800', color: '#0f172a' }}>₹ {gross.toLocaleString()}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            Basic: ₹{(struct.basicSalary || 0).toLocaleString()} | HRA: ₹{(struct.hra || 0).toLocaleString()}
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
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button 
                              type="button" 
                              className="btn-secondary" 
                              style={{ padding: '3px 8px', fontSize: '0.75rem', color: '#0284c7' }}
                              onClick={() => handleOpenEditModal(emp)}
                              title="Edit Employee & Shift Hours"
                            >
                              <Edit3 size={13} /> Edit
                            </button>
                            <button 
                              type="button" 
                              className="btn-secondary" 
                              style={{ padding: '3px 8px', fontSize: '0.75rem', color: '#d97706' }}
                              onClick={() => handleOpenOffboardModal(emp)}
                              title="Offboard / Relieving / Settlement"
                            >
                              <UserMinus size={13} /> Offboard
                            </button>
                            <button 
                              type="button" 
                              className="btn-secondary" 
                              style={{ padding: '3px 8px', fontSize: '0.75rem', color: '#ef4444' }}
                              onClick={() => handleDeleteEmployee(emp.id, emp.fullName)}
                              title="Delete Record"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
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
                          <div style={{ fontWeight: '800', color: '#059669', fontSize: '0.82rem' }}>
                            +{otHours} hrs OT
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
      {activeSubTab === 'overtime' && (
        <div>
          <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={24} style={{ color: '#16a34a' }} />
              <div>
                <h4 style={{ margin: 0, fontWeight: '800', color: '#166534', fontSize: '0.95rem' }}>
                  Factory Overtime Authorization Protocol
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#15803d' }}>
                  Rule Enforcement: Overtime logged on shop floor beyond standard shifts (8h, 10h, 12h) is subject to approval. Only approved overtime is counted into monthly salary calculations.
                </p>
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
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
                  <th style={{ textAlign: 'center' }}>Approval Action</th>
                </tr>
              </thead>
              <tbody>
                {attendanceRecords.filter(a => Number(a.overtimeHours) > 0).length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      No overtime records logged.
                    </td>
                  </tr>
                ) : (
                  attendanceRecords.filter(a => Number(a.overtimeHours) > 0).map(att => {
                    const emp = employees.find(e => e.id === att.employeeId);
                    const struct = emp?.salaryStructure || {};
                    const fixedGross = (struct.basicSalary || 0) + (struct.hra || 0) + (struct.otherAllowance || 0);
                    const shiftHrs = emp?.shiftDurationHours || att.shiftHours || 12;
                    const hourly = fixedGross / (26 * shiftHrs);
                    const estPayout = Math.round(hourly * att.overtimeHours);

                    return (
                      <tr key={att.id}>
                        <td style={{ fontWeight: '800', color: '#0f172a' }}>{att.date}</td>
                        <td>
                          <div style={{ fontWeight: '800' }}>{emp?.fullName || att.employeeId}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{emp?.department} • {emp?.empCode}</div>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.72rem', fontWeight: '800', background: '#f1f5f9', padding: '2px 6px', borderRadius: '3px' }}>
                            {shiftHrs} Hours Shift
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: '900', color: '#059669', fontSize: '0.9rem' }}>
                            +{att.overtimeHours} hrs
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            Time: {att.checkIn} - {att.checkOut}
                          </div>
                        </td>
                        <td style={{ maxWidth: '280px', fontSize: '0.8rem', color: '#334155' }}>
                          {att.overtimeReason || 'Production job run extended.'}
                        </td>
                        <td>
                          <div style={{ fontWeight: '800', color: '#0f172a' }}>₹ {estPayout.toLocaleString()}</div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b' }}>@ ₹{Math.round(hourly)}/hr</div>
                        </td>
                        <td>
                          <span style={{ 
                            background: att.overtimeStatus === 'Approved' ? '#dcfce7' : att.overtimeStatus === 'Rejected' ? '#fee2e2' : '#fef9c3',
                            color: att.overtimeStatus === 'Approved' ? '#166534' : att.overtimeStatus === 'Rejected' ? '#991b1b' : '#854d0e',
                            padding: '3px 8px', borderRadius: '4px', fontSize: '0.74rem', fontWeight: '800'
                          }}>
                            {att.overtimeStatus}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {att.overtimeStatus === 'Pending Approval' ? (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button 
                                type="button" 
                                className="btn-primary" 
                                style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#059669', borderColor: '#059669' }}
                                onClick={() => handleApproveOvertime(att, true)}
                              >
                                <Check size={13} /> Approve
                              </button>
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                style={{ padding: '3px 8px', fontSize: '0.75rem', color: '#dc2626' }}
                                onClick={() => handleApproveOvertime(att, false)}
                              >
                                <X size={13} /> Reject
                              </button>
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              {att.overtimeStatus} by {att.overtimeApprovedBy || 'Admin'}
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: SALARY ADVANCES & AMORTIZATION                                  */}
      {/* ========================================================================= */}
      {activeSubTab === 'advances' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              💳 Employee Salary Advances & EMI Recovery Schedule
            </h4>
            <button 
              type="button" 
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setShowAdvanceModal(true)}
            >
              <Plus size={16} /> New Advance Request
            </button>
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
                {salaryAdvances.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      No salary advances recorded.
                    </td>
                  </tr>
                ) : (
                  salaryAdvances.map(adv => (
                    <tr key={adv.id}>
                      <td style={{ fontWeight: '700' }}>{adv.requestDate}</td>
                      <td>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>{adv.employeeName}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{adv.department} • Reason: {adv.reason}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '900', color: '#0f172a', fontSize: '0.92rem' }}>
                          ₹ {(adv.advanceAmount || 0).toLocaleString()}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0284c7', background: '#e0f2fe', padding: '2px 6px', borderRadius: '3px' }}>
                          {adv.repaymentTenureMonths} Months
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '800', color: '#dc2626' }}>
                          ₹ {(adv.monthlyEmiAmount || 0).toLocaleString()} / mo
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem', fontWeight: '700' }}>
                          <span style={{ color: '#059669' }}>₹{(adv.totalRecoveredAmount || 0).toLocaleString()}</span> / <span style={{ color: '#d97706' }}>₹{(adv.remainingBalance || 0).toLocaleString()} Bal</span>
                        </div>
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
                        {adv.status === 'Pending Approval' ? (
                          <button 
                            type="button" 
                            className="btn-primary" 
                            style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#059669', borderColor: '#059669' }}
                            onClick={() => handleApproveAdvance(adv)}
                          >
                            <Check size={13} /> Approve & Disburse
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            Auto-deducts in payroll
                          </span>
                        )}
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
                ₹ {payrollTotals.totalNet.toLocaleString()}
              </div>
              <div className="stat-card-sub">For {monthlyPayrollSummary.length} employees</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-title">Gross Earnings</div>
              <div className="stat-card-val" style={{ color: '#0f172a' }}>
                ₹ {payrollTotals.totalGross.toLocaleString()}
              </div>
              <div className="stat-card-sub">Basic + HRA + Allowances + OT</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-title">Approved OT Payout</div>
              <div className="stat-card-val" style={{ color: '#059669' }}>
                ₹ {payrollTotals.totalOtPay.toLocaleString()}
              </div>
              <div className="stat-card-sub">{payrollTotals.totalOtHours} Approved OT hrs</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-title">Total PF & ESIC</div>
              <div className="stat-card-val" style={{ color: '#7c3aed' }}>
                ₹ {(payrollTotals.totalPf + payrollTotals.totalEsic).toLocaleString()}
              </div>
              <div className="stat-card-sub">PF: ₹{payrollTotals.totalPf.toLocaleString()} | ESIC: ₹{payrollTotals.totalEsic.toLocaleString()}</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-title">Advance Recovered</div>
              <div className="stat-card-val" style={{ color: '#dc2626' }}>
                ₹ {payrollTotals.totalAdvanceRecovered.toLocaleString()}
              </div>
              <div className="stat-card-sub">Monthly EMI deductions</div>
            </div>
          </div>

          {/* Master Salary Sheet Table */}
          <div className="glass-panel" style={{ padding: '0', overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', minWidth: '1080px', margin: 0 }}>
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
                  <th style={{ textAlign: 'center' }}>Payslip</th>
                </tr>
              </thead>
              <tbody>
                {monthlyPayrollSummary.map(row => {
                  const emp = employees.find(e => e.id === row.employeeId);
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
                        <div style={{ fontWeight: '700' }}>₹ {(row.earnedBasic || 0).toLocaleString()}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.78rem', color: '#334155' }}>
                          HRA: ₹{(row.earnedHra || 0).toLocaleString()}<br/>
                          Other: ₹{(row.earnedOther || 0).toLocaleString()}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '700', color: row.dinnerAllowance > 0 ? '#7c3aed' : '#94a3b8' }}>
                          ₹ {(row.dinnerAllowance || 0).toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{row.nightShiftCount} Nights</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '800', color: row.earnedOtPay > 0 ? '#059669' : '#94a3b8' }}>
                          ₹ {(row.earnedOtPay || 0).toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{row.approvedOtHours} hrs approved</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>
                          ₹ {(row.totalGrossEarned || 0).toLocaleString()}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.76rem', color: '#334155' }}>
                          PF: ₹{(row.pfDeduction || 0).toLocaleString()}<br/>
                          ESIC: ₹{(row.esicDeduction || 0).toLocaleString()}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '800', color: row.totalAdvanceDeduction > 0 ? '#dc2626' : '#94a3b8' }}>
                          ₹ {(row.totalAdvanceDeduction || 0).toLocaleString()}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#0284c7' }}>
                          ₹ {(row.netPayable || 0).toLocaleString()}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          type="button" 
                          className="btn-primary" 
                          style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => setActivePayslipData({ employee: emp, salaryData: row })}
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
                  <select className="form-control" value={formGender} onChange={e => setFormGender(e.target.value)}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Department *</label>
                  <select className="form-control" value={formDepartment} onChange={e => setFormDepartment(e.target.value)}>
                    {EMPLOYEE_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Designation *</label>
                  <select className="form-control" value={formDesignation} onChange={e => setFormDesignation(e.target.value)}>
                    {EMPLOYEE_DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
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
                    <select className="form-control" value={formDefaultShift} onChange={e => setFormDefaultShift(e.target.value)}>
                      <option value="Shift A: Day (08:00 - 20:00)">Shift A: Day Shift (08:00 - 20:00, 12h)</option>
                      <option value="Shift B: Night (20:00 - 08:00)">Shift B: Night Shift (20:00 - 08:00, 12h)</option>
                      <option value="Shift A: Day (08:00 - 18:00)">Shift A: Day Shift (08:00 - 18:00, 10h)</option>
                      <option value="Shift B: Night (20:00 - 06:00)">Shift B: Night Shift (20:00 - 06:00, 10h)</option>
                      <option value="General Shift (09:00 - 17:00)">General Shift (09:00 - 17:00, 8h)</option>
                    </select>
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
                  <select className="form-control" value={formPaymentMode} onChange={e => setFormPaymentMode(e.target.value)}>
                    <option value="Bank Transfer (NEFT)">Bank Transfer (NEFT/RTGS)</option>
                    <option value="UPI / IMPS">UPI / IMPS</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                  </select>
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
                <select className="form-control" value={offSettlementStatus} onChange={e => setOffSettlementStatus(e.target.value)}>
                  <option value="In Process">In Process</option>
                  <option value="Settled">Full & Final Settled</option>
                  <option value="Terminated">Terminated</option>
                </select>
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
                <select className="form-control" value={attStatus} onChange={e => setAttStatus(e.target.value)}>
                  <option value="Present">Present (Full Shift)</option>
                  <option value="Half Day">Half Day (50% Pay)</option>
                  <option value="Paid Leave">Paid Leave (PL)</option>
                  <option value="Absent">Absent (LOP - Loss of Pay)</option>
                  <option value="Comp Off">Comp Off</option>
                  <option value="Weekly Off">Weekly Off</option>
                </select>
              </div>

              <div>
                <label className="form-label">Shift Type Assigned</label>
                <select className="form-control" value={attShiftType} onChange={e => setAttShiftType(e.target.value)}>
                  <option value="Shift A: Day (08:00 - 20:00)">Shift A: Day (08:00 - 20:00, 12h)</option>
                  <option value="Shift B: Night (20:00 - 08:00)">Shift B: Night (20:00 - 08:00, 12h)</option>
                  <option value="Shift A: Day (08:00 - 18:00)">Shift A: Day (08:00 - 18:00, 10h)</option>
                  <option value="Shift B: Night (20:00 - 06:00)">Shift B: Night (20:00 - 06:00, 10h)</option>
                  <option value="General Shift (09:00 - 17:00)">General Shift (09:00 - 17:00, 8h)</option>
                </select>
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

            {/* Overtime Logging Section */}
            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '18px' }}>
              <div style={{ fontWeight: '800', fontSize: '0.85rem', color: '#0f172a', marginBottom: '8px' }}>
                ⏱️ Overtime Hours (Beyond {markingAttendanceEmp.shiftDurationHours || 12}h Standard Shift)
              </div>
              <div className="form-grid-2">
                <div>
                  <label className="form-label">OT Hours Logged</label>
                  <input 
                    type="number" 
                    step="0.5" 
                    className="form-control" 
                    value={attOtHours} 
                    onChange={e => setAttOtHours(e.target.value)} 
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
                <Coins size={20} /> Request Salary Advance
              </h3>
              <button type="button" className="btn-secondary" onClick={() => setShowAdvanceModal(false)}>
                <X size={16} />
              </button>
            </div>

            {/* Advance Request Form */}
            {(() => {
              const selectedEmpActiveAdvance = advEmpId ? salaryAdvances.find(adv => 
                adv.employeeId === advEmpId && 
                (adv.status === 'Approved & Disbursed' || adv.status === 'Pending Approval') &&
                Number(adv.remainingBalance ?? (adv.advanceAmount - (adv.totalRecoveredAmount || 0))) > 0
              ) : null;

              return (
                <form onSubmit={handleSaveSalaryAdvance}>
                  <div style={{ marginBottom: '12px' }}>
                    <label className="form-label">Select Employee *</label>
                    <select className="form-control" value={advEmpId} onChange={e => setAdvEmpId(e.target.value)} required>
                      <option value="">-- Choose Employee --</option>
                      {employees.filter(e => e.status === 'Active' || e.status === 'On Probation').map(e => {
                        const hasActive = salaryAdvances.find(adv => 
                          adv.employeeId === e.id && 
                          (adv.status === 'Approved & Disbursed' || adv.status === 'Pending Approval') &&
                          Number(adv.remainingBalance ?? (adv.advanceAmount - (adv.totalRecoveredAmount || 0))) > 0
                        );
                        return (
                          <option key={e.id} value={e.id}>
                            {e.fullName} ({e.empCode || e.id}) - {e.department} {hasActive ? `[⚠️ Advance Due: ₹${Number(hasActive.remainingBalance || hasActive.advanceAmount).toLocaleString()}]` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {selectedEmpActiveAdvance && (
                    <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', padding: '14px 16px', borderRadius: '8px', marginBottom: '16px', color: '#991b1b', fontSize: '0.84rem' }}>
                      <div style={{ fontWeight: '900', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', color: '#b91c1c' }}>
                        <AlertTriangle size={18} style={{ color: '#dc2626' }} /> Advance Request Blocked — Outstanding Advance Pending
                      </div>
                      <div>
                        This employee already has an active advance (<b>{selectedEmpActiveAdvance.id}</b>) with an outstanding balance of <b style={{ color: '#b91c1c' }}>₹{Number(selectedEmpActiveAdvance.remainingBalance || selectedEmpActiveAdvance.advanceAmount).toLocaleString()}</b> ({selectedEmpActiveAdvance.status}). As per factory policy, a new advance cannot be requested before completion of old dues.
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
                      <select 
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
                      </select>
                    </div>
                  </div>

                  {Number(advAmount) > 0 && !selectedEmpActiveAdvance && (
                    <div style={{ background: '#f0fdf4', padding: '10px 14px', borderRadius: '6px', border: '1px solid #bbf7d0', marginBottom: '14px', fontSize: '0.84rem', color: '#166534' }}>
                      💰 Monthly Salary EMI Deduction: <b>₹{Math.round(Number(advAmount) / (Number(advTenureMonths) || 1)).toLocaleString()} / month</b>
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
                    <button type="button" className="btn-secondary" onClick={() => setShowAdvanceModal(false)}>
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
                      title={selectedEmpActiveAdvance ? 'Request blocked due to outstanding advance' : 'Submit Advance Request'}
                    >
                      Submit Advance Request
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: PRINTABLE PAYSLIP PREVIEW                                        */}
      {/* ========================================================================= */}
      {activePayslipData && (
        <EmployeePayslipPDF 
          employee={activePayslipData.employee} 
          salaryData={activePayslipData.salaryData} 
          monthKey={payrollMonth} 
          onClose={() => setActivePayslipData(null)} 
        />
      )}

    </div>
  );
}
