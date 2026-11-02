import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Download, FileSpreadsheet } from 'lucide-react';
import { fetchPrintMachineRunIdle } from '../services/printRun';
import { buildPrintMachineUtilization } from '../utils/printMachineUtilization';
import { formatDurationMinutes, formatIstStamp, istToday, rangeForView } from '../utils/printingShifts';
import { downloadPrintUtilizationPdf, downloadPrintUtilizationWorkbook } from '../utils/printUtilizationExport';

const PAGE_SIZE = 8;

function minutesLabel(minutes) {
  return formatDurationMinutes(minutes);
}

export default function PrintRunAnalytics({ machines = [], allowed = false }) {
  const [mode, setMode] = useState('daily');
  const [anchorDate, setAnchorDate] = useState(() => istToday());
  const [fromDate, setFromDate] = useState(() => istToday());
  const [toDate, setToDate] = useState(() => istToday());
  const [machineId, setMachineId] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const range = useMemo(() => rangeForView({
    mode,
    anchorDate,
    fromDate,
    toDate
  }), [mode, anchorDate, fromDate, toDate]);

  useEffect(() => {
    if (!allowed) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    fetchPrintMachineRunIdle({
      rangeStart: new Date(range.start).toISOString(),
      rangeEnd: new Date(range.end).toISOString(),
      asOf: new Date().toISOString()
    }).then((payload) => {
      if (!active) return;
      setReport(buildPrintMachineUtilization({
        runs: payload?.runs || [],
        rangeStart: range.start,
        rangeEnd: range.end,
        asOf: payload?.asOf || new Date().toISOString(),
        shifts: payload?.shifts,
        machines,
        machineId
      }));
    }).catch((err) => {
      if (!active) return;
      setReport(null);
      setError(err?.message || 'The run and idle report could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [allowed, range.start, range.end, machineId, machines]);

  useEffect(() => { setPage(0); }, [mode, anchorDate, fromDate, toDate, machineId]);

  if (!allowed) {
    return (
      <div className="glass-panel" data-screen="print-run-analytics-denied" style={{ padding: '28px' }}>
        <h3 style={{ marginTop: 0 }}>Run and idle time is limited</h3>
        <p style={{ color: '#64748b' }}>Admin, Plant Manager, and Production Manager can open this report.</p>
      </div>
    );
  }

  const segments = report?.segments || [];
  const pageCount = Math.max(1, Math.ceil(segments.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = segments.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const meta = { mode, label: range.label, fromDate: range.fromDate, toDate: range.toDate };
  const timelineStart = range.start;
  const timelineSpan = Math.max(1, range.end - range.start);
  const showTimeline = mode === 'daily' && segments.length > 0 && timelineSpan <= 36 * 60 * 60 * 1000;

  return (
    <div data-screen="print-run-analytics" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-panel" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} /> Printing machine run and idle
            </h3>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.84rem', maxWidth: '760px' }}>
              Times are IST. Running time is each print run from start to end. An open run counts up to now.
              Idle time is the gap after one run ends until the next run starts on the same machine.
              A run or gap that crosses a shift or midnight is split. Time before the first run and after the last run is not idle.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <button type="button" className="btn-secondary" disabled={!report} onClick={() => downloadPrintUtilizationWorkbook(report, meta)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button type="button" className="btn-secondary" disabled={!report} onClick={() => downloadPrintUtilizationPdf(report, meta)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Download size={16} /> PDF
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px', alignItems: 'end' }}>
          {['daily', 'weekly', 'monthly', 'custom'].map((item) => (
            <button key={item} type="button" className={mode === item ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode(item)}>
              {item === 'daily' ? 'Daily' : item === 'weekly' ? 'Weekly' : item === 'monthly' ? 'Monthly' : 'Custom'}
            </button>
          ))}
          {mode === 'custom' ? (
            <>
              <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>From
                <input className="form-control" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </label>
              <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>To
                <input className="form-control" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              </label>
            </>
          ) : (
            <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
              {mode === 'monthly' ? 'Month' : 'Date'}
              <input className="form-control" type={mode === 'monthly' ? 'month' : 'date'} value={mode === 'monthly' ? anchorDate.slice(0, 7) : anchorDate} onChange={(event) => setAnchorDate(mode === 'monthly' ? `${event.target.value}-01` : event.target.value)} />
            </label>
          )}
          <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
            Machine
            <select className="form-control" value={machineId} onChange={(event) => setMachineId(event.target.value)}>
              <option value="">All printing machines</option>
              {(machines || []).map((machine) => (
                <option key={machine.id} value={machine.id}>{machine.name || machine.id}</option>
              ))}
            </select>
          </label>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: '#334155', fontWeight: 700 }}>{range.label} · downloads include every row, not only this page</p>
      </div>

      {loading && <div className="glass-panel" style={{ padding: '16px' }}>Loading run and idle time…</div>}
      {error && <div className="glass-panel" role="alert" style={{ padding: '16px', color: '#991b1b', background: '#fef2f2' }}>{error}</div>}

      {report && !error && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
            {[
              ['Run', minutesLabel(report.runMinutes), `${report.runPercent}%`],
              ['Idle', minutesLabel(report.idleMinutes), `${report.idlePercent}%`],
              ['Runs', String(report.runCount), ''],
              ['Idle gaps', String(report.gapCount), report.longestIdle ? `Longest ${minutesLabel(report.longestIdle.durationMinutes)}` : 'None']
            ].map(([label, value, extra]) => (
              <div key={label} className="glass-panel" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>{value}</div>
                {extra && <div style={{ fontSize: '0.78rem', color: '#475569' }}>{extra}</div>}
              </div>
            ))}
          </div>

          {report.overlap && (
            <div className="glass-panel" style={{ padding: '12px 16px', background: '#fffbeb', color: '#92400e', fontSize: '0.84rem' }}>
              Some runs overlap on the same machine. They were left open. End the extra run so the press has one timeline. Overlapping runs are counted separately.
            </div>
          )}

          <div className="glass-panel" style={{ padding: '16px 18px' }}>
            <h4 style={{ margin: '0 0 12px' }}>Run versus idle</h4>
            {(report.machines.length ? report.machines : [{ machineLabel: 'No recorded time', runMinutes: 0, idleMinutes: 0, runPercent: 0, idlePercent: 0, runCount: 0 }]).map((machine) => {
              const total = machine.runMinutes + machine.idleMinutes;
              const runWidth = total > 0 ? (machine.runMinutes / total) * 100 : 0;
              return (
                <div key={machine.machineLabel} style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                    <span>{machine.machineLabel}</span>
                    <span>{machine.runCount || 0} runs · {machine.runPercent || 0}% run / {machine.idlePercent || 0}% idle</span>
                  </div>
                  <div style={{ display: 'flex', height: '14px', borderRadius: '999px', overflow: 'hidden', background: '#e2e8f0', marginTop: '4px' }}>
                    <div style={{ width: `${runWidth}%`, background: '#0284c7' }} />
                    <div style={{ width: `${Math.max(0, 100 - runWidth)}%`, background: '#f59e0b' }} />
                  </div>
                </div>
              );
            })}
            {report.shifts.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                {report.shifts.map((shift) => (
                  <span key={shift.shiftId} style={{ fontSize: '0.75rem', fontWeight: 700, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '999px', padding: '4px 10px' }}>
                    {shift.shiftName}: {minutesLabel(shift.runMinutes)} run · {minutesLabel(shift.idleMinutes)} idle
                  </span>
                ))}
              </div>
            )}
          </div>

          {showTimeline && (
            <div className="glass-panel" style={{ padding: '16px 18px' }}>
              <h4 style={{ margin: '0 0 10px' }}>Day timeline</h4>
              {report.machines.map((machine) => (
                <div key={`tl-${machine.machineLabel}`} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, marginBottom: '4px' }}>{machine.machineLabel}</div>
                  <div style={{ position: 'relative', height: '28px', background: '#f1f5f9', borderRadius: '6px' }}>
                    {segments.filter((segment) => segment.machineLabel === machine.machineLabel).map((segment, index) => {
                      const start = new Date(segment.start).getTime();
                      const end = new Date(segment.end).getTime();
                      const left = ((start - timelineStart) / timelineSpan) * 100;
                      const width = Math.max(0.4, ((end - start) / timelineSpan) * 100);
                      return (
                        <div
                          key={`${segment.kind}-${segment.start}-${index}`}
                          title={`${segment.kind} ${formatIstStamp(segment.start)}–${formatIstStamp(segment.end)}`}
                          style={{
                            position: 'absolute',
                            left: `${left}%`,
                            width: `${width}%`,
                            top: '4px',
                            bottom: '4px',
                            borderRadius: '4px',
                            background: segment.kind === 'run' ? '#0284c7' : '#f59e0b'
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
                <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
              </div>
            </div>
          )}

          <div className="glass-panel" style={{ padding: '8px 12px', overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Kind</th>
                  <th>Shift</th>
                  <th>Job / gap</th>
                  <th>Order</th>
                  <th>Operator</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={9}>No runs or idle gaps in this range.</td></tr>
                )}
                {visible.map((segment, index) => (
                  <tr key={`${segment.kind}-${segment.start}-${segment.orderId}-${index}`}>
                    <td>{segment.machineLabel}</td>
                    <td>{segment.kind === 'idle' ? 'Idle' : 'Run'}</td>
                    <td>{segment.shiftName}</td>
                    <td>{segment.jobName}</td>
                    <td>{segment.orderId}</td>
                    <td>{segment.operatorName || '—'}</td>
                    <td>{formatIstStamp(segment.start)}</td>
                    <td>{formatIstStamp(segment.end)}{segment.open ? ' (open)' : ''}</td>
                    <td>{minutesLabel(segment.durationMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', fontSize: '0.8rem' }}>
              <span>{segments.length} rows · page {safePage + 1} of {pageCount}</span>
              <span style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn-secondary" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
                <button type="button" className="btn-secondary" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
