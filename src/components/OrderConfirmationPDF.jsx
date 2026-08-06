import React, { useState } from 'react';
import { Printer, ArrowLeft, Edit3, Plus, Trash2 } from 'lucide-react';
import { COMPANY_DETAILS, initialClients } from '../factoryStore';
import { numberToWords, formatINR, calculateGSTBreakdown } from '../utils/pdfHelpers';
import { getAuthorisedSignature, getCompanyLogo, generateDocRefNumber, getDocumentTerms } from '../services/settingsService';

export default function OrderConfirmationPDF({ calculationData, onClose, clientDetails, clients }) {
  const defaultDocRef = generateDocRefNumber('ocn');
  const savedTerms = getDocumentTerms();

  const [docRef, setDocRef] = useState(defaultDocRef);
  const [isEditingRef, setIsEditingRef] = useState(false);
  const [currentOcnTerms, setCurrentOcnTerms] = useState(savedTerms.ocnTerms || []);
  const signatureImage = getAuthorisedSignature();
  const logoImage = getCompanyLogo();


  if (!calculationData) return null;

  const handleUpdateTerm = (index, value) => {
    const updated = [...currentOcnTerms];
    updated[index] = value;
    setCurrentOcnTerms(updated);
  };

  const handleAddTerm = () => {
    setCurrentOcnTerms(prev => [...prev, "New store instruction..."]);
  };

  const handleRemoveTerm = (index) => {
    setCurrentOcnTerms(prev => prev.filter((_, i) => i !== index));
  };



  const {
    jobName = "Britannia Bourbon 250g",
    clientName = "Britannia Industries Ltd",
    printWidthMm: rawPrintWidth,
    repeatLengthMm: rawRepeatLength,
    orderQtyKg = 1000,
    orderType = "Reel",
    wastagePct = 5,
    totalLaminateGsm = 45.2,
    totalAreaSqm = 22123,
    layerResults = [],
    inkDetails = {},
    adhesiveDetails = {},
    summary = {}
  } = calculationData || {};

  const printWidthMm = rawPrintWidth || calculationData?.jobMasterData?.printWidthMm || calculationData?.orderData?.printWidthMm || 1000;
  const repeatLengthMm = rawRepeatLength || calculationData?.jobMasterData?.repeatLengthMm || calculationData?.orderData?.repeatLengthMm || 400;

  const layersList = layerResults.length > 0 ? layerResults : [
    { filmType: "PET Film", micron: 12, density: 1.4, gsm: 16.8, netKg: 371.7, grossKg: 390.3, pricePerKg: 125, totalCost: 48787.5 },
    { filmType: "Natural LD GP Film", micron: 30, density: 0.93, gsm: 27.9, netKg: 617.2, grossKg: 648.1, pricePerKg: 115, totalCost: 74531.5 }
  ];

  // Resolve Client Details dynamically from Client Directory / Job Master
  const targetClientName = calculationData?.clientName || clientName || "";
  const clientStore = (clients && clients.length > 0) ? clients : initialClients;

  const matchedClient = 
    clientDetails || 
    calculationData?.clientDetails || 
    (targetClientName ? (
      clientStore.find(c => (c.name || c.companyName || '').toLowerCase().trim() === targetClientName.toLowerCase().trim()) ||
      clientStore.find(c => (c.name || c.companyName || '').toLowerCase().includes(targetClientName.toLowerCase().trim()) || targetClientName.toLowerCase().includes((c.name || c.companyName || '').toLowerCase().trim())) ||
      clientStore.find(c => {
        const firstWord = targetClientName.toLowerCase().trim().split(' ')[0];
        return firstWord && firstWord.length > 3 && (c.name || c.companyName || '').toLowerCase().includes(firstWord);
      })
    ) : null);

  const clientInfo = {
    name: matchedClient?.name || matchedClient?.companyName || targetClientName || "Client Name N/A",
    address: matchedClient?.address || "Address Not Specified in Client Directory",
    contactPerson: matchedClient?.contactPerson || "N/A",
    email: matchedClient?.email || (matchedClient?.contactPerson ? `${matchedClient.contactPerson.toLowerCase().replace(/\s+/g, '.')}@${(matchedClient?.name || 'client').toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : "N/A"),
    contactNo: matchedClient?.phone || matchedClient?.contactNo || "N/A",
    gstin: matchedClient?.gstin || "N/A"
  };

  const totalRawMaterialKg = (summary.totalFilmGrossKg || 0) + (inkDetails.grossKg || 0) + (adhesiveDetails.grossKg || 0) || 1088.4;
  const totalTaxable = summary.totalRawMaterialCost || 135000;
  
  // Calculate Indian GST applicability (Intra-State 23 MP: CGST 9% + SGST 9% vs Inter-State: IGST 18%)
  const gstInfo = calculateGSTBreakdown(clientInfo.gstin, clientInfo.address, totalTaxable, 18, COMPANY_DETAILS.gstin || '23AAACS9988F1Z1');
  const cgstAmt = gstInfo.cgstAmount;
  const sgstAmt = gstInfo.sgstAmount;
  const igstAmt = gstInfo.igstAmount;
  const totalTax = gstInfo.totalGstAmount;
  const grandTotal = gstInfo.grandTotal;

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal-toolbar no-print">
        <button className="btn-secondary" onClick={onClose}>
          <ArrowLeft size={16} /> Back to Job Form
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print OCN Note PDF
        </button>
      </div>

      <div className="pdf-paper-container">
        <div className="printable-document" id="printable-ocn">
          {/* Header */}
          <div className="letterhead-header">
            <div className="letterhead-brand">
              <img src={logoImage} alt="Samyak International Ltd Logo" className="samyak-logo-img" style={{ height: '46px', objectFit: 'contain' }} />
              <p className="letterhead-company-sub" style={{ marginTop: '2px', fontSize: '8.5px', fontWeight: '800', color: '#374151' }}>
                BSE: SAMYAKINT • CIN: L67120MH1994PLC225907
              </p>
            </div>

            <div className="letterhead-doc-title">
              <h2>Order Confirmation Note</h2>
              <div className="doc-ref-no" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                {isEditingRef ? (
                  <input
                    type="text"
                    value={docRef}
                    onChange={(e) => setDocRef(e.target.value)}
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
                    {docRef}
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
                <th>Name and Address of Manufacturer</th>
                <th>Name and Address of Client</th>
                <th>Shipping & Delivery Details</th>
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
                  <div className="address-box-title">{clientInfo.name}</div>
                  <div className="address-line">{clientInfo.address}</div>
                  <div className="address-line">Contact: {clientInfo.contactPerson}</div>
                  <div className="address-line">Email: {clientInfo.email}</div>
                  <div className="address-line">Contact No: {clientInfo.contactNo}</div>
                  <div className="address-line">GSTIN: {clientInfo.gstin}</div>
                </td>
                <td>
                  <div className="address-box-title">Factory Dispatch Store</div>
                  <div className="address-line">Samyak International Ltd - Gate 1</div>
                  <div className="address-line">{COMPANY_DETAILS.address}</div>
                  <div className="address-line">GSTIN: {COMPANY_DETAILS.gstin}</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* OCN Details Grid */}
          <div className="details-section-container">
            <div className="details-section-header">OCN Details</div>
            <table className="details-grid-table">
              <tbody>
                <tr>
                  <td className="label-col">OCN Number</td>
                  <td className="value-col">{docRef}</td>
                  <td className="label-col">OCN Date</td>
                  <td className="value-col">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                </tr>
                <tr>
                  <td className="label-col">Job Name</td>
                  <td className="value-col">{jobName}</td>
                  <td className="label-col">Order Form</td>
                  <td className="value-col">{orderType} Form</td>
                </tr>
                <tr>
                  <td className="label-col">Print Size (Width x Repeat)</td>
                  <td className="value-col">{printWidthMm} mm × {repeatLengthMm} mm</td>
                  <td className="label-col">Order Quantity</td>
                  <td className="value-col">{orderQtyKg.toLocaleString()} Kg</td>
                </tr>
                <tr>
                  <td className="label-col">Total Laminate GSM</td>
                  <td className="value-col">{totalLaminateGsm} g/m²</td>
                  <td className="label-col">Surface Area</td>
                  <td className="value-col">{totalAreaSqm.toLocaleString()} m²</td>
                </tr>
                <tr>
                  <td className="label-col">Wastage Allowed</td>
                  <td className="value-col">{wastagePct}%</td>
                  <td className="label-col">Calculated Rate / Kg</td>
                  <td className="value-col">₹{summary.costPerKg || 135} / kg</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Items / Layers Table */}
          <table className="items-table">
            <thead>
              <tr>
                <th style={{ width: '4%' }}>#</th>
                <th style={{ width: '28%' }}>Description / Specification</th>
                <th style={{ width: '8%' }}>Micron</th>
                <th style={{ width: '8%' }}>GSM</th>
                <th style={{ width: '10%' }}>Net Req.</th>
                <th style={{ width: '8%' }}>Wastage</th>
                <th style={{ width: '10%' }}>Gross Req.</th>
                <th style={{ width: '10%' }}>Rate</th>
                <th style={{ width: '14%' }}>Taxable Amount</th>
              </tr>
            </thead>
            <tbody>
              {layersList.map((layer, index) => (
                <tr key={index}>
                  <td className="center">{index + 1}</td>
                  <td>
                    <div className="item-name">{layer.filmType}</div>
                    <div className="item-meta">Substrate Density: {layer.density} g/cm³</div>
                  </td>
                  <td className="center">{layer.micron} µ</td>
                  <td className="center">{layer.gsm.toFixed(1)}</td>
                  <td className="right">{layer.netKg} Kg</td>
                  <td className="center">{wastagePct}%</td>
                  <td className="right" style={{ fontWeight: 'bold' }}>{layer.grossKg} Kg</td>
                  <td className="right">₹{layer.pricePerKg}</td>
                  <td className="right">{formatINR(layer.totalCost)}</td>
                </tr>
              ))}
              {/* Ink Row */}
              <tr>
                <td className="center">{layersList.length + 1}</td>
                <td>
                  <div className="item-name">Liquid Inks & Solvents</div>
                  <div className="item-meta">20% Weight Gain Allowance</div>
                </td>
                <td className="center">-</td>
                <td className="center">{inkDetails.gsm || 1.5}</td>
                <td className="right">{inkDetails.netKg || 33.2} Kg</td>
                <td className="center">{wastagePct}%</td>
                <td className="right" style={{ fontWeight: 'bold' }}>{inkDetails.grossKg || 34.8} Kg</td>
                <td className="right">₹{inkDetails.pricePerKg || 1500}</td>
                <td className="right">{formatINR(inkDetails.totalCost || 52200)}</td>
              </tr>
              {/* Adhesive Row */}
              <tr>
                <td className="center">{layersList.length + 2}</td>
                <td>
                  <div className="item-name">Solvent-less Lamination Adhesive</div>
                  <div className="item-meta">100% Solid Content</div>
                </td>
                <td className="center">-</td>
                <td className="center">{adhesiveDetails.gsm || 1.5}</td>
                <td className="right">{adhesiveDetails.netKg || 33.2} Kg</td>
                <td className="center">{wastagePct}%</td>
                <td className="right" style={{ fontWeight: 'bold' }}>{adhesiveDetails.grossKg || 34.8} Kg</td>
                <td className="right">₹{adhesiveDetails.pricePerKg || 270}</td>
                <td className="right">{formatINR(adhesiveDetails.totalCost || 9396)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="6" className="right" style={{ fontWeight: 'bold' }}>Total Raw Material Quantity Required</td>
                <td className="right" style={{ fontWeight: 'bold' }}>{totalRawMaterialKg.toFixed(2)} Kg</td>
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
                    <td className="label">Item Raw Material Total :</td>
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

          {/* Terms & Instructions */}
          <div className="letterhead-terms-box">
            <div style={{ display: 'flex', items: 'center', justify: 'space-between', marginBottom: '4px' }}>
              <h4 style={{ margin: 0 }}>Store & Purchase Department Instructions:</h4>
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
              {(currentOcnTerms || []).map((term, idx) => (
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
