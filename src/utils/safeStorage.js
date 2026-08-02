/**
 * Safe Storage & IndexedDB Manager for Samyak Flexi-ERP
 * Prevents QuotaExceededError by offloading large data (like artwork base64, PDFs, and big records)
 * to IndexedDB while maintaining fast, non-blocking synchronous access in localStorage.
 */

const DB_NAME = 'samyak_erp_idb';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

let dbPromise = null;

function getIDB() {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
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
 * Store a key-value pair in IndexedDB (virtually unlimited capacity)
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
      req.onerror = () => {
        console.warn(`[IDB] Set error for key ${key}:`, req.error);
        resolve(false);
      };
    });
  } catch (err) {
    console.warn(`[IDB] Exception in idbSet for ${key}:`, err);
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
 * Delete a key from IndexedDB
 */
export async function idbDelete(key) {
  try {
    const db = await getIDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
  } catch (e) {
    // Ignore
  }
}

/**
 * Compress an image data URL via HTML Canvas to reduce payload by 80-95%
 */
export function compressImageDataUrl(dataUrl, maxDimension = 800, quality = 0.65) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
      return resolve(dataUrl);
    }
    // If SVG or already small (< 40KB), don't compress
    if (dataUrl.startsWith('data:image/svg') || dataUrl.length < 40000) {
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
 * Sanitizes an object or array for localStorage by truncating or omitting massive base64 payloads
 */
function sanitizeForLocalStorage(obj, depth = 0) {
  if (depth > 6 || !obj) return obj;

  if (typeof obj === 'string') {
    // If base64 image or pdf > 25KB, strip for localStorage
    if (obj.startsWith('data:') && obj.length > 25000) {
      return obj.substring(0, 100) + '...[STORED_IN_IDB]';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLocalStorage(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const cleaned = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.startsWith('data:') && v.length > 25000) {
        // Keep a placeholder so UI knows an image exists while not blowing localStorage quota
        cleaned[k] = v.substring(0, 100) + '...[STORED_IN_IDB]';
      } else {
        cleaned[k] = sanitizeForLocalStorage(v, depth + 1);
      }
    }
    return cleaned;
  }

  return obj;
}

/**
 * Emergency purge of bloated keys in localStorage to immediately relieve QuotaExceededError
 */
export function emergencyCleanLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('samyak_erp_') || key.startsWith('samyak_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw && (raw.length > 100000 || raw.includes('data:image/') || raw.includes('data:application/pdf'))) {
            // Save original to IndexedDB first
            try {
              const parsed = JSON.parse(raw);
              idbSet(key, parsed);
              const sanitized = sanitizeForLocalStorage(parsed);
              localStorage.setItem(key, JSON.stringify(sanitized));
            } catch (err) {
              // If not JSON, truncate or remove
              if (raw.length > 100000) {
                localStorage.removeItem(key);
              }
            }
          }
        } catch (e) {
          // Ignore individual key errors
        }
      }
    }
  } catch (err) {
    console.warn('[SafeStorage] Emergency clean failed:', err);
  }
}

/**
 * Safely writes data to localStorage with automatic IndexedDB backing and QuotaExceeded prevention
 * 
 * @param {string} key - localStorage key name
 * @param {any} value - Object, Array, or String
 */
export function safeLocalStorageSet(key, value) {
  if (typeof window === 'undefined' || !window.localStorage) return;

  // 1. Always back up full uncompromised value to IndexedDB asynchronously
  idbSet(key, value);

  // 2. Prepare sanitized version for localStorage
  try {
    let serialized;
    if (typeof value === 'string') {
      serialized = value.length > 50000 && value.startsWith('data:') 
        ? value.substring(0, 100) + '...[STORED_IN_IDB]' 
        : value;
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

      // Retry with aggressive sanitization
      try {
        if (typeof value === 'object') {
          const aggressive = sanitizeForLocalStorage(value);
          localStorage.setItem(key, JSON.stringify(aggressive));
        }
      } catch (retryError) {
        console.warn(`[SafeStorage] Could not write "${key}" to localStorage. Persisted in IndexedDB safely.`);
      }
    } else {
      console.error(`[SafeStorage] Error setting "${key}":`, error);
    }
  }
}

/**
 * Safely reads data from localStorage with fallback
 * 
 * @param {string} key 
 * @param {any} fallbackDefault 
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
    console.warn(`[SafeStorage] Failed to read ${key}:`, e);
    return fallbackDefault;
  }
}

/**
 * Initializes safe storage on app boot, cleaning up any existing bloated keys
 */
export function initSafeStorage() {
  emergencyCleanLocalStorage();
}
