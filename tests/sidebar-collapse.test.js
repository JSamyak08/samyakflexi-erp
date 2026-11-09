import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  isSidebarCollapseShortcut,
  readSidebarCollapsed,
  sidebarShortcutLabel,
  toggleStoredSidebarCollapsed,
  writeSidebarCollapsed,
} from '../src/utils/sidebarCollapse.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

test('the rail defaults to expanded when nothing is stored', () => {
  const storage = memoryStorage();
  assert.equal(SIDEBAR_COLLAPSED_STORAGE_KEY, 'samyak.sidebar.collapsed');
  assert.equal(readSidebarCollapsed(storage), false);
  assert.equal(readSidebarCollapsed(null), false);
  assert.equal(readSidebarCollapsed({}), false);
});

test('only the canonical collapsed value is treated as collapsed', () => {
  assert.equal(readSidebarCollapsed(memoryStorage({ [SIDEBAR_COLLAPSED_STORAGE_KEY]: 'collapsed' })), true);
  assert.equal(readSidebarCollapsed(memoryStorage({ [SIDEBAR_COLLAPSED_STORAGE_KEY]: ' collapsed ' })), true);
  for (const value of ['expanded', '', 'true', '1', 'false', 'yes']) {
    assert.equal(readSidebarCollapsed(memoryStorage({ [SIDEBAR_COLLAPSED_STORAGE_KEY]: value })), false, value);
  }
});

test('toggle persists collapsed and expanded for the next read', () => {
  const storage = memoryStorage();
  let collapsed = readSidebarCollapsed(storage);
  assert.equal(collapsed, false);

  collapsed = toggleStoredSidebarCollapsed(collapsed, storage);
  assert.equal(collapsed, true);
  assert.equal(storage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY), 'collapsed');
  assert.equal(readSidebarCollapsed(storage), true);

  collapsed = toggleStoredSidebarCollapsed(collapsed, storage);
  assert.equal(collapsed, false);
  assert.equal(storage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY), 'expanded');
  assert.equal(readSidebarCollapsed(storage), false);
});

test('storage failures stay expanded and do not throw', () => {
  const broken = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('quota');
    },
  };
  assert.equal(readSidebarCollapsed(broken), false);
  assert.doesNotThrow(() => writeSidebarCollapsed(true, broken));
  assert.equal(toggleStoredSidebarCollapsed(false, broken), true);
});

test('Ctrl or Cmd plus backslash toggles the rail', () => {
  assert.equal(isSidebarCollapseShortcut({ key: '\\', code: 'Backslash', ctrlKey: true }), true);
  assert.equal(isSidebarCollapseShortcut({ key: '\\', code: 'Backslash', metaKey: true }), true);
  assert.equal(isSidebarCollapseShortcut({ key: 'Unidentified', code: 'Backslash', ctrlKey: true }), true);
  assert.equal(isSidebarCollapseShortcut({ key: '\\', code: 'IntlBackslash', metaKey: true }), true);
});

test('the rail shortcut does not take Alt+B, Ctrl+B, or a plain backslash', () => {
  assert.equal(isSidebarCollapseShortcut({ key: 'b', code: 'KeyB', altKey: true }), false);
  assert.equal(isSidebarCollapseShortcut({ key: 'B', code: 'KeyB', altKey: true }), false);
  assert.equal(isSidebarCollapseShortcut({ key: 'b', code: 'KeyB', ctrlKey: true }), false);
  assert.equal(isSidebarCollapseShortcut({ key: 'B', code: 'KeyB', ctrlKey: true }), false);
  assert.equal(isSidebarCollapseShortcut({ key: 'b', code: 'KeyB', metaKey: true }), false);
  assert.equal(isSidebarCollapseShortcut({ key: '\\', code: 'Backslash' }), false);
  assert.equal(isSidebarCollapseShortcut({ key: '\\', code: 'Backslash', altKey: true }), false);
  assert.equal(isSidebarCollapseShortcut({ key: '\\', code: 'Backslash', ctrlKey: true, altKey: true }), false);
  assert.equal(isSidebarCollapseShortcut({ key: '\\', code: 'Backslash', ctrlKey: true, shiftKey: true }), false);
  assert.equal(isSidebarCollapseShortcut({ key: '\\', code: 'Backslash', ctrlKey: true, repeat: true }), false);
  assert.equal(isSidebarCollapseShortcut(null), false);
});

test('the shortcut hint follows the platform without renaming the chord', () => {
  assert.equal(sidebarShortcutLabel('Mozilla/5.0 (Windows NT 10.0)'), 'Ctrl+\\');
  assert.equal(sidebarShortcutLabel('Mozilla/5.0 (X11; Linux x86_64)'), 'Ctrl+\\');
  assert.equal(sidebarShortcutLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), '⌘\\');
  assert.equal(sidebarShortcutLabel(''), 'Ctrl+\\');
});

test('the shell wires persistence and the shortcut without changing who can see a module', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('id="app-sidebar"');
  const end = app.indexOf('className="main-content"');
  assert.ok(start > 0 && end > start);
  const sidebar = app.slice(start, end);

  assert.match(app, /readSidebarCollapsed\(/);
  assert.match(app, /toggleStoredSidebarCollapsed\(/);
  assert.match(app, /isSidebarCollapseShortcut\(e\)/);
  assert.match(app, /\(e\.altKey \|\| e\.ctrlKey\) && \(e\.key === 'b' \|\| e\.key === 'B'\)/);
  assert.match(sidebar, /aria-expanded=\{!railCollapsed\}/);
  assert.match(sidebar, /aria-controls="app-sidebar"/);
  assert.match(sidebar, /aria-label=\{railCollapsed \? `Expand sidebar \(\$\{shortcutHint\}\)` : `Collapse sidebar \(\$\{shortcutHint\}\)`\}/);
  assert.match(sidebar, /data-sidebar-state=\{railCollapsed \? 'collapsed' : 'expanded'\}/);
  assert.match(sidebar, /railCollapsed \? ' collapsed' : ''/);
  assert.match(app, /data-nav-label=\{label\}/);
  assert.ok((sidebar.match(/label="/g) || []).length >= 20);
  assert.ok((sidebar.match(/data-nav-label=/g) || []).length >= 3);

  const modules = [
    'dashboard', 'sales', 'scrap_analytics', 'job_punching', 'orders', 'job_masters', 'clients',
    'printing_scheduler', 'production_records', 'sfg_store', 'cylinders', 'purchase_orders',
    'inventory', 'ink_management', 'material_indents', 'pellet_fuel', 'barcodes', 'vendors',
    'dispatch', 'employees', 'user_management', 'supabase', 'doc_settings',
  ];
  for (const key of modules) {
    assert.match(sidebar, new RegExp(`isTabAllowed\\('${key}'\\)`), key);
  }
  assert.match(sidebar, /userHasRole\(currentUser, 'Admin'\)/);
  assert.match(sidebar, /userHasRole\(currentUser, 'HR & Payroll Manager'\)/);
  assert.equal(sidebar.includes('railCollapsed ? null'), false);
  assert.equal(sidebar.includes('!railCollapsed &&'), false);
});

test('collapsed rail css frees the main column and leaves the mobile drawer intact', () => {
  const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /\.sidebar\.collapsed\s*\{[^}]*width:\s*72px/s);
  assert.match(css, /\.main-content\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.sidebar-rail-tooltip/);
  assert.match(css, /\.sidebar-collapse-toggle/);
  assert.match(css, /\.hamburger-btn/);
  assert.match(css, /\.sidebar\.open\s*\{[^}]*transform:\s*translateX\(0\)/s);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*\.sidebar-collapse-bar\s*\{[^}]*display:\s*none/);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*\.sidebar\.collapsed\s*\{[^}]*width:\s*280px !important/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sidebar\s*\{[^}]*transition:\s*none/);
});
