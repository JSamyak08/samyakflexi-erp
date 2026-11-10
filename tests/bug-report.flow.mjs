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
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const printTitle = `Press queue blank ${stamp}`;
const plantTitle = `Schedule card overlap ${stamp}`;
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

async function assertBugPlacement(page, name) {
  const reportButtons = page.getByTestId('report-bug-button');
  const count = await reportButtons.count();
  record(`${name} shows one Report a Bug button`, count === 1, `count ${count}`);
  const headerCopies = await page.getByTestId('report-bug-mobile').count();
  record(`${name} has no header or extra bug button`, headerCopies === 0, `header ${headerCopies}`);
  const button = await reportButtons.boundingBox();
  const nav = await page.locator('#app-sidebar .nav-links').boundingBox();
  const sidebar = await page.locator('#app-sidebar').boundingBox();
  const belowNav = Boolean(button && nav && button.y >= nav.y + nav.height - 2);
  const aboveFooter = Boolean(button && sidebar && button.y + button.height <= sidebar.y + sidebar.height - 8);
  const pinnedLow = Boolean(button && sidebar && button.y > sidebar.y + sidebar.height * 0.55);
  record(
    `${name} pins Report a Bug at the bottom of the menu`,
    belowNav && aboveFooter && pinnedLow,
    `y ${Math.round(button?.y || 0)} navBottom ${Math.round((nav?.y || 0) + (nav?.height || 0))} sidebarBottom ${Math.round((sidebar?.y || 0) + (sidebar?.height || 0))}`
  );
}

async function captureRail(page, prefix) {
  await assertBugPlacement(page, `${prefix} expanded`);
  await shot(page, `${prefix}-expanded.png`);
  await page.getByRole('button', { name: /Collapse sidebar/i }).click();
  await page.locator('[data-sidebar-state="collapsed"]').waitFor();
  await assertBugPlacement(page, `${prefix} collapsed`);
  await page.getByTestId('report-bug-button').hover();
  const tip = page.locator('.sidebar-rail-tooltip');
  await tip.waitFor();
  const tipText = await tip.innerText();
  record(`${prefix} collapsed icon shows the Report a Bug tooltip`, /Report a Bug/i.test(tipText), tipText);
  await shot(page, `${prefix}-collapsed.png`);
  await page.getByRole('button', { name: /Expand sidebar/i }).click();
  await page.locator('[data-sidebar-state="expanded"]').waitFor();
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

const TEST_HOST = 'awtjvrhpoyzjwrfumhip.supabase.co';
if (!String(qa.project_url || '').includes(TEST_HOST)) {
  console.error('Refusing to run against a non-test Supabase project');
  process.exit(1);
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
  const operatorTriage = await page.locator('#app-sidebar .nav-label', { hasText: /^Bug Reports$/ }).count();
  record('printing operator does not see the admin triage item', operatorTriage === 0, `count ${operatorTriage}`);
  await captureRail(page, 'print');

  await page.setViewportSize({ width: 390, height: 844 });
  record('mobile header has no duplicate bug button', (await page.getByTestId('report-bug-mobile').count()) === 0);
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.locator('#app-sidebar.open').waitFor();
  await assertBugPlacement(page, 'print mobile menu');
  await shot(page, 'print-mobile-menu.png');
  await page.locator('.sidebar-backdrop').click({ position: { x: 360, y: 200 } });
  await page.locator('#app-sidebar.open').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 900 });

  await rejectCases(page, 'print');
  await page.getByTestId('bug-report-page-url').fill(`${baseURL}/printing`);
  await page.getByTestId('bug-report-description').fill(LONG);
  await page.getByTestId('bug-report-title').fill(printTitle);
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
  await page.getByText(printTitle).waitFor();
  const mine = (await page.getByTestId('bug-reports-list').innerText()).toLowerCase();
  record('printing operator sees only their own report', mine.includes(printTitle.toLowerCase()) && !mine.includes(plantTitle.toLowerCase()), mine.slice(0, 180));
  await shot(page, 'print-06-my-reports.png');
  await signOut(page);

  await signIn(page, 'Plant Manager');
  const plantTriage = await page.locator('#app-sidebar .nav-label', { hasText: /^Bug Reports$/ }).count();
  record('plant manager does not see the admin triage item', plantTriage === 0, `count ${plantTriage}`);
  await captureRail(page, 'plant');
  await rejectCases(page, 'plant');
  await page.getByTestId('bug-report-page-url').fill(`${baseURL}/dashboard`);
  await page.getByTestId('bug-report-description').fill(LONG);
  await page.getByTestId('bug-report-title').fill(plantTitle);
  await page.getByTestId('bug-report-capture').click();
  await page.locator('.bug-report-previews img').first().waitFor({ timeout: 30000 });
  await pastePng(page);
  await page.getByTestId('bug-report-submit').click();
  await page.getByTestId('bug-report-success').waitFor({ timeout: 30000 });
  record('plant manager submitted a valid report', true);
  await shot(page, 'plant-04-submitted.png');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByTestId('my-bug-reports-nav').click();
  await page.getByText(plantTitle).waitFor();
  const plantList = (await page.getByTestId('bug-reports-list').innerText()).toLowerCase();
  record(
    'plant manager sees only their own report',
    plantList.includes(plantTitle.toLowerCase()) && !plantList.includes(printTitle.toLowerCase()),
    plantList.slice(0, 180)
  );
  await shot(page, 'plant-05-my-reports.png');
  await signOut(page);

  await signIn(page, 'Admin');
  await captureRail(page, 'admin');
  await page.locator('#app-sidebar .nav-item').filter({ has: page.locator('.nav-label', { hasText: /^Bug Reports$/ }) }).click();
  await page.getByTestId('admin-bug-reports').waitFor();
  await page.getByText(printTitle).waitFor();
  await page.getByText(plantTitle).waitFor();
  record('admin sees both reports', true);
  await shot(page, 'admin-01-all-reports.png');
  await page.getByText(printTitle).click();
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="bug-report-gallery"] img');
    return image && image.complete && image.naturalWidth > 200;
  }, null, { timeout: 20000 });
  const images = await page.getByTestId('bug-report-gallery').locator('img').count();
  const link = await page.getByTestId('bug-report-link').getAttribute('href');
  record('admin opened the report and saw screenshots', images >= 1 && /^https?:\/\//.test(link || ''), `${images} images`);
  await shot(page, 'admin-02-report-open.png');
  await page.getByTestId('bug-report-note').fill('Reproduced on the printing queue during QA.');
  await page.getByTestId('bug-mark-in-progress').click();
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
  record('printing operator API returns only their row', pressTitles.includes(printTitle) && !pressTitles.includes(plantTitle), pressTitles.join(', '));
  const ownPath = pressRows.data?.find((row) => row.title === printTitle)?.screenshot_paths?.[0];
  const ownUrl = await supabase.storage.from('bug-screenshots').createSignedUrl(ownPath, 60);
  record('printing operator can sign their own screenshot', Boolean(ownUrl.data?.signedUrl), ownUrl.error?.message || 'signed');

  const plant = byRole['Plant Manager'];
  const plantAuth = await supabase.auth.signInWithPassword({ email: plant.email, password: plant.password });
  if (plantAuth.error) throw plantAuth.error;
  const stolen = await supabase.storage.from('bug-screenshots').createSignedUrl(ownPath, 60);
  record('plant manager cannot sign the operator screenshot', !stolen.data?.signedUrl, stolen.error?.message || 'unexpected signed url');
  const plantRows = await supabase.from('bug_reports').select('title');
  record('plant manager API returns only their row', (plantRows.data || []).every((row) => row.title !== printTitle) && (plantRows.data || []).some((row) => row.title === plantTitle), (plantRows.data || []).map((row) => row.title).join(', '));
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
