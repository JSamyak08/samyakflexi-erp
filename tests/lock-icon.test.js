import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Lock as LockIcon } from 'lucide-react';

const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));

function sourceFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(js|jsx)$/.test(entry.name)) found.push(full);
  }
  return found;
}

test('screens do not render the Web Locks Lock interface', () => {
  const offenders = [];
  for (const file of sourceFiles(srcRoot)) {
    const text = fs.readFileSync(file, 'utf8');
    if (/<Lock[\s/>]/.test(text) || /\bLock\s*,/.test(text)) {
      offenders.push(path.relative(srcRoot, file));
    }
  }
  assert.deepEqual(offenders, []);
});

test('the lock icon draws when window.Lock throws Illegal constructor', () => {
  globalThis.Lock = function Lock() {
    throw new TypeError('Illegal constructor');
  };
  const html = renderToStaticMarkup(React.createElement(LockIcon, {
    size: 18,
    'aria-hidden': true,
  }));
  assert.match(html, /<svg/);
  assert.match(html, /lucide-lock/);
});
