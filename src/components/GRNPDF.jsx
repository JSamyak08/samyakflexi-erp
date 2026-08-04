import React, { useState } from 'react';
import { Printer, ArrowLeft, Edit3, Plus, Trash2 } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import { numberToWords, formatINR } from '../utils/pdfHelpers';
import { getAuthorisedSignature, getCompanyLogo, generateDocRefNumber, getDocumentTerms } from '../services/settingsService';

export default function GRNPDF({ grnData, onClose }) {
  if (!grnData) return null;

  const defaultGrnNo = grnData.grnNo || generateDocRefNumber('grn');
  const savedTerms = getDocumentTerms();

  const [currentGrnNo, setCurrentGrnNo] = useState(defaultGrnNo);
  const [isEditingRef, setIsEditingRef] = useState(false);
  const [currentGrnTerms, setCurrentGrnTerms] = useState(savedTerms.grnTerms || []);
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
    poNumber = "SIL/PO/26-27/042",
    vendorName = "FlexiPoly Films Ltd",
    invoiceNo = "INV-FP-9904",
    receivedDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    filmType = "PET",
    micron = 12,
    widthMm = 1000,
    rollsReceived = 12,
    netWeightKg = 1850,
    unitPrice = 125,
    batchNo = "BATCH-PET-991",
    status = "Approved",
    qcNotes = "Passed corona dyne level & gauge tolerance inspection.",
    inspectedBy = "Ramesh Kumar (Quality Chemist)",
    storeManager = "Dilip Joshi (Store Inward Manager)"
  } = grnData;


  const totalTaxable = netWeightKg * unitPrice;
  const cgstAmt = totalTaxable * 0.09;
  const sgstAmt = totalTaxable * 0.09;
  const totalTax = cgstAmt + sgstAmt;
  const grandTotal = totalTaxable + totalTax;

  const vendorDetails = {
    name: vendorName || "FlexiPoly Films Ltd",
    address: "Plot 45, Sector 1, Pithampur Industrial Area, Dhar, M.P. - 454775",
    contactPerson: "Mahesh Agarwal",
    email: "sales@flexipoly.com",
    contactNo: "+91 9425011223",
    gstin: "23AAACF4432K1Z9"
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
                BSE: SAMYAKINT • CIN: L67120MH1994PLC225907
              </p>
            </div>

            <div className="letterhead-doc-title">
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
                  <td className="value-col" style={{ color: status === 'Approved' ? '#059669' : '#dc2626', fontWeight: 'bold' }}>
                    {status.toUpperCase()}
                  </td>
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
              <tr>
                <td className="center">1</td>
                <td>
                  <div className="item-name">{filmType} Film</div>
                  <div className="item-meta">Batch Ref: {batchNo}</div>
                </td>
                <td className="center">3920</td>
                <td className="center">{micron} µ</td>
                <td className="center">{widthMm} mm</td>
                <td className="center">{rollsReceived} Rolls</td>
                <td className="right" style={{ fontWeight: 'bold' }}>{(netWeightKg ?? 0).toLocaleString()} Kg</td>
                <td className="right">{formatINR(unitPrice)}</td>
                <td className="right">{formatINR(totalTaxable)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="6" className="right" style={{ fontWeight: 'bold' }}>Total Quantity Inwarded</td>
                <td className="right" style={{ fontWeight: 'bold' }}>{(netWeightKg ?? 0).toLocaleString()} Kg</td>
                <td colSpan="2"></td>
              </tr>
            </tfoot>
          </table>

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
                            <th>CGST (9%)</th>
                            <th>SGST (9%)</th>
                            <th>IGST</th>
                            <th>Cess</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{formatINR(cgstAmt)}</td>
                            <td>{formatINR(sgstAmt)}</td>
                            <td>₹0.00</td>
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
