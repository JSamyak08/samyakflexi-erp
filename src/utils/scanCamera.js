/**
 * Camera open path for barcode scanning.
 *
 * A bare `facingMode: 'environment'` is an exact constraint. Laptops and
 * desktops with only a front or USB webcam then fail getUserMedia with
 * NotFoundError ("Requested device not found"). Preferences stay soft, and a
 * remembered device id is dropped when that camera is gone.
 */

export const SCAN_CAMERA_STORAGE_KEY = 'samyak_scan_camera_id';

export const CAMERA_MESSAGES = {
  none: 'No camera found on this device. Use a USB scanner or type the code.',
  blocked: "Camera permission is blocked; allow it in the browser's site settings.",
  busy: 'This camera is in use by another app. Close it, or use a USB scanner or type the code.',
  unsupported: 'Camera access is not supported in this browser. Use a USB scanner or type the code.',
  failed: 'The camera could not start. Use a USB scanner or type the code.'
};

const BLOCKING_ERRORS = new Set(['NotAllowedError', 'PermissionDeniedError', 'SecurityError']);
const BUSY_ERRORS = new Set(['NotReadableError', 'TrackStartError']);

function storageCall(storage, method, ...args) {
  if (!storage || typeof storage[method] !== 'function') return null;
  try {
    return storage[method](...args);
  } catch {
    return null;
  }
}

export function readRememberedCameraId(storage) {
  return String(storageCall(storage, 'getItem', SCAN_CAMERA_STORAGE_KEY) || '').trim();
}

export function rememberCameraId(storage, deviceId) {
  const value = String(deviceId || '').trim().slice(0, 256);
  if (!value) {
    storageCall(storage, 'removeItem', SCAN_CAMERA_STORAGE_KEY);
    return;
  }
  storageCall(storage, 'setItem', SCAN_CAMERA_STORAGE_KEY, value);
}

export function forgetCameraId(storage) {
  storageCall(storage, 'removeItem', SCAN_CAMERA_STORAGE_KEY);
}

export function mapCameraError(error) {
  const name = error?.name || '';
  const message = String(error?.message || '');
  if (BLOCKING_ERRORS.has(name)) return CAMERA_MESSAGES.blocked;
  if (BUSY_ERRORS.has(name)) return CAMERA_MESSAGES.busy;
  if (
    name === 'NotFoundError'
    || name === 'DevicesNotFoundError'
    || name === 'OverconstrainedError'
    || name === 'ConstraintNotSatisfiedError'
    || /requested device not found/i.test(message)
  ) {
    return CAMERA_MESSAGES.none;
  }
  if (name === 'NotSupportedError' || /not supported/i.test(message)) return CAMERA_MESSAGES.unsupported;
  return CAMERA_MESSAGES.failed;
}

/**
 * Constraint attempts, softest preference first.
 * `availableDeviceIds === null` means the device list is unknown (permission
 * not granted yet, or enumerateDevices failed). An empty list of real ids with
 * a known catalogue that does not contain the saved id drops that id.
 */
export function buildCameraAttempts({ preferredDeviceId = '', availableDeviceIds = null } = {}) {
  const preferred = String(preferredDeviceId || '').trim();
  const knownIds = Array.isArray(availableDeviceIds)
    ? availableDeviceIds.map((id) => String(id || '').trim()).filter(Boolean)
    : null;
  const droppedStaleDeviceId = Boolean(
    preferred && knownIds && knownIds.length > 0 && !knownIds.includes(preferred)
  );
  const attempts = [];
  if (preferred && !droppedStaleDeviceId) {
    attempts.push({
      constraints: {
        audio: false,
        video: {
          deviceId: { ideal: preferred },
          facingMode: { ideal: 'environment' }
        }
      },
      dropsRememberedId: true
    });
  }
  attempts.push({
    constraints: {
      audio: false,
      video: { facingMode: { ideal: 'environment' } }
    },
    dropsRememberedId: false
  });
  attempts.push({
    constraints: { audio: false, video: true },
    dropsRememberedId: false
  });
  return { attempts, droppedStaleDeviceId };
}

export function cameraChoices(devices) {
  const choices = [];
  const seen = new Set();
  (devices || []).forEach((device) => {
    if (!device || device.kind !== 'videoinput') return;
    const deviceId = String(device.deviceId || '').trim();
    if (!deviceId || seen.has(deviceId)) return;
    seen.add(deviceId);
    choices.push({
      deviceId,
      label: String(device.label || '').trim() || `Camera ${choices.length + 1}`
    });
  });
  return choices;
}

export function shouldOfferCameraSwitcher(devices) {
  return cameraChoices(devices).length > 1;
}

export function releaseMediaStream(stream) {
  const tracks = typeof stream?.getTracks === 'function'
    ? stream.getTracks()
    : (typeof stream?.getVideoTracks === 'function' ? stream.getVideoTracks() : []);
  (tracks || []).forEach((track) => {
    try { track.stop(); } catch { /* already ended */ }
  });
}

export async function openScanCamera({ mediaDevices, preferredDeviceId = '', storage } = {}) {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    const error = new Error(CAMERA_MESSAGES.unsupported);
    error.name = 'NotSupportedError';
    throw error;
  }

  let listed = [];
  if (typeof mediaDevices.enumerateDevices === 'function') {
    try {
      listed = await mediaDevices.enumerateDevices();
    } catch {
      listed = [];
    }
  }
  const videoInputs = (listed || []).filter((device) => device && device.kind === 'videoinput');
  const availableDeviceIds = videoInputs.length
    ? videoInputs.map((device) => device.deviceId)
    : null;
  const plan = buildCameraAttempts({ preferredDeviceId, availableDeviceIds });
  if (plan.droppedStaleDeviceId) forgetCameraId(storage);

  let lastError = null;
  for (let index = 0; index < plan.attempts.length; index += 1) {
    const attempt = plan.attempts[index];
    try {
      const stream = await mediaDevices.getUserMedia(attempt.constraints);
      const tracks = typeof stream?.getVideoTracks === 'function' ? stream.getVideoTracks() : [];
      const settings = tracks[0] && typeof tracks[0].getSettings === 'function' ? tracks[0].getSettings() : {};
      const deviceId = String(settings?.deviceId || '').trim();
      if (deviceId) rememberCameraId(storage, deviceId);
      return {
        stream,
        deviceId,
        droppedStaleDeviceId: plan.droppedStaleDeviceId,
        attemptCount: index + 1
      };
    } catch (error) {
      lastError = error;
      if (attempt.dropsRememberedId) forgetCameraId(storage);
      const name = error?.name || '';
      const last = index === plan.attempts.length - 1;
      if (last || BLOCKING_ERRORS.has(name) || (BUSY_ERRORS.has(name) && !attempt.dropsRememberedId)) {
        throw error;
      }
    }
  }
  throw lastError;
}

export function createBarcodeDetector(scope) {
  const root = scope || (typeof window !== 'undefined' ? window : undefined);
  const Detector = root?.BarcodeDetector;
  if (typeof Detector !== 'function') return null;
  const formats = [
    'qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8',
    'upc_a', 'upc_e', 'itf', 'codabar', 'data_matrix', 'aztec', 'pdf417'
  ];
  try {
    return new Detector({ formats });
  } catch {
    try { return new Detector(); } catch { return null; }
  }
}

let jsQrPromise = null;

function loadJsQr() {
  if (!jsQrPromise) {
    jsQrPromise = import('jsqr').then((mod) => {
      const reader = mod?.default || mod;
      if (typeof reader === 'function') return reader;
      if (reader && typeof reader.default === 'function') return reader.default;
      return null;
    }).catch(() => null);
  }
  return jsQrPromise;
}

async function readQrCode(source) {
  const width = Number(source.videoWidth || source.width || 0);
  const height = Number(source.videoHeight || source.height || 0);
  if (!width || !height) return '';
  const doc = source.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createElement !== 'function') return '';
  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '';
  context.drawImage(source, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  const jsQR = await loadJsQr();
  if (typeof jsQR !== 'function') return '';
  const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
  return String(code?.data || '').trim();
}

export async function detectBarcode(source, detector) {
  if (!source) return '';
  if (typeof source.readyState === 'number' && source.readyState < 2) return '';
  if (detector && typeof detector.detect === 'function') {
    try {
      const codes = await detector.detect(source);
      const raw = Array.isArray(codes) && codes.length ? codes[0]?.rawValue : '';
      const value = String(raw || '').trim();
      if (value) return value;
    } catch {
      // The platform detector can be missing or reject a frame. The QR reader still runs.
    }
  }
  return readQrCode(source);
}
