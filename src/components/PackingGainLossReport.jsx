import React, { useEffect, useMemo, useState } from 'react';
import { formatPlantDateTime } from '../utils/dbDates';
import {
  DEFAULT_GAIN_LOSS_THRESHOLD_PCT,
  buildGainLossReport,
  formatGainLossKg,
  formatGainLossPct
} from '../utils/dispatchPacking';
import {
  fetchGainLossThresholdPct,
  fetchPackingGainLossReport,
  saveGainLossThresholdPct
} from '../services/dispatchPacking';

function mapReportRow(row) {
  return {
    packingListId: row.packing_list_id || row.packingListId,
    orderId: row.order_id || row.orderId || '',
    jobName: row.job_name || row.jobName || '',
    clientName: row.client_name || row.clientName || '',
    packingStatus: row.packing_status || row.packingStatus || '',
    fgConsumedKg: Number(row.fg_consumed_kg ?? row.fgConsumedKg) || 0,
    packedNetKg: Number(row.packed_net_kg ?? row.packedNetKg) || 0,
    differenceKg: Number(row.difference_kg ?? row.differenceKg) || 0,
    differencePct: row.difference_pct ?? row.differencePct ?? null,
    thresholdPct: Number(row.threshold_pct ?? row.thresholdPct) || DEFAULT_GAIN_LOSS_THRESHOLD_PCT,
    overThreshold: Boolean(row.over_threshold ?? row.overThreshold),
    alerted: Boolean(row.alerted),
    openedAt: row.opened_at || row.openedAt || null,
    updatedAt: row.updated_at || row.updatedAt || null
  };
}

export function DispatchGainLossSettings() {
  const [value, setValue] = useState(String(DEFAULT_GAIN_LOSS_THRESHOLD_PCT));
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchGainLossThresholdPct()
      .then((stored) => { if (mounted) setValue(String(stored)); })
      .catch(() => { if (mounted) setValue(String(DEFAULT_GAIN_LOSS_THRESHOLD_PCT)); });
    return () => { mounted = false; };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus('');
    try {
      const saved = await saveGainLossThresholdPct(value);
      setValue(String(saved));
      setStatus(`Saved. Admins are alerted when the absolute difference goes over ${saved}%.`);
    } catch (err) {
      setStatus(err?.message || 'The threshold was not saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} data-testid="dispatch-gain-loss-settings" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 18px' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '1rem', color: '#0f172a' }}>Dispatch packing gain/loss alert</h3>
      <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
        The default is 2% because no threshold was specified. Admins are alerted when the absolute gain or loss goes over this share of the FG weight consumed into Dispatch Packing. The comparison is visible to Admin only.
      </p>
      <label htmlFor="gain-loss-threshold" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
        Alert when absolute difference exceeds (%)
      </label>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          id="gain-loss-threshold"
          data-testid="gain-loss-threshold-input"
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          style={{ width: '120px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
        />
        <button type="submit" disabled={saving} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save threshold'}
        </button>
      </div>
      {status && <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: '#0f172a' }}>{status}</p>}
    </form>
  );
}

export default function PackingGainLossReport({ shipments = [], isAdmin = false }) {
  const [rows, setRows] = useState([]);
  const [sourceNote, setSourceNote] = useState('');
  const [thresholdPct, setThresholdPct] = useState(DEFAULT_GAIN_LOSS_THRESHOLD_PCT);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyOver, setOnlyOver] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let mounted = true;
    setLoading(true);
    Promise.all([
      fetchPackingGainLossReport({}).catch(() => null),
      fetchGainLossThresholdPct().catch(() => DEFAULT_GAIN_LOSS_THRESHOLD_PCT)
    ]).then(([remote, threshold]) => {
      if (!mounted) return;
      const nextThreshold = Number(threshold) || DEFAULT_GAIN_LOSS_THRESHOLD_PCT;
      setThresholdPct(nextThreshold);
      if (Array.isArray(remote)) {
        setRows(remote.map(mapReportRow));
        setSourceNote('');
      } else {
        setRows(buildGainLossReport(shipments, { thresholdPct: nextThreshold }));
        setSourceNote('These lists are the ones loaded in this session.');
      }
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [isAdmin, shipments]);

  const filtered = useMemo(() => {
    return buildGainLossReport(rows.map((row) => ({
      dispatchId: row.packingListId,
      orderId: row.orderId,
      jobName: row.jobName,
      clientName: row.clientName,
      packingStatus: row.packingStatus,
      createdAt: row.openedAt,
      updatedAt: row.updatedAt,
      dispatchConsumptions: [{ id: row.packingListId, consumedKg: row.fgConsumedKg }],
      items: [{ netWeightKg: row.packedNetKg, unit: 'Kg' }]
    })), { search, status, from, to, onlyOver, thresholdPct });
  }, [rows, search, status, from, to, onlyOver, thresholdPct]);

  if (!isAdmin) {
    return (
      <div data-testid="dispatch-gain-loss-hidden" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px', color: '#334155' }}>
        Gain and loss figures are limited to Admin.
      </div>
    );
  }

  return (
    <div data-testid="dispatch-gain-loss-report" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <DispatchGainLossSettings />
      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '14px 16px', color: '#9a3412', fontSize: '0.84rem', lineHeight: 1.5 }}>
        The alert threshold defaults to <strong>2%</strong> because no percentage was specified. An Admin can change it above or in System &amp; Document Settings.
        Admins are notified when the absolute difference goes over that percentage after at least one package is saved, or when the packing list is finalised.
        This report lists the running difference for every packing list that has Dispatch Packing consumption. Current threshold: {thresholdPct}%.
        {sourceNote ? ` ${sourceNote}` : ''}
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
          Search
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order, job, packing list" style={{ display: 'block', marginTop: '4px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
        </label>
        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)} style={{ display: 'block', marginTop: '4px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <option value="all">All</option>
            <option value="Open">Open</option>
            <option value="Finalised">Finalised</option>
          </select>
        </label>
        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} style={{ display: 'block', marginTop: '4px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
        </label>
        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} style={{ display: 'block', marginTop: '4px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
        </label>
        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input type="checkbox" checked={onlyOver} onChange={(event) => setOnlyOver(event.target.checked)} />
          Over threshold only
        </label>
      </div>
      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Packing list</th>
              <th>Order</th>
              <th>Job</th>
              <th>Client</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>FG consumed kg</th>
              <th style={{ textAlign: 'right' }}>Packed net kg</th>
              <th style={{ textAlign: 'right' }}>Difference kg</th>
              <th style={{ textAlign: 'right' }}>Difference %</th>
              <th>Opened</th>
              <th>Updated</th>
              <th>Over threshold</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ padding: '24px', textAlign: 'center' }}>Loading gain/loss report…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={12} style={{ padding: '24px', textAlign: 'center' }}>No packing lists match these filters.</td></tr>
            ) : filtered.map((row) => (
              <tr key={row.packingListId}>
                <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{row.packingListId}</td>
                <td>{row.orderId || '—'}</td>
                <td>{row.jobName}</td>
                <td>{row.clientName}</td>
                <td>{row.packingStatus}</td>
                <td style={{ textAlign: 'right' }}>{Number(row.fgConsumedKg).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>{Number(row.packedNetKg).toFixed(2)}</td>
                <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatGainLossKg(row.differenceKg)}</td>
                <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatGainLossPct(row.differencePct)}</td>
                <td>{row.openedAt ? formatPlantDateTime(row.openedAt) : '—'}</td>
                <td>{row.updatedAt ? formatPlantDateTime(row.updatedAt) : '—'}</td>
                <td>{row.overThreshold ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
