import React from 'react';
import { Table, Card, Chip } from '@heroui/react';
import {
  Package,
  Plus,
  Clock,
  Edit3,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import TablePagination from '../TablePagination.jsx';
import '../../styles/ui-next.css';

export default function InventoryTrialView({
  paginatedItems = [],
  totalItems = 0,
  currentPage = 1,
  pageSize = 50,
  onPageChange,
  onPageSizeChange,
  selectedStockIds = new Set(),
  toggleStockSelection,
  stockItemIds = (item) => [item?.id],
  onInward,
  onOpenHistory,
  onEdit,
  onDelete,
  formatFilmItemName,
  displayItemName,
  isInventoryItemActive,
  fifosForItemIds,
  openBarcodeIsOverAged,
  ageingSettings,
  rollFifoIndex,
  inventoryRolls = [],
  pendingQcKgForItem,
  safeGrns = [],
  getItemReservations,
  onToggleClassic
}) {
  const allPageIds = paginatedItems.flatMap((row) => stockItemIds(row));
  const isAllPageSelected =
    allPageIds.length > 0 && allPageIds.every((id) => selectedStockIds.has(id));

  return (
    <div className="ui-next inventory-trial-view" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Trial Header Announcement */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 2px 4px -1px rgba(15, 23, 42, 0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: '800', fontSize: '1rem' }}>
                Raw Material Stock Register
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#fde68a',
                  border: '1px solid rgba(245, 158, 11, 0.3)'
                }}
              >
                HeroUI v3 Modern Trial
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              Showing {totalItems} items. Table on desktop (&gt;768px), cards with &ge;44px actions on mobile.
            </p>
          </div>
        </div>

        {typeof onToggleClassic === 'function' && (
          <button
            type="button"
            className="btn-secondary"
            onClick={onToggleClassic}
            style={{
              background: 'rgba(255,255,255,0.12)',
              borderColor: 'rgba(255,255,255,0.25)',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              fontWeight: '700',
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={14} /> Use the current design
          </button>
        )}
      </div>

      {/* =====================================================================
          1. DESKTOP VIEW (> 768px): HeroUI Table with 14 Compact Columns
          ===================================================================== */}
      <div className="ui-next-desktop-table ui-next-table-wrap">
        <table className="ui-next-table" aria-label="Raw Material Stock Register">
          <thead>
            <tr>
              <th style={{ width: '36px' }}>
                <input
                  type="checkbox"
                  aria-label="Select stock items on this page"
                  checked={isAllPageSelected}
                  onChange={(event) => toggleStockSelection(allPageIds, event.target.checked)}
                />
              </th>
              <th>Inventory ID</th>
              <th>Item Name & Code</th>
              <th>Category</th>
              <th>Substrate / Grade</th>
              <th>Specs / Gauge</th>
              <th>Available Stock</th>
              <th>Purchase Rate (₹)</th>
              <th>Purchase Valuation (₹)</th>
              <th>Allocated Qty</th>
              <th>Location Bay</th>
              <th>Last Supplier & Batch</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan="14" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                  No stock items match the filter criteria.
                </td>
              </tr>
            ) : (
              paginatedItems.map((item) => {
                const isFilm = (item.category || 'Film Substrates') === 'Film Substrates';
                const title =
                  isFilm && !item.preserveItemName && typeof formatFilmItemName === 'function'
                    ? formatFilmItemName(item.filmType, item.widthMm, item.micron, displayItemName ? displayItemName(item.itemName) : item.itemName)
                    : (item.itemName ? (displayItemName ? displayItemName(item.itemName) : item.itemName) : (item.category || item.filmType || 'Stock Item'));
                const unitStr = item.unit || 'kg';
                const rate = parseFloat(item.unitPrice || item.purchaseRatePerKg) || 0;
                const availQty = parseFloat(item.availableQtyKg) || 0;
                const itemValuation = availQty * rate;
                const subGrade = item.substrateOrGrade || item.substrateGrade || item.filmType || item.grade || item.subType || '-';

                const barcodeFifos = typeof fifosForItemIds === 'function'
                  ? fifosForItemIds(item.allInventoryIds || [item.id], inventoryRolls, rollFifoIndex)
                  : [];
                const isOverAged = barcodeFifos.some(({ roll, fifo }) =>
                  typeof openBarcodeIsOverAged === 'function' ? openBarcodeIsOverAged(fifo, item.category || roll?.category, ageingSettings) : false
                );

                const pendingQcQty = typeof pendingQcKgForItem === 'function' ? pendingQcKgForItem(item, safeGrns) : 0;
                const itemResInfo = typeof getItemReservations === 'function' ? getItemReservations(item) : { totalReservedKg: 0 };
                const allocatedForOrders = itemResInfo.totalReservedKg || 0;
                const effectiveAllocated = Number(((item.allocatedQtyKg || 0) + allocatedForOrders).toFixed(2));
                const usableFreeStock = Math.max(0, Number(((item.availableQtyKg || 0) - allocatedForOrders).toFixed(2)));

                const rowIds = stockItemIds(item);
                const rowSelected = rowIds.length > 0 && rowIds.every((id) => selectedStockIds.has(id));
                const rowArchived = typeof isInventoryItemActive === 'function'
                  ? (item.subItems || [item]).every((sub) => !isInventoryItemActive(sub))
                  : false;

                const isLow = (item.availableQtyKg ?? 0) <= (item.reorderLevelKg ?? 100);

                return (
                  <tr key={item.id} style={{ background: isOverAged ? '#fff5f5' : 'transparent' }}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${title}`}
                        checked={rowSelected}
                        onChange={(event) => toggleStockSelection(rowIds, event.target.checked)}
                      />
                    </td>
                    <td style={{ fontWeight: '700', color: '#334155', whiteSpace: 'nowrap' }}>
                      <div>{item.primaryId || item.id}</div>
                      {item.subItems && item.subItems.length > 1 && (
                        <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: '600', marginTop: '2px' }}>
                          <span className="ui-next-chip ui-next-chip-neutral" style={{ fontSize: '0.66rem' }}>
                            +{item.subItems.length - 1} inward lots
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontFamily: 'inherit',
                          fontSize: 'inherit',
                          fontWeight: '700',
                          color: '#2563eb',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textAlign: 'left'
                        }}
                        onClick={() => onOpenHistory && onOpenHistory(item)}
                        title="Click to view Raw Material Stock Ledger & Barcodes (FIFO)"
                      >
                        {title}
                      </button>
                      {rowArchived && (
                        <div style={{ marginTop: '3px' }}>
                          <span className="ui-next-chip ui-next-chip-neutral" style={{ fontSize: '0.66rem' }}>Archived</span>
                        </div>
                      )}
                      {item.itemCode && (
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{item.itemCode}</div>
                      )}
                    </td>
                    <td>
                      <span className="ui-next-chip ui-next-chip-info">
                        {item.category || 'Film Substrates'}
                      </span>
                    </td>
                    <td>
                      <span className="ui-next-chip ui-next-chip-neutral" style={{ background: '#f0f9ff', color: '#0369a1', borderColor: '#bae6fd' }}>
                        {subGrade}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {isFilm ? `${item.micron}µ × ${item.widthMm}mm` : (item.widthMm && item.widthMm !== '-' ? `${item.widthMm}mm` : '-')}
                    </td>
                    <td style={{ fontSize: '1.05rem', fontWeight: '800', color: usableFreeStock === 0 ? (availQty === 0 && pendingQcQty > 0 ? '#d97706' : '#dc2626') : (isLow ? '#d97706' : '#059669'), whiteSpace: 'nowrap' }}>
                      {usableFreeStock.toLocaleString()} {unitStr}
                      {allocatedForOrders > 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', marginTop: '2px' }}>
                          On-hand: {availQty.toLocaleString()} {unitStr}
                        </div>
                      )}
                      {pendingQcQty > 0 && (
                        <div style={{ fontSize: '0.7rem', color: '#92400e', fontWeight: '700', marginTop: '2px', background: '#fef3c7', padding: '1px 5px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                          ⏳ +{pendingQcQty.toLocaleString()} {unitStr} Pending QC
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap' }}>
                      ₹{rate > 0 ? rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'} / {unitStr}
                    </td>
                    <td style={{ fontWeight: '800', color: '#059669', whiteSpace: 'nowrap' }}>
                      ₹{itemValuation > 0 ? itemValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                    </td>
                    <td style={{ color: '#475569', whiteSpace: 'nowrap' }}>
                      {effectiveAllocated.toLocaleString()} {unitStr}
                      {allocatedForOrders > 0 && (
                        <div style={{ fontSize: '0.7rem', color: '#15803d', fontWeight: '700', marginTop: '2px', background: '#dcfce7', padding: '1px 5px', borderRadius: '4px', border: '1px solid #86efac' }}>
                          🔒 {allocatedForOrders.toLocaleString()} {unitStr} Reserved
                        </div>
                      )}
                    </td>
                    <td>{item.location || '—'}</td>
                    <td style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      <div>{item.lastVendor || '—'}</div>
                      {item.lastBatch && <code style={{ color: '#334155' }}>{item.lastBatch}</code>}
                    </td>
                    <td>
                      {availQty === 0 && pendingQcQty > 0 ? (
                        <span className="ui-next-chip ui-next-chip-warning">
                          📥 Pending QC
                        </span>
                      ) : isLow ? (
                        <span className="ui-next-chip ui-next-chip-danger">
                          LOW STOCK
                        </span>
                      ) : (
                        <span className="ui-next-chip ui-next-chip-success">
                          IN STOCK
                        </span>
                      )}
                      {isOverAged && (
                        <div style={{ marginTop: '3px' }}>
                          <span className="ui-next-chip ui-next-chip-danger" style={{ fontSize: '0.66rem' }}>
                            Over-aged barcode
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ padding: '4px 8px', fontSize: '0.74rem', background: '#059669', borderColor: '#059669' }}
                          onClick={() => onInward && onInward(item)}
                          title="Inward GRN for this item"
                        >
                          <Plus size={13} /> Inward
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                          onClick={() => onOpenHistory && onOpenHistory(item)}
                          title="View Ledger & FIFO History"
                        >
                          <Clock size={13} /> History
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                          onClick={() => onEdit && onEdit(item)}
                          title="Edit Stock Item"
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.74rem', color: rowArchived ? '#0369a1' : '#dc2626', borderColor: rowArchived ? '#bae6fd' : '#fecaca' }}
                          onClick={() => onDelete && onDelete(item)}
                          title={rowArchived ? 'Reactivate item' : 'Delete or archive item'}
                        >
                          <Trash2 size={13} /> {rowArchived ? 'Reactivate' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* =====================================================================
          2. MOBILE VIEW (<= 768px): HeroUI Cards with >=44px Action Buttons
          ===================================================================== */}
      <div className="ui-next-mobile-cards">
        {paginatedItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
            No stock items match the filter criteria.
          </div>
        ) : (
          paginatedItems.map((item) => {
            const isFilm = (item.category || 'Film Substrates') === 'Film Substrates';
            const title =
              isFilm && !item.preserveItemName && typeof formatFilmItemName === 'function'
                ? formatFilmItemName(item.filmType, item.widthMm, item.micron, displayItemName ? displayItemName(item.itemName) : item.itemName)
                : (item.itemName ? (displayItemName ? displayItemName(item.itemName) : item.itemName) : (item.category || item.filmType || 'Stock Item'));
            const unitStr = item.unit || 'kg';
            const rate = parseFloat(item.unitPrice || item.purchaseRatePerKg) || 0;
            const availQty = parseFloat(item.availableQtyKg) || 0;
            const subGrade = item.substrateOrGrade || item.substrateGrade || item.filmType || item.grade || item.subType || '-';

            const itemResInfo = typeof getItemReservations === 'function' ? getItemReservations(item) : { totalReservedKg: 0 };
            const allocatedForOrders = itemResInfo.totalReservedKg || 0;
            const usableFreeStock = Math.max(0, Number(((item.availableQtyKg || 0) - allocatedForOrders).toFixed(2)));
            const isLow = (item.availableQtyKg ?? 0) <= (item.reorderLevelKg ?? 100);

            return (
              <div key={item.id} className="ui-next-item-card">
                {/* Card Header: Title, Code & Status Chip */}
                <div className="ui-next-item-card-header">
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <h4 className="ui-next-item-card-title">{title}</h4>
                    <div className="ui-next-item-card-code">
                      ID: {item.primaryId || item.id} {item.itemCode ? `· ${item.itemCode}` : ''}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {isLow ? (
                      <span className="ui-next-chip ui-next-chip-danger">LOW STOCK</span>
                    ) : (
                      <span className="ui-next-chip ui-next-chip-success">IN STOCK</span>
                    )}
                  </div>
                </div>

                {/* Key Specs Row */}
                <div className="ui-next-item-card-specs">
                  <span className="ui-next-chip ui-next-chip-info" style={{ fontSize: '0.72rem' }}>
                    {item.category || 'Film Substrates'}
                  </span>
                  {subGrade !== '-' && (
                    <span className="ui-next-chip ui-next-chip-neutral" style={{ fontSize: '0.72rem' }}>
                      {subGrade}
                    </span>
                  )}
                  {isFilm && item.micron && (
                    <span className="ui-next-chip ui-next-chip-neutral" style={{ fontSize: '0.72rem' }}>
                      {item.micron}µ × {item.widthMm}mm
                    </span>
                  )}
                  {item.location && (
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Bay: {item.location}
                    </span>
                  )}
                </div>

                {/* Metrics Row: Free Usable Stock & Valuation */}
                <div className="ui-next-item-card-metric-row">
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>
                      Free Usable Stock
                    </span>
                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: isLow ? '#d97706' : '#059669', marginTop: '2px' }}>
                      {usableFreeStock.toLocaleString()} {unitStr}
                    </div>
                    {allocatedForOrders > 0 && (
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        On-hand: {availQty.toLocaleString()} {unitStr}
                      </div>
                    )}
                  </div>

                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>
                      Rate & Valuation
                    </span>
                    <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>
                      ₹{rate > 0 ? rate.toFixed(2) : '—'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '700' }}>
                      Val: ₹{(availQty * rate).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>

                {/* Actions Grid: Touch targets >= 44px */}
                <div className="ui-next-item-card-actions">
                  <button
                    type="button"
                    className="btn-primary ui-next-mobile-btn"
                    style={{ background: '#059669', borderColor: '#059669' }}
                    onClick={() => onInward && onInward(item)}
                  >
                    <Plus size={16} /> Inward
                  </button>

                  <button
                    type="button"
                    className="btn-secondary ui-next-mobile-btn"
                    onClick={() => onOpenHistory && onOpenHistory(item)}
                  >
                    <Clock size={16} /> Ledger (FIFO)
                  </button>

                  <button
                    type="button"
                    className="btn-secondary ui-next-mobile-btn"
                    onClick={() => onEdit && onEdit(item)}
                  >
                    <Edit3 size={16} /> Edit
                  </button>

                  <button
                    type="button"
                    className="btn-secondary ui-next-mobile-btn"
                    style={{ color: '#dc2626', borderColor: '#fecaca' }}
                    onClick={() => onDelete && onDelete(item)}
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      <TablePagination
        currentPage={currentPage}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
