import React, { useState } from 'react';
import { Printer, ArrowLeft, Edit3, Plus, Trash2 } from 'lucide-react';
import { loadLetterhead } from '../services/companyProfile';
import CompanyProfileNotice from './CompanyProfileNotice';
import { numberToWords, formatINR, calculateGSTBreakdown } from '../utils/pdfHelpers';
import { pdfLinesFromGrn, taxableAmountFromLines } from '../services/grnDocument';
import { getAuthorisedSignature, getCompanyLogo, generateDocRefNumber, getDocumentTerms } from '../services/settingsService';
import QRCode2D from './QRCode2D';

export default function GRNPDF({ grnData, onClose }) {
  const defaultGrnNo = grnData?.grnNo || generateDocRefNumber('grn');
  const savedTerms = getDocumentTerms();

  const [currentGrnNo, setCurrentGrnNo] = useState(defaultGrnNo);
  const [isEditingRef, setIsEditingRef] = useState(false);
  const [currentGrnTerms, setCurrentGrnTerms] = useState(savedTerms.grnTerms || []);
  const letterhead = loadLetterhead();

  if (!grnData) return null;
  if (letterhead.error) return <CompanyProfileNotice message={letterhead.error} onClose={onClose} />;
  const COMPANY_DETAILS = letterhead.company;

  const signatureImage = getAuthorisedSignature();
  const logoImage = getCompanyLogo();


  const handleUpdateTerm = (index, value) => {
    const updated = [...currentGrnTerms];
    updated[index] = value;
    setCurrentGrnTerms(updated);
  };

  const handleAddTerm = () => {
    setCurrentGrnTerms(prev => [...prev, "New QC observation term..."]);
  };

  const handleRemoveTerm = (index) => {
    setCurrentGrnTerms(prev => prev.filter((_, i) => i !== index));
  };


  const {
    poNumber = "",
    invoiceNo = "",
    receivedDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    category = "Film Substrates",
    itemName = "",
    filmType = "PET",
    micron = 12,
    widthMm = 1000,
    rollsReceived = 12,
    netWeightKg = 1850,
    unit = "Kg",
    unitPrice = 125,
    batchNo = "BATCH-PET-991",
    status = "Approved",
    qcNotes = "Passed corona dyne level & gauge tolerance inspection.",
    inspectedBy = "Quality Manager",
    storeManager = "Store Manager",
    freightAmount = 0,
    transporterName = "Direct Dispatch / Self",
    packagingType = "Roll",
    itemsBreakdown = []
  } = grnData;

  const isFilm = category === 'Film Substrates' || (!category && micron !== '-' && parseFloat(micron) > 0);
  const displayItemName = itemName || (isFilm ? `${filmType}` : (category || filmType || 'Chemicals & Solvents'));

  const vendorName = String(grnData.vendorName || grnData.vendor?.companyName || grnData.vendor?.name || '').trim();
  const vendorAddress = String(grnData.vendorAddress || grnData.vendor?.address || '').trim();
  const vendorGstin = String(grnData.vendorGstin || grnData.vendor?.gstin || '').trim();
  const vendorEmail = String(grnData.vendorEmail || grnData.vendor?.email || '').trim();
  const vendorPhone = String(grnData.vendorPhone || grnData.vendor?.phone || grnData.vendor?.contactNo || '').trim();
  const vendorContact = String(grnData.vendorContact || grnData.vendor?.contactPerson || '').trim();
  const missingSupplier = [
    !vendorName && 'supplier name',
    !vendorAddress && 'supplier address',
    !vendorGstin && 'supplier GSTIN',
  ].filter(Boolean);
  if (missingSupplier.length) {
    return (
      <CompanyProfileNotice
        title="Goods receipt cannot be printed"
        message={`This GRN is missing ${missingSupplier.join(', ')}. Those fields have to be on the supplier and copied onto the receipt. A supplier is not filled in for the print.`}
        onClose={onClose}
      />
    );
  }

  const printableLines = pdfLinesFromGrn(grnData);
  const severalItems = printableLines.length > 1;
  const shownNet = severalItems
    ? printableLines.reduce((sum, line) => sum + (Number(line.netWeightKg) || 0), 0)
    : (Number(netWeightKg) || 0);
  const totalTaxable = severalItems
    ? taxableAmountFromLines(printableLines)
    : (Number(netWeightKg) || 0) * (Number(unitPrice) || 0);
  const gstInfo = calculateGSTBreakdown(vendorGstin, vendorAddress, totalTaxable, 18, COMPANY_DETAILS.gstin);
  const cgstAmt = gstInfo.cgstAmount;
  const sgstAmt = gstInfo.sgstAmount;
  const igstAmt = gstInfo.igstAmount;
  const totalTax = gstInfo.totalGstAmount;
  const grandTotal = gstInfo.grandTotal + (parseFloat(freightAmount) || 0);

  const vendorDetails = {
    name: vendorName,
    address: vendorAddress,
    contactPerson: vendorContact,
    email: vendorEmail,
    contactNo: vendorPhone,
    gstin: vendorGstin
  };

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal-toolbar no-print">
        <button className="btn-secondary" onClick={onClose}>
          <ArrowLeft size={16} /> Back to Inventory
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print GRN PDF
        </button>
      </div>

      <div className="pdf-paper-container">
        <div className="printable-document">
          {/* Header */}
          <div className="letterhead-header">
            <div className="letterhead-brand">
              <img src={logoImage} alt="Samyak International Ltd Logo" className="samyak-logo-img" style={{ height: '46px', objectFit: 'contain' }} />
              <p className="letterhead-company-sub" style={{ marginTop: '2px', fontSize: '8.5px', fontWeight: '800', color: '#374151' }}>
                {COMPANY_DETAILS.tagline}
              </p>
            </div>

            <div className="letterhead-doc-title" style={{ display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'flex-end' }}>
              <div style={{ textAlign: 'right' }}>
                <h2>Goods Receipt Note</h2>
                <div className="doc-ref-no" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                  {isEditingRef ? (
                    <input
                      type="text"
                      value={currentGrnNo}
                      onChange={(e) => setCurrentGrnNo(e.target.value)}
                      onBlur={() => setIsEditingRef(false)}
                      autoFocus
                      style={{ fontSize: '13px', fontWeight: 'bold', border: '1px solid #2563eb', padding: '2px 6px', borderRadius: '4px', textAlign: 'right' }}
                    />
                  ) : (
                    <span 
                      onClick={() => setIsEditingRef(true)}
                      title="Click to edit reference number"
                      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      {currentGrnNo}
                      <Edit3 size={12} className="no-print" style={{ opacity: 0.6, color: '#2563eb' }} />
                    </span>
                  )}
                </div>
              </div>
              <div style={{ background: '#ffffff', padding: '2px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                <QRCode2D value={currentGrnNo || 'GRN-000'} size={48} showLabel={false} margin={0} />
              </div>
            </div>
          </div>



          {/* 3-Column Address Grid */}
          <table className="address-grid-table">
            <thead>
              <tr>
                <th>Name and Address of Receiving Plant</th>
                <th>Name and Address of Supplier</th>
                <th>Inward Store Location</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="address-box-title">{COMPANY_DETAILS.name}</div>
                  <div className="address-line">{COMPANY_DETAILS.address}</div>
                  <div className="address-line">Contact Person: {COMPANY_DETAILS.contactPerson}</div>
                  <div className="address-line">Email: {COMPANY_DETAILS.email}</div>
                  <div className="address-line">Contact No: {COMPANY_DETAILS.phones}</div>
                  <div className="address-line">GSTIN: {COMPANY_DETAILS.gstin}</div>
                </td>
                <td>
                  <div className="address-box-title">{vendorDetails.name}</div>
                  <div className="address-line">{vendorDetails.address}</div>
                  <div className="address-line">Email: {vendorDetails.email}</div>
                  <div className="address-line">Contact No: {vendorDetails.contactNo}</div>
                  <div className="address-line">GSTIN: {vendorDetails.gstin}</div>
                  <div className="address-line">Kind Attention: {vendorDetails.contactPerson}</div>
                </td>
                <td>
                  <div className="address-box-title">Raw Material Store Gate 2</div>
                  <div className="address-line">Samyak Factory - Indore Unit</div>
                  <div className="address-line">{COMPANY_DETAILS.address}</div>
                  <div className="address-line">GSTIN: {COMPANY_DETAILS.gstin}</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* GRN Details Grid */}
          <div className="details-section-container">
            <div className="details-section-header">GRN Details</div>
            <table className="details-grid-table">
              <tbody>
                <tr>
                  <td className="label-col">GRN Number</td>
                  <td className="value-col">{currentGrnNo}</td>
                  <td className="label-col">GRN Date</td>
                  <td className="value-col">{receivedDate}</td>
                </tr>

                <tr>
                  <td className="label-col">Ref PO Number</td>
                  <td className="value-col">{poNumber}</td>
                  <td className="label-col">Vendor Invoice #</td>
                  <td className="value-col">{invoiceNo}</td>
                </tr>
                <tr>
                  <td className="label-col">Manufacturer Batch #</td>
                  <td className="value-col">{batchNo}</td>
                  <td className="label-col">QC Status</td>
                  <td className="value-col" style={{ color: (status || '').toLowerCase().includes('approved') ? '#059669' : ((status || '').toLowerCase().includes('pending') ? '#d97706' : '#dc2626'), fontWeight: 'bold' }}>
                    {((status || '').toLowerCase().includes('pending') ? 'PENDING QC APPROVAL' : (status || '').toLowerCase().includes('approved') ? 'APPROVED BY QC' : status).toUpperCase()}
                  </td>
                </tr>
                <tr>
                  <td className="label-col">Transporter Name</td>
                  <td className="value-col">{transporterName || 'Direct Dispatch / Self'}</td>
                  <td className="label-col">Freight Charge</td>
                  <td className="value-col">{parseFloat(freightAmount) > 0 ? formatINR(freightAmount) : 'Freight Included / Prepaid'}</td>
                </tr>
                <tr>
                  <td className="label-col">Received By</td>
                  <td className="value-col">{storeManager}</td>
                  <td className="label-col">QC Inspector</td>
                  <td className="value-col">{inspectedBy}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Inward Items Table */}
          <table className="items-table">
            <thead>
              <tr>
                <th style={{ width: '4%' }}>#</th>
                <th style={{ width: '32%' }}>Material Substrate Description</th>
                <th style={{ width: '10%' }}>HSN Code</th>
                <th style={{ width: '8%' }}>Micron</th>
                <th style={{ width: '10%' }}>Width (mm)</th>
                <th style={{ width: '10%' }}>Rolls Recd.</th>
                <th style={{ width: '12%' }}>Net Inward Wt</th>
                <th style={{ width: '10%' }}>Rate</th>
                <th style={{ width: '14%' }}>Taxable Amount</th>
              </tr>
            </thead>
            <tbody>
              {(severalItems ? printableLines : [{
                lineNo: 1,
                itemName: displayItemName,
                batchNo,
                micron,
                widthMm,
                rollsReceived,
                netWeightKg,
                purchaseRate: unitPrice,
                category
              }]).map((line, index) => {
                const lineRate = severalItems ? line.purchaseRate : unitPrice;
                const lineNet = severalItems ? line.netWeightKg : netWeightKg;
                const lineAmount = (Number(lineNet) || 0) * (Number(lineRate) || 0);
                const hsn = !severalItems || (line.category || category) === 'Film Substrates' ? '3920' : '';
                return (
                  <tr key={line.lineNo || index}>
                    <td className="center">{line.lineNo || index + 1}</td>
                    <td>
                      <div className="item-name">{severalItems ? line.itemName : displayItemName}</div>
                      <div className="item-meta">Batch Ref: {line.batchNo || batchNo}</div>
                    </td>
                    <td className="center">{hsn}</td>
                    <td className="center">{line.micron} µ</td>
                    <td className="center">{line.widthMm} mm</td>
                    <td className="center">{line.rollsReceived} Rolls</td>
                    <td className="right" style={{ fontWeight: 'bold' }}>{(lineNet ?? 0).toLocaleString()} Kg</td>
                    <td className="right">{formatINR(lineRate)}</td>
                    <td className="right">{formatINR(lineAmount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="6" className="right" style={{ fontWeight: 'bold' }}>Total Quantity Inwarded</td>
                <td className="right" style={{ fontWeight: 'bold' }}>{(shownNet ?? 0).toLocaleString()} Kg</td>
                <td colSpan="2"></td>
              </tr>
            </tfoot>
          </table>

          {/* Individual Roll / Container Weight Log Breakdown Annexure (if available) */}
          {!severalItems && Array.isArray(itemsBreakdown) && itemsBreakdown.length > 1 && (
            <div style={{ marginTop: '14px', marginBottom: '14px' }}>
              <div style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', color: '#1e3a8a', borderBottom: '1px solid #93c5fd', paddingBottom: '3px', marginBottom: '6px' }}>
                Annexure: Individual {packagingType} Scale Weight Log ({itemsBreakdown.length} Units)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5px' }} className="items-table">
                <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <td style={{ width: '8%', textAlign: 'center', fontWeight: 'bold' }}>Unit #</td>
                      <td style={{ width: '22%', textAlign: 'center', fontWeight: 'bold' }}>System Barcode ID</td>
                      <td style={{ width: '14%', textAlign: 'center', fontWeight: 'bold' }}>Vendor Ref / Lot #</td>
                      <td style={{ width: '14%', textAlign: 'right', fontWeight: 'bold' }}>Gross Wt (Kg)</td>
                      <td style={{ width: '14%', textAlign: 'right', fontWeight: 'bold' }}>Tare Wt (Kg)</td>
                      <td style={{ width: '14%', textAlign: 'right', fontWeight: 'bold' }}>Net Wt (Kg)</td>
                      <td style={{ width: '14%', textAlign: 'right', fontWeight: 'bold' }}>Est. Length (m)</td>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsBreakdown.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', fontWeight: '700' }}>{packagingType} #{item.unitNo || (idx + 1)}</td>
                        <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: '700', color: '#1e3a8a' }}>{item.barcodeId || '—'}</td>
                        <td style={{ textAlign: 'center' }}>{item.vendorRollNo || '—'}</td>
                        <td style={{ textAlign: 'right' }}>{item.grossWeightKg ? `${item.grossWeightKg} kg` : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{item.tareWeightKg ? `${item.tareWeightKg} kg` : '0 kg'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#047857' }}>{(parseFloat(item.netWeightKg) || 0).toLocaleString()} kg</td>
                        <td style={{ textAlign: 'right' }}>{item.lengthMeters ? `${(item.lengthMeters || 0).toLocaleString()} m` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
              </table>
            </div>
          )}
          {severalItems && printableLines.map((line) => (
            Array.isArray(line.rolls) && line.rolls.length > 0 ? (
              <div key={`annexure-${line.lineNo}`} style={{ marginTop: '14px', marginBottom: '14px' }}>
                <div style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', color: '#1e3a8a', borderBottom: '1px solid #93c5fd', paddingBottom: '3px', marginBottom: '6px' }}>
                  Annexure: {line.itemName} ({line.rolls.length} {line.packagingType || 'Roll'}{line.rolls.length > 1 ? 's' : ''})
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5px' }} className="items-table">
                  <tbody>
                    {line.rolls.map((item, idx) => (
                      <tr key={item.barcodeId || idx}>
                        <td style={{ textAlign: 'center' }}>{item.unitNo || idx + 1}</td>
                        <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{item.barcodeId || '—'}</td>
                        <td style={{ textAlign: 'center' }}>{item.vendorRollNo || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{(parseFloat(item.netWeightKg) || 0).toLocaleString()} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null
          ))}

          {/* Totals and Words */}
          <div className="totals-and-words-grid">
            <div className="words-block">
              <div className="word-line">
                <span className="word-label">Grand Total</span>
                <span className="word-value">{numberToWords(grandTotal)}</span>
              </div>
              <div className="word-line">
                <span className="word-label">CGST</span>
                <span className="word-value">{numberToWords(cgstAmt)}</span>
              </div>
              <div className="word-line">
                <span className="word-label">SGST</span>
                <span className="word-value">{numberToWords(sgstAmt)}</span>
              </div>
              <div className="word-line">
                <span className="word-label">IGST</span>
                <span className="word-value">{numberToWords(igstAmt)}</span>
              </div>
            </div>

            <div>
              <table className="totals-summary-table">
                <tbody>
                  <tr>
                    <td className="label">Item Total :</td>
                    <td className="amount">{formatINR(totalTaxable)}</td>
                  </tr>
                  <tr>
                    <td className="label">Total (before Tax) :</td>
                    <td className="amount">{formatINR(totalTaxable)}</td>
                  </tr>
                  <tr>
                    <td colSpan="2">
                      <table className="tax-subtable">
                        <thead>
                          <tr>
                            <th>CGST ({gstInfo.cgstRatePct}%)</th>
                            <th>SGST ({gstInfo.sgstRatePct}%)</th>
                            <th>IGST ({gstInfo.igstRatePct}%)</th>
                            <th>Cess</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{formatINR(cgstAmt)}</td>
                            <td>{formatINR(sgstAmt)}</td>
                            <td>{formatINR(igstAmt)}</td>
                            <td>₹0.00</td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td className="label">Total Tax :</td>
                    <td className="amount">{formatINR(totalTax)}</td>
                  </tr>
                  <tr style={{ borderTop: '1px solid #111' }}>
                    <td className="label" style={{ fontSize: '11px', fontWeight: 'bold' }}>Grand Total :</td>
                    <td className="amount" style={{ fontSize: '11px', fontWeight: 'bold' }}>{formatINR(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* PO Rate Discrepancy / Resolution Audit Callout if present */}
          {grnData.priceDiscrepancyResolution && (
            <div style={{ margin: '12px 0', padding: '8px 12px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '4px', fontSize: '8.5pt' }}>
              <div style={{ fontWeight: '800', color: '#047857', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚖️ PO CONTRACT RATE MISMATCH & RESOLUTION AUDIT NOTICE</span>
              </div>
              <div style={{ color: '#0f172a', fontWeight: '600', marginTop: '3px' }}>
                {grnData.priceDiscrepancyResolution.summary}
              </div>
              {grnData.priceDiscrepancyResolution.notes && (
                <div style={{ color: '#334155', fontStyle: 'italic', marginTop: '2px', fontSize: '8pt' }}>
                  Admin Remarks: "{grnData.priceDiscrepancyResolution.notes}"
                </div>
              )}
              <div style={{ fontSize: '7.5pt', color: '#64748b', marginTop: '3px' }}>
                Resolved by: <strong>{grnData.priceDiscrepancyResolution.resolvedBy}</strong> on {grnData.priceDiscrepancyResolution.resolvedAt} • PO Contract Ref: <strong>{grnData.priceDiscrepancyResolution.poNumber || grnData.poNumber}</strong>
              </div>
            </div>
          )}

          {/* QC Inspection & Terms */}
          <div className="letterhead-terms-box">
            <div style={{ display: 'flex', items: 'center', justify: 'space-between', marginBottom: '4px' }}>
              <h4 style={{ margin: 0 }}>Quality Control (QC) & Inward Inspection Report:</h4>
              <button 
                type="button" 
                onClick={handleAddTerm}
                className="no-print"
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                + Add Bullet
              </button>
            </div>
            <ul>
              <li style={{ marginBottom: '2px' }}>
                <b>QC Observations:</b> {qcNotes}
              </li>
              {(currentGrnTerms || []).map((term, idx) => (
                <li key={idx} style={{ marginBottom: '2px' }}>
                  <div style={{ display: 'flex', items: 'flex-start', gap: '4px' }}>
                    <input
                      type="text"
                      value={term}
                      onChange={(e) => handleUpdateTerm(idx, e.target.value)}
                      className="no-border-print"
                      style={{ width: '100%', background: 'transparent', border: 'none', fontSize: '9.5px', color: '#1f2937' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveTerm(idx)}
                      className="no-print"
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '10px' }}
                      title="Remove term bullet"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>


          {/* Authorised Signatory */}
          <div className="letterhead-signatory-block">
            <div style={{ fontWeight: 'bold' }}>For {COMPANY_DETAILS.name}</div>
            <div style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {signatureImage ? (
                <img src={signatureImage} alt="Authorised Signature" style={{ maxHeight: '38px', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontStyle: 'italic', fontFamily: 'serif', fontSize: '18px', fontWeight: 'bold' }}>Sy</span>
              )}
            </div>
            <div style={{ fontSize: '9px', fontWeight: 'bold' }}>Authorised Signatory</div>
          </div>

        </div>
      </div>
    </div>
  );
}
