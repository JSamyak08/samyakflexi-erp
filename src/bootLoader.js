// The boot card is the only thing that clears isSigningIn, and it does that
// from onComplete after the bar reaches 100. The bar stops at 92% until
// isReady is true. isSigningIn must not be an input to isReady, or a fresh
// sign-in waits on itself and the card never leaves 92%.

export function bootLoaderIsReady({ isAuthReady, isDataReady }) {
  return Boolean(isAuthReady && isDataReady);
}

export function shouldShowBootLoader({ isAuthReady, isSigningIn, isAuthenticated, isDataReady }) {
  return !isAuthReady || Boolean(isSigningIn) || (Boolean(isAuthenticated) && !isDataReady);
}
