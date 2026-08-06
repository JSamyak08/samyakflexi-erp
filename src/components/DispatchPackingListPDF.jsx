import React from 'react';
import { Printer, Download, ArrowLeft, Building2, PackageCheck } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';

export default function DispatchPackingListPDF({ shipment, onClose }) {
  if (!shipment) return null;

  const handlePrint = () => {
    window.print();
  };

  const totalNet = shipment.items?.reduce((sum, item) => sum + (item.netWeightKg || 0), 0) || shipment.totalNetWeightKg || 0;
  const totalGross = shipment.items?.reduce((sum, item) => sum + (item.grossWeightKg || 0), 0) || shipment.totalGrossWeightKg || 0;

  return (
    <div className="modal-overlay" style={{ zIndex: 120, background: 'rgba(15, 23, 42, 0.75)' }}>
      <div className="modal-content" style={{ width: '900px', maxWidth: '95vw', background: '#f8fafc', padding: '24px' }}>
        
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
            padding: '36px 40px',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            border: '1px solid #cbd5e1',
            fontFamily: 'Inter, sans-serif',
            color: '#0f172a'
          }}
        >
          {/* Header Block */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0f172a', margin: 0, tracking: '-0.02em' }}>
                {COMPANY_DETAILS.name}
              </h1>
              <p style={{ fontSize: '0.8rem', color: '#475569', margin: '4px 0 0 0', fontWeight: '500' }}>
                {COMPANY_DETAILS.address}
              </p>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0 0' }}>
                GSTIN: <strong>{COMPANY_DETAILS.gstin}</strong> | CIN: {COMPANY_DETAILS.tagline.split(' • ')[1]} | Phone: {COMPANY_DETAILS.phones}
              </p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ background: '#0f172a', color: '#ffffff', padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                DISPATCH PACKING LIST
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#2563eb', marginTop: '8px' }}>
                {shipment.dispatchId}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                Date: {shipment.dispatchDate || new Date().toLocaleString()}
              </div>
            </div>
          </div>

          {/* Consignee & Vehicle Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: '#f8fafc', padding: '16px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px', fontSize: '0.85rem' }}>
            <div>
              <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Consignee / Customer Details</span>
              <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#0f172a', marginTop: '2px' }}>
                {shipment.clientName}
              </div>
              <div style={{ color: '#334155', marginTop: '4px' }}>
                Job Name: <strong>{shipment.jobName}</strong>
              </div>
              {shipment.orderId && (
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Order Ref: {shipment.orderId}</div>
              )}
            </div>

            <div style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: '20px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Transport & Logistics Info</span>
              <div style={{ color: '#334155', marginTop: '4px' }}>
                Vehicle Number: <strong>{shipment.vehicleNo || 'MP-09-XX-0000'}</strong>
              </div>
              <div style={{ color: '#334155', marginTop: '2px' }}>
                LR / Lorry Receipt No: <strong>{shipment.lrNo || 'LR-PENDING'}</strong>
              </div>
              <div style={{ color: '#334155', marginTop: '2px' }}>
                Weighing Scale Station: <strong>Scale #4 (Dispatch Section)</strong>
              </div>
            </div>
          </div>

          {/* Itemized Barcode Roll Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '24px' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#ffffff' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', border: '1px solid #0f172a' }}>Roll #</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', border: '1px solid #0f172a' }}>Barcode ID</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', border: '1px solid #0f172a' }}>Substrate Specification</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', border: '1px solid #0f172a' }}>Core Size</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #0f172a' }}>Net Weight (Kg)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #0f172a' }}>Gross Weight (Kg)</th>
              </tr>
            </thead>
            <tbody>
              {shipment.items?.map((item, idx) => (
                <tr key={idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                  <td style={{ padding: '10px 12px', textAlign: 'center', border: '1px solid #e2e8f0', fontWeight: '700' }}>
                    {item.rollNo || idx + 1}
                  </td>
                  <td style={{ padding: '10px 12px', border: '1px solid #e2e8f0', fontFamily: 'monospace', fontWeight: '700', color: '#2563eb' }}>
                    {item.barcodeId}
                  </td>
                  <td style={{ padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                    {item.substrateSpec || 'Laminated Film Reel'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                    {item.coreSize || '3 inch'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #e2e8f0', fontWeight: '700' }}>
                    {Number(item.netWeightKg || 0).toFixed(1)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', border: '1px solid #e2e8f0', fontWeight: '700' }}>
                    {Number(item.grossWeightKg || item.netWeightKg * 1.02 || 0).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f1f5f9', fontWeight: '800', fontSize: '0.9rem' }}>
                <td colSpan="4" style={{ padding: '12px', textAlign: 'right', border: '1px solid #cbd5e1' }}>
                  TOTAL SHIPMENT ({shipment.items?.length || shipment.totalRolls} ROLLS):
                </td>
                <td style={{ padding: '12px', textAlign: 'right', border: '1px solid #cbd5e1', color: '#047857' }}>
                  {totalNet.toFixed(1)} kg
                </td>
                <td style={{ padding: '12px', textAlign: 'right', border: '1px solid #cbd5e1', color: '#0f172a' }}>
                  {totalGross.toFixed(1)} kg
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures & Footer */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '48px', paddingTop: '16px', borderTop: '1px dashed #cbd5e1', fontSize: '0.8rem', textAlign: 'center' }}>
            <div>
              <div style={{ height: '40px' }} />
              <div style={{ borderTop: '1px solid #0f172a', paddingTop: '4px', fontWeight: '700' }}>
                Dispatched By (Store Manager)
              </div>
            </div>

            <div>
              <div style={{ height: '40px' }} />
              <div style={{ borderTop: '1px solid #0f172a', paddingTop: '4px', fontWeight: '700' }}>
                Verified By (QC Inspector)
              </div>
            </div>

            <div>
              <div style={{ height: '40px' }} />
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
