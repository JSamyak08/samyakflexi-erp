import React, { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import {
  onInstallPromptChange,
  triggerPwaInstall,
  isRunningInStandalone,
  isIos
} from '../registerServiceWorker';

export default function PwaInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('flexierp_pwa_dismissed') === 'true';
    }
    return false;
  });

  useEffect(() => {
    setIsStandalone(isRunningInStandalone());
    const unsub = onInstallPromptChange((promptAvailable) => {
      setCanInstall(promptAvailable);
    });
    return unsub;
  }, []);

  // Do not show if already running in standalone PWA or dismissed
  if (isStandalone || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('flexierp_pwa_dismissed', 'true');
    }
  };

  const handleInstallClick = async () => {
    if (canInstall) {
      const accepted = await triggerPwaInstall();
      if (accepted) {
        setDismissed(true);
      }
    } else if (isIos()) {
      setShowIosGuide(true);
    }
  };

  const isIosDevice = isIos();

  // If neither Android install prompt is ready nor on iOS, don't show
  if (!canInstall && !isIosDevice) {
    return null;
  }

  return (
    <>
      <div className="pwa-install-banner" role="banner" aria-label="Install App">
        <div className="pwa-install-content">
          <img src="/icons/icon-192x192.png" alt="FlexiERP" className="pwa-install-icon" />
          <div className="pwa-install-text">
            <span className="pwa-install-title">Install FlexiERP App</span>
            <span className="pwa-install-desc">Fast offline access & floor barcode scanning</span>
          </div>
        </div>
        <div className="pwa-install-actions">
          <button
            type="button"
            className="pwa-btn-install"
            onClick={handleInstallClick}
            aria-label="Install FlexiERP on your device"
          >
            <Download size={15} /> Install
          </button>
          <button
            type="button"
            className="pwa-btn-dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* iOS Safari Step-by-Step Install Sheet */}
      {showIosGuide && (
        <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setShowIosGuide(false)}>
          <div className="modal-content glass-panel pwa-ios-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img src="/icons/icon-192x192.png" alt="FlexiERP Logo" style={{ width: '36px', height: '36px', borderRadius: '8px' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
                  Install on iOS (iPhone / iPad)
                </h3>
              </div>
              <button type="button" className="btn-secondary" style={{ padding: '4px 8px' }} onClick={() => setShowIosGuide(false)}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.86rem', color: '#475569', marginBottom: '16px' }}>
              Install <strong>FlexiERP</strong> on your home screen for full-screen standalone performance:
            </p>

            <div className="pwa-ios-step">
              <span className="pwa-step-num">1</span>
              <div>
                Tap the <strong>Share</strong> button in Safari's bottom toolbar
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px', color: '#0284c7' }}>
                  <Share size={16} />
                </div>
              </div>
            </div>

            <div className="pwa-ios-step">
              <span className="pwa-step-num">2</span>
              <div>
                Scroll down in the options menu and select <strong>Add to Home Screen</strong>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px', color: '#0284c7' }}>
                  <PlusSquare size={16} />
                </div>
              </div>
            </div>

            <div className="pwa-ios-step">
              <span className="pwa-step-num">3</span>
              <div>
                Tap <strong>Add</strong> in the top right corner. The app icon will appear on your home screen!
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary" onClick={() => setShowIosGuide(false)} style={{ padding: '8px 18px' }}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
