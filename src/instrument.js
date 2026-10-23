import * as Sentry from '@sentry/react';

function sentryTraceTargets(appOrigin) {
  const targets = [/^\//];
  const raw = String(appOrigin || '').trim();
  if (!raw) {
    console.error('VITE_APP_ORIGIN is not set. Sentry trace propagation stays on same-origin requests.');
    return targets;
  }
  try {
    const origin = new URL(raw).origin;
    targets.push(new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  } catch (error) {
    console.error('VITE_APP_ORIGIN is not a valid origin. Sentry trace propagation stays on same-origin requests.');
  }
  return targets;
}

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  const release = import.meta.env.VITE_SENTRY_RELEASE || __SENTRY_RELEASE__;
  const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE;

  Sentry.init({
    dsn,
    environment,
    release,
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
    },
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 0,
    tracePropagationTargets: sentryTraceTargets(import.meta.env.VITE_APP_ORIGIN),
  });
}
