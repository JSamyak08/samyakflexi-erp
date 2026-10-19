import assert from 'node:assert/strict';
import { bootLoaderIsReady, shouldShowBootLoader } from '../src/bootLoader.js';

// The production bug: handleLogin sets isSigningIn, and the loader only
// clears that flag after the bar hits 100. The old isReady formula included
// !isSigningIn, so the bar stayed at 92%.
function brokenIsReady(state) {
  return Boolean(state.isAuthReady && !state.isSigningIn && state.isDataReady);
}

function settle(start, { dataReadyOnFrame = 0 } = {}) {
  let state = { ...start };
  const frames = [];
  for (let frame = 0; frame < 8; frame += 1) {
    if (frame === dataReadyOnFrame) state = { ...state, isDataReady: true };
    const show = shouldShowBootLoader(state);
    const ready = bootLoaderIsReady(state);
    if (show && ready) state = { ...state, isSigningIn: false };
    frames.push({ frame, show, ready, isSigningIn: state.isSigningIn });
    if (!show) break;
  }
  return { state, frames };
}

const signedIn = {
  isAuthReady: true,
  isSigningIn: true,
  isAuthenticated: true,
  isDataReady: false,
};

const fresh = settle(signedIn, { dataReadyOnFrame: 1 });
assert.equal(fresh.frames[0].show, true);
assert.equal(fresh.frames[0].ready, false, 'the card waits while the first data fetch is still running');
assert.equal(brokenIsReady({ ...signedIn, isDataReady: true }), false);
assert.equal(bootLoaderIsReady({ ...signedIn, isDataReady: true }), true);
assert.equal(fresh.state.isSigningIn, false);
assert.equal(fresh.frames.at(-1).show, false, 'fresh sign-in reaches the dashboard without a reload');

const again = settle({
  ...fresh.state,
  isSigningIn: true,
  isAuthenticated: true,
  isDataReady: false,
}, { dataReadyOnFrame: 1 });
assert.equal(again.state.isSigningIn, false);
assert.equal(again.frames.at(-1).show, false, 'sign-out followed by sign-in also finishes');

const reload = settle({
  isAuthReady: true,
  isSigningIn: false,
  isAuthenticated: true,
  isDataReady: true,
});
assert.equal(reload.frames[0].show, false, 'a reload with a session does not depend on the sign-in flag');

let stuck = { ...signedIn, isDataReady: true };
for (let i = 0; i < 5; i += 1) {
  const ready = brokenIsReady(stuck);
  if (shouldShowBootLoader(stuck) && ready) stuck = { ...stuck, isSigningIn: false };
}
assert.equal(stuck.isSigningIn, true, 'the old formula never clears the sign-in flag');

console.log('boot loader sign-in checks passed');
