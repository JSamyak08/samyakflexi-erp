import React from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import { numberToWords, formatINR } from '../utils/pdfHelpers';

export default function PurchaseOrderPDF({ poData, onClose }) {
  if (!poData) return null;

  const {
    poNumber = "SIL/PO/26-27/246",
    poDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    deliveryDate = "24/07/2026",
    ocDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    indentDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    indentNumber = "IND/107",
    amendmentNo = "0",
    paymentTerms = "60 Days",
    logisticDetails = "Freight Included within Indore",
    vendor = {},
    items = []
  } = poData;

  // Standard sample items if empty
  const poItems = items && items.length > 0 ? items : [
    {
      id: 1,
      description: "Flint Process Magenta (REVERSE)",
      itemId: "WCL4-302K-01FW",
      make: "Flint",
      hsnCode: "3215",
      qtyKg: 400,
      rate: 250,
      cgstRate: 9,
      sgstRate: 9
    },
    {
      id: 2,
      description: "Flint Super White 55B (REVERSE)",
      itemId: "WCL4-001K-01GD",
      make: "Flint",
      hsnCode: "3215",
      qtyKg: 500,
      rate: 240,
      cgstRate: 9,
      sgstRate: 9
    },
    {
      id: 3,
      description: "Flint ARSR Magenta (REVERSE)",
      itemId: "WCL4-303K-01FW",
      make: "Flint",
      hsnCode: "3215",
      qtyKg: 80,
      rate: 410,
      cgstRate: 9,
      sgstRate: 9
    },
    {
      id: 4,
      description: "Flint PET Lam Red Lacquer Ink",
      itemId: "WCL4-37AK-01GU",
      make: "Flint",
      hsnCode: "3215",
      qtyKg: 94,
      rate: 400,
      cgstRate: 9,
      sgstRate: 9
    },
    {
      id: 5,
      description: "BOPP LAM ADHESION INK",
      itemId: "GBLEB011",
      make: "Flint",
      hsnCode: "35069999",
      qtyKg: 100,
      rate: 395,
      cgstRate: 9,
      sgstRate: 9
    },
    {
      id: 6,
      description: "Flint AR Orange (REVERSE)",
      itemId: "WCL4-205K-01FW",
      make: "Flint",
      hsnCode: "3215",
      qtyKg: 180,
      rate: 290,
      cgstRate: 9,
      sgstRate: 9
    }
  ];

  // Calculated Totals
  const totalQtyKg = poItems.reduce((acc, item) => acc + (parseFloat(item.qtyKg) || 0), 0);
  const totalTaxable = poItems.reduce((acc, item) => {
    const qty = parseFloat(item.qtyKg) || 0;
    const rate = parseFloat(item.rate) || 0;
    return acc + (qty * rate);
  }, 0);

  const totalCgst = poItems.reduce((acc, item) => {
    const qty = parseFloat(item.qtyKg) || 0;
    const rate = parseFloat(item.rate) || 0;
    const cgstPct = parseFloat(item.cgstRate) || 9;
    return acc + ((qty * rate * cgstPct) / 100);
  }, 0);

  const totalSgst = poItems.reduce((acc, item) => {
    const qty = parseFloat(item.qtyKg) || 0;
    const rate = parseFloat(item.rate) || 0;
    const sgstPct = parseFloat(item.sgstRate) || 9;
    return acc + ((qty * rate * sgstPct) / 100);
  }, 0);

  const totalTax = totalCgst + totalSgst;
  const grandTotal = totalTaxable + totalTax;

  const supplier = {
    name: vendor.companyName || vendor.name || "Creative Marketing",
    address: vendor.address || "Sadhuwasvani Nagar, 2-B, Near Sadhuwasvani Garden, Indore (Madhya Pradesh) India - 452007",
    email: vendor.email || "creativemarketing.ak@gmail.com",
    contactNo: vendor.phone || vendor.contactNo || "9425066225",
    gstin: vendor.gstin || "23AAQFC4167Q1ZT",
    contactPerson: vendor.contactPerson || "Abhijeet Kher"
  };

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal-toolbar no-print">
        <button className="btn-secondary" onClick={onClose}>
          <ArrowLeft size={16} /> Back to Orders
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print Purchase Order PDF
        </button>
      </div>

      <div className="pdf-paper-container">
        <div className="printable-document">
          <div className="letterhead-header">
            <div className="letterhead-brand">
              <img src={COMPANY_DETAILS.logoUrl} alt="Samyak International Ltd Logo" className="samyak-logo-img" style={{ height: '46px', objectFit: 'contain' }} />
              <div>
                <p className="letterhead-company-sub" style={{ marginTop: '4px', fontSize: '9px', fontWeight: 'bold', color: '#4b5563' }}>
                  {COMPANY_DETAILS.tagline}
                </p>
              </div>
            </div>
            <div className="letterhead-doc-title">
              <h2>Purchase Order</h2>
              <div className="doc-ref-no">{poNumber}</div>
            </div>
          </div>


          {/* 3-Column Address Grid */}
          <table className="address-grid-table">
            <thead>
              <tr>
                <th>Name and Address of Buyer</th>
                <th>Name and Address of Supplier</th>
                <th>Shipping Details</th>
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
                  <div className="address-line">Place of Supply: {COMPANY_DETAILS.placeOfSupply}</div>
                </td>
                <td>
                  <div className="address-box-title">{supplier.name}</div>
                  <div className="address-line">{supplier.address}</div>
                  <div className="address-line">Email: {supplier.email}</div>
                  <div className="address-line">Contact No: {supplier.contactNo}</div>
                  <div className="address-line">GSTIN: {supplier.gstin}</div>
                  <div className="address-line">Kind Attention: {supplier.contactPerson}</div>
                </td>
                <td>
                  <div className="address-box-title">Factory - {COMPANY_DETAILS.name}</div>
                  <div className="address-line">{COMPANY_DETAILS.address}</div>
                  <div className="address-line">GSTIN: {COMPANY_DETAILS.gstin}</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* PO Details Grid */}
          <div className="details-section-container">
            <div className="details-section-header">PO Details</div>
            <table className="details-grid-table">
              <tbody>
                <tr>
                  <td className="label-col">PO Number</td>
                  <td className="value-col">{poNumber}</td>
                  <td className="label-col">PO Date</td>
                  <td className="value-col">{poDate}</td>
                </tr>
                <tr>
                  <td className="label-col">Delivery Date</td>
                  <td className="value-col">{deliveryDate}</td>
                  <td className="label-col">PO Amendment</td>
                  <td className="value-col">{amendmentNo}</td>
                </tr>
                <tr>
                  <td className="label-col">OC Date</td>
                  <td className="value-col">{ocDate}</td>
                  <td className="label-col">PO Amount</td>
                  <td className="value-col">{formatINR(grandTotal)}</td>
                </tr>
                <tr>
                  <td className="label-col">No of Items</td>
                  <td className="value-col">{poItems.length}</td>
                  <td className="label-col">Indent Date</td>
                  <td className="value-col">{indentDate}</td>
                </tr>
                <tr>
                  <td className="label-col">Payment Terms</td>
                  <td className="value-col">{paymentTerms}</td>
                  <td className="label-col">Indent Number</td>
                  <td className="value-col">{indentNumber}</td>
                </tr>
                <tr>
                  <td className="label-col">Logistic Details</td>
                  <td className="value-col" colSpan="3">{logisticDetails}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Line Items Table */}
          <table className="items-table">
            <thead>
              <tr>
                <th style={{ width: '4%' }}>#</th>
                <th style={{ width: '32%' }}>Description</th>
                <th style={{ width: '10%' }}>HSN/SAC Code</th>
                <th style={{ width: '10%' }}>Quantity</th>
                <th style={{ width: '10%' }}>Rate</th>
                <th style={{ width: '12%' }}>Taxable Amount</th>
                <th style={{ width: '11%' }}>CGST<br/><span style={{ fontSize: '8px' }}>Rate Amount</span></th>
                <th style={{ width: '11%' }}>SGST<br/><span style={{ fontSize: '8px' }}>Rate Amount</span></th>
                <th style={{ width: '10%' }}>Total</th>
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

                return (
                  <tr key={index}>
                    <td className="center">{index + 1}</td>
                    <td>
                      <div className="item-name">{item.description}</div>
                      {item.itemId && <div className="item-meta">Item ID:{item.itemId}</div>}
                      {item.make && <div className="item-meta">Make: {item.make}</div>}
                    </td>
                    <td className="center">{item.hsnCode || '3215'}</td>
                    <td className="right">{qty.toFixed(2)} Kg</td>
                    <td className="right">{formatINR(rate)}</td>
                    <td className="right">{formatINR(taxable)}</td>
                    <td className="right">
                      {cgstRate}% &nbsp; {formatINR(cgstAmt)}
                    </td>
                    <td className="right">
                      {sgstRate}% &nbsp; {formatINR(sgstAmt)}
                    </td>
                    <td className="right">{formatINR(totalAmt)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3" className="right" style={{ fontWeight: 'bold' }}>Total Quantity</td>
                <td className="right" style={{ fontWeight: 'bold' }}>{totalQtyKg.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Kg</td>
                <td colSpan="5"></td>
              </tr>
            </tfoot>
          </table>

          {/* Totals & Amounts in Words */}
          <div className="totals-and-words-grid">
            <div className="words-block">
              <div className="word-line">
                <span className="word-label">PO Amount</span>
                <span className="word-value">{numberToWords(grandTotal)}</span>
              </div>
              <div className="word-line">
                <span className="word-label">CGST</span>
                <span className="word-value">{numberToWords(totalCgst)}</span>
              </div>
              <div className="word-line">
                <span className="word-label">SGST</span>
                <span className="word-value">{numberToWords(totalSgst)}</span>
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
                            <th>CGST</th>
                            <th>SGST</th>
                            <th>IGST</th>
                            <th>Cess</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{formatINR(totalCgst)}</td>
                            <td>{formatINR(totalSgst)}</td>
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
                  <tr>
                    <td className="label">Total (after tax) :</td>
                    <td className="amount">{formatINR(grandTotal)}</td>
                  </tr>
                  <tr style={{ borderTop: '1px solid #111' }}>
                    <td className="label" style={{ fontSize: '11px', fontWeight: 'bold' }}>Grand Total :</td>
                    <td className="amount" style={{ fontSize: '11px', fontWeight: 'bold' }}>{formatINR(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="letterhead-terms-box">
            <h4>Terms And Conditions:</h4>
            <ul>
              <li>Solid Content of the ordered Inks shall be within the range mentioned in the TDS provided. Material not within the range shall be returned to the vendor.</li>
              <li>Any material not clearing the Quality Control parameters shall be returned to the vendor.</li>
              <li>All Item Codes of the supply shall be checked and sent. Any corrections in Item Codes shall be informed prior to dispatch by the vendor.</li>
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
