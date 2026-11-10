/**
 * UI flow against the test Supabase project only.
 * Not part of `npm test`. Reads QA logins from BUG_QA_LOGINS and never prints passwords.
 *
 *   BUG_QA_LOGINS=/path/to/test_logins.json node tests/resolve-changelog.flow.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

const loginsPath = process.env.BUG_QA_LOGINS;
const baseURL = process.env.BUG_QA_BASE_URL || 'http://127.0.0.1:5173';
const outDir = process.env.BUG_QA_OUT || '/opt/cursor/artifacts';
if (!loginsPath) {
  console.error('BUG_QA_LOGINS is required');
  process.exit(1);
}
const qa = JSON.parse(fs.readFileSync(loginsPath, 'utf8'));
const TEST_HOST = 'awtjvrhpoyzjwrfumhip.supabase.co';
if (!String(qa.project_url || '').includes(TEST_HOST) || String(qa.project_id) !== 'awtjvrhpoyzjwrfumhip') {
  console.error('Refusing to run against a non-test Supabase project');
  process.exit(1);
}
const byRole = Object.fromEntries(qa.users.map((user) => [user.role, user]));
fs.mkdirSync(outDir, { recursive: true });

const LONG = 'I opened the printing queue, expected the active job to stay selected, and the screen went blank instead.';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const bugTitle = `Resolve check ${stamp}`;
const note = 'Queue selection is restored after the fix.';
const results = [];

function record(step, pass, detail = '') {
  results.push({ step, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64'
);
const pngPath = path.join(outDir, 'sample-bug.png');
fs.writeFileSync(pngPath, png);

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function signIn(page, role) {
  const user = byRole[role];
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole('button', { name: /Sign In to Dashboard/i }).click();
  await page.getByTestId('report-bug-button').waitFor({ state: 'visible', timeout: 120000 });
}

async function signOut(page) {
  await page.getByRole('button', { name: 'Logout User Session' }).click();
  await page.locator('input[type="email"]').waitFor({ timeout: 30000 });
}

async function clientFor(role) {
  const user = byRole[role];
  const client = createClient(qa.project_url, qa.anon_key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (auth.error) throw auth.error;
  return { client, userId: auth.data.user.id };
}

async function changelogDenied(role) {
  const { client } = await clientFor(role);
  const read = await client.from('changelog_entries').select('id');
  const visible = (read.data || []).length;
  record(`${role} API cannot read the changelog`, !read.error && visible === 0, read.error?.message || `rows ${visible}`);
  const write = await client.from('changelog_entries').insert({
    implemented_at: new Date().toISOString(),
    entry_type: 'Bug Fixed',
    title: 'Should not save',
    description: 'A non-admin must not insert a changelog row.',
  }).select('id');
  record(
    `${role} API cannot insert a changelog entry`,
    Boolean(write.error) || (write.data || []).length === 0,
    write.error?.code || write.error?.message || `rows ${(write.data || []).length}`
  );
  await client.auth.signOut();
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on('request', (request) => {
  const url = request.url();
  if (url.includes('supabase.co') && !url.includes(TEST_HOST)) {
    throw new Error('Blocked a request to a non-test Supabase project');
  }
});

try {
  await signIn(page, 'Printing Operator');
  const operatorChangelog = await page.getByTestId('changelog-nav').count();
  const operatorTriage = await page.locator('#app-sidebar .nav-label', { hasText: /^Bug Reports$/ }).count();
  record('printing operator does not see Changelog or Bug Reports', operatorChangelog === 0 && operatorTriage === 0, `changelog ${operatorChangelog} triage ${operatorTriage}`);
  await page.getByTestId('report-bug-button').click();
  await page.getByTestId('bug-report-form').waitFor();
  await page.getByTestId('bug-report-file').setInputFiles(pngPath);
  await page.locator('.bug-report-previews img').first().waitFor();
  await page.getByTestId('bug-report-title').fill(bugTitle);
  await page.getByTestId('bug-report-description').fill(LONG);
  await page.getByTestId('bug-report-page-url').fill(`${baseURL}/printing`);
  await page.getByTestId('bug-report-submit').click();
  await page.getByTestId('bug-report-success').waitFor({ timeout: 30000 });
  record('printing operator filed a sample bug', true);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.goto(`${baseURL}/changelog`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/printing/, { timeout: 120000 });
  const operatorScreen = await page.getByTestId('changelog-screen').count();
  record('printing operator route /changelog is denied', operatorScreen === 0 && page.url().includes('/printing'), page.url());
  await shot(page, 'operator-changelog-denied.png');
  const operatorClient = await clientFor('Printing Operator');
  const own = await operatorClient.client.from('bug_reports').select('id, status, title').eq('title', bugTitle).maybeSingle();
  record('printing operator can read their new report', own.data?.status === 'New', own.error?.message || own.data?.status || 'missing');
  const earlyUpdate = await operatorClient.client.from('bug_reports').update({ status: 'Resolved', resolution_note: 'no' }).eq('id', own.data.id).select('id');
  record('printing operator API cannot change status before admin does', (earlyUpdate.data || []).length === 0, earlyUpdate.error?.message || `rows ${(earlyUpdate.data || []).length}`);
  await operatorClient.client.auth.signOut();
  await changelogDenied('Printing Operator');
  await signOut(page);

  await signIn(page, 'Plant Manager');
  const plantNav = await page.getByTestId('changelog-nav').count();
  record('plant manager does not see Changelog', plantNav === 0, `count ${plantNav}`);
  await shot(page, 'plant-no-changelog-nav.png');
  await page.goto(`${baseURL}/changelog`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/dashboard/, { timeout: 120000 });
  record('plant manager route /changelog is denied', (await page.getByTestId('changelog-screen').count()) === 0, page.url());
  await changelogDenied('Plant Manager');
  await signOut(page);

  await signIn(page, 'Shop Floor Operator');
  record('shop floor operator does not see Changelog', (await page.getByTestId('changelog-nav').count()) === 0);
  await page.goto(`${baseURL}/changelog`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/printing/, { timeout: 120000 });
  record('shop floor operator route /changelog is denied', (await page.getByTestId('changelog-screen').count()) === 0, page.url());
  await changelogDenied('Shop Floor Operator');
  await signOut(page);

  await signIn(page, 'Admin');
  const adminNav = await page.getByTestId('changelog-nav').count();
  record('admin sees Changelog', adminNav === 1, `count ${adminNav}`);
  await page.locator('#app-sidebar .nav-item').filter({ has: page.locator('.nav-label', { hasText: /^Bug Reports$/ }) }).click();
  await page.getByTestId('admin-bug-reports').waitFor();
  await page.getByText(bugTitle).click();
  await page.getByTestId('bug-mark-resolved').waitFor();
  const resolveActions = await page.getByTestId('bug-mark-resolved').innerText();
  record('admin has a Mark Resolved action', /mark resolved/i.test(resolveActions), resolveActions);
  await page.getByTestId('bug-report-note').fill(note);
  await page.getByTestId('bug-add-to-changelog').check();
  await shot(page, 'admin-mark-resolved.png');
  await page.getByTestId('bug-mark-resolved').click();
  await page.getByTestId('bug-status-saved').waitFor({ timeout: 30000 });
  await page.locator('.bug-reports-row.active .bug-status').filter({ hasText: 'Resolved' }).waitFor();
  record('admin marked the bug resolved', true);
  await shot(page, 'admin-bug-resolved.png');

  const admin = await clientFor('Admin');
  const saved = await admin.client.from('bug_reports').select('id, status, resolution_note, resolved_by, resolved_at, reporter_role').eq('title', bugTitle).maybeSingle();
  record('database row is Resolved with the note', saved.data?.status === 'Resolved' && saved.data?.resolution_note === note, saved.error?.message || saved.data?.status || 'missing');
  record('database row stamps resolved_by and resolved_at', saved.data?.resolved_by === admin.userId && Boolean(saved.data?.resolved_at), saved.data?.resolved_by ? 'stamped' : 'missing stamp');
  const linked = await admin.client.from('changelog_entries').select('entry_type, title, description, bug_report_id').eq('bug_report_id', saved.data.id).maybeSingle();
  record('resolved bug added a Bug Fixed changelog entry', linked.data?.entry_type === 'Bug Fixed' && linked.data?.title === bugTitle && linked.data?.description === note, linked.error?.message || linked.data?.entry_type || 'missing');

  await page.getByTestId('changelog-nav').click();
  await page.getByTestId('changelog-screen').waitFor();
  await page.getByTestId('changelog-editor').waitFor();
  await page.getByTestId('changelog-search').fill('mass balance');
  await page.getByTestId('changelog-row-103').waitFor();
  const topTime = await page.locator('[data-testid="changelog-table"] tbody tr').first().innerText();
  record('admin changelog search finds the mass balance fix', /consume mass balance/i.test(await page.getByTestId('changelog-table').innerText()), 'row 103 visible');
  await page.getByTestId('changelog-type-filter').selectOption('Bug Fixed');
  await page.getByTestId('changelog-search').fill('Ready for dispatch');
  await page.getByTestId('changelog-row-96').waitFor();
  record('admin can filter the changelog by type', /ready for dispatch/i.test(await page.getByTestId('changelog-table').innerText()));
  await page.getByTestId('changelog-search').fill(bugTitle);
  await page.getByText(note).waitFor();
  record('admin sees the bug-fixed entry created from Mark Resolved', true);
  await shot(page, 'admin-changelog.png');
  const removed = await admin.client.from('changelog_entries').delete().eq('bug_report_id', saved.data.id).select('id');
  record('admin can delete the changelog entry they added', !removed.error && (removed.data || []).length === 1, removed.error?.message || `rows ${(removed.data || []).length}`);
  await admin.client.auth.signOut();
  await signOut(page);

  await signIn(page, 'Printing Operator');
  await page.getByTestId('my-bug-reports-nav').click();
  await page.getByTestId('my-bug-reports').waitFor();
  await page.getByText(bugTitle).click();
  await page.getByTestId('bug-report-resolution').waitFor();
  const resolution = await page.getByTestId('bug-report-resolution').innerText();
  const noResolve = await page.getByTestId('bug-mark-resolved').count();
  record('reporter sees Resolved and the note', /resolved/i.test(resolution) && resolution.includes(note), resolution.slice(0, 180));
  record('reporter has no Mark Resolved control', noResolve === 0, `count ${noResolve}`);
  await shot(page, 'operator-sees-resolved.png');
  const after = await clientFor('Printing Operator');
  const hijack = await after.client.from('bug_reports').update({ status: 'New', resolution_note: 'hijacked' }).eq('id', saved.data.id).select('id, status');
  const still = await after.client.from('bug_reports').select('status, resolution_note').eq('id', saved.data.id).maybeSingle();
  record('printing operator API still cannot change status', (hijack.data || []).length === 0 && still.data?.status === 'Resolved' && still.data?.resolution_note === note, hijack.error?.message || still.data?.status || 'changed');
  await after.client.auth.signOut();
  await signOut(page);

  await signIn(page, 'Production Manager');
  record('production manager sees Changelog', (await page.getByTestId('changelog-nav').count()) === 1);
  await page.getByTestId('changelog-nav').click();
  await page.getByTestId('changelog-screen').waitFor();
  const editor = await page.getByTestId('changelog-editor').count();
  record('production manager cannot add or edit from the screen', editor === 0, `editor ${editor}`);
  await page.getByTestId('changelog-search').fill('103');
  await page.getByTestId('changelog-row-103').waitFor();
  await shot(page, 'production-manager-changelog.png');
  const prod = await clientFor('Production Manager');
  const prodRead = await prod.client.from('changelog_entries').select('id', { count: 'exact', head: true });
  record('production manager API can read the changelog', !prodRead.error && Number(prodRead.count) >= 96, prodRead.error?.message || `count ${prodRead.count}`);
  const prodWrite = await prod.client.from('changelog_entries').insert({
    implemented_at: new Date().toISOString(),
    entry_type: 'Added',
    title: 'Should not save',
    description: 'Production Manager is read only.',
  }).select('id');
  record('production manager API cannot insert', Boolean(prodWrite.error) || (prodWrite.data || []).length === 0, prodWrite.error?.code || prodWrite.error?.message || 'inserted');
  const prodStatus = await prod.client.from('bug_reports').update({ status: 'New' }).eq('id', saved.data.id).select('id');
  record('production manager API cannot change bug status', (prodStatus.data || []).length === 0, prodStatus.error?.message || `rows ${(prodStatus.data || []).length}`);
  await prod.client.auth.signOut();
} catch (error) {
  record('flow threw', false, error?.message || String(error));
  try { await shot(page, 'resolve-flow-failure.png'); } catch { /* page may be closed */ }
} finally {
  await browser.close();
  const failed = results.filter((row) => !row.pass);
  fs.writeFileSync(path.join(outDir, 'resolve-changelog-flow-results.json'), JSON.stringify({ bugTitle, results }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}
