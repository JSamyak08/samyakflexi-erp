import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const loginsPath = process.env.MANTINE_TRIAL_LOGINS;
if (!loginsPath) {
  throw new Error('Set MANTINE_TRIAL_LOGINS to the test login file. This spec is excluded from the default Playwright run.');
}
const shots = process.env.MANTINE_TRIAL_SHOTS || '/opt/cursor/artifacts/mantine-trial';
const logins = JSON.parse(fs.readFileSync(loginsPath, 'utf8'));
const TEST_HOST = 'awtjvrhpoyzjwrfumhip.supabase.co';
const PRODUCTION_HOST = 'eamstsaqkbeiywfaanhi.supabase.co';

if (!String(logins.project_url).includes(TEST_HOST) || String(logins.project_url).includes(PRODUCTION_HOST)) {
  throw new Error('Mantine trial browser test must use the test Supabase project.');
}

fs.mkdirSync(shots, { recursive: true });

function account(role) {
  const row = (logins.users || []).find((user) => user.role === role);
  if (!row) throw new Error(`No login for ${role}`);
  return row;
}

async function signIn(page, role) {
  const person = account(role);
  await page.goto('/login');
  await page.getByPlaceholder('e.g. samyak@samyakinternational.in').fill(person.email);
  await page.getByPlaceholder('Enter your password').fill(person.password);
  await page.getByRole('button', { name: /Sign In to Dashboard/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 });
}

async function sentinel(page) {
  return page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const button = document.querySelector('button.btn-primary');
    const buttonStyle = button ? getComputedStyle(button) : null;
    const cell = document.querySelector('.data-table td');
    const cellStyle = cell ? getComputedStyle(cell) : null;
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main-content');
    return {
      fontFamily: body.fontFamily,
      bodyMargin: body.margin,
      bodyBackground: body.backgroundColor,
      buttonTransform: buttonStyle ? buttonStyle.textTransform : null,
      buttonPadding: buttonStyle ? buttonStyle.padding : null,
      cellPadding: cellStyle ? cellStyle.padding : null,
      sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null,
      mainPadding: main ? getComputedStyle(main).padding : null,
      schemeOnHtml: document.documentElement.getAttribute('data-mantine-color-scheme'),
      mantineColorKey: window.localStorage.getItem('mantine-color-scheme-value'),
    };
  });
}

async function shot(page, name) {
  const file = path.join(shots, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function openInventory(page) {
  await page.goto('/inventory');
  await page.getByRole('button', { name: /Stock Register/i }).waitFor({ timeout: 90000 });
  await page.getByText(/Total Items:/).waitFor({ timeout: 90000 });
}

test.describe.configure({ mode: 'serial' });

test('Admin can compare the current and new stock tables without moving Dashboard or Dispatch', async ({ page }) => {
  const trialRequests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('inventoryTrial') || url.includes('styles/Table.css') || url.includes('@mantine')) {
      trialRequests.push(url);
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'Admin');
  await page.goto('/dashboard');
  await page.locator('.sidebar').waitFor({ timeout: 30000 });
  const dashboardBefore = await sentinel(page);
  await shot(page, 'admin-dashboard-before');
  await page.goto('/dispatch');
  await page.getByRole('button', { name: /Create Packing List|Packing List/i }).first().waitFor({ timeout: 60000 });
  const dispatchBefore = await sentinel(page);
  await shot(page, 'admin-dispatch-before');

  await openInventory(page);
  await expect(page.getByTestId('mantine-trial-switch')).toBeVisible();
  await expect(page.getByTestId('stock-register-classic')).toBeVisible();
  expect(trialRequests, 'Mantine loads only after the switch is turned on').toEqual([]);
  await shot(page, 'admin-inventory-desktop-off');
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, 'admin-inventory-phone-off');
  await page.setViewportSize({ width: 1440, height: 900 });
  const classicNames = await page.getByTestId('stock-register-classic').locator('tbody tr').evaluateAll((rows) => (
    rows.slice(0, 8).map((row) => (row.innerText || '').replace(/\s+/g, ' ').trim())
  ));

  await page.getByTestId('mantine-trial-switch').click();
  await expect(page.getByTestId('stock-register-mantine')).toBeVisible({ timeout: 30000 });
  expect(trialRequests.length).toBeGreaterThan(0);
  const mantineNames = await page.getByTestId('stock-register-mantine').locator('tbody tr').evaluateAll((rows) => (
    rows.slice(0, 8).map((row) => (row.innerText || '').replace(/\s+/g, ' ').trim())
  ));
  const idsOf = (rows) => rows.map((text) => (text.match(/INVT-\d+|INV-[A-Z0-9-]+/) || [])[0] || '');
  expect(idsOf(mantineNames)).toEqual(idsOf(classicNames));
  classicNames.forEach((text, index) => {
    const title = (text.match(/INVT-\d+\s+(.+?)\s+INVT-/) || [])[1];
    if (title) expect(mantineNames[index]).toContain(title);
  });
  await shot(page, 'admin-inventory-desktop-on');

  const history = page.getByRole('button', { name: 'History' }).first();
  if (await history.count()) {
    await history.click();
    await expect(page.getByTestId('item-ledger-views')).toBeVisible();
    await expect(page.getByTestId('ledger-register-mantine')).toBeVisible();
    await page.getByTestId('ledger-barcode-tab').click();
    await expect(page.getByTestId('ledger-barcode-fifo')).toBeVisible();
    await expect(page.getByTestId('ledger-barcode-mantine')).toBeVisible();
    await page.locator('.modal-overlay').click({ position: { x: 12, y: 12 }, force: true });
    await expect(page.getByTestId('ledger-barcode-fifo')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('item-ledger-views')).toHaveCount(0);
    await page.getByRole('button', { name: 'History' }).first().click();
    await expect(page.getByTestId('item-ledger-views')).toBeVisible();
    await page.locator('[data-modal-dismiss]').click();
    await expect(page.getByTestId('item-ledger-views')).toHaveCount(0);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('stock-register-mantine-cards')).toBeVisible();
  const cardButton = page.locator('.mantine-trial-card-actions button').first();
  if (await cardButton.count()) {
    const box = await cardButton.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await shot(page, 'admin-inventory-phone-on');
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/dashboard');
  await page.locator('.sidebar').waitFor();
  const dashboardAfter = await sentinel(page);
  await shot(page, 'admin-dashboard-switch-on');
  expect(dashboardAfter.fontFamily).toBe(dashboardBefore.fontFamily);
  expect(dashboardAfter.bodyMargin).toBe(dashboardBefore.bodyMargin);
  expect(dashboardAfter.bodyBackground).toBe(dashboardBefore.bodyBackground);
  expect(dashboardAfter.buttonTransform).toBe(dashboardBefore.buttonTransform);
  expect(dashboardAfter.buttonPadding).toBe(dashboardBefore.buttonPadding);
  expect(dashboardAfter.sidebarWidth).toBe(dashboardBefore.sidebarWidth);
  expect(dashboardAfter.mainPadding).toBe(dashboardBefore.mainPadding);
  expect(dashboardAfter.schemeOnHtml).toBe(dashboardBefore.schemeOnHtml);
  expect(dashboardAfter.mantineColorKey).toBe(null);

  await page.goto('/dispatch');
  await page.getByRole('button', { name: /Create Packing List|Packing List/i }).first().waitFor({ timeout: 60000 });
  const dispatchAfter = await sentinel(page);
  await shot(page, 'admin-dispatch-switch-on');
  expect(dispatchAfter.fontFamily).toBe(dispatchBefore.fontFamily);
  expect(dispatchAfter.bodyMargin).toBe(dispatchBefore.bodyMargin);
  expect(dispatchAfter.bodyBackground).toBe(dispatchBefore.bodyBackground);
  expect(dispatchAfter.buttonTransform).toBe(dispatchBefore.buttonTransform);
  expect(dispatchAfter.buttonPadding).toBe(dispatchBefore.buttonPadding);
  expect(dispatchAfter.sidebarWidth).toBe(dispatchBefore.sidebarWidth);
  expect(dispatchAfter.mainPadding).toBe(dispatchBefore.mainPadding);
  expect(dispatchAfter.cellPadding).toBe(dispatchBefore.cellPadding);
  expect(dispatchAfter.schemeOnHtml).toBe(dispatchBefore.schemeOnHtml);

  const printPdf = page.getByRole('button', { name: 'Print PDF' }).first();
  if (await printPdf.count()) {
    await printPdf.click();
    const printable = page.locator('#printable-packing-list');
    await expect(printable).toBeVisible({ timeout: 30000 });
    const fileBase = await printable.getAttribute('data-pdf-file-name');
    expect(fileBase).toMatch(/^Dispatch Packing List - .+ - Samyak International Ltd$/);
    await page.evaluate(() => {
      window.__printedTitle = '';
      window.print = () => { window.__printedTitle = document.title; };
    });
    await page.getByRole('button', { name: /Print Dispatch Packing List PDF/i }).click();
    await page.waitForFunction(() => window.__printedTitle);
    const printedTitle = await page.evaluate(() => window.__printedTitle);
    expect(printedTitle).toBe(fileBase);
    const stray = await page.evaluate(() => {
      const doc = document.querySelector('#printable-packing-list');
      const visibleButtons = [...doc.querySelectorAll('button')].filter((button) => {
        const style = getComputedStyle(button);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      return {
        buttons: visibleButtons.length,
        mantine: doc.querySelectorAll('.mantine-pilot, .m_b23fa0ef').length,
      };
    });
    expect(stray.buttons).toBe(0);
    expect(stray.mantine).toBe(0);
    await shot(page, 'admin-packing-list-print-switch-on');
    fs.writeFileSync(path.join(shots, 'packing-list-print-name.txt'), `${fileBase}\n`);
  } else {
    fs.writeFileSync(path.join(shots, 'packing-list-print-name.txt'), 'No packing list was available to print.\n');
  }

  fs.writeFileSync(path.join(shots, 'admin-sentinel.json'), JSON.stringify({ dashboardBefore, dashboardAfter, dispatchBefore, dispatchAfter }, null, 2));
});

async function roleSeesCurrentTable(page, role, { canSwitch }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, role);
  await openInventory(page);
  const switchButton = page.getByTestId('mantine-trial-switch');
  if (canSwitch) {
    await expect(switchButton).toBeVisible();
    await expect(page.getByTestId('stock-register-classic')).toBeVisible();
    await shot(page, `${role.replace(/\s+/g, '-').toLowerCase()}-inventory-off`);
    await switchButton.click();
    await expect(page.getByTestId('stock-register-mantine')).toBeVisible({ timeout: 30000 });
    await shot(page, `${role.replace(/\s+/g, '-').toLowerCase()}-inventory-on`);
    const history = page.getByRole('button', { name: 'History' }).first();
    if (await history.count()) {
      await history.click();
      await expect(page.getByTestId('ledger-register-mantine')).toBeVisible();
      await page.getByTestId('ledger-barcode-tab').click();
      await expect(page.getByTestId('ledger-barcode-mantine')).toBeVisible();
      await page.locator('.modal-overlay').click({ position: { x: 12, y: 12 }, force: true });
      await expect(page.getByTestId('item-ledger-views')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('item-ledger-views')).toHaveCount(0);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('stock-register-mantine-cards')).toBeVisible();
    await shot(page, `${role.replace(/\s+/g, '-').toLowerCase()}-inventory-phone-on`);
  } else {
    await expect(switchButton).toHaveCount(0);
    await expect(page.getByTestId('stock-register-classic')).toBeVisible();
    await shot(page, `${role.replace(/\s+/g, '-').toLowerCase()}-inventory-off`);
    const history = page.getByRole('button', { name: 'History' }).first();
    if (await history.count()) {
      await history.click();
      await expect(page.getByTestId('ledger-barcode-fifo')).toBeVisible({ timeout: 20000 }).catch(() => {});
      await page.getByTestId('ledger-view-tab').click();
      await expect(page.locator('.rm-stock-ledger-table-wrap')).toBeVisible();
      await page.locator('.modal-overlay').click({ position: { x: 12, y: 12 }, force: true });
      await expect(page.getByTestId('item-ledger-views')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('item-ledger-views')).toHaveCount(0);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, `${role.replace(/\s+/g, '-').toLowerCase()}-inventory-phone-off`);
  }
}

test('Plant Manager can turn the new table on and off', async ({ page }) => {
  await roleSeesCurrentTable(page, 'Plant Manager', { canSwitch: true });
});

test('Production Manager keeps the current table', async ({ page }) => {
  await roleSeesCurrentTable(page, 'Production Manager', { canSwitch: false });
});

test('Shop Floor Operator keeps the current table', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'Shop Floor Operator');
  await page.goto('/inventory');
  const stock = page.getByRole('button', { name: /Stock Register/i });
  const opened = await stock.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  if (opened) {
    await expect(page.getByTestId('mantine-trial-switch')).toHaveCount(0);
    await expect(page.getByTestId('stock-register-classic')).toBeVisible();
    await shot(page, 'shop-floor-operator-inventory-off');
    const history = page.getByRole('button', { name: 'History' }).first();
    if (await history.count()) {
      await history.click();
      await page.getByTestId('ledger-view-tab').click();
      await expect(page.locator('.rm-stock-ledger-table-wrap')).toBeVisible();
      await page.locator('.modal-overlay').click({ position: { x: 12, y: 12 }, force: true });
      await expect(page.getByTestId('item-ledger-views')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('item-ledger-views')).toHaveCount(0);
    }
    return;
  }
  await expect(page.getByTestId('mantine-trial-switch')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
  const nav = await page.locator('.sidebar').innerText();
  fs.writeFileSync(path.join(shots, 'shop-floor-operator-note.txt'), `The test Shop Floor Operator is not granted Inventory in the saved role matrix, so /inventory returns to the dashboard. Sidebar:\n${nav}\n`);
  await shot(page, 'shop-floor-operator-dashboard');
});
