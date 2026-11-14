import React, { useState, useEffect, useRef } from 'react';
import { Printer, X, Tag, ChevronLeft, ChevronRight, QrCode, ArrowRight } from 'lucide-react';
import { loadLetterhead } from '../services/companyProfile';
import CompanyProfileNotice from './CompanyProfileNotice';
import { useModalDismiss } from './useModalDismiss';
import QRCode2D from './QRCode2D';
import {
  printThermalBarcodeLabels,
  resolveItemPurchaseRate,
  getStickerCategoryInfo,
  getStickerDisplayDate,
  formatStickerDateTime,
  stickerBarcode
} from '../utils/thermalBarcodePrinter';
import { balanceOriginView, inheritBalanceDetails } from '../utils/balanceRollDetails';
import { rollsEligibleForBarcodeLabel } from '../utils/scrapIdentity';

export default function BarcodePrinterModal({ roll, rolls, inventory = [], inks = [], inventoryRolls = [], autoPrint = false, onRecordNext, onClose, variant = '' }) {
  const rollList = rollsEligibleForBarcodeLabel(Array.isArray(rolls)
    ? rolls
    : (Array.isArray(roll) ? roll : (roll ? [roll] : [])));
  const reprint = variant === 'reprint';

  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const letterhead = loadLetterhead();
  useModalDismiss(rootRef, onClose, !letterhead?.error);
  if (letterhead.error) return <CompanyProfileNotice message={letterhead.error} onClose={onClose} />;
  const COMPANY_DETAILS = letterhead.company;

  const activeRoll = rollList[activeIndex] || rollList[0];

  const handleRecordNext = () => {
    if (onRecordNext) {
      onRecordNext();
    } else {
      onClose();
    }
  };

  const handlePrint = () => {
    printThermalBarcodeLabels({
      rolls: rollList,
      company: COMPANY_DETAILS,
      inventory,
      inks,
      inventoryRolls
    });
  };

  // Enter records the next inward roll. A reprint does not. Ctrl/Cmd+P prints.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!reprint && e.key === 'Enter') {
        e.preventDefault();
        handleRecordNext();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reprint, onRecordNext, onClose, rollList, COMPANY_DETAILS, inventory, inks, inventoryRolls]);

  // Auto-trigger instant isolated iframe thermal print command when requested
  useEffect(() => {
    if (autoPrint && rollList.length > 0) {
      const timer = setTimeout(() => {
        handlePrint();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, rollList.length]);

  const renderSingleStickerPreview = (source) => {
    const r = inheritBalanceDetails(source, { rolls: inventoryRolls, inventory });
    const catInfo = getStickerCategoryInfo(r);
    const { isSFG, isFG, isFilmItem, isQCHold, displayUnit, displayQty, tagLabel, grossKg, showLength, lengthLabel } = catInfo;
    const origin = balanceOriginView(r);
    const titleName = (origin && origin.itemName) || r.itemName || r.jobName || '-';
    const originDate = origin?.grnDate ? formatStickerDateTime(origin.grnDate) : '';

    const rateVal = resolveItemPurchaseRate(r, inventory, inks);
    const vendorStr = r.vendorName || r.supplier || r.partyName || '-';
    const batchStr = r.batchNo || r.heatNo || r.batch || '-';
    const barcodeCodeStr = catInfo.barcodeCode || stickerBarcode(r);
    const displayDate = getStickerDisplayDate(r);

    return (
      <div 
        key={r.barcodeId || r.id || Math.random()}
        style={{
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
        }}
      >
        {/* Label Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: isQCHold ? '2px solid #dc2626' : '1.5px solid #0f172a', paddingBottom: '4px', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: '6px' }}>
            {!r.hideBranding ? (
              <>
                <div style={{ fontWeight: '900', fontSize: '0.82rem', letterSpacing: '-0.01em', lineHeight: '1.15', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {COMPANY_DETAILS.name}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#0f172a', fontWeight: '700', marginTop: '1px', lineHeight: '1.2', letterSpacing: '0.02em' }}>
                  <span style={{ color: '#475569', fontWeight: '600' }}>GSTIN:</span>{' '}
                  <span style={{ fontFamily: "Consolas, Monaco, 'Courier New', monospace", fontWeight: '800' }}>
                    {COMPANY_DETAILS.gstin}
                  </span>
                </div>
                <div style={{ fontSize: '0.53rem', color: '#475569', fontWeight: '500', marginTop: '1px', lineHeight: '1.25', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                  {COMPANY_DETAILS.address || COMPANY_DETAILS.placeOfSupply}
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
            {tagLabel}
          </span>
        </div>

        {/* Warning Banner for QC Hold */}
        {isQCHold && (
          <div style={{
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '5px 8px', borderRadius: '5px', border: '1.5px solid #0f172a', gap: '8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '0.60rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <QrCode size={11} style={{ color: '#047857', flexShrink: 0 }} /> 2D QR BARCODE (TRACEABILITY)
            </span>
            <span style={{ fontFamily: "Consolas, Monaco, 'Courier New', monospace", fontWeight: '900', fontSize: '0.92rem', color: '#0f172a', letterSpacing: '0.03em', marginTop: '2px', wordBreak: 'break-all', lineHeight: '1.2' }}>
              {barcodeCodeStr}
            </span>
            <span style={{ fontSize: '0.60rem', color: '#475569', fontWeight: '600', marginTop: '2px' }}>
              {r.totalUnits > 1 ? `${r.packagingType || 'Roll'} ${r.unitNo || 1} of ${r.totalUnits} • ` : ''}Date: {displayDate}
            </span>
          </div>

          <div style={{ background: '#ffffff', padding: '2px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '80px', height: '80px' }}>
            <QRCode2D value={barcodeCodeStr} size={76} showLabel={false} margin={1} />
          </div>
        </div>

        {/* Core Specs Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr', gap: '6px', fontSize: '0.78rem', background: '#f8fafc', padding: '5px 7px', borderRadius: '4px', border: '1px solid #cbd5e1', flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: '0.58rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block' }}>Item / Substrate</span>
            <div style={{ fontWeight: '800', fontSize: '0.85rem', color: '#0f172a', lineHeight: '1.2', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={titleName}>
              {titleName}
            </div>
            {origin && (origin.widthMm || origin.micron) ? (
              <div style={{ fontSize: '0.68rem', color: '#334155', marginTop: '1px', lineHeight: '1.2' }}>
                {origin.widthMm ? <>Size: <strong>{origin.widthMm} mm</strong></> : null}
                {origin.widthMm && origin.micron ? ' · ' : null}
                {origin.micron ? <>Micron: <strong>{origin.micron} µ</strong></> : null}
              </div>
            ) : isFilmItem ? (
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
            {grossKg ? (
              <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: '600', marginTop: '1px', lineHeight: '1.15' }}>
                Gross: {grossKg} kg {(r.tareWeightKg !== undefined || r.coreWeightKg !== undefined) ? `| Tare: ${r.tareWeightKg ?? r.coreWeightKg} kg` : ''}{(r.coreWeightKg !== undefined && r.coreWeightKg !== null && Number(r.coreWeightKg) !== Number(r.tareWeightKg ?? r.coreWeightKg)) ? ` | Core: ${r.coreWeightKg} kg` : ''}
              </div>
            ) : null}
            {showLength ? (
              <div style={{ fontSize: '0.62rem', color: '#0369a1', fontWeight: '700', marginTop: '1px', lineHeight: '1.15' }}>
                Len: {lengthLabel}
              </div>
            ) : null}
          </div>
        </div>

        {/* Traceability & Costing Metadata Box */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.68rem', color: '#1e293b', background: '#ffffff', padding: '4px 7px', borderRadius: '4px', border: '1px dashed #94a3b8', flexShrink: 0 }}>
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
              {origin?.parentBarcode ? (
                <div style={{ fontSize: '0.62rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Split from: <strong>{origin.parentBarcode}</strong>
                </div>
              ) : null}
              {(origin?.grnNo || originDate) ? (
                <div style={{ fontSize: '0.62rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Original GRN: <strong>{[origin.grnNo, originDate].filter(Boolean).join(' · ')}</strong>
                </div>
              ) : null}
              {origin?.originalNetKg ? (
                <div style={{ fontSize: '0.62rem' }}>
                  Original net: <strong>{origin.originalNetKg} kg</strong>
                </div>
              ) : null}
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
            <span>Date: <strong>{displayDate}</strong></span>
          </div>
        </div>
      </div>
    );
  };

  if (rollList.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className="modal-overlay barcode-printer-modal-root"
      data-testid={reprint ? 'barcode-reprint-preview' : undefined}
      style={{ zIndex: 3000 }}
    >
      <style>{`
        @media print {
          .barcode-printer-modal-root,
          .modal-overlay,
          .modal-content,
          .no-print {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}</style>

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
              Previewing Sticker {activeIndex + 1} of {rollList.length} (Barcode: {stickerBarcode(activeRoll)})
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
        {renderSingleStickerPreview(activeRoll)}

        {/* Footer Print Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {reprint
              ? 'Reprint only. This barcode is not changed and stock is not updated.'
              : (rollList.length > 1 ? `Will print all ${rollList.length} stickers (1 sticker per 4×4 page)` : 'Press Enter to Record Next Roll')}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn-secondary" data-testid={reprint ? 'barcode-reprint-print' : undefined} onClick={handlePrint} style={{ background: '#f8fafc', color: '#1e293b' }}>
              <Printer size={16} /> {reprint ? 'Print' : `Re-Print (${rollList.length})`}
            </button>
            {!reprint && (
            <button 
              type="button" 
              className="btn-primary" 
              onClick={handleRecordNext} 
              style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', borderColor: '#059669', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ArrowRight size={16} /> Record Next Roll (Enter ↵)
            </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
