import React, { useState } from 'react';
import { Printer, ArrowLeft, Edit3, Plus, Trash2 } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import { numberToWords, formatINR, calculateGSTBreakdown } from '../utils/pdfHelpers';
import { getAuthorisedSignature, getCompanyLogo, generateDocRefNumber, getDocumentTerms } from '../services/settingsService';

export default function DeliveryChallanPDF({ challanData, onClose }) {
  if (!challanData) return null;

  const defaultChallanNo = challanData.challanNo || generateDocRefNumber('dc');
  const savedTerms = getDocumentTerms();

  const [currentChallanNo, setCurrentChallanNo] = useState(defaultChallanNo);
  const [isEditingRef, setIsEditingRef] = useState(false);
  const [currentDcTerms, setCurrentDcTerms] = useState(
    Array.isArray(challanData.termsAndConditions) && challanData.termsAndConditions.length > 0 
      ? challanData.termsAndConditions 
      : (savedTerms.dcTerms || [])
  );
  
  const signatureImage = getAuthorisedSignature();
  const logoImage = getCompanyLogo();

  const handleUpdateTerm = (index, value) => {
    const updated = [...currentDcTerms];
    updated[index] = value;
    setCurrentDcTerms(updated);
  };

  const handleAddTerm = () => {
    setCurrentDcTerms(prev => [...prev, "New dispatch terms & conditions line..."]);
  };

  const handleRemoveTerm = (index) => {
    setCurrentDcTerms(prev => prev.filter((_, i) => i !== index));
  };

  const {
    invoiceNo = "SIL/INV/26-27/042",
    dispatchDateTime = new Date().toISOString().slice(0, 16).replace('T', ' '),
    partyType = "Client",
    clientName = "Britannia Industries Ltd",
    partyName = "",
    clientAddress = "Plot 12, Pithampur Industrial Area Sector III, Dhar, M.P. - 454775",
    clientGstin = "23AAACB1234F1Z5",
    clientContactPerson = "Rajesh Sharma",
    clientPhone = "+91 98260 12345",
    vehicleNo = "MP-09-AB-1234",
    transporterName = "Self / Direct Truck Delivery",
    driverPhone = "+91 91110 99887",
    poRefNo = "PO-BRIT-2026-991",
    debitNoteNo = "",
    jobName = "Britannia Bourbon 250g Printed Laminate Film",
    challanNature = "Returnable Material",
    freightCharges = 0,
    items = [
      { id: 1, description: "Britannia Bourbon 250g PET/METPET Film Roll", itemDetails: "Primary laminate roll for packaging", hsnSac: "3923", quantity: 1250, unit: "Kg", rate: 195, amount: 243750 }
    ],
    gstRatePct = 18,
    taxType = 'auto',
    dispatchedBy = "Dilip Joshi (Dispatch Store Incharge)",
    remarks = "Material dispatched in 12 rolls wrapped in waterproof Stretch Film.",
    returnStatus = "",
    returnInwardHistory = []
  } = challanData;

  const displayName = clientName || partyName || "Client / Vendor Party";

  const CHALLAN_NATURE_OPTIONS = [
    'Returnable Material',
    'Non-Returnable Material',
    'Sale of Goods',
    'Job Work Material - Returnable',
    'Maintenance Material - Returnable',
    'QC Reject - Return to Vendor'
  ];

  // Calculate row amounts & tax breakdowns
  const itemRows = (Array.isArray(items) && items.length > 0) ? items : [
    { id: 1, description: "Flexible Packaging Laminated Film Rolls", itemDetails: "", hsnSac: "3923", quantity: 1000, unit: "Kg", rate: 180, amount: 180000 }
  ];

  const subtotalItems = itemRows.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const rate = parseFloat(item.rate) || 0;
    return sum + (item.amount ? parseFloat(item.amount) : qty * rate);
  }, 0);

  const freightAmt = parseFloat(freightCharges) || 0;
  const subtotalTaxable = subtotalItems + freightAmt;

  const gstCalc = calculateGSTBreakdown(clientGstin, clientAddress, subtotalTaxable, gstRatePct, COMPANY_DETAILS.gstin, taxType);
  const totalQtyKg = itemRows.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);

  const selectedNature = challanData.challanNature || challanData.movementType || challanData.natureOfMovement || "Sale of Goods";

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal-toolbar no-print">
        <button className="btn-secondary" onClick={onClose}>
          <ArrowLeft size={16} /> Back to Dispatch Hub
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print Delivery Challan
        </button>
      </div>

      <div className="pdf-paper-container">
        <div className="printable-document">
          {/* Header */}
          <div className="letterhead-header" style={{ paddingBottom: '8px', marginBottom: '8px' }}>
            <div className="letterhead-brand">
              <img src={logoImage} alt="Samyak International Ltd Logo" className="samyak-logo-img" style={{ height: '36px', objectFit: 'contain' }} />
              <p className="letterhead-company-sub" style={{ marginTop: '2px', fontSize: '8px', fontWeight: '800', color: '#374151' }}>
                BSE: SAMYAKINT • CIN: L67120MH1994PLC225907
              </p>
            </div>

            <div className="letterhead-doc-title">
              <h2 style={{ fontSize: '18px', margin: 0 }}>DELIVERY CHALLAN</h2>
              <div className="doc-ref-no" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginTop: '2px' }}>
                {isEditingRef ? (
                  <input
                    type="text"
                    value={currentChallanNo}
                    onChange={(e) => setCurrentChallanNo(e.target.value)}
                    onBlur={() => setIsEditingRef(false)}
                    autoFocus
                    style={{ fontSize: '12px', fontWeight: 'bold', border: '1px solid #2563eb', padding: '1px 5px', borderRadius: '4px', textAlign: 'right' }}
                  />
                ) : (
                  <span 
                    onClick={() => setIsEditingRef(true)}
                    title="Click to edit reference number"
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                  >
                    {currentChallanNo}
                    <Edit3 size={11} className="no-print" style={{ opacity: 0.6, color: '#2563eb' }} />
                  </span>
                )}
              </div>
              <div style={{ fontSize: '9px', color: '#4b5563', textAlign: 'right', fontWeight: 'bold', marginTop: '1px' }}>
                (DISPATCH & MOVEMENT NOTE)
              </div>
            </div>
          </div>

          {/* Purpose of Goods Movement / Challan Nature Bar (Only Selected Choice) */}
          <div style={{ border: `1px solid ${selectedNature === 'QC Reject - Return to Vendor' ? '#fecaca' : '#cbd5e1'}`, background: selectedNature === 'QC Reject - Return to Vendor' ? '#fff5f5' : '#f8fafc', padding: '4px 10px', borderRadius: '4px', marginBottom: '6px', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: '800', color: selectedNature === 'QC Reject - Return to Vendor' ? '#991b1b' : '#334155', textTransform: 'uppercase', fontSize: '8px', letterSpacing: '0.5px' }}>
              PURPOSE OF GOODS MOVEMENT / CHALLAN NATURE:
            </span>
            <span style={{ fontWeight: '800', color: selectedNature === 'QC Reject - Return to Vendor' ? '#b91c1c' : '#0369a1', background: selectedNature === 'QC Reject - Return to Vendor' ? '#fef2f2' : '#e0f2fe', border: `1px solid ${selectedNature === 'QC Reject - Return to Vendor' ? '#fecaca' : '#bae6fd'}`, padding: '2px 8px', borderRadius: '4px', fontSize: '9.5px' }}>
              {selectedNature === 'QC Reject - Return to Vendor' ? '🛑' : '✓'} {selectedNature} {debitNoteNo ? `• Debit Note #: ${debitNoteNo}` : ''}
            </span>
          </div>

          {/* 3-Column Address & Dispatch Details Grid */}
          <table className="address-grid-table" style={{ marginBottom: '6px', fontSize: '9px' }}>
            <thead>
              <tr>
                <th style={{ width: '36%', padding: '4px 6px', fontSize: '8.5px' }}>Dispatched Billed From (Consignor)</th>
                <th style={{ width: '36%', padding: '4px 6px', fontSize: '8.5px' }}>
                  Billed & Shipped To ({partyType === 'Vendor' ? 'Vendor / Consignee' : 'Client / Consignee'})
                </th>
                <th style={{ width: '28%', padding: '4px 6px', fontSize: '8.5px' }}>Logistics & Dispatch Specs</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '4px 6px' }}>
                  <div className="address-box-title" style={{ fontSize: '9.5px', marginBottom: '3px', paddingBottom: '2px' }}>{COMPANY_DETAILS.name}</div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>{COMPANY_DETAILS.address}</div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>GSTIN: <strong>{COMPANY_DETAILS.gstin}</strong></div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>Place of Supply: {COMPANY_DETAILS.placeOfSupply}</div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>Phone: {COMPANY_DETAILS.phones}</div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>Email: {COMPANY_DETAILS.email}</div>
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <div className="address-box-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9.5px', marginBottom: '3px', paddingBottom: '2px' }}>
                    <span>{displayName}</span>
                    <span style={{ background: partyType === 'Vendor' ? '#d97706' : '#2563eb', color: '#fff', fontSize: '7.5px', padding: '1px 4px', borderRadius: '3px', fontWeight: 'bold' }}>
                      {partyType.toUpperCase()}
                    </span>
                  </div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>{clientAddress}</div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>GSTIN: <strong>{clientGstin || 'Unregistered / Exempt'}</strong></div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>Contact Person: {clientContactPerson || 'Store Manager / Receiver'}</div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>Phone: {clientPhone || '—'}</div>
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>Invoice Ref #: <strong>{invoiceNo || 'N/A'}</strong></div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>Dispatch Date/Time: <strong>{dispatchDateTime}</strong></div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>Vehicle No: <strong style={{ color: '#0284c7' }}>{vehicleNo || 'Self Hand Delivery'}</strong></div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>Transporter: {transporterName || 'Direct Dispatch'}</div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>Driver Contact: {driverPhone || '—'}</div>
                  <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px' }}>Client PO Ref #: {poRefNo || 'N/A'}</div>
                  {debitNoteNo && (
                    <div className="address-line" style={{ margin: '1px 0', fontSize: '8.5px', color: '#b91c1c' }}>
                      Debit Note #: <strong>{debitNoteNo}</strong>
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Job Reference bar if available */}
          {jobName && (
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '4px', marginBottom: '8px', fontSize: '9.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Job / Product Reference: <strong>{jobName}</strong></span>
            </div>
          )}

          {/* Itemized Table */}
          <table className="items-table" style={{ marginBottom: '6px', fontSize: '9px' }}>
            <thead>
              <tr>
                <th style={{ width: '5%', textAlign: 'center', padding: '4px 5px', fontSize: '8.5px' }}>S.No</th>
                <th style={{ width: '43%', padding: '4px 5px', fontSize: '8.5px' }}>Item Description & Specification</th>
                <th style={{ width: '12%', textAlign: 'center', padding: '4px 5px', fontSize: '8.5px' }}>HSN / SAC</th>
                <th style={{ width: '14%', textAlign: 'right', padding: '4px 5px', fontSize: '8.5px' }}>Quantity</th>
                <th style={{ width: '12%', textAlign: 'right', padding: '4px 5px', fontSize: '8.5px' }}>Rate (₹)</th>
                <th style={{ width: '14%', textAlign: 'right', padding: '4px 5px', fontSize: '8.5px' }}>Taxable Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {itemRows.map((item, idx) => {
                const qty = parseFloat(item.quantity) || 0;
                const rate = parseFloat(item.rate) || 0;
                const amt = item.amount ? parseFloat(item.amount) : qty * rate;
                const specText = item.itemDetails || item.subDetails;
                return (
                  <tr key={item.id || idx}>
                    <td style={{ textAlign: 'center', padding: '3px 5px' }}>{idx + 1}</td>
                    <td style={{ padding: '3px 5px' }}>
                      <div style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '9.5px' }}>{item.description || item.name}</div>
                      {specText && (
                        <div style={{ fontSize: '8.5px', color: '#475569', marginTop: '1px', whiteSpace: 'pre-line', lineHeight: '1.2' }}>
                          {specText}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace', padding: '3px 5px' }}>{item.hsnSac || '3923'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '3px 5px' }}>
                      {qty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {item.unit || 'Kg'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3px 5px' }}>
                      {rate > 0 ? formatINR(rate) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '3px 5px' }}>
                      {formatINR(amt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Tax Calculation & Summary Table */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '6px', gap: '12px' }}>
            {/* Amount in words & Remarks */}
            <div style={{ flex: 1 }}>
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '5px 8px', background: '#f8fafc', marginBottom: '4px' }}>
                <div style={{ fontSize: '8px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Total Amount in Words:</div>
                <div style={{ fontSize: '9.5px', fontWeight: 'bold', color: '#0f172a', marginTop: '1px' }}>
                  {numberToWords(gstCalc.grandTotal)}
                </div>
              </div>

              {remarks && (
                <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px 8px', fontSize: '9.5px', color: '#334155' }}>
                  <strong>Dispatch Remarks:</strong> {remarks}
                </div>
              )}
            </div>

            {/* Financial Breakdown Card */}
            <table style={{ width: '270px', borderCollapse: 'collapse', fontSize: '9.5px', border: '1px solid #cbd5e1' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Total Net Qty:</td>
                  <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 'bold' }}>
                    {totalQtyKg.toFixed(2)} Kg
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Items Subtotal:</td>
                  <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 'bold' }}>
                    {formatINR(subtotalItems)}
                  </td>
                </tr>
                {freightAmt > 0 && (
                  <tr>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Freight Charges:</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 'bold', color: '#d97706' }}>
                      + {formatINR(freightAmt)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 'bold' }}>Total Taxable Value:</td>
                  <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 'bold' }}>
                    {formatINR(subtotalTaxable)}
                  </td>
                </tr>
                {gstCalc.isIntraState ? (
                  <>
                    <tr>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>CGST @ {gstRatePct / 2}%:</td>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>
                        {formatINR(gstCalc.cgstAmount)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>SGST @ {gstRatePct / 2}%:</td>
                      <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>
                        {formatINR(gstCalc.sgstAmount)}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>IGST @ {gstRatePct}%:</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>
                      {formatINR(gstCalc.igstAmount)}
                    </td>
                  </tr>
                )}
                {gstCalc.roundOff !== undefined && (
                  <tr>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Round-off (+/-):</td>
                    <td style={{ padding: '3px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: '500', color: gstCalc.roundOff > 0 ? '#059669' : (gstCalc.roundOff < 0 ? '#dc2626' : '#475569') }}>
                      {gstCalc.roundOff > 0 ? `+ ${formatINR(gstCalc.roundOff)}` : formatINR(gstCalc.roundOff)}
                    </td>
                  </tr>
                )}
                <tr style={{ background: '#f1f5f9', fontWeight: 'bold', fontSize: '10.5px' }}>
                  <td style={{ padding: '5px 8px', color: '#0f172a' }}>Grand Total Value:</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#0284c7' }}>
                    {formatINR(gstCalc.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Material Return Inward History Log (if present) */}
          {Array.isArray(returnInwardHistory) && returnInwardHistory.length > 0 && (
            <div style={{ marginTop: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 10px', background: '#f0fdf4' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '9px', fontWeight: '800', color: '#166534', textTransform: 'uppercase' }}>
                  MATERIAL RETURN INWARD LOG RECORD
                </div>
                {returnStatus && (
                  <span style={{ fontSize: '8.5px', fontWeight: 'bold', background: '#dcfce7', color: '#15803d', padding: '1px 5px', borderRadius: '3px', border: '1px solid #86efac' }}>
                    Status: {returnStatus}
                  </span>
                )}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5px', background: '#ffffff', border: '1px solid #bbf7d0' }}>
                <thead>
                  <tr style={{ background: '#dcfce7', color: '#14532d', textTransform: 'uppercase', fontSize: '8px' }}>
                    <th style={{ padding: '3px 5px', border: '1px solid #bbf7d0', textAlign: 'left' }}>Return Date & Time</th>
                    <th style={{ padding: '3px 5px', border: '1px solid #bbf7d0', textAlign: 'right' }}>Returned Qty</th>
                    <th style={{ padding: '3px 5px', border: '1px solid #bbf7d0', textAlign: 'left' }}>Logistics / Vehicle</th>
                    <th style={{ padding: '3px 5px', border: '1px solid #bbf7d0', textAlign: 'left' }}>Ref Doc / Inv No</th>
                    <th style={{ padding: '3px 5px', border: '1px solid #bbf7d0', textAlign: 'left' }}>Quality Condition</th>
                    <th style={{ padding: '3px 5px', border: '1px solid #bbf7d0', textAlign: 'left' }}>Received By</th>
                  </tr>
                </thead>
                <tbody>
                  {returnInwardHistory.map((ret, rIdx) => (
                    <tr key={ret.id || rIdx}>
                      <td style={{ padding: '3px 5px', border: '1px solid #e2e8f0', fontWeight: 'bold' }}>
                        {ret.returnDate} {ret.returnTime ? `@ ${ret.returnTime}` : ''}
                      </td>
                      <td style={{ padding: '3px 5px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 'bold', color: '#166534' }}>
                        {ret.returnedQty} {ret.unit || 'Kg'}
                      </td>
                      <td style={{ padding: '3px 5px', border: '1px solid #e2e8f0' }}>
                        {ret.vehicleNo || '—'} ({ret.transporter || 'Self'}, LR: {ret.lrNo || 'N/A'})
                      </td>
                      <td style={{ padding: '3px 5px', border: '1px solid #e2e8f0' }}>
                        {ret.refInvoiceNo || 'N/A'}
                      </td>
                      <td style={{ padding: '3px 5px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontWeight: 'bold', color: ret.qualityCondition === 'Damaged' ? '#dc2626' : ret.qualityCondition === 'Needs Rework' ? '#d97706' : '#16a34a' }}>
                          {ret.qualityCondition || 'Good / OK'}
                        </span>
                      </td>
                      <td style={{ padding: '3px 5px', border: '1px solid #e2e8f0' }}>
                        {ret.receivedBy || 'Store Incharge'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Editable Terms & Conditions Section */}
          <div className="terms-section" style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: '2px', marginBottom: '4px' }}>
              <div style={{ fontSize: '9px', fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>
                Terms & Conditions of Dispatch & Supply
              </div>
              <button 
                type="button" 
                className="btn-secondary no-print" 
                style={{ padding: '1px 6px', fontSize: '9px' }}
                onClick={handleAddTerm}
              >
                <Plus size={9} /> Add Term
              </button>
            </div>

            <ol style={{ paddingLeft: '14px', margin: 0, fontSize: '8.5px', color: '#475569', lineHeight: '1.3' }}>
              {currentDcTerms.map((term, index) => (
                <li key={index} style={{ marginBottom: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="text"
                      className="terms-input-inline"
                      value={term}
                      onChange={(e) => handleUpdateTerm(index, e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '8.5px', fontFamily: 'inherit', color: 'inherit' }}
                    />
                    <button
                      type="button"
                      className="no-print"
                      onClick={() => handleRemoveTerm(index)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.7 }}
                      title="Remove term"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Dual Seal & Signature Boxes (Company Dispatch vs Receiving Company) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '10px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            {/* Left Box: Receiving Company Seal & Signature */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '90px', background: '#fafafa' }}>
              <div>
                <div style={{ fontSize: '9.5px', fontWeight: '800', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '4px' }}>
                  RECEIVING COMPANY ACKNOWLEDGEMENT & STAMP
                </div>
                <div style={{ fontSize: '8.5px', color: '#64748b' }}>
                  Received the above flexible packaging material in good condition and correct quantity.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '14px' }}>
                <div>
                  <div style={{ borderTop: '1px dashed #94a3b8', width: '130px', paddingTop: '2px', fontSize: '8.5px', fontWeight: 'bold', color: '#475569' }}>
                    Receiver Name & Phone
                  </div>
                  <div style={{ fontSize: '7.5px', color: '#94a3b8' }}>Date & Time of Delivery</div>
                </div>
                <div style={{ border: '1px dashed #cbd5e1', width: '70px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7.5px', color: '#94a3b8', textAlign: 'center' }}>
                  Receiving Company Stamp
                </div>
              </div>
            </div>

            {/* Right Box: Samyak Dispatch Department Seal & Signature */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '90px', background: '#fafafa' }}>
              <div>
                <div style={{ fontSize: '9.5px', fontWeight: '800', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '4px' }}>
                  FOR SAMYAK INTERNATIONAL LIMITED (DISPATCH DEPT)
                </div>
                <div style={{ fontSize: '8.5px', color: '#64748b' }}>
                  Authorised Verification & Seal
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '14px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ borderTop: '1px dashed #94a3b8', width: '160px', paddingTop: '2px', fontSize: '8.5px', fontWeight: 'bold', color: '#1e293b' }}>
                    Plant Manager / HOD Signature
                  </div>
                  <div style={{ fontSize: '7.5px', color: '#64748b' }}>Date & Time of Approval</div>
                </div>

                <div style={{ border: '1px dashed #cbd5e1', width: '70px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7.5px', color: '#94a3b8', textAlign: 'center' }}>
                  Company Seal & Stamp
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
