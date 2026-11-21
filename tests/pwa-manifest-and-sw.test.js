import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('PWA manifest.json exists, is valid JSON, and meets PWA installability requirements', () => {
  const manifestPath = path.join(rootDir, 'public', 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'public/manifest.json must exist');

  const content = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(content);

  assert.ok(manifest.name, 'Manifest must have a full name');
  assert.ok(manifest.short_name, 'Manifest must have a short_name');
  assert.equal(manifest.display, 'standalone', 'Display mode must be standalone for native PWA experience');
  assert.ok(manifest.start_url, 'Manifest must have a start_url');
  assert.ok(manifest.theme_color, 'Manifest must specify a theme_color');
  assert.ok(manifest.background_color, 'Manifest must specify a background_color');

  // Verify icons
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'Must have icon suite');
  const has192 = manifest.icons.some(i => i.sizes === '192x192');
  const has512 = manifest.icons.some(i => i.sizes === '512x512');
  const hasMaskable = manifest.icons.some(i => i.purpose && i.purpose.includes('maskable'));

  assert.ok(has192, 'Manifest must declare a 192x192 icon');
  assert.ok(has512, 'Manifest must declare a 512x512 icon');
  assert.ok(hasMaskable, 'Manifest must declare maskable icons for Android adaptive icon rendering');

  // Verify shortcuts
  assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2, 'Manifest should provide quick app shortcuts');
});

test('public/icons directory contains all required standard, maskable, and iOS touch icons', () => {
  const iconsDir = path.join(rootDir, 'public', 'icons');
  assert.ok(fs.existsSync(iconsDir), 'public/icons/ directory must exist');

  const requiredIcons = [
    'icon-192x192.png',
    'icon-512x512.png',
    'apple-touch-icon.png',
    'icon-maskable-192x192.png',
    'icon-maskable-512x512.png',
    'icon.svg'
  ];

  for (const icon of requiredIcons) {
    const iconPath = path.join(iconsDir, icon);
    assert.ok(fs.existsSync(iconPath), `Icon ${icon} must exist in public/icons/`);
    const stat = fs.statSync(iconPath);
    assert.ok(stat.size > 0, `Icon ${icon} must not be empty`);
  }
});

test('public/sw.js implements a resilient Service Worker with shell caching & network-first API handling', () => {
  const swPath = path.join(rootDir, 'public', 'sw.js');
  assert.ok(fs.existsSync(swPath), 'public/sw.js must exist');

  const swContent = fs.readFileSync(swPath, 'utf8');

  // Verify install and activate lifecycle hooks
  assert.ok(swContent.includes("addEventListener('install'"), 'SW must handle install event');
  assert.ok(swContent.includes("addEventListener('activate'"), 'SW must handle activate event');
  assert.ok(swContent.includes("addEventListener('fetch'"), 'SW must handle fetch event');

  // Verify caching strategies
  assert.ok(swContent.includes('skipWaiting'), 'SW should support instant activation');
  assert.ok(swContent.includes('clients.claim'), 'SW should claim active clients');
  assert.ok(swContent.includes('supabase.co') || swContent.includes('/api/'), 'SW should explicitly handle API / Supabase routes');
});

test('index.html contains all essential iOS & Android PWA meta tags and safe area viewport', () => {
  const htmlPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('rel="manifest"'), 'index.html must link to manifest.json');
  assert.ok(html.includes('apple-mobile-web-app-capable'), 'index.html must enable iOS full-screen web app mode');
  assert.ok(html.includes('apple-touch-icon'), 'index.html must include apple-touch-icon');
  assert.ok(html.includes('theme-color'), 'index.html must set theme-color');
  assert.ok(html.includes('viewport-fit=cover'), 'index.html viewport must include viewport-fit=cover for notch/safe area handling');
  assert.ok(html.includes('apple-touch-startup-image'), 'index.html must include apple-touch-startup-image for iOS splash screen');
  assert.ok(html.includes('pwa-splash'), 'index.html must include zero-delay modern inline splash screen');
  assert.ok(html.includes('interactive-widget=resizes-content'), 'index.html must handle mobile virtual keyboard viewport sizing');
});

test('PWA client registration and UI components are authored', () => {
  const registerPath = path.join(rootDir, 'src', 'registerServiceWorker.js');
  const promptPath = path.join(rootDir, 'src', 'components', 'PwaInstallPrompt.jsx');
  const navPath = path.join(rootDir, 'src', 'components', 'MobileBottomNav.jsx');
  const preloaderPath = path.join(rootDir, 'src', 'components', 'Preloader.jsx');
  const appPath = path.join(rootDir, 'src', 'App.jsx');

  assert.ok(fs.existsSync(registerPath), 'src/registerServiceWorker.js must exist');
  assert.ok(fs.existsSync(promptPath), 'src/components/PwaInstallPrompt.jsx must exist');
  assert.ok(fs.existsSync(navPath), 'src/components/MobileBottomNav.jsx must exist');
  assert.ok(fs.existsSync(preloaderPath), 'src/components/Preloader.jsx must exist');

  const navContent = fs.readFileSync(navPath, 'utf8');
  assert.ok(navContent.includes('mobile-bottom-nav'), 'MobileBottomNav must define mobile-bottom-nav class');
  assert.ok(navContent.includes('onOpenScanner'), 'MobileBottomNav must include elevated quick scan trigger');
  assert.ok(navContent.includes('mobile-nav-scan-btn'), 'MobileBottomNav must define elevated mobile-nav-scan-btn');

  const preloaderContent = fs.readFileSync(preloaderPath, 'utf8');
  assert.ok(preloaderContent.includes('preloaderSpin'), 'Preloader must have modern spin animation');
  assert.ok(preloaderContent.includes('preloaderShimmer'), 'Preloader must have shimmer progress bar');
  assert.ok(preloaderContent.includes('isExiting'), 'Preloader must have smooth exit transition');

  const appContent = fs.readFileSync(appPath, 'utf8');
  assert.ok(appContent.includes('mobile-sidebar-close-btn'), 'App sidebar must have mobile dismiss close button');
  assert.ok(appContent.includes('mobile-header-tab-pill'), 'App mobile header must show active tab pill badge');
});
