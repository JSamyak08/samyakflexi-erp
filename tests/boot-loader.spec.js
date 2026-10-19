import { test, expect } from '@playwright/test';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'admin@samyakinternational.in';

const profile = {
  id: 'USR-ADMIN',
  full_name: 'Plant Admin',
  email: EMAIL,
  role: 'Admin',
  department: 'Management',
  status: 'Active',
  active: true,
  auth_user_id: AUTH_USER_ID,
};

function jwt() {
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({
    sub: AUTH_USER_ID,
    email: EMAIL,
    role: 'authenticated',
    aud: 'authenticated',
    exp,
  })}.sig`;
}

function sessionBody() {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  return {
    access_token: jwt(),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'refresh-token',
    user: {
      id: AUTH_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: EMAIL,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { full_name: 'Plant Admin' },
      created_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

async function installSupabaseMock(page) {
  let signedIn = false;
  await page.route('**://*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const accept = request.headers().accept || '';
    const wantsObject = accept.includes('application/vnd.pgrst.object+json');

    if (url.pathname.endsWith('/auth/v1/token')) {
      signedIn = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sessionBody()),
      });
      return;
    }

    if (url.pathname.endsWith('/auth/v1/logout')) {
      signedIn = false;
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.pathname.includes('/auth/v1/user')) {
      await route.fulfill({
        status: signedIn ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(signedIn ? sessionBody().user : { message: 'no session' }),
      });
      return;
    }

    if (url.pathname.includes('/rest/v1/users')) {
      const body = wantsObject ? profile : [profile];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/1' },
        body: JSON.stringify(body),
      });
      return;
    }

    if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/storage/v1/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '*/0' },
        body: method === 'HEAD' ? '' : '[]',
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
}

async function signIn(page) {
  await page.getByPlaceholder('e.g. samyak@samyak.com').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill('not-the-real-password');
  await page.getByRole('button', { name: 'Sign In to Dashboard' }).click();
  await expect(page.getByText('Executive Operations Dashboard')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Verifying User Auth Session & System Access...')).toHaveCount(0);
}

test('fresh sign-in and a second sign-in reach the dashboard without a reload', async ({ page }) => {
  const loads = [];
  page.on('load', () => loads.push(page.url()));

  await installSupabaseMock(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign In to Operations Center' })).toBeVisible();

  await signIn(page);
  expect(loads).toHaveLength(1);

  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign In to Operations Center' })).toBeVisible();
  expect(loads).toHaveLength(1);

  await signIn(page);
  expect(loads, 'the dashboard must appear without a browser reload').toHaveLength(1);
});
