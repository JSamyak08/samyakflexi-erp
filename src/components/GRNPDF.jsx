import React from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import { numberToWords, formatINR } from '../utils/pdfHelpers';

export default function GRNPDF({ grnData, onClose }) {
  if (!grnData) return null;

  const {
    grnNo = "SIL/GRN/26-27/104",
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
              <div className="samyak-logo-fallback">S</div>
              <div>
                <h1 className="letterhead-company-name">{COMPANY_DETAILS.name}</h1>
                <p className="letterhead-company-sub">{COMPANY_DETAILS.tagline}</p>
              </div>
            </div>
            <div className="letterhead-doc-title">
              <h2>Goods Receipt Note</h2>
              <div className="doc-ref-no">{grnNo}</div>
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
                  <td className="value-col">{grnNo}</td>
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
                <td className="right" style={{ fontWeight: 'bold' }}>{netWeightKg.toLocaleString()} Kg</td>
                <td className="right">{formatINR(unitPrice)}</td>
                <td className="right">{formatINR(totalTaxable)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="6" className="right" style={{ fontWeight: 'bold' }}>Total Quantity Inwarded</td>
                <td className="right" style={{ fontWeight: 'bold' }}>{netWeightKg.toLocaleString()} Kg</td>
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
            <h4>Quality Control (QC) & Inward Inspection Report:</h4>
            <ul>
              <li><b>QC Observations:</b> {qcNotes}</li>
              <li>Material verified for micron gauge tolerance (±3%), dyne level (&ge;38 dynes/cm), and slit width accuracy.</li>
              <li>Stock updated in Factory Inventory store under inward batch reference {batchNo}.</li>
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
