import React, { useState } from 'react';
import { Printer, X, Tag, ChevronLeft, ChevronRight, QrCode } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import QRCode2D from './QRCode2D';

export default function BarcodePrinterModal({ roll, rolls, inventory = [], inks = [], onClose }) {
  const rollList = Array.isArray(rolls) 
    ? rolls 
    : (Array.isArray(roll) ? roll : (roll ? [roll] : []));

  const [activeIndex, setActiveIndex] = useState(0);

  if (rollList.length === 0) return null;

  const activeRoll = rollList[activeIndex] || rollList[0];

  const handlePrint = () => {
    window.print();
  };

  const resolveItemPurchaseRate = (r) => {
    // 1. Check explicit rate on roll/sticker object
    const directRate = Number(r.purchaseRatePerKg || r.purchaseRate || r.unitPrice || r.rate || r.ratePerKg || 0);
    if (directRate > 0) return directRate;

    // 2. Cross-reference with live inventory list
    const cleanId = String(r.itemId || r.id || r.itemCode || r.barcodeId || '').toLowerCase().trim();
    const strippedId = cleanId.replace(/^(lot|bc|bar-iss|bar|roll|inv|grn|item)[-_:]\s*/i, '').trim();

    const matchedItem = (inventory || []).find(i => {
      const iId = (i.id || '').toLowerCase();
      const iCode = (i.itemCode || '').toLowerCase();
      const pCode = (i.productCode || '').toLowerCase();
      const lBatch = (i.lastBatch || '').toLowerCase();
      const iName = (i.itemName || '').toLowerCase();
      return iId === cleanId || iId === strippedId ||
        iCode === cleanId || iCode === strippedId ||
        pCode === cleanId || pCode === strippedCode ||
        lBatch === cleanId || lBatch === strippedId ||
        (iName && (iName === cleanId || cleanId.includes(iName)));
    });

    if (matchedItem) {
      const invRate = Number(matchedItem.unitPrice || matchedItem.purchaseRatePerKg || matchedItem.pricePerKg || 0);
      if (invRate > 0) return invRate;
    }

    // 3. Cross-reference with inks master
    const matchedInk = (inks || []).find(ink => {
      const pCode = (ink.productCode || '').toLowerCase();
      const inkId = (ink.id || '').toLowerCase();
      const shade = (ink.shade || '').toLowerCase();
      return pCode === cleanId || pCode === strippedId || inkId === cleanId || (shade && (shade === cleanId || cleanId.includes(shade)));
    });

    if (matchedInk) {
      const inkRate = Number(matchedInk.pricePerKg || matchedInk.unitPrice || 0);
      if (inkRate > 0) return inkRate;
    }

    return directRate;
  };

  const renderSingleSticker = (r, isPrintView = false) => {
    const isSFG = r.rollType === 'SFG_PRINTED' || r.rollType === 'SFG_LAMINATED' || r.rollType === 'SFG';
    const isFG = r.rollType === 'FG_DISPATCH' || r.rollType === 'FG';

    const nonFilmCategories = [
      'Doctor Blades', 'Doctor Blades & Wipers', 'Inks & Solvents',
      'Printing Inks & Toners', 'Chemicals & Solvents', 'Adhesives & Hardener',
      'Rollers & Sleeves', 'Machine Spare Parts', 'Lubricants & Oils',
      'Tapes & Consumables', 'Safety Gear (PPE)', 'General Store', 'CONSUMABLE_ITEM', 'Packaging & Cores'
    ];

    const itemNameLower = String(r.itemName || '').toLowerCase();
    const catLower = String(r.category || '').toLowerCase();

    const KNOWN_NON_FILM_KEYWORDS = [
      'acetate', 'solvent', 'ink', 'cyan', 'magenta', 'yellow', 'black', 'white',
      'blade', 'wiper', 'adhesive', 'hardener', 'tape', 'core', 'roller', 'sleeve',
      'lubricant', 'oil', 'gear', 'ppe', 'glove', 'mask', 'chemical', 'cylinder',
      'thinner', 'alcohol', 'toluene', 'varnish'
    ];

    const isNonFilmByKeyword = KNOWN_NON_FILM_KEYWORDS.some(kw => 
      itemNameLower.includes(kw) || catLower.includes(kw)
    );

    const isExplicitNonFilm = nonFilmCategories.includes(r.category) || 
      isNonFilmByKeyword ||
      r.rollType === 'CONSUMABLE_ITEM';

    const hasValidFilmSpecs = parseFloat(r.micron) > 0 && parseFloat(r.widthMm) > 0 && r.micron !== '-' && r.widthMm !== '-';

    const isFilmItem = !isExplicitNonFilm && 
      (r.rollType === 'RAW_MATERIAL' || r.category === 'Film Substrates') && 
      hasValidFilmSpecs;

    const displayUnit = r.unit || r.uom || (isFilmItem ? 'kg' : 'Pcs');
    const displayQty = r.netWeightKg ?? r.availableWeightKg ?? r.qty ?? 0;
    const rateVal = resolveItemPurchaseRate(r);
    const vendorStr = r.vendorName || r.supplier || r.partyName || '-';
    const batchStr = r.batchNo || r.heatNo || r.batch || '-';
    const barcodeCodeStr = r.barcodeId || r.id || 'BC-2026-0000';

    return (
      <div 
        key={r.barcodeId || r.id || Math.random()}
        className={isPrintView ? "printable-barcode-single-label" : ""}
        style={!isPrintView ? {
          background: '#ffffff',
          border: '2px solid #0f172a',
          borderRadius: '8px',
          padding: '10px 12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '6px',
          fontFamily: 'Inter, sans-serif',
          color: '#0f172a',
          minHeight: '320px'
        } : {
          fontFamily: 'Inter, sans-serif',
          color: '#0f172a'
        }}
      >
        {/* Label Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1.5px solid #0f172a', paddingBottom: '4px' }}>
          <div>
            <div style={{ fontWeight: '900', fontSize: '0.88rem', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
              {COMPANY_DETAILS.name}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: '600', marginTop: '1px' }}>
              Indore Plant • GSTIN: {COMPANY_DETAILS.gstin}
            </div>
          </div>
          <span style={{ 
            fontSize: '0.65rem', 
            fontWeight: '800', 
            background: isSFG ? '#e0e7ff' : isFG ? '#fef3c7' : (isFilmItem ? '#dcfce7' : '#f0f9ff'),
            color: isSFG ? '#3730a3' : isFG ? '#92400e' : (isFilmItem ? '#166534' : '#1e40af'),
            padding: '2px 6px', 
            borderRadius: '4px',
            border: '1px solid currentColor'
          }}>
            {isSFG 
              ? 'SEMI-FINISHED (SFG)' 
              : isFG 
                ? 'FINISHED GOODS (FG)' 
                : (isFilmItem 
                  ? 'RAW MATERIAL (RM)' 
                  : (r.category && r.category !== 'CONSUMABLE_ITEM' ? r.category.toUpperCase() : 'STORE ITEM')
                )}
          </span>
        </div>

        {/* 2D Barcode (QR Code) Scanner Visual */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1.5px solid #0f172a', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <QrCode size={12} style={{ color: '#047857' }} /> 2D BARCODE (ISO 18004)
            </span>
            <span style={{ fontFamily: "Consolas, Monaco, 'Courier New', monospace", fontWeight: '900', fontSize: '1rem', color: '#0f172a', letterSpacing: '0.04em', marginTop: '3px', wordBreak: 'break-all' }}>
              {barcodeCodeStr}
            </span>
          </div>

          <div style={{ background: '#ffffff', padding: '2px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <QRCode2D value={barcodeCodeStr} size={84} showLabel={false} margin={1} />
          </div>
        </div>

        {/* Core Specs Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '6px', fontSize: '0.8rem', background: '#f8fafc', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
          <div>
            <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Item / Substrate</span>
            <div style={{ fontWeight: '800', fontSize: '0.85rem', color: '#0f172a', lineHeight: '1.2' }}>{r.itemName}</div>
            {isFilmItem ? (
              <div style={{ fontSize: '0.7rem', color: '#334155', marginTop: '1px' }}>
                Gauge: <strong>{r.micron}µ</strong> | Width: <strong>{r.widthMm}mm</strong>
                {r.totalUnits > 1 ? ` | ${r.packagingType || 'Roll'} ${r.unitNo || 1} of ${r.totalUnits}` : ''}
              </div>
            ) : (
              <div style={{ fontSize: '0.7rem', color: '#334155', marginTop: '1px' }}>
                Category: <strong>{r.category || 'Stock Item'}</strong> {r.totalUnits > 1 ? ` | ${r.packagingType || 'Unit'} ${r.unitNo || 1} of ${r.totalUnits}` : ''}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'right', borderLeft: '1.5px solid #cbd5e1', paddingLeft: '6px' }}>
            <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {isFilmItem || isFG || isSFG ? 'Net Scale Weight' : 'Net Scale Weight / Qty'}
            </span>
            <div style={{ fontWeight: '900', fontSize: '1.15rem', color: '#047857', lineHeight: '1.1', marginTop: '1px' }}>
              {displayQty} <span style={{ fontSize: '0.72rem' }}>{displayUnit}</span>
            </div>
            {r.grossWeightKg && (
              <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '600', marginTop: '1px' }}>
                Gross: {r.grossWeightKg} kg {r.tareWeightKg ? `| Tare: ${r.tareWeightKg} kg` : ''}
              </div>
            )}
            {r.lengthMeters && (
              <div style={{ fontSize: '0.65rem', color: '#0369a1', fontWeight: '700', marginTop: '1px' }}>
                Len: {r.lengthMeters} m
              </div>
            )}
          </div>
        </div>

        {/* Traceability & Costing Metadata Box */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.72rem', color: '#1e293b', background: '#ffffff', padding: '5px 8px', borderRadius: '4px', border: '1px dashed #94a3b8' }}>
          {r.jobName && (
            <div>Job Name: <strong>{r.jobName}</strong></div>
          )}
          {r.clientName && (
            <div>Client: <strong>{r.clientName}</strong></div>
          )}
          {r.vendorRollNo && (
            <div>Vendor {r.packagingType || 'Roll'} #: <strong style={{ color: '#0284c7' }}>{r.vendorRollNo}</strong></div>
          )}
          <div>
            Vendor: <strong>{vendorStr}</strong> {r.invoiceNo ? `| Inv: ${r.invoiceNo}` : ''}
          </div>
          <div>
            Batch / Heat #: <strong>{batchStr}</strong>
          </div>
          <div style={{ color: '#047857', fontWeight: '700' }}>
            Purchase Rate: <strong>{rateVal > 0 ? `₹${rateVal} / ${displayUnit}` : '₹-'}</strong>
          </div>
          {r.inputBarcodeIds && r.inputBarcodeIds.length > 0 && (
            <div style={{ fontSize: '0.66rem', color: '#4f46e5', fontWeight: '600' }}>
              Input Roll Ref: {r.inputBarcodeIds.join(', ')}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', fontSize: '0.65rem', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '2px' }}>
            <span>Station: <strong>{r.stationId || 'SCALE_1_INWARD'}</strong></span>
            <span>Date: <strong>{r.inwardDatetime || r.date || new Date().toLocaleString()}</strong></span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={onClose}>
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
            width: 4in !important;
            height: 4in !important;
            overflow: hidden !important;
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
            width: 3.9in !important;
            height: 3.9in !important;
            max-width: 3.9in !important;
            max-height: 3.9in !important;
            box-sizing: border-box !important;
            padding: 8px 10px !important;
            margin: 0.05in !important;
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
          .printable-barcode-single-label:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
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
