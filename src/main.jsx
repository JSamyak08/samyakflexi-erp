import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from "@sentry/react"
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "https://acb33af78bae85a0d85e6b4fbd09efb9@o4511842286567424.ingest.us.sentry.io/4511842289451008",
  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/react/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: []
  }
});

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
