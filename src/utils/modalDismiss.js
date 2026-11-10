/**
 * Dialog dismiss rules for every in-app pop-up.
 *
 * A click on the backdrop does not close the dialog and does not move focus.
 * Escape closes only the topmost dialog, using the same action as its Close
 * control. Menus, dropdowns, and tooltips are not dialogs and are left alone.
 */

const installed = new WeakMap();

export const MODAL_ROOT_SELECTOR = [
  '.modal-overlay',
  '.pdf-modal-overlay',
  '.success-screen-overlay',
  '.bug-report-layer',
  '[data-modal-root]',
].join(', ');

export const BACKDROP_SELECTOR = [
  '.modal-overlay',
  '.pdf-modal-overlay',
  '.success-screen-overlay',
  '.bug-report-backdrop',
  '[data-modal-backdrop]',
].join(', ');

const closers = new WeakMap();
let syntheticDismiss = false;

function elementNode(node) {
  return node && node.nodeType === 1 ? node : null;
}

export function normalizeLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function isCloseLabel(value) {
  const text = normalizeLabel(value).replace(/[✕×✗]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (/^close\b/i.test(text) && text.length <= 48) return true;
  return false;
}

export function isDismissText(value) {
  const text = normalizeLabel(value).replace(/[✕×✗]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 0;
  if (isCloseLabel(text)) return 80;
  if (/^back to\b/i.test(text)) return 65;
  if (/^edit\s*&\s*review\b/i.test(text)) return 65;
  if (/^done$/i.test(text)) return 55;
  if (/^cancel$/i.test(text)) return 45;
  return 0;
}

export function isBackdropElement(node) {
  const el = elementNode(node);
  if (!el || typeof el.matches !== 'function') return false;
  return el.matches(BACKDROP_SELECTOR);
}

export function isDirectBackdropTarget(target) {
  return isBackdropElement(target);
}

function viewOf(node) {
  return node?.ownerDocument?.defaultView || null;
}

function isShown(el) {
  if (!el || !el.isConnected) return false;
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
  const view = viewOf(el);
  if (!view || typeof view.getComputedStyle !== 'function') return true;
  let current = el;
  while (current && current.nodeType === 1) {
    const style = view.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    current = current.parentElement;
  }
  return true;
}

function zIndexOf(el) {
  const view = viewOf(el);
  const raw = view?.getComputedStyle ? view.getComputedStyle(el).zIndex : el.style?.zIndex;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function listOpenModals(doc = globalThis.document) {
  if (!doc?.querySelectorAll) return [];
  return [...doc.querySelectorAll(MODAL_ROOT_SELECTOR)].filter(isShown);
}

export function topmostModal(doc = globalThis.document) {
  const open = listOpenModals(doc);
  if (!open.length) return null;
  return open.slice().sort((a, b) => {
    const dz = zIndexOf(a) - zIndexOf(b);
    if (dz !== 0) return dz;
    const position = a.compareDocumentPosition(b);
    if (position & 4) return -1;
    if (position & 2) return 1;
    return 0;
  }).at(-1);
}

export function owningModal(node) {
  const el = elementNode(node);
  if (!el || typeof el.closest !== 'function') return null;
  return el.closest(MODAL_ROOT_SELECTOR);
}

export function registerModalCloser(element, onClose) {
  if (!element || typeof onClose !== 'function') return () => {};
  closers.set(element, onClose);
  return () => {
    if (closers.get(element) === onClose) closers.delete(element);
  };
}

function elementChildren(el) {
  return [...(el?.children || [])];
}

function accessibleName(button) {
  return normalizeLabel(
    button.getAttribute('aria-label')
    || button.getAttribute('title')
    || ''
  );
}

function buttonText(button) {
  return normalizeLabel(button.textContent || '');
}

function isDisabled(button) {
  return Boolean(button.disabled)
    || button.getAttribute('aria-disabled') === 'true'
    || button.getAttribute('data-modal-dismiss') === 'false';
}

function isUnsafeSubmit(button) {
  if (button.hasAttribute('data-modal-dismiss')) return false;
  const type = (button.getAttribute('type') || '').toLowerCase();
  if (type === 'submit') return true;
  if (type === 'button' || type === 'reset') return false;
  return Boolean(button.closest?.('form'));
}

function isCloseIcon(button) {
  const svgs = [...button.querySelectorAll('svg')];
  return svgs.some((svg) => /\blucide-x\b/.test(svg.getAttribute('class') || ''));
}

function isBareCloseIcon(button) {
  if (isDisabled(button)) return false;
  if (button.classList.contains('searchable-select-clear')) return false;
  const name = accessibleName(button);
  if (name && !isCloseLabel(name)) return false;
  const text = buttonText(button).replace(/[✕×✗]/g, '').trim();
  if (text) return false;
  return isCloseIcon(button);
}

function dialogCard(root) {
  return elementChildren(root).find((el) => {
    if (el.tagName === 'STYLE') return false;
    if (typeof el.matches === 'function' && el.matches(BACKDROP_SELECTOR) && el !== root) return false;
    return true;
  }) || null;
}

function headerCloseIcon(root) {
  const card = dialogCard(root);
  const header = card ? elementChildren(card).find((el) => el.tagName !== 'STYLE') : null;
  const scopes = [header, ...root.querySelectorAll('.modal-header, .modal-header-bar, .bug-report-dialog-head')];
  for (const scope of scopes) {
    if (!scope) continue;
    const icons = [...scope.querySelectorAll('button, [role="button"]')]
      .filter((button) => owningModal(button) === root && isBareCloseIcon(button));
    if (icons.length === 1) return icons[0];
  }
  return null;
}

function scoreControl(control, root) {
  if (!control || isDisabled(control) || isUnsafeSubmit(control)) return 0;
  if (owningModal(control) !== root) return 0;
  if (control.hasAttribute('data-modal-dismiss')) return 100;
  if (control.classList.contains('modal-close-btn') || control.classList.contains('bug-report-close')) return 95;
  if (isCloseLabel(accessibleName(control))) return 90;
  const textScore = isDismissText(buttonText(control));
  if (textScore) return textScore;
  if (headerCloseIcon(root) === control) return 85;
  return 0;
}

export function findDismissControl(root) {
  if (!root) return null;
  const marked = [...root.querySelectorAll('[data-modal-dismiss]')];
  const buttons = [...root.querySelectorAll('button, [role="button"]')];
  const seen = new Set();
  const controls = [];
  for (const control of [...marked, ...buttons]) {
    if (seen.has(control)) continue;
    seen.add(control);
    controls.push(control);
  }
  let best = null;
  let bestScore = 0;
  for (const control of controls) {
    const score = scoreControl(control, root);
    if (score > bestScore) {
      best = control;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

export function dismissModal(root) {
  if (!root) return false;
  const registered = closers.get(root);
  if (typeof registered === 'function') {
    registered();
    return true;
  }
  const control = findDismissControl(root);
  if (!control) return false;
  // The click guard ignores backdrop clicks. A dismiss control that is itself
  // the backdrop (the bug-report scrim) must still receive this click.
  syntheticDismiss = true;
  try {
    control.click();
  } finally {
    syntheticDismiss = false;
  }
  return true;
}

export function isPlainEscape(event) {
  if (!event || event.key !== 'Escape') return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.isComposing) return false;
  if (event.defaultPrevented) return false;
  return true;
}

export function swallowBackdropEvent(event) {
  if (syntheticDismiss) return false;
  if (!isDirectBackdropTarget(event?.target)) return false;
  // Mouse-down is cancelled so the backdrop does not take focus. Touch scrolling
  // of a scrollable dialog shell stays intact; the click is still swallowed.
  const pointerType = event.pointerType;
  const isTouch = pointerType === 'touch' || pointerType === 'pen';
  if (!isTouch && event.type !== 'click') event.preventDefault();
  if (event.type === 'click') event.preventDefault();
  event.stopPropagation();
  return true;
}

export function dismissTopmostOnEscape(event, doc = event?.target?.ownerDocument || globalThis.document) {
  if (!isPlainEscape(event)) return false;
  const root = topmostModal(doc);
  if (!root) return false;
  const closed = dismissModal(root);
  if (!closed) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

export function installModalDismissGuard(doc = globalThis.document) {
  if (!doc?.addEventListener) return () => {};
  const existing = installed.get(doc);
  if (existing) return existing;

  const swallow = (event) => {
    swallowBackdropEvent(event);
  };
  const onKey = (event) => {
    dismissTopmostOnEscape(event, doc);
  };

  doc.addEventListener('pointerdown', swallow, true);
  doc.addEventListener('mousedown', swallow, true);
  doc.addEventListener('click', swallow, true);
  doc.addEventListener('keydown', onKey, false);

  const uninstall = () => {
    doc.removeEventListener('pointerdown', swallow, true);
    doc.removeEventListener('mousedown', swallow, true);
    doc.removeEventListener('click', swallow, true);
    doc.removeEventListener('keydown', onKey, false);
    installed.delete(doc);
  };
  installed.set(doc, uninstall);
  return uninstall;
}
