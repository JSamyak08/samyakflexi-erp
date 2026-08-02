/**
 * Safe Storage & IndexedDB Manager for Samyak Flexi-ERP
 * Manages high-capacity persistence without corrupting data URLs or triggering QuotaExceededError.
 */

const DB_NAME = 'samyak_erp_idb';
const DB_VERSION = 2;
const STORE_NAME = 'keyval';
const ASSETS_STORE = 'assets';

let dbPromise = null;

function getIDB() {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
          if (!db.objectStoreNames.contains(ASSETS_STORE)) {
            db.createObjectStore(ASSETS_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('[IDB] Failed to open IndexedDB:', req.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('[IDB] IndexedDB initialization error:', err);
        resolve(null);
      }
    });
  }
  return dbPromise;
}

/**
 * Store a key-value pair in IndexedDB
 */
export async function idbSet(key, value) {
  try {
    const db = await getIDB();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    return false;
  }
}

/**
 * Retrieve a value from IndexedDB
 */
export async function idbGet(key) {
  try {
    const db = await getIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

/**
 * Store a dedicated raw asset (image/blob) in IndexedDB
 */
export async function idbSaveAsset(assetId, dataUrlOrBlob) {
  try {
    const db = await getIDB();
    if (!db || !assetId || !dataUrlOrBlob) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(ASSETS_STORE, 'readwrite');
      const store = tx.objectStore(ASSETS_STORE);
      store.put(dataUrlOrBlob, assetId);
      tx.oncomplete = () => resolve(assetId);
      tx.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

/**
 * Retrieve a raw asset from IndexedDB
 */
export async function idbGetAsset(assetId) {
  try {
    const db = await getIDB();
    if (!db || !assetId) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(ASSETS_STORE, 'readonly');
      const store = tx.objectStore(ASSETS_STORE);
      const req = store.get(assetId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

/**
 * Checks if a URL or data URL is corrupted or a truncated placeholder
 */
export function isCorruptedArtworkUrl(url) {
  if (!url || typeof url !== 'string') return true;
  if (url.includes('[STORED_IN_IDB]') || url.includes('...')) return true;
  if (url.startsWith('http://') || url.startsWith('https://')) return false;
  if (url.startsWith('data:')) {
    // Valid data url must have comma and reasonable length
    const parts = url.split(',');
    return parts.length < 2 || parts[1].length < 20;
  }
  return false;
}

/**
 * Compress an image data URL via HTML Canvas to reduce payload by 80-95%
 */
export function compressImageDataUrl(dataUrl, maxDimension = 800, quality = 0.7) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
      return resolve(dataUrl);
    }
    // If SVG, don't compress via canvas
    if (dataUrl.startsWith('data:image/svg')) {
      return resolve(dataUrl);
    }

    try {
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
        } catch (e) {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch (e) {
      resolve(dataUrl);
    }
  });
}

/**
 * Sanitizes object for localStorage without creating broken strings
 */
function sanitizeForLocalStorage(obj, depth = 0) {
  if (depth > 6 || !obj) return obj;

  if (typeof obj === 'string') {
    // If massive uncompressed base64 (> 150KB), omit it from localStorage
    if (obj.startsWith('data:') && obj.length > 150000) {
      return '';
    }
    // Clean up any historical corrupted strings
    if (obj.includes('[STORED_IN_IDB]')) {
      return '';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLocalStorage(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const cleaned = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        if (v.includes('[STORED_IN_IDB]')) {
          cleaned[k] = '';
        } else if (v.startsWith('data:') && v.length > 150000) {
          cleaned[k] = '';
        } else {
          cleaned[k] = v;
        }
      } else {
        cleaned[k] = sanitizeForLocalStorage(v, depth + 1);
      }
    }
    return cleaned;
  }

  return obj;
}

const PROTECTED_KEYS = [
  'samyak_supabase_url',
  'samyak_supabase_key',
  'samyak_erp_user',
  'samyak_auth_token'
];

/**
 * Emergency purge and repair of bloated or corrupted keys in localStorage.
 * Strictly avoids touching Supabase credentials, auth tokens, or login sessions.
 */
export function emergencyCleanLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      // Never touch protected credentials or authentication tokens
      if (PROTECTED_KEYS.includes(key)) continue;

      if (key.startsWith('samyak_erp_') || key.startsWith('samyak_')) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;

          // If contains historical corrupted placeholder or is oversized (> 100KB)
          if (raw.includes('[STORED_IN_IDB]') || raw.length > 100000) {
            try {
              const parsed = JSON.parse(raw);
              // Save clean backup to IDB if not already there
              idbSet(key, parsed);
              const sanitized = sanitizeForLocalStorage(parsed);
              localStorage.setItem(key, JSON.stringify(sanitized));
            } catch {
              if (raw.length > 100000) {
                localStorage.removeItem(key);
              }
            }
          }
        } catch (e) {
          // Ignore individual key error
        }
      }
    }
  } catch (err) {
    console.warn('[SafeStorage] Cleanup error:', err);
  }
}

/**
 * Safely writes data to localStorage with automatic IndexedDB backing
 */
export function safeLocalStorageSet(key, value) {
  if (typeof window === 'undefined' || !window.localStorage) return;

  // 1. Always back up full value to IndexedDB
  idbSet(key, value);

  // 2. Prepare clean version for localStorage
  try {
    let serialized;
    if (typeof value === 'string') {
      serialized = (value.startsWith('data:') && value.length > 150000) ? '' : value;
    } else {
      const sanitized = sanitizeForLocalStorage(value);
      serialized = JSON.stringify(sanitized);
    }

    localStorage.setItem(key, serialized);
  } catch (error) {
    const isQuotaError = 
      error.name === 'QuotaExceededError' || 
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || 
      error.code === 22 || 
      error.code === 1014;

    if (isQuotaError) {
      console.warn(`[SafeStorage] Quota exceeded on key "${key}". Running emergency cleanup...`);
      emergencyCleanLocalStorage();
    } else {
      console.error(`[SafeStorage] Error setting "${key}":`, error);
    }
  }
}

/**
 * Safely reads data from localStorage
 */
export function safeLocalStorageGet(key, fallbackDefault = null) {
  if (typeof window === 'undefined' || !window.localStorage) return fallbackDefault;
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallbackDefault;
    try {
      return JSON.parse(saved);
    } catch {
      return saved;
    }
  } catch (e) {
    return fallbackDefault;
  }
}

/**
 * Initializes safe storage on app boot
 */
export function initSafeStorage() {
  emergencyCleanLocalStorage();
}
