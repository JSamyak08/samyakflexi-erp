import { test, expect } from '@playwright/test';

const TEST_HOST = 'awtjvrhpoyzjwrfumhip.supabase.co';
const TEST_PROJECT_REF = 'awtjvrhpoyzjwrfumhip';

function createMockUser(role, email) {
  const userId = `usr-${role.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  return {
    id: userId,
    username: role.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    full_name: `${role} User`,
    name: `${role} User`,
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

const SAMPLE_GRNS = [
  {
    id: 'GRN-101',
    grn_number: 'GRN-101',
    supplier_name: 'Polyplex Ltd',
    qc_status: 'Pending',
    status: 'Pending QC',
    receipt_date: '2026-11-20'
  }
];

const SAMPLE_ORDERS = [
  {
    id: 'ORD-2026-001',
    job_name: 'Tea Pouch 250g',
    client_name: 'Tata Tea',
    target_delivery_date: '2026-11-10',
    status: 'In Production'
  }
];

async function setupMock(page, userRole = 'Admin') {
  const email = `${userRole.toLowerCase().replace(/[^a-z0-9]/g, '')}@samyakinternational.in`;
  const user = createMockUser(userRole, email);
  const session = sessionBody(user);

  await page.addInitScript(({ testHost, projectRef, sessionData }) => {
    try {
      window.localStorage.setItem('samyak_supabase_url', `https://${testHost}`);
      window.localStorage.setItem('samyak_supabase_key', 'test-anon-key');
      window.localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify(sessionData));
    } catch (e) {}
  }, { testHost: TEST_HOST, projectRef: TEST_PROJECT_REF, sessionData: session });

  await page.route(/supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const accept = route.request().headers().accept || '';
    const wantsObject = accept.includes('application/vnd.pgrst.object+json');

    if (pathname.includes('/auth/v1/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) });
      return;
    }
    if (pathname.includes('/auth/v1/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) });
      return;
    }
    if (pathname.includes('/rest/v1/users')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/1' },
        body: JSON.stringify(wantsObject ? user : [user])
      });
      return;
    }
    if (pathname.includes('/rest/v1/grns') || pathname.includes('/rest/v1/goods_receipt_notes')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/1' },
        body: JSON.stringify(SAMPLE_GRNS)
      });
      return;
    }
    if (pathname.includes('/rest/v1/orders')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/1' },
        body: JSON.stringify(SAMPLE_ORDERS)
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '*/0' },
      body: '[]'
    });
  });
}

test.describe('Role-Based PWA Notifications', () => {
  test('Desktop Header Bell shows unread alerts and redirects to action on click', async ({ page }) => {
    await setupMock(page, 'Admin');
    await page.goto('/dashboard');
    await page.waitForTimeout(800);

    // Notification bell should be visible in desktop header
    const bellBtn = page.locator('[data-testid="pwa-notifications-bell-desktop"]');
    await expect(bellBtn).toBeVisible({ timeout: 10000 });

    // Click the notification bell
    await bellBtn.click();

    // Notification center modal should open
    const modalContent = page.locator('.modal-content:has-text("Plant Action Notifications")');
    await expect(modalContent).toBeVisible();

    // Verify modal contains role-targeted action items
    await expect(modalContent).toContainText('Quality QC');
    await expect(modalContent).toContainText('GRN #GRN-101 Pending QC');

    // Clicking the notification card redirects to /inventory/qc
    const qcNotifCard = modalContent.locator('div[role="button"]:has-text("Quality QC")').first();
    await qcNotifCard.click();

    // Verify redirection to /inventory/qc
    await page.waitForTimeout(600);
    expect(page.url()).toContain('/inventory/qc');
  });

  test('Backdrop click does not dismiss modal; Escape key does', async ({ page }) => {
    await setupMock(page, 'Admin');
    await page.goto('/dashboard');
    await page.waitForTimeout(800);

    const bellBtn = page.locator('[data-testid="pwa-notifications-bell-desktop"]');
    await expect(bellBtn).toBeVisible({ timeout: 10000 });
    await bellBtn.click();

    const overlay = page.locator('.modal-overlay');
    await expect(overlay).toBeVisible();

    // Click backdrop (outside content)
    await page.mouse.click(10, 10);
    await page.waitForTimeout(300);
    expect(await overlay.isVisible()).toBe(true);

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(await overlay.isVisible()).toBe(false);
  });

  test('Mobile Header Bell is visible and opens notification center', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupMock(page, 'Admin');
    await page.goto('/dashboard');
    await page.waitForTimeout(800);

    const mobileBellBtn = page.locator('[data-testid="pwa-notifications-bell-mobile"]');
    await expect(mobileBellBtn).toBeVisible({ timeout: 10000 });
    await mobileBellBtn.click();

    const modalContent = page.locator('.modal-content:has-text("Plant Action Notifications")');
    await expect(modalContent).toBeVisible();
    await expect(modalContent).toContainText('Quality QC');
  });
});
