import * as Sentry from '@sentry/react';

function sentryTracesSampleRate() {
  const raw = String(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? '').trim();
  if (!raw) {
    console.error('VITE_SENTRY_TRACES_SAMPLE_RATE is not set. Sentry traces stay at 0.');
    return 0;
  }
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    console.error('VITE_SENTRY_TRACES_SAMPLE_RATE must be a number from 0 to 1. Sentry traces stay at 0.');
    return 0;
  }
  return rate;
}

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
    tracesSampleRate: sentryTracesSampleRate(),
    tracePropagationTargets: sentryTraceTargets(import.meta.env.VITE_APP_ORIGIN),
  });
}
