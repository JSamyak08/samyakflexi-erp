import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const TEST_HOST = 'awtjvrhpoyzjwrfumhip.supabase.co';
const PRODUCTION_HOST = 'eamstsaqkbeiywfaanhi.supabase.co';
const BARCODE = 'FG-QA-PR';
const shots = path.resolve('artifacts/camera');

function loginFile() {
  const candidates = [
    process.env.CAMERA_LOGINS,
    path.resolve('uploads/test_logins.json')
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function credentials(role) {
  const file = loginFile();
  const creds = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!String(creds.project_url).includes(TEST_HOST) || String(creds.project_url).includes(PRODUCTION_HOST)) {
    throw new Error('Camera flow test must use the test Supabase project.');
  }
  const user = (creds.users || []).find((entry) => entry.role === role);
  if (!user?.email || !user?.password) throw new Error(`Missing test login for ${role}.`);
  return user;
}

async function signIn(page, role) {
  const user = credentials(role);
  const productionHits = [];
  await page.route(`**://${PRODUCTION_HOST}/**`, async (route) => {
    productionHits.push(route.request().url());
    await route.abort();
  });
  page.on('request', (request) => {
    if (request.url().includes(PRODUCTION_HOST)) productionHits.push(request.url());
  });
  await page.goto('/login');
  await page.getByPlaceholder('e.g. samyak@samyakinternational.in').fill(user.email);
  await page.getByPlaceholder('Enter your password').fill(user.password);
  await page.getByRole('button', { name: 'Sign In to Dashboard' }).click();
  await expect(page.getByRole('button', { name: 'Scan Barcode (Alt+B)' })).toBeVisible({ timeout: 45000 });
  expect(productionHits).toEqual([]);
  return productionHits;
}

async function openInspector(page) {
  await page.getByRole('button', { name: 'Scan Barcode (Alt+B)' }).click();
  const modal = page.locator('[data-scanner-modal="inspector"]');
  await expect(modal.getByRole('heading', { name: 'Universal Barcode & 2D QR Inspector' })).toBeVisible();
  return modal;
}

async function rememberTracks(page) {
  await page.waitForFunction(() => {
    const video = document.querySelector('[data-scanner-modal="inspector"] video');
    const tracks = video?.srcObject?.getVideoTracks?.() || [];
    return tracks.length > 0 && tracks.every((track) => track.readyState === 'live');
  });
  await page.evaluate(() => {
    window.__scanTracks = document.querySelector('[data-scanner-modal="inspector"] video').srcObject.getVideoTracks();
  });
}

test.beforeAll(() => {
  fs.mkdirSync(shots, { recursive: true });
});

test('admin camera decodes a sample barcode and the light turns off', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'fake-camera', 'fake camera project');
  await signIn(page, 'Admin');
  const modal = await openInspector(page);
  await modal.getByRole('button', { name: 'Camera' }).click();
  await expect(modal.getByRole('alert')).toHaveCount(0);
  await expect(modal.getByRole('heading', { name: /QA Pack Roll Fail|FG Dispatch Roll/ })).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: path.join(shots, 'admin-camera-decoded.png') });
  await rememberTracks(page);
  await modal.getByRole('button', { name: 'Scan Next' }).click();
  await expect(modal.locator('video')).toHaveCount(0);
  await expect(modal.getByText('Awaiting Barcode Scan or Input')).toBeVisible();
  await page.waitForFunction(() => window.__scanTracks.every((track) => track.readyState === 'ended'));

  await modal.getByRole('button', { name: 'Camera' }).click();
  await rememberTracks(page);
  await modal.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-scanner-modal="inspector"]')).toHaveCount(0);
  await page.waitForFunction(() => window.__scanTracks.every((track) => track.readyState === 'ended'));
});

test('printing operator camera decodes the same sample', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'fake-camera', 'fake camera project');
  await signIn(page, 'Printing Operator');
  const modal = await openInspector(page);
  await modal.getByRole('button', { name: 'Camera' }).click();
  await expect(modal.getByRole('heading', { name: /QA Pack Roll Fail|FG Dispatch Roll/ })).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: path.join(shots, 'operator-camera-decoded.png') });
  await rememberTracks(page);
  await modal.getByRole('button', { name: 'Close scanner' }).click();
  await expect(page.locator('[data-scanner-modal="inspector"]')).toHaveCount(0);
  await page.waitForFunction(() => window.__scanTracks.every((track) => track.readyState === 'ended'));
});

test('admin without a camera gets a friendly message and can still inspect by typing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'no-camera', 'no camera project');
  await signIn(page, 'Admin');
  const modal = await openInspector(page);
  await modal.getByRole('button', { name: 'Camera' }).click();
  const alert = modal.getByRole('alert');
  await expect(alert).toHaveText('No camera found on this device. Use a USB scanner or type the code.');
  await expect(alert).not.toContainText('Requested device not found');
  await expect(modal.locator('video')).toHaveCount(0);
  await page.screenshot({ path: path.join(shots, 'admin-no-camera.png') });
  await modal.getByPlaceholder(/Scan \/ Type Barcode/).fill(BARCODE);
  await modal.getByRole('button', { name: 'Inspect' }).click();
  await expect(modal.getByRole('heading', { name: /QA Pack Roll Fail|FG Dispatch Roll/ })).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: path.join(shots, 'admin-typed-inspect.png') });
});

test('printing operator without a camera gets the same friendly message', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'no-camera', 'no camera project');
  await signIn(page, 'Printing Operator');
  const modal = await openInspector(page);
  await modal.getByRole('button', { name: 'Camera' }).click();
  await expect(modal.getByRole('alert')).toHaveText('No camera found on this device. Use a USB scanner or type the code.');
  await expect(modal.getByRole('alert')).not.toContainText('NotFoundError');
  await modal.getByPlaceholder(/Scan \/ Type Barcode/).fill(BARCODE);
  await modal.getByRole('button', { name: 'Inspect' }).click();
  await expect(modal.getByRole('heading', { name: /QA Pack Roll Fail|FG Dispatch Roll/ })).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: path.join(shots, 'operator-no-camera.png') });
});
