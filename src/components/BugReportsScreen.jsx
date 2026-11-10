import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bug, ExternalLink, RefreshCw } from 'lucide-react';
import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  filterBugReports,
} from '../utils/bugReport';
import {
  bugScreenshotUrls,
  listBugReports,
  updateBugReportStatus,
} from '../services/bugReports';
import { saveChangelogEntry } from '../services/changelog';
import { bugToChangelogEntry } from '../utils/changelog';

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
}

function messageFrom(error) {
  return error?.message || 'Bug reports could not be loaded.';
}

export default function BugReportsScreen({ mode = 'mine', onAudit }) {
  const admin = mode === 'admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    status: 'All',
    severity: 'All',
    module: '',
    reporter: '',
    from: '',
    to: '',
  });
  const [selectedId, setSelectedId] = useState('');
  const [shots, setShots] = useState([]);
  const [shotError, setShotError] = useState('');
  const [status, setStatus] = useState('New');
  const [note, setNote] = useState('');
  const [addToChangelog, setAddToChangelog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await listBugReports();
      setRows(list);
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [mode]);

  const visible = useMemo(() => filterBugReports(rows, admin ? filters : {
    status: filters.status,
    severity: filters.severity,
    module: filters.module,
    from: filters.from,
    to: filters.to,
  }), [rows, filters, admin]);

  const selected = visible.find((row) => row.id === selectedId) || rows.find((row) => row.id === selectedId) || null;
  const selectedRef = useRef(null);
  selectedRef.current = selected;

  useEffect(() => {
    const current = selectedRef.current;
    if (!current) {
      setShots([]);
      return undefined;
    }
    setStatus(current.status || 'New');
    setNote(current.resolutionNote || '');
    setAddToChangelog(false);
    setSaveError('');
    setSavedMessage('');
    let cancelled = false;
    setShotError('');
    bugScreenshotUrls(current.screenshotPaths).then((urls) => {
      if (cancelled) return;
      setShots(urls);
      if (urls.some((shot) => !shot.url)) setShotError('One or more screenshots could not be opened.');
    }).catch((err) => {
      if (!cancelled) setShotError(messageFrom(err));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function applyStatus(nextStatus) {
    if (!selected || saving) return;
    setSaving(true);
    setSaveError('');
    setSavedMessage('');
    const previousStatus = selected.status;
    try {
      const updated = await updateBugReportStatus(selected.id, nextStatus, note);
      setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setStatus(updated.status || nextStatus);
      setNote(updated.resolutionNote || '');
      onAudit?.(updated, previousStatus);
      window.dispatchEvent(new CustomEvent('bug-reports-changed'));
      if (nextStatus === 'Resolved' && addToChangelog) {
        try {
          await saveChangelogEntry(bugToChangelogEntry(updated, note));
          setAddToChangelog(false);
          setSavedMessage('Marked resolved and added to the changelog.');
        } catch (err) {
          setSaveError(`Status saved. The changelog entry was not added. ${messageFrom(err)}`);
          return;
        }
      } else if (nextStatus === 'Resolved') {
        setSavedMessage('Marked resolved.');
      } else if (nextStatus === 'New' && (previousStatus === 'Resolved' || previousStatus === "Won't Fix")) {
        setSavedMessage('Reopened.');
      } else {
        setSavedMessage('Status saved.');
      }
    } catch (err) {
      setSaveError(messageFrom(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bug-reports-screen" data-testid={admin ? 'admin-bug-reports' : 'my-bug-reports'}>
      <div className="bug-reports-toolbar">
        <p className="bug-report-lead">
          {admin
            ? 'Every report filed in the plant. Screenshots stay in a private bucket.'
            : 'Reports you have filed, and the status an Admin has set.'}
        </p>
        <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="bug-reports-filters">
        <label>
          Status
          <select value={filters.status} data-testid="bug-filter-status" onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
            <option value="All">All</option>
            {BUG_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Severity
          <select value={filters.severity} data-testid="bug-filter-severity" onChange={(event) => setFilters((prev) => ({ ...prev, severity: event.target.value }))}>
            <option value="All">All</option>
            {BUG_SEVERITIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          Module
          <input value={filters.module} data-testid="bug-filter-module" onChange={(event) => setFilters((prev) => ({ ...prev, module: event.target.value }))} placeholder="Any module" />
        </label>
        {admin && (
          <label>
            Reporter
            <input value={filters.reporter} data-testid="bug-filter-reporter" onChange={(event) => setFilters((prev) => ({ ...prev, reporter: event.target.value }))} placeholder="Name or role" />
          </label>
        )}
        <label>
          From
          <input type="date" value={filters.from} data-testid="bug-filter-from" onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))} />
        </label>
        <label>
          To
          <input type="date" value={filters.to} data-testid="bug-filter-to" onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))} />
        </label>
      </div>

      {error && <p className="bug-report-field-error" role="alert">{error}</p>}
      {loading && <p className="bug-report-hint">Loading reports…</p>}

      <div className="bug-reports-layout">
        <div className="bug-reports-list" data-testid="bug-reports-list">
          {!loading && visible.length === 0 && (
            <p className="bug-report-empty">No bug reports match these filters.</p>
          )}
          {visible.map((row) => (
            <button
              type="button"
              key={row.id}
              className={`bug-reports-row${selected?.id === row.id ? ' active' : ''}`}
              onClick={() => setSelectedId(row.id)}
              data-testid={`bug-report-row-${row.id}`}
            >
              <span className={`bug-severity bug-severity-${row.severity.toLowerCase()}`}>{row.severity}</span>
              <span className="bug-reports-row-copy">
                <strong>{row.title || row.description.slice(0, 80)}</strong>
                <span>{admin ? `${row.reporterName} · ${row.reporterRole}` : row.module || 'General'} · {formatWhen(row.createdAt)}</span>
              </span>
              <span className={`bug-status bug-status-${row.status.replace(/[^a-z]/gi, '').toLowerCase()}`}>{row.status}</span>
            </button>
          ))}
        </div>

        <div className="bug-reports-detail" data-testid="bug-report-detail">
          {!selected && <p className="bug-report-empty">Open a report to see the screenshots, description, and page link.</p>}
          {selected && (
            <>
              <div className="bug-reports-detail-head">
                <Bug size={18} aria-hidden="true" />
                <div>
                  <h2>{selected.title || 'Bug report'}</h2>
                  <p>{selected.reporterName} · {selected.reporterRole} · {formatWhen(selected.createdAt)}</p>
                </div>
                <span className={`bug-status bug-status-${selected.status.replace(/[^a-z]/gi, '').toLowerCase()}`}>{selected.status}</span>
              </div>
              {(selected.resolutionNote || selected.resolvedAt) && !admin && (
                <p className="bug-report-note" data-testid="bug-report-resolution">
                  {selected.resolutionNote && <><strong>Resolution note.</strong> {selected.resolutionNote} </>}
                  {selected.resolvedAt && <span>{selected.status} {formatWhen(selected.resolvedAt)}.</span>}
                </p>
              )}
              {admin && (
                <form className="bug-report-status-form" onSubmit={(event) => event.preventDefault()}>
                  <p className="bug-report-hint">Change the status. Only an Admin can do this.</p>
                  <label className="form-label" htmlFor="bug-report-note">Resolution note</label>
                  <textarea
                    id="bug-report-note"
                    data-testid="bug-report-note"
                    value={note}
                    rows={3}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Optional. What changed, or why this will not be fixed"
                  />
                  <label className="bug-report-check">
                    <input
                      type="checkbox"
                      data-testid="bug-add-to-changelog"
                      checked={addToChangelog}
                      onChange={(event) => setAddToChangelog(event.target.checked)}
                    />
                    Add to changelog
                  </label>
                  {selected.resolvedAt && (
                    <p className="bug-report-hint">Last closed {formatWhen(selected.resolvedAt)}.</p>
                  )}
                  {saveError && <p className="bug-report-field-error" role="alert">{saveError}</p>}
                  {savedMessage && <p className="bug-report-hint" data-testid="bug-status-saved">{savedMessage}</p>}
                  <div className="bug-resolve-actions">
                    <button type="button" className="btn-primary" disabled={saving} data-testid="bug-mark-resolved" onClick={() => applyStatus('Resolved')}>
                      {saving ? 'Saving…' : (status === 'Resolved' ? 'Save note' : 'Mark Resolved')}
                    </button>
                    {status !== 'In Progress' && (
                      <button type="button" className="btn-secondary" disabled={saving} data-testid="bug-mark-in-progress" onClick={() => applyStatus('In Progress')}>
                        In Progress
                      </button>
                    )}
                    {status !== "Won't Fix" && (
                      <button type="button" className="btn-secondary" disabled={saving} data-testid="bug-mark-wont-fix" onClick={() => applyStatus("Won't Fix")}>
                        Won't Fix
                      </button>
                    )}
                    {(status === 'Resolved' || status === "Won't Fix") && (
                      <button type="button" className="btn-secondary" disabled={saving} data-testid="bug-reopen" onClick={() => applyStatus('New')}>
                        Reopen
                      </button>
                    )}
                  </div>
                </form>
              )}
              <p className="bug-report-description">{selected.description}</p>
              <p>
                <a href={selected.pageUrl} target="_blank" rel="noreferrer" data-testid="bug-report-link">
                  {selected.pageUrl} <ExternalLink size={14} aria-hidden="true" />
                </a>
              </p>
              <dl className="bug-report-meta-grid">
                <div><dt>Module</dt><dd>{selected.module || '—'}</dd></div>
                <div><dt>Severity</dt><dd>{selected.severity}</dd></div>
                <div><dt>Status</dt><dd>{selected.status}</dd></div>
                <div><dt>User id</dt><dd>{selected.reporterUserId || '—'}</dd></div>
                <div><dt>Screen</dt><dd>{selected.screenWidth && selected.screenHeight ? `${selected.screenWidth}×${selected.screenHeight}` : '—'}</dd></div>
                <div><dt>App version</dt><dd>{selected.appVersion || '—'}</dd></div>
                <div className="bug-report-meta-wide"><dt>Browser</dt><dd>{selected.userAgent || '—'}</dd></div>
              </dl>
              {shotError && <p className="bug-report-field-error">{shotError}</p>}
              <div className="bug-report-gallery" data-testid="bug-report-gallery">
                {shots.map((shot) => (
                  shot.url
                    ? <a key={shot.path} href={shot.url} target="_blank" rel="noreferrer"><img src={shot.url} alt="Bug screenshot" /></a>
                    : <p key={shot.path} className="bug-report-hint">Screenshot unavailable</p>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
