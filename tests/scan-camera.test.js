import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CAMERA_MESSAGES,
  SCAN_CAMERA_STORAGE_KEY,
  buildCameraAttempts,
  cameraChoices,
  detectBarcode,
  mapCameraError,
  openScanCamera,
  shouldOfferCameraSwitcher
} from '../src/utils/scanCamera.js';

function namedError(name, message = name) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    dump() { return { ...data }; }
  };
}

function scriptedDevices({ devices = [], outcomes = [] } = {}) {
  const calls = [];
  const queue = [...outcomes];
  return {
    calls,
    mediaDevices: {
      async enumerateDevices() {
        return devices;
      },
      async getUserMedia(constraints) {
        calls.push(constraints);
        const outcome = queue.shift();
        if (outcome instanceof Error) throw outcome;
        const requested = constraints?.video && typeof constraints.video === 'object'
          ? (constraints.video.deviceId?.ideal || constraints.video.deviceId?.exact || '')
          : '';
        const deviceId = typeof outcome === 'string' && outcome ? outcome : (requested || 'default-cam');
        const track = {
          stopped: false,
          getSettings: () => ({ deviceId }),
          stop() { track.stopped = true; }
        };
        return {
          getVideoTracks: () => [track],
          getTracks: () => [track]
        };
      }
    }
  };
}

function assertSoftVideo(constraints) {
  const video = constraints.video;
  assert.equal(constraints.audio, false);
  if (video === true) return;
  assert.equal(typeof video, 'object');
  assert.notEqual(video.facingMode, 'environment');
  if (video.facingMode) {
    assert.deepEqual(video.facingMode, { ideal: 'environment' });
    assert.equal(video.facingMode.exact, undefined);
  }
  if (video.deviceId) {
    assert.equal(video.deviceId.exact, undefined);
    assert.equal(typeof video.deviceId.ideal, 'string');
  }
}

test('rear camera is only an ideal preference, then any video input', () => {
  const plan = buildCameraAttempts();
  assert.equal(plan.droppedStaleDeviceId, false);
  assert.equal(plan.attempts.length, 2);
  assert.deepEqual(plan.attempts[0].constraints, {
    audio: false,
    video: { facingMode: { ideal: 'environment' } }
  });
  assert.deepEqual(plan.attempts[1].constraints, { audio: false, video: true });
});

test('a remembered camera that is no longer attached is dropped before getUserMedia', () => {
  const plan = buildCameraAttempts({
    preferredDeviceId: 'stale-rear',
    availableDeviceIds: ['laptop-webcam']
  });
  assert.equal(plan.droppedStaleDeviceId, true);
  assert.equal(JSON.stringify(plan.attempts).includes('stale-rear'), false);
  assert.deepEqual(plan.attempts[0].constraints.video, { facingMode: { ideal: 'environment' } });
});

test('an unknown device list still tries a remembered id as an ideal constraint', () => {
  const plan = buildCameraAttempts({
    preferredDeviceId: 'saved-cam',
    availableDeviceIds: null
  });
  assert.equal(plan.droppedStaleDeviceId, false);
  assert.deepEqual(plan.attempts[0].constraints.video.deviceId, { ideal: 'saved-cam' });
  assert.deepEqual(plan.attempts[0].constraints.video.facingMode, { ideal: 'environment' });
});

test('NotFoundError on the rear camera falls back to the default camera', async () => {
  const scripted = scriptedDevices({
    outcomes: [namedError('NotFoundError', 'Requested device not found'), 'laptop-webcam']
  });
  const storage = memoryStorage({ [SCAN_CAMERA_STORAGE_KEY]: 'old' });
  const opened = await openScanCamera({
    mediaDevices: scripted.mediaDevices,
    storage
  });
  assert.equal(scripted.calls.length, 2);
  scripted.calls.forEach(assertSoftVideo);
  assert.deepEqual(scripted.calls[0].video, { facingMode: { ideal: 'environment' } });
  assert.equal(scripted.calls[1].video, true);
  assert.equal(opened.deviceId, 'laptop-webcam');
  assert.equal(storage.dump()[SCAN_CAMERA_STORAGE_KEY], 'laptop-webcam');
});

test('OverconstrainedError on an exact-style rear preference falls back to any camera', async () => {
  const scripted = scriptedDevices({
    devices: [{ kind: 'videoinput', deviceId: 'front', label: 'FaceTime' }],
    outcomes: [namedError('OverconstrainedError', 'Could not satisfy constraints'), 'front']
  });
  const storage = memoryStorage({ [SCAN_CAMERA_STORAGE_KEY]: 'missing-rear' });
  const opened = await openScanCamera({
    mediaDevices: scripted.mediaDevices,
    preferredDeviceId: 'missing-rear',
    storage
  });
  assert.equal(opened.droppedStaleDeviceId, true);
  assert.equal(storage.dump()[SCAN_CAMERA_STORAGE_KEY], 'front');
  assert.equal(scripted.calls.length, 2);
  assert.equal(JSON.stringify(scripted.calls).includes('missing-rear'), false);
  assert.equal(scripted.calls[1].video, true);
  assert.equal(opened.deviceId, 'front');
});

test('a saved camera id that fails to open is forgotten and the default camera is used', async () => {
  const scripted = scriptedDevices({
    devices: [
      { kind: 'videoinput', deviceId: 'rear', label: 'Back' },
      { kind: 'videoinput', deviceId: 'front', label: 'Front' }
    ],
    outcomes: [namedError('NotFoundError', 'Requested device not found'), 'front']
  });
  const storage = memoryStorage({ [SCAN_CAMERA_STORAGE_KEY]: 'rear' });
  const opened = await openScanCamera({
    mediaDevices: scripted.mediaDevices,
    preferredDeviceId: 'rear',
    storage
  });
  assert.equal(scripted.calls.length, 2);
  assert.deepEqual(scripted.calls[0].video.deviceId, { ideal: 'rear' });
  assert.equal(scripted.calls[0].video.deviceId.exact, undefined);
  assert.equal(scripted.calls[1].video.deviceId, undefined);
  assert.equal(opened.deviceId, 'front');
  assert.equal(storage.dump()[SCAN_CAMERA_STORAGE_KEY], 'front');
});

test('NotAllowedError is not retried', async () => {
  const scripted = scriptedDevices({
    outcomes: [namedError('NotAllowedError', 'Permission denied')]
  });
  await assert.rejects(
    () => openScanCamera({ mediaDevices: scripted.mediaDevices }),
    (error) => error.name === 'NotAllowedError'
  );
  assert.equal(scripted.calls.length, 1);
});

test('NotReadableError on the only camera is not masked by another attempt', async () => {
  const scripted = scriptedDevices({
    outcomes: [namedError('NotReadableError', 'Could not start video source')]
  });
  await assert.rejects(
    () => openScanCamera({ mediaDevices: scripted.mediaDevices }),
    (error) => error.name === 'NotReadableError'
  );
  assert.equal(scripted.calls.length, 1);
});

test('a busy remembered camera falls back to another video input', async () => {
  const scripted = scriptedDevices({
    devices: [
      { kind: 'videoinput', deviceId: 'busy-cam', label: 'USB' },
      { kind: 'videoinput', deviceId: 'other-cam', label: 'Built-in' }
    ],
    outcomes: [namedError('NotReadableError', 'Device in use'), 'other-cam']
  });
  const opened = await openScanCamera({
    mediaDevices: scripted.mediaDevices,
    preferredDeviceId: 'busy-cam'
  });
  assert.equal(scripted.calls.length, 2);
  assert.equal(scripted.calls[0].video.deviceId.ideal, 'busy-cam');
  assert.deepEqual(scripted.calls[1].video, { facingMode: { ideal: 'environment' } });
  assert.equal(opened.deviceId, 'other-cam');
});

test('camera errors map to friendly copy and never the raw browser message', () => {
  assert.equal(
    mapCameraError(namedError('NotFoundError', 'Requested device not found')),
    CAMERA_MESSAGES.none
  );
  assert.equal(
    mapCameraError(namedError('OverconstrainedError', 'Could not satisfy constraints')),
    CAMERA_MESSAGES.none
  );
  assert.equal(
    mapCameraError(namedError('NotAllowedError', 'Permission denied')),
    CAMERA_MESSAGES.blocked
  );
  assert.equal(
    mapCameraError(namedError('SecurityError', 'Permission denied')),
    CAMERA_MESSAGES.blocked
  );
  assert.equal(
    mapCameraError(namedError('NotReadableError', 'Could not start video source')),
    CAMERA_MESSAGES.busy
  );
  assert.equal(
    mapCameraError(namedError('TrackStartError', 'Camera in use')),
    CAMERA_MESSAGES.busy
  );
  assert.equal(mapCameraError(namedError('NotSupportedError')), CAMERA_MESSAGES.unsupported);
  assert.equal(mapCameraError(new Error('Requested device not found')), CAMERA_MESSAGES.none);
  assert.equal(CAMERA_MESSAGES.none.includes('Requested device not found'), false);
  assert.equal(CAMERA_MESSAGES.blocked.includes('NotAllowedError'), false);
  assert.match(CAMERA_MESSAGES.none, /No camera found on this device/);
  assert.match(CAMERA_MESSAGES.blocked, /Camera permission is blocked/);
  assert.match(CAMERA_MESSAGES.busy, /in use by another app/);
});

test('several cameras offer a switcher and a single camera does not', () => {
  const two = cameraChoices([
    { kind: 'audioinput', deviceId: 'mic', label: 'Mic' },
    { kind: 'videoinput', deviceId: 'a', label: 'Back camera' },
    { kind: 'videoinput', deviceId: 'a', label: 'Back camera duplicate' },
    { kind: 'videoinput', deviceId: 'b', label: '' }
  ]);
  assert.deepEqual(two, [
    { deviceId: 'a', label: 'Back camera' },
    { deviceId: 'b', label: 'Camera 2' }
  ]);
  assert.equal(shouldOfferCameraSwitcher([
    { kind: 'videoinput', deviceId: 'a', label: 'Back camera' },
    { kind: 'videoinput', deviceId: 'b', label: 'Front' }
  ]), true);
  assert.equal(shouldOfferCameraSwitcher([
    { kind: 'videoinput', deviceId: 'only', label: 'FaceTime' }
  ]), false);
  assert.equal(cameraChoices([{ kind: 'videoinput', deviceId: '', label: '' }]).length, 0);
});

test('barcode detection ignores an unready frame and blank reads', async () => {
  const detector = {
    async detect() { return [{ rawValue: ' FG-QA-PR ' }]; }
  };
  assert.equal(await detectBarcode({ readyState: 1 }, detector), '');
  assert.equal(await detectBarcode({ readyState: 2 }, detector), 'FG-QA-PR');
  assert.equal(await detectBarcode({ readyState: 2 }, { async detect() { return []; } }), '');
  assert.equal(await detectBarcode({ readyState: 2 }, null), '');
});

test('missing getUserMedia is an unsupported-camera error', async () => {
  await assert.rejects(
    () => openScanCamera({ mediaDevices: {} }),
    (error) => error.name === 'NotSupportedError' && mapCameraError(error) === CAMERA_MESSAGES.unsupported
  );
});

test('the inspector uses the shared camera fallback and does not show raw getUserMedia errors', () => {
  const src = fs.readFileSync(new URL('../src/components/UniversalBarcodeScannerModal.jsx', import.meta.url), 'utf8');
  assert.match(src, /openScanCamera/);
  assert.match(src, /mapCameraError/);
  assert.match(src, /releaseMediaStream/);
  assert.doesNotMatch(src, /facingMode:\s*['"]environment['"]/);
  assert.doesNotMatch(src, /err\.message/);
  assert.match(src, /const handleClear = \(\) => \{\s*stopCamera\(\)/);
  assert.match(src, /stopCamera\(\);\s*onClose\?\.\(\)/);
});
