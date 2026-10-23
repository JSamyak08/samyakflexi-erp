import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const TEST_HOST = 'awtjvrhpoyzjwrfumhip.supabase.co';
const PRODUCTION_HOST = 'eamstsaqkbeiywfaanhi.supabase.co';
const EMPLOYEE_ID = 'EMP-ATT-QA';
const EMPLOYEE_NAME = 'Attendance QA Operator';
const shots = path.resolve('artifacts/attendance');

test.skip(process.env.ATTENDANCE_LIVE !== '1', 'Live check against the test Supabase project only');

function supabaseEnv() {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url.includes(TEST_HOST) || url.includes(PRODUCTION_HOST)) {
    throw new Error('Attendance live test must use the test Supabase project.');
  }
  if (!key) throw new Error('Test anon key is missing.');
  return { url, key };
}

async function rest(pathname, options = {}) {
  const { url, key } = supabaseEnv();
  const response = await fetch(`${url}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${text}`);
  }
  return body;
}

test('marking attendance persists in Supabase and a failed write shows an error', async ({ page }) => {
  fs.mkdirSync(shots, { recursive: true });
  supabaseEnv();
  await rest(`employee_attendance?employee_id=eq.${EMPLOYEE_ID}`, { method: 'DELETE' });

  const productionHits = [];
  const forbiddenApi = [];
  await page.route(`**://${PRODUCTION_HOST}/**`, async (route) => {
    productionHits.push(route.request().url());
    await route.abort();
  });
  for (const apiPath of ['/api/send-email', '/api/recover-password', '/api/admin-users']) {
    await page.route(`**${apiPath}**`, async (route) => {
      forbiddenApi.push(route.request().url());
      await route.abort();
    });
  }

  let failWrites = false;
  await page.route('**/rest/v1/employee_attendance**', async (route) => {
    const request = route.request();
    if (request.url().includes(PRODUCTION_HOST)) {
      productionHits.push(request.url());
      await route.abort();
      return;
    }
    if (failWrites && request.method() !== 'GET' && request.method() !== 'HEAD') {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'TEST',
          message: 'forced attendance write failure'
        })
      });
      return;
    }
    await route.continue();
  });

  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });

  await page.goto('/login');
  await page.getByPlaceholder('e.g. samyak@samyakinternational.in').fill('qa-admin@test.samyakinternational.in');
  await page.getByPlaceholder('Enter your password').fill(process.env.ATTENDANCE_TEST_PASSWORD || '');
  await page.getByRole('button', { name: 'Sign In to Dashboard' }).click();
  await expect(page.getByText('Executive Operations Dashboard')).toBeVisible({ timeout: 30000 });

  await page.goto('/employee-management?subTab=attendance');
  const row = page.getByRole('row').filter({ hasText: EMPLOYEE_NAME });
  await expect(row).toBeVisible({ timeout: 30000 });
  await expect(row.getByRole('button', { name: 'Mark Att' })).toBeVisible();
  await page.screenshot({ path: path.join(shots, '01-unmarked.png'), fullPage: true });

  failWrites = true;
  await row.getByRole('button', { name: 'Mark Att' }).click();
  await page.getByRole('button', { name: 'Save Attendance Record' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save attendance', { timeout: 15000 });
  await expect(page.getByRole('alert')).toContainText('forced attendance write failure');
  expect(dialogs.some((message) => message.startsWith('Attendance marked'))).toBe(false);
  expect(dialogs.some((message) => message.includes('Could not save attendance'))).toBe(true);
  await page.screenshot({ path: path.join(shots, '02-save-error.png'), fullPage: true });

  failWrites = false;
  dialogs.length = 0;
  await page.getByRole('button', { name: 'Save Attendance Record' }).click();
  await expect(row.getByRole('button', { name: 'Edit Log' })).toBeVisible({ timeout: 15000 });
  await expect(row).toContainText('Present');
  expect(dialogs.some((message) => message.startsWith('Attendance marked'))).toBe(true);
  expect(dialogs.some((message) => message.includes('Could not save attendance'))).toBe(false);
  await page.screenshot({ path: path.join(shots, '03-marked.png'), fullPage: true });

  const markedDate = await page.locator('input[type="date"]').first().inputValue();
  await page.evaluate(() => localStorage.removeItem('samyak_cache_employee_attendance'));
  await page.reload();
  await expect(row).toBeVisible({ timeout: 30000 });
  await expect(row.getByRole('button', { name: 'Edit Log' })).toBeVisible();
  await expect(row).toContainText('Present');
  await expect(row.getByRole('button', { name: 'Mark Att' })).toHaveCount(0);
  await page.screenshot({ path: path.join(shots, '04-marked-after-reload.png'), fullPage: true });

  const stored = await rest(
    `employee_attendance?employee_id=eq.${EMPLOYEE_ID}&date=eq.${markedDate}&select=id,employee_id,date,status,marked_by`
  );
  expect(stored).toHaveLength(1);
  expect(stored[0].status).toBe('Present');
  expect(stored[0].date).toBe(markedDate);
  expect(stored[0].employee_id).toBe(EMPLOYEE_ID);
  expect(productionHits, 'the browser must not call production').toEqual([]);
  expect(forbiddenApi, 'the browser must not call mail or admin APIs').toEqual([]);
});
