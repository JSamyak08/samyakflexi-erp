import './instrument'
import { redirectProductionVercelHost } from './utils/canonicalOrigin.js'

if (typeof window !== 'undefined') {
  const productionHost = redirectProductionVercelHost(window.location);
  if (productionHost) window.location.replace(productionHost);
}
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import './pdfA4.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { SuccessModalProvider } from './context/SuccessModalContext.jsx'

const container = document.getElementById("root");
const root = createRoot(container, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
});
root.render(
  <StrictMode>
    <ErrorBoundary>
      <SuccessModalProvider>
        <App />
      </SuccessModalProvider>
    </ErrorBoundary>
  </StrictMode>,
);
