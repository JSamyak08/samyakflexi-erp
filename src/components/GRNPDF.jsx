import React from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';

export default function GRNPDF({ grnData, onClose }) {
  if (!grnData) return null;

  const {
    grnNo = "GRN-2026-104",
    poNumber = "PO-2026-042",
    vendorName = "FlexiPoly Films Ltd",
    invoiceNo = "INV-FP-9904",
    receivedDate = new Date().toLocaleString(),
    filmType = "PET",
    micron = 12,
    widthMm = 1000,
    rollsReceived = 12,
    netWeightKg = 1850,
    batchNo = "BATCH-PET-991",
    status = "Approved",
    qcNotes = "Passed dyne level & gauge inspection.",
    inspectedBy = "Quality Inspector Ramesh Kumar",
    storeManager = "Store Mgr Dilip Joshi"
  } = grnData;

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal-toolbar no-print">
        <button className="btn-secondary" onClick={onClose}>
          <ArrowLeft size={16} /> Back to Inventory
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print Goods Receipt Note (GRN) PDF
        </button>
      </div>

      <div className="pdf-paper-container">
        <div className="printable-document">
          {/* Executive Letterhead Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <img src={COMPANY_DETAILS.logoUrl} alt="Samyak International Ltd" style={{ height: '54px', objectFit: 'contain' }} />
              <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '0.04em', color: '#0f172a', margin: 0, textTransform: 'uppercase' }}>
                  {COMPANY_DETAILS.name}
                </h1>
                <p style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569', margin: '2px 0 0 0' }}>
                  {COMPANY_DETAILS.tagline}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0 0' }}>
                  {COMPANY_DETAILS.address}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#475569', margin: '2px 0 0 0' }}>
                  GSTIN: <b>{COMPANY_DETAILS.gstin}</b> | Tel: {COMPANY_DETAILS.phones} | Email: {COMPANY_DETAILS.email}
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'right', borderLeft: '1px solid #cbd5e1', paddingLeft: '16px' }}>
              <div style={{ background: '#0f172a', color: '#ffffff', padding: '6px 12px', fontSize: '0.85rem', fontWeight: '800', letterSpacing: '0.05em', borderRadius: '4px', textTransform: 'uppercase' }}>
                GOODS RECEIPT NOTE (GRN)
              </div>
              <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#0f172a', margin: '8px 0 0 0' }}>
                GRN No: {grnNo}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0 0' }}>
                Date: {receivedDate}
              </p>
            </div>
          </div>

          <hr className="pdf-divider" />

          {/* Receipt Info Table */}
          <div className="pdf-section-title">INWARD MATERIAL DETAILS</div>
          <table className="pdf-grid-table">
            <tbody>
              <tr>
                <td className="pdf-label">Vendor Name:</td>
                <td className="pdf-value bold-text">{vendorName}</td>
                <td className="pdf-label">Ref PO Number:</td>
                <td className="pdf-value bold-text">{poNumber}</td>
              </tr>
              <tr>
                <td className="pdf-label">Vendor Invoice #:</td>
                <td className="pdf-value">{invoiceNo}</td>
                <td className="pdf-label">Manufacturer Batch / Heat #:</td>
                <td className="pdf-value highlight-text">{batchNo}</td>
              </tr>
              <tr>
                <td className="pdf-label">Inward Gate Entry Date/Time:</td>
                <td className="pdf-value">{receivedDate}</td>
                <td className="pdf-label">Received By:</td>
                <td className="pdf-value">{storeManager}</td>
              </tr>
            </tbody>
          </table>

          {/* Material Specifications */}
          <div className="pdf-section-title" style={{ marginTop: '20px' }}>SPECIFICATIONS & WEIGHT VERIFICATION</div>
          <table className="pdf-data-table">
            <thead>
              <tr>
                <th>Film Substrate</th>
                <th>Micron Gauge (µ)</th>
                <th>Slit Width (mm)</th>
                <th>Rolls / Coils Received</th>
                <th>Net Inward Weight (Kg)</th>
                <th>QC Inspection Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="bold-text">{filmType} Film</td>
                <td>{micron} µ</td>
                <td>{widthMm} mm</td>
                <td>{rollsReceived} Rolls</td>
                <td className="bold-text grand-total-qty">{netWeightKg.toLocaleString()} kg</td>
                <td>
                  <span style={{ 
                    color: status === 'Approved' ? '#059669' : status === 'Rejected' ? '#dc2626' : '#d97706',
                    fontWeight: 'bold',
                    textTransform: 'uppercase'
                  }}>
                    ● {status}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          {/* QC Inspection Section */}
          <div className="pdf-note-box" style={{ marginTop: '20px', borderLeftColor: status === 'Approved' ? '#059669' : '#d97706' }}>
            <h4 style={{ color: '#0f172a', marginBottom: '6px' }}>QUALITY CONTROL (QC) LABORATORY REPORT:</h4>
            <p style={{ fontSize: '0.85rem', color: '#334155', marginBottom: '4px' }}>
              <b>QC Remarks & Observations:</b> {qcNotes || 'Awaiting formal QC clearance.'}
            </p>
            <p style={{ fontSize: '0.85rem', color: '#334155' }}>
              <b>Inspected & Verified By:</b> {inspectedBy || 'Pending Inspection'}
            </p>
          </div>

          {/* Signatures */}
          <div className="pdf-signatures" style={{ marginTop: '40px' }}>
            <div className="sig-box">
              <p>Store Inward Manager</p>
              <div className="sig-line"></div>
              <span>Store Department</span>
            </div>
            <div className="sig-box">
              <p>Quality Chemist / Manager</p>
              <div className="sig-line"></div>
              <span>Quality Control Lab</span>
            </div>
            <div className="sig-box">
              <p>Factory Operations Manager</p>
              <div className="sig-line"></div>
              <span>Samyak International Ltd</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
