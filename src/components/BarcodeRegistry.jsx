import React, { useEffect, useMemo, useState } from 'react';
import { ScanBarcode, Search } from 'lucide-react';
import TablePagination, { usePagination } from './TablePagination';
import { isSupabaseConfigured, supabase } from '../services/supabaseClient';
import { fetchBarcodeRegistry } from '../services/supabaseDataService';
import { fetchPayloadRecords } from '../services/businessRecords';
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
}) {
  const [viewRows, setViewRows] = useState([]);
  const [extras, setExtras] = useState(null);
  const [query, setQuery] = useState('');
  const [sourceModule, setSourceModule] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromView = await fetchBarcodeRegistry();
      if (cancelled) return;
      if (Array.isArray(fromView) && fromView.length) {
        setViewRows(fromView);
        return;
      }
      const printed = await loadPrintedBarcodes();
      if (!cancelled) setExtras(printed);
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
            </tr>
          </thead>
          <tbody>
            {pagination.paginatedItems.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: '#64748b', padding: '28px' }}>
                  {rows.length === 0
                    ? 'No barcodes have been stored yet.'
                    : 'No barcodes match this search.'}
                </td>
              </tr>
            )}
            {pagination.paginatedItems.map((row) => (
              <tr key={`${row.sourceModule}|${row.barcode}`}>
                <td>
                  <code style={{ fontWeight: '800', color: '#0f172a' }}>{row.barcode}</code>
                </td>
                <td>{row.sourceModule}</td>
                <td>{row.description || '—'}</td>
                <td>{row.referenceNo || '—'}</td>
                <td>{formatWhen(row.createdAt)}</td>
                <td>{row.status || '—'}</td>
                <td>{row.location || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination pagination={pagination} />
      </div>
    </div>
  );
}
