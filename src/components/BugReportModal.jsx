import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bug, Camera, ImagePlus, X } from 'lucide-react';
import {
  BUG_SEVERITIES,
  DESCRIPTION_PLACEHOLDER,
  MAX_SCREENSHOTS,
  bugReportShortcutLabel,
  collectBugMetadata,
  draftHasErrors,
  isBugReportLayer,
  moduleLabelForTab,
  prepareBugImage,
  validateBugReportDraft,
} from '../utils/bugReport';
import { submitBugReport } from '../services/bugReports';

function messageFrom(error) {
  const text = error?.message || error?.error_description || String(error || 'The report was not saved.');
  if (/description/i.test(text) && /check|30|length/i.test(text)) {
    return 'Describe the bug in at least 30 characters.';
  }
  if (/page_url|page link|url/i.test(text) && /check|null|empty/i.test(text)) {
    return 'Page link is required.';
  }
  if (/screenshot/i.test(text)) return 'Add at least one screenshot.';
  return text;
}

export default function BugReportModal({
  open,
  onClose,
  currentUser,
  activeTab,
  appVersion = '',
  onSubmitted,
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [severity, setSeverity] = useState('Medium');
  const [shots, setShots] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [savedId, setSavedId] = useState('');
  const fileRef = useRef(null);
  const descriptionRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setTitle('');
    setDescription('');
    setPageUrl(typeof window !== 'undefined' ? window.location.href : '');
    setModuleName(moduleLabelForTab(activeTab));
    setSeverity('Medium');
    setShots([]);
    setErrors({});
    setFormError('');
    setSavedId('');
    const focusTimer = window.setTimeout(() => descriptionRef.current?.focus(), 30);
    return () => window.clearTimeout(focusTimer);
  }, [open, activeTab]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape' && !saving) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, saving]);

  useEffect(() => {
    if (!open) return undefined;
    const onPaste = (event) => {
      const items = Array.from(event.clipboardData?.items || []);
      const files = items
        .filter((item) => item.kind === 'file' && String(item.type || '').startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (!files.length) return;
      event.preventDefault();
      addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  if (!open || typeof document === 'undefined') return null;

  async function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    setFormError('');
    const prepared = [];
    const problems = [];
    for (const file of incoming) {
      try {
        const image = await prepareBugImage(file);
        prepared.push({
          file: image,
          preview: URL.createObjectURL(image),
          name: image.name || file.name || 'screenshot',
        });
      } catch (err) {
        problems.push(messageFrom(err));
      }
    }
    setShots((prev) => {
      const room = MAX_SCREENSHOTS - prev.length;
      if (room <= 0) {
        prepared.forEach((shot) => URL.revokeObjectURL(shot.preview));
        problems.unshift(`You can attach up to ${MAX_SCREENSHOTS} screenshots.`);
        return prev;
      }
      if (prepared.length > room) {
        prepared.slice(room).forEach((shot) => URL.revokeObjectURL(shot.preview));
        problems.unshift(`You can attach up to ${MAX_SCREENSHOTS} screenshots.`);
      }
      return [...prev, ...prepared.slice(0, room)];
    });
    setErrors((prev) => ({ ...prev, screenshots: problems[0] || '' }));
  }

  function removeShot(index) {
    setShots((prev) => {
      const target = prev[index];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function captureScreen() {
    if (shots.length >= MAX_SCREENSHOTS) {
      setErrors((prev) => ({ ...prev, screenshots: `You can attach up to ${MAX_SCREENSHOTS} screenshots.` }));
      return;
    }
    setCapturing(true);
    setFormError('');
    try {
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
      });
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(document.body, {
        ignoreElements: (element) => isBugReportLayer(element),
        backgroundColor: '#f8fafc',
        scale: 1,
        logging: false,
        useCORS: true,
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The screen capture was empty. Upload a screenshot instead.');
      const file = new File([blob], `screen-${Date.now()}.png`, { type: 'image/png' });
      await addFiles([file]);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        screenshots: messageFrom(err) || 'Screen capture failed. Upload or paste a screenshot instead.',
      }));
    } finally {
      setCapturing(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    const nextErrors = validateBugReportDraft({
      description,
      pageUrl,
      screenshots: shots,
    });
    setErrors(nextErrors);
    setFormError('');
    if (draftHasErrors(nextErrors)) return;
    setSaving(true);
    try {
      const metadata = collectBugMetadata({
        user: currentUser,
        userAgent: navigator.userAgent,
        screenWidth: window.screen?.width,
        screenHeight: window.screen?.height,
        appVersion,
        pageUrl: pageUrl.trim(),
        moduleLabel: moduleName.trim(),
      });
      const saved = await submitBugReport({
        title,
        description,
        pageUrl,
        module: moduleName,
        severity,
        images: shots.map((shot) => shot.file),
        metadata,
      });
      setSavedId(saved?.id || '');
      onSubmitted?.(saved);
    } catch (err) {
      setFormError(messageFrom(err));
    } finally {
      setSaving(false);
    }
  }

  const shortcut = bugReportShortcutLabel();

  return createPortal(
    <div className="bug-report-layer" data-bug-report-layer="true" data-capturing={capturing ? 'true' : 'false'}>
      <button type="button" className="bug-report-backdrop" aria-label="Close bug report" onClick={() => !saving && onClose?.()} />
      <div
        className="bug-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
        data-testid="bug-report-form"
      >
        <div className="bug-report-dialog-head">
          <div className="bug-report-dialog-title">
            <Bug size={18} aria-hidden="true" />
            <h2 id="bug-report-title">Report a Bug</h2>
          </div>
          <button type="button" className="bug-report-close" onClick={() => !saving && onClose?.()} aria-label="Close" disabled={saving}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {savedId ? (
          <div className="bug-report-success" data-testid="bug-report-success">
            <p>Your report was sent. You can follow its status under My Bug Reports.</p>
            <p className="bug-report-meta">Reference {savedId}</p>
            <div className="bug-report-actions">
              <button type="button" className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="bug-report-form" noValidate>
            <p className="bug-report-lead">
              Filed as {currentUser?.name || 'you'} ({currentUser?.role || 'signed-in user'}). Shortcut {shortcut}.
            </p>

            <label className="form-label" htmlFor="bug-report-screenshots">
              Screenshots <span className="bug-report-required">required</span>
            </label>
            <div className="bug-report-shot-actions" id="bug-report-screenshots">
              <button type="button" className="btn-secondary" onClick={captureScreen} disabled={saving || capturing} data-testid="bug-report-capture">
                <Camera size={16} aria-hidden="true" />
                {capturing ? 'Capturing…' : 'Capture current screen'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={saving}>
                <ImagePlus size={16} aria-hidden="true" />
                Upload
              </button>
              <span className="bug-report-hint">PNG, JPG, or WebP. Up to 5 images, 5 MB each. Paste with Ctrl+V.</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              multiple
              hidden
              data-testid="bug-report-file"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            {shots.length > 0 && (
              <ul className="bug-report-previews">
                {shots.map((shot, index) => (
                  <li key={shot.preview}>
                    <img src={shot.preview} alt={shot.name || `Screenshot ${index + 1}`} />
                    <button type="button" onClick={() => removeShot(index)} aria-label={`Remove screenshot ${index + 1}`}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {errors.screenshots && <p className="bug-report-field-error" data-testid="bug-report-screenshot-error">{errors.screenshots}</p>}

            <label className="form-label" htmlFor="bug-report-description">
              Detailed description <span className="bug-report-required">required</span>
            </label>
            <textarea
              id="bug-report-description"
              ref={descriptionRef}
              className="bug-report-textarea"
              data-testid="bug-report-description"
              placeholder={DESCRIPTION_PLACEHOLDER}
              value={description}
              minLength={30}
              required
              rows={5}
              onChange={(event) => {
                setDescription(event.target.value);
                setErrors((prev) => ({ ...prev, description: '' }));
              }}
            />
            <p className="bug-report-hint">{description.trim().length} / 30 characters minimum. {DESCRIPTION_PLACEHOLDER}</p>
            {errors.description && <p className="bug-report-field-error" data-testid="bug-report-description-error">{errors.description}</p>}

            <label className="form-label" htmlFor="bug-report-page-url">
              Page link where the bug exists <span className="bug-report-required">required</span>
            </label>
            <input
              id="bug-report-page-url"
              className="bug-report-input"
              data-testid="bug-report-page-url"
              type="url"
              required
              value={pageUrl}
              onChange={(event) => {
                setPageUrl(event.target.value);
                setErrors((prev) => ({ ...prev, pageUrl: '' }));
              }}
            />
            {errors.pageUrl && <p className="bug-report-field-error" data-testid="bug-report-url-error">{errors.pageUrl}</p>}

            <div className="bug-report-optional-grid">
              <div>
                <label className="form-label" htmlFor="bug-report-title">Title</label>
                <input
                  id="bug-report-title"
                  className="bug-report-input"
                  data-testid="bug-report-title"
                  value={title}
                  maxLength={160}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Optional short summary"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="bug-report-severity">Severity</label>
                <select
                  id="bug-report-severity"
                  className="bug-report-input"
                  data-testid="bug-report-severity"
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value)}
                >
                  {BUG_SEVERITIES.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="bug-report-module">Module</label>
                <input
                  id="bug-report-module"
                  className="bug-report-input"
                  data-testid="bug-report-module"
                  value={moduleName}
                  onChange={(event) => setModuleName(event.target.value)}
                />
              </div>
            </div>

            {formError && <p className="bug-report-field-error" role="alert" data-testid="bug-report-form-error">{formError}</p>}

            <div className="bug-report-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving || capturing} data-testid="bug-report-submit">
                {saving ? 'Sending…' : 'Submit bug report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
