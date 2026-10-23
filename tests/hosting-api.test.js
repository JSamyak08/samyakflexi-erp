import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');

test('API routes are registered before the SPA fallback', () => {
  const recover = server.indexOf("app.post('/api/recover-password'");
  const admin = server.indexOf("app.post('/api/admin-users'");
  const mail = server.indexOf("app.post('/api/send-email'");
  const spa = server.indexOf("app.get('/*splat'");
  assert.ok(recover > 0 && admin > recover && mail > admin && spa > mail);
  const fallback = server.slice(server.indexOf('const sendSpa'));
  assert.match(fallback, /req\.path\.startsWith\('\/api\/'\)/);
  assert.match(fallback, /404/);
});

test('hosting rewrites do not send /api to the single-page app', () => {
  const rewrite = vercel.rewrites.find((item) => item.destination === '/index.html');
  assert.ok(rewrite);
  assert.match(rewrite.source, /\(\?!api\/\)/);
  const lines = redirects.split('\n').map((line) => line.trim()).filter(Boolean);
  assert.match(lines[0], /^\/api\/\*/);
  assert.equal(lines[0].includes('index.html'), false);
  assert.match(lines[1], /^\/\*/);
  assert.match(lines[1], /index\.html/);
});

test('the running server keeps /api off the single-page app', async () => {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: '5099' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let started = false;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API server did not start')), 10000);
    child.stdout.on('data', (chunk) => {
      if (!started && String(chunk).includes('running on port')) {
        started = true;
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => {
      if (!started) {
        clearTimeout(timer);
        reject(new Error(`API server exited ${code}`));
      }
    });
  });
  try {
    await ready;
    const reset = await fetch('http://127.0.0.1:5099/api/recover-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const resetBody = await reset.json();
    assert.equal(reset.status, 410);
    assert.equal(resetBody.success, false);
    const missing = await fetch('http://127.0.0.1:5099/api/recover-password');
    const missingBody = await missing.text();
    assert.equal(missing.status, 404);
    assert.equal(missingBody.includes('<html'), false);
    if (existsSync(new URL('../dist/index.html', import.meta.url))) {
      const page = await fetch('http://127.0.0.1:5099/inventory/grn');
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.match(html, /id="root"/);
    }
  } finally {
    child.kill();
  }
});
