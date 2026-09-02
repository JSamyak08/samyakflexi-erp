import React from 'react';
import { AlertTriangle, RefreshCw, LogIn, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      showDetails: false 
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught ERP Runtime Error:", error, errorInfo);
    try {
      if (typeof window !== 'undefined' && window.Sentry && typeof window.Sentry.captureException === 'function') {
        window.Sentry.captureException(error, { extra: errorInfo });
      }
    } catch (sentryErr) {
      console.warn("Failed to capture exception to Sentry:", sentryErr);
    }
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.href = '/';
  };

  handleGoToLogin = () => {
    try {
      localStorage.removeItem('samyak_erp_current_user');
    } catch (e) {}
    window.location.href = '/login';
  };

  handleClearCacheAndReset = () => {
    try {
      const protectedKeys = ['samyak_supabase_url', 'samyak_supabase_key'];
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (!protectedKeys.includes(k)) {
          localStorage.removeItem(k);
        }
      }
      sessionStorage.clear();
      if (window.indexedDB) {
        window.indexedDB.deleteDatabase('samyak_erp_idb');
      }
    } catch (e) {
      console.warn('Storage clear notice:', e);
    }
    window.location.href = '/login';
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || this.state.error?.toString() || 'Unknown render exception';
      const stackTrace = this.state.error?.stack || this.state.errorInfo?.componentStack || '';

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#f8fafc',
          padding: '24px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            background: 'rgba(30, 41, 59, 0.95)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '16px',
            padding: '36px',
            maxWidth: '640px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              color: '#ef4444'
            }}>
              <AlertTriangle size={36} />
            </div>

            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '8px', color: '#ffffff' }}>
              System Render Exception
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '20px', lineHeight: '1.5' }}>
              SamyakFlexi ERP encountered an unexpected error while rendering this page view.
            </p>

            <div style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '20px',
              textAlign: 'left',
              fontFamily: 'monospace',
              fontSize: '0.82rem',
              color: '#f87171',
              maxHeight: '120px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}>
              {errorMsg}
            </div>

            {/* Stack trace toggle */}
            {stackTrace && (
              <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                <button
                  type="button"
                  onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 0,
                    marginBottom: '8px'
                  }}
                >
                  {this.state.showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>{this.state.showDetails ? 'Hide technical stack trace' : 'View technical stack trace'}</span>
                </button>

                {this.state.showDetails && (
                  <div style={{
                    background: '#020617',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    fontFamily: 'monospace',
                    fontSize: '0.72rem',
                    color: '#94a3b8',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {stackTrace}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={this.handleReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontWeight: '700',
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={15} /> Reload Page
              </button>

              <button
                onClick={this.handleGoToLogin}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#334155',
                  color: '#f8fafc',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontWeight: '600',
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                <LogIn size={15} /> Go to Login
              </button>

              <button
                onClick={this.handleClearCacheAndReset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontWeight: '600',
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
                title="Clears corrupted local cache & reset state without losing Supabase database data"
              >
                <Trash2 size={15} /> Reset Local Cache
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
