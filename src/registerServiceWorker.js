// Service Worker & PWA Integration Helper for Android & iOS

let deferredPrompt = null;
const installListeners = new Set();

/**
 * Registers the Service Worker on window load
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // Capture Android / Chrome PWA install prompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installListeners.forEach((fn) => fn(true));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installListeners.forEach((fn) => fn(false));
    console.log('[PWA] FlexiERP installed successfully');
  });

  // Listen for service worker notification click navigation events
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'NAVIGATE_TO' && event.data.url) {
      window.dispatchEvent(
        new CustomEvent('pwa-notification-navigate', { detail: event.data })
      );
    }
  });

  window.addEventListener('load', () => {
    // Register SW
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Check for updates periodically
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New version available.');
                window.dispatchEvent(new CustomEvent('pwa-update-available'));
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
  });
}

/**
 * Subscribe to install prompt availability changes
 */
export function onInstallPromptChange(callback) {
  installListeners.add(callback);
  callback(Boolean(deferredPrompt));
  return () => installListeners.delete(callback);
}

/**
 * Trigger the browser install prompt
 */
export async function triggerPwaInstall() {
  if (!deferredPrompt) return false;
  try {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installListeners.forEach((fn) => fn(false));
    return outcome === 'accepted';
  } catch (err) {
    console.warn('[PWA] Install prompt error:', err);
    return false;
  }
}

/**
 * Check if the app is currently running in standalone PWA mode (Android or iOS)
 */
export function isRunningInStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Check if user is on iOS (iPhone, iPad, iPod)
 */
export function isIos() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || navigator.vendor || window.opera || '';
  return /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
}
