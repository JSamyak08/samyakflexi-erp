import React, { useState } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';

export default function OrderConfirmationPDF({ calculationData, onClose }) {
  const [docRef] = useState(() => `OCN-2026-${Math.floor(100000 + (Date.now() % 900000))}`);

  if (!calculationData) return null;

  const {
    jobName,
    printWidthMm,
    repeatLengthMm,
    orderQtyKg,
    orderType,
    wastagePct,
    totalLaminateGsm,
    totalAreaSqm,
    layerResults = [],
    inkDetails = {},
    adhesiveDetails = {},
    summary = {}
  } = calculationData;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal-toolbar no-print">
        <button className="btn-secondary" onClick={onClose}>
          <ArrowLeft size={16} /> Back to Job Form
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-primary" onClick={handlePrint}>
            <Printer size={16} /> Print / Save as PDF
          </button>
        </div>
      </div>

      <div className="pdf-paper-container">
        {/* Printable Order Confirmation Note Document */}
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
                ORDER CONFIRMATION NOTE
              </div>
              <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#0f172a', margin: '8px 0 0 0' }}>
                Ref: {docRef}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0 0' }}>
                Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>

          <hr className="pdf-divider" />

          {/* Job Specifications Summary */}
          <div className="pdf-section-title">1. JOB & ORDER SPECIFICATIONS</div>
          <table className="pdf-grid-table">
            <tbody>
              <tr>
                <td className="pdf-label">Job Name:</td>
                <td className="pdf-value bold-text">{jobName}</td>
                <td className="pdf-label">Order Type:</td>
                <td className="pdf-value">{orderType} Form</td>
              </tr>
              <tr>
                <td className="pdf-label">Print Size (Width x Repeat):</td>
                <td className="pdf-value">{printWidthMm} mm  ×  {repeatLengthMm} mm</td>
                <td className="pdf-label">Order Quantity:</td>
                <td className="pdf-value bold-text">{orderQtyKg.toLocaleString()} Kg</td>
              </tr>
              <tr>
                <td className="pdf-label">Total Laminate GSM:</td>
                <td className="pdf-value">{totalLaminateGsm} g/m²</td>
                <td className="pdf-label">Total Surface Area:</td>
                <td className="pdf-value">{totalAreaSqm.toLocaleString()} m²</td>
              </tr>
              <tr>
                <td className="pdf-label">Wastage Allowed:</td>
                <td className="pdf-value highlight-text">{wastagePct}% ({orderQtyKg >= 2000 ? '≥2 MT Order' : orderQtyKg >= 1000 ? '1–2 MT Order' : orderType === 'Pouching' ? 'Pouching ≤500kg' : 'Reel ≤500kg'})</td>
                <td className="pdf-label">Calculated Rate / Kg:</td>
                <td className="pdf-value bold-text">₹{summary.costPerKg} / kg</td>
              </tr>
            </tbody>
          </table>

          {/* Layer Breakdown Table */}
          <div className="pdf-section-title" style={{ marginTop: '20px' }}>2. SUBSTRATE LAYERS & RAW MATERIAL REQUIREMENT</div>
          <table className="pdf-data-table">
            <thead>
              <tr>
                <th>Layer</th>
                <th>Film Substrate</th>
                <th>Micron (µ)</th>
                <th>Density (g/cm³)</th>
                <th>Layer GSM</th>
                <th>Net Req. (Kg)</th>
                <th>Wastage (%)</th>
                <th>Gross Req. (Kg)</th>
                <th>Rate / Kg</th>
                <th>Estimated Cost</th>
              </tr>
            </thead>
            <tbody>
              {layerResults.map((layer, index) => (
                <tr key={index}>
                  <td>Layer {index + 1}</td>
                  <td className="bold-text">{layer.filmType}</td>
                  <td>{layer.micron} µ</td>
                  <td>{layer.density}</td>
                  <td>{layer.gsm.toFixed(2)}</td>
                  <td>{layer.netKg} kg</td>
                  <td>{wastagePct}%</td>
                  <td className="bold-text highlight-col">{layer.grossKg} kg</td>
                  <td>₹{layer.pricePerKg}</td>
                  <td>₹{layer.totalCost.toLocaleString()}</td>
                </tr>
              ))}
              {/* Ink Row */}
              <tr>
                <td>Processing</td>
                <td className="bold-text">Liquid Inks (incl. Solvents - +20% wt gain)</td>
                <td>-</td>
                <td>-</td>
                <td>{inkDetails.gsm} gsm</td>
                <td>{inkDetails.netKg} kg</td>
                <td>{wastagePct}%</td>
                <td className="bold-text highlight-col">{inkDetails.grossKg} kg</td>
                <td>₹{inkDetails.pricePerKg}</td>
                <td>₹{inkDetails.totalCost?.toLocaleString()}</td>
              </tr>
              {/* Adhesive Row */}
              <tr>
                <td>Lamination</td>
                <td className="bold-text">Solvent-less Adhesive (+100% wt gain)</td>
                <td>-</td>
                <td>-</td>
                <td>{adhesiveDetails.gsm} gsm</td>
                <td>{adhesiveDetails.netKg} kg</td>
                <td>{wastagePct}%</td>
                <td className="bold-text highlight-col">{adhesiveDetails.grossKg} kg</td>
                <td>₹{adhesiveDetails.pricePerKg}</td>
                <td>₹{adhesiveDetails.totalCost?.toLocaleString()}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="7" className="text-right bold-text">TOTAL RAW MATERIAL REQUIRED:</td>
                <td className="bold-text grand-total-qty">
                  {(summary.totalFilmGrossKg + (inkDetails.grossKg || 0) + (adhesiveDetails.grossKg || 0)).toFixed(2)} kg
                </td>
                <td className="text-right bold-text">TOTAL ESTIMATED COST:</td>
                <td className="bold-text grand-total-cost">
                  ₹{summary.totalRawMaterialCost?.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Raw Material Purchase Order Recommendation Note */}
          <div className="pdf-note-box">
            <h4 style={{ color: '#0f172a', marginBottom: '6px' }}>📌 STORE & PURCHASE DEPT INSTRUCTIONS:</h4>
            <p style={{ fontSize: '0.85rem', color: '#334155' }}>
              Please issue Purchase Orders (POs) immediately for the gross quantities specified above. Verify current available stock in store before releasing new POs to vendors.
            </p>
          </div>

          {/* Signatures */}
          <div className="pdf-signatures">
            <div className="sig-box">
              <p>Prepared By</p>
              <div className="sig-line"></div>
              <span>Costing & Job Punching Dept</span>
            </div>
            <div className="sig-box">
              <p>Verified By</p>
              <div className="sig-line"></div>
              <span>Store & Purchase Manager</span>
            </div>
            <div className="sig-box">
              <p>Approved By</p>
              <div className="sig-line"></div>
              <span>Factory Operations Manager</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
