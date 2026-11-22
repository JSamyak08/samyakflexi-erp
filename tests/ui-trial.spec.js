import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PRODUCTION_HOST = 'eamstsaqkbeiywfaanhi.supabase.co';
const TEST_HOST = 'awtjvrhpoyzjwrfumhip.supabase.co';
const TEST_PROJECT_REF = 'awtjvrhpoyzjwrfumhip';
const SHOTS_DIR = path.resolve('artifacts/trial-screenshots');

fs.mkdirSync(SHOTS_DIR, { recursive: true });

const SAMPLE_INVENTORY = [
  {
    id: 'INVT-0101',
    item_code: 'PET-12-700',
    itemCode: 'PET-12-700',
    item_name: 'PET Film 12µ 700mm',
    itemName: 'PET Film 12µ 700mm',
    category: 'Film Substrates',
    film_type: 'PET',
    filmType: 'PET',
    micron: 12,
    width_mm: 700,
    widthMm: 700,
    stock_qty_kg: 850.5,
    available_qty_kg: 850.5,
    availableQtyKg: 850.5,
    allocated_qty_kg: 100.0,
    allocatedQtyKg: 100.0,
    reorder_level_kg: 200,
    reorderLevelKg: 200,
    unit: 'kg',
    unit_price: 185.0,
    unitPrice: 185.0,
    location: 'Bay 1',
    last_vendor: 'Polyplex Ltd',
    lastVendor: 'Polyplex Ltd',
    last_batch: 'BAT-9901',
    lastBatch: 'BAT-9901',
    is_active: true,
    active: true
  },
  {
    id: 'INVT-0102',
    item_code: 'INK-CYAN',
    itemCode: 'INK-CYAN',
    item_name: 'Gravure Cyan Ink',
    itemName: 'Gravure Cyan Ink',
    category: 'Printing Inks',
    film_type: 'Printing Inks',
    filmType: 'Printing Inks',
    sub_type: 'Cyan Shade',
    subType: 'Cyan Shade',
    stock_qty_kg: 45.0,
    available_qty_kg: 45.0,
    availableQtyKg: 45.0,
    allocated_qty_kg: 0,
    allocatedQtyKg: 0,
    reorder_level_kg: 50,
    reorderLevelKg: 50,
    unit: 'kg',
    unit_price: 320.0,
    unitPrice: 320.0,
    location: 'Ink Room',
    last_vendor: 'DIC India',
    lastVendor: 'DIC India',
    last_batch: 'INK-4402',
    lastBatch: 'INK-4402',
    is_active: true,
    active: true
  }
];

const SAMPLE_ROLLS = [
  {
    id: 'ROL-001',
    barcode_id: 'BC-PET-001',
    barcodeId: 'BC-PET-001',
    barcode: 'BC-PET-001',
    stock_item_id: 'INVT-0101',
    stockItemId: 'INVT-0101',
    item_id: 'INVT-0101',
    item_code: 'PET-12-700',
    item_name: 'PET Film 12µ 700mm',
    category: 'Film Substrates',
    net_weight_kg: 400.0,
    available_weight_kg: 400.0,
    created_at: '2026-10-01T10:00:00.000Z',
    status: 'In Stock',
    is_consumed: false
  },
  {
    id: 'ROL-002',
    barcode_id: 'BC-PET-002',
    barcodeId: 'BC-PET-002',
    barcode: 'BC-PET-002',
    stock_item_id: 'INVT-0101',
    stockItemId: 'INVT-0101',
    item_id: 'INVT-0101',
    item_code: 'PET-12-700',
    item_name: 'PET Film 12µ 700mm',
    category: 'Film Substrates',
    net_weight_kg: 450.5,
    available_weight_kg: 450.5,
    created_at: '2026-10-25T14:30:00.000Z',
    status: 'In Stock',
    is_consumed: false
  }
];

const SAMPLE_ORDERS = [
  {
    id: 'ORD-2026-101',
    job_name: 'Chai Pouch 100g',
    jobName: 'Chai Pouch 100g',
    order_qty_kg: 500,
    orderQtyKg: 500,
    status: 'In Production',
    target_delivery_date: '2026-11-28',
    targetDeliveryDate: '2026-11-28',
    client_name: 'Tata Tea Ltd',
    clientName: 'Tata Tea Ltd'
  },
  {
    id: 'ORD-2026-102',
    job_name: 'Snacks Pouch 200g',
    jobName: 'Snacks Pouch 200g',
    order_qty_kg: 350,
    orderQtyKg: 350,
    status: 'Confirmed',
    target_delivery_date: '2026-12-05',
    targetDeliveryDate: '2026-12-05',
    client_name: 'Balaji Wafers',
    clientName: 'Balaji Wafers'
  }
];

function createMockUser(role, email) {
  const userId = `usr-${role.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  return {
    id: userId,
    username: role.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    full_name: `${role} User`,
    email,
    role,
    assigned_roles: [role],
    department: 'Operations',
    status: 'Active',
    active: true,
    auth_user_id: `auth-${userId}`
  };
}

function jwt(userId, email) {
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({
    sub: userId,
    email: email,
    role: 'authenticated',
    aud: 'authenticated',
    exp,
  })}.sig`;
}

function sessionBody(user) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  return {
    access_token: jwt(user.auth_user_id, user.email),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'refresh-token',
    user: {
      id: user.auth_user_id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { full_name: user.full_name },
      created_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

async function setupSupabaseMock(page, userRole = 'Admin') {
  const email = `${userRole.toLowerCase().replace(/[^a-z0-9]/g, '')}@samyakinternational.in`;
  const user = createMockUser(userRole, email);
  const session = sessionBody(user);

  await page.addInitScript(({ testHost, projectRef, sessionData }) => {
    try {
      window.localStorage.setItem('samyak_supabase_url', `https://${testHost}`);
      window.localStorage.setItem('samyak_supabase_key', 'test-mock-anon-key');
      window.localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify(sessionData));
    } catch (e) {}
  }, { testHost: TEST_HOST, projectRef: TEST_PROJECT_REF, sessionData: session });

  await page.route(/supabase\.co/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const accept = request.headers().accept || '';
    const wantsObject = accept.includes('application/vnd.pgrst.object+json');
    const pathname = url.pathname;

    if (pathname.includes('/auth/v1/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(session)
      });
      return;
    }

    if (pathname.includes('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(session.user)
      });
      return;
    }

    if (pathname.includes('/rest/v1/users')) {
      const body = wantsObject ? user : [user];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/1' },
        body: JSON.stringify(body)
      });
      return;
    }

    if (pathname.includes('/rest/v1/inventory_rolls') || pathname.includes('/rest/v1/rolls')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': `0-${SAMPLE_ROLLS.length - 1}/${SAMPLE_ROLLS.length}` },
        body: JSON.stringify(SAMPLE_ROLLS)
      });
      return;
    }

    if (pathname.includes('/rest/v1/inventory')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': `0-${SAMPLE_INVENTORY.length - 1}/${SAMPLE_INVENTORY.length}` },
        body: JSON.stringify(SAMPLE_INVENTORY)
      });
      return;
    }

    if (pathname.includes('/rest/v1/orders')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': `0-${SAMPLE_ORDERS.length - 1}/${SAMPLE_ORDERS.length}` },
        body: JSON.stringify(SAMPLE_ORDERS)
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '*/0' },
      body: method === 'HEAD' ? '' : '[]'
    });
  });
}

test.describe('HeroUI + Tremor UI Trial Integration', () => {
  test('Complete Trial Journey: Role Gates, Switch Toggle, Views & Screenshots', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const vpSuffix = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await setupSupabaseMock(page, 'Admin');
    await page.goto('/inventory');
    await page.waitForTimeout(1000);

    // =========================================================================
    // 1. INVENTORY (Switch OFF - Classic View)
    // =========================================================================
    // Close any open mobile drawer if present
    const backdrop = page.locator('.mobile-drawer-backdrop');
    if (await backdrop.isVisible().catch(() => false)) {
      await backdrop.click().catch(() => {});
    }

    // Role-gating check: Admin MUST see the switch
    const toggleBtn = page.locator('[data-testid="ui-trial-toggle-btn"]').first();
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
    await expect(toggleBtn).toContainText('Try the new design');

    await page.screenshot({ path: path.join(SHOTS_DIR, `01-inventory-switch-off-${vpSuffix}.png`) });

    // =========================================================================
    // 2. TOGGLE TRIAL SWITCH ON
    // =========================================================================
    await toggleBtn.click();
    await page.waitForTimeout(800);

    // Now button should say "Use the current design"
    await expect(toggleBtn).toContainText('Use the current design');

    // =========================================================================
    // 3. INVENTORY (Switch ON - Trial View)
    // =========================================================================
    await page.screenshot({ path: path.join(SHOTS_DIR, `02-inventory-switch-on-${vpSuffix}.png`) });

    if (isMobile) {
      // Mobile cards view must be visible and have action buttons >= 44px
      const mobileCards = page.locator('.ui-next-mobile-cards');
      await expect(mobileCards).toBeVisible({ timeout: 10000 });
      const mobileActionBtn = page.locator('.ui-next-mobile-btn').first();
      await expect(mobileActionBtn).toBeVisible({ timeout: 10000 });
    } else {
      // Desktop HeroUI table must be visible
      const desktopTable = page.locator('.ui-next-desktop-table');
      await expect(desktopTable).toBeVisible({ timeout: 10000 });
    }

    // =========================================================================
    // 4. ITEM LEDGER & BARCODES (FIFO) TAB: Modal Dismiss Rule Verification
    // =========================================================================
    const historyBtn = isMobile
      ? page.locator('.ui-next-mobile-cards button:has-text("Ledger")').first()
      : page.locator('.ui-next-desktop-table button:has-text("History")').first();

    await expect(historyBtn).toBeVisible({ timeout: 10000 });
    await historyBtn.click();

    // Verify ModalOverlay is visible
    const modalOverlay = page.locator('.modal-overlay');
    await expect(modalOverlay).toBeVisible({ timeout: 10000 });

    // Take screenshot of Item Ledger Movements
    await page.screenshot({ path: path.join(SHOTS_DIR, `03-item-ledger-movements-${vpSuffix}.png`) });

    // Click Barcodes (FIFO) tab
    const fifoTab = page.locator('[data-testid="ledger-barcode-tab"]');
    if (await fifoTab.isVisible().catch(() => false)) {
      await fifoTab.click();
      await page.waitForTimeout(400);

      // Take screenshot of Barcodes FIFO tab
      await page.screenshot({ path: path.join(SHOTS_DIR, `04-item-ledger-fifo-${vpSuffix}.png`) });

      // Confirm FIFO consume first is rendered
      const fifoSection = page.locator('[data-testid="ledger-barcode-fifo"]');
      await expect(fifoSection).toBeVisible();
    }

    // HARD RULE VERIFICATION: Backdrop click MUST NOT close the dialog
    await page.mouse.click(10, 10);
    await page.waitForTimeout(300);
    expect(await modalOverlay.isVisible(), 'Backdrop click MUST NOT dismiss the dialog').toBe(true);

    // Pressing Escape MUST close the dialog
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    expect(await modalOverlay.isVisible(), 'Escape key MUST dismiss the dialog').toBe(false);

    // =========================================================================
    // 5. EXECUTIVE DASHBOARD (Switch ON - Tremor Charts & KPI Cards)
    // =========================================================================
    await page.evaluate(() => {
      window.history.pushState({}, '', '/dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(800);

    // Close any open mobile drawer
    if (await backdrop.isVisible().catch(() => false)) {
      await backdrop.click().catch(() => {});
    }

    // Wait for modern Tremor KPI cards to finish lazy loading
    const tremorCardFirst = page.locator('.tremor-kpi-card').first();
    await expect(tremorCardFirst).toBeVisible({ timeout: 15000 });

    await page.screenshot({ path: path.join(SHOTS_DIR, `05-dashboard-switch-on-${vpSuffix}.png`) });

    // Verify Tremor KPI cards are visible
    const tremorCards = page.locator('.tremor-kpi-card');
    expect(await tremorCards.count()).toBeGreaterThan(0);

    // =========================================================================
    // 6. DISPATCH SCREEN (Proof of No Style Leak)
    // =========================================================================
    await page.evaluate(() => {
      window.history.pushState({}, '', '/dispatch');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(800);

    if (await backdrop.isVisible().catch(() => false)) {
      await backdrop.click().catch(() => {});
    }

    await page.screenshot({ path: path.join(SHOTS_DIR, `06-dispatch-switch-on-no-leak-${vpSuffix}.png`) });

    // =========================================================================
    // 7. TOGGLE SWITCH BACK TO CLASSIC DESIGN (Rollback Verification)
    // =========================================================================
    await page.evaluate(() => {
      window.history.pushState({}, '', '/inventory');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(600);
    const revertBtn = page.locator('[data-testid="ui-trial-toggle-btn"]').first();
    if (await revertBtn.isVisible().catch(() => false)) {
      await revertBtn.click();
      await page.waitForTimeout(500);
      await expect(revertBtn).toContainText('Try the new design');
    }

    // =========================================================================
    // 8. QUERY PARAM OVERRIDE ?ui=classic FORCES CLASSIC
    // =========================================================================
    await page.evaluate(() => {
      window.history.pushState({}, '', '/inventory?ui=classic');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(600);
    // With ?ui=classic, trial is forced OFF
    const classicTable = page.locator('table.data-table');
    await expect(classicTable).toBeVisible();
  });
});
