import React, { useState } from 'react';
import { Printer, ArrowLeft, Edit3, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import { getAuthorisedSignature, getCompanyLogo, generateDocRefNumber } from '../services/settingsService';

export const DEFAULT_COA_PARAMETERS = [
  { srNo: 1, parameter: "Total Thickness", uom: "Micron", standard: "50 ( ± 5 % )", observation: "45 TO 55" },
  { srNo: 2, parameter: "Average GSM", uom: "g/m²", standard: "64.5 ( ± 3 % )", observation: "62.6 - 66.4" },
  { srNo: 3, parameter: "Pouch Dim.", uom: "MM", standard: "700 x 500 ( +2mm -1 mm)", observation: "702 x 499" },
  { srNo: 4, parameter: "Printing Matter", uom: "—", standard: "As Per Art Work", observation: "OK" },
  { srNo: 5, parameter: "Shade", uom: "—", standard: "As Per Customer sample", observation: "OK" },
  { srNo: 6, parameter: "Direction", uom: "—", standard: "Readable", observation: "Readable" },
  { srNo: 7, parameter: "Diameter", uom: "MM", standard: "310 mm", observation: "310 mm" },
  { srNo: 8, parameter: "Tensile strength", uom: "Kg/sq.cm", standard: "MD - 250 | TD - 230", observation: "MD - 320.19 | TD - 295.41" },
  { srNo: 9, parameter: "Elongation", uom: "%", standard: "MD - 450 | TD - 550", observation: "MD - 495.13 | TD - 555.31" },
  { srNo: 10, parameter: "Surface Tension", uom: "Dynes/cm", standard: "40 - 42", observation: "40" },
  { srNo: 11, parameter: "Sealing Strength", uom: "Kgf/15mm", standard: "> 2.50", observation: "3.892" },
  { srNo: 12, parameter: "Bond Strength", uom: "Kgf/15mm", standard: "> 0.400", observation: "0.52" },
  { srNo: 13, parameter: "Kinetic coefficient of Friction ( outer to Metal )", uom: "unit", standard: "0.15 - 0.24", observation: "0.22" },
  { srNo: 14, parameter: "Winding", uom: "—", standard: "Strength Buildup", observation: "OK" },
  { srNo: 15, parameter: "Odor", uom: "—", standard: "Should Pass", observation: "Pass" },
  { srNo: 16, parameter: "Print Quality", uom: "—", standard: "Tecotap Test at 45° angle", observation: "Pass" },
  { srNo: 17, parameter: "Joints", uom: "Rolls", standard: "Average less than 1 (Max 2)", observation: "ONE" }
];

export default function CertificateOfAnalysisPDF({ coaData, onClose }) {
  if (!coaData) return null;

  const defaultCoaNo = coaData.coaNo || generateDocRefNumber('coa');
  const [currentCoaNo, setCurrentCoaNo] = useState(defaultCoaNo);
  const [isEditingRef, setIsEditingRef] = useState(false);

  const [testRows, setTestRows] = useState(
    Array.isArray(coaData.parameters) && coaData.parameters.length > 0 
      ? coaData.parameters 
      : DEFAULT_COA_PARAMETERS
  );

  const signatureImage = getAuthorisedSignature();
  const logoImage = getCompanyLogo();

  const {
    testDate = new Date().toLocaleDateString('en-GB'),
    customerName = "Foodella Foods",
    jobName = "Foodella Reverse 7mm",
    invoiceNo = "SAM/25-26/00303",
    jobCode = "1",
    filmType = "natural Deep Freeze (80%)",
    netWeight = "365.08 kg",
    specification = "2 layer (12 PET + 50 Deep Freeze)",
    sizeMm = "700 mm",
    thicknessMicron = "50µ",
    batchLotNo = "BATCH-FD-2026-08",
    overallStatus = "PASSED & APPROVED",
    qcInspector = "Ramesh Kumar (Quality Engineer)",
    approvedByHead = "Samyak Jain (QA Head)",
    remarks = "Material tested strictly in Quality Control Laboratory and meets all agreed technical specifications. Approved for dispatch."
  } = coaData;

  const handleUpdateRow = (index, field, value) => {
    const updated = [...testRows];
    updated[index] = { ...updated[index], [field]: value };
    setTestRows(updated);
  };

  const handleAddRow = () => {
    const nextSr = testRows.length + 1;
    setTestRows(prev => [
      ...prev,
      { srNo: nextSr, parameter: "New Quality Parameter", uom: "—", standard: "As Specified", observation: "Conforms / OK" }
    ]);
  };

  const handleRemoveRow = (index) => {
    setTestRows(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal-toolbar no-print">
        <button className="btn-secondary" onClick={onClose}>
          <ArrowLeft size={16} /> Back to Dispatch Hub
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print Quality Test Report (CoA)
        </button>
      </div>

      <div className="pdf-paper-container">
        <div className="printable-document">
          {/* Header */}
          <div className="letterhead-header" style={{ marginBottom: '10px' }}>
            <div className="letterhead-brand">
              <img src={logoImage} alt="Samyak International Ltd Logo" className="samyak-logo-img" style={{ height: '44px', objectFit: 'contain' }} />
              <p className="letterhead-company-sub" style={{ marginTop: '2px', fontSize: '8.5px', fontWeight: '800', color: '#374151' }}>
                BSE: SAMYAKINT • CIN: L67120MH1994PLC225907 • GSTIN: {COMPANY_DETAILS.gstin}
              </p>
            </div>

            <div className="letterhead-doc-title">
              <h2 style={{ fontSize: '18px', color: '#0f172a' }}>FINAL QUALITY TEST REPORT</h2>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#0284c7' }}>CERTIFICATE OF ANALYSIS (CoA)</div>
              <div className="doc-ref-no" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginTop: '2px' }}>
                {isEditingRef ? (
                  <input
                    type="text"
                    value={currentCoaNo}
                    onChange={(e) => setCurrentCoaNo(e.target.value)}
                    onBlur={() => setIsEditingRef(false)}
                    autoFocus
                    style={{ fontSize: '12px', fontWeight: 'bold', border: '1px solid #2563eb', padding: '2px 6px', borderRadius: '4px', textAlign: 'right' }}
                  />
                ) : (
                  <span 
                    onClick={() => setIsEditingRef(true)}
                    title="Click to edit reference number"
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                  >
                    Report Ref #: {currentCoaNo}
                    <Edit3 size={11} className="no-print" style={{ opacity: 0.6, color: '#2563eb' }} />
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Plant Address Bar */}
          <div style={{ fontSize: '9px', color: '#475569', textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '4px', marginBottom: '8px', fontWeight: '600' }}>
            QC Testing Lab: {COMPANY_DETAILS.address} • Phone: {COMPANY_DETAILS.phones} • Email: {COMPANY_DETAILS.email}
          </div>

          {/* Specification Header Block (Matching attached format image exactly) */}
          <table className="details-grid-table" style={{ border: '1.5px solid #000', marginBottom: '10px' }}>
            <tbody>
              <tr>
                <td className="label-col" style={{ width: '18%', fontWeight: 'bold', background: '#f8fafc' }}>Date :</td>
                <td className="value-col" style={{ width: '32%', fontWeight: 'bold' }}>{testDate}</td>
                <td className="label-col" style={{ width: '18%', fontWeight: 'bold', background: '#f8fafc' }}>Report Ref No :</td>
                <td className="value-col" style={{ width: '32%', fontWeight: 'bold', color: '#0284c7' }}>{currentCoaNo}</td>
              </tr>
              <tr>
                <td className="label-col" style={{ fontWeight: 'bold', background: '#f8fafc' }}>Customer Name :</td>
                <td className="value-col" colSpan={3} style={{ fontWeight: 'bold', fontSize: '12px' }}>{customerName}</td>
              </tr>
              <tr>
                <td className="label-col" style={{ fontWeight: 'bold', background: '#f8fafc' }}>Job Name :</td>
                <td className="value-col" colSpan={3} style={{ fontWeight: 'bold', fontSize: '12px', color: '#1e293b' }}>{jobName}</td>
              </tr>
              <tr>
                <td className="label-col" style={{ fontWeight: 'bold', background: '#f8fafc' }}>Invoice number :</td>
                <td className="value-col" style={{ fontWeight: 'bold' }}>{invoiceNo}</td>
                <td className="label-col" style={{ fontWeight: 'bold', background: '#f8fafc' }}>Job Code :</td>
                <td className="value-col" style={{ fontWeight: 'bold' }}>{jobCode}</td>
              </tr>
              <tr>
                <td className="label-col" style={{ fontWeight: 'bold', background: '#f8fafc' }}>FILM TYPE :</td>
                <td className="value-col" style={{ fontWeight: 'bold' }}>{filmType}</td>
                <td className="label-col" style={{ fontWeight: 'bold', background: '#f8fafc' }}>NET WEIGHT :</td>
                <td className="value-col" style={{ fontWeight: 'bold' }}>{netWeight}</td>
              </tr>
              <tr>
                <td className="label-col" style={{ fontWeight: 'bold', background: '#f8fafc' }}>Specification :</td>
                <td className="value-col" style={{ fontWeight: 'bold' }}>{specification}</td>
                <td className="label-col" style={{ fontWeight: 'bold', background: '#f8fafc' }}>Size & Thickness :</td>
                <td className="value-col" style={{ fontWeight: 'bold' }}>
                  Size: {sizeMm} | Thickness: {thicknessMicron}
                </td>
              </tr>
              {batchLotNo && (
                <tr>
                  <td className="label-col" style={{ fontWeight: 'bold', background: '#f8fafc' }}>Batch / Lot Ref :</td>
                  <td className="value-col" style={{ fontWeight: 'bold' }}>{batchLotNo}</td>
                  <td className="label-col" style={{ fontWeight: 'bold', background: '#f8fafc' }}>Overall Disposition :</td>
                  <td className="value-col" style={{ fontWeight: 'bold', color: '#047857' }}>
                    <span style={{ background: '#dcfce7', border: '1px solid #86efac', padding: '1px 8px', borderRadius: '4px' }}>
                      ✓ {overallStatus}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Test Parameters Table (Exact structure matching attached image) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ fontSize: '10px', fontWeight: '900', color: '#0f172a', textTransform: 'uppercase' }}>
              LABORATORY TEST PARAMETERS & MEASURED OBSERVATIONS
            </div>
            <button
              type="button"
              className="btn-secondary no-print"
              style={{ padding: '2px 8px', fontSize: '10px' }}
              onClick={handleAddRow}
            >
              <Plus size={10} /> Add Test Parameter
            </button>
          </div>

          <table className="items-table" style={{ border: '1.5px solid #000' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ width: '6%', textAlign: 'center', border: '1px solid #000' }}>Sr. No.</th>
                <th style={{ width: '38%', border: '1px solid #000' }}>Parameter</th>
                <th style={{ width: '18%', textAlign: 'center', border: '1px solid #000' }}>Unit Of Measure</th>
                <th style={{ width: '20%', textAlign: 'center', border: '1px solid #000' }}>Standard</th>
                <th style={{ width: '18%', textAlign: 'center', border: '1px solid #000' }}>Observation</th>
              </tr>
            </thead>
            <tbody>
              {testRows.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ textAlign: 'center', fontWeight: 'bold', border: '1px solid #000' }}>
                    {idx + 1}
                  </td>
                  <td style={{ border: '1px solid #000' }}>
                    <input
                      type="text"
                      className="terms-input-inline"
                      value={row.parameter}
                      onChange={(e) => handleUpdateRow(idx, 'parameter', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', fontWeight: 'bold', fontSize: '10.5px' }}
                    />
                  </td>
                  <td style={{ textAlign: 'center', border: '1px solid #000' }}>
                    <input
                      type="text"
                      className="terms-input-inline"
                      value={row.uom || ''}
                      onChange={(e) => handleUpdateRow(idx, 'uom', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'center', fontSize: '10.5px' }}
                    />
                  </td>
                  <td style={{ textAlign: 'center', border: '1px solid #000', fontWeight: '500' }}>
                    <input
                      type="text"
                      className="terms-input-inline"
                      value={row.standard || ''}
                      onChange={(e) => handleUpdateRow(idx, 'standard', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'center', fontSize: '10.5px' }}
                    />
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#047857', border: '1px solid #000', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <input
                        type="text"
                        className="terms-input-inline"
                        value={row.observation || ''}
                        onChange={(e) => handleUpdateRow(idx, 'observation', e.target.value)}
                        style={{ width: '90%', border: 'none', background: 'transparent', textAlign: 'center', fontWeight: 'bold', color: '#047857', fontSize: '10.5px' }}
                      />
                      <button
                        type="button"
                        className="no-print"
                        onClick={() => handleRemoveRow(idx)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                        title="Remove row"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Remarks Section */}
          <div style={{ border: '1.5px solid #000', marginTop: '10px', padding: '8px 12px', background: '#fafafa' }}>
            <div style={{ fontSize: '10px', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', marginBottom: '2px' }}>
              Remarks / QC Disposition Statement:
            </div>
            <div style={{ fontSize: '10.5px', color: '#334155', fontWeight: '500', lineHeight: '1.4' }}>
              {remarks}
            </div>
          </div>

          {/* Dual QC Laboratory Signatures */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '18px' }}>
            {/* Prepared By / Chemist */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 14px', background: '#ffffff' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '6px' }}>
                PREPARED BY / QUALITY CONTROL CHEMIST
              </div>
              <div style={{ height: '35px', display: 'flex', alignItems: 'center', color: '#0284c7', fontStyle: 'italic', fontWeight: 'bold', fontSize: '11px' }}>
                ✓ QC Verified & Logged
              </div>
              <div style={{ borderTop: '1px dashed #94a3b8', paddingTop: '3px', fontSize: '9.5px', fontWeight: 'bold', color: '#1e293b' }}>
                {qcInspector}
              </div>
              <div style={{ fontSize: '8.5px', color: '#64748b' }}>Samyak QC Testing Laboratory</div>
            </div>

            {/* Approved By / QA Manager */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 14px', background: '#ffffff' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '6px' }}>
                APPROVED BY / QUALITY ASSURANCE HEAD
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  {signatureImage ? (
                    <img src={signatureImage} alt="QA Head Signature" style={{ height: '36px', objectFit: 'contain', display: 'block', marginBottom: '2px' }} />
                  ) : (
                    <div style={{ height: '35px', fontStyle: 'italic', fontSize: '11px', color: '#047857', fontWeight: 'bold' }}>
                      Approved & Signed
                    </div>
                  )}
                  <div style={{ borderTop: '1px dashed #94a3b8', width: '150px', paddingTop: '3px', fontSize: '9.5px', fontWeight: 'bold', color: '#1e293b' }}>
                    {approvedByHead}
                  </div>
                  <div style={{ fontSize: '8.5px', color: '#64748b' }}>Head of Quality Assurance & Standards</div>
                </div>

                <div style={{ border: '1px solid #86efac', background: '#f0fdf4', borderRadius: '4px', width: '80px', height: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3px', textAlign: 'center' }}>
                  <CheckCircle2 size={14} style={{ color: '#16a34a' }} />
                  <div style={{ fontSize: '7.5px', fontWeight: '900', color: '#15803d', marginTop: '1px' }}>SAMYAK QA</div>
                  <div style={{ fontSize: '6.5px', color: '#166534' }}>CERTIFIED OK</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
