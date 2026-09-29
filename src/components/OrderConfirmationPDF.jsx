import React, { useState } from 'react';
import { Printer, ArrowLeft, Edit3, Plus, Trash2 } from 'lucide-react';
import { COMPANY_DETAILS, isLDFilm, getFilmSlitWidth } from '../factoryStore';
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
    jobName = "",
    clientName = "",
    printWidthMm: rawPrintWidth,
    repeatLengthMm: rawRepeatLength,
    orderQtyKg = 0,
    orderType = "Reel",
    wastagePct = 0,
    totalLaminateGsm = 0,
    totalAreaSqm = 0,
    layerResults = [],
    inkDetails = {},
    adhesiveDetails = {},
    summary = {}
  } = calculationData || {};

  const resolvedJobName = jobName || calculationData?.jobMasterData?.jobName || calculationData?.orderData?.jobName || "—";
  const resolvedClientName = clientName || calculationData?.jobMasterData?.clientName || calculationData?.orderData?.clientName || "";
  const printWidthMm = rawPrintWidth || calculationData?.jobMasterData?.printWidthMm || calculationData?.orderData?.printWidthMm || 0;
  const repeatLengthMm = rawRepeatLength || calculationData?.jobMasterData?.repeatLengthMm || calculationData?.orderData?.repeatLengthMm || 0;
  const resolvedOrderQtyKg = orderQtyKg || calculationData?.jobMasterData?.orderQtyKg || calculationData?.orderData?.orderQtyKg || 0;
  const resolvedLaminateGsm = totalLaminateGsm || summary.totalLaminateGsm || 0;
  const resolvedAreaSqm = totalAreaSqm || summary.totalSurfaceAreaSqm || 0;

  // Variants Resolution
  const hasVariants = Boolean(
    calculationData?.hasVariants ||
    calculationData?.jobDetails?.hasVariants ||
    calculationData?.orderData?.hasVariants ||
    calculationData?.jobMasterData?.hasVariants ||
    (calculationData?.variants && calculationData.variants.length > 0) ||
    (calculationData?.jobDetails?.variants && calculationData.jobDetails.variants.length > 0) ||
    (calculationData?.orderData?.variants && calculationData.orderData.variants.length > 0)
  );

  const rawVariants =
    calculationData?.variants ||
    calculationData?.jobDetails?.variants ||
    calculationData?.orderData?.variants ||
    calculationData?.jobMasterData?.variants ||
    [];

  const activeVariants = (Array.isArray(rawVariants) ? rawVariants : [])
    .filter(v => v && (v.variantName || v.name || '').trim())
    .map((v, i) => ({
      id: v.id || i + 1,
      variantName: v.variantName || v.name || `Variant #${i + 1}`,
      allocatedQtyKg: parseFloat(v.allocatedQtyKg || v.qtyKg || v.quantity || 0) || 0,
      notes: v.notes || ''
    }));

  const layersList = layerResults.length > 0 ? layerResults : [];

  // Resolve Client Details dynamically from Client Directory / Job Master
  const targetClientName = calculationData?.clientName || resolvedClientName || "";
  const clientStore = (clients && clients.length > 0) ? clients : [];

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
    address: matchedClient?.address || "Address Not Specified",
    contactPerson: matchedClient?.contactPerson || "N/A",
    email: matchedClient?.email || "N/A",
    contactNo: matchedClient?.phone || matchedClient?.contactNo || "N/A",
    gstin: matchedClient?.gstin || "N/A"
  };

  const hasInk = Boolean(inkDetails && (inkDetails.grossKg > 0 || inkDetails.totalCost > 0 || inkDetails.netKg > 0));
  const hasAdhesive = Boolean(adhesiveDetails && (adhesiveDetails.grossKg > 0 || adhesiveDetails.totalCost > 0 || adhesiveDetails.netKg > 0));

  const totalRawMaterialKg = (summary.totalFilmGrossKg || 0) + (hasInk ? (inkDetails.grossKg || 0) : 0) + (hasAdhesive ? (adhesiveDetails.grossKg || 0) : 0);
  const totalTaxable = summary.totalRawMaterialCost || summary.totalTaxable || 0;
  
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

      <div className="pdf-paper-container" style={{ background: '#ffffff', minHeight: '297mm', height: 'auto', boxSizing: 'border-box' }}>
        <div className="printable-document" id="printable-ocn" style={{ background: '#ffffff', minHeight: 'calc(297mm - 24mm)', height: 'auto', boxSizing: 'border-box' }}>
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
                  <td className="value-col">{resolvedJobName}</td>
                  <td className="label-col">Order Form</td>
                  <td className="value-col">{orderType} Form</td>
                </tr>
                <tr>
                  <td className="label-col">Print Size (Width x Repeat)</td>
                  <td className="value-col">{printWidthMm ? `${printWidthMm} mm` : '—'} × {repeatLengthMm ? `${repeatLengthMm} mm` : '—'}</td>
                  <td className="label-col">Order Quantity</td>
                  <td className="value-col">{resolvedOrderQtyKg ? `${resolvedOrderQtyKg.toLocaleString()} Kg` : '0 Kg'}</td>
                </tr>
                <tr>
                  <td className="label-col">Total Laminate GSM</td>
                  <td className="value-col">{resolvedLaminateGsm ? `${Number(resolvedLaminateGsm).toFixed(1)} g/m²` : '—'}</td>
                  <td className="label-col">Surface Area</td>
                  <td className="value-col">{resolvedAreaSqm ? `${resolvedAreaSqm.toLocaleString()} m²` : '—'}</td>
                </tr>
                <tr>
                  <td className="label-col">Wastage Allowed</td>
                  <td className="value-col">{wastagePct}%</td>
                  <td className="label-col">Calculated Rate / Kg</td>
                  <td className="value-col">₹{summary.costPerKg ? Number(summary.costPerKg).toFixed(2) : '0'} / kg</td>
                </tr>
                {hasVariants && (
                  <tr>
                    <td className="label-col">SKU / Variant Split</td>
                    <td className="value-col" colSpan="3" style={{ fontWeight: '600', color: '#1d4ed8' }}>
                      Enabled ({activeVariants.length} Variant{activeVariants.length !== 1 ? 's' : ''}: {activeVariants.map(v => `${v.variantName} - ${v.allocatedQtyKg}kg`).join(', ')})
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Variants Table if enabled */}
          {hasVariants && activeVariants.length > 0 && (
            <div className="details-section-container" style={{ marginTop: '10px' }}>
              <div className="details-section-header" style={{ background: '#f3f4f6', color: '#111827', borderBottom: '1px solid #d1d5db' }}>
                Order SKU Variants / Flavor Split Breakdown
              </div>
              <table className="items-table" style={{ marginTop: 0, marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: '6%' }}>#</th>
                    <th style={{ width: '44%' }}>SKU / Variant Name</th>
                    <th style={{ width: '20%' }}>Allocated Qty (Kg)</th>
                    <th style={{ width: '15%' }}>Share (%)</th>
                    <th style={{ width: '15%' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {activeVariants.map((v, index) => {
                    const sharePct = resolvedOrderQtyKg > 0 ? ((v.allocatedQtyKg / resolvedOrderQtyKg) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={index}>
                        <td className="center">{index + 1}</td>
                        <td style={{ fontWeight: '600', color: '#1f2937' }}>{v.variantName}</td>
                        <td className="right" style={{ fontWeight: 'bold' }}>{v.allocatedQtyKg.toLocaleString()} Kg</td>
                        <td className="center">{sharePct}%</td>
                        <td className="center" style={{ fontSize: '9px', color: '#6b7280' }}>{v.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="2" className="right" style={{ fontWeight: 'bold' }}>Total Variant Quantity</td>
                    <td className="right" style={{ fontWeight: 'bold' }}>
                      {activeVariants.reduce((sum, v) => sum + v.allocatedQtyKg, 0).toLocaleString()} Kg
                    </td>
                    <td className="center" style={{ fontWeight: 'bold' }}>
                      {resolvedOrderQtyKg > 0
                        ? `${((activeVariants.reduce((sum, v) => sum + v.allocatedQtyKg, 0) / resolvedOrderQtyKg) * 100).toFixed(0)}%`
                        : '100%'}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

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
              {layersList.length > 0 ? (
                layersList.map((layer, index) => {
                  const filmSize = layer.widthMm || layer.filmSize || layer.size || layer.slitWidth || (printWidthMm ? getFilmSlitWidth(layer.filmType, printWidthMm) : null);
                  return (
                    <tr key={index}>
                      <td className="center">{index + 1}</td>
                      <td>
                        <div className="item-name">{layer.filmType}</div>
                        <div className="item-meta">
                          Substrate Density: {layer.density} g/cm³
                          {filmSize ? ` • Film Size: ${filmSize} mm` : ''}
                        </div>
                      </td>
                      <td className="center">{layer.micron} µ</td>
                      <td className="center">{Number(layer.gsm).toFixed(1)}</td>
                      <td className="right">{layer.netKg} Kg</td>
                      <td className="center">{wastagePct}%</td>
                      <td className="right" style={{ fontWeight: 'bold' }}>{layer.grossKg} Kg</td>
                      <td className="right">₹{layer.pricePerKg}</td>
                      <td className="right">{formatINR(layer.totalCost)}</td>
                    </tr>
                  );
                })
              ) : (
                !hasInk && !hasAdhesive && (
                  <tr>
                    <td colSpan="9" className="center" style={{ padding: '12px', color: '#6b7280' }}>
                      No substrate layer specifications available.
                    </td>
                  </tr>
                )
              )}
              {/* Ink Row */}
              {hasInk && (
                <tr>
                  <td className="center">{layersList.length + 1}</td>
                  <td>
                    <div className="item-name">Liquid Inks & Solvents</div>
                    <div className="item-meta">Weight Gain / Coverage Allowance</div>
                  </td>
                  <td className="center">-</td>
                  <td className="center">{inkDetails.gsm ? Number(inkDetails.gsm).toFixed(1) : '-'}</td>
                  <td className="right">{inkDetails.netKg ? `${inkDetails.netKg} Kg` : '-'}</td>
                  <td className="center">{wastagePct}%</td>
                  <td className="right" style={{ fontWeight: 'bold' }}>{inkDetails.grossKg ? `${inkDetails.grossKg} Kg` : '-'}</td>
                  <td className="right">{inkDetails.pricePerKg ? `₹${inkDetails.pricePerKg}` : '-'}</td>
                  <td className="right">{formatINR(inkDetails.totalCost || 0)}</td>
                </tr>
              )}
              {/* Adhesive Row */}
              {hasAdhesive && (
                <tr>
                  <td className="center">{layersList.length + (hasInk ? 2 : 1)}</td>
                  <td>
                    <div className="item-name">Solvent-less Lamination Adhesive</div>
                    <div className="item-meta">100% Solid Content</div>
                  </td>
                  <td className="center">-</td>
                  <td className="center">{adhesiveDetails.gsm ? Number(adhesiveDetails.gsm).toFixed(1) : '-'}</td>
                  <td className="right">{adhesiveDetails.netKg ? `${adhesiveDetails.netKg} Kg` : '-'}</td>
                  <td className="center">{wastagePct}%</td>
                  <td className="right" style={{ fontWeight: 'bold' }}>{adhesiveDetails.grossKg ? `${adhesiveDetails.grossKg} Kg` : '-'}</td>
                  <td className="right">{adhesiveDetails.pricePerKg ? `₹${adhesiveDetails.pricePerKg}` : '-'}</td>
                  <td className="right">{formatINR(adhesiveDetails.totalCost || 0)}</td>
                </tr>
              )}
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
