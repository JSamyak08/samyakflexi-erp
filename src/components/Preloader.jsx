import React, { useState, useEffect, useRef } from 'react';
import { getCompanyLogo } from '../services/settingsService';

export default function Preloader({ onComplete, isReady = true, statusText }) {
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Loading FlexiERP...');
  const [isExiting, setIsExiting] = useState(false);
  const logoUrl = getCompanyLogo();
  const completedCalledRef = useRef(false);
  const forceCompleteRef = useRef(false);

  // Hard stop so a hung data fetch cannot leave the loader stuck
  useEffect(() => {
    const forceTimer = setTimeout(() => {
      forceCompleteRef.current = true;
    }, 8000);
    return () => clearTimeout(forceTimer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        let next;
        const ready = isReady || forceCompleteRef.current;
        if (!ready) {
          if (prev < 30) next = prev + 3;
          else if (prev < 60) next = prev + 2;
          else if (prev < 90) next = prev + 1;
          else next = Math.min(92, prev + 0.25);
        } else {
          next = Math.min(100, prev + (prev < 90 ? 10 : 6));
        }

        const pct = Math.floor(next);

        if (statusText) {
          setStatusMessage(statusText);
        } else {
          if (pct < 30) {
            setStatusMessage('Initializing system modules...');
          } else if (pct < 65) {
            setStatusMessage('Connecting to plant database...');
          } else if (pct < 92) {
            setStatusMessage('Loading records & inventory...');
          } else {
            setStatusMessage('Opening workspace...');
          }
        }

        if (pct >= 100) {
          clearInterval(interval);
          if (!completedCalledRef.current) {
            completedCalledRef.current = true;
            setIsExiting(true);
            setTimeout(() => {
              if (onComplete) onComplete();
            }, 220);
          }
        }

        return next;
      });
    }, 28);

    return () => clearInterval(interval);
  }, [isReady, statusText, onComplete]);

  return (
    <div
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin="0"
      aria-valuemax="100"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#ffffff',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        color: '#0f172a',
        padding: '24px',
        opacity: isExiting ? 0 : 1,
        transition: 'opacity 0.22s ease-out',
        WebkitFontSmoothing: 'antialiased'
      }}
    >
      {/* Central Brand & Loader Stack */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        width: '100%',
        maxWidth: '320px'
      }}>
        {/* Official Corporate Logo */}
        <div style={{ marginBottom: '28px' }}>
          <img 
            src={logoUrl || '/samyak-logo.png'} 
            alt="Samyak International Ltd" 
            style={{
              height: '46px',
              maxWidth: '220px',
              width: 'auto',
              objectFit: 'contain',
              display: 'block'
            }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>

        {/* Minimal Precision Progress Bar */}
        <div style={{
          width: '200px',
          height: '2.5px',
          background: '#f1f5f9',
          borderRadius: '999px',
          overflow: 'hidden',
          position: 'relative',
          marginBottom: '14px'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: '#0284c7',
            borderRadius: '999px',
            transition: 'width 0.1s linear',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.6) 50%, transparent 100%)',
              animation: 'preloaderShimmer 1.4s infinite'
            }}></div>
          </div>
        </div>

        {/* Quiet Corporate Status Note with Micro-Spinner */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: '#64748b',
          fontWeight: '500',
          letterSpacing: '-0.01em'
        }}>
          <span style={{
            width: '11px',
            height: '11px',
            borderRadius: '50%',
            border: '1.5px solid #cbd5e1',
            borderTopColor: '#0284c7',
            display: 'inline-block',
            animation: 'preloaderSpin 0.75s linear infinite'
          }}></span>
          <span>{statusMessage}</span>
        </div>
      </div>

      {/* Corporate Plant Footer */}
      <div style={{
        position: 'absolute',
        bottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
        left: 0,
        right: 0,
        textAlign: 'center',
        fontSize: '11px',
        fontWeight: '500',
        color: '#94a3b8',
        letterSpacing: '0.02em'
      }}>
        Samyak International Ltd • Indore Manufacturing Unit
      </div>

      {/* Clean Embedded Animations */}
      <style>{`
        @keyframes preloaderSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes preloaderShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
