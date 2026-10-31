import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_ORIGIN,
  parseHttpOrigin,
  redirectProductionVercelHost,
  resolvePublicOrigin,
  shouldRedirectVercelHost,
} from '../src/utils/canonicalOrigin.js';
import { authConfirmUrl, safeNextPath } from '../src/utils/authLinks.js';

test('auth origins never stay on vercel.app or supabase.co', () => {
  assert.equal(parseHttpOrigin('https://erp.samyakinternational.in'), PRODUCTION_ORIGIN);
  assert.equal(parseHttpOrigin('https://samyakflexi-erp.vercel.app'), '');
  assert.equal(parseHttpOrigin('https://preview-git-feature.vercel.app'), '');
  assert.equal(parseHttpOrigin('https://eamstsaqkbeiywfaanhi.supabase.co'), '');
  assert.equal(parseHttpOrigin('https://erp.samyakinternational.in/reset-password'), '');
  assert.equal(
    resolvePublicOrigin({
      configured: 'https://samyakflexi-erp.vercel.app',
      locationOrigin: 'https://samyakflexi-erp-git-feature-samyak-international-ltd.vercel.app',
    }),
    PRODUCTION_ORIGIN
  );
  assert.equal(
    resolvePublicOrigin({ locationOrigin: 'http://127.0.0.1:5173' }),
    'http://127.0.0.1:5173'
  );
  assert.equal(
    resolvePublicOrigin({ configured: 'https://preview.example.test' }),
    'https://preview.example.test'
  );
});

test('production vercel aliases redirect and preview branch hosts stay put', () => {
  assert.equal(shouldRedirectVercelHost('samyakflexi-erp.vercel.app'), true);
  assert.equal(shouldRedirectVercelHost('samyakflexi-erp-samyak-international-ltd.vercel.app'), true);
  assert.equal(shouldRedirectVercelHost('samyakflexi-erp-git-main-samyak-international-ltd.vercel.app'), true);
  assert.equal(shouldRedirectVercelHost('samyakflexi-erp-git-cursor-fix-samyak-international-ltd.vercel.app'), false);
  const next = redirectProductionVercelHost({
    hostname: 'samyakflexi-erp.vercel.app',
    pathname: '/reset-password',
    search: '?code=abc',
    hash: '#type=recovery',
  });
  assert.equal(next, 'https://erp.samyakinternational.in/reset-password?code=abc#type=recovery');
  assert.equal(redirectProductionVercelHost({
    hostname: 'samyakflexi-erp-git-cursor-fix-samyak-international-ltd.vercel.app',
    pathname: '/printing',
    search: '',
    hash: '',
  }), '');
});

test('confirm links stay on the ERP and reject off-site next paths', () => {
  const link = new URL(authConfirmUrl(PRODUCTION_ORIGIN, {
    tokenHash: 'hashed-secret',
    type: 'recovery',
    next: '/reset-password',
  }));
  assert.equal(link.origin, PRODUCTION_ORIGIN);
  assert.equal(link.pathname, '/auth/confirm');
  assert.equal(link.searchParams.get('token_hash'), 'hashed-secret');
  assert.equal(link.searchParams.get('type'), 'recovery');
  assert.equal(link.searchParams.get('next'), '/reset-password');
  assert.equal(safeNextPath('https://evil.example/phish', '/'), '/');
  assert.equal(safeNextPath('//evil.example', '/'), '/');
  assert.equal(safeNextPath('/reset-password', '/'), '/reset-password');
});
