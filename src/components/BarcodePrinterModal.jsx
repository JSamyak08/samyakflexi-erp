import React from 'react';
import { Printer, Check, X, Building2, Tag, Layers, Scale } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';

export default function BarcodePrinterModal({ roll, onClose }) {
  if (!roll) return null;

  const handlePrint = () => {
    window.print();
  };

  // Generate SVG Code128 Barcode Visual (Pure SVG Bars)
  const renderBarcodeSVG = (text) => {
    // Generate deterministic bar widths from string hash
    const str = text || 'BC-2026-0000';
    const bars = [];
    let x = 10;
    
    // Start Pattern
    bars.push(<rect key="start-1" x={x} y="5" width="2" height="45" fill="#000" />); x += 3;
    bars.push(<rect key="start-2" x={x} y="5" width="1" height="45" fill="#000" />); x += 2;
    bars.push(<rect key="start-3" x={x} y="5" width="3" height="45" fill="#000" />); x += 4;

    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      const width1 = (charCode % 3) + 1;
      const width2 = ((charCode * 2) % 3) + 1;
      const gap = (charCode % 2) + 1;

      bars.push(<rect key={`bar-${i}-1`} x={x} y="5" width={width1} height="45" fill="#000" />);
      x += width1 + gap;
      bars.push(<rect key={`bar-${i}-2`} x={x} y="5" width={width2} height="45" fill="#000" />);
      x += width2 + gap;
    }

    // Stop Pattern
    bars.push(<rect key="stop-1" x={x} y="5" width="3" height="45" fill="#000" />); x += 4;
    bars.push(<rect key="stop-2" x={x} y="5" width="1" height="45" fill="#000" />); x += 2;
    bars.push(<rect key="stop-3" x={x} y="5" width="2" height="45" fill="#000" />); x += 3;

    return (
      <svg width="100%" height="60" viewBox={`0 0 ${Math.max(x + 10, 260)} 65`}>
        {bars}
        <text x="50%" y="60" textAnchor="middle" fontSize="12" fontFamily="monospace" fontWeight="bold" fill="#000">
          {str}
        </text>
      </svg>
    );
  };

  const isSFG = roll.rollType === 'SFG_PRINTED' || roll.rollType === 'SFG_LAMINATED';
  const isFG = roll.rollType === 'FG_DISPATCH';

  return (
    <div className="modal-overlay" style={{ zIndex: 120 }} onClick={onClose}>
      <div 
        className="glass-card modal-content" 
        style={{ width: '540px', maxWidth: '95vw', padding: '24px' }} 
        onClick={e => e.stopPropagation()}
      >
        {/* Top Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag style={{ color: '#059669' }} /> Barcode Sticker Preview & Printer
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              4x2 Inch Thermal Sticker Format • Scale Net Weight Captured
            </p>
          </div>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={onClose}>
            <X size={14} /> Close
          </button>
        </div>

        {/* Printable Barcode Label Card (4x2 Inch Aspect Ratio Box) */}
        <div 
          id="printable-barcode-label"
          style={{
            background: '#ffffff',
            border: '2px solid #0f172a',
            borderRadius: '8px',
            padding: '16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            fontFamily: 'Inter, sans-serif',
            color: '#0f172a'
          }}
        >
          {/* Label Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1.5px solid #0f172a', paddingBottom: '6px' }}>
            <div>
              <div style={{ fontWeight: '900', fontSize: '0.95rem', letterSpacing: '-0.02em' }}>
                {COMPANY_DETAILS.name}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#475569', fontWeight: '600' }}>
                Indore Plant • GSTIN: {COMPANY_DETAILS.gstin}
              </div>
            </div>
            <span style={{ 
              fontSize: '0.7rem', 
              fontWeight: '800', 
              background: isSFG ? '#e0e7ff' : isFG ? '#fef3c7' : '#dcfce7',
              color: isSFG ? '#3730a3' : isFG ? '#92400e' : '#166534',
              padding: '2px 8px', 
              borderRadius: '4px',
              border: '1px solid currentColor'
            }}>
              {isSFG ? 'SEMI-FINISHED (SFG)' : isFG ? 'FINISHED GOODS (FG)' : 'RAW MATERIAL (RM)'}
            </span>
          </div>

          {/* Barcode SVG Visual */}
          <div style={{ textCenter: 'center', background: '#f8fafc', padding: '6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
            {renderBarcodeSVG(roll.barcodeId)}
          </div>

          {/* Core Specs Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', fontSize: '0.8rem', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div>
              <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Item / Substrate</span>
              <div style={{ fontWeight: '800', fontSize: '0.9rem', color: '#0f172a' }}>{roll.itemName}</div>
              {roll.micron > 0 && (
                <div style={{ fontSize: '0.75rem', color: '#334155', marginTop: '2px' }}>
                  Gauge: <strong>{roll.micron}µ</strong> | Width: <strong>{roll.widthMm}mm</strong>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'right', borderLeft: '1px solid #cbd5e1', paddingLeft: '8px' }}>
              <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Net Scale Weight</span>
              <div style={{ fontWeight: '900', fontSize: '1.2rem', color: '#047857' }}>
                {roll.netWeightKg} <span style={{ fontSize: '0.75rem' }}>kg</span>
              </div>
            </div>
          </div>

          {/* Traceability Metadata */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: '#334155' }}>
            {roll.jobName && (
              <div>Job Name: <strong>{roll.jobName}</strong></div>
            )}
            {roll.clientName && (
              <div>Client: <strong>{roll.clientName}</strong></div>
            )}
            {roll.vendorName && (
              <div>Vendor: <strong>{roll.vendorName}</strong> | Inv: <strong>{roll.invoiceNo || 'N/A'}</strong></div>
            )}
            {roll.batchNo && (
              <div>Batch / Heat #: <strong>{roll.batchNo}</strong></div>
            )}
            {roll.inputBarcodeIds && roll.inputBarcodeIds.length > 0 && (
              <div style={{ fontSize: '0.7rem', color: '#4f46e5', fontWeight: '600' }}>
                Input Roll Ref: {roll.inputBarcodeIds.join(', ')}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.68rem', color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: '4px' }}>
              <span>Station: <strong>{roll.stationId || 'SCALE_1_INWARD'}</strong></span>
              <span>Date: <strong>{roll.inwardDatetime || new Date().toLocaleString()}</strong></span>
            </div>
          </div>
        </div>

        {/* Footer Print Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handlePrint} style={{ background: '#059669', borderColor: '#059669' }}>
            <Printer size={16} /> Print Thermal Sticker
          </button>
        </div>
      </div>
    </div>
  );
}
