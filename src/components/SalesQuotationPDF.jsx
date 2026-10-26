import React from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { loadLetterhead } from '../services/companyProfile';
import CompanyProfileNotice from './CompanyProfileNotice';
import { getAuthorisedSignature, getCompanyLogo } from '../services/settingsService';
import { calculateGSTBreakdown, formatINR } from '../utils/pdfHelpers';
import './salesQuotationPrint.css';

function money(amount) {
  return formatINR(amount);
}

function lineAmount(item) {
  return (parseFloat(item.quantity) || 0) * (parseFloat(item.ratePerUom) || 0);
}

function structureText(item) {
  if (item.materialFormat === 'Rotogravure Cylinder') {
    return item.description || item.structure || 'Rotogravure Cylinder Description N/A';
  }
  return item.structure || 'N/A';
}

export default function SalesQuotationPDF({ quotationData, onClose }) {
  const letterhead = loadLetterhead();
  if (!quotationData) return null;
  if (letterhead.error) return <CompanyProfileNotice message={letterhead.error} onClose={onClose} />;
  const COMPANY_DETAILS = letterhead.company;

  const logoImage = getCompanyLogo();
  const signatureImage = getAuthorisedSignature();

  const {
    quotationNo = "SIL/QTN/26-27/001",
    amendmentNo = "Rev 00",
    enquiryDate = new Date().toISOString().split('T')[0],
    estimatedDeliveryDate = "2026-08-25",
    salesManager = "Samyak Jain",
    clientName = "Britannia Industries Ltd",
    clientAddress = "Britannia Executive Centre, Pithampur Sector 3, MP",
    clientGstin = "23AABCB1234F1Z1",
    contactPerson = "Rajesh Sharma",
    contactPhone = "+91 98260 11223",
    contactEmail = "rsharma@britannia.co.in",
    paymentTerms = "30 Days Net from date of Invoice",
    cylinderTerms = "Cylinder Development Cost borne by Client @ ₹6,500/cylinder",
    transportTerms = "Freight Included (FOR Pithampur Factory)",
    items = [],
    termsAndConditions = [],
    comments = ""
  } = quotationData;

  const totalTaxable = items.reduce((acc, it) => acc + (parseFloat(it.taxableAmount) || (it.quantity * it.ratePerUom)), 0);
  const gstBreakdown = calculateGSTBreakdown(clientGstin, clientAddress, totalTaxable, 18, COMPANY_DETAILS.gstin);
  const totalGrand = gstBreakdown.grandTotal;

  return (
    <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.8)', zIndex: 1100 }}>
      <div
        className="modal-content glass-panel"
          style={{
          width: '210mm',
          maxWidth: '96vw',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '16px 12px',
          background: '#ffffff',
          color: '#0f172a',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px' }}>
          <button
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: '700' }}
            onClick={onClose}
          >
            <ArrowLeft size={18} /> Back to Sales Dashboard
          </button>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', background: '#1e293b', borderColor: '#1e293b', fontWeight: '800' }}
              onClick={() => window.print()}
            >
              <Printer size={18} /> Print Sales Quotation PDF
            </button>
          </div>
        </div>

        <div id="printable-quotation" className="printable-document quote-sheet">
          <header className="quote-head">
            <div>
              {logoImage ? (
                <img src={logoImage} alt="Company Logo" className="samyak-logo-img" />
              ) : (
                <h1 className="letterhead-company-name">{COMPANY_DETAILS.name}</h1>
              )}
              <div className="quote-address">{COMPANY_DETAILS.address}</div>
              <div className="quote-ids">
                <b>GSTIN:</b> {COMPANY_DETAILS.gstin} | <b>CIN:</b> {COMPANY_DETAILS.cin}
              </div>
            </div>

            <div>
              <div className="quote-kicker">SALES QUOTATION</div>
              <table className="quote-meta-table">
                <tbody>
                  <tr>
                    <th>Quotation no.</th>
                    <td>{quotationNo}</td>
                  </tr>
                  <tr>
                    <th>Amendment</th>
                    <td>{amendmentNo}</td>
                  </tr>
                  <tr>
                    <th>Date</th>
                    <td>{enquiryDate}</td>
                  </tr>
                  <tr>
                    <th>Est. delivery</th>
                    <td>{estimatedDeliveryDate}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </header>

          <section className="quote-parties">
            <div className="quote-party">
              <div className="quote-label">Client / customer details</div>
              <div className="quote-client">{clientName}</div>
              <p>{clientAddress}</p>
              <p><b>GSTIN:</b> {clientGstin}</p>
            </div>
            <div className="quote-party">
              <div className="quote-label">Contact person details</div>
              <p>Contact person: <b>{contactPerson}</b></p>
              <p>Phone: <b>{contactPhone}</b></p>
              <p>Email: <b>{contactEmail}</b></p>
            </div>
          </section>

          <h2 className="quote-section">Product specifications and commercial rate sheet</h2>
          <table className="quote-lines">
            <colgroup>
              <col className="c-sn" />
              <col className="c-job" />
              <col className="c-spec" />
              <col className="c-fmt" />
              <col className="c-qty" />
              <col className="c-rate" />
              <col className="c-amt" />
            </colgroup>
            <thead>
              <tr>
                <th>No.</th>
                <th>Product / job</th>
                <th>Structure</th>
                <th>Format</th>
                <th className="num">Qty</th>
                <th className="num">Rate</th>
                <th className="num">Taxable amt</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td className="text job">{it.jobTitle}</td>
                  <td className="text pre">{structureText(it)}</td>
                  <td className="text">{it.materialFormat || 'Roll Form'}</td>
                  <td className="num"><span className="quote-money">{(parseFloat(it.quantity) || 0).toLocaleString('en-IN')} {it.uom}</span></td>
                  <td className="num"><span className="quote-money">{money(it.ratePerUom)}</span></td>
                  <td className="num"><span className="quote-money">{money(lineAmount(it))}</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="quote-totals">
            <div className="quote-total-row">
              <span>Subtotal (Taxable Value)</span>
              <b className="quote-money">{money(totalTaxable)}</b>
            </div>

            {gstBreakdown?.isIntraState ? (
              <>
                <div className="quote-total-row">
                  <span>CGST ({gstBreakdown?.cgstRatePct || 0}% Central Tax)</span>
                  <b className="quote-money">{money(gstBreakdown?.cgstAmount)}</b>
                </div>
                <div className="quote-total-row">
                  <span>SGST ({gstBreakdown?.sgstRatePct || 0}% State Tax - MP)</span>
                  <b className="quote-money">{money(gstBreakdown?.sgstAmount)}</b>
                </div>
              </>
            ) : (
              <div className="quote-total-row">
                <span>IGST ({gstBreakdown?.igstRatePct || 0}% Integrated Tax)</span>
                <b className="quote-money">{money(gstBreakdown?.igstAmount)}</b>
              </div>
            )}

            <div className="quote-total-row quote-grand">
              <span>Total Quotation Amount</span>
              <span className="quote-money">{money(totalGrand)}</span>
            </div>
            <div className="quote-gst-note">({gstBreakdown.label})</div>
          </section>

          <section className="quote-terms">
            <h2 className="quote-section">Commercial and logistics terms</h2>
            <p className="quote-term-line"><b>Payment terms:</b> {paymentTerms}</p>
            <p className="quote-term-line"><b>Cylinder terms:</b> {cylinderTerms}</p>
            <p className="quote-term-line"><b>Freight and transport:</b> {transportTerms}</p>
          </section>

          <section className="quote-terms pdf-keep-with-next">
            <h2 className="quote-section">Terms and conditions</h2>
            <ul className="quote-conditions">
              {termsAndConditions.map((term, i) => (
                <li key={i}>{term}</li>
              ))}
            </ul>
          </section>

          {comments && (
            <div className="quote-comments">
              <b>Special comments:</b> {comments}
            </div>
          )}

          <div className="quote-sign pdf-signature-block">
            <div className="quote-prepared">
              <div><b>Prepared by:</b> {salesManager}</div>
              <div><b>Issued on:</b> {enquiryDate}</div>
            </div>

            <div className="pdf-sign-company">
              <div>For {COMPANY_DETAILS.name}</div>
              <div className="pdf-sign-slot">
                {signatureImage ? (
                  <img src={signatureImage} alt="Authorised Signature" />
                ) : (
                  <span style={{ fontFamily: 'serif', fontStyle: 'italic' }}>Sy</span>
                )}
              </div>
              <div className="pdf-sign-role">Authorised Signatory</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
