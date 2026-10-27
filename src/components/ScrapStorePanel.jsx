import React, { useEffect, useMemo, useState } from 'react';
import { Download, Filter, RotateCcw, Search, Trash2 } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import TablePagination from './TablePagination';
import { displayPartyName } from '../utils/textHelpers';
import {
  SCRAP_PRESETS,
  downloadScrapStoreCsv,
  formatIsoDate,
  paginateScrapRows,
  scrapFilterOptions
} from '../utils/scrapStoreFilters';

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  minWidth: '140px',
  flex: '1 1 160px'
};

const labelStyle = {
  fontSize: '0.72rem',
  fontWeight: '800',
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.04em'
};

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  fontSize: '0.84rem',
  fontFamily: 'inherit',
  background: '#fff'
};

function useDraft(value, commit, delay = 350) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (draft === value) return undefined;
    const timer = setTimeout(() => commit(draft), delay);
    return () => clearTimeout(timer);
  }, [draft, value, commit, delay]);
  return [draft, setDraft];
}

function Field({ label, children }) {
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

export default function ScrapStorePanel({
  rows = [],
  summary,
  totalCount = 0,
  loading = false,
  filters,
  onChange,
  context,
  pageSizeDefault = 25
}) {
  const [pageSize, setPageSize] = useState(pageSizeDefault);
  const options = useMemo(
    () => scrapFilterOptions({
      rows,
      orders: context?.orders,
      jobMasters: context?.jobMasters,
      machines: context?.machines,
      productionRecords: context?.productionRecords
    }),
    [rows, context]
  );
  const paged = paginateScrapRows(rows, filters.page, pageSize);
  useEffect(() => {
    if (paged.page !== filters.page) onChange({ page: paged.page });
  }, [paged.page, filters.page, onChange]);

  const [searchDraft, setSearchDraft] = useDraft(filters.q, (q) => onChange({ q }));
  const [orderDraft, setOrderDraft] = useDraft(filters.orderId, (orderId) => onChange({ orderId }));
  const [operatorDraft, setOperatorDraft] = useDraft(filters.operator, (operator) => onChange({ operator }));
  const [kgMinDraft, setKgMinDraft] = useDraft(filters.kgMin, (kgMin) => onChange({ kgMin }));
  const [kgMaxDraft, setKgMaxDraft] = useDraft(filters.kgMax, (kgMax) => onChange({ kgMax }));

  const rangeLabel = filters.from || filters.to
    ? `${filters.from ? formatIsoDate(filters.from) : '…'} – ${filters.to ? formatIsoDate(filters.to) : '…'}`
    : 'All entry dates';

  const select = (key, value) => onChange({ [key]: value });

  return (
    <div data-testid="scrap-store-section" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trash2 size={20} color="#64748b" /> Scrap Store Inventory Log ({summary?.rowCount || 0}{totalCount !== summary?.rowCount ? ` of ${totalCount}` : ''})
          </h3>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0 0' }}>
            Process wastage for each job, tagged by stage and type, plus QC hold material sent to scrap. Dates use the scrap entry date in IST.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="scrap-store-export"
            onClick={() => downloadScrapStoreCsv(rows)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: '800', fontSize: '0.82rem', cursor: 'pointer', color: '#0f172a' }}
          >
            <Download size={15} /> Export CSV
          </button>
          <button
            type="button"
            data-testid="scrap-store-clear"
            onClick={() => onChange({
              preset: '',
              from: '',
              to: '',
              stage: '',
              type: '',
              source: '',
              orderId: '',
              jobMasterId: '',
              customer: '',
              machine: '',
              operator: '',
              material: '',
              kgMin: '',
              kgMax: '',
              high: false,
              status: '',
              q: '',
              page: 1
            })}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: '800', fontSize: '0.82rem', cursor: 'pointer', color: '#334155' }}
          >
            <RotateCcw size={15} /> Clear all
          </button>
        </div>
      </div>

      <div data-testid="scrap-store-filters" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', background: '#f8fafc', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#334155', fontWeight: '800', fontSize: '0.82rem' }}>
          <Filter size={15} /> Filters
          {loading ? <span style={{ fontWeight: '600', color: '#64748b' }}>Updating…</span> : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          <button
            type="button"
            data-testid="scrap-preset-all"
            onClick={() => onChange({ preset: '', from: '', to: '' })}
            style={presetStyle(!filters.preset)}
          >
            All dates
          </button>
          {SCRAP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`scrap-preset-${preset.id}`}
              title={preset.id === 'fy' ? 'April–March' : undefined}
              onClick={() => onChange({ preset: preset.id })}
              style={presetStyle(filters.preset === preset.id)}
            >
              {preset.id === 'fy' ? 'This financial year (Apr–Mar)' : preset.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <Field label="From">
            <input data-testid="scrap-date-from" type="date" value={filters.from || ''} onChange={(event) => onChange({ preset: 'custom', from: event.target.value, to: filters.to })} style={inputStyle} />
          </Field>
          <Field label="To">
            <input data-testid="scrap-date-to" type="date" value={filters.to || ''} onChange={(event) => onChange({ preset: 'custom', to: event.target.value, from: filters.from })} style={inputStyle} />
          </Field>
          <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: '700', paddingBottom: '8px' }} data-testid="scrap-date-label">{rangeLabel} · IST</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
          <Field label="Stage / process">
            <SearchableSelect data-testid="scrap-filter-stage" value={filters.stage} onChange={(event) => select('stage', event.target.value)} style={{ width: '100%' }}>
              <option value="">All stages</option>
              {options.stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
            </SearchableSelect>
          </Field>
          <Field label="Wastage type">
            <SearchableSelect value={filters.type} onChange={(event) => select('type', event.target.value)} style={{ width: '100%' }}>
              <option value="">All types</option>
              {options.types.map((type) => <option key={type} value={type}>{type}</option>)}
            </SearchableSelect>
          </Field>
          <Field label="Source">
            <SearchableSelect data-testid="scrap-filter-source" value={filters.source} onChange={(event) => select('source', event.target.value)} style={{ width: '100%' }}>
              <option value="">All sources</option>
              {options.sources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
            </SearchableSelect>
          </Field>
          <Field label="Job / order no.">
            <input data-testid="scrap-filter-order" value={orderDraft} onChange={(event) => setOrderDraft(event.target.value)} placeholder="Order, job no." style={inputStyle} />
          </Field>
          <Field label="Product / job master">
            <SearchableSelect value={filters.jobMasterId} onChange={(event) => select('jobMasterId', event.target.value)} style={{ width: '100%' }}>
              <option value="">All job masters</option>
              {options.jobMasters.map((job) => <option key={job.value} value={job.value}>{job.label}</option>)}
            </SearchableSelect>
          </Field>
          <Field label="Customer">
            <SearchableSelect value={filters.customer} onChange={(event) => select('customer', event.target.value)} style={{ width: '100%' }}>
              <option value="">All customers</option>
              {options.customers.map((customer) => <option key={customer} value={customer}>{displayPartyName(customer)}</option>)}
            </SearchableSelect>
          </Field>
          <Field label="Machine">
            <SearchableSelect value={filters.machine} onChange={(event) => select('machine', event.target.value)} style={{ width: '100%' }}>
              <option value="">All machines</option>
              {options.machines.map((machine) => <option key={machine.value} value={machine.value}>{machine.label}</option>)}
            </SearchableSelect>
          </Field>
          <Field label="Recorded by">
            <input list="scrap-operator-options" value={operatorDraft} onChange={(event) => setOperatorDraft(event.target.value)} placeholder="Operator or inspector" style={inputStyle} />
            <datalist id="scrap-operator-options">
              {options.operators.map((operator) => <option key={operator} value={operator} />)}
            </datalist>
          </Field>
          <Field label="Material / substrate">
            <SearchableSelect value={filters.material} onChange={(event) => select('material', event.target.value)} style={{ width: '100%' }}>
              <option value="">All materials</option>
              {options.materials.map((material) => <option key={material} value={material}>{material}</option>)}
            </SearchableSelect>
          </Field>
          <Field label="Kg min">
            <input data-testid="scrap-filter-kg-min" type="number" min="0" step="0.01" value={kgMinDraft} onChange={(event) => setKgMinDraft(event.target.value)} placeholder="0" style={inputStyle} />
          </Field>
          <Field label="Kg max">
            <input data-testid="scrap-filter-kg-max" type="number" min="0" step="0.01" value={kgMaxDraft} onChange={(event) => setKgMaxDraft(event.target.value)} placeholder="Any" style={inputStyle} />
          </Field>
          <Field label="Status">
            <SearchableSelect data-testid="scrap-filter-status" value={filters.status} onChange={(event) => select('status', event.target.value)} style={{ width: '100%' }}>
              <option value="">All statuses</option>
              {options.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </SearchableSelect>
          </Field>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginTop: '12px' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', fontWeight: '800', color: '#991b1b', background: filters.high ? '#fef2f2' : '#fff', border: '1px solid #fca5a5', borderRadius: '8px', padding: '8px 10px' }}>
            <input data-testid="scrap-filter-high" type="checkbox" checked={Boolean(filters.high)} onChange={(event) => onChange({ high: event.target.checked })} />
            High scrap jobs only
          </label>
          <label style={{ ...fieldStyle, flex: '2 1 260px', margin: 0 }}>
            <span style={labelStyle}>Search</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', ...inputStyle }}>
              <Search size={14} color="#64748b" />
              <input
                data-testid="scrap-filter-search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Order no., job name, barcode, notes"
                style={{ border: 'none', outline: 'none', width: '100%', font: 'inherit', background: 'transparent' }}
              />
            </span>
          </label>
        </div>
      </div>

      <div data-testid="scrap-store-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        <SummaryCard testId="scrap-summary-kg" label="Total kg" value={`${Number(summary?.totalKg || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`} tone="#dc2626" />
        <SummaryCard testId="scrap-summary-rows" label="Rows" value={String(summary?.rowCount || 0)} />
        <SummaryCard testId="scrap-summary-jobs" label="Jobs" value={String(summary?.jobCount || 0)} />
        <div style={{ gridColumn: '1 / -1', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>By stage</div>
          <div data-testid="scrap-summary-stages" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {(summary?.byStage || []).length === 0 ? (
              <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>No scrap in this view</span>
            ) : summary.byStage.map((bucket) => (
              <span key={bucket.stage} data-testid={`scrap-stage-${bucket.stage.replace(/\s+/g, '-').toLowerCase()}`} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '999px', padding: '4px 10px', fontSize: '0.78rem', fontWeight: '800', color: '#0f172a' }}>
                {bucket.stage}: {bucket.kg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg ({bucket.count})
              </span>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
          <Trash2 size={36} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
          <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#475569' }}>
            {totalCount > 0 ? 'No scrap rows match these filters' : 'Scrap store is currently empty'}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="scrap-store-log" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={thStyle}>Original Tag Ref</th>
                  <th style={thStyle}>Job Name & Order</th>
                  <th style={thStyle}>Stage</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Source</th>
                  <th style={thStyle}>Substrate & Size</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Scrap Weight (kg)</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Machine</th>
                  <th style={thStyle}>Scrap Reason & Remarks</th>
                  <th style={thStyle}>Recorded By & Date</th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((item) => (
                  <tr key={item.id} data-testid="scrap-store-row" style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: '700', color: '#dc2626' }}>{item.barcode || item.holdTagId || '—'}</td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: '700', color: '#0f172a' }}>{item.jobName}</div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{item.orderNo || '—'} | Client: {displayPartyName(item.customer)}</div>
                      {item.jobMasterName ? <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{item.jobMasterName}</div> : null}
                      {item.highScrap ? <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#b91c1c' }}>High scrap job</div> : null}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: '700', color: '#1e3a8a' }}>{item.stageLabel}</td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '4px', border: '1px solid #fca5a5' }}>
                        {item.typeLabel || '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>{item.sourceLabel}</td>
                    <td style={{ ...tdStyle, color: '#334155' }}>{item.materialLabel || '—'}{item.micron || item.widthMm ? ` (${item.micron || '—'}µm × ${item.widthMm || '—'}mm)` : ''}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '900', color: '#dc2626' }}>{Number(item.scrapQtyKg || 0).toFixed(2)} kg</td>
                    <td style={tdStyle}>{item.statusLabel}</td>
                    <td style={tdStyle}>{item.machineLabel || '—'}</td>
                    <td style={{ ...tdStyle, color: '#475569', fontSize: '0.8rem' }}>{item.notes}</td>
                    <td style={{ ...tdStyle, color: '#64748b', fontSize: '0.76rem' }}>
                      <div>{item.operatorLabel || '—'}</div>
                      <div>{item.entryDate ? formatIsoDate(item.entryDate) : '—'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={paged.page}
            totalItems={paged.total}
            pageSize={pageSize}
            onPageChange={(page) => onChange({ page })}
            onPageSizeChange={(size) => {
              setPageSize(size);
              onChange({ page: 1 });
            }}
          />
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: '10px 14px', textAlign: 'left' };
const tdStyle = { padding: '10px 14px' };

function presetStyle(active) {
  return {
    border: active ? '1px solid #0f172a' : '1px solid #cbd5e1',
    background: active ? '#0f172a' : '#fff',
    color: active ? '#fff' : '#334155',
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '0.78rem',
    fontWeight: '800',
    cursor: 'pointer'
  };
}

function SummaryCard({ label, value, testId, tone = '#0f172a' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div data-testid={testId} style={{ fontSize: '1.15rem', fontWeight: '900', color: tone, marginTop: '2px' }}>{value}</div>
    </div>
  );
}
