import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  CHANGELOG_TYPES,
  filterChangelogEntries,
  formatIst,
  istInputToIso,
  istLocalInput,
  validateChangelogDraft,
} from '../utils/changelog';
import { listChangelogEntries, saveChangelogEntry } from '../services/changelog';

function emptyDraft() {
  return {
    id: '',
    implementedAt: istLocalInput(new Date().toISOString()),
    entryType: 'Added',
    title: '',
    description: '',
    prNumber: '',
    module: '',
  };
}

function messageFrom(error) {
  return error?.message || 'The changelog could not be loaded.';
}

export default function ChangelogScreen({ canEdit = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState('All');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(await listChangelogEntries());
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(
    () => filterChangelogEntries(rows, { type, query }),
    [rows, type, query]
  );

  function editRow(row) {
    setSaveError('');
    setFieldErrors({});
    setDraft({
      id: row.id,
      implementedAt: istLocalInput(row.implementedAt),
      entryType: row.entryType,
      title: row.title,
      description: row.description,
      prNumber: row.prNumber ? String(row.prNumber) : '',
      module: row.module || '',
    });
  }

  async function save(event) {
    event.preventDefault();
    const errors = validateChangelogDraft(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    setSaveError('');
    try {
      const saved = await saveChangelogEntry({
        ...draft,
        implementedAtIso: istInputToIso(draft.implementedAt),
      });
      setRows((prev) => {
        const next = prev.some((row) => row.id === saved.id)
          ? prev.map((row) => (row.id === saved.id ? saved : row))
          : [saved, ...prev];
        return next.sort((a, b) => new Date(b.implementedAt) - new Date(a.implementedAt));
      });
      setDraft(emptyDraft());
    } catch (err) {
      setSaveError(messageFrom(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="changelog-screen" data-testid="changelog-screen">
      <div className="bug-reports-toolbar">
        <p className="bug-report-lead">What has shipped. Times are India Standard Time.</p>
        <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {canEdit && (
        <form className="changelog-editor" data-testid="changelog-editor" onSubmit={save}>
          <label>
            When (IST)
            <input
              type="datetime-local"
              className="no-capitalize"
              data-testid="changelog-when"
              value={draft.implementedAt}
              onChange={(event) => setDraft((prev) => ({ ...prev, implementedAt: event.target.value }))}
            />
          </label>
          <label>
            Type
            <select
              data-testid="changelog-entry-type"
              value={draft.entryType}
              onChange={(event) => setDraft((prev) => ({ ...prev, entryType: event.target.value }))}
            >
              {CHANGELOG_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Title
            <input
              data-testid="changelog-title"
              value={draft.title}
              maxLength={160}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>
          <label className="changelog-editor-wide">
            Description
            <input
              data-testid="changelog-description"
              value={draft.description}
              maxLength={400}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <label>
            PR
            <input
              className="no-capitalize"
              data-testid="changelog-pr"
              inputMode="numeric"
              value={draft.prNumber}
              onChange={(event) => setDraft((prev) => ({ ...prev, prNumber: event.target.value }))}
              placeholder="Optional"
            />
          </label>
          <label>
            Module
            <input
              data-testid="changelog-module"
              value={draft.module}
              maxLength={80}
              onChange={(event) => setDraft((prev) => ({ ...prev, module: event.target.value }))}
              placeholder="Optional"
            />
          </label>
          <div className="changelog-editor-actions">
            {fieldErrors.implementedAt && <p className="bug-report-field-error">{fieldErrors.implementedAt}</p>}
            {fieldErrors.title && <p className="bug-report-field-error">{fieldErrors.title}</p>}
            {fieldErrors.description && <p className="bug-report-field-error">{fieldErrors.description}</p>}
            {fieldErrors.prNumber && <p className="bug-report-field-error">{fieldErrors.prNumber}</p>}
            {saveError && <p className="bug-report-field-error" role="alert">{saveError}</p>}
            <button type="submit" className="btn-primary" disabled={saving} data-testid="changelog-save">
              {saving ? 'Saving…' : (draft.id ? 'Save changes' : 'Add entry')}
            </button>
            {draft.id && (
              <button type="button" className="btn-secondary" onClick={() => { setDraft(emptyDraft()); setFieldErrors({}); }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="changelog-filters">
        <label>
          Type
          <select data-testid="changelog-type-filter" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="All">All</option>
            {CHANGELOG_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="changelog-search">
          Search
          <input
            data-testid="changelog-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title, description, module, or PR"
          />
        </label>
      </div>

      {error && <p className="bug-report-field-error" role="alert">{error}</p>}
      {loading && <p className="bug-report-hint">Loading changelog…</p>}
      {!loading && visible.length === 0 && <p className="bug-report-empty">No changelog entries match.</p>}

      {!loading && visible.length > 0 && (
        <div className="changelog-table-wrap">
          <table className="data-table changelog-table" data-testid="changelog-table">
            <thead>
              <tr>
                <th>When (IST)</th>
                <th>Type</th>
                <th>Title</th>
                <th>Description</th>
                <th>PR</th>
                <th>Module</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} data-testid={`changelog-row-${row.prNumber || row.id}`}>
                  <td className="no-capitalize">{formatIst(row.implementedAt)}</td>
                  <td><span className={`changelog-type changelog-type-${row.entryType.replace(/\s+/g, '-').toLowerCase()}`}>{row.entryType}</span></td>
                  <td>{row.title}</td>
                  <td>{row.description}</td>
                  <td className="no-capitalize">{row.prNumber ? `#${row.prNumber}` : '—'}</td>
                  <td>{row.module || '—'}</td>
                  {canEdit && (
                    <td>
                      <button type="button" className="btn-secondary" data-testid={`changelog-edit-${row.prNumber || row.id}`} onClick={() => editRow(row)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
