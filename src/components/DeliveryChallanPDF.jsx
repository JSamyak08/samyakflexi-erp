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
    clientName = "Britannia Industries Ltd",
    clientAddress = "Plot 12, Pithampur Industrial Area Sector III, Dhar, M.P. - 454775",
    clientGstin = "23AAACB1234F1Z5",
    clientContactPerson = "Rajesh Sharma",
    clientPhone = "+91 98260 12345",
    vehicleNo = "MP-09-AB-1234",
    transporterName = "Self / Direct Truck Delivery",
    driverPhone = "+91 91110 99887",
    poRefNo = "PO-BRIT-2026-991",
    jobName = "Britannia Bourbon 250g Printed Laminate Film",
    items = [
      { id: 1, description: "Britannia Bourbon 250g PET/METPET Film Roll", hsnSac: "3923", quantity: 1250, unit: "Kg", rate: 195, amount: 243750 }
    ],
    gstRatePct = 18,
    dispatchedBy = "Dilip Joshi (Dispatch Store Incharge)",
    remarks = "Material dispatched in 12 rolls wrapped in waterproof Stretch Film."
  } = challanData;

  // Calculate row amounts & tax breakdowns
  const itemRows = (Array.isArray(items) && items.length > 0) ? items : [
    { id: 1, description: "Flexible Packaging Laminated Film Rolls", hsnSac: "3923", quantity: 1000, unit: "Kg", rate: 180, amount: 180000 }
  ];

  const subtotalTaxable = itemRows.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const rate = parseFloat(item.rate) || 0;
    return sum + (item.amount ? parseFloat(item.amount) : qty * rate);
  }, 0);

  const gstCalc = calculateGSTBreakdown(clientGstin, clientAddress, subtotalTaxable, gstRatePct, COMPANY_DETAILS.gstin);
  const totalQtyKg = itemRows.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);

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
          <div className="letterhead-header">
            <div className="letterhead-brand">
              <img src={logoImage} alt="Samyak International Ltd Logo" className="samyak-logo-img" style={{ height: '46px', objectFit: 'contain' }} />
              <p className="letterhead-company-sub" style={{ marginTop: '2px', fontSize: '8.5px', fontWeight: '800', color: '#374151' }}>
                BSE: SAMYAKINT • CIN: L67120MH1994PLC225907
              </p>
            </div>

            <div className="letterhead-doc-title">
              <h2>DELIVERY CHALLAN</h2>
              <div className="doc-ref-no" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                {isEditingRef ? (
                  <input
                    type="text"
                    value={currentChallanNo}
                    onChange={(e) => setCurrentChallanNo(e.target.value)}
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
                    {currentChallanNo}
                    <Edit3 size={12} className="no-print" style={{ opacity: 0.6, color: '#2563eb' }} />
                  </span>
                )}
              </div>
              <div style={{ fontSize: '10px', color: '#4b5563', textAlign: 'right', fontWeight: 'bold', marginTop: '2px' }}>
                (DISPATCH & MOVEMENT NOTE)
              </div>
            </div>
          </div>

          {/* 3-Column Address & Dispatch Details Grid */}
          <table className="address-grid-table">
            <thead>
              <tr>
                <th style={{ width: '36%' }}>Dispatched Billed From (Consignor)</th>
                <th style={{ width: '36%' }}>Billed & Shipped To (Consignee)</th>
                <th style={{ width: '28%' }}>Logistics & Dispatch Specs</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="address-box-title">{COMPANY_DETAILS.name}</div>
                  <div className="address-line">{COMPANY_DETAILS.address}</div>
                  <div className="address-line">GSTIN: <strong>{COMPANY_DETAILS.gstin}</strong></div>
                  <div className="address-line">Place of Supply: {COMPANY_DETAILS.placeOfSupply}</div>
                  <div className="address-line">Phone: {COMPANY_DETAILS.phones}</div>
                  <div className="address-line">Email: {COMPANY_DETAILS.email}</div>
                </td>
                <td>
                  <div className="address-box-title">{clientName}</div>
                  <div className="address-line">{clientAddress}</div>
                  <div className="address-line">GSTIN: <strong>{clientGstin || 'Unregistered / Exempt'}</strong></div>
                  <div className="address-line">Contact Person: {clientContactPerson || 'Store Manager / Receiver'}</div>
                  <div className="address-line">Phone: {clientPhone || '—'}</div>
                </td>
                <td>
                  <div className="address-line">Invoice Ref #: <strong>{invoiceNo || 'N/A'}</strong></div>
                  <div className="address-line">Dispatch Date/Time: <strong>{dispatchDateTime}</strong></div>
                  <div className="address-line">Vehicle No: <strong style={{ color: '#0284c7' }}>{vehicleNo || 'Self Hand Delivery'}</strong></div>
                  <div className="address-line">Transporter: {transporterName || 'Direct Dispatch'}</div>
                  <div className="address-line">Driver Contact: {driverPhone || '—'}</div>
                  <div className="address-line">Client PO Ref #: {poRefNo || 'N/A'}</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Job Reference bar if available */}
          {jobName && (
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '4px', marginBottom: '14px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Job / Product Reference: <strong>{jobName}</strong></span>
              <span>Dispatched By: <strong>{dispatchedBy}</strong></span>
            </div>
          )}

          {/* Itemized Table */}
          <table className="items-table">
            <thead>
              <tr>
                <th style={{ width: '6%', textAlign: 'center' }}>S.No</th>
                <th style={{ width: '42%' }}>Item Description & Specification</th>
                <th style={{ width: '12%', textAlign: 'center' }}>HSN / SAC</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Quantity</th>
                <th style={{ width: '12%', textAlign: 'right' }}>Rate (₹)</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Taxable Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {itemRows.map((item, idx) => {
                const qty = parseFloat(item.quantity) || 0;
                const rate = parseFloat(item.rate) || 0;
                const amt = item.amount ? parseFloat(item.amount) : qty * rate;
                return (
                  <tr key={item.id || idx}>
                    <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 'bold', color: '#1e293b' }}>{item.description || item.name}</div>
                      {item.subDetails && <div style={{ fontSize: '9.5px', color: '#64748b' }}>{item.subDetails}</div>}
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{item.hsnSac || '3923'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                      {qty.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {item.unit || 'Kg'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {rate > 0 ? formatINR(rate) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                      {formatINR(amt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Tax Calculation & Summary Table */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '12px', gap: '16px' }}>
            {/* Amount in words & Remarks */}
            <div style={{ flex: 1 }}>
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '8px 12px', background: '#f8fafc', marginBottom: '10px' }}>
                <div style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Total Amount in Words:</div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#0f172a', marginTop: '2px' }}>
                  {numberToWords(gstCalc.grandTotal)}
                </div>
              </div>

              {remarks && (
                <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 12px', fontSize: '10.5px', color: '#334155' }}>
                  <strong>Dispatch Incharge Remarks:</strong> {remarks}
                </div>
              )}
            </div>

            {/* Financial Breakdown Card */}
            <table style={{ width: '280px', borderCollapse: 'collapse', fontSize: '11px', border: '1px solid #cbd5e1' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '5px 10px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Total Net Qty:</td>
                  <td style={{ padding: '5px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 'bold' }}>
                    {totalQtyKg.toFixed(2)} Kg
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '5px 10px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>Subtotal (Taxable Value):</td>
                  <td style={{ padding: '5px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 'bold' }}>
                    {formatINR(subtotalTaxable)}
                  </td>
                </tr>
                {gstCalc.isIntraState ? (
                  <>
                    <tr>
                      <td style={{ padding: '5px 10px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>CGST @ {gstRatePct / 2}%:</td>
                      <td style={{ padding: '5px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>
                        {formatINR(gstCalc.cgstAmount)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '5px 10px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>SGST @ {gstRatePct / 2}%:</td>
                      <td style={{ padding: '5px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>
                        {formatINR(gstCalc.sgstAmount)}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td style={{ padding: '5px 10px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>IGST @ {gstRatePct}%:</td>
                    <td style={{ padding: '5px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'right' }}>
                      {formatINR(gstCalc.igstAmount)}
                    </td>
                  </tr>
                )}
                <tr style={{ background: '#f1f5f9', fontWeight: 'bold', fontSize: '12px' }}>
                  <td style={{ padding: '7px 10px', color: '#0f172a' }}>Grand Total Value:</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#0284c7' }}>
                    {formatINR(gstCalc.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Editable Terms & Conditions Section */}
          <div className="terms-section" style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: '4px', marginBottom: '6px' }}>
              <div style={{ fontSize: '10px', fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>
                Terms & Conditions of Dispatch & Supply
              </div>
              <button 
                type="button" 
                className="btn-secondary no-print" 
                style={{ padding: '2px 8px', fontSize: '10px' }}
                onClick={handleAddTerm}
              >
                <Plus size={10} /> Add Term
              </button>
            </div>

            <ol style={{ paddingLeft: '16px', margin: 0, fontSize: '10px', color: '#475569', lineHeight: '1.45' }}>
              {currentDcTerms.map((term, index) => (
                <li key={index} style={{ marginBottom: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="text"
                      className="terms-input-inline"
                      value={term}
                      onChange={(e) => handleUpdateTerm(index, e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '10px', fontFamily: 'inherit', color: 'inherit' }}
                    />
                    <button
                      type="button"
                      className="no-print"
                      onClick={() => handleRemoveTerm(index)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.7 }}
                      title="Remove term"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Dual Seal & Signature Boxes (Company Dispatch vs Receiving Company) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '24px' }}>
            {/* Left Box: Receiving Company Seal & Signature */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '130px', background: '#fafafa' }}>
              <div>
                <div style={{ fontSize: '10.5px', fontWeight: '800', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '6px' }}>
                  RECEIVING COMPANY ACKNOWLEDGEMENT & STAMP
                </div>
                <div style={{ fontSize: '9.5px', color: '#64748b' }}>
                  Received the above flexible packaging material in good condition and correct quantity.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '24px' }}>
                <div>
                  <div style={{ borderTop: '1px dashed #94a3b8', width: '140px', paddingTop: '3px', fontSize: '9.5px', fontWeight: 'bold', color: '#475569' }}>
                    Receiver Name & Phone
                  </div>
                  <div style={{ fontSize: '8.5px', color: '#94a3b8' }}>Date & Time of Delivery</div>
                </div>
                <div style={{ border: '1px dashed #cbd5e1', width: '80px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8.5px', color: '#94a3b8', textAlign: 'center' }}>
                  Receiving Company Stamp
                </div>
              </div>
            </div>

            {/* Right Box: Samyak Dispatch Department Seal & Signature */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '130px', background: '#fafafa' }}>
              <div>
                <div style={{ fontSize: '10.5px', fontWeight: '800', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '6px' }}>
                  FOR SAMYAK INTERNATIONAL LIMITED (DISPATCH DEPT)
                </div>
                <div style={{ fontSize: '9.5px', color: '#64748b' }}>
                  Authorised Dispatch Incharge Verification & Seal
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '16px' }}>
                <div style={{ textAlign: 'center' }}>
                  {signatureImage ? (
                    <img src={signatureImage} alt="Authorised Signature" style={{ height: '42px', objectFit: 'contain', display: 'block', margin: '0 auto 2px' }} />
                  ) : (
                    <div style={{ height: '35px', fontStyle: 'italic', fontSize: '11px', color: '#2563eb', fontWeight: 'bold' }}>
                      Samyak Dispatch
                    </div>
                  )}
                  <div style={{ borderTop: '1px dashed #94a3b8', width: '150px', paddingTop: '3px', fontSize: '9.5px', fontWeight: 'bold', color: '#1e293b' }}>
                    {dispatchedBy || 'Authorised Signatory'}
                  </div>
                  <div style={{ fontSize: '8.5px', color: '#64748b' }}>Dispatch Department Head</div>
                </div>

                <div style={{ border: '1px solid #93c5fd', background: '#eff6ff', borderRadius: '4px', width: '85px', height: '52px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '8px', fontWeight: '900', color: '#1d4ed8' }}>SAMYAK INT. LTD</div>
                  <div style={{ fontSize: '7px', color: '#2563eb', marginTop: '1px' }}>FACTORY DISPATCH</div>
                  <div style={{ fontSize: '6.5px', color: '#64748b' }}>SEAL & STAMP</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
