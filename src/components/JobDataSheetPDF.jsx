import React from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import { formatINR } from '../utils/pdfHelpers';
import { getAuthorisedSignature } from '../services/settingsService';

export default function JobDataSheetPDF({ sheetData, onClose }) {
  if (!sheetData) return null;

  const signatureImage = getAuthorisedSignature();

  const {
    id = `SIL/JDS/26-27/${Math.floor(100 + Math.random() * 900)}`,
    jobId = "ORD-991",
    jobName = "Britannia Bourbon 250g",
    clientName = "Britannia Industries Ltd",
    completionDate = new Date().toLocaleDateString('en-IN'),
    sellingPricePerKg = 245,
    preCostPerKg = 185.50,
    postCostPerKg = 189.20,
    profitMarginPct = 22.8,
    actualInkConsumedKg = 52,
    actualSolventsConsumedKg = 18.5,
    actualAdhesiveConsumedKg = 46.5,
    actualScrapWastageKg = 125,
    operatorNotes = "Smooth production run."
  } = sheetData;

  const preTotalCost = (preCostPerKg * 1000).toFixed(2);
  const postTotalCost = (postCostPerKg * 1000).toFixed(2);
  const variancePerKg = (postCostPerKg - preCostPerKg).toFixed(2);

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal-actions no-print">
        <button className="btn-secondary" onClick={onClose}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print / Export Job Data Sheet PDF
        </button>
      </div>

      <div className="pdf-page-wrapper">
        <div className="letterhead-container">
          
          {/* Header */}
          <div className="letterhead-header">
            <div className="letterhead-logo-column">
              <img src={COMPANY_DETAILS.logoUrl} alt="Samyak International Ltd" className="letterhead-logo-img" />
              <div className="letterhead-brand-title">{COMPANY_DETAILS.name}</div>
              <div className="letterhead-brand-tagline">{COMPANY_DETAILS.tagline}</div>
              <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#1e293b', marginTop: '2px' }}>
                GSTIN: {COMPANY_DETAILS.gstin}
              </div>
            </div>
            <div className="letterhead-contact-column">
              <div>{COMPANY_DETAILS.address}</div>
              <div>Email: {COMPANY_DETAILS.email}</div>
              <div>Phone: {COMPANY_DETAILS.phones}</div>
              <div>Factory: Kheda Industrial Area, Pithampur</div>
            </div>
          </div>

          {/* Document Title Banner */}
          <div className="letterhead-doc-title">
            JOB DATA SHEET & ACTUAL CONSUMPTION REPORT
          </div>

          {/* Details Section */}
          <div className="details-section-container">
            <div className="details-section-header">Sheet Details & Job Reference</div>
            <table className="details-grid-table">
              <tbody>
                <tr>
                  <td className="label-col">Sheet Ref No</td>
                  <td className="value-col">{id}</td>
                  <td className="label-col">Completion Date</td>
                  <td className="value-col">{completionDate}</td>
                </tr>
                <tr>
                  <td className="label-col">Job Name</td>
                  <td className="value-col" style={{ fontWeight: 'bold' }}>{jobName}</td>
                  <td className="label-col">Job Order ID</td>
                  <td className="value-col">{jobId}</td>
                </tr>
                <tr>
                  <td className="label-col">Client Name</td>
                  <td className="value-col">{clientName}</td>
                  <td className="label-col">Recorded By</td>
                  <td className="value-col">{sheetData.createdBy || 'Plant Manager'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Consumption & Pre vs Post Comparison Table */}
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px', color: '#1e293b' }}>
              Shop Floor Actual Material Consumption Summary
            </h4>
            <table className="letterhead-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>S.N.</th>
                  <th>Raw Material Category</th>
                  <th style={{ textAlign: 'right' }}>Actual Consumed Qty</th>
                  <th style={{ textAlign: 'right' }}>Target Budget Qty</th>
                  <th style={{ textAlign: 'right' }}>Variance / Remarks</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ textAlign: 'center' }}>1</td>
                  <td style={{ fontWeight: 'bold' }}>Printing Inks (Rotogravure)</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{actualInkConsumedKg} kg</td>
                  <td style={{ textAlign: 'right' }}>50.0 kg</td>
                  <td style={{ textAlign: 'right', color: actualInkConsumedKg > 50 ? '#dc2626' : '#059669' }}>
                    {actualInkConsumedKg > 50 ? `+${(actualInkConsumedKg - 50).toFixed(1)} kg` : 'Within Budget'}
                  </td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'center' }}>2</td>
                  <td style={{ fontWeight: 'bold' }}>Dilution Solvents (Ethyl Acetate)</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{actualSolventsConsumedKg} kg</td>
                  <td style={{ textAlign: 'right' }}>20.0 kg</td>
                  <td style={{ textAlign: 'right', color: '#059669' }}>Within Budget</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'center' }}>3</td>
                  <td style={{ fontWeight: 'bold' }}>Lamination Adhesive System</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{actualAdhesiveConsumedKg} kg</td>
                  <td style={{ textAlign: 'right' }}>45.0 kg</td>
                  <td style={{ textAlign: 'right', color: '#059669' }}>Within Budget</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'center' }}>4</td>
                  <td style={{ fontWeight: 'bold' }}>Process Scrap / Trimming Wastage</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#dc2626' }}>{actualScrapWastageKg} kg</td>
                  <td style={{ textAlign: 'right' }}>110.0 kg</td>
                  <td style={{ textAlign: 'right', color: '#dc2626' }}>+15.0 kg Scrap</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Financial Profitability & Costing Comparison */}
          <div style={{ marginTop: '16px', background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
            <h4 style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px', color: '#1e293b' }}>
              Pre vs Post Costing & Profitability Variance
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '10px' }}>
              <div style={{ background: '#ffffff', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <span style={{ color: '#64748b', display: 'block' }}>Selling Price / kg</span>
                <strong style={{ fontSize: '12px', color: '#1e293b' }}>{formatINR(sellingPricePerKg)}</strong>
              </div>
              <div style={{ background: '#ffffff', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <span style={{ color: '#64748b', display: 'block' }}>Target Pre-Cost / kg</span>
                <strong style={{ fontSize: '12px', color: '#2563eb' }}>{formatINR(preCostPerKg)}</strong>
              </div>
              <div style={{ background: '#ffffff', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <span style={{ color: '#64748b', display: 'block' }}>Actual Post-Cost / kg</span>
                <strong style={{ fontSize: '12px', color: postCostPerKg > preCostPerKg ? '#dc2626' : '#059669' }}>
                  {formatINR(postCostPerKg)}
                </strong>
              </div>
              <div style={{ background: '#ffffff', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <span style={{ color: '#64748b', display: 'block' }}>Actual Profit Margin</span>
                <strong style={{ fontSize: '12px', color: '#059669' }}>{profitMarginPct}%</strong>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="letterhead-terms-box" style={{ marginTop: '16px' }}>
            <h4 style={{ margin: 0 }}>Plant Manager & Operator Observations:</h4>
            <p style={{ fontSize: '9.5px', color: '#334155', margin: '4px 0 0 0' }}>
              {operatorNotes}
            </p>
          </div>

          {/* Authorised Signatory */}
          <div className="letterhead-signatory-block" style={{ marginTop: '24px' }}>
            <div style={{ fontWeight: 'bold' }}>For {COMPANY_DETAILS.name}</div>
            <div style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {signatureImage ? (
                <img src={signatureImage} alt="Authorised Signature" style={{ maxHeight: '38px', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontStyle: 'italic', fontFamily: 'serif', fontSize: '18px', fontWeight: 'bold' }}>Sy</span>
              )}
            </div>
            <div style={{ fontSize: '9px', fontWeight: 'bold' }}>Authorised Signatory</div>
          </div>

        </div>
      </div>
    </div>
  );
}
