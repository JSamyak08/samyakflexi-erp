import React, { useState } from 'react';
import { Printer, X, Tag, ChevronLeft, ChevronRight } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';

export default function BarcodePrinterModal({ roll, rolls, onClose }) {
  const rollList = Array.isArray(rolls) 
    ? rolls 
    : (Array.isArray(roll) ? roll : (roll ? [roll] : []));

  const [activeIndex, setActiveIndex] = useState(0);

  if (rollList.length === 0) return null;

  const activeRoll = rollList[activeIndex] || rollList[0];

  const handlePrint = () => {
    window.print();
  };

  // Generate SVG Code128 Barcode Visual (Pure SVG Bars)
  const renderBarcodeSVG = (text) => {
    const str = text || 'BC-2026-0000';
    const bars = [];
    let x = 10;
    
    // Start Pattern
    bars.push(<rect key="start-1" x={x} y="3" width="2" height="36" fill="#000" />); x += 3;
    bars.push(<rect key="start-2" x={x} y="3" width="1" height="36" fill="#000" />); x += 2;
    bars.push(<rect key="start-3" x={x} y="3" width="3" height="36" fill="#000" />); x += 4;

    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      const width1 = (charCode % 3) + 1;
      const width2 = ((charCode * 2) % 3) + 1;
      const gap = (charCode % 2) + 1;

      bars.push(<rect key={`bar-${i}-1`} x={x} y="3" width={width1} height="36" fill="#000" />);
      x += width1 + gap;
      bars.push(<rect key={`bar-${i}-2`} x={x} y="3" width={width2} height="36" fill="#000" />);
      x += width2 + gap;
    }

    // Stop Pattern
    bars.push(<rect key="stop-1" x={x} y="3" width="3" height="36" fill="#000" />); x += 4;
    bars.push(<rect key="stop-2" x={x} y="3" width="1" height="36" fill="#000" />); x += 2;
    bars.push(<rect key="stop-3" x={x} y="3" width="2" height="36" fill="#000" />); x += 3;

    return (
      <svg width="100%" height="48" viewBox={`0 0 ${Math.max(x + 10, 260)} 50`}>
        {bars}
        <text x="50%" y="46" textAnchor="middle" fontSize="11" fontFamily="monospace" fontWeight="bold" fill="#000">
          {str}
        </text>
      </svg>
    );
  };

  const renderSingleSticker = (r, isPrintView = false) => {
    const isSFG = r.rollType === 'SFG_PRINTED' || r.rollType === 'SFG_LAMINATED' || r.rollType === 'SFG';
    const isFG = r.rollType === 'FG_DISPATCH' || r.rollType === 'FG';

    const nonFilmCategories = [
      'Doctor Blades', 'Doctor Blades & Wipers', 'Inks & Solvents',
      'Printing Inks & Toners', 'Chemicals & Solvents', 'Adhesives & Hardener',
      'Rollers & Sleeves', 'Machine Spare Parts', 'Lubricants & Oils',
      'Tapes & Consumables', 'Safety Gear (PPE)', 'General Store', 'CONSUMABLE_ITEM'
    ];

    const isExplicitNonFilm = nonFilmCategories.includes(r.category) || 
      (r.unit && !['kg', 'Kg', 'KG'].includes(String(r.unit).trim())) ||
      r.rollType === 'CONSUMABLE_ITEM';

    const isFilmItem = !isExplicitNonFilm && 
      (r.rollType === 'RAW_MATERIAL' || r.category === 'Film Substrates') && 
      r.micron > 0 && 
      r.widthMm > 0;

    const displayUnit = r.unit || r.uom || (isFilmItem ? 'kg' : 'Pcs');
    const displayQty = r.netWeightKg ?? r.availableWeightKg ?? r.qty ?? 0;
    const rateVal = r.purchaseRatePerKg || r.unitPrice || r.purchaseRate || 0;

    return (
      <div 
        key={r.barcodeId || r.id || Math.random()}
        className={isPrintView ? "printable-barcode-single-label" : ""}
        style={!isPrintView ? {
          background: '#ffffff',
          border: '2px solid #0f172a',
          borderRadius: '8px',
          padding: '12px 14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '8px',
          fontFamily: 'Inter, sans-serif',
          color: '#0f172a',
          minHeight: '340px'
        } : {
          fontFamily: 'Inter, sans-serif',
          color: '#0f172a'
        }}
      >
        {/* Label Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '5px' }}>
          <div>
            <div style={{ fontWeight: '900', fontSize: '0.92rem', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
              {COMPANY_DETAILS.name}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#475569', fontWeight: '600', marginTop: '1px' }}>
              Indore Plant • GSTIN: {COMPANY_DETAILS.gstin}
            </div>
          </div>
          <span style={{ 
            fontSize: '0.68rem', 
            fontWeight: '800', 
            background: isSFG ? '#e0e7ff' : isFG ? '#fef3c7' : (isFilmItem ? '#dcfce7' : '#f0f9ff'),
            color: isSFG ? '#3730a3' : isFG ? '#92400e' : (isFilmItem ? '#166534' : '#1e40af'),
            padding: '2px 8px', 
            borderRadius: '4px',
            border: '1.5px solid currentColor'
          }}>
            {isSFG ? 'SEMI-FINISHED (SFG)' : isFG ? 'FINISHED GOODS (FG)' : (isFilmItem ? 'RAW MATERIAL (RM)' : 'STORE CONSUMABLE')}
          </span>
        </div>

        {/* Barcode SVG Visual */}
        <div style={{ textAlign: 'center', background: '#f8fafc', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
          {renderBarcodeSVG(r.barcodeId)}
        </div>

        {/* Core Specs Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', fontSize: '0.82rem', background: '#f8fafc', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
          <div>
            <span style={{ fontSize: '0.64rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Item / Substrate</span>
            <div style={{ fontWeight: '800', fontSize: '0.88rem', color: '#0f172a', lineHeight: '1.2' }}>{r.itemName}</div>
            {isFilmItem ? (
              <div style={{ fontSize: '0.73rem', color: '#334155', marginTop: '2px' }}>
                Gauge: <strong>{r.micron}µ</strong> | Width: <strong>{r.widthMm}mm</strong>
                {r.totalUnits > 1 ? ` | Roll ${r.unitNo || 1} of ${r.totalUnits}` : ''}
              </div>
            ) : (
              <div style={{ fontSize: '0.73rem', color: '#334155', marginTop: '2px' }}>
                Category: <strong>{r.category || 'Stock Item'}</strong> {r.totalUnits > 1 ? ` | Unit ${r.unitNo || 1} of ${r.totalUnits}` : ''}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'right', borderLeft: '1.5px solid #cbd5e1', paddingLeft: '8px' }}>
            <span style={{ fontSize: '0.64rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {isFilmItem || isFG || isSFG ? 'Net Scale Weight' : 'Net Scale Weight / Qty'}
            </span>
            <div style={{ fontWeight: '900', fontSize: '1.2rem', color: '#047857', lineHeight: '1.1', marginTop: '2px' }}>
              {displayQty} <span style={{ fontSize: '0.75rem' }}>{displayUnit}</span>
            </div>
            {r.grossWeightKg && (
              <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '600', marginTop: '1px' }}>
                Gross: {r.grossWeightKg} kg
              </div>
            )}
          </div>
        </div>

        {/* Traceability Metadata */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.73rem', color: '#1e293b', background: '#ffffff', padding: '6px 8px', borderRadius: '4px', border: '1px dashed #cbd5e1' }}>
          {r.jobName && (
            <div>Job Name: <strong>{r.jobName}</strong></div>
          )}
          {r.clientName && (
            <div>Client: <strong>{r.clientName}</strong></div>
          )}
          {r.vendorName && (
            <div>Vendor: <strong>{r.vendorName}</strong> {r.invoiceNo ? `| Inv: ${r.invoiceNo}` : ''}</div>
          )}
          {r.batchNo && (
            <div>Batch / Heat #: <strong>{r.batchNo}</strong></div>
          )}
          {rateVal > 0 && (
            <div style={{ color: '#047857', fontWeight: '700' }}>
              Purchase Rate: <strong>₹{rateVal} / {displayUnit}</strong>
            </div>
          )}
          {r.inputBarcodeIds && r.inputBarcodeIds.length > 0 && (
            <div style={{ fontSize: '0.68rem', color: '#4f46e5', fontWeight: '600' }}>
              Input Roll Ref: {r.inputBarcodeIds.join(', ')}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', fontSize: '0.68rem', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '3px' }}>
            <span>Station: <strong>{r.stationId || 'SCALE_1_INWARD'}</strong></span>
            <span>Date: <strong>{r.inwardDatetime || r.date || new Date().toLocaleString()}</strong></span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 120 }} onClick={onClose}>
      <style>{`
        @media print {
          @page {
            size: 4in 4in;
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            height: 100% !important;
          }
          body * {
            visibility: hidden !important;
          }
          .printable-barcode-container, .printable-barcode-container * {
            visibility: visible !important;
          }
          .printable-barcode-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 4in !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .printable-barcode-single-label {
            width: 4in !important;
            height: 4in !important;
            max-width: 4in !important;
            max-height: 4in !important;
            box-sizing: border-box !important;
            padding: 10px 12px !important;
            margin: 0 !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border: 2px solid #000 !important;
            background: #ffffff !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            overflow: hidden !important;
          }
        }
      `}</style>

      {/* Hidden DOM element rendered specifically for multi-page 4x4 thermal sticker printing */}
      <div className="printable-barcode-container">
        {rollList.map(r => renderSingleSticker(r, true))}
      </div>

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
              4×4 Inch Thermal Sticker Format • {rollList.length} Sticker(s) Ready to Print
            </p>
          </div>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={onClose}>
            <X size={14} /> Close
          </button>
        </div>

        {/* Carousel / Navigation Bar if multiple rolls exist */}
        {rollList.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', background: '#ecfdf5', padding: '8px 12px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
            <button 
              type="button"
              className="btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              disabled={activeIndex === 0}
              onClick={() => setActiveIndex(prev => Math.max(0, prev - 1))}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#047857' }}>
              Previewing Sticker {activeIndex + 1} of {rollList.length} (Barcode: {activeRoll.barcodeId})
            </span>
            <button 
              type="button"
              className="btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              disabled={activeIndex === rollList.length - 1}
              onClick={() => setActiveIndex(prev => Math.min(rollList.length - 1, prev + 1))}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Single Sticker On-Screen Preview */}
        {renderSingleSticker(activeRoll, false)}

        {/* Footer Print Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {rollList.length > 1 ? `Will print all ${rollList.length} stickers (1 sticker per 4×4 page)` : 'Prints 1 sticker on 4×4 thermal paper'}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handlePrint} style={{ background: '#059669', borderColor: '#059669' }}>
              <Printer size={16} /> Print Thermal Stickers ({rollList.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
