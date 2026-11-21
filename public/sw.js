// Samyak FlexiERP Progressive Web App (PWA) Service Worker
const CACHE_NAME = 'flexierp-cache-v1';

// Essential App Shell resources to precache on installation
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/samyak-favicon.png',
  '/samyak-logo.png',
  '/samyak-logo.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg'
];

// Install Event: Precache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Some precache assets could not be cached:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up legacy caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Deleting legacy cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Network-First for APIs, Stale-While-Revalidate for Assets, Cache-Fallback for Navigation
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Non-GET requests (POST, PUT, DELETE, PATCH): Always straight to network
  if (request.method !== 'GET') {
    return;
  }

  // 2. Supabase / Backend API / External API requests: Network-First
  const isApiRequest = url.pathname.startsWith('/api/') || 
                       url.pathname.startsWith('/rest/v1/') || 
                       url.pathname.startsWith('/auth/v1/') ||
                       url.hostname.includes('supabase.co');

  if (isApiRequest) {
    event.respondWith(
      fetch(request).catch(() => {
        // Return structured offline JSON response
        return new Response(
          JSON.stringify({
            error: 'NetworkOffline',
            message: 'You are currently offline. Changes will sync when network is restored.'
          }),
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }

  // 3. Navigation requests (Page Loads / HTML): Network-First, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          return caches.match('/index.html');
        })
    );
    return;
  }

  // 4. Same-origin Static Assets (JS, CSS, images, fonts): Stale-While-Revalidate
  const isStaticAsset = url.origin === self.location.origin && (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.woff2')
  );

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Default: Network with Cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Message Event: Allow skipWaiting from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
