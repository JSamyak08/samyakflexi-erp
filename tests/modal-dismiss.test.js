import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';
import {
  dismissModal,
  findDismissControl,
  installModalDismissGuard,
  isDirectBackdropTarget,
  listOpenModals,
  registerModalCloser,
  topmostModal,
} from '../src/utils/modalDismiss.js';

const rootDir = path.resolve(import.meta.dirname, '..');

function page() {
  const window = new Window();
  const { document } = window;
  const uninstall = installModalDismissGuard(document);
  return { window, document, uninstall };
}

function fire(window, target, type, extras = {}) {
  const EventCtor = type === 'keydown' ? window.KeyboardEvent : window.MouseEvent;
  const event = new EventCtor(type, { bubbles: true, cancelable: true, ...extras });
  target.dispatchEvent(event);
  return event;
}

test('a click on the backdrop does not run the dialog close handler or take focus', () => {
  const { window, document } = page();
  let closed = 0;
  let childClicked = 0;
  document.body.innerHTML = `
    <div class="modal-overlay" style="z-index: 20">
      <div class="modal-content">
        <input id="invoice" value="INV-2026-606137" />
        <button type="button" id="close">✕ Close</button>
        <button type="button" id="save">Save Packing List</button>
      </div>
    </div>
  `;
  const overlay = document.querySelector('.modal-overlay');
  const input = document.querySelector('#invoice');
  overlay.addEventListener('click', () => { closed += 1; });
  document.querySelector('#save').addEventListener('click', () => { childClicked += 1; });
  input.focus();

  const down = fire(window, overlay, 'mousedown');
  const click = fire(window, overlay, 'click');

  assert.equal(down.defaultPrevented, true);
  assert.equal(click.defaultPrevented, true);
  assert.equal(closed, 0);
  assert.equal(input.value, 'INV-2026-606137');
  assert.equal(document.activeElement, input);

  const fieldDown = fire(window, input, 'mousedown');
  assert.equal(fieldDown.defaultPrevented, false);
  fire(window, document.querySelector('#save'), 'click');
  assert.equal(childClicked, 1);
  assert.equal(closed, 1);
});

test('Escape closes only the topmost dialog, using its Close control', () => {
  const { window, document } = page();
  const closed = [];
  document.body.innerHTML = `
    <div class="modal-overlay" id="lower" style="z-index: 10">
      <div class="modal-content">
        <button type="button" id="lower-close">✕ Close</button>
        <button type="button" id="lower-cancel">Cancel</button>
      </div>
    </div>
    <div class="modal-overlay" id="upper" style="z-index: 40">
      <div class="modal-content">
        <button type="button" id="upper-close">✕ Close</button>
        <button type="button" id="upper-cancel">Cancel</button>
        <button type="button" class="searchable-select-clear" title="Clear selection">
          <svg class="lucide lucide-x"></svg>
        </button>
      </div>
    </div>
  `;
  document.querySelector('#lower-close').addEventListener('click', () => closed.push('lower-close'));
  document.querySelector('#lower-cancel').addEventListener('click', () => closed.push('lower-cancel'));
  document.querySelector('#upper-close').addEventListener('click', () => closed.push('upper-close'));
  document.querySelector('#upper-cancel').addEventListener('click', () => closed.push('upper-cancel'));
  document.querySelector('.searchable-select-clear').addEventListener('click', () => closed.push('clear'));

  assert.equal(topmostModal(document).id, 'upper');
  fire(window, document.body, 'keydown', { key: 'Escape' });
  assert.deepEqual(closed, ['upper-close']);
  document.querySelector('#upper').remove();

  fire(window, document.body, 'keydown', { key: 'Escape' });
  assert.deepEqual(closed, ['upper-close', 'lower-close']);
});

test('Escape prefers a registered closer and leaves an open dropdown alone', () => {
  const { window, document } = page();
  let registered = 0;
  let clicked = 0;
  document.body.innerHTML = `
    <div class="modal-overlay" id="dialog" style="z-index: 5">
      <button type="button" id="close">Close</button>
      <input id="search" />
    </div>
    <div class="menu" id="menu">Menu</div>
  `;
  const dialog = document.querySelector('#dialog');
  registerModalCloser(dialog, () => { registered += 1; });
  document.querySelector('#close').addEventListener('click', () => { clicked += 1; });
  document.querySelector('#search').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.stopPropagation();
  });

  fire(window, document.querySelector('#search'), 'keydown', { key: 'Escape' });
  assert.equal(registered, 0);
  assert.equal(clicked, 0);

  fire(window, document.body, 'keydown', { key: 'Escape' });
  assert.equal(registered, 1);
  assert.equal(clicked, 0);

  let menuClosed = 0;
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#menu')) menuClosed += 1;
  });
  fire(window, document.body, 'click');
  assert.equal(menuClosed, 1);
});

test('icon-only header close is used before a footer Cancel, and a disabled close is skipped', () => {
  const { document } = page();
  document.body.innerHTML = `
    <div class="pdf-modal-overlay" id="scale" style="z-index: 9">
      <div class="scale-card">
        <div>
          <h3>RS-232 Industrial Weighing Scale Terminal</h3>
          <button type="button" id="x">
            <svg class="lucide lucide-x"></svg>
          </button>
        </div>
        <button type="button" id="cancel">Cancel</button>
      </div>
    </div>
    <div data-modal-root data-modal-backdrop id="busy" style="z-index: 3">
      <button type="button" id="busy-close" disabled>Close</button>
      <button type="button" id="busy-cancel" disabled>Cancel</button>
    </div>
  `;
  assert.equal(findDismissControl(document.querySelector('#scale')).id, 'x');
  assert.equal(findDismissControl(document.querySelector('#busy')), null);
  assert.equal(dismissModal(document.querySelector('#busy')), false);
  assert.equal(listOpenModals(document).length, 2);
});

test('Escape can activate a backdrop button that is the only close control', () => {
  const { window, document } = page();
  let closed = 0;
  document.body.innerHTML = `
    <div class="bug-report-layer" style="z-index: 30">
      <button type="button" class="bug-report-backdrop" aria-label="Close bug report"></button>
      <div class="bug-report-dialog">
        <p>Report a Bug</p>
      </div>
    </div>
  `;
  document.querySelector('.bug-report-backdrop').addEventListener('click', () => { closed += 1; });
  fire(window, document.body, 'click');
  const scrim = document.querySelector('.bug-report-backdrop');
  fire(window, scrim, 'click');
  assert.equal(closed, 0);
  fire(window, document.body, 'keydown', { key: 'Escape' });
  assert.equal(closed, 1);
});

test('nested dialogs keep their own close control', () => {
  const { window, document } = page();
  const closed = [];
  document.body.innerHTML = `
    <div class="modal-overlay" id="outer" style="z-index: 10">
      <button type="button" id="outer-close">Close</button>
      <div class="pdf-modal-overlay" id="inner" style="z-index: 80">
        <button type="button" id="inner-close">Close Job Card</button>
      </div>
    </div>
  `;
  document.querySelector('#outer-close').addEventListener('click', () => closed.push('outer'));
  document.querySelector('#inner-close').addEventListener('click', () => closed.push('inner'));
  fire(window, document.body, 'keydown', { key: 'Escape' });
  assert.deepEqual(closed, ['inner']);
  assert.equal(isDirectBackdropTarget(document.querySelector('#outer')), true);
  assert.equal(isDirectBackdropTarget(document.querySelector('#outer-close')), false);
});

test('every full-screen dialog shell is covered by the dismiss guard', () => {
  const srcDir = path.join(rootDir, 'src');
  const allow = new Set([
    path.join(srcDir, 'components', 'Preloader.jsx'),
  ]);
  const misses = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!/\.(jsx|js)$/.test(entry.name)) continue;
      const source = fs.readFileSync(full, 'utf8');
      const pattern = /position:\s*['"]fixed['"][\s\S]{0,500}?(inset:\s*0|top:\s*0)/g;
      let match;
      while ((match = pattern.exec(source))) {
        const around = source.slice(Math.max(0, match.index - 280), match.index + match[0].length);
        const covered = /modal-overlay|pdf-modal-overlay|success-screen-overlay|bug-report-layer|bug-report-backdrop|data-modal-root|data-modal-backdrop/.test(around);
        if (!covered && !allow.has(full)) {
          const line = source.slice(0, match.index).split('\n').length;
          misses.push(`${path.relative(rootDir, full)}:${line}`);
        }
      }
    }
  }

  walk(srcDir);
  assert.deepEqual(misses, []);
});

test('the app installs the guard once and modals do not close from a backdrop onClick', () => {
  const main = fs.readFileSync(path.join(rootDir, 'src', 'main.jsx'), 'utf8');
  const overlay = fs.readFileSync(path.join(rootDir, 'src', 'components', 'ModalOverlay.jsx'), 'utf8');
  assert.match(main, /installModalDismissGuard\(document\)/);
  assert.match(overlay, /useModalDismiss/);
  assert.match(overlay, /delete domProps\.onClick/);
  const selectable = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SearchableSelect.jsx'), 'utf8');
  assert.match(selectable, /e\.key === 'Escape'[\s\S]{0,180}stopPropagation/);
});
