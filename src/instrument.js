import * as Sentry from '@sentry/react';

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
    tracePropagationTargets: [
      /^\//,
      /^https:\/\/erp\.samyakinternational\.in/,
      /^https:\/\/samyakflexi-erp-samyak-international-ltd\.vercel\.app/,
    ],
  });
}
