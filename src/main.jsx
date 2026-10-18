import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { SuccessModalProvider } from './context/SuccessModalContext.jsx'

if (import.meta.env.VITE_SENTRY_DSN) {
  import('@sentry/react').then(Sentry => {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      dataCollection: {
        userInfo: false,
      }
    });
  }).catch(err => {
    console.warn("Sentry initialization deferred:", err);
  });
}

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <StrictMode>
    <ErrorBoundary>
      <SuccessModalProvider>
        <App />
      </SuccessModalProvider>
    </ErrorBoundary>
  </StrictMode>,
);
