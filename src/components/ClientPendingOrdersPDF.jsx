import React from 'react';
import { Printer, ArrowLeft, Package, FileText, CheckCircle2 } from 'lucide-react';
import { COMPANY_DETAILS } from '../factoryStore';
import { getCompanyLogo, getAuthorisedSignature } from '../services/settingsService';

export default function ClientPendingOrdersPDF({ client = {}, pendingOrders = [], jobMasters = [], onClose }) {
  if (!client) return null;

  const logoImage = getCompanyLogo();
  const signatureImage = getAuthorisedSignature();
  const reportDate = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const docRefNo = `POS-${(client.id || 'CLI').replace(/[^a-zA-Z0-9-]/g, '')}-${new Date().toISOString().slice(2,10).replace(/-/g,'')}`;

  const clientName = client.name || client.companyName || 'Valued Client';
  const totalOrders = pendingOrders.length;
  const totalPendingQtyKg = pendingOrders.reduce((sum, o) => sum + (parseFloat(o.orderQtyKg || o.orderQty || o.qtyKg || 0)), 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(6px)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      overflowY: 'auto',
      padding: '20px 10px'
    }}>
      {/* Top Floating Controls Action Bar (Hidden during print) */}
      <div className="no-print" style={{
        width: '100%',
        maxWidth: '900px',
        display: 'flex',
        justify: 'space-between',
        alignItems: 'center',
        background: '#ffffff',
        padding: '12px 20px',
        borderRadius: '12px',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
        marginBottom: '16px'
      }}>
        <button
          type="button"
          className="btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}
          onClick={onClose}
        >
          <ArrowLeft size={16} /> Back to Client Profile
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>
            {totalOrders} Pending Order(s) | {totalPendingQtyKg.toLocaleString('en-IN')} kg Total
          </span>
          <button
            type="button"
            className="btn-primary"
            style={{ background: '#047857', borderColor: '#047857', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', fontWeight: '700' }}
            onClick={handlePrint}
          >
            <Printer size={16} /> Print / Download PDF
          </button>
        </div>
      </div>

      {/* Printable Sheet Container */}
      <div 
        id="printable-client-pending-orders"
        style={{
          width: '100%',
          maxWidth: '900px',
          background: '#ffffff',
          color: '#0f172a',
          padding: '36px 40px',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
      >
        {/* Printable Header */}
        <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {logoImage ? (
                <img src={logoImage} alt="Company Logo" style={{ height: '52px', objectFit: 'contain' }} />
              ) : (
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
                  color: '#fff',
                  fontWeight: '900',
                  fontSize: '1.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  SIL
                </div>
              )}
              <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#1e293b', margin: 0, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
                  {COMPANY_DETAILS.name || 'SAMYAK INTERNATIONAL LTD.'}
                </h1>
                <p style={{ fontSize: '0.78rem', color: '#475569', margin: '2px 0 0', fontWeight: '500' }}>
                  {COMPANY_DETAILS.tagline || 'Flexible Packaging & Converting Solutions | ISO 9001:2015 Certified Plant'}
                </p>
                <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0' }}>
                  {COMPANY_DETAILS.address || 'Plot No. 45-B, Sector E, Sanwer Road Industrial Area, Indore - 452015 (M.P.)'} | GSTIN: <strong>{COMPANY_DETAILS.gstin || '23AAACF1234A1Z5'}</strong>
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                padding: '6px 14px',
                borderRadius: '6px',
                display: 'inline-block',
                marginBottom: '6px'
              }}>
                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  STATEMENT REF:
                </span>
                <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#1e3a8a', fontFamily: 'monospace' }}>
                  {docRefNo}
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Report Date: <strong>{reportDate}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Title Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          padding: '12px 18px',
          borderRadius: '6px',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: '800', margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} style={{ color: '#38bdf8' }} />
              Client Pending Orders Statement / Production Status
            </h2>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px', display: 'block' }}>
              Active in-production & pending dispatch material orders
            </span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '700' }}>
            {totalOrders} Order(s) Pending
          </div>
        </div>

        {/* Client & Summary Metadata Box */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: '16px',
          marginBottom: '24px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '16px'
        }}>
          <div>
            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              CLIENT DETAILS:
            </span>
            <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0f172a', marginTop: '2px' }}>
              {clientName}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#334155', marginTop: '4px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px' }}>
              <strong>Client Code / ID:</strong> <span>{client.id || 'N/A'}</span>
              <strong>GSTIN:</strong> <span>{client.gstin || 'N/A'}</span>
              <strong>Contact Person:</strong> <span>{client.contactPerson || client.person || 'Commercial Department'}</span>
              <strong>Phone / Email:</strong> <span>{client.phone || '—'} {client.email ? `(${client.email})` : ''}</span>
              {client.address && (
                <>
                  <strong>Plant Address:</strong> <span>{client.address}</span>
                </>
              )}
            </div>
          </div>

          <div style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              PENDING MATERIAL SUMMARY:
            </span>
            <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#047857', marginTop: '4px' }}>
              {totalPendingQtyKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.9rem', color: '#475569' }}>kg</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '4px', fontWeight: '600' }}>
              Total Orders in Pipeline: <strong>{totalOrders} Active Orders</strong>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
              Data synchronized with ERP Shop-Floor Scheduler
            </div>
          </div>
        </div>

        {/* Pending Orders Table */}
        <div style={{ marginBottom: '24px' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.8rem',
            textAlign: 'left'
          }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#ffffff' }}>
                <th style={{ padding: '8px 10px', width: '30px', textAlign: 'center', borderTopLeftRadius: '4px' }}>#</th>
                <th style={{ padding: '8px 10px', width: '110px' }}>Order ID</th>
                <th style={{ padding: '8px 10px' }}>Job / Product Name</th>
                <th style={{ padding: '8px 10px' }}>Structure / Specs</th>
                <th style={{ padding: '8px 10px', width: '100px' }}>Form</th>
                <th style={{ padding: '8px 10px', width: '90px', textAlign: 'right' }}>Qty (kg)</th>
                <th style={{ padding: '8px 10px', width: '100px', textAlign: 'center' }}>Target Date</th>
                <th style={{ padding: '8px 10px', width: '100px', textAlign: 'center', borderTopRightRadius: '4px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.map((ord, idx) => {
                const jm = (jobMasters || []).find(j => 
                  (ord.jobMasterId && (j.id === ord.jobMasterId || j.jobMasterId === ord.jobMasterId)) ||
                  ((j.jobName || '').toLowerCase().trim() === (ord.jobName || '').toLowerCase().trim())
                );
                const structure = ord.structure || ord.jobDetails?.structure || jm?.structure || 'Standard Laminate';
                const form = ord.materialForm || ord.orderType || ord.materialFormat || jm?.materialForm || 'Reel Form';
                const qtyKg = parseFloat(ord.orderQtyKg || ord.orderQty || ord.qtyKg || 0);

                return (
                  <tr key={ord.id || idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#64748b' }}>{idx + 1}</td>
                    <td style={{ padding: '8px 10px', fontWeight: '800', color: '#1e3a8a', fontFamily: 'monospace' }}>{ord.id}</td>
                    <td style={{ padding: '8px 10px', fontWeight: '800', color: '#0f172a' }}>{ord.jobName}</td>
                    <td style={{ padding: '8px 10px', color: '#334155', fontSize: '0.76rem' }}>{structure}</td>
                    <td style={{ padding: '8px 10px', fontWeight: '600', color: '#475569' }}>{form}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '800', color: '#0f172a' }}>
                      {qtyKg.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#475569' }}>
                      {ord.targetDeliveryDate || ord.date || 'Standard'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <span style={{
                        background: (ord.status || '').toLowerCase().includes('progress') ? '#fef3c7' : '#e0f2fe',
                        color: (ord.status || '').toLowerCase().includes('progress') ? '#92400e' : '#0369a1',
                        border: '1px solid',
                        borderColor: (ord.status || '').toLowerCase().includes('progress') ? '#fde68a' : '#bae6fd',
                        fontSize: '0.68rem',
                        fontWeight: '800',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        textTransform: 'uppercase'
                      }}>
                        {ord.status || 'In Progress'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f1f5f9', borderTop: '2px solid #0f172a', fontWeight: '900' }}>
                <td colSpan={5} style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', color: '#0f172a', textTransform: 'uppercase' }}>
                  Total Pending Order Quantity:
                </td>
                <td style={{ padding: '10px', textAlign: 'right', fontSize: '0.92rem', color: '#047857' }}>
                  {totalPendingQtyKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                </td>
                <td colSpan={2} style={{ padding: '10px', textAlign: 'center', fontSize: '0.78rem', color: '#475569' }}>
                  ({totalOrders} Orders Total)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Terms & Authorization Sign-Off */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: '20px',
          alignItems: 'end',
          paddingTop: '16px',
          borderTop: '1px dashed #cbd5e1'
        }}>
          <div>
            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              STATEMENT NOTES & REMARKS:
            </span>
            <ul style={{ fontSize: '0.72rem', color: '#475569', margin: '4px 0 0', paddingLeft: '16px', lineHeight: '1.4' }}>
              <li>This statement lists all active pending orders currently scheduled for manufacturing or dispatch.</li>
              <li>Estimated delivery dates are subject to machine allocation, raw material availability, and cylinder readiness.</li>
              <li>For dispatch prioritization or delivery schedule adjustments, please contact your account manager.</li>
            </ul>
          </div>

          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {signatureImage ? (
              <img src={signatureImage} alt="Authorized Signatory" style={{ height: '42px', objectFit: 'contain', marginBottom: '4px' }} />
            ) : (
              <div style={{ height: '36px' }} />
            )}
            <div style={{ borderTop: '1.5px solid #0f172a', width: '180px', margin: '0 auto 4px' }} />
            <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0f172a' }}>
              For SAMYAK INTERNATIONAL LTD.
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
              Authorized Signatory / Plant Manager
            </div>
          </div>
        </div>
      </div>

      {/* Print Specific CSS Styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          #printable-client-pending-orders {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            padding: 15mm !important;
            border-radius: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
