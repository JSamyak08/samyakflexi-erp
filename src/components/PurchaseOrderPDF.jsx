import React, { useState } from 'react';
import { Printer, ArrowLeft, Edit3, Plus, Trash2 } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import { numberToWords, formatINR, calculateGSTBreakdown } from '../utils/pdfHelpers';
import { getAuthorisedSignature, getCompanyLogo, generateDocRefNumber, getDocumentTerms } from '../services/settingsService';

export default function PurchaseOrderPDF({ poData, onClose }) {
  if (!poData) return null;

  const defaultPoNum = poData.poNumber || generateDocRefNumber('po');
  const savedTerms = getDocumentTerms();
  
  const [currentPoNumber, setCurrentPoNumber] = useState(defaultPoNum);
  const [isEditingRef, setIsEditingRef] = useState(false);
  const [currentPaymentTerms, setCurrentPaymentTerms] = useState(poData.paymentTerms || savedTerms.paymentTerms || "60 Days");
  const [currentTerms, setCurrentTerms] = useState(savedTerms.poTerms || []);
  
  const signatureImage = getAuthorisedSignature();
  const logoImage = getCompanyLogo();

  const {
    poDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    deliveryDate = "24/07/2026",
    ocDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    indentDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    indentNumber = "IND/107",
    amendmentNo = "0",
    logisticDetails = "Freight Included within Indore",
    vendor = {},
    items = []
  } = poData;

  const supplier = {
    name: vendor.companyName || vendor.name || "Creative Marketing",
    address: vendor.address || "Sadhuwasvani Nagar, 2-B, Near Sadhuwasvani Garden, Indore (Madhya Pradesh) India - 452007",
    email: vendor.email || "creativemarketing.ak@gmail.com",
    contactNo: vendor.phone || vendor.contactNo || "9425066225",
    gstin: vendor.gstin || "23AAQFC4167Q1ZT",
    contactPerson: vendor.contactPerson || "Abhijeet Kher",
    stateCode: (vendor.gstin || "23").substring(0, 2)
  };

  const handleUpdateTerm = (index, value) => {
    const updated = [...currentTerms];
    updated[index] = value;
    setCurrentTerms(updated);
  };

  const handleAddTerm = () => {
    setCurrentTerms(prev => [...prev, "New term condition..."]);
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
  const gstInfo = calculateGSTBreakdown(supplier.gstin, supplier.address, totalTaxable, 18, COMPANY_DETAILS.gstin || '23AAACS9988F1Z1');
  const totalCgst = gstInfo.cgstAmount;
  const totalSgst = gstInfo.sgstAmount;
  const totalIgst = gstInfo.igstAmount;
  const totalTax = gstInfo.totalGstAmount;
  const grandTotal = gstInfo.grandTotal;

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal-toolbar no-print">
        <button className="btn-secondary" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> Back to Orders
        </button>
        <button className="btn-primary" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Printer size={16} /> Print Purchase Order PDF
        </button>
      </div>

      <div className="pdf-paper-container">
        <div className="printable-document" id="printable-po" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", color: '#0f172a' }}>
          
          {/* Executive Header Banner */}
          <div className="letterhead-header" style={{ borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="letterhead-brand">
              <img src={logoImage} alt="Samyak International Ltd Logo" className="samyak-logo-img" style={{ height: '50px', objectFit: 'contain' }} />
              <p className="letterhead-company-sub" style={{ marginTop: '4px', fontSize: '8.5px', fontWeight: '800', color: '#475569', letterSpacing: '0.5px' }}>
                BSE: SAMYAKINT • CIN: L67120MH1994PLC225907
              </p>
            </div>

            <div className="letterhead-doc-title" style={{ textAlign: 'right' }}>
              <div style={{ display: 'inline-block', background: '#0f172a', color: '#ffffff', padding: '4px 14px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '900', fontSize: '18px', marginBottom: '6px' }}>
                PURCHASE ORDER
              </div>
              <div className="doc-ref-no" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>
                Ref #: {isEditingRef ? (
                  <input
                    type="text"
                    value={currentPoNumber}
                    onChange={(e) => setCurrentPoNumber(e.target.value)}
                    onBlur={() => setIsEditingRef(false)}
                    autoFocus
                    style={{ fontSize: '13px', fontWeight: 'bold', border: '1px solid #2563eb', padding: '2px 6px', borderRadius: '4px', textAlign: 'right' }}
                  />
                ) : (
                  <span 
                    onClick={() => setIsEditingRef(true)}
                    title="Click to edit reference number"
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#4f46e5', background: '#eef2ff', padding: '2px 8px', borderRadius: '4px' }}
                  >
                    {currentPoNumber}
                    <Edit3 size={12} className="no-print" style={{ opacity: 0.8, color: '#4f46e5' }} />
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 3-Column Address Grid */}
          <table className="address-grid-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '9.5pt' }}>
            <thead>
              <tr style={{ background: '#1e293b', color: '#ffffff' }}>
                <th style={{ border: '1px solid #0f172a', padding: '6px 10px', textTransform: 'uppercase', fontSize: '8.5pt', letterSpacing: '0.5px' }}>🏢 Buyer (Bill To)</th>
                <th style={{ border: '1px solid #0f172a', padding: '6px 10px', textTransform: 'uppercase', fontSize: '8.5pt', letterSpacing: '0.5px' }}>🏭 Supplier / Vendor</th>
                <th style={{ border: '1px solid #0f172a', padding: '6px 10px', textTransform: 'uppercase', fontSize: '8.5pt', letterSpacing: '0.5px' }}>🚚 Shipping Details (Ship To)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', verticalAlign: 'top', width: '33.33%', background: '#fafafa' }}>
                  <div className="address-box-title" style={{ fontWeight: '800', color: '#0f172a', fontSize: '10pt', marginBottom: '4px', borderBottom: '1px solid #cbd5e1', paddingBottom: '3px' }}>{COMPANY_DETAILS.name}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}>{COMPANY_DETAILS.address}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}><strong>Contact Person:</strong> {COMPANY_DETAILS.contactPerson}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}><strong>Email:</strong> {COMPANY_DETAILS.email}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}><strong>Contact No:</strong> {COMPANY_DETAILS.phones}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}><strong>GSTIN:</strong> {COMPANY_DETAILS.gstin}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}><strong>Place of Supply:</strong> {COMPANY_DETAILS.placeOfSupply}</div>
                </td>
                <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', verticalAlign: 'top', width: '33.33%', background: '#ffffff' }}>
                  <div className="address-box-title" style={{ fontWeight: '800', color: '#0f172a', fontSize: '10pt', marginBottom: '4px', borderBottom: '1px solid #cbd5e1', paddingBottom: '3px' }}>{supplier.name}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}>{supplier.address}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}><strong>Email:</strong> {supplier.email}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}><strong>Contact No:</strong> {supplier.contactNo}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}><strong>GSTIN:</strong> {supplier.gstin}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}><strong>Kind Attention:</strong> {supplier.contactPerson}</div>
                </td>
                <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', verticalAlign: 'top', width: '33.33%', background: '#fafafa' }}>
                  <div className="address-box-title" style={{ fontWeight: '800', color: '#0f172a', fontSize: '10pt', marginBottom: '4px', borderBottom: '1px solid #cbd5e1', paddingBottom: '3px' }}>Factory - {COMPANY_DETAILS.name}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}>{COMPANY_DETAILS.address}</div>
                  <div className="address-line" style={{ fontSize: '9pt', color: '#334155', margin: '2px 0' }}><strong>GSTIN:</strong> {COMPANY_DETAILS.gstin}</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* PO Details Grid */}
          <div className="details-section-container" style={{ border: '1px solid #cbd5e1', borderRadius: '4px', marginBottom: '14px', overflow: 'hidden' }}>
            <div className="details-section-header" style={{ background: '#f1f5f9', padding: '6px 12px', fontWeight: '800', fontSize: '9.5pt', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #cbd5e1' }}>
              📋 Purchase Order Details
            </div>
            <table className="details-grid-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
              <tbody>
                <tr>
                  <td className="label-col" style={{ fontWeight: '700', color: '#475569', width: '16%', background: '#f8fafc', padding: '5px 8px', border: '1px solid #e2e8f0' }}>PO Number</td>
                  <td className="value-col" style={{ fontWeight: '800', color: '#0f172a', width: '34%', padding: '5px 8px', border: '1px solid #e2e8f0' }}>{currentPoNumber}</td>
                  <td className="label-col" style={{ fontWeight: '700', color: '#475569', width: '16%', background: '#f8fafc', padding: '5px 8px', border: '1px solid #e2e8f0' }}>PO Date</td>
                  <td className="value-col" style={{ fontWeight: '800', color: '#0f172a', width: '34%', padding: '5px 8px', border: '1px solid #e2e8f0' }}>{poDate}</td>
                </tr>

                <tr>
                  <td className="label-col" style={{ fontWeight: '700', color: '#475569', background: '#f8fafc', padding: '5px 8px', border: '1px solid #e2e8f0' }}>Delivery Date</td>
                  <td className="value-col" style={{ fontWeight: '700', color: '#0f172a', padding: '5px 8px', border: '1px solid #e2e8f0' }}>{deliveryDate}</td>
                  <td className="label-col" style={{ fontWeight: '700', color: '#475569', background: '#f8fafc', padding: '5px 8px', border: '1px solid #e2e8f0' }}>PO Amendment</td>
                  <td className="value-col" style={{ fontWeight: '700', color: '#0f172a', padding: '5px 8px', border: '1px solid #e2e8f0' }}>{amendmentNo}</td>
                </tr>
                <tr>
                  <td className="label-col" style={{ fontWeight: '700', color: '#475569', background: '#f8fafc', padding: '5px 8px', border: '1px solid #e2e8f0' }}>OC Date</td>
                  <td className="value-col" style={{ fontWeight: '700', color: '#0f172a', padding: '5px 8px', border: '1px solid #e2e8f0' }}>{ocDate}</td>
                  <td className="label-col" style={{ fontWeight: '700', color: '#475569', background: '#f8fafc', padding: '5px 8px', border: '1px solid #e2e8f0' }}>PO Amount</td>
                  <td className="value-col" style={{ fontWeight: '800', color: '#047857', padding: '5px 8px', border: '1px solid #e2e8f0' }}>{formatINR(grandTotal)}</td>
                </tr>
                <tr>
                  <td className="label-col" style={{ fontWeight: '700', color: '#475569', background: '#f8fafc', padding: '5px 8px', border: '1px solid #e2e8f0' }}>No of Items</td>
                  <td className="value-col" style={{ fontWeight: '700', color: '#0f172a', padding: '5px 8px', border: '1px solid #e2e8f0' }}>{poItems.length} SKUs</td>
                  <td className="label-col" style={{ fontWeight: '700', color: '#475569', background: '#f8fafc', padding: '5px 8px', border: '1px solid #e2e8f0' }}>Indent Date</td>
                  <td className="value-col" style={{ fontWeight: '700', color: '#0f172a', padding: '5px 8px', border: '1px solid #e2e8f0' }}>{indentDate}</td>
                </tr>
                <tr>
                  <td className="label-col" style={{ fontWeight: '700', color: '#475569', background: '#f8fafc', padding: '5px 8px', border: '1px solid #e2e8f0' }}>Payment Terms</td>
                  <td className="value-col" style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>
                    <input
                      type="text"
                      value={currentPaymentTerms}
                      onChange={(e) => setCurrentPaymentTerms(e.target.value)}
                      className="no-border-print"
                      style={{ width: '100%', background: 'transparent', border: 'none', fontWeight: '800', fontSize: '9pt', color: '#4f46e5' }}
                    />
                  </td>
                  <td className="label-col" style={{ fontWeight: '700', color: '#475569', background: '#f8fafc', padding: '5px 8px', border: '1px solid #e2e8f0' }}>Indent Number</td>
                  <td className="value-col" style={{ fontWeight: '700', color: '#0f172a', padding: '5px 8px', border: '1px solid #e2e8f0' }}>{indentNumber}</td>
                </tr>

                <tr>
                  <td className="label-col" style={{ fontWeight: '700', color: '#475569', background: '#f8fafc', padding: '5px 8px', border: '1px solid #e2e8f0' }}>Logistic Details</td>
                  <td className="value-col" colSpan="3" style={{ fontWeight: '600', color: '#334155', padding: '5px 8px', border: '1px solid #e2e8f0' }}>{logisticDetails}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Line Items Table */}
          <table className="items-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '9.5pt' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#ffffff' }}>
                <th style={{ width: '4%', padding: '8px 6px', border: '1px solid #0f172a', textAlign: 'center' }}>#</th>
                <th style={{ width: '32%', padding: '8px 8px', border: '1px solid #0f172a', textAlign: 'left' }}>Item Description & Make</th>
                <th style={{ width: '10%', padding: '8px 6px', border: '1px solid #0f172a', textAlign: 'center' }}>HSN Code</th>
                <th style={{ width: '10%', padding: '8px 6px', border: '1px solid #0f172a', textAlign: 'right' }}>Quantity</th>
                <th style={{ width: '10%', padding: '8px 6px', border: '1px solid #0f172a', textAlign: 'right' }}>Unit Rate</th>
                <th style={{ width: '12%', padding: '8px 6px', border: '1px solid #0f172a', textAlign: 'right' }}>Taxable Amt</th>
                <th style={{ width: '11%', padding: '8px 6px', border: '1px solid #0f172a', textAlign: 'right' }}>CGST<br/><span style={{ fontSize: '7.5pt', opacity: 0.8 }}>Rate / Amt</span></th>
                <th style={{ width: '11%', padding: '8px 6px', border: '1px solid #0f172a', textAlign: 'right' }}>SGST<br/><span style={{ fontSize: '7.5pt', opacity: 0.8 }}>Rate / Amt</span></th>
                <th style={{ width: '10%', padding: '8px 6px', border: '1px solid #0f172a', textAlign: 'right' }}>Line Total</th>
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
                    <td className="center" style={{ border: '1px solid #cbd5e1', textAlign: 'center', padding: '6px' }}>{index + 1}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}>
                      <div className="item-name" style={{ color: '#0f172a', fontWeight: '800', fontSize: '9.5pt', lineHeight: '1.3' }}>
                        {itemNameText}
                      </div>
                      {itemSpecText && <div className="item-meta" style={{ fontSize: '8.5pt', color: '#475569', marginTop: '2px', fontWeight: '600' }}>{itemSpecText}</div>}
                      {item.itemId && <div className="item-meta" style={{ fontSize: '8pt', color: '#4f46e5', fontFamily: 'monospace', fontWeight: '700', marginTop: '1px' }}>Product Code: {item.itemId}</div>}
                      {item.make && <div className="item-meta" style={{ fontSize: '8pt', color: '#64748b' }}>Make: {item.make}</div>}
                    </td>

                    <td className="center" style={{ border: '1px solid #cbd5e1', textAlign: 'center', padding: '6px', fontWeight: '600' }}>{item.hsnCode || '3215'}</td>
                    <td className="right" style={{ border: '1px solid #cbd5e1', textAlign: 'right', padding: '6px', fontWeight: '700', color: '#0f172a' }}>{qty.toFixed(2)} Kg</td>
                    <td className="right" style={{ border: '1px solid #cbd5e1', textAlign: 'right', padding: '6px' }}>{formatINR(rate)}</td>
                    <td className="right" style={{ border: '1px solid #cbd5e1', textAlign: 'right', padding: '6px', fontWeight: '600' }}>{formatINR(taxable)}</td>
                    <td className="right" style={{ border: '1px solid #cbd5e1', textAlign: 'right', padding: '6px', fontSize: '8.5pt' }}>
                      {cgstRate}%<br/><span style={{ fontWeight: '600' }}>{formatINR(cgstAmt)}</span>
                    </td>
                    <td className="right" style={{ border: '1px solid #cbd5e1', textAlign: 'right', padding: '6px', fontSize: '8.5pt' }}>
                      {sgstRate}%<br/><span style={{ fontWeight: '600' }}>{formatINR(sgstAmt)}</span>
                    </td>
                    <td className="right" style={{ border: '1px solid #cbd5e1', textAlign: 'right', padding: '6px', fontWeight: '800', color: '#0f172a' }}>{formatINR(totalAmt)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#e2e8f0', fontWeight: 'bold' }}>
                <td colSpan="3" className="right" style={{ textAlign: 'right', border: '1px solid #94a3b8', padding: '6px 8px', fontWeight: '800' }}>Total Quantity Order:</td>
                <td className="right" style={{ textAlign: 'right', border: '1px solid #94a3b8', padding: '6px 8px', fontWeight: '900', color: '#0f172a' }}>{totalQtyKg.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Kg</td>
                <td colSpan="5" style={{ border: '1px solid #94a3b8' }}></td>
              </tr>
            </tfoot>
          </table>

          {/* Totals & Amounts in Words */}
          <div className="totals-and-words-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '4px', marginBottom: '14px', background: '#ffffff' }}>
            <div className="words-block" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontWeight: '800', fontSize: '9pt', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '4px' }}>
                🔤 Amount in Words
              </div>
              <div className="word-line" style={{ display: 'grid', gridTemplateColumns: '110px 1fr', fontSize: '8.5pt' }}>
                <span className="word-label" style={{ fontWeight: '700', color: '#475569' }}>PO Total Amount:</span>
                <span className="word-value" style={{ fontWeight: '800', color: '#0f172a' }}>{numberToWords(grandTotal)}</span>
              </div>
              <div className="word-line" style={{ display: 'grid', gridTemplateColumns: '110px 1fr', fontSize: '8.5pt' }}>
                <span className="word-label" style={{ fontWeight: '700', color: '#475569' }}>CGST Amount:</span>
                <span className="word-value" style={{ fontWeight: '700', color: '#334155' }}>{numberToWords(totalCgst)}</span>
              </div>
              <div className="word-line" style={{ display: 'grid', gridTemplateColumns: '110px 1fr', fontSize: '8.5pt' }}>
                <span className="word-label" style={{ fontWeight: '700', color: '#475569' }}>SGST Amount:</span>
                <span className="word-value" style={{ fontWeight: '700', color: '#334155' }}>{numberToWords(totalSgst)}</span>
              </div>
            </div>

            <div>
              <table className="totals-summary-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
                <tbody>
                  <tr>
                    <td className="label" style={{ fontWeight: '700', color: '#475569', padding: '3px 6px' }}>Item Subtotal :</td>
                    <td className="amount" style={{ textAlign: 'right', fontWeight: '700', color: '#0f172a', padding: '3px 6px' }}>{formatINR(totalTaxable)}</td>
                  </tr>
                  <tr>
                    <td className="label" style={{ fontWeight: '700', color: '#475569', padding: '3px 6px' }}>Total (before Tax) :</td>
                    <td className="amount" style={{ textAlign: 'right', fontWeight: '700', color: '#0f172a', padding: '3px 6px' }}>{formatINR(totalTaxable)}</td>
                  </tr>
                  <tr>
                    <td colSpan="2" style={{ padding: '4px 0' }}>
                      <table className="tax-subtable" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt', textAlign: 'center' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', fontWeight: '700', color: '#334155' }}>
                            <th style={{ border: '1px solid #cbd5e1', padding: '3px' }}>CGST ({gstInfo.cgstRatePct}%)</th>
                            <th style={{ border: '1px solid #cbd5e1', padding: '3px' }}>SGST ({gstInfo.sgstRatePct}%)</th>
                            <th style={{ border: '1px solid #cbd5e1', padding: '3px' }}>IGST ({gstInfo.igstRatePct}%)</th>
                            <th style={{ border: '1px solid #cbd5e1', padding: '3px' }}>Cess</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ border: '1px solid #cbd5e1', padding: '3px', fontWeight: '600' }}>{formatINR(totalCgst)}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '3px', fontWeight: '600' }}>{formatINR(totalSgst)}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '3px', fontWeight: '600' }}>{formatINR(totalIgst)}</td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '3px' }}>₹0.00</td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td className="label" style={{ fontWeight: '700', color: '#475569', padding: '3px 6px' }}>Total Tax Amount :</td>
                    <td className="amount" style={{ textAlign: 'right', fontWeight: '700', color: '#0f172a', padding: '3px 6px' }}>{formatINR(totalTax)}</td>
                  </tr>
                  <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc' }}>
                    <td className="label" style={{ fontSize: '10.5pt', fontWeight: '900', color: '#0f172a', padding: '6px' }}>Grand Total :</td>
                    <td className="amount" style={{ fontSize: '11pt', fontWeight: '900', color: '#047857', padding: '6px', textAlign: 'right' }}>{formatINR(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="letterhead-terms-box" style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '10px 12px', marginBottom: '14px', background: '#fafafa' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
              <h4 style={{ margin: 0, fontSize: '9pt', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📜 Terms And Conditions</h4>
              <button 
                type="button" 
                onClick={handleAddTerm}
                className="no-print"
                style={{ background: '#eef2ff', border: 'none', color: '#4f46e5', fontSize: '8.5pt', cursor: 'pointer', fontWeight: '700', padding: '2px 8px', borderRadius: '4px' }}
              >
                + Add Bullet
              </button>
            </div>
            <ul style={{ margin: 0, paddingLeft: '16px' }}>
              {(currentTerms || []).map((term, idx) => (
                <li key={idx} style={{ marginBottom: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="text"
                      value={term}
                      onChange={(e) => handleUpdateTerm(idx, e.target.value)}
                      className="no-border-print"
                      style={{ width: '100%', background: 'transparent', border: 'none', fontSize: '8.5pt', color: '#334155', fontWeight: '500' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveTerm(idx)}
                      className="no-print"
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '11pt', fontWeight: 'bold' }}
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
          <div className="letterhead-signatory-block" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: '16px', textAlign: 'right' }}>
            <div style={{ fontWeight: '800', fontSize: '9.5pt', color: '#0f172a' }}>For {COMPANY_DETAILS.name}</div>
            <div style={{ height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', margin: '4px 0' }}>
              {signatureImage ? (
                <img src={signatureImage} alt="Authorised Signature" style={{ maxHeight: '42px', objectFit: 'contain' }} />
              ) : (
                <span style={{ fontStyle: 'italic', fontFamily: 'serif', fontSize: '20px', fontWeight: 'bold', color: '#1e293b' }}>Sy</span>
              )}
            </div>
            <div style={{ fontSize: '9pt', fontWeight: '800', color: '#475569', borderTop: '1px solid #0f172a', paddingTop: '3px', minWidth: '150px' }}>Authorised Signatory</div>
          </div>

        </div>
      </div>
    </div>
  );
}

