/**
 * A save or delete that is not awaited by the screen must still be visible
 * and must be sent to Sentry. Callers pass toast: false when they already
 * show their own alert.
 */

const shownAt = new Map();

export function backgroundFailureMessage(error, context) {
  const detail = error?.message || String(error || 'Unknown error');
  const where = String(context || 'A database change failed').trim();
  return `${where}: ${detail}`;
}

export function showFailureToast(message, { documentRef, now = Date.now() } = {}) {
  const text = String(message || '').trim();
  if (!text) return false;
  const previous = shownAt.get(text) || 0;
  if (previous && now - previous < 8000) return false;
  shownAt.set(text, now);
  const doc = documentRef || (typeof document !== 'undefined' ? document : null);
  if (!doc?.body || typeof doc.createElement !== 'function') return false;
  const toast = doc.createElement('div');
  toast.setAttribute('role', 'alert');
  toast.dataset.backgroundFailure = 'true';
  toast.textContent = text;
  const already = typeof doc.querySelectorAll === 'function'
    ? doc.querySelectorAll('[data-background-failure="true"]').length
    : 0;
  Object.assign(toast.style, {
    position: 'fixed',
    right: '16px',
    bottom: `${16 + already * 72}px`,
    zIndex: '10000',
    maxWidth: '420px',
    padding: '12px 14px',
    borderRadius: '8px',
    background: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecaca',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    font: '600 14px/1.4 system-ui, sans-serif'
  });
  doc.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 8000);
  return true;
}

export function reportBackgroundFailure(error, context, hooks = {}) {
  const message = backgroundFailureMessage(error, context);
  if (hooks.toast !== false) {
    const show = typeof hooks.toast === 'function' ? hooks.toast : showFailureToast;
    show(message);
  }
  const err = error instanceof Error ? error : new Error(message);
  const extra = { context: String(context || ''), message };
  if (typeof hooks.capture === 'function') {
    hooks.capture(err, extra);
    return err;
  }
  import('@sentry/react')
    .then((Sentry) => {
      if (typeof Sentry.captureException === 'function') {
        Sentry.captureException(err, { extra });
      }
    })
    .catch((sentryError) => {
      console.error('Sentry did not receive a background save failure', sentryError);
    });
  return err;
}

export function resetFailureToasts() {
  shownAt.clear();
}
