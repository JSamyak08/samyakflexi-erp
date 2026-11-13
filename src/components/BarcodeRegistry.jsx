import React, { useEffect, useMemo, useState } from 'react';
import { Printer, ScanBarcode, Search } from 'lucide-react';
import TablePagination, { usePagination } from './TablePagination';
import BarcodePrinterModal from './BarcodePrinterModal';
import { isSupabaseConfigured, supabase } from '../services/supabaseClient';
import { fetchBarcodeRegistry } from '../services/supabaseDataService';
import { fetchPayloadRecords } from '../services/businessRecords';
import { reprintStickerForRow } from '../utils/barcodeReprint';
import {
  barcodeSourceModules,
  collectBarcodes,
  filterBarcodeRows,
  mergeBarcodeRows,
} from '../utils/barcodeRegistry';

function formatWhen(value) {
  const text = String(value || '').trim();
  if (!text) return '—';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

async function loadPrintedBarcodes() {
  const empty = {
    customBarcodes: [],
    stockAdjustments: [],
    qcHoldItems: [],
    scrapItems: [],
    storeIssues: [],
  };
  if (!isSupabaseConfigured()) return empty;
  const tables = [
    ['custom_barcodes', 'customBarcodes'],
    ['stock_adjustments', 'stockAdjustments'],
    ['sfg_qc_hold_items', 'qcHoldItems'],
    ['sfg_scrap_items', 'scrapItems'],
    ['store_issue_transactions', 'storeIssues'],
  ];
  await Promise.all(tables.map(async ([table, key]) => {
    try {
      empty[key] = await fetchPayloadRecords(supabase, table);
    } catch (error) {
      console.warn(`[barcodes] ${table}:`, error?.message || error);
    }
  }));
  return empty;
}

export default function BarcodeRegistry({
  serverRows = [],
  inventoryRolls = [],
  inventory = [],
  grns = [],
  sfgGoods = [],
  dispatchShipments = [],
  deliveryChallans = [],
  productionRecords = [],
  cylinders = [],
  pelletInwards = [],
  inks = [],
}) {
  const [viewRows, setViewRows] = useState([]);
  const [extras, setExtras] = useState(null);
  const [printSources, setPrintSources] = useState(null);
  const [reprintRoll, setReprintRoll] = useState(null);
  const [query, setQuery] = useState('');
  const [sourceModule, setSourceModule] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [fromView, printed] = await Promise.all([
        fetchBarcodeRegistry(),
        loadPrintedBarcodes(),
      ]);
      if (cancelled) return;
      setPrintSources(printed);
      if (Array.isArray(fromView) && fromView.length) {
        setViewRows(fromView);
        return;
      }
      setExtras(printed);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => mergeBarcodeRows(
    serverRows,
    viewRows,
    collectBarcodes({
      inventoryRolls,
      inventory,
      grns,
      sfgGoods,
      dispatchShipments,
      deliveryChallans,
      productionRecords,
      cylinders,
      pelletInwards,
      ...(extras || {}),
    })
  ), [
    serverRows,
    viewRows,
    inventoryRolls,
    inventory,
    grns,
    sfgGoods,
    dispatchShipments,
    deliveryChallans,
    productionRecords,
    cylinders,
    pelletInwards,
    extras,
  ]);

  const modules = useMemo(() => barcodeSourceModules(rows), [rows]);
  const visible = useMemo(
    () => filterBarcodeRows(rows, { query, sourceModule }),
    [rows, query, sourceModule]
  );
  const pagination = usePagination(visible, 25);
  const stickerSources = useMemo(() => ({
    inventoryRolls,
    sfgGoods,
    grns,
    dispatchShipments,
    qcHoldItems: printSources?.qcHoldItems || [],
    customBarcodes: printSources?.customBarcodes || [],
  }), [inventoryRolls, sfgGoods, grns, dispatchShipments, printSources]);

  return (
    <div data-screen="barcodes" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-panel" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ScanBarcode size={20} /> Barcodes
        </h2>
        <p style={{ color: '#64748b', fontSize: '0.86rem', marginTop: '6px', maxWidth: '760px' }}>
          Every barcode stored on raw-material and GRN rolls, SFG and FG batches, consume child rolls,
          dispatch packing lists, printed tags, cylinders, and production records.
          Pellet fuel does not generate barcodes.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px' }}>
          <label style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '11px', color: '#94a3b8' }} />
            <input
              aria-label="Search barcodes"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search barcode, item, order, GRN, or job"
              style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
            />
          </label>
          <select
            aria-label="Filter by module"
            value={sourceModule}
            onChange={(event) => setSourceModule(event.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff' }}
          >
            <option value="">All modules</option>
            {modules.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'auto' }}>
        <table className="data-table" style={{ fontSize: '0.84rem' }}>
          <thead>
            <tr>
              <th>Barcode</th>
              <th>Source module</th>
              <th>Item / description</th>
              <th>Order / GRN / job</th>
              <th>Created</th>
              <th>Status</th>
              <th>Location</th>
              <th>Print</th>
            </tr>
          </thead>
          <tbody>
            {pagination.paginatedItems.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: '#64748b', padding: '28px' }}>
                  {rows.length === 0
                    ? 'No barcodes have been stored yet.'
                    : 'No barcodes match this search.'}
                </td>
              </tr>
            )}
            {pagination.paginatedItems.map((row) => {
              const sticker = reprintStickerForRow(row, stickerSources);
              return (
              <tr key={`${row.sourceModule}|${row.barcode}`}>
                <td>
                  <code style={{ fontWeight: '800', color: '#0f172a' }}>{row.barcode}</code>
                </td>
                <td>{row.sourceModule}</td>
                <td>{row.description || '—'}</td>
                <td>{row.referenceNo || '—'}</td>
                <td>{formatWhen(row.createdAt)}</td>
                <td>
                  {['deleted', 'written off'].includes(String(row.status || '').trim().toLowerCase()) ? (
                    <div>
                      <span style={{ display: 'inline-block', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '999px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: '800' }}>
                        {String(row.status || '').trim().toLowerCase() === 'written off' ? 'Written Off' : 'Deleted'}
                      </span>
                      <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#7f1d1d' }}>
                        {row.deletedReason || 'No reason recorded'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {[row.deletedBy, formatWhen(row.deletedAt)].filter((part) => part && part !== '—').join(' · ') || '—'}
                      </div>
                    </div>
                  ) : (row.status || '—')}
                </td>
                <td>{row.location || '—'}</td>
                <td>
                  {sticker ? (
                    <button
                      type="button"
                      data-testid="barcode-reprint"
                      aria-label={`Print sticker ${row.barcode}`}
                      title="Reprint this sticker"
                      onClick={() => setReprintRoll(sticker)}
                      style={{
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        color: '#047857',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '800',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Printer size={13} /> Print
                    </button>
                  ) : '—'}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        <TablePagination pagination={pagination} />
      </div>
      {reprintRoll && (
        <BarcodePrinterModal
          roll={reprintRoll}
          inventory={inventory}
          inventoryRolls={inventoryRolls}
          inks={inks}
          variant="reprint"
          onClose={() => setReprintRoll(null)}
        />
      )}
    </div>
  );
}
