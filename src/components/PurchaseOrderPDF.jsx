import React from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';

export default function PurchaseOrderPDF({ poData, onClose }) {
  if (!poData) return null;

  const {
    poNumber = "PO-2026-099",
    date = new Date().toLocaleDateString('en-IN'),
    vendor = {},
    items = [],
    deliveryDate = "",
    terms = "30 Days Net",
    remarks = "Materials must strictly conform to specified micron gauge and width. COA required upon delivery."
  } = poData;

  const subtotal = items.reduce((acc, item) => acc + (item.qtyKg * item.rate), 0);
  const gstAmount = subtotal * 0.18; // 18% GST on industrial raw material
  const grandTotal = Math.round(subtotal + gstAmount);

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal-toolbar no-print">
        <button className="btn-secondary" onClick={onClose}>
          <ArrowLeft size={16} /> Back to Orders
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print / Save PO PDF
        </button>
      </div>

      <div className="pdf-paper-container">
        <div className="printable-document">
          {/* Executive Letterhead Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <img src={COMPANY_DETAILS.logoUrl} alt="Samyak International Ltd" style={{ height: '54px', objectFit: 'contain' }} />
              <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '0.04em', color: '#0f172a', margin: 0, textTransform: 'uppercase' }}>
                  {COMPANY_DETAILS.name}
                </h1>
                <p style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569', margin: '2px 0 0 0' }}>
                  {COMPANY_DETAILS.tagline}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0 0' }}>
                  {COMPANY_DETAILS.address}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#475569', margin: '2px 0 0 0' }}>
                  GSTIN: <b>{COMPANY_DETAILS.gstin}</b> | Tel: {COMPANY_DETAILS.phones} | Email: {COMPANY_DETAILS.email}
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'right', borderLeft: '1px solid #cbd5e1', paddingLeft: '16px' }}>
              <div style={{ background: '#0f172a', color: '#ffffff', padding: '6px 12px', fontSize: '0.85rem', fontWeight: '800', letterSpacing: '0.05em', borderRadius: '4px', textTransform: 'uppercase' }}>
                PURCHASE ORDER
              </div>
              <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#0f172a', margin: '8px 0 0 0' }}>
                PO No: {poNumber}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0 0' }}>
                Date: {date}
              </p>
            </div>
          </div>

          <hr className="pdf-divider" />

          {/* Vendor & Delivery Information */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div style={{ border: '1px solid #cbd5e1', padding: '12px', borderRadius: '6px' }}>
              <h4 style={{ color: '#1e293b', marginBottom: '6px', fontSize: '0.85rem', textTransform: 'uppercase' }}>VENDOR DETAILS:</h4>
              <p style={{ fontWeight: 'bold', fontSize: '1rem', color: '#0f172a' }}>{vendor.companyName}</p>
              <p style={{ fontSize: '0.85rem', color: '#334155' }}>{vendor.address}</p>
              <p style={{ fontSize: '0.85rem', color: '#334155' }}>GSTIN: <b>{vendor.gstin}</b></p>
              <p style={{ fontSize: '0.85rem', color: '#334155' }}>Attn: {vendor.contactPerson} ({vendor.phone})</p>
            </div>

            <div style={{ border: '1px solid #cbd5e1', padding: '12px', borderRadius: '6px' }}>
              <h4 style={{ color: '#1e293b', marginBottom: '6px', fontSize: '0.85rem', textTransform: 'uppercase' }}>DELIVERY & DISPATCH DETAILS:</h4>
              <p style={{ fontSize: '0.85rem', color: '#334155' }}>Delivery Location: <b>Samyak Factory Store - Gate 2</b></p>
              <p style={{ fontSize: '0.85rem', color: '#334155' }}>Expected Delivery Date: <b style={{ color: '#b91c1c' }}>{deliveryDate || 'Immediate / Within 5 Days'}</b></p>
              <p style={{ fontSize: '0.85rem', color: '#334155' }}>Payment Terms: <b>{vendor.paymentTerms || terms}</b></p>
              <p style={{ fontSize: '0.85rem', color: '#334155' }}>Mode of Transport: Road Freight</p>
            </div>
          </div>

          {/* Items Table */}
          <div className="pdf-section-title">PURCHASE ORDER LINE ITEMS</div>
          <table className="pdf-data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Material Description / Specification</th>
                <th>Micron (µ)</th>
                <th>Width (mm)</th>
                <th>Quantity (Kg)</th>
                <th>Rate (₹/Kg)</th>
                <th>Total Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="bold-text">{item.description || `${item.filmType} Film`}</td>
                  <td>{item.micron || '-'} µ</td>
                  <td>{item.widthMm || '-'} mm</td>
                  <td className="bold-text highlight-col">{item.qtyKg} kg</td>
                  <td>₹{item.rate}</td>
                  <td>₹{(item.qtyKg * item.rate).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="5" className="text-right bold-text">Subtotal:</td>
                <td colSpan="2" className="bold-text">₹{subtotal.toLocaleString()}</td>
              </tr>
              <tr>
                <td colSpan="5" className="text-right bold-text">IGST / CGST+SGST (18%):</td>
                <td colSpan="2" className="bold-text">₹{gstAmount.toLocaleString()}</td>
              </tr>
              <tr>
                <td colSpan="5" className="text-right bold-text" style={{ fontSize: '1rem', color: '#0f172a' }}>GRAND TOTAL (INCL. TAXES):</td>
                <td colSpan="2" className="bold-text grand-total-cost">₹{grandTotal.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>

          {/* Terms & Conditions */}
          <div className="pdf-note-box" style={{ marginTop: '20px' }}>
            <h4 style={{ color: '#0f172a', marginBottom: '4px' }}>TERMS & CONDITIONS & REMARKS:</h4>
            <p style={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 'bold', marginBottom: '6px' }}>
              Note: {remarks}
            </p>
            <ol style={{ fontSize: '0.8rem', color: '#334155', paddingLeft: '20px' }}>
              <li>Material must be delivered strictly as per specified micron gauge and slit width.</li>
              <li>Certificate of Analysis (COA) specifying Corona dyne level, density, and thickness tolerance must accompany invoice.</li>
              <li>Rejection by Samyak QC will result in immediate material return at supplier's expense.</li>
              <li>Mention PO Number <b>{poNumber}</b> on all delivery chalans and tax invoices.</li>
            </ol>
          </div>

          {/* Signatures */}
          <div className="pdf-signatures" style={{ marginTop: '40px' }}>
            <div className="sig-box">
              <p>Prepared By</p>
              <div className="sig-line"></div>
              <span>Purchase Executive</span>
            </div>
            <div className="sig-box">
              <p>Authorized Signatory</p>
              <div className="sig-line"></div>
              <span>For SAMYAK INTERNATIONAL LTD</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
