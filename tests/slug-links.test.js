import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseLocation, resolveInternalPath, MODULES } from '../src/utils/slugRouter.js';

const ROOTS = ['src', 'api'];
const SKIP_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'css', 'map', 'woff', 'woff2', 'ttf', 'pdf', 'js', 'mjs', 'cjs']);
const MODULE_KEYS = new Set([
  ...MODULES.map((mod) => mod.key),
  'job_datasheet',
  'scrap_wastage',
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

function checkHref(href) {
  if (!href || href.startsWith('/api/') || href === '/api') return resolveInternalPath(href.split('?')[0].split('#')[0]);
  const url = new URL(href, 'http://erp.local');
  const route = parseLocation({ pathname: url.pathname, search: url.search, hash: url.hash });
  if (route.unknown) return { ok: false, reason: 'unknown' };
  return { ok: true, canonical: route.canonical };
}

function stringPaths(source) {
  const found = [];
  const pattern = /(['"`])(\/(?:api(?:\/[^'"`\s]*)?|[A-Za-z0-9._~%-]+(?:\/[A-Za-z0-9._~:%{}-]*)*)?(?:\?[^'"`\s]*)?)\1/g;
  let match;
  while ((match = pattern.exec(source))) {
    const href = match[2];
    if (!href.startsWith('/')) continue;
    if (href.includes('${') || href.includes('{')) continue;
    const clean = href.split('?')[0].split('#')[0];
    const ext = clean.includes('.') ? clean.split('.').pop().toLowerCase() : '';
    if (SKIP_EXT.has(ext)) continue;
    if (clean.startsWith('/storage/')) continue;
    if (clean === '/api' || clean.startsWith('/api/')) {
      found.push(href);
      continue;
    }
    if (!/^\/(?:[a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])(?:\/[A-Za-z0-9._~%-]+)*\/?$/.test(clean) && clean !== '/') continue;
    found.push(href);
  }
  return found;
}

test('every internal path string in src and api resolves', () => {
  const failures = [];
  let checked = 0;
  for (const file of ROOTS.flatMap((dir) => walk(dir))) {
    const source = readFileSync(file, 'utf8');
    for (const href of stringPaths(source)) {
      checked += 1;
      const result = checkHref(href);
      if (!result.ok) failures.push(`${file}: ${href}`);
    }
  }
  console.log(`internal path strings checked: ${checked}`);
  assert.ok(checked > 0, 'the scanner found no paths');
  assert.deepEqual(failures, [], `${checked} path strings checked`);
});

test('navigation calls name a real module', () => {
  const failures = [];
  let checked = 0;
  for (const file of walk('src')) {
    const call = /(?:pushSlugState|handleTabChange|onNavigateTab\??)\(\s*['"]([A-Za-z0-9_]+)['"]/g;
    const source = readFileSync(file, 'utf8');
    let match;
    while ((match = call.exec(source))) {
      checked += 1;
      if (!MODULE_KEYS.has(match[1])) failures.push(`${file}: ${match[1]}`);
    }
  }
  console.log(`navigation calls checked: ${checked}`);
  assert.ok(checked > 0);
  assert.deepEqual(failures, []);
});

test('new navigation calls do not pass tab, subTab, or subtab selectors', () => {
  const failures = [];
  for (const file of walk('src')) {
    if (file.endsWith(`${path.sep}slugRouter.js`)) continue;
    const source = readFileSync(file, 'utf8');
    const calls = source.match(/(?:pushSlugState|handleTabChange)\([\s\S]{0,180}?\)/g) || [];
    for (const call of calls) {
      if (/\b(?:tab|subTab|subtab)\s*:/.test(call)) failures.push(`${file}: ${call.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
  }
  assert.deepEqual(failures, []);
});
