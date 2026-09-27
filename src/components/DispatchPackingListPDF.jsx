import React from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import { getCompanyLogo } from '../services/settingsService';
import { toTitleCase } from '../utils/pdfHelpers';

export default function DispatchPackingListPDF({ shipment, company, onClose }) {
  if (!shipment) return null;

  const handlePrint = () => {
    window.print();
  };

  const logoUrl = getCompanyLogo() || COMPANY_DETAILS.logoUrl || '/samyak-logo.png';
  const totalCore = shipment.items?.reduce((sum, item) => sum + (item.coreWeightKg !== undefined ? Number(item.coreWeightKg) : 4.5), 0) || 0;
  const totalNet = shipment.items?.reduce((sum, item) => sum + (Number(item.netWeightKg) || 0), 0) || Number(shipment.totalNetWeightKg) || 0;
  const totalGross = shipment.items?.reduce((sum, item) => sum + (Number(item.grossWeightKg) || 0), 0) || Number(shipment.totalGrossWeightKg) || 0;

  return (
    <div className="modal-overlay" style={{ zIndex: 3000, background: 'rgba(15, 23, 42, 0.75)' }}>
      <div className="modal-content" style={{ width: '920px', maxWidth: '95vw', background: '#f8fafc', padding: '24px' }}>
        
        {/* Action Header Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)' }}>
          <button className="btn-secondary" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={16} /> Back to Dispatch Management
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-primary" onClick={handlePrint} style={{ background: '#059669', borderColor: '#059669' }}>
              <Printer size={16} /> Print Dispatch Packing List PDF
            </button>
          </div>
        </div>

        {/* Printable A4 PDF Container */}
        <div 
          id="printable-packing-list"
          className="printable-document"
          style={{
            background: '#ffffff',
            padding: '32px 36px',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            border: '1px solid #cbd5e1',
            fontFamily: 'Inter, sans-serif',
            color: '#0f172a'
          }}
        >
          {/* Header Block with Company Logo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '16px' }}>
            <div>
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt={COMPANY_DETAILS.name} 
                  style={{ maxHeight: '60px', maxWidth: '280px', objectFit: 'contain', marginBottom: '6px', display: 'block' }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.style.display = 'none';
                  }}
                />
              ) : (
                <h1 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0f172a', margin: 0, tracking: '-0.02em' }}>
                  {COMPANY_DETAILS.name}
                </h1>
              )}
              <p style={{ fontSize: '0.78rem', color: '#475569', margin: '3px 0 0 0', fontWeight: '500' }}>
                {COMPANY_DETAILS.address}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0 0' }}>
                GSTIN: <strong>{COMPANY_DETAILS.gstin}</strong> | CIN: {COMPANY_DETAILS.tagline?.split(' • ')[1] || COMPANY_DETAILS.tagline} | Phone: {COMPANY_DETAILS.phones}
              </p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ background: '#0f172a', color: '#ffffff', padding: '5px 12px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                DISPATCH PACKING LIST
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#2563eb', marginTop: '6px' }}>
                {shipment.dispatchId}
              </div>
              {shipment.invoiceNo && (
                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>
                  Invoice No: <span style={{ color: '#2563eb' }}>{shipment.invoiceNo}</span>
                </div>
              )}
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                Date & Time: <strong>{shipment.dispatchDate || shipment.createdAt || new Date().toLocaleString()}</strong>
              </div>
            </div>
          </div>

          {/* Consignee & Logistics Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '14px', fontSize: '0.82rem' }}>
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Consignee / Customer Details</span>
              <div style={{ fontWeight: '800', fontSize: '1rem', color: '#0f172a', marginTop: '2px' }}>
                {toTitleCase(shipment.clientName)}
              </div>
              {shipment.orderId && (
                <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '3px' }}>Order Ref: <strong>{shipment.orderId}</strong></div>
              )}
              {shipment.poNo && (
                <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '2px' }}>Customer PO #: <strong>{shipment.poNo}</strong></div>
              )}
            </div>

            <div style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: '16px' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Transport & Logistics Info</span>
              <div style={{ color: '#334155', marginTop: '3px' }}>
                Vehicle Number: <strong>{shipment.vehicleNo || '-'}</strong>
              </div>
              <div style={{ color: '#334155', marginTop: '2px' }}>
                LR / Lorry Receipt No: <strong>{shipment.lrNo || '-'}</strong>
              </div>
              <div style={{ color: '#334155', marginTop: '2px' }}>
                Weighing Scale Station: <strong>Scale #4 (Dispatch Section)</strong>
              </div>
            </div>
          </div>

          {/* Job Name Centered Banner in the Middle of Packing List */}
          <div style={{
            textAlign: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#ffffff',
            padding: '8px 14px',
            borderRadius: '6px',
            marginBottom: '14px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
          }}>
            <span style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>
              JOB NAME / PRODUCT SPECIFICATION
            </span>
            <span style={{ fontSize: '1.2rem', fontWeight: '900', letterSpacing: '0.02em', color: '#ffffff' }}>
              {toTitleCase(shipment.jobName)}
            </span>
          </div>

          {/* Itemized Barcode Roll Table (Compact / Thinner Rows to accommodate more items per page) */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', lineHeight: '1.25', marginBottom: '16px' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#ffffff' }}>
                <th style={{ padding: '5px 8px', textAlign: 'center', border: '1px solid #0f172a', width: '50px', fontSize: '0.72rem' }}>#</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', border: '1px solid #0f172a', fontSize: '0.72rem' }}>Barcode ID</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', border: '1px solid #0f172a', fontSize: '0.72rem' }}>Substrate / Specification</th>
                <th style={{ padding: '5px 8px', textAlign: 'center', border: '1px solid #0f172a', width: '95px', fontSize: '0.72rem' }}>Core/Pkg Wt (Tare)</th>
                <th style={{ padding: '5px 8px', textAlign: 'right', border: '1px solid #0f172a', width: '95px', fontSize: '0.72rem' }}>Gross Weight (Kg)</th>
                <th style={{ padding: '5px 8px', textAlign: 'right', border: '1px solid #0f172a', width: '100px', fontSize: '0.72rem' }}>Net Qty / Weight</th>
                <th style={{ padding: '5px 8px', textAlign: 'center', border: '1px solid #0f172a', width: '105px', fontSize: '0.72rem' }}>Confirm Loading</th>
              </tr>
            </thead>
            <tbody>
              {shipment.items?.map((item, idx) => {
                const shortSubstrate = item.substrateSpec || 'Laminated Film / Pouch';
                const tareWt = item.tareWeightKg !== undefined ? Number(item.tareWeightKg) : (item.coreWeightKg !== undefined ? Number(item.coreWeightKg) : 0);
                const netWt = Number(item.netWeightKg || 0);
                const grossWt = Number(item.grossWeightKg || (netWt + tareWt));
                const itemUnit = item.unit || 'Kg';

                return (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '4px 8px', textAlign: 'center', border: '1px solid #e2e8f0', fontWeight: '700' }}>
                      {item.rollNo || idx + 1}
                    </td>
                    <td style={{ padding: '4px 8px', border: '1px solid #e2e8f0', fontFamily: 'monospace', fontWeight: '800', color: '#2563eb' }}>
                      {item.barcodeId}
                    </td>
                    <td style={{ padding: '4px 8px', border: '1px solid #e2e8f0', color: '#334155' }}>
                      {shortSubstrate}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'center', border: '1px solid #e2e8f0', color: '#475569' }}>
                      {tareWt.toFixed(1)} kg {item.coreSize ? `(${item.coreSize})` : ''}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #e2e8f0', fontWeight: '700', color: '#1e293b' }}>
                      {grossWt.toFixed(1)}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', border: '1px solid #e2e8f0', fontWeight: '800', color: '#047857' }}>
                      {netWt.toFixed(1)} {itemUnit}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'inline-block', width: '14px', height: '14px', border: '1.5px solid #475569', borderRadius: '3px', background: '#ffffff' }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f1f5f9', fontWeight: '800', fontSize: '0.78rem' }}>
                <td colSpan="3" style={{ padding: '5px 8px', textAlign: 'right', border: '1px solid #cbd5e1' }}>
                  TOTAL SHIPMENT ({shipment.items?.length || shipment.totalRolls || 1} ROLLS):
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#475569' }}>
                  {totalCore.toFixed(1)} Kg
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', border: '1px solid #cbd5e1', color: '#1e293b' }}>
                  {totalGross.toFixed(1)} Kg
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', border: '1px solid #cbd5e1', color: '#047857' }}>
                  {totalNet.toFixed(1)} Kg
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#64748b', fontSize: '0.7rem' }}>
                  [ ] Verified
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures & Footer */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '30px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', fontSize: '0.78rem', textAlign: 'center' }}>
            <div>
              <div style={{ height: '30px' }} />
              <div style={{ borderTop: '1px solid #0f172a', paddingTop: '4px', fontWeight: '700' }}>
                Plant Manager / HOD Signature
              </div>
            </div>

            <div>
              <div style={{ height: '30px' }} />
              <div style={{ borderTop: '1px solid #0f172a', paddingTop: '4px', fontWeight: '700' }}>
                Verified By (QC Inspector)
              </div>
            </div>

            <div>
              <div style={{ height: '30px' }} />
              <div style={{ borderTop: '1px solid #0f172a', paddingTop: '4px', fontWeight: '700' }}>
                Received By (Driver / Customer)
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
