import { useMemo } from 'react';
import { Check, Clock, Edit3, Plus, Printer, Trash2 } from 'lucide-react';
import { formatPlantDate, formatPlantDateTime } from '../../utils/dbDates';
import { pushSlugState } from '../../utils/slugRouter';
import { ledgerRollMeters } from '../../utils/rollLedger';
import { formatFilmItemName } from '../../services/supabaseDataService';
import { presentStockRow } from './stockRowModel';
import { presentFifoLines } from './fifoLines';
import MantinePilotTable from './MantinePilotTable';

function money(value) {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StockActions({ item, row, onInward, onOpenLedger, onEdit, onDelete }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      <button
        type="button"
        className="btn-primary"
        style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#059669', borderColor: '#059669' }}
        onClick={() => onInward(item)}
        title="Create Inward GRN for this item"
      >
        <Plus size={14} /> Inward
      </button>
      <button
        type="button"
        className="btn-secondary"
        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
        onClick={() => onOpenLedger(item)}
        title="View GRN Purchase History"
      >
        <Clock size={14} /> History
      </button>
      <button
        type="button"
        className="btn-secondary"
        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
        onClick={() => onEdit(item)}
        title="Edit Stock Item"
      >
        <Edit3 size={14} /> Edit
      </button>
      <button
        type="button"
        className="btn-secondary"
        style={{ padding: '4px 8px', fontSize: '0.75rem', color: row.rowArchived ? '#0369a1' : '#dc2626', borderColor: row.rowArchived ? '#bae6fd' : '#fecaca' }}
        onClick={() => onDelete(item)}
        title={row.rowArchived ? 'Reactivate stock item' : 'Delete an unused item, or archive an item that has history'}
      >
        <Trash2 size={14} /> {row.rowArchived ? 'Reactivate' : 'Delete / Archive'}
      </button>
    </div>
  );
}

export function StockTrialView({
  items = [],
  getReservations,
  getPendingQc,
  inventoryRolls,
  rollFifoIndex,
  ageingSettings,
  selectedIds,
  onToggleSelection,
  onOpenLedger,
  onInward,
  onEdit,
  onDelete,
}) {
  const rows = useMemo(() => items.map((item) => ({
    item,
    view: presentStockRow(item, {
      formatFilmItemName,
      reservedKg: getReservations?.(item)?.totalReservedKg || 0,
      pendingQcQty: getPendingQc?.(item) || 0,
      inventoryRolls,
      rollFifoIndex,
      ageingSettings,
      selectedIds,
    }),
  })), [items, getReservations, getPendingQc, inventoryRolls, rollFifoIndex, ageingSettings, selectedIds]);

  const pageIds = rows.flatMap((row) => row.view.rowIds);
  const allSelected = rows.length > 0 && rows.every((row) => row.view.rowSelected);

  const columns = useMemo(() => [
    {
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          aria-label="Select stock items on this page"
          checked={allSelected}
          onChange={(event) => onToggleSelection(pageIds, event.target.checked)}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.original.view.title}`}
          checked={row.original.view.rowSelected}
          onChange={(event) => onToggleSelection(row.original.view.rowIds, event.target.checked)}
        />
      ),
    },
    {
      id: 'id',
      header: 'Inventory ID',
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 700, color: '#334155' }}>{row.original.view.primaryId}</div>
          {row.original.view.extraLots > 0 && (
            <span className="badge" style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '1px 5px', fontSize: '0.68rem', fontWeight: 700 }}>
              +{row.original.view.extraLots} inward lots
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'name',
      header: 'Item Name & Code',
      cell: ({ row }) => (
        <div>
          <button
            type="button"
            style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 700, color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left' }}
            onClick={() => onOpenLedger(row.original.item)}
            title="Click to view date-wise GRN Purchase & Receipt History"
          >
            {row.original.view.title}
          </button>
          {row.original.view.rowArchived && (
            <div style={{ marginTop: 4 }}>
              <span className="badge" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', fontSize: '0.68rem', fontWeight: 800 }}>Archived</span>
            </div>
          )}
          {row.original.view.itemCode && (
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{row.original.view.itemCode}</div>
          )}
        </div>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      cell: ({ row }) => <span className="badge badge-info" style={{ fontSize: '0.75rem', fontWeight: 700 }}>{row.original.view.category}</span>,
    },
    {
      id: 'grade',
      header: 'Substrate / Grade',
      cell: ({ row }) => <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', fontSize: '0.75rem', fontWeight: 700 }}>{row.original.view.subGrade}</span>,
    },
    { id: 'specs', header: 'Specs / Gauge', cell: ({ row }) => row.original.view.specs },
    {
      id: 'stock',
      header: 'Available Stock',
      cell: ({ row }) => {
        const view = row.original.view;
        return (
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: view.freeStockColor }}>
            {Number(view.usableFreeStock || 0).toLocaleString()} {view.unitStr}
            {view.allocatedForOrders > 0 && (
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                On-hand: {Number(view.onHand || 0).toLocaleString()} {view.unitStr}
              </div>
            )}
            {view.pendingQcQty > 0 && (
              <div style={{ fontSize: '0.7rem', color: '#92400e', fontWeight: 700, marginTop: 2, background: '#fef3c7', padding: '1px 5px', borderRadius: 4, border: '1px solid #fde68a', display: 'inline-block' }}>
                +{Number(view.pendingQcQty).toLocaleString()} {view.unitStr} Pending QC
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'rate',
      header: 'Purchase Rate (₹)',
      cell: ({ row }) => `₹${row.original.view.rate > 0 ? money(row.original.view.rate) : '-'} / ${row.original.view.unitStr}`,
    },
    {
      id: 'value',
      header: 'Purchase Valuation (₹)',
      cell: ({ row }) => <span style={{ fontWeight: 800, color: '#047857' }}>₹{row.original.view.itemValuation > 0 ? money(row.original.view.itemValuation) : '0.00'}</span>,
    },
    {
      id: 'allocated',
      header: 'Allocated Qty',
      cell: ({ row }) => (
        <div>
          {Number(row.original.view.effectiveAllocated || 0).toLocaleString()} {row.original.view.unitStr}
          {row.original.view.allocatedForOrders > 0 && (
            <div style={{ fontSize: '0.7rem', color: '#15803d', fontWeight: 700, marginTop: 2, background: '#dcfce7', padding: '1px 5px', borderRadius: 4, border: '1px solid #86efac', display: 'inline-block' }}>
              {Number(row.original.view.allocatedForOrders).toLocaleString()} {row.original.view.unitStr} Reserved
            </div>
          )}
        </div>
      ),
    },
    { id: 'location', header: 'Location Bay', cell: ({ row }) => row.original.view.location },
    {
      id: 'supplier',
      header: 'Last Supplier & Batch',
      cell: ({ row }) => (
        <div style={{ fontSize: '0.8rem', color: '#475569' }}>
          <div>{row.original.view.lastVendor}</div>
          <code style={{ color: '#334155' }}>{row.original.view.lastBatch}</code>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const view = row.original.view;
        return (
          <div>
            {view.status === 'GRN Inward (Pending QC)' ? (
              <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1.5px solid #fde68a', fontSize: '0.72rem', fontWeight: 700 }}>{view.status}</span>
            ) : view.status === 'LOW STOCK' ? (
              <span className="badge badge-warning" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>LOW STOCK</span>
            ) : (
              <span className="badge badge-us">IN STOCK</span>
            )}
            {view.status !== 'GRN Inward (Pending QC)' && view.pendingQcQty > 0 && (
              <div style={{ marginTop: 3 }}>
                <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontSize: '0.65rem', fontWeight: 700 }}>GRN Inward (Pending QC)</span>
              </div>
            )}
            {view.isOverAged && (
              <div style={{ marginTop: 4 }}>
                <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', fontSize: '0.68rem', fontWeight: 800 }}>Has an over-aged barcode</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <StockActions
          item={row.original.item}
          row={row.original.view}
          onInward={onInward}
          onOpenLedger={onOpenLedger}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ),
    },
  ], [allSelected, pageIds, onToggleSelection, onOpenLedger, onInward, onEdit, onDelete]);

  return (
    <MantinePilotTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.item.id}
      testId="stock-register-mantine"
      emptyMessage="No stock items on this page."
      rowStyle={(row) => (row.view.isOverAged ? { background: '#fff5f5' } : undefined)}
      cardTitle={(row) => row.view.title}
      cardFields={(row) => [
        { label: 'Free stock', value: `${Number(row.view.usableFreeStock || 0).toLocaleString()} ${row.view.unitStr}` },
        { label: 'Status', value: row.view.status },
        { label: 'Inventory ID', value: row.view.primaryId },
        { label: 'Category', value: row.view.category },
        { label: 'Grade', value: row.view.subGrade },
        { label: 'Specs', value: row.view.specs },
        { label: 'Location', value: row.view.location || '—' },
        { label: 'Pending QC', value: row.view.pendingQcQty > 0 ? `${Number(row.view.pendingQcQty).toLocaleString()} ${row.view.unitStr}` : '—' },
      ]}
      cardActions={(row) => (
        <StockActions
          item={row.item}
          row={row.view}
          onInward={onInward}
          onOpenLedger={onOpenLedger}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    />
  );
}

function LedgerBarcodeCell({ tx, item, inventoryRolls, editing, editingValue, onEditingValue, onSave, onStart, onCancel, onPrint }) {
  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="text"
          className="form-control"
          style={{ padding: '2px 6px', fontSize: '0.78rem', width: 130 }}
          autoFocus
          value={editingValue}
          onChange={(event) => onEditingValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSave(tx.txId, editingValue);
            if (event.key === 'Escape') {
              event.stopPropagation();
              onCancel();
            }
          }}
        />
        <button type="button" style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }} onClick={() => onSave(tx.txId, editingValue)} title="Save Barcode">
          <Check size={12} />
        </button>
        <button type="button" style={{ background: '#94a3b8', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }} onClick={onCancel} title="Cancel">
          ✕
        </button>
      </div>
    );
  }

  const rawBarcodeStr = String(tx.barcode || '').trim();
  const barcodeTokens = rawBarcodeStr ? rawBarcodeStr.split(/[,;\n]+/).map((code) => code.trim()).filter(Boolean) : [];
  if (!barcodeTokens.length) return <span style={{ color: '#64748b' }}>—</span>;

  const hasNumericSpecs = parseFloat(item.micron) > 0 && parseFloat(item.widthMm) > 0 && item.micron !== '-' && item.widthMm !== '-';
  const isFilm = (item.category === 'Film Substrates' || item.category === 'Film') && hasNumericSpecs;
  const rateVal = Number(tx.ratePerKg || tx.unitPrice || item.unitPrice || item.purchaseRatePerKg || 0);
  const invoiceVal = tx.subParty?.includes('Inv:') ? tx.subParty.replace('Inv:', '').trim() : (tx.invoiceNo || '');
  const totalQty = tx.inwardQtyKg || tx.outwardQtyKg || 0;
  const perUnitWeight = barcodeTokens.length > 0 ? Number((totalQty / barcodeTokens.length).toFixed(2)) : totalQty;
  const allRollObjs = barcodeTokens.map((code, index) => {
    const matchedRoll = (inventoryRolls || []).find((roll) => (
      (roll.barcodeId && String(roll.barcodeId).trim().toLowerCase() === String(code).trim().toLowerCase())
      || (roll.id && String(roll.id).trim().toLowerCase() === String(code).trim().toLowerCase())
    ));
    if (matchedRoll) return matchedRoll;
    const batchVal = tx.batchNo || (tx.notes?.includes('Batch:') ? tx.notes.split('Batch:')[1].split('|')[0].replace(/[\][]/g, '').trim() : (code || item.lastBatch || '-'));
    return {
      id: code,
      barcodeId: code,
      grnNo: tx.refNo || '',
      unitNo: index + 1,
      totalUnits: barcodeTokens.length,
      rollType: isFilm ? 'RAW_MATERIAL' : 'CONSUMABLE_ITEM',
      itemName: item.itemName || (isFilm ? `${item.filmType} Film (${item.micron}µ x ${item.widthMm}mm)` : `${item.category || 'Stock Item'}`),
      category: item.category || (isFilm ? 'Film Substrates' : 'General Store'),
      unit: item.unit || 'Kg',
      micron: isFilm ? (parseFloat(item.micron) || 0) : '-',
      widthMm: isFilm ? (parseFloat(item.widthMm) || 0) : '-',
      netWeightKg: perUnitWeight,
      availableWeightKg: perUnitWeight,
      vendorName: tx.partyName || item.lastVendor || 'Company Stock',
      batchNo: batchVal,
      invoiceNo: invoiceVal,
      purchaseRatePerKg: rateVal,
      itemRemarks: tx.itemRemarks || tx.remarks || tx.notes || '',
      remarks: tx.itemRemarks || tx.remarks || tx.notes || '',
      notes: tx.itemRemarks || tx.remarks || tx.notes || '',
      stationId: 'SCALE_1_INWARD',
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {barcodeTokens.map((code, index) => {
        const roll = allRollObjs[index];
        const balanceMeters = ledgerRollMeters(roll, code);
        return (
          <div key={`${code}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, padding: '2px 8px', width: 'fit-content' }}>
            <code style={{ fontSize: '0.78rem', color: '#0f172a', fontWeight: 700 }}>{code}</code>
            {roll?.netWeightKg > 0 && (
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                ({roll.netWeightKg} {item.unit || 'kg'}{balanceMeters ? ` · ${balanceMeters} m` : ''})
              </span>
            )}
            <button type="button" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }} onClick={() => onPrint(roll)} title={`Print barcode sticker for ${code}`}>
              <Printer size={12} /> Print
            </button>
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: '0.73rem', fontWeight: 600 }} onClick={() => onStart(tx)} title="Click to edit/update barcode string">
          <Edit3 size={12} /> Edit
        </button>
        {barcodeTokens.length > 1 && (
          <button type="button" style={{ background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0284c7', borderRadius: 4, padding: '1px 6px', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 700 }} onClick={() => onPrint(allRollObjs)} title="Print all barcode stickers for this inward">
            <Printer size={12} /> Print All ({barcodeTokens.length})
          </button>
        )}
      </div>
    </div>
  );
}

function ledgerRowStyle(tx) {
  if (tx.isPendingQC) return { background: '#fffbeb' };
  if (tx.isRejected) return { background: '#fef2f2' };
  if (tx.category === 'reservation') return { background: '#f0fdf4' };
  if (tx.category === 'reconciliation') return { background: '#f0f9ff' };
  if (tx.category === 'usage') return { background: '#fff5f5' };
  return undefined;
}

function LedgerType({ tx }) {
  return (
    <div>
      {tx.legacy && (
        <span className="badge" style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 700, marginBottom: 4 }}>Unlinked / legacy</span>
      )}
      {tx.category === 'inward' && (
        <span className="badge" style={{ fontSize: '0.72rem', fontWeight: 700, background: tx.isPendingQC ? '#fef3c7' : (tx.isRejected ? '#fee2e2' : '#dcfce7'), color: tx.isPendingQC ? '#92400e' : (tx.isRejected ? '#991b1b' : '#15803d') }}>
          {tx.type || (tx.isPendingQC ? 'GRN Inward (Awaiting QC Approval)' : (tx.isRejected ? 'GRN Inward (Rejected - QC Hold Store)' : 'GRN Inward (Approved)'))}
        </span>
      )}
      {tx.category === 'usage' && <span className="badge" style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#b91c1c' }}>{tx.type || 'Job Usage'}</span>}
      {tx.category === 'reservation' && <span className="badge" style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontWeight: 700 }}>{tx.type || 'Order Reservation'}</span>}
      {tx.category === 'reconciliation' && <span className="badge" style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1' }}>{tx.type || 'Physical Audit'}</span>}
    </div>
  );
}

export function LedgerTrialView({
  rows = [],
  unitStr,
  item,
  inventoryRolls,
  editingTxId,
  editingBarcodeVal,
  onEditingBarcodeVal,
  onSaveBarcode,
  onStartEdit,
  onCancelEdit,
  onPrint,
  emptyMessage,
}) {
  const columns = useMemo(() => [
    { id: 'date', header: 'Date & Time', cell: ({ row }) => formatPlantDateTime(row.original.date) },
    { id: 'type', header: 'Transaction Type', cell: ({ row }) => <LedgerType tx={row.original} /> },
    {
      id: 'ref',
      header: 'Ref Doc / Job Name',
      cell: ({ row }) => {
        const tx = row.original;
        return (
          <div>
            <div style={{ fontWeight: 700, color: tx.category === 'reservation' ? '#15803d' : (tx.category === 'usage' ? '#991b1b' : '#2563eb') }}>{tx.refNo}</div>
            {tx.jobLink?.label && (
              tx.jobLink.href ? (
                <button
                  type="button"
                  onClick={() => {
                    if (tx.jobLink.orderId) pushSlugState('orders', { section: 'order', orderId: tx.jobLink.orderId });
                    else if (tx.jobLink.recordId) pushSlugState('production_records', { section: 'record', recordId: tx.jobLink.recordId });
                  }}
                  style={{ display: 'block', marginTop: 2, padding: 0, border: 'none', background: 'none', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
                >
                  {tx.jobLink.label}
                </button>
              ) : <div style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: 700 }}>{tx.jobLink.label}</div>
            )}
            {tx.subRef && tx.subRef !== tx.jobLink?.label && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{tx.subRef}</div>}
          </div>
        );
      },
    },
    {
      id: 'party',
      header: 'Party / Store Requisitioner',
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.original.partyName}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{row.original.subParty}</div>
        </div>
      ),
    },
    {
      id: 'barcode',
      header: 'Barcode / Tag (Updatable)',
      cell: ({ row }) => (
        <LedgerBarcodeCell
          tx={row.original}
          item={item}
          inventoryRolls={inventoryRolls}
          editing={editingTxId === row.original.txId}
          editingValue={editingBarcodeVal}
          onEditingValue={onEditingBarcodeVal}
          onSave={onSaveBarcode}
          onStart={onStartEdit}
          onCancel={onCancelEdit}
          onPrint={onPrint}
        />
      ),
    },
    {
      id: 'inward',
      header: `Inward (+ ${unitStr})`,
      cell: ({ row }) => (row.original.inwardQtyKg > 0
        ? <span style={{ fontWeight: 700, color: row.original.isPendingQC ? '#d97706' : '#047857' }}>+ {Number(row.original.inwardQtyKg).toLocaleString()} {unitStr}</span>
        : '-'),
    },
    {
      id: 'usage',
      header: `Usage / Issue (- ${unitStr})`,
      cell: ({ row }) => {
        const tx = row.original;
        if (tx.category === 'reservation') return <span style={{ color: '#15803d', fontWeight: 700 }}>- {Number(tx.outwardQtyKg || 0).toLocaleString()} {unitStr}</span>;
        if (tx.outwardQtyKg > 0) return <span style={{ color: '#dc2626', fontWeight: 700 }}>- {Number(tx.outwardQtyKg).toLocaleString()} {unitStr}</span>;
        return <span style={{ color: '#64748b' }}>-</span>;
      },
    },
    {
      id: 'adj',
      header: `Audit Adj (± ${unitStr})`,
      cell: ({ row }) => (row.original.adjQtyKg !== 0
        ? (row.original.adjQtyKg > 0 ? `+ ${row.original.adjQtyKg} ${unitStr}` : `- ${Math.abs(row.original.adjQtyKg)} ${unitStr}`)
        : '-'),
    },
    {
      id: 'balance',
      header: `Stock Balance (${unitStr})`,
      cell: ({ row }) => <span style={{ fontWeight: 800 }}>{Number(row.original.runningBalance || 0).toLocaleString()} {unitStr}</span>,
    },
    {
      id: 'value',
      header: 'Rate & Value (₹)',
      cell: ({ row }) => (
        <div>
          <div style={{ fontWeight: 700, color: '#047857' }}>₹ {money(row.original.totalValue)}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>₹ {Number(row.original.ratePerKg || 0).toFixed(2)}/{unitStr}</div>
        </div>
      ),
    },
  ], [unitStr, item, inventoryRolls, editingTxId, editingBarcodeVal, onEditingBarcodeVal, onSaveBarcode, onStartEdit, onCancelEdit, onPrint]);

  return (
    <MantinePilotTable
      data={rows}
      columns={columns}
      getRowId={(row, index) => `${row.txId || 'tx'}-${index}`}
      testId="ledger-register-mantine"
      minWidth={780}
      emptyMessage={emptyMessage}
      rowStyle={ledgerRowStyle}
      cardTitle={(row) => row.refNo || row.type || 'Ledger line'}
      cardFields={(row) => [
        { label: 'When', value: formatPlantDateTime(row.date) },
        { label: 'Type', value: <LedgerType tx={row} /> },
        { label: 'Party', value: row.partyName || '—' },
        { label: 'Inward', value: row.inwardQtyKg > 0 ? `${Number(row.inwardQtyKg).toLocaleString()} ${unitStr}` : '—' },
        { label: 'Issued', value: row.outwardQtyKg > 0 ? `${Number(row.outwardQtyKg).toLocaleString()} ${unitStr}` : '—' },
        { label: 'Balance', value: `${Number(row.runningBalance || 0).toLocaleString()} ${unitStr}` },
        {
          label: 'Barcode',
          value: (
            <LedgerBarcodeCell
              tx={row}
              item={item}
              inventoryRolls={inventoryRolls}
              editing={editingTxId === row.txId}
              editingValue={editingBarcodeVal}
              onEditingValue={onEditingBarcodeVal}
              onSave={onSaveBarcode}
              onStart={onStartEdit}
              onCancel={onCancelEdit}
              onPrint={onPrint}
            />
          ),
        },
      ]}
    />
  );
}

export function FifoTrialView({ rows = [], unitStr }) {
  const lines = useMemo(
    () => presentFifoLines(rows, unitStr, (iso) => formatPlantDate(iso)),
    [rows, unitStr]
  );
  const columns = useMemo(() => [
    { id: 'barcode', header: 'Barcode', cell: ({ row }) => <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }} data-testid="barcode-fifo-line">{row.original.code}</span> },
    { id: 'qty', header: 'Remaining qty', cell: ({ row }) => row.original.qtyText },
    { id: 'age', header: 'FIFO age', cell: ({ row }) => <span data-testid="barcode-fifo-age" style={{ fontWeight: 700, color: row.original.frozen ? '#64748b' : '#0369a1' }}>{row.original.ageText}</span> },
    { id: 'origin', header: 'Origin date', cell: ({ row }) => row.original.originText },
    {
      id: 'order',
      header: 'Consume order',
      cell: ({ row }) => (row.original.prefer
        ? <span data-testid="fifo-consume-first" style={{ color: '#0369a1', fontWeight: 800 }}>FIFO consume first</span>
        : <span style={{ color: '#94a3b8' }}>—</span>),
    },
  ], []);

  return (
    <MantinePilotTable
      data={lines}
      columns={columns}
      getRowId={(row) => row.code}
      testId="ledger-barcode-mantine"
      emptyMessage="No in-stock barcodes for this item."
      cardTitle={(row) => row.code || 'Barcode'}
      cardFields={(row) => [
        { label: 'Remaining qty', value: row.qtyText },
        { label: 'FIFO age', value: <span data-testid="barcode-fifo-age">{row.ageText}</span> },
        { label: 'Origin date', value: row.originText },
        { label: 'Consume order', value: row.prefer ? <span data-testid="fifo-consume-first">FIFO consume first</span> : '—' },
      ]}
    />
  );
}
