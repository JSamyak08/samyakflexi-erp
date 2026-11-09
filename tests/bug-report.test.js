import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { firstAllowedModule, nextModuleForDeniedTab, roleHasModule } from '../src/bootAccess.js';
import { generateFullRolePermissions } from '../src/factoryStore.js';
import { isSidebarCollapseShortcut } from '../src/utils/sidebarCollapse.js';
import {
  BUG_STATUSES,
  DESCRIPTION_PLACEHOLDER,
  MAX_SCREENSHOT_BYTES,
  bugReportShortcutLabel,
  bugScreenshotPath,
  collectBugMetadata,
  dataUrlToFile,
  draftHasErrors,
  filterBugReports,
  imageRejectionReason,
  isBugReportLayer,
  isBugReportShortcut,
  isValidPageUrl,
  moduleLabelForTab,
  normalizeImageMime,
  screenshotPathOwnedBy,
  validateBugReportDraft,
} from '../src/utils/bugReport.js';

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const defaults = generateFullRolePermissions(false);

test('Alt+Shift+R reports a bug and leaves Alt+B and Ctrl+backslash alone', () => {
  assert.equal(bugReportShortcutLabel(), 'Alt+Shift+R');
  assert.equal(isBugReportShortcut({ key: 'r', code: 'KeyR', altKey: true, shiftKey: true }), true);
  assert.equal(isBugReportShortcut({ key: 'R', code: 'KeyR', altKey: true, shiftKey: true }), true);
  assert.equal(isBugReportShortcut({ key: 'Unidentified', code: 'KeyR', altKey: true, shiftKey: true }), true);
  assert.equal(isBugReportShortcut({ key: 'b', code: 'KeyB', altKey: true }), false);
  assert.equal(isBugReportShortcut({ key: 'b', code: 'KeyB', altKey: true, shiftKey: true }), false);
  assert.equal(isBugReportShortcut({ key: 'r', code: 'KeyR', altKey: true }), false);
  assert.equal(isBugReportShortcut({ key: 'r', code: 'KeyR', ctrlKey: true, shiftKey: true }), false);
  assert.equal(isBugReportShortcut({ key: '\\', code: 'Backslash', ctrlKey: true }), false);
  assert.equal(isBugReportShortcut({ key: '\\', code: 'Backslash', metaKey: true }), false);
  assert.equal(isBugReportShortcut({ key: 'r', code: 'KeyR', altKey: true, shiftKey: true, repeat: true }), false);
  assert.equal(isBugReportShortcut(null), false);
  assert.equal(isSidebarCollapseShortcut({ key: 'r', code: 'KeyR', altKey: true, shiftKey: true }), false);
  assert.equal(isSidebarCollapseShortcut({ key: 'b', code: 'KeyB', altKey: true }), false);
});

test('a draft needs a screenshot, a 30 character description, and a real page link', () => {
  assert.equal(DESCRIPTION_PLACEHOLDER.includes('what you expected'), true);
  const missing = validateBugReportDraft({ description: 'too short', pageUrl: '', screenshots: [] });
  assert.ok(missing.screenshots);
  assert.ok(missing.description);
  assert.ok(missing.pageUrl);
  assert.equal(draftHasErrors(missing), true);

  const badLink = validateBugReportDraft({
    description: 'I started the press, expected the queue to open, and the screen stayed blank.',
    pageUrl: 'not a url',
    screenshots: [{}],
  });
  assert.equal(badLink.pageUrl.includes('valid'), true);
  assert.equal(draftHasErrors({ description: 'x' }), true);

  const ok = validateBugReportDraft({
    description: 'I started the press, expected the queue to open, and the screen stayed blank.',
    pageUrl: 'https://erp.example.test/printing',
    screenshots: [{ name: 'shot.png' }],
  });
  assert.deepEqual(ok, {});
  assert.equal(isValidPageUrl('http://localhost:5173/printing?tab=queue'), true);
  assert.equal(isValidPageUrl('ftp://files.example.test/a'), false);
  assert.equal(isValidPageUrl('https://'), false);
});

test('screenshots are png, jpg, or webp and stay under the caller account', () => {
  assert.equal(normalizeImageMime('image/jpg', 'x.bin'), 'image/jpeg');
  assert.equal(normalizeImageMime('', 'press.PNG'), 'image/png');
  assert.equal(normalizeImageMime('image/gif', 'anim.gif'), '');
  assert.equal(imageRejectionReason({ type: 'image/gif', name: 'a.gif', size: 10 }), 'Use a PNG, JPG, or WebP image.');
  assert.equal(imageRejectionReason({ type: 'image/png', name: 'a.png', size: MAX_SCREENSHOT_BYTES + 1 }).includes('5 MB'), true);
  assert.equal(imageRejectionReason({ type: 'image/webp', name: 'a.webp', size: 20 }), '');

  const uid = '11111111-1111-4111-8111-111111111111';
  const path = bugScreenshotPath(uid, '22222222-2222-4222-8222-222222222222', 1, 'image/png');
  assert.equal(path, `${uid}/22222222-2222-4222-8222-222222222222/1.png`);
  assert.equal(screenshotPathOwnedBy(path, uid), true);
  assert.equal(screenshotPathOwnedBy(`${uid}/../secret/1.png`, uid), false);
  assert.equal(screenshotPathOwnedBy(`other/${uid}/1.png`, uid), false);
  assert.equal(bugScreenshotPath(uid, 'report', 6, 'image/png'), '');
});

test('metadata and list filters keep the reporter, route, and status', () => {
  assert.equal(moduleLabelForTab('printing_scheduler'), 'Printing Scheduler');
  assert.equal(moduleLabelForTab('unknown'), '');
  const meta = collectBugMetadata({
    user: { id: 'USR-1', name: 'Flexi Print', role: 'Printing Operator' },
    userAgent: 'TestBrowser',
    screenWidth: 1280.4,
    screenHeight: 720,
    appVersion: 'flexierp@test',
    pageUrl: 'https://erp.example.test/printing',
    moduleLabel: 'Printing Scheduler',
    capturedAt: '2026-11-09T12:00:00.000Z',
  });
  assert.equal(meta.reporterUserId, 'USR-1');
  assert.equal(meta.reporterRole, 'Printing Operator');
  assert.equal(meta.screenWidth, 1280);
  assert.equal(meta.appVersion, 'flexierp@test');

  const rows = [
    { id: '1', status: 'New', severity: 'High', module: 'Printing Scheduler', reporterName: 'Flexi Print', reporterRole: 'Printing Operator', reporterUserId: 'USR-1', createdAt: '2026-11-09T08:00:00.000Z' },
    { id: '2', status: 'Resolved', severity: 'Low', module: 'Inventory, GRN & QC', reporterName: 'Plant Lead', reporterRole: 'Plant Manager', reporterUserId: 'USR-2', createdAt: '2026-11-01T08:00:00.000Z' },
  ];
  assert.deepEqual(filterBugReports(rows, { status: 'New', reporter: 'print' }).map((row) => row.id), ['1']);
  assert.deepEqual(filterBugReports(rows, { module: 'inventory', from: '2026-11-01', to: '2026-11-02' }).map((row) => row.id), ['2']);
  assert.equal(BUG_STATUSES.includes("Won't Fix"), true);
});

test('a captured data url becomes an image file the uploader can send', () => {
  const file = dataUrlToFile(TINY_PNG, 'screen.png', 'image/png');
  assert.equal(file.type, 'image/png');
  assert.equal(file.size > 20, true);
  assert.equal(file.name, 'screen.png');
  assert.throws(() => dataUrlToFile('hello', 'x.png'), /base64/);
});

test('the report layer is the only part of the page a capture should skip', () => {
  const layer = {
    hasAttribute(name) { return name === 'data-bug-report-layer'; },
    closest() { return null; },
  };
  const child = { closest: (selector) => (selector === '[data-bug-report-layer]' ? layer : null) };
  const page = { closest: () => null, hasAttribute: () => false };
  assert.equal(isBugReportLayer(layer), true);
  assert.equal(isBugReportLayer(child), true);
  assert.equal(isBugReportLayer(page), false);
});

test('every signed-in role can open their own reports and only Admin opens the queue', () => {
  for (const role of ['Printing Operator', 'Shop Floor Operator', 'Plant Manager']) {
    assert.equal(roleHasModule(defaults, role, 'my_bug_reports'), true);
    assert.equal(roleHasModule(defaults, role, 'bug_reports'), false);
    assert.notEqual(firstAllowedModule(defaults, role), 'my_bug_reports');
    assert.notEqual(firstAllowedModule(defaults, role), 'bug_reports');
  }
  assert.equal(firstAllowedModule(defaults, 'Printing Operator'), 'printing_scheduler');
  assert.equal(nextModuleForDeniedTab(defaults, 'Printing Operator', 'bug_reports'), 'printing_scheduler');
  assert.equal(roleHasModule(defaults, 'Admin', 'bug_reports'), true);
  assert.equal(roleHasModule(defaults, 'Admin', 'my_bug_reports'), true);
  assert.equal(roleHasModule(defaults, [], 'my_bug_reports'), false);
});

test('the shell shows Report a Bug outside the role-gated module list', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('id="app-sidebar"');
  const nav = app.indexOf('className="nav-links"', start);
  const quick = app.slice(start, nav);
  assert.match(quick, /Report a Bug/);
  assert.match(quick, /data-testid="report-bug-button"/);
  assert.match(quick, /data-testid="my-bug-reports-nav"/);
  assert.equal(quick.includes('isTabAllowed'), false);
  assert.match(app, /data-testid="report-bug-mobile"/);
  assert.match(app, /isBugReportShortcut\(e\)/);
  assert.match(app, /label="Bug Reports"/);
  assert.match(app, /activeTab === 'my_bug_reports'/);
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261109140000_bug_reports.sql', import.meta.url), 'utf8');
  assert.match(sql, /'bug-screenshots'/);
  assert.match(sql, /bug_reports_description_len/);
  assert.match(sql, /bug_reports_page_url_nonempty/);
  assert.match(sql, /bug_reports_screenshot_required/);
  assert.equal(sql.includes('erp-files'), false);
});
