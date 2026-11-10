import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { firstAllowedModule, nextModuleForDeniedTab, roleHasModule } from '../src/bootAccess.js';
import { generateFullRolePermissions } from '../src/factoryStore.js';
import { SYSTEM_ROLES } from '../src/roles.js';
import {
  CHANGELOG_TYPES,
  bugToChangelogEntry,
  filterChangelogEntries,
  formatIst,
  istInputToIso,
  istLocalInput,
  validateChangelogDraft,
} from '../src/utils/changelog.js';

const defaults = generateFullRolePermissions(false);

test('changelog is Admin and Production Manager only', () => {
  assert.equal(roleHasModule(defaults, 'Admin', 'changelog'), true);
  assert.equal(roleHasModule(defaults, 'Production Manager', 'changelog'), true);
  assert.equal(roleHasModule(defaults, ['Store Manager', 'Production Manager'], 'changelog'), true);
  for (const role of SYSTEM_ROLES) {
    if (role === 'Admin' || role === 'Production Manager') continue;
    assert.equal(roleHasModule(defaults, role, 'changelog'), false, role);
  }
  assert.equal(roleHasModule(defaults, [], 'changelog'), false);
  assert.equal(roleHasModule(defaults, 'Production Manager', 'bug_reports'), false);
  assert.notEqual(firstAllowedModule(defaults, 'Production Manager'), 'changelog');
  assert.equal(
    nextModuleForDeniedTab(defaults, 'Store Manager', 'changelog'),
    firstAllowedModule(defaults, 'Store Manager')
  );
  assert.equal(nextModuleForDeniedTab(defaults, 'Printing Operator', 'changelog'), 'printing_scheduler');
  assert.equal(nextModuleForDeniedTab(defaults, 'Plant Manager', 'changelog'), 'dashboard');
});

test('changelog times are shown in IST and the list filters by type and search', () => {
  assert.equal(istLocalInput('2026-11-10T05:13:00Z'), '2026-11-10T10:43');
  assert.equal(istInputToIso('2026-11-10T10:43'), '2026-11-10T05:13:00.000Z');
  assert.equal(istInputToIso('not-a-time'), '');
  assert.match(formatIst('2026-11-09T12:48:54Z'), /09/);
  assert.match(formatIst('2026-11-09T12:48:54Z'), /2026/);
  assert.match(formatIst('2026-11-09T12:48:54Z'), /6:18/);

  const rows = [
    { id: '1', entryType: 'Bug Fixed', title: 'Ready for dispatch', description: 'Finished goods only.', module: 'Dispatch', prNumber: 96 },
    { id: '2', entryType: 'Added', title: 'In-app bug reports', description: 'File a bug from the app.', module: 'Bug Reports', prNumber: 99 },
    { id: '3', entryType: 'Revised', title: 'Newest SFG and FG first', description: 'Newest lots first.', module: 'SFG Store', prNumber: 101 },
  ];
  assert.deepEqual(filterChangelogEntries(rows, { type: 'Bug Fixed' }).map((row) => row.prNumber), [96]);
  assert.deepEqual(filterChangelogEntries(rows, { query: 'sfg' }).map((row) => row.prNumber), [101]);
  assert.deepEqual(filterChangelogEntries(rows, { query: '99' }).map((row) => row.id), ['2']);
  assert.equal(filterChangelogEntries(rows, { type: 'Removed', query: 'dispatch' }).length, 0);
  assert.deepEqual(CHANGELOG_TYPES, ['Added', 'Removed', 'Revised', 'Bug Fixed']);
});

test('a changelog draft needs a title, one line, a type, and an IST time', () => {
  const missing = validateChangelogDraft({ title: '  ', description: '', entryType: 'Nope', implementedAt: '', prNumber: '0' });
  assert.ok(missing.title);
  assert.ok(missing.description);
  assert.ok(missing.entryType);
  assert.ok(missing.implementedAt);
  assert.ok(missing.prNumber);
  const ok = validateChangelogDraft({
    title: 'Ready for dispatch',
    description: 'Counts finished goods only.',
    entryType: 'Bug Fixed',
    implementedAt: '2026-11-09T18:18',
    prNumber: '96',
  });
  assert.deepEqual(ok, {});
  const fromBug = bugToChangelogEntry(
    { id: 'bug-1', title: 'Queue blank', description: 'The queue\nwent blank.', module: 'Printing' },
    'Fixed the blank queue.'
  );
  assert.equal(fromBug.entryType, 'Bug Fixed');
  assert.equal(fromBug.title, 'Queue blank');
  assert.equal(fromBug.description, 'Fixed the blank queue.');
  assert.equal(fromBug.module, 'Printing');
  assert.equal(fromBug.bugReportId, 'bug-1');
  assert.equal(fromBug.description.includes('\n'), false);
});

test('the changelog menu and the resolve action are wired for the right roles', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const screen = fs.readFileSync(new URL('../src/components/BugReportsScreen.jsx', import.meta.url), 'utf8');
  const changelog = fs.readFileSync(new URL('../src/components/ChangelogScreen.jsx', import.meta.url), 'utf8');
  assert.match(app, /isTabAllowed\('changelog'\)/);
  assert.match(app, /testId="changelog-nav"/);
  assert.match(app, /label="Changelog"/);
  assert.match(app, /<ChangelogScreen canEdit=\{userHasRole\(currentUser, 'Admin'\)\} \/>/);
  assert.match(app, /activeTab === 'changelog'/);
  assert.match(screen, /Mark Resolved/);
  assert.match(screen, /data-testid="bug-mark-resolved"/);
  assert.match(screen, /data-testid="bug-mark-in-progress"/);
  assert.match(screen, /data-testid="bug-mark-wont-fix"/);
  assert.match(screen, /data-testid="bug-reopen"/);
  assert.match(screen, /Add to changelog/);
  assert.match(screen, /data-testid="bug-add-to-changelog"/);
  assert.match(screen, /data-testid="bug-report-resolution"/);
  assert.equal(screen.includes('bug-report-save-status'), false);
  assert.match(changelog, /data-testid="changelog-screen"/);
  assert.match(changelog, /data-testid="changelog-type-filter"/);
  assert.match(changelog, /data-testid="changelog-search"/);
  assert.match(changelog, /canEdit &&/);
});
