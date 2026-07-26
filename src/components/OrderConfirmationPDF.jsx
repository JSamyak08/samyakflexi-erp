import React, { useState } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import { numberToWords, formatINR } from '../utils/pdfHelpers';

export default function OrderConfirmationPDF({ calculationData, onClose }) {
  const [docRef] = useState(() => `SIL/OCN/26-27/${Math.floor(100 + (Date.now() % 900))}`);

  if (!calculationData) return null;

  const {
    jobName = "Britannia Bourbon 250g",
    clientName = "Britannia Industries Ltd",
    printWidthMm = 1000,
    repeatLengthMm = 400,
    orderQtyKg = 1000,
    orderType = "Reel",
    wastagePct = 5,
    totalLaminateGsm = 45.2,
    totalAreaSqm = 22123,
    layerResults = [],
    inkDetails = {},
    adhesiveDetails = {},
    summary = {}
  } = calculationData;

  const layersList = layerResults.length > 0 ? layerResults : [
    { filmType: "PET Film", micron: 12, density: 1.4, gsm: 16.8, netKg: 371.7, grossKg: 390.3, pricePerKg: 125, totalCost: 48787.5 },
    { filmType: "Natural LD GP Film", micron: 30, density: 0.93, gsm: 27.9, netKg: 617.2, grossKg: 648.1, pricePerKg: 115, totalCost: 74531.5 }
  ];

  const totalRawMaterialKg = (summary.totalFilmGrossKg || 0) + (inkDetails.grossKg || 0) + (adhesiveDetails.grossKg || 0) || 1088.4;
  const totalTaxable = summary.totalRawMaterialCost || 135000;
  const cgstAmt = totalTaxable * 0.09;
  const sgstAmt = totalTaxable * 0.09;
  const totalTax = cgstAmt + sgstAmt;
  const grandTotal = totalTaxable + totalTax;

  const clientInfo = {
    name: clientName || "Britannia Industries Ltd",
    address: "Plot 12, Pithampur Industrial Estate, Dhar, M.P. - 454775",
    contactPerson: "Rajesh Sharma (Procurement Head)",
    email: "procurement@britannia.co.in",
    contactNo: "+91 9826012345",
    gstin: "23AAACB1234F1Z5"
  };

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
        <div className="printable-document">
          {/* Header */}
          <div className="letterhead-header">
            <div className="letterhead-brand">
              <div className="samyak-logo-fallback">S</div>
              <div>
                <h1 className="letterhead-company-name">{COMPANY_DETAILS.name}</h1>
                <p className="letterhead-company-sub">{COMPANY_DETAILS.tagline}</p>
              </div>
            </div>
            <div className="letterhead-doc-title">
              <h2>Order Confirmation Note</h2>
              <div className="doc-ref-no">{docRef}</div>
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

          {/* Terms & Instructions */}
          <div className="letterhead-terms-box">
            <h4>Store & Purchase Department Instructions:</h4>
            <ul>
              <li>Issue Purchase Orders (POs) immediately for the gross raw material quantities listed above.</li>
              <li>Verify available store stock before releasing new purchase requisitions.</li>
              <li>Ensure all material specifications strictly comply with corona treatment, micron gauge, and dyne requirements.</li>
            </ul>
          </div>

          {/* Authorised Signatory */}
          <div className="letterhead-signatory-block">
            <div style={{ fontWeight: 'bold' }}>For {COMPANY_DETAILS.name}</div>
            <div style={{ height: '30px', display: 'flex', alignItems: 'center', fontStyle: 'italic', fontFamily: 'serif', fontSize: '16px', fontWeight: 'bold' }}>
              Sy
            </div>
            <div style={{ fontSize: '9px', fontWeight: 'bold' }}>Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}
