import React from 'react';
import {
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { barcodeCode, isFifoConsumeFirst } from '../../utils/fifoUtils.js';
import { formatPlantDate, formatPlantDateTime } from '../../utils/dbDates.js';
import { pushSlugState } from '../../utils/slugRouter.js';

/**
 * Modern HeroUI / Tremor styled Barcodes (FIFO) tab view.
 * Keeps data-testid attributes intact for test suites:
 * - 'barcode-fifo-line'
 * - 'barcode-fifo-age'
 * - 'fifo-consume-first'
 */
export function ItemLedgerFifoTrialView({
  inStockBarcodeFifos = [],
  unitStr = 'Kg',
  ageingSettings
}) {
  return (
    <div data-testid="ledger-barcode-fifo" className="ui-next">
      <div
        style={{
          background: '#f8fafc',
          padding: '10px 14px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          marginBottom: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: '500' }}>
          In-stock barcodes, oldest origin first. Age is counted from each barcode's own origin.
        </span>
        <span
          className="ui-next-chip ui-next-chip-info"
          style={{ fontSize: '0.72rem' }}
        >
          FIFO Enforced · {inStockBarcodeFifos.length} Barcode{inStockBarcodeFifos.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Desktop View (> 768px): HeroUI Table */}
      <div className="ui-next-desktop-table ui-next-table-wrap">
        <table className="ui-next-table" aria-label="In-stock Barcodes FIFO Queue">
          <thead>
            <tr>
              <th>Barcode</th>
              <th>Remaining Qty</th>
              <th>FIFO Age</th>
              <th>Origin Date</th>
              <th>Consume Order</th>
            </tr>
          </thead>
          <tbody>
            {inStockBarcodeFifos.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                  No in-stock barcodes for this item.
                </td>
              </tr>
            ) : (
              inStockBarcodeFifos.map(({ roll, fifo }) => {
                const code = barcodeCode(roll);
                const prefer = isFifoConsumeFirst({ roll, fifo }, inStockBarcodeFifos);
                const ageDays = fifo?.display?.ageDays;
                const ageText = ageDays == null
                  ? '—'
                  : `${ageDays} day${ageDays === 1 ? '' : 's'}${fifo?.display?.frozen ? ' (frozen)' : ''}`;
                const originText = fifo?.origin ? formatPlantDate(fifo.origin.toISOString()) : '—';

                return (
                  <tr key={code} data-testid="barcode-fifo-line" style={{ background: prefer ? '#f0fdf4' : 'transparent' }}>
                    <td style={{ fontFamily: 'ui-monospace, monospace', fontWeight: '800', color: '#0f172a' }}>
                      {code}
                    </td>
                    <td style={{ fontWeight: '700' }}>
                      {Number(fifo?.balanceQty || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unitStr}
                    </td>
                    <td
                      data-testid="barcode-fifo-age"
                      style={{ fontWeight: '700', color: fifo?.display?.frozen ? '#64748b' : '#0369a1' }}
                    >
                      {ageText}
                    </td>
                    <td style={{ color: '#475569' }}>{originText}</td>
                    <td>
                      {prefer ? (
                        <span
                          data-testid="fifo-consume-first"
                          className="ui-next-chip ui-next-chip-success"
                          style={{ fontWeight: '800' }}
                        >
                          FIFO consume first
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile View (<= 768px): Cards */}
      <div className="ui-next-mobile-cards">
        {inStockBarcodeFifos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
            No in-stock barcodes for this item.
          </div>
        ) : (
          inStockBarcodeFifos.map(({ roll, fifo }) => {
            const code = barcodeCode(roll);
            const prefer = isFifoConsumeFirst({ roll, fifo }, inStockBarcodeFifos);
            const ageDays = fifo?.display?.ageDays;
            const ageText = ageDays == null
              ? '—'
              : `${ageDays} day${ageDays === 1 ? '' : 's'}${fifo?.display?.frozen ? ' (frozen)' : ''}`;
            const originText = fifo?.origin ? formatPlantDate(fifo.origin.toISOString()) : '—';

            return (
              <div
                key={code}
                data-testid="barcode-fifo-line"
                className="ui-next-item-card"
                style={{
                  borderLeft: prefer ? '4px solid #059669' : '1px solid #e2e8f0',
                  background: prefer ? '#f0fdf4' : '#ffffff'
                }}
              >
                <div className="ui-next-item-card-header">
                  <div>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>
                      {code}
                    </span>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                      Origin: {originText}
                    </div>
                  </div>
                  {prefer && (
                    <span
                      data-testid="fifo-consume-first"
                      className="ui-next-chip ui-next-chip-success"
                      style={{ fontWeight: '800' }}
                    >
                      FIFO 1st
                    </span>
                  )}
                </div>

                <div className="ui-next-item-card-metric-row">
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>
                      Balance Qty
                    </span>
                    <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
                      {Number(fifo?.balanceQty || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unitStr}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>
                      FIFO Age
                    </span>
                    <div
                      data-testid="barcode-fifo-age"
                      style={{ fontSize: '1.15rem', fontWeight: '800', color: fifo?.display?.frozen ? '#64748b' : '#0369a1' }}
                    >
                      {ageText}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Modern HeroUI / Tremor styled Material Stock Movements Ledger table view.
 */
export function ItemLedgerMovementsTrialView({
  paginatedLedgerItems = [],
  unitStr = 'Kg',
  editingTxId,
  tempBarcodeVal,
  onStartEditBarcode,
  onSaveBarcode,
  onCancelEditBarcode,
  onTempBarcodeChange
}) {
  return (
    <div className="ui-next">
      {/* Desktop View (> 768px): HeroUI Table */}
      <div className="ui-next-desktop-table ui-next-table-wrap">
        <table className="ui-next-table" aria-label="Raw Material Stock Ledger Movements">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Transaction Type</th>
              <th>Ref Doc / Job Name</th>
              <th>Party / Store Requisitioner</th>
              <th style={{ minWidth: '180px' }}>Barcode / Tag</th>
              <th style={{ color: '#047857' }}>Inward (+ {unitStr})</th>
              <th style={{ color: '#dc2626' }}>Usage (- {unitStr})</th>
              <th style={{ color: '#2563eb' }}>Audit (± {unitStr})</th>
              <th>Stock Balance</th>
              <th>Rate & Value (₹)</th>
            </tr>
          </thead>
          <tbody>
            {paginatedLedgerItems.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                  No transaction records found matching the filter criteria.
                </td>
              </tr>
            ) : (
              paginatedLedgerItems.map((tx, idx) => {
                const isEditingThisBarcode = editingTxId === tx?.txId;
                const inwardVal = tx?.inwardQty > 0 ? `+ ${Number(tx.inwardQty).toLocaleString()} ${unitStr}` : '—';
                const usageVal = tx?.usageQty > 0 ? `- ${Number(tx.usageQty).toLocaleString()} ${unitStr}` : '—';
                const adjVal = tx?.adjQty != null && tx?.adjQty !== 0
                  ? `${tx.adjQty > 0 ? '+' : ''}${Number(tx.adjQty).toLocaleString()} ${unitStr}`
                  : '—';

                return (
                  <tr
                    key={tx?.txId || idx}
                    style={{
                      background: tx?.isPendingQC ? '#fffbeb' : (tx?.isRejected ? '#fef2f2' : (tx?.category === 'reservation' ? '#f0fdf4' : (tx?.category === 'reconciliation' ? '#f0f9ff' : 'transparent')))
                    }}
                  >
                    <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {formatPlantDateTime(tx?.date)}
                    </td>

                    <td>
                      {tx?.category === 'inward' && (
                        <span
                          className={`ui-next-chip ${tx?.isPendingQC ? 'ui-next-chip-warning' : (tx?.isRejected ? 'ui-next-chip-danger' : 'ui-next-chip-success')}`}
                        >
                          {tx?.type || (tx?.isPendingQC ? '⏳ Pending QC' : (tx?.isRejected ? '🚫 Rejected' : '📥 Inward'))}
                        </span>
                      )}
                      {tx?.category === 'usage' && (
                        <span className="ui-next-chip ui-next-chip-danger">
                          {tx?.type || '📤 Usage'}
                        </span>
                      )}
                      {tx?.category === 'reservation' && (
                        <span className="ui-next-chip ui-next-chip-success">
                          {tx?.type || '🔒 Reserved'}
                        </span>
                      )}
                      {tx?.category === 'reconciliation' && (
                        <span className="ui-next-chip ui-next-chip-info">
                          {tx?.type || '⚖️ Audit'}
                        </span>
                      )}
                    </td>

                    <td>
                      <div style={{ fontWeight: '700', color: tx?.category === 'usage' ? '#dc2626' : '#2563eb' }}>
                        {tx?.refNo || '—'}
                      </div>
                      {tx?.jobLink?.label && (
                        <button
                          type="button"
                          onClick={() => {
                            if (tx.jobLink.orderId) pushSlugState('orders', { section: 'order', orderId: tx.jobLink.orderId });
                            else if (tx.jobLink.recordId) pushSlugState('production_records', { section: 'record', recordId: tx.jobLink.recordId });
                          }}
                          style={{
                            display: 'block',
                            marginTop: '2px',
                            padding: 0,
                            border: 'none',
                            background: 'none',
                            color: '#1d4ed8',
                            fontSize: '0.74rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            textAlign: 'left'
                          }}
                        >
                          {tx.jobLink.label}
                        </button>
                      )}
                    </td>

                    <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                      {tx?.party || '—'}
                    </td>

                    <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}>
                      {tx?.barcode || '—'}
                    </td>

                    <td style={{ fontWeight: '700', color: '#047857', whiteSpace: 'nowrap' }}>
                      {inwardVal}
                    </td>

                    <td style={{ fontWeight: '700', color: '#dc2626', whiteSpace: 'nowrap' }}>
                      {usageVal}
                    </td>

                    <td style={{ fontWeight: '700', color: '#2563eb', whiteSpace: 'nowrap' }}>
                      {adjVal}
                    </td>

                    <td style={{ fontWeight: '800', color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {tx?.runningBalance != null ? `${Number(tx.runningBalance).toLocaleString()} ${unitStr}` : '—'}
                    </td>

                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {tx?.rate ? `₹ ${Number(tx.rate).toFixed(2)}` : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile View (<= 768px): Cards */}
      <div className="ui-next-mobile-cards">
        {paginatedLedgerItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
            No transaction records found matching the filter criteria.
          </div>
        ) : (
          paginatedLedgerItems.map((tx, idx) => {
            const inwardVal = tx?.inwardQty > 0 ? `+ ${Number(tx.inwardQty).toLocaleString()} ${unitStr}` : null;
            const usageVal = tx?.usageQty > 0 ? `- ${Number(tx.usageQty).toLocaleString()} ${unitStr}` : null;
            const adjVal = tx?.adjQty != null && tx?.adjQty !== 0
              ? `${tx.adjQty > 0 ? '+' : ''}${Number(tx.adjQty).toLocaleString()} ${unitStr}`
              : null;

            return (
              <div key={tx?.txId || idx} className="ui-next-item-card">
                <div className="ui-next-item-card-header">
                  <div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {formatPlantDateTime(tx?.date)}
                    </span>
                    <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.92rem', marginTop: '2px' }}>
                      {tx?.refNo || 'Transaction'}
                    </div>
                  </div>
                  <div>
                    {tx?.category === 'inward' && (
                      <span className={`ui-next-chip ${tx?.isPendingQC ? 'ui-next-chip-warning' : (tx?.isRejected ? 'ui-next-chip-danger' : 'ui-next-chip-success')}`}>
                        {tx?.type || 'Inward'}
                      </span>
                    )}
                    {tx?.category === 'usage' && (
                      <span className="ui-next-chip ui-next-chip-danger">{tx?.type || 'Usage'}</span>
                    )}
                    {tx?.category === 'reservation' && (
                      <span className="ui-next-chip ui-next-chip-success">{tx?.type || 'Reserved'}</span>
                    )}
                    {tx?.category === 'reconciliation' && (
                      <span className="ui-next-chip ui-next-chip-info">{tx?.type || 'Audit'}</span>
                    )}
                  </div>
                </div>

                {tx?.party && (
                  <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                    Party: <strong>{tx.party}</strong>
                  </div>
                )}
                {tx?.barcode && (
                  <div style={{ fontSize: '0.75rem', fontFamily: 'ui-monospace, monospace', color: '#64748b' }}>
                    Tag: {tx.barcode}
                  </div>
                )}

                <div className="ui-next-item-card-metric-row">
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>
                      Movement
                    </span>
                    <div style={{ fontSize: '1.1rem', fontWeight: '800', color: inwardVal ? '#047857' : (usageVal ? '#dc2626' : '#2563eb') }}>
                      {inwardVal || usageVal || adjVal || '0 ' + unitStr}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>
                      Stock Balance
                    </span>
                    <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
                      {tx?.runningBalance != null ? `${Number(tx.runningBalance).toLocaleString()} ${unitStr}` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
