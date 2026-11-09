/**
 * Manual UI flow against the test Supabase project.
 * Not part of `npm test`. Reads QA logins from BUG_QA_LOGINS (never prints passwords).
 *
 *   BUG_QA_LOGINS=/path/to/test_logins.json node tests/bug-report.flow.mjs
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
const byRole = Object.fromEntries(qa.users.map((user) => [user.role, user]));
fs.mkdirSync(outDir, { recursive: true });

const LONG = 'I opened the printing queue, expected the active job to stay selected, and the screen went blank instead.';
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

async function openForm(page) {
  await page.getByTestId('report-bug-button').click();
  await page.getByTestId('bug-report-form').waitFor();
}

async function pastePng(page) {
  const before = await page.locator('.bug-report-previews img').count();
  await page.evaluate(async (b64) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const file = new File([bytes], 'pasted-screen.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    window.dispatchEvent(event);
  }, png.toString('base64'));
  await page.waitForFunction(
    (count) => document.querySelectorAll('.bug-report-previews img').length > count,
    before,
    { timeout: 10000 }
  );
}

async function rejectCases(page, prefix) {
  await openForm(page);
  await page.getByTestId('bug-report-description').fill(LONG);
  await page.getByTestId('bug-report-submit').click();
  const shotError = page.getByTestId('bug-report-screenshot-error');
  await shotError.waitFor();
  const shotText = await shotError.innerText();
  record(`${prefix} rejects a report with no screenshot`, /screenshot/i.test(shotText), shotText);
  await shot(page, `${prefix}-01-no-screenshot.png`);

  await page.getByTestId('bug-report-file').setInputFiles(pngPath);
  await page.locator('.bug-report-previews img').first().waitFor();
  await page.getByTestId('bug-report-description').fill('Too short');
  await page.getByTestId('bug-report-submit').click();
  const descError = page.getByTestId('bug-report-description-error');
  await descError.waitFor();
  const descText = await descError.innerText();
  record(`${prefix} rejects a short description`, /30/.test(descText), descText);
  await shot(page, `${prefix}-02-short-description.png`);

  await page.getByTestId('bug-report-description').fill(LONG);
  await page.getByTestId('bug-report-page-url').fill('');
  await page.getByTestId('bug-report-submit').click();
  const urlError = page.getByTestId('bug-report-url-error');
  await urlError.waitFor();
  const urlText = await urlError.innerText();
  record(`${prefix} rejects a missing page link`, /required/i.test(urlText), urlText);
  await shot(page, `${prefix}-03-no-link.png`);

  await page.locator('.bug-report-previews button').click();
  await page.locator('.bug-report-previews img').waitFor({ state: 'detached' });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);

try {
  await signIn(page, 'Printing Operator');
  await shot(page, 'print-00-sidebar-expanded.png');
  await page.getByRole('button', { name: /Collapse sidebar/i }).click();
  await page.locator('[data-sidebar-state="collapsed"]').waitFor();
  await shot(page, 'print-00-sidebar-collapsed.png');
  await page.getByRole('button', { name: /Expand sidebar/i }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('report-bug-mobile').waitFor();
  await shot(page, 'print-00-mobile-header.png');
  await page.setViewportSize({ width: 1440, height: 900 });

  await rejectCases(page, 'print');
  await page.getByTestId('bug-report-page-url').fill(`${baseURL}/printing`);
  await page.getByTestId('bug-report-description').fill(LONG);
  await page.getByTestId('bug-report-title').fill('Press queue blank for QA');
  await page.getByTestId('bug-report-capture').click();
  await page.locator('.bug-report-previews img').first().waitFor({ timeout: 30000 });
  await pastePng(page);
  const previews = await page.locator('.bug-report-previews img').count();
  record('printing operator attached a capture and a pasted image', previews >= 2, `${previews} images`);
  await shot(page, 'print-04-ready-to-send.png');
  await page.getByTestId('bug-report-submit').click();
  await page.getByTestId('bug-report-success').waitFor({ timeout: 30000 });
  record('printing operator submitted a valid report', true);
  await shot(page, 'print-05-submitted.png');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByTestId('my-bug-reports-nav').click();
  await page.getByTestId('my-bug-reports').waitFor();
  await page.getByText('Press queue blank for QA').waitFor();
  const mine = (await page.getByTestId('bug-reports-list').innerText()).toLowerCase();
  record('printing operator sees only their own report', mine.includes('press queue blank') && !mine.includes('schedule card overlap'), mine.slice(0, 180));
  await shot(page, 'print-06-my-reports.png');
  await signOut(page);

  await signIn(page, 'Plant Manager');
  await rejectCases(page, 'plant');
  await page.getByTestId('bug-report-page-url').fill(`${baseURL}/dashboard`);
  await page.getByTestId('bug-report-description').fill(LONG);
  await page.getByTestId('bug-report-title').fill('Schedule card overlap for QA');
  await page.getByTestId('bug-report-capture').click();
  await page.locator('.bug-report-previews img').first().waitFor({ timeout: 30000 });
  await pastePng(page);
  await page.getByTestId('bug-report-submit').click();
  await page.getByTestId('bug-report-success').waitFor({ timeout: 30000 });
  record('plant manager submitted a valid report', true);
  await shot(page, 'plant-04-submitted.png');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByTestId('my-bug-reports-nav').click();
  await page.getByText('Schedule card overlap for QA').waitFor();
  const plantList = (await page.getByTestId('bug-reports-list').innerText()).toLowerCase();
  record(
    'plant manager sees only their own report',
    plantList.includes('schedule card overlap') && !plantList.includes('press queue blank'),
    plantList.slice(0, 180)
  );
  await shot(page, 'plant-05-my-reports.png');
  await signOut(page);

  await signIn(page, 'Admin');
  await page.locator('.nav-item', { hasText: 'Bug Reports' }).click();
  await page.getByTestId('admin-bug-reports').waitFor();
  await page.getByText('Press queue blank for QA').waitFor();
  await page.getByText('Schedule card overlap for QA').waitFor();
  record('admin sees both reports', true);
  await shot(page, 'admin-01-all-reports.png');
  await page.getByText('Press queue blank for QA').click();
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="bug-report-gallery"] img');
    return image && image.complete && image.naturalWidth > 200;
  }, null, { timeout: 20000 });
  const images = await page.getByTestId('bug-report-gallery').locator('img').count();
  const link = await page.getByTestId('bug-report-link').getAttribute('href');
  record('admin opened the report and saw screenshots', images >= 1 && /^https?:\/\//.test(link || ''), `${images} images`);
  await shot(page, 'admin-02-report-open.png');
  await page.getByTestId('bug-report-status').selectOption('In Progress');
  await page.getByTestId('bug-report-note').fill('Reproduced on the printing queue during QA.');
  await page.getByTestId('bug-report-save-status').click();
  await page.locator('.bug-reports-row.active .bug-status').filter({ hasText: 'In Progress' }).waitFor();
  record('admin changed the status', true);
  await shot(page, 'admin-03-status-changed.png');

  const supabase = createClient(qa.project_url, qa.anon_key);
  const anonRead = await supabase.from('bug_reports').select('id');
  record('anonymous client cannot read bug reports', Boolean(anonRead.error) || (anonRead.data || []).length === 0, anonRead.error?.message || `rows ${anonRead.data?.length}`);

  const press = byRole['Printing Operator'];
  const pressAuth = await supabase.auth.signInWithPassword({ email: press.email, password: press.password });
  if (pressAuth.error) throw pressAuth.error;
  const pressRows = await supabase.from('bug_reports').select('title, reporter_role, screenshot_paths');
  const pressTitles = (pressRows.data || []).map((row) => row.title);
  record('printing operator API returns only their row', pressTitles.includes('Press queue blank for QA') && !pressTitles.includes('Schedule card overlap for QA'), pressTitles.join(', '));
  const ownPath = pressRows.data?.find((row) => row.title === 'Press queue blank for QA')?.screenshot_paths?.[0];
  const ownUrl = await supabase.storage.from('bug-screenshots').createSignedUrl(ownPath, 60);
  record('printing operator can sign their own screenshot', Boolean(ownUrl.data?.signedUrl), ownUrl.error?.message || 'signed');

  const plant = byRole['Plant Manager'];
  const plantAuth = await supabase.auth.signInWithPassword({ email: plant.email, password: plant.password });
  if (plantAuth.error) throw plantAuth.error;
  const stolen = await supabase.storage.from('bug-screenshots').createSignedUrl(ownPath, 60);
  record('plant manager cannot sign the operator screenshot', !stolen.data?.signedUrl, stolen.error?.message || 'unexpected signed url');
  const plantRows = await supabase.from('bug_reports').select('title');
  record('plant manager API returns only their row', (plantRows.data || []).every((row) => row.title !== 'Press queue blank for QA'), (plantRows.data || []).map((row) => row.title).join(', '));
  await supabase.auth.signOut();
} catch (error) {
  record('flow threw', false, error?.message || String(error));
  try { await shot(page, 'flow-failure.png'); } catch { /* page may be closed */ }
} finally {
  await browser.close();
  const failed = results.filter((row) => !row.pass);
  fs.writeFileSync(path.join(outDir, 'bug-report-flow-results.json'), JSON.stringify({ results }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}
