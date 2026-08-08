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

  const isSFG = roll.rollType === 'SFG_PRINTED' || roll.rollType === 'SFG_LAMINATED' || roll.rollType === 'SFG';
  const isFG = roll.rollType === 'FG_DISPATCH' || roll.rollType === 'FG';

  const nonFilmCategories = [
    'Doctor Blades',
    'Doctor Blades & Wipers',
    'Inks & Solvents',
    'Printing Inks & Toners',
    'Chemicals & Solvents',
    'Adhesives & Hardener',
    'Rollers & Sleeves',
    'Machine Spare Parts',
    'Lubricants & Oils',
    'Tapes & Consumables',
    'Safety Gear (PPE)',
    'General Store',
    'CONSUMABLE_ITEM'
  ];

  const isExplicitNonFilm = nonFilmCategories.includes(roll.category) || 
    (roll.unit && !['kg', 'Kg', 'KG'].includes(String(roll.unit).trim())) ||
    roll.rollType === 'CONSUMABLE_ITEM';

  const isFilmItem = !isExplicitNonFilm && 
    (roll.rollType === 'RAW_MATERIAL' || roll.category === 'Film Substrates') && 
    roll.micron > 0 && 
    roll.widthMm > 0;

  const displayUnit = roll.unit || roll.uom || (isFilmItem ? 'kg' : 'Pcs');
  const displayQty = roll.netWeightKg ?? roll.availableWeightKg ?? roll.qty ?? 0;

  return (
    <div className="modal-overlay" style={{ zIndex: 120 }} onClick={onClose}>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-barcode-label, #printable-barcode-label * {
            visibility: visible !important;
          }
          #printable-barcode-label {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 4in !important;
            height: 4in !important;
            padding: 14px 16px !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: 2px solid #000 !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            border-radius: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
          }
          @page {
            size: 4in 4in;
            margin: 0;
          }
        }
      `}</style>
      <div 
        className="glass-card modal-content" 
        style={{ width: '560px', maxWidth: '95vw', padding: '24px' }} 
        onClick={e => e.stopPropagation()}
      >
        {/* Top Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag style={{ color: '#059669' }} /> Barcode Sticker Preview & Printer
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              4×4 Inch Thermal Sticker Format • Scale & Batch Data Captured
            </p>
          </div>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={onClose}>
            <X size={14} /> Close
          </button>
        </div>

        {/* Printable Barcode Label Card (4x4 Inch Square Format Box) */}
        <div 
          id="printable-barcode-label"
          style={{
            background: '#ffffff',
            border: '2px solid #0f172a',
            borderRadius: '8px',
            padding: '16px 18px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            fontFamily: 'Inter, sans-serif',
            color: '#0f172a'
          }}
        >
          {/* Label Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '8px' }}>
            <div>
              <div style={{ fontWeight: '900', fontSize: '1rem', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
                {COMPANY_DETAILS.name}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: '600', marginTop: '2px' }}>
                Indore Plant • GSTIN: {COMPANY_DETAILS.gstin}
              </div>
            </div>
            <span style={{ 
              fontSize: '0.72rem', 
              fontWeight: '800', 
              background: isSFG ? '#e0e7ff' : isFG ? '#fef3c7' : (isFilmItem ? '#dcfce7' : '#f0f9ff'),
              color: isSFG ? '#3730a3' : isFG ? '#92400e' : (isFilmItem ? '#166534' : '#1e40af'),
              padding: '3px 10px', 
              borderRadius: '4px',
              border: '1.5px solid currentColor'
            }}>
              {isSFG ? 'SEMI-FINISHED (SFG)' : isFG ? 'FINISHED GOODS (FG)' : (isFilmItem ? 'RAW MATERIAL (RM)' : 'STORE CONSUMABLE')}
            </span>
          </div>

          {/* Barcode SVG Visual */}
          <div style={{ textAlign: 'center', background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            {renderBarcodeSVG(roll.barcodeId)}
          </div>

          {/* Core Specs Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', fontSize: '0.85rem', background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <div>
              <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Item / Substrate</span>
              <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#0f172a', lineHeight: '1.2' }}>{roll.itemName}</div>
              {isFilmItem ? (
                <div style={{ fontSize: '0.78rem', color: '#334155', marginTop: '3px' }}>
                  Gauge: <strong>{roll.micron}µ</strong> | Width: <strong>{roll.widthMm}mm</strong>
                </div>
              ) : (
                <div style={{ fontSize: '0.78rem', color: '#334155', marginTop: '3px' }}>
                  Category: <strong>{roll.category || 'Stock Item'}</strong> {roll.totalUnits > 1 ? `| Unit ${roll.unitNo || 1} of ${roll.totalUnits}` : ''}
                </div>
              )}
            </div>

            <div style={{ textAlign: 'right', borderLeft: '1.5px solid #cbd5e1', paddingLeft: '10px' }}>
              <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {isFilmItem || isFG || isSFG ? 'Net Scale Weight' : 'Net Scale Weight / Qty'}
              </span>
              <div style={{ fontWeight: '900', fontSize: '1.35rem', color: '#047857', lineHeight: '1.1', marginTop: '2px' }}>
                {displayQty} <span style={{ fontSize: '0.8rem' }}>{displayUnit}</span>
              </div>
              {roll.grossWeightKg && (
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', marginTop: '2px' }}>
                  Gross: {roll.grossWeightKg} kg
                </div>
              )}
            </div>
          </div>

          {/* Traceability Metadata */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.78rem', color: '#1e293b', background: '#ffffff', padding: '8px 10px', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
            {roll.jobName && (
              <div>Job Name: <strong>{roll.jobName}</strong></div>
            )}
            {roll.clientName && (
              <div>Client: <strong>{roll.clientName}</strong></div>
            )}
            {roll.vendorName && (
              <div>Vendor: <strong>{roll.vendorName}</strong> {roll.invoiceNo ? `| Inv: ${roll.invoiceNo}` : ''}</div>
            )}
            {roll.batchNo && (
              <div>Batch / Heat #: <strong>{roll.batchNo}</strong></div>
            )}
            {roll.inputBarcodeIds && roll.inputBarcodeIds.length > 0 && (
              <div style={{ fontSize: '0.72rem', color: '#4f46e5', fontWeight: '600' }}>
                Input Roll Ref: {roll.inputBarcodeIds.join(', ')}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.7rem', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
              <span>Station: <strong>{roll.stationId || 'SCALE_1_INWARD'}</strong></span>
              <span>Date: <strong>{roll.inwardDatetime || roll.date || new Date().toLocaleString()}</strong></span>
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
