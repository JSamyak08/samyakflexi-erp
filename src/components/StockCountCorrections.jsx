import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Download, Search } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import { formatPlantDateTime } from '../utils/dbDates';
import { fetchPayloadRecords, describeSaveError } from '../services/businessRecords';
import { supabase } from '../services/supabaseClient';
import {
  correctionActionLabel,
  correctionTotals,
  filterStockCorrections,
  formatStockKg,
  stockCorrectionsCsv
} from '../services/stockCountCorrection';

const EMPTY_FILTERS = {
  from: '',
  to: '',
  item: '',
  category: '',
  action: 'all',
  direction: 'all',
  user: '',
  barcode: ''
};

function signedKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const text = formatStockKg(Math.abs(number));
  if (number > 0) return `+${text}`;
  if (number < 0) return `−${text}`;
  return text;
}

function recordedChange(before, after, unit = 'kg') {
  if (before === undefined || before === null || before === '' || after === undefined || after === null || after === '') {
    return 'Not recorded on this older row.';
  }
  return `${formatStockKg(before)} ${unit} → ${formatStockKg(after)} ${unit}`;
}

export default function StockCountCorrections() {
  const [rows, setRows] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    fetchPayloadRecords(supabase, 'stock_adjustments')
      .then((records) => {
        if (active) setRows(records || []);
      })
      .catch((err) => {
        if (active) setLoadError(describeSaveError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => filterStockCorrections(rows, filters), [rows, filters]);
  const totals = useMemo(() => correctionTotals(filtered), [filtered]);
  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const downloadCsv = () => {
    const csv = stockCorrectionsCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Stock_Count_Corrections_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-panel scc-page" style={{ padding: '20px' }} data-testid="stock-count-corrections">
      <div className="scc-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={22} /> Stock Count Corrections
          </h2>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Every stock count, newest first. Older rows that used the previous wording stay as they were and are marked Legacy adjustment.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={downloadCsv} disabled={!filtered.length} data-testid="stock-count-export">
          <Download size={15} /> Export CSV
        </button>
      </div>

      <div className="scc-filters" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        <label className="form-group">From<input type="date" className="form-control" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} data-testid="scc-filter-from" /></label>
        <label className="form-group">To<input type="date" className="form-control" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} data-testid="scc-filter-to" /></label>
        <label className="form-group">Item
          <span style={{ position: 'relative', display: 'block' }}>
            <Search size={14} style={{ position: 'absolute', left: '8px', top: '11px', color: '#94a3b8' }} />
            <input className="form-control" style={{ paddingLeft: '28px' }} placeholder="Name or code" value={filters.item} onChange={(e) => setFilter('item', e.target.value)} data-testid="scc-filter-item" />
          </span>
        </label>
        <label className="form-group">Category / film<input className="form-control" placeholder="Film, PET…" value={filters.category} onChange={(e) => setFilter('category', e.target.value)} data-testid="scc-filter-category" /></label>
        <label className="form-group">Action
          <select className="form-control" value={filters.action} onChange={(e) => setFilter('action', e.target.value)} data-testid="scc-filter-action">
            <option value="all">All actions</option>
            <option value="updated">Updated</option>
            <option value="added">Added roll</option>
            <option value="removed">Removed roll</option>
            <option value="legacy">Legacy adjustment</option>
          </select>
        </label>
        <label className="form-group">Short or excess
          <select className="form-control" value={filters.direction} onChange={(e) => setFilter('direction', e.target.value)} data-testid="scc-filter-direction">
            <option value="all">Both</option>
            <option value="short">Short</option>
            <option value="excess">Excess</option>
          </select>
        </label>
        <label className="form-group">Done by<input className="form-control" placeholder="Name" value={filters.user} onChange={(e) => setFilter('user', e.target.value)} data-testid="scc-filter-user" /></label>
        <label className="form-group">Barcode<input className="form-control" placeholder="RM-BC" value={filters.barcode} onChange={(e) => setFilter('barcode', e.target.value)} data-testid="scc-filter-barcode" /></label>
      </div>

      <div className="scc-totals" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 14px', minWidth: '140px' }}>
          <div style={{ fontSize: '0.75rem', color: '#9a3412' }}>Short</div>
          <strong data-testid="scc-total-short">−{formatStockKg(totals.shortKg)} kg</strong>
        </div>
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '10px 14px', minWidth: '140px' }}>
          <div style={{ fontSize: '0.75rem', color: '#047857' }}>Excess</div>
          <strong data-testid="scc-total-excess">+{formatStockKg(totals.excessKg)} kg</strong>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', minWidth: '140px' }}>
          <div style={{ fontSize: '0.75rem', color: '#475569' }}>Rows</div>
          <strong data-testid="scc-total-rows">{filtered.length}</strong>
        </div>
      </div>

      {loadError && <p role="alert" style={{ color: '#b91c1c' }}>{loadError}</p>}
      {loading && <p>Loading stock count corrections…</p>}

      {!loading && (
        <>
          <div className="mobile-table-scroll-hint scc-scroll-hint">← Swipe horizontally to see every column →</div>
          <div className="scc-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <table className="data-table" style={{ fontSize: '0.84rem', minWidth: '980px' }}>
              <thead>
                <tr>
                  <th>Date & time</th>
                  <th>Item</th>
                  <th>Roll barcode</th>
                  <th>Action</th>
                  <th>System kg</th>
                  <th>Counted kg</th>
                  <th>Difference</th>
                  <th>Reason</th>
                  <th>Done by</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '28px', color: '#64748b' }}>No corrections match these filters.</td></tr>
                ) : filtered.map((row) => (
                  <tr key={row.id} data-testid="scc-row" onClick={() => setSelected(row)} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{row.date ? formatPlantDateTime(row.date) : '—'}</td>
                    <td><strong>{row.itemName || row.itemCode || row.itemId || '—'}</strong><div style={{ fontSize: '0.75rem', color: '#64748b' }}>{row.itemCode || row.itemId || ''}</div></td>
                    <td style={{ fontFamily: 'ui-monospace, monospace' }}>{row.barcode || '—'}</td>
                    <td>{correctionActionLabel(row)}</td>
                    <td>{row.systemQtyKg === undefined || row.systemQtyKg === null || row.systemQtyKg === '' ? '—' : formatStockKg(row.systemQtyKg)}</td>
                    <td>{row.countedQtyKg === undefined || row.countedQtyKg === null || row.countedQtyKg === '' ? '—' : formatStockKg(row.countedQtyKg)}</td>
                    <td style={{ fontWeight: '800', color: Number(row.qtyKg) < 0 ? '#c2410c' : '#047857' }}>{signedKg(row.qtyKg)}</td>
                    <td>{row.reason || '—'}</td>
                    <td>{row.adjustedBy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="scc-cards">
            {filtered.length === 0 ? (
              <p style={{ color: '#64748b' }}>No corrections match these filters.</p>
            ) : filtered.map((row) => (
              <button key={`${row.id}-card`} type="button" className="scc-card" data-testid="scc-card" onClick={() => setSelected(row)}>
                <strong>{correctionActionLabel(row)}</strong>
                <span>{row.date ? formatPlantDateTime(row.date) : '—'}</span>
                <span>{row.itemName || row.itemCode || row.itemId || '—'}</span>
                <span>{row.barcode || 'No barcode'}</span>
                <span>{signedKg(row.qtyKg)} kg</span>
              </button>
            ))}
          </div>
        </>
      )}

      {selected && (
        <ModalOverlay onClose={() => setSelected(null)}>
          <div className="modal-content" style={{ maxWidth: '640px', width: '94%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(event) => event.stopPropagation()} data-testid="scc-detail">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: '0 0 4px' }}>{correctionActionLabel(selected)}</h3>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>{selected.date ? formatPlantDateTime(selected.date) : '—'}</p>
              </div>
              <button type="button" className="btn-secondary" data-modal-dismiss="" onClick={() => setSelected(null)}>Close</button>
            </div>
            <dl className="scc-detail-list">
              <div><dt>Item</dt><dd>{selected.itemName || '—'} ({selected.itemCode || selected.itemId || '—'})</dd></div>
              <div><dt>Roll barcode</dt><dd>{selected.barcode || '—'}</dd></div>
              <div><dt>System kg</dt><dd>{selected.systemQtyKg === undefined || selected.systemQtyKg === null || selected.systemQtyKg === '' ? '—' : formatStockKg(selected.systemQtyKg)}</dd></div>
              <div><dt>Counted kg</dt><dd>{selected.countedQtyKg === undefined || selected.countedQtyKg === null || selected.countedQtyKg === '' ? '—' : formatStockKg(selected.countedQtyKg)}</dd></div>
              <div><dt>Difference</dt><dd>{signedKg(selected.qtyKg)} kg</dd></div>
              <div><dt>Item total</dt><dd>{recordedChange(selected.itemKgBefore, selected.itemKgAfter)}</dd></div>
              <div><dt>Roll available</dt><dd>{recordedChange(selected.rollKgBefore, selected.rollKgAfter)}</dd></div>
              <div><dt>Reason</dt><dd>{selected.reason || '—'}</dd></div>
              <div><dt>Done by</dt><dd>{selected.adjustedBy || '—'}</dd></div>
              <div><dt>Ledger line</dt><dd>{selected.type || '—'}</dd></div>
            </dl>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
