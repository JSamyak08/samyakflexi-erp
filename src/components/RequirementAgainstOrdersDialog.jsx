import React from 'react';

function formatKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * Lists active orders that still need this stock item.
 * Backdrop clicks do not close it. Escape and Close do, through the
 * app-wide dialog dismiss guard.
 */
export default function RequirementAgainstOrdersDialog({
  itemLabel = '',
  itemCode = '',
  unit = 'kg',
  summary,
  onClose
}) {
  const rows = summary?.rows || [];
  const totalKg = Number(summary?.totalKg) || 0;
  return (
    <div
      className="modal-overlay"
      data-modal-root
      data-testid="requirement-against-orders-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="requirement-against-orders-title"
      style={{ zIndex: 12000 }}
    >
      <div
        className="modal-content"
        style={{ maxWidth: '560px', width: '94%', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
          <div>
            <h3 id="requirement-against-orders-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800' }}>
              Requirement Against Orders
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {itemLabel ? <><strong>{itemLabel}</strong>{itemCode ? <> · <code>{itemCode}</code></> : null}</> : 'This material'}
              {' '}still needed on active orders. This does not reserve or hold stock.
            </p>
          </div>
          <button type="button" className="btn-secondary" data-testid="requirement-against-orders-close" onClick={onClose}>
            Close
          </button>
        </div>

        <table className="data-table" style={{ width: '100%', fontSize: '0.88rem' }}>
          <thead>
            <tr>
              <th>Order ID</th>
              <th style={{ textAlign: 'right' }}>Quantity requirement</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ color: 'var(--text-secondary)' }}>
                  No active order still needs this material.
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.orderId} data-testid="requirement-order-row" data-required-kg={row.requiredKg} data-consumed-kg={row.consumedKg}>
                <td>
                  <div data-order-id={row.orderId} style={{ fontWeight: '800' }}>{row.orderId}</div>
                  {row.jobName ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{row.jobName}</div>
                  ) : null}
                </td>
                <td data-requirement-kg={row.unconsumedKg} style={{ textAlign: 'right', fontWeight: '700' }}>
                  {formatKg(row.unconsumedKg)} {unit}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontWeight: '800' }}>Total</td>
              <td data-testid="requirement-against-orders-total" data-total-kg={totalKg} style={{ textAlign: 'right', fontWeight: '800' }}>
                {formatKg(totalKg)} {unit}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
