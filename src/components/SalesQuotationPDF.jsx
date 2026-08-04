import React from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import { getAuthorisedSignature, getCompanyLogo } from '../services/settingsService';
import { calculateGSTBreakdown } from '../utils/pdfHelpers';

export default function SalesQuotationPDF({ quotationData, onClose }) {
  if (!quotationData) return null;

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
    status = "Sent to Client",
    items = [],
    termsAndConditions = [],
    comments = ""
  } = quotationData;

  const totalTaxable = items.reduce((acc, it) => acc + (parseFloat(it.taxableAmount) || (it.quantity * it.ratePerUom)), 0);
  const gstBreakdown = calculateGSTBreakdown(clientGstin, clientAddress, totalTaxable, 18, COMPANY_DETAILS.gstin || '23AAACS9988F1Z1');
  const totalGrand = gstBreakdown.grandTotal;

  return (
    <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.8)', zIndex: 1100 }}>
      <div 
        className="modal-content glass-panel" 
        style={{ 
          width: '900px', 
          maxHeight: '92vh', 
          overflowY: 'auto', 
          padding: '30px',
          background: '#ffffff',
          color: '#0f172a',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Control Bar (Non-Printable) */}
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

        {/* PRINTABLE LETTERHEAD AREA */}
        <div id="printable-quotation" style={{ padding: '20px', background: '#ffffff', color: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif' }}>
          
          {/* Header Company Banner */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #1e293b', paddingBottom: '16px', marginBottom: '20px' }}>
            <div>
              {logoImage ? (
                <img src={logoImage} alt="Company Logo" style={{ height: '55px', maxWidth: '240px', objectFit: 'contain', marginBottom: '8px' }} />
              ) : (
                <h1 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#1e293b', margin: 0, letterSpacing: '-0.5px' }}>
                  {COMPANY_DETAILS.name || 'SAMYAK INTERNATIONAL LTD'}
                </h1>
              )}
              <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '4px', maxWidth: '420px', lineHeight: '1.4' }}>
                {COMPANY_DETAILS.address || 'Plot 42, Sector 3, Pithampur Industrial Area, Indore, MP 454775'}<br />
                <b>GSTIN:</b> {COMPANY_DETAILS.gstin || '23AAACS9988F1Z1'} | <b>CIN:</b> U25200MP2015PLC03412
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ background: '#1e293b', color: '#ffffff', padding: '6px 16px', borderRadius: '6px', fontWeight: '900', fontSize: '1.05rem', letterSpacing: '0.5px', display: 'inline-block' }}>
                SALES QUOTATION
              </div>
              <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#334155' }}>
                <div>Quotation No: <b style={{ color: '#1e293b' }}>{quotationNo}</b></div>
                <div>Amendment / Rev: <b style={{ color: '#047857' }}>{amendmentNo}</b></div>
                <div>Date: <b>{enquiryDate}</b></div>
                <div>Est. Delivery: <b>{estimatedDeliveryDate}</b></div>
              </div>
            </div>
          </div>

          {/* Customer & Sales Details Box */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                CLIENT / CUSTOMER DETAILS
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>{clientName}</div>
              <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '4px', lineHeight: '1.4' }}>{clientAddress}</div>
              <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: '6px' }}>
                <b>GSTIN:</b> {clientGstin}
              </div>
            </div>

            <div style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                CONTACT PERSON & SALES EXECUTIVE
              </div>
              <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                <div>Contact Person: <b>{contactPerson}</b></div>
                <div>Phone: <b>{contactPhone}</b></div>
                <div>Email: <b>{contactEmail}</b></div>
                <div style={{ marginTop: '6px' }}>Sales Representative: <b>{salesManager}</b></div>
              </div>
            </div>
          </div>

          {/* Product Specifications & Pricing Table */}
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ fontSize: '0.92rem', fontWeight: '800', color: '#1e293b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📦 Product Specifications & Commercial Rate Sheet
            </h4>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#ffffff' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>S.N</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Product / Job Description</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Substrate Structure</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Material Format</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Quantity</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate / UOM</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Taxable Amt (₹)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px' }}>{idx + 1}</td>
                    <td style={{ padding: '10px', fontWeight: '700', color: '#0f172a' }}>{it.jobTitle}</td>
                    <td style={{ padding: '10px', fontSize: '0.8rem', color: '#334155' }}>{it.structure}</td>
                    <td style={{ padding: '10px' }}>
                      <span className="badge badge-info" style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}>
                        {it.materialFormat || 'Roll Form'}
                      </span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: '800' }}>
                      {(parseFloat(it.quantity) || 0).toLocaleString()} {it.uom}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: '700' }}>
                      ₹ {(parseFloat(it.ratePerUom) || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: '800', color: '#1e293b' }}>
                      ₹ {((parseFloat(it.quantity) || 0) * (parseFloat(it.ratePerUom) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tax Breakdown & Commercial Calculation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div style={{ width: '55%', fontSize: '0.82rem', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
              <div style={{ fontWeight: '800', color: '#1e293b', marginBottom: '6px' }}>COMMERCIAL & LOGISTICS TERMS</div>
              <div style={{ marginBottom: '4px' }}><b>Payment Terms:</b> {paymentTerms}</div>
              <div style={{ marginBottom: '4px' }}><b>Cylinder Terms:</b> {cylinderTerms}</div>
              <div><b>Freight & Transport:</b> {transportTerms}</div>
            </div>

            <div style={{ width: '42%', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>Subtotal (Taxable Value):</span>
                <b>₹ {totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </div>

              {gstBreakdown.isIntraState ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#334155' }}>
                    <span>CGST ({gstBreakdown.cgstRatePct}% Central Tax):</span>
                    <b>₹ {gstBreakdown.cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#334155' }}>
                    <span>SGST ({gstBreakdown.sgstRatePct}% State Tax - MP):</span>
                    <b>₹ {gstBreakdown.sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#334155' }}>
                  <span>IGST ({gstBreakdown.igstRatePct}% Integrated Tax):</span>
                  <b>₹ {gstBreakdown.igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #1e293b', fontSize: '1.05rem', fontWeight: '900', color: '#1e293b', marginTop: '4px' }}>
                <span>Total Quotation Amount:</span>
                <span>₹ {totalGrand.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic', marginTop: '2px', textAlign: 'right' }}>
                ({gstBreakdown.label})
              </div>
            </div>
          </div>

          {/* Standard Terms & Conditions Bullet Points */}
          <div style={{ marginBottom: '20px', fontSize: '0.8rem', background: '#fafafa', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: '800', color: '#1e293b', marginBottom: '6px' }}>TERMS & CONDITIONS</div>
            <ul style={{ margin: 0, paddingLeft: '18px', color: '#475569', lineHeight: '1.5' }}>
              {termsAndConditions.map((term, i) => (
                <li key={i}>{term}</li>
              ))}
            </ul>
          </div>

          {comments && (
            <div style={{ marginBottom: '24px', fontSize: '0.82rem', color: '#334155', fontStyle: 'italic', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid #1e293b' }}>
              <b>Special Comments:</b> {comments}
            </div>
          )}

          {/* Signatures & Authorization Section */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '20px', borderTop: '1px dashed #cbd5e1', marginTop: '24px' }}>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              <div><b>Prepared By:</b> {salesManager}</div>
              <div><b>Issued On:</b> {enquiryDate}</div>
            </div>

            <div style={{ textAlign: 'center' }}>
              {signatureImage ? (
                <img src={signatureImage} alt="Authorised Signature" style={{ height: '55px', maxHeight: '55px', objectFit: 'contain', marginBottom: '4px' }} />
              ) : (
                <div style={{ height: '45px' }}></div>
              )}
              <div style={{ borderTop: '1.5px solid #0f172a', width: '200px', margin: '0 auto', paddingTop: '4px', fontWeight: '800', fontSize: '0.85rem', color: '#0f172a' }}>
                For Samyak International Ltd
              </div>
              <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>Authorized Signature</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
