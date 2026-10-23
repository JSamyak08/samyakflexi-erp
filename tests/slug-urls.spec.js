import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseLocation } from '../src/utils/slugRouter.js';

const source = readFileSync(new URL('./slug-router.test.js', import.meta.url), 'utf8');
const canonical = [...source.matchAll(/\['(\/[^']*)', '([^']+)', '([^']+)'\]/g)].map((match) => match[1]);
const legacy = [...source.slice(source.indexOf('const LEGACY'), source.indexOf('test(')).matchAll(/\['([^']*)', '([^']*)'\]/g)].map((match) => match[1]);

function routeFor(href) {
  if (href.startsWith('#')) return parseLocation({ pathname: '/', search: '', hash: href });
  const url = new URL(href, 'http://erp.local');
  return parseLocation({ pathname: url.pathname, search: url.search, hash: url.hash });
}

async function expectRoute(page, href) {
  const target = href.startsWith('#') ? `/${href}` : href;
  await page.goto(target);
  const route = routeFor(href);
  if (route.tab === 'login' || route.recovery) {
    await expect(page.locator('[data-module="login"]')).toBeVisible();
    return route;
  }
  const shell = page.locator('.app-container');
  await expect(shell).toBeVisible();
  if (route.unknown) {
    await expect(shell).toHaveAttribute('data-module', 'not-found');
    await expect(page.locator('[data-screen="not-found"]')).toBeVisible();
    return route;
  }
  await expect(shell).toHaveAttribute('data-module', route.tab);
  await expect(shell).toHaveAttribute('data-section', route.section);
  await expect(page.locator('[data-screen="not-found"]')).toHaveCount(0);
  return route;
}

test('every canonical and legacy URL opens the right screen', async ({ page }) => {
  test.setTimeout(180000);
  const signedIn = [...canonical, ...legacy].filter((href) => !href.startsWith('/login') && href !== '/reset-password');
  for (const href of signedIn) {
    await expectRoute(page, href);
  }
  await page.locator('.btn-signout').first().click();
  await expect(page.locator('[data-module="login"]')).toBeVisible();
  await page.goto('/login/forgot-password');
  await expect(page.locator('[data-section="forgot-password"]')).toBeVisible();
  await page.goto('/reset-password#access_token=abc&type=recovery');
  await expect(page.locator('[data-module="login"]')).toHaveAttribute('data-section', 'recovery');
  await expect(page.getByText('Choose a new password')).toBeVisible();
  console.log(`urls visited: ${signedIn.length + 2} canonical=${canonical.length} legacy=${legacy.length}`);
});

test('refresh, history, sign-in return, and unknown paths keep their address', async ({ page }) => {
  await page.goto('/employees/payroll');
  await expect(page.locator('.app-container')).toHaveAttribute('data-section', 'payroll');
  await page.reload();
  await expect(page.locator('.app-container')).toHaveAttribute('data-module', 'employees');
  await expect(page.locator('.app-container')).toHaveAttribute('data-section', 'payroll');

  await page.goto('/inventory/grn');
  await page.goto('/orders/requirements');
  await page.goBack();
  await expect(page.locator('.app-container')).toHaveAttribute('data-section', 'grn');
  await page.goForward();
  await expect(page.locator('.app-container')).toHaveAttribute('data-section', 'requirements');

  await page.goto('/inks/calculator');
  await page.locator('.btn-signout').first().click();
  await expect(page.locator('[data-module="login"]')).toBeVisible();
  await page.locator('input[type="email"]').fill('e2e@samyakinternational.in');
  await page.locator('input[type="password"]').fill('stub-password');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.app-container')).toHaveAttribute('data-module', 'ink_management');
  await expect(page.locator('.app-container')).toHaveAttribute('data-section', 'calculator');

  await page.goto('/this-page-is-not-real');
  await expect(page.locator('[data-screen="not-found"]')).toBeVisible();
  await expect(page).toHaveURL(/\/this-page-is-not-real$/);
});
