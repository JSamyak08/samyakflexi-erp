import React, { useState, useEffect } from 'react';
import { Printer, X, Tag, ChevronLeft, ChevronRight, QrCode, ArrowRight } from 'lucide-react';
import { loadLetterhead } from '../services/companyProfile';
import CompanyProfileNotice from './CompanyProfileNotice';
import QRCode2D from './QRCode2D';
import { codeKey, codeStartsWith, textFrom } from '../utils/barcodeCode';

export default function BarcodePrinterModal({ roll, rolls, inventory = [], inks = [], autoPrint = false, onRecordNext, onClose }) {
  const rollList = Array.isArray(rolls) 
    ? rolls 
    : (Array.isArray(roll) ? roll : (roll ? [roll] : []));

  const [activeIndex, setActiveIndex] = useState(0);

  const handleRecordNext = () => {
    if (onRecordNext) {
      onRecordNext();
    } else {
      onClose();
    }
  };

  // Listen for Enter key to automatically trigger 'Record Next'
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleRecordNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onRecordNext, onClose]);

  // Auto-trigger instant print command to system default printer when requested
  useEffect(() => {
    if (autoPrint && rollList.length > 0) {
      const timer = setTimeout(() => {
        try {
          window.print();
        } catch (e) {
          console.warn("Auto-print error:", e);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, rollList.length]);

  const letterhead = loadLetterhead();
  if (letterhead.error) return <CompanyProfileNotice message={letterhead.error} onClose={onClose} />;
  if (rollList.length === 0) return null;
  const COMPANY_DETAILS = letterhead.company;

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
      const iId = codeKey(i.id);
      const iCode = codeKey(i.itemCode);
      const pCode = codeKey(i.productCode);
      const lBatch = codeKey(i.lastBatch);
      const iName = codeKey(i.itemName);
      return iId === cleanId || iId === strippedId ||
        iCode === cleanId || iCode === strippedId ||
        pCode === cleanId || pCode === strippedId ||
        lBatch === cleanId || lBatch === strippedId ||
        (iName && (iName === cleanId || cleanId.includes(iName)));
    });

    if (matchedItem) {
      const invRate = Number(matchedItem.unitPrice || matchedItem.purchaseRatePerKg || matchedItem.pricePerKg || 0);
      if (invRate > 0) return invRate;
    }

    // 3. Cross-reference with inks master
    const matchedInk = (inks || []).find(ink => {
      const pCode = codeKey(ink.productCode);
      const inkId = codeKey(ink.id);
      const shade = codeKey(ink.shade);
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
      'Printing Inks', 'Printing Inks & Toners', 'Chemicals & Solvents', 'Adhesives & Hardener',
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

    const catStr = codeKey(r.category);
    const isChemicalOrInk = catStr.includes('chemical') || catStr.includes('solvent') || catStr.includes('ink') || catStr.includes('adhesive') || catStr.includes('resin') || codeStartsWith(r.barcodeId, 'CON-BC') || codeStartsWith(r.barcodeId, 'RM-BC');
    const displayUnit = r.unit || r.uom || (isFilmItem || isChemicalOrInk ? 'Kg' : 'Pcs');
    const displayQty = (r.netWeightKg !== undefined && r.netWeightKg !== null && Number(r.netWeightKg) > 0)
      ? Number(r.netWeightKg)
      : ((r.availableWeightKg !== undefined && r.availableWeightKg !== null && Number(r.availableWeightKg) > 0)
        ? Number(r.availableWeightKg)
        : (Number(r.qty ?? r.weightKg ?? r.receivedQtyKg ?? 0)));
    const rateVal = resolveItemPurchaseRate(r);
    const vendorStr = r.vendorName || r.supplier || r.partyName || '-';
    const batchStr = r.batchNo || r.heatNo || r.batch || '-';
    const barcodeCodeStr = textFrom(r.barcodeId, r.id) || 'BC-2026-0000';

    const isQCHold = r.isQCHold || r.targetProcess === 'QC Hold Store' || r.status === 'QC_HOLD' || r.rollType === 'QC_HOLD' || r.isHold === true;

    return (
      <div 
        key={r.barcodeId || r.id || Math.between?.(1,999) || Math.random()}
        className={isPrintView ? "printable-barcode-single-label" : ""}
        style={!isPrintView ? {
          background: isQCHold ? '#fff5f5' : '#ffffff',
          border: isQCHold ? '2.5px solid #dc2626' : '2px solid #0f172a',
          borderRadius: '8px',
          padding: '10px 12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '6px',
          fontFamily: 'Inter, sans-serif',
          color: '#0f172a',
          minHeight: '300px'
        } : {
          fontFamily: 'Inter, sans-serif',
          color: '#0f172a'
        }}
      >
        {/* Label Header */}
        <div className="label-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: isQCHold ? '2px solid #dc2626' : '1.5px solid #0f172a', paddingBottom: '4px', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!r.hideBranding ? (
              <>
                <div style={{ fontWeight: '900', fontSize: '0.84rem', letterSpacing: '-0.01em', lineHeight: '1.15', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {COMPANY_DETAILS.name}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: '600', marginTop: '1px', lineHeight: '1.2' }}>
                  {COMPANY_DETAILS.placeOfSupply} • GSTIN: {COMPANY_DETAILS.gstin}
                </div>
              </>
            ) : (
              <div>
                <div style={{ fontWeight: '900', fontSize: '0.82rem', letterSpacing: '0.02em', color: '#334155', textTransform: 'uppercase' }}>
                  IDENTIFICATION TAG
                </div>
              </div>
            )}
          </div>
          <span style={{ 
            fontSize: '0.62rem',
            fontWeight: '900', 
            background: isQCHold ? '#fee2e2' : (isSFG ? '#e0e7ff' : isFG ? '#fef3c7' : (isFilmItem ? '#dcfce7' : '#f0f9ff')),
            color: isQCHold ? '#991b1b' : (isSFG ? '#3730a3' : isFG ? '#92400e' : (isFilmItem ? '#166534' : '#1e40af')),
            padding: '2px 6px',
            borderRadius: '3px',
            border: `1.5px solid ${isQCHold ? '#dc2626' : 'currentColor'}`,
            letterSpacing: isQCHold ? '0.04em' : 'normal',
            whiteSpace: 'nowrap',
            marginLeft: '6px',
            flexShrink: 0
          }}>
            {isQCHold 
              ? '🚨 QC HOLD MATERIAL' 
              : (isSFG 
                ? 'SEMI-FINISHED (SFG)' 
                : isFG 
                  ? 'FINISHED GOODS (FG)' 
                  : (isFilmItem 
                    ? 'RAW MATERIAL (RM)' 
                    : (r.category && r.category !== 'CONSUMABLE_ITEM' ? r.category.toUpperCase() : 'STORE ITEM')
                  ))}
          </span>
        </div>

        {/* Warning Banner for QC Hold */}
        {isQCHold && (
          <div className="label-section" style={{
            background: '#7f1d1d',
            color: '#ffffff',
            fontWeight: '900',
            fontSize: '0.78rem',
            textAlign: 'center',
            padding: '3px 6px',
            borderRadius: '4px',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            flexShrink: 0
          }}>
            ⚠️ QC HOLD MATERIAL — QUARANTINE ⚠️
          </div>
        )}

        {/* 2D Barcode (QR Code) Scanner Visual */}
        <div className="label-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '5px 8px', borderRadius: '5px', border: '1.5px solid #0f172a', gap: '8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '0.60rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <QrCode size={11} style={{ color: '#047857', flexShrink: 0 }} /> 2D QR BARCODE (TRACEABILITY)
            </span>
            <span style={{ fontFamily: "Consolas, Monaco, 'Courier New', monospace", fontWeight: '900', fontSize: '0.92rem', color: '#0f172a', letterSpacing: '0.03em', marginTop: '2px', wordBreak: 'break-all', lineHeight: '1.2' }}>
              {barcodeCodeStr}
            </span>
            <span style={{ fontSize: '0.60rem', color: '#475569', fontWeight: '600', marginTop: '2px' }}>
              {r.totalUnits > 1 ? `${r.packagingType || 'Roll'} ${r.unitNo || 1} of ${r.totalUnits} • ` : ''}Date: {r.inwardDatetime || r.dispatchDate || r.date || new Date().toLocaleDateString('en-IN')}
            </span>
          </div>

          <div style={{ background: '#ffffff', padding: '2px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '80px', height: '80px' }}>
            <QRCode2D value={barcodeCodeStr} size={76} showLabel={false} margin={1} />
          </div>
        </div>

        {/* Core Specs Grid */}
        <div className="label-section" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr', gap: '6px', fontSize: '0.78rem', background: '#f8fafc', padding: '5px 7px', borderRadius: '4px', border: '1px solid #cbd5e1', flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block' }}>Item / Substrate</span>
            <div style={{ fontWeight: '800', fontSize: '0.85rem', color: '#0f172a', lineHeight: '1.2', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.itemName || r.jobName}>
              {r.itemName || r.jobName}
            </div>
            {isFilmItem ? (
              <div style={{ fontSize: '0.68rem', color: '#334155', marginTop: '1px', lineHeight: '1.2' }}>
                Gauge: <strong>{r.micron}µ</strong> | Width: <strong>{r.widthMm}mm</strong>
              </div>
            ) : (
              <div style={{ fontSize: '0.68rem', color: '#334155', marginTop: '1px', lineHeight: '1.2' }}>
                {r.substrateSpec ? <strong>{r.substrateSpec}</strong> : `Unit: ${displayUnit}`}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'right', borderLeft: '1.5px solid #cbd5e1', paddingLeft: '6px', minWidth: 0 }}>
            <span style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block' }}>
              Net Qty / Weight
            </span>
            <div style={{ fontWeight: '900', fontSize: '1.12rem', color: '#047857', lineHeight: '1.1', marginTop: '1px' }}>
              {displayQty} <span style={{ fontSize: '0.70rem' }}>{displayUnit}</span>
            </div>
            {r.grossWeightKg ? (
              <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: '600', marginTop: '1px', lineHeight: '1.15' }}>
                Gross: {r.grossWeightKg} kg {(r.tareWeightKg !== undefined || r.coreWeightKg !== undefined) ? `| Tare: ${r.tareWeightKg ?? r.coreWeightKg} kg` : ''}
              </div>
            ) : null}
            {r.lengthMeters ? (
              <div style={{ fontSize: '0.62rem', color: '#0369a1', fontWeight: '700', marginTop: '1px', lineHeight: '1.15' }}>
                Len: {r.lengthMeters} m
              </div>
            ) : null}
          </div>
        </div>

        {/* Traceability & Costing Metadata Box */}
        <div className="label-section" style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.68rem', color: '#1e293b', background: '#ffffff', padding: '4px 7px', borderRadius: '4px', border: '1px dashed #94a3b8', flexShrink: 0 }}>
          {r.jobName && (
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Job Name: <strong>{r.jobName}</strong></div>
          )}
          {r.clientName && (
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Client: <strong>{r.clientName}</strong></div>
          )}

          {isFG ? (
            <div>
              Order Ref #: <strong>{r.poNo || r.orderRefNo || r.orderId || r.batchNo || 'N/A'}</strong> {r.invoiceNo ? `| Inv: ${r.invoiceNo}` : ''}
            </div>
          ) : (
            <>
              {r.vendorRollNo && (
                <div>Vendor {r.packagingType || 'Roll'} #: <strong style={{ color: '#0284c7' }}>{r.vendorRollNo}</strong></div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span>Vendor: <strong>{vendorStr}</strong></span>
                {r.invoiceNo ? <span style={{ color: '#64748b' }}>Inv: <strong>{r.invoiceNo}</strong></span> : null}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Batch / Heat #: <strong>{batchStr}</strong></span>
                <span style={{ color: '#047857', fontWeight: '700' }}>Rate: <strong>{rateVal > 0 ? `₹${rateVal} / ${displayUnit}` : '₹-'}</strong></span>
              </div>
            </>
          )}

          {r.inputBarcodeIds && r.inputBarcodeIds.length > 0 && (
            <div style={{ fontSize: '0.64rem', color: '#4f46e5', fontWeight: '600' }}>
              Input Roll Ref: {r.inputBarcodeIds.join(', ')}
            </div>
          )}
          {r.holdReason && (
            <div style={{ color: '#991b1b', fontWeight: '800', fontSize: '0.66rem', background: '#fef2f2', padding: '2px 5px', borderRadius: '3px', border: '1px solid #fca5a5', wordBreak: 'break-word' }}>
              QC HOLD REASON: <strong>{r.holdReason}</strong>
            </div>
          )}
          {(r.itemRemarks || r.remarks || r.notes) && (
            <div style={{ color: '#0369a1', fontWeight: '700', fontSize: '0.66rem', borderTop: '1px solid #e2e8f0', paddingTop: '2px', wordBreak: 'break-word' }}>
              Remark: <strong>{r.itemRemarks || r.remarks || r.notes}</strong>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1px', fontSize: '0.62rem', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '2px' }}>
            <span>Station: <strong>{isFG ? 'Dispatch Main Dock' : (r.stationId || r.station_id || 'Dispatch Main Dock')}</strong></span>
            <span>Date: <strong>{r.inwardDatetime || r.dispatchDate || r.date || new Date().toLocaleDateString('en-IN')}</strong></span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={onClose}>
      <style>{`
        @media screen {
          .printable-barcode-container {
            display: none !important;
          }
        }
        @media print {
          @page {
            size: 4in 4in;
            margin: 0;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 4in !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Completely hide all non-print interface elements */
          body * {
            visibility: hidden !important;
          }
          .no-print,
          .modal-content,
          .sidebar,
          aside,
          header,
          nav,
          button,
          .btn-primary,
          .btn-secondary,
          .Toastify {
            display: none !important;
            visibility: hidden !important;
          }
          .modal-overlay {
            position: static !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            backdrop-filter: none !important;
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            min-height: 0 !important;
          }
          /* Exclusively unhide the printable barcode sticker container */
          .printable-barcode-container,
          .printable-barcode-container * {
            visibility: visible !important;
          }
          .printable-barcode-container {
            display: block !important;
            position: static !important;
            top: 0 !important;
            left: 0 !important;
            width: 4in !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .printable-barcode-single-label {
            width: 3.8in !important;
            height: 3.8in !important;
            max-width: 3.8in !important;
            max-height: 3.8in !important;
            box-sizing: border-box !important;
            padding: 8px 10px !important;
            margin: 0.1in auto !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border: 2px solid #000000 !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            overflow: hidden !important;
            font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
            color: #0f172a !important;
          }
          .printable-barcode-single-label:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .printable-barcode-single-label .label-section {
            flex-shrink: 0 !important;
          }
        }
      `}</style>

      {/* Hidden DOM element rendered specifically for multi-page 4x4 thermal sticker printing */}
      <div className="printable-barcode-container">
        {rollList.map(r => renderSingleSticker(r, true))}
      </div>

      <div 
        className="glass-card modal-content no-print"
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
            {rollList.length > 1 ? `Will print all ${rollList.length} stickers (1 sticker per 4×4 page)` : 'Press Enter to Record Next Roll'}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn-secondary" onClick={handlePrint} style={{ background: '#f8fafc', color: '#1e293b' }}>
              <Printer size={16} /> Re-Print ({rollList.length})
            </button>
            <button 
              type="button" 
              className="btn-primary" 
              onClick={handleRecordNext} 
              style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', borderColor: '#059669', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ArrowRight size={16} /> Record Next Roll (Enter ↵)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
