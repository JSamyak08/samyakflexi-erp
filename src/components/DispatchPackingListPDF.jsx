import React from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { loadLetterhead } from '../services/companyProfile';
import CompanyProfileNotice from './CompanyProfileNotice';
import { getCompanyLogo } from '../services/settingsService';
import { toTitleCase } from '../utils/pdfHelpers';
import { buildPackingListPrintModel, formatPackingKg } from '../utils/packingListPrint';
import './packingListPrint.css';

const SIGNATURE_LABELS = [
  'Plant Manager / HOD Signature',
  'Verified By (QC Inspector)',
  'Received By (Driver / Customer)',
];

function DetailLine({ label, value, strong = false }) {
  if (!value) return null;
  return (
    <div className="address-line">
      {label ? <>{label}: </> : null}
      {strong ? <strong>{value}</strong> : value}
    </div>
  );
}

function LoadCheck({ label }) {
  return (
    <span className="pl-check" role="checkbox" aria-checked="false" aria-label={label}>&#160;</span>
  );
}

export default function DispatchPackingListPDF({
  shipment,
  clients = [],
  orders = [],
  jobMasters = [],
  onClose,
}) {
  const letterhead = loadLetterhead();
  if (!shipment) return null;
  if (letterhead.error) return <CompanyProfileNotice message={letterhead.error} onClose={onClose} />;
  const COMPANY_DETAILS = letterhead.company;
  const logoUrl = getCompanyLogo() || COMPANY_DETAILS.logoUrl || '/samyak-logo.png';
  const model = buildPackingListPrintModel(shipment, { clients, orders, jobMasters });
  const rollLabel = `${model.rollCount} ROLL${model.rollCount === 1 ? '' : 'S'}`;

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal-toolbar no-print">
        <button className="btn-secondary" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> Back to Dispatch Management
        </button>
        <button className="btn-primary" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Printer size={16} /> Print Dispatch Packing List PDF
        </button>
      </div>

      <div className="pdf-paper-container">
        <div id="printable-packing-list" className="printable-document">
          <div className="letterhead-header">
            <div className="letterhead-brand">
              <img
                src={logoUrl}
                alt="Samyak International Ltd Logo"
                className="samyak-logo-img"
                style={{ height: '36px', maxWidth: '188px', objectFit: 'contain' }}
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.style.display = 'none';
                }}
              />
              {COMPANY_DETAILS.tagline ? (
                <p className="letterhead-company-sub" style={{ marginTop: '2px', fontSize: '8.5px', fontWeight: '800', color: '#374151' }}>
                  {COMPANY_DETAILS.tagline}
                </p>
              ) : null}
            </div>

            <div className="letterhead-doc-title">
              <h2>DISPATCH PACKING LIST</h2>
              {model.docNo ? <div className="doc-ref-no">{model.docNo}</div> : null}
              {model.when ? (
                <div className="pl-doc-meta">Date & Time: <strong>{model.when}</strong></div>
              ) : null}
            </div>
          </div>

          <table className="address-grid-table">
            <thead>
              <tr>
                <th>Dispatched From (Consignor)</th>
                <th>Consignee / Customer</th>
                <th>Transport & Logistics</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="address-box-title">{COMPANY_DETAILS.name}</div>
                  <div className="address-line">{COMPANY_DETAILS.address}</div>
                  <DetailLine label="GSTIN" value={COMPANY_DETAILS.gstin} strong />
                  <DetailLine label="Phone" value={COMPANY_DETAILS.phones} />
                  <DetailLine label="Email" value={COMPANY_DETAILS.email} />
                  <DetailLine label="Place of Supply" value={COMPANY_DETAILS.placeOfSupply} />
                </td>
                <td>
                  {model.customer.name ? (
                    <div className="address-box-title">{toTitleCase(model.customer.name)}</div>
                  ) : null}
                  <DetailLine label="Address" value={model.customer.address} />
                  <DetailLine label="Email" value={model.customer.email} />
                  <DetailLine label="Mobile" value={model.customer.mobile} />
                  <DetailLine label="GSTIN" value={model.customer.gstin} strong />
                  <DetailLine label="Order Ref" value={model.customer.orderId} strong />
                  <DetailLine label="Customer PO #" value={model.customer.poNo} strong />
                </td>
                <td>
                  <DetailLine label="Invoice No" value={model.logistics.invoice} strong />
                  <DetailLine label="Vehicle Number" value={model.logistics.vehicle} strong />
                  <DetailLine label="LR / Lorry Receipt No" value={model.logistics.lr} strong />
                  <DetailLine label="Transporter" value={model.logistics.transporter} />
                  <DetailLine label="Weighing Scale Station" value={model.logistics.scale} strong />
                </td>
              </tr>
            </tbody>
          </table>

          {model.jobName ? (
            <div className="pdf-doc-banner pl-job-banner">{toTitleCase(model.jobName)}</div>
          ) : null}

          <table className="pl-rolls">
            <thead>
              <tr>
                <th style={{ width: '7%' }}>#</th>
                <th style={{ width: '18%' }}>Barcode ID</th>
                <th style={{ width: '27%' }}>Substrate / Specification</th>
                <th style={{ width: '14%' }}>Core/Pkg Wt (Tare)</th>
                <th style={{ width: '12%' }}>Gross Weight (Kg)</th>
                <th style={{ width: '12%' }}>Net Qty / Weight</th>
                <th style={{ width: '10%' }}>Confirm Loading</th>
              </tr>
            </thead>
            <tbody>
              {model.lines.map((line) => (
                <tr key={line.key}>
                  <td className="pl-center">{line.rollNo}</td>
                  <td className="pl-barcode">{line.barcode}</td>
                  <td>{line.substrate}</td>
                  <td className="pl-center">
                    {line.tare == null ? '' : (
                      <>
                        {formatPackingKg(line.tare)} kg
                        {line.coreSize ? ` (${line.coreSize})` : ''}
                      </>
                    )}
                  </td>
                  <td className="pl-num">{formatPackingKg(line.gross)}</td>
                  <td className="pl-num">
                    {line.net == null ? '' : `${formatPackingKg(line.net)} ${line.unit}`}
                  </td>
                  <td className="pl-center">
                    <LoadCheck label={`Confirm loading for ${line.barcode || `roll ${line.rollNo}`}`} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3" className="pl-num">TOTAL SHIPMENT ({rollLabel}):</td>
                <td className="pl-center">{model.totals.tare == null ? '' : `${formatPackingKg(model.totals.tare)} Kg`}</td>
                <td className="pl-num">{model.totals.gross == null ? '' : `${formatPackingKg(model.totals.gross)} Kg`}</td>
                <td className="pl-num">{model.totals.net == null ? '' : `${formatPackingKg(model.totals.net)} Kg`}</td>
                <td className="pl-center">
                  <LoadCheck label="Verified" /> Verified
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="pdf-signature-block pl-sign-row">
            {SIGNATURE_LABELS.map((label) => (
              <div className="pl-sign-card" key={label}>
                <div className="pl-sign-line">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
