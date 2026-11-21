import React, { useState } from 'react';
import { Printer, ArrowLeft, Edit3 } from 'lucide-react';
import { loadLetterhead } from '../services/companyProfile';
import CompanyProfileNotice from './CompanyProfileNotice';
import { numberToWords, formatINR, calculateGSTBreakdown } from '../utils/pdfHelpers';
import { PDF_DOCUMENT_TITLES, pdfFileBase, printWithPdfName } from '../utils/pdfFileName';
import { formatPlantDateTime } from '../utils/dbDates';
import { displayAmendmentLabel, revisionNumber } from '../utils/poAmendment';
import { getAuthorisedSignature, getCompanyLogo, generateDocRefNumber, getDocumentTerms } from '../services/settingsService';
import { generateSyncQrSvg } from '../utils/qrCodeSvg';
import './purchaseOrderPrint.css';

export default function PurchaseOrderPDF({ poData, vendors = [], onClose }) {
  const defaultPoNum = poData?.poNumber || generateDocRefNumber('po');
  const savedTerms = getDocumentTerms();
  
  const [currentPoNumber, setCurrentPoNumber] = useState(defaultPoNum);
  const [isEditingRef, setIsEditingRef] = useState(false);
  const [currentPaymentTerms, setCurrentPaymentTerms] = useState(poData?.paymentTerms || savedTerms.paymentTerms || "60 Days");
  const [currentTerms, setCurrentTerms] = useState(savedTerms.poTerms || []);
  const letterhead = loadLetterhead();

  if (!poData) return null;
  if (letterhead.error) return <CompanyProfileNotice message={letterhead.error} onClose={onClose} />;
  const COMPANY_DETAILS = letterhead.company;
  
  const signatureImage = getAuthorisedSignature();
  const logoImage = getCompanyLogo();
  const resolvedLogo = (logoImage && logoImage !== 'null' && logoImage !== 'undefined') 
    ? logoImage 
    : (COMPANY_DETAILS.logoUrl || '/samyak-logo.png');

  const qrValue = `SAMYAK-ERP-PO:${currentPoNumber || 'PO-000'}`;
  const qrSvg = generateSyncQrSvg(qrValue, 0);
  const qrDataUrl = qrSvg ? `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}` : '';

  const {
    poDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    deliveryDate = "24/07/2026",
    ocDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    indentDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    indentNumber = "IND/107",
    logisticDetails = "Freight Included within Indore",
    vendor = {},
    items = []
  } = poData;

  // Dynamically resolve vendor record from vendors list if available
  const rawVendorName = typeof vendor === 'string' ? vendor : (vendor?.companyName || vendor?.name || '');
  const matchedVendor = (vendors || []).find(v => 
    (vendor?.id && v.id === vendor.id) ||
    (rawVendorName && (v.companyName || v.name || '').toLowerCase().trim() === rawVendorName.toLowerCase().trim())
  ) || (typeof vendor === 'object' && vendor !== null ? vendor : {});

  const supplier = {
    name: matchedVendor.companyName || matchedVendor.name || rawVendorName || "Vendor / Supplier",
    address: matchedVendor.address || vendor.address || "Address on file / Registered Vendor Office",
    email: matchedVendor.email || vendor.email || "—",
    contactNo: matchedVendor.phone || matchedVendor.contactNo || matchedVendor.contact_no || vendor.phone || vendor.contactNo || "—",
    gstin: matchedVendor.gstin || vendor.gstin || "—",
    contactPerson: matchedVendor.contactPerson || matchedVendor.contact_person || vendor.contactPerson || "Sales & Commercial Desk",
    stateCode: (matchedVendor.gstin || vendor.gstin || "23").substring(0, 2)
  };

  const handleUpdateTerm = (index, value) => {
    const updated = [...currentTerms];
    updated[index] = value;
    setCurrentTerms(updated);
  };

  const handleAddTerm = () => {
    setCurrentTerms(prev => [...prev, "New purchase order condition..."]);
  };

  const handleRemoveTerm = (index) => {
    setCurrentTerms(prev => prev.filter((_, i) => i !== index));
  };

  // Standard sample items if empty
  const poItems = items && items.length > 0 ? items : [
    {
      id: 1,
      description: "Flint Process Magenta (REVERSE)",
      itemId: "WCL4-302K-01FW",
      make: "Flint",
      hsnCode: "3215",
      qtyKg: 400,
      rate: 250
    },
    {
      id: 2,
      description: "Flint Super White 55B (REVERSE)",
      itemId: "WCL4-001K-01GD",
      make: "Flint",
      hsnCode: "3215",
      qtyKg: 500,
      rate: 240
    }
  ];

  // Calculated Totals
  const totalQtyKg = poItems.reduce((acc, item) => acc + (parseFloat(item.qtyKg) || 0), 0);
  const totalTaxable = poItems.reduce((acc, item) => {
    const qty = parseFloat(item.qtyKg) || 0;
    const rate = parseFloat(item.rate) || 0;
    return acc + (qty * rate);
  }, 0);

  // Indian GST Calculation (Vendor in 23 MP: CGST 9% + SGST 9% vs Inter-state: IGST 18%)
  const amendmentRevision = revisionNumber(poData);
  const amendmentLabel = displayAmendmentLabel(poData);
  const amendmentDate = amendmentRevision > 0 ? formatPlantDateTime(poData.amendedAt || poData.amended_at) : '';
  const gstInfo = calculateGSTBreakdown(supplier.gstin, supplier.address, totalTaxable, 18, COMPANY_DETAILS.gstin);
  const totalCgst = gstInfo.cgstAmount;
  const totalSgst = gstInfo.sgstAmount;
  const totalIgst = gstInfo.igstAmount;
  const totalTax = gstInfo.totalGstAmount;
  const grandTotal = gstInfo.grandTotal;
  const poFileBase = pdfFileBase({
    title: PDF_DOCUMENT_TITLES.purchaseOrder,
    number: currentPoNumber || 'Unnumbered',
  });

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal-toolbar no-print">
        <button className="btn-secondary" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> Back to Orders
        </button>
        <button className="btn-primary" onClick={() => printWithPdfName(poFileBase)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Printer size={16} /> Print Purchase Order PDF
        </button>
      </div>

      <div className="pdf-paper-container">
        <div className="printable-document" id="printable-po" data-pdf-file-name={poFileBase}>
          
          {/* Executive Header Banner */}
          <div className="po-header">
            <div className="po-brand">
              <img 
                src={resolvedLogo} 
                alt={`${COMPANY_DETAILS.name} Logo`} 
                className="po-logo-img"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fb = e.currentTarget.nextElementSibling;
                  if (fb) fb.style.display = 'block';
                }}
              />
              <div className="po-company-fallback" style={{ display: 'none' }}>
                {COMPANY_DETAILS.name}
              </div>
              {COMPANY_DETAILS.tagline ? (
                <div className="po-tagline">
                  {COMPANY_DETAILS.tagline}
                </div>
              ) : null}
            </div>

            <div className="po-title-block">
              <div>
                <div className="po-title-text">PURCHASE ORDER</div>
                <div className="po-meta-item">
                  <span>PO Ref #: </span>
                  {isEditingRef ? (
                    <input
                      type="text"
                      value={currentPoNumber}
                      onChange={(e) => setCurrentPoNumber(e.target.value)}
                      onBlur={() => setIsEditingRef(false)}
                      autoFocus
                      style={{ fontSize: '8pt', fontWeight: 'bold', border: '1px solid #2563eb', padding: '1px 5px', borderRadius: '3px', textAlign: 'right' }}
                    />
                  ) : (
                    <span 
                      onClick={() => setIsEditingRef(true)}
                      title="Click to edit reference number"
                      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#1e40af', fontWeight: '800' }}
                    >
                      {currentPoNumber}
                      <Edit3 size={11} className="no-print" style={{ opacity: 0.7, color: '#3b82f6' }} />
                    </span>
                  )}
                </div>
                <div className="po-meta-item">
                  <span>Date: </span><strong>{poDate}</strong>
                </div>
                <div className="po-meta-item" style={{ marginTop: '2px' }}>
                  <span style={{
                    display: 'inline-block',
                    fontSize: '7.2pt',
                    fontWeight: '800',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    background: amendmentRevision > 0 ? '#fffbeb' : '#f1f5f9',
                    color: amendmentRevision > 0 ? '#b45309' : '#334155',
                    border: `1px solid ${amendmentRevision > 0 ? '#fde68a' : '#cbd5e1'}`
                  }}>
                    {amendmentLabel}{amendmentDate ? ` · ${amendmentDate}` : ''}
                  </span>
                </div>
              </div>
              <div className="po-qr-box" title={`QR Code: ${qrValue}`}>
                {qrSvg ? (
                  <div 
                    className="po-qr-svg-wrap"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                    style={{ width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  />
                ) : null}
                <img
                  src={qrDataUrl}
                  alt="Purchase Order QR Code"
                  className="po-qr-img"
                  width="42"
                  height="42"
                  style={{ display: qrSvg ? 'none' : 'block' }}
                />
              </div>
            </div>
          </div>

          {/* 3-Column Address Grid */}
          <table className="po-address-table address-grid-table">
            <thead>
              <tr>
                <th>Buyer (Bill To)</th>
                <th>Supplier / Vendor</th>
                <th>Shipping Details (Ship To)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="po-party-name">{COMPANY_DETAILS.name}</div>
                  <div style={{ color: '#334155', fontSize: '8pt', marginBottom: '3px', lineHeight: '1.3' }}>{COMPANY_DETAILS.address}</div>
                  <div className="po-kv-line"><span className="po-kv-label">Contact Person: </span><strong>{COMPANY_DETAILS.contactPerson}</strong></div>
                  <div className="po-kv-line"><span className="po-kv-label">Email: </span>{COMPANY_DETAILS.email}</div>
                  <div className="po-kv-line"><span className="po-kv-label">Contact No: </span>{COMPANY_DETAILS.phones}</div>
                  <div className="po-kv-line"><span className="po-kv-label">GSTIN: </span><strong>{COMPANY_DETAILS.gstin}</strong></div>
                  <div className="po-kv-line"><span className="po-kv-label">Place of Supply: </span>{COMPANY_DETAILS.placeOfSupply}</div>
                </td>
                <td>
                  <div className="po-party-name">{supplier.name}</div>
                  <div style={{ color: '#334155', fontSize: '8pt', marginBottom: '3px', lineHeight: '1.3' }}>{supplier.address}</div>
                  <div className="po-kv-line"><span className="po-kv-label">Contact No: </span><strong>{supplier.contactNo}</strong></div>
                  <div className="po-kv-line"><span className="po-kv-label">Email: </span>{supplier.email}</div>
                  <div className="po-kv-line"><span className="po-kv-label">GSTIN: </span><strong>{supplier.gstin}</strong></div>
                  <div className="po-kv-line"><span className="po-kv-label">Kind Attention: </span>{supplier.contactPerson}</div>
                </td>
                <td>
                  <div className="po-party-name">Factory - {COMPANY_DETAILS.name}</div>
                  <div style={{ color: '#334155', fontSize: '8pt', marginBottom: '3px', lineHeight: '1.3' }}>{COMPANY_DETAILS.address}</div>
                  <div className="po-kv-line"><span className="po-kv-label">GSTIN: </span><strong>{COMPANY_DETAILS.gstin}</strong></div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* PO Details Grid */}
          <div className="po-details-card">
            <div className="po-section-header">
              Purchase Order & Logistics Details
            </div>
            <table className="po-details-table details-grid-table">
              <tbody>
                <tr>
                  <td className="label-col">PO Number</td>
                  <td className="value-col">{currentPoNumber}</td>
                  <td className="label-col">PO Date</td>
                  <td className="value-col">{poDate}</td>
                </tr>
                <tr>
                  <td className="label-col">Delivery Date</td>
                  <td className="value-col">{deliveryDate}</td>
                  <td className="label-col">Amendment</td>
                  <td className="value-col">{amendmentLabel}{amendmentDate ? ` · ${amendmentDate}` : ''}</td>
                </tr>
                <tr>
                  <td className="label-col">OC Date</td>
                  <td className="value-col">{ocDate}</td>
                  <td className="label-col">PO Amount</td>
                  <td className="value-col" style={{ color: '#0f172a', fontWeight: '900' }}>{formatINR(grandTotal)}</td>
                </tr>
                <tr>
                  <td className="label-col">No of Items</td>
                  <td className="value-col">{poItems.length} SKUs</td>
                  <td className="label-col">Indent Date</td>
                  <td className="value-col">{indentDate}</td>
                </tr>
                <tr>
                  <td className="label-col">Payment Terms</td>
                  <td className="value-col">
                    <span className="no-print" style={{ display: 'block', width: '100%' }}>
                      <input
                        type="text"
                        value={currentPaymentTerms}
                        onChange={(e) => setCurrentPaymentTerms(e.target.value)}
                        style={{ width: '100%', background: 'transparent', border: 'none', fontWeight: '800', fontSize: '7.8pt', color: '#1e40af', padding: 0 }}
                      />
                    </span>
                    <span className="po-print-only" style={{ display: 'none', fontWeight: '800', fontSize: '7.8pt', color: '#0f172a' }}>
                      {currentPaymentTerms}
                    </span>
                  </td>
                  <td className="label-col">Indent Number</td>
                  <td className="value-col">{indentNumber}</td>
                </tr>
                <tr>
                  <td className="label-col">Logistic Details</td>
                  <td className="value-col" colSpan="3" style={{ color: '#334155', fontWeight: '600' }}>{logisticDetails}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Line Items Table */}
          <table className="po-items-table">
            <thead>
              <tr>
                <th style={{ width: '3.5%', textAlign: 'center' }}>#</th>
                <th style={{ width: '27%', textAlign: 'left' }}>Item Description & Make</th>
                <th style={{ width: '6%', textAlign: 'center' }}>HSN Code</th>
                <th style={{ width: '9%', textAlign: 'right' }}>Quantity</th>
                <th style={{ width: '8.5%', textAlign: 'right' }}>Unit Rate</th>
                <th style={{ width: '13%', textAlign: 'right' }}>Taxable Amt</th>
                <th style={{ width: '10%', textAlign: 'right' }}>
                  CGST<br/><span style={{ fontSize: '6.5pt', fontWeight: 500, opacity: 0.9 }}>Rate / Amt</span>
                </th>
                <th style={{ width: '10%', textAlign: 'right' }}>
                  SGST<br/><span style={{ fontSize: '6.5pt', fontWeight: 500, opacity: 0.9 }}>Rate / Amt</span>
                </th>
                <th style={{ width: '13%', textAlign: 'right' }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {poItems.map((item, index) => {
                const qty = parseFloat(item.qtyKg) || 0;
                const rate = parseFloat(item.rate) || 0;
                const taxable = qty * rate;
                const cgstRate = parseFloat(item.cgstRate) || 9;
                const sgstRate = parseFloat(item.sgstRate) || 9;
                const cgstAmt = (taxable * cgstRate) / 100;
                const sgstAmt = (taxable * sgstRate) / 100;
                const totalAmt = taxable + cgstAmt + sgstAmt;

                let rawName = item.itemDesc || item.description || item.itemName || item.name || item.item_name || item.filmType || "Material Item";
                if (typeof rawName === 'string' && rawName.includes('|||')) {
                  rawName = rawName.split('|||')[0].trim();
                }
                const itemNameText = rawName.replace(/\s*\([^)]*\)\s*$/, '').trim();
                const itemSpecText = item.spec || (item.widthMm ? `Width: ${item.widthMm}mm` : '');

                return (
                  <tr key={index} style={{ background: index % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td className="center" style={{ fontWeight: '700', color: '#64748b' }}>{index + 1}</td>
                    <td style={{ wordBreak: 'break-word' }}>
                      <div style={{ color: '#0f172a', fontWeight: '800', fontSize: '8pt', lineHeight: '1.25' }}>
                        {itemNameText}
                      </div>
                      {itemSpecText && <div style={{ fontSize: '7.2pt', color: '#475569', marginTop: '1px', fontWeight: '600' }}>{itemSpecText}</div>}
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
                        {item.itemId && (
                          <span style={{ fontSize: '7pt', color: '#1e40af', background: '#eff6ff', padding: '1px 4px', borderRadius: '3px', fontFamily: 'monospace', fontWeight: '700', border: '1px solid #bfdbfe' }}>
                            Product Code: {item.itemId}
                          </span>
                        )}
                        {item.make && (
                          <span style={{ fontSize: '7pt', color: '#64748b', fontWeight: '600' }}>
                            Make: {item.make}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="center po-num" style={{ fontWeight: '700', color: '#334155' }}>{item.hsnCode || '3215'}</td>
                    <td className="right po-num" style={{ fontWeight: '700', color: '#0f172a' }}>{qty.toFixed(2)} Kg</td>
                    <td className="right po-num">{formatINR(rate)}</td>
                    <td className="right po-num" style={{ fontWeight: '700' }}>{formatINR(taxable)}</td>
                    <td className="right po-num" style={{ fontSize: '7.4pt' }}>
                      <span style={{ fontSize: '6.6pt', color: '#64748b', display: 'block', lineHeight: 1.1 }}>{cgstRate}%</span>
                      <span style={{ fontWeight: '700' }}>{formatINR(cgstAmt)}</span>
                    </td>
                    <td className="right po-num" style={{ fontSize: '7.4pt' }}>
                      <span style={{ fontSize: '6.6pt', color: '#64748b', display: 'block', lineHeight: 1.1 }}>{sgstRate}%</span>
                      <span style={{ fontWeight: '700' }}>{formatINR(sgstAmt)}</span>
                    </td>
                    <td className="right po-num" style={{ fontWeight: '800', color: '#0f172a' }}>{formatINR(totalAmt)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3" style={{ textAlign: 'right', fontWeight: '800', color: '#334155' }}>Total Quantity Order:</td>
                <td className="right po-num" style={{ fontWeight: '900', color: '#0f172a' }}>{(totalQtyKg || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} Kg</td>
                <td colSpan="5" style={{ background: '#f8fafc' }}></td>
              </tr>
            </tfoot>
          </table>

          {/* Totals & Amounts in Words */}
          <div className="po-summary-grid">
            <div className="po-words-block">
              <div className="po-words-title">
                Amount In Words (INR)
              </div>
              <div className="po-word-row">
                <span className="po-word-label">PO Total Amount:</span>
                <span className="po-word-value">{numberToWords(grandTotal)}</span>
              </div>
              <div className="po-word-row">
                <span className="po-word-label">CGST Amount:</span>
                <span className="po-word-value" style={{ color: '#475569', fontWeight: '600' }}>{numberToWords(totalCgst)}</span>
              </div>
              <div className="po-word-row">
                <span className="po-word-label">SGST Amount:</span>
                <span className="po-word-value" style={{ color: '#475569', fontWeight: '600' }}>{numberToWords(totalSgst)}</span>
              </div>
            </div>

            <div>
              <table className="po-totals-table">
                <tbody>
                  <tr>
                    <td className="label">Item Subtotal :</td>
                    <td className="amount">{formatINR(totalTaxable)}</td>
                  </tr>
                  <tr>
                    <td className="label">Total (before Tax) :</td>
                    <td className="amount">{formatINR(totalTaxable)}</td>
                  </tr>
                  <tr>
                    <td colSpan="2" style={{ padding: '3px 0' }}>
                      <table className="po-tax-subtable">
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
                            <td>{formatINR(totalCgst)}</td>
                            <td>{formatINR(totalSgst)}</td>
                            <td>{formatINR(totalIgst)}</td>
                            <td>₹0.00</td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td className="label">Total Tax Amount :</td>
                    <td className="amount">{formatINR(totalTax)}</td>
                  </tr>
                  <tr className="po-grand-total-row">
                    <td className="label">Grand Total :</td>
                    <td className="amount">{formatINR(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Rate Discrepancy / Resolution Audit Callout if present */}
          {poData.priceDiscrepancyResolution && (
            <div style={{ margin: '8px 0', padding: '6px 10px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '4px', fontSize: '8pt' }}>
              <div style={{ fontWeight: '800', color: '#047857', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>INWARD RATE MISMATCH & RESOLUTION AUDIT NOTICE</span>
              </div>
              <div style={{ color: '#0f172a', fontWeight: '600', marginTop: '2px' }}>
                {poData.priceDiscrepancyResolution.summary}
              </div>
              {poData.priceDiscrepancyResolution.notes && (
                <div style={{ color: '#334155', fontStyle: 'italic', marginTop: '1.5px', fontSize: '7.5pt' }}>
                  Admin Notes: "{poData.priceDiscrepancyResolution.notes}"
                </div>
              )}
              <div style={{ fontSize: '7pt', color: '#64748b', marginTop: '2px' }}>
                Authorized by: <strong>{poData.priceDiscrepancyResolution.resolvedBy}</strong> on {formatPlantDateTime(poData.priceDiscrepancyResolution.resolvedAt)} • Linked GRN: <strong>{poData.priceDiscrepancyResolution.grnNo || 'Inward GRN'}</strong>
              </div>
            </div>
          )}

          {/* Terms & Conditions */}
          <div className="po-terms-card">
            <div className="po-terms-header">
              <h4 className="po-terms-title">Terms And Conditions</h4>
              <button 
                type="button" 
                onClick={handleAddTerm}
                className="no-print"
                style={{ 
                  background: '#eff6ff', 
                  border: '1px solid #bfdbfe', 
                  color: '#1e40af', 
                  fontSize: '7.2pt', 
                  cursor: 'pointer', 
                  fontWeight: '700', 
                  padding: '2px 8px', 
                  borderRadius: '3px' 
                }}
              >
                + Add Bullet
              </button>
            </div>
            <ol className="po-terms-list">
              {(currentTerms || []).map((term, idx) => (
                <li key={idx} style={{ marginBottom: '2px' }}>
                  <div className="no-print" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
                    <textarea
                      rows={Math.max(1, Math.ceil(term.length / 85))}
                      value={term}
                      onChange={(e) => handleUpdateTerm(idx, e.target.value)}
                      style={{ 
                        flex: '1 1 0%', 
                        minWidth: 0, 
                        width: '100%',
                        background: 'transparent', 
                        border: '1px dashed #cbd5e1', 
                        borderRadius: '3px',
                        fontSize: '7.6pt', 
                        color: '#334155', 
                        fontWeight: '500', 
                        padding: '2px 5px',
                        resize: 'none',
                        lineHeight: '1.25',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveTerm(idx)}
                      style={{ 
                        flex: '0 0 auto',
                        background: 'none', 
                        border: 'none', 
                        color: '#dc2626', 
                        cursor: 'pointer', 
                        fontSize: '11pt', 
                        lineHeight: '1',
                        fontWeight: 'bold',
                        padding: '2px 4px'
                      }}
                      title="Remove term bullet"
                    >
                      ×
                    </button>
                  </div>
                  <div className="po-print-term" style={{ display: 'none', wordBreak: 'break-word', fontSize: '7.5pt', lineHeight: '1.25', color: '#334155' }}>
                    {term}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Authorised Signatory */}
          <div className="po-sign-container">
            <div className="po-sign-box">
              <div className="po-sign-company">For {COMPANY_DETAILS.name}</div>
              <div className="po-sign-img-slot">
                {signatureImage ? (
                  <img src={signatureImage} alt="Authorised Signature" className="po-sign-img" />
                ) : (
                  <span style={{ fontStyle: 'italic', fontFamily: 'serif', fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>Sy</span>
                )}
              </div>
              <div className="po-sign-role">Authorised Signatory</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
