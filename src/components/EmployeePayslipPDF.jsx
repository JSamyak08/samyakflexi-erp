import React from 'react';
import { Printer, ArrowLeft, Download } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import { getAuthorisedSignature, getCompanyLogo } from '../services/settingsService';

// Helper to convert number to Indian currency words
function numberToWords(num) {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if ((num = num.toString()).length > 9) return 'overflow';
  const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return '';
  let str = '';
  str += (Number(n[1]) !== 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
  str += (Number(n[2]) !== 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
  str += (Number(n[3]) !== 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
  str += (Number(n[4]) !== 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
  str += (Number(n[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Rupees Only' : 'Rupees Only';
  return str.trim();
}

export default function EmployeePayslipPDF({ employee, salaryData, monthKey = "2026-08", onClose }) {
  if (!employee || !salaryData) return null;

  const logoImage = getCompanyLogo();
  const signatureImage = getAuthorisedSignature();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [yearStr, monthStr] = (monthKey || '2026-08').split('-');
  const monthLabel = `${monthNames[parseInt(monthStr, 10) - 1] || 'August'} ${yearStr || '2026'}`;

  const bank = employee.bankDetails || {};
  const struct = employee.salaryStructure || {};

  return (
    <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.8)', zIndex: 1100 }}>
      <div 
        className="modal-content glass-panel" 
        style={{ 
          width: '880px', 
          maxHeight: '92vh', 
          overflowY: 'auto', 
          padding: '30px',
          background: '#ffffff',
          color: '#0f172a',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Action Bar */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
          <button 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: '700' }}
            onClick={onClose}
          >
            <ArrowLeft size={18} /> Back to Employee Dashboard
          </button>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', background: '#1e293b', borderColor: '#1e293b', fontWeight: '800' }}
              onClick={() => window.print()}
            >
              <Printer size={18} /> Print Salary Slip
            </button>
          </div>
        </div>

        {/* PRINTABLE PAYSLIP CONTAINER */}
        <div id="printable-payslip" className="printable-document" style={{ padding: '20px', background: '#ffffff', color: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif' }}>
          
          {/* Header Banner */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #1e293b', paddingBottom: '16px', marginBottom: '16px' }}>
            <div>
              {logoImage ? (
                <img src={logoImage} alt="Company Logo" style={{ height: '52px', maxWidth: '240px', objectFit: 'contain', marginBottom: '6px' }} />
              ) : (
                <h1 style={{ fontSize: '1.6rem', fontWeight: '900', color: '#1e293b', margin: 0, letterSpacing: '-0.5px' }}>
                  {COMPANY_DETAILS.name || 'SAMYAK INTERNATIONAL LTD'}
                </h1>
              )}
              <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px', maxWidth: '440px', lineHeight: '1.4' }}>
                {COMPANY_DETAILS.address || 'Plot 42, Sector 3, Pithampur Industrial Area, Indore, MP 454775'}<br />
                <b>GSTIN:</b> {COMPANY_DETAILS.gstin || '23AAACS9988F1Z1'} | <b>CIN:</b> U25200MP2015PLC03412
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ background: '#1e293b', color: '#ffffff', padding: '5px 14px', borderRadius: '6px', fontWeight: '900', fontSize: '0.95rem', letterSpacing: '0.5px', display: 'inline-block' }}>
                SALARY PAYSLIP
              </div>
              <div style={{ marginTop: '6px', fontSize: '0.85rem', color: '#334155' }}>
                <div>Pay Period: <b style={{ color: '#0f172a' }}>{monthLabel}</b></div>
                <div>Slip Generated: <b>{new Date().toISOString().split('T')[0]}</b></div>
              </div>
            </div>
          </div>

          {/* Employee & Deployment Info Table */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#f8fafc', padding: '14px 18px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
            <div style={{ fontSize: '0.82rem', lineHeight: '1.6', color: '#334155' }}>
              <div><b>Employee Name:</b> <span style={{ color: '#0f172a', fontWeight: '800' }}>{employee.fullName}</span></div>
              <div><b>Employee ID / Code:</b> <span style={{ fontFamily: 'monospace', fontWeight: '700' }}>{employee.empCode || employee.id}</span></div>
              <div><b>Department:</b> <span>{employee.department}</span></div>
              <div><b>Designation:</b> <span>{employee.designation}</span></div>
              <div><b>Date of Joining:</b> <span>{employee.joiningDate || '—'}</span></div>
              <div><b>Shift Duration:</b> <span style={{ color: '#0284c7', fontWeight: '800' }}>{employee.shiftDurationHours || 12} Hours Shift</span></div>
            </div>

            <div style={{ fontSize: '0.82rem', lineHeight: '1.6', color: '#334155' }}>
              <div><b>Bank Name:</b> <span>{bank.bankName || '—'}</span></div>
              <div><b>Account Number:</b> <span style={{ fontFamily: 'monospace' }}>{bank.accountNumber || '—'}</span></div>
              <div><b>IFSC Code:</b> <span style={{ fontFamily: 'monospace' }}>{bank.ifscCode || '—'}</span></div>
              <div><b>Payment Mode:</b> <span>{bank.paymentMode || 'Bank Transfer (NEFT)'}</span></div>
              <div><b>UAN (PF No):</b> <span>{employee.uanNo || (struct.optPf ? 'PF Opted In' : 'N/A')}</span></div>
              <div><b>ESIC IP No:</b> <span>{employee.esicNo || (struct.optEsic ? 'ESIC Opted In' : 'N/A')}</span></div>
            </div>
          </div>

          {/* Attendance Summary Bar */}
          <div style={{ background: '#f1f5f9', padding: '10px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
            <div>Working Days: <b>{salaryData.totalWorkingDays || 26}</b></div>
            <div>Present Days: <b style={{ color: '#059669' }}>{salaryData.presentCount || 0}</b></div>
            <div>Half Days: <b>{salaryData.halfDayCount || 0}</b></div>
            <div>Paid Leaves: <b>{salaryData.paidLeaveCount || 0}</b></div>
            <div>Absent / LOP: <b style={{ color: salaryData.absentCount > 0 ? '#dc2626' : '#64748b' }}>{salaryData.absentCount || 0}</b></div>
            <div>Night Shifts: <b style={{ color: '#7c3aed' }}>{salaryData.nightShiftCount || 0}</b></div>
            <div>Approved OT: <b style={{ color: '#0284c7' }}>{salaryData.approvedOtHours || 0} Hrs</b></div>
          </div>

          {/* Dual Table: Earnings vs Deductions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
            
            {/* EARNINGS */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ background: '#0f172a', color: '#ffffff', padding: '8px 12px', fontWeight: '800', fontSize: '0.84rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Earnings (₹)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>Basic Salary</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>₹ {(salaryData.earnedBasic || 0).toLocaleString()}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>House Rent Allowance (HRA)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>₹ {(salaryData.earnedHra || 0).toLocaleString()}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>Other Allowance</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>₹ {(salaryData.earnedOther || 0).toLocaleString()}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>Dinner Allowance ({salaryData.nightShiftCount || 0} Nights)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>₹ {(salaryData.dinnerAllowance || 0).toLocaleString()}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9', background: salaryData.approvedOtHours > 0 ? '#f0fdf4' : 'transparent' }}>
                    <td style={{ padding: '8px 12px' }}>
                      Approved Overtime Pay ({salaryData.approvedOtHours || 0} hrs @ ₹{salaryData.otRatePerHr || 0}/hr)
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '800', color: '#059669' }}>
                      ₹ {(salaryData.earnedOtPay || 0).toLocaleString()}
                    </td>
                  </tr>
                  <tr style={{ background: '#f8fafc', fontWeight: '900', borderTop: '2px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 12px', color: '#0f172a' }}>TOTAL GROSS EARNINGS (A)</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0f172a', fontSize: '0.9rem' }}>
                      ₹ {(salaryData.totalGrossEarned || 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* DEDUCTIONS */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ background: '#0f172a', color: '#ffffff', padding: '8px 12px', fontWeight: '800', fontSize: '0.84rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Deductions & Recoveries (₹)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>Provident Fund (PF - 12%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>₹ {(salaryData.pfDeduction || 0).toLocaleString()}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>ESIC (0.75%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>₹ {(salaryData.esicDeduction || 0).toLocaleString()}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>Professional Tax (PT)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>₹ {(salaryData.ptDeduction || 0).toLocaleString()}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9', background: salaryData.totalAdvanceDeduction > 0 ? '#fff1f2' : 'transparent' }}>
                    <td style={{ padding: '8px 12px' }}>Salary Advance Installment (EMI)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '800', color: '#e11d48' }}>
                      ₹ {(salaryData.totalAdvanceDeduction || 0).toLocaleString()}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>Other / TDS Deductions</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '700' }}>₹ 0</td>
                  </tr>
                  <tr style={{ background: '#f8fafc', fontWeight: '900', borderTop: '2px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 12px', color: '#dc2626' }}>TOTAL DEDUCTIONS (B)</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626', fontSize: '0.9rem' }}>
                      ₹ {(salaryData.totalDeductions || 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* NET PAYABLE BOX */}
          <div style={{ background: '#0f172a', color: '#ffffff', padding: '16px 20px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>NET SALARY PAYABLE (A - B)</div>
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '2px' }}>
                Amount in Words: <b>{numberToWords(salaryData.netPayable || 0)}</b>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#38bdf8' }}>
                ₹ {(salaryData.netPayable || 0).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Signatures Section */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginTop: '30px', paddingTop: '16px', borderTop: '1px dashed #cbd5e1' }}>
            <div style={{ textAlign: 'center', width: '220px' }}>
              <div style={{ height: '45px' }}></div>
              <div style={{ borderTop: '1px solid #475569', paddingTop: '6px', fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>
                Employee Signature
              </div>
            </div>

            <div style={{ textAlign: 'center', width: '220px' }}>
              <div style={{ height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {signatureImage ? (
                  <img src={signatureImage} alt="Authorised Signature" style={{ maxHeight: '42px', maxWidth: '140px', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontFamily: 'cursive', fontSize: '1.1rem', color: '#0f172a' }}>Samyak Jain</span>
                )}
              </div>
              <div style={{ borderTop: '1px solid #475569', paddingTop: '6px', fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>
                For Samyak International Ltd<br/>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'normal' }}>(Authorised Signatory)</span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: '0.7rem', color: '#94a3b8', marginTop: '20px' }}>
            This is a computer-generated salary slip and does not require physical stamp when signed electronically.
          </div>
        </div>
      </div>
    </div>
  );
}
