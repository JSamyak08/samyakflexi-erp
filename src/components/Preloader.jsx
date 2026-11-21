import React, { useState, useEffect, useRef } from 'react';
import { getCompanyLogo } from '../services/settingsService';

export default function Preloader({ onComplete, isReady = true, statusText }) {
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Initializing ERP Core Engine...');
  const [isExiting, setIsExiting] = useState(false);
  const logoUrl = getCompanyLogo();
  const completedCalledRef = useRef(false);
  const forceCompleteRef = useRef(false);

  // Hard stop so a hung data fetch cannot leave the bar clamped at 92%.
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
          // While DB connection or data fetching is pending, cap smooth progress at 92%
          if (prev < 25) next = prev + 2.5;
          else if (prev < 55) next = prev + 1.8;
          else if (prev < 88) next = prev + 1.2;
          else next = Math.min(92, prev + 0.25);
        } else {
          // Once DB connected and initial data fetched, quickly advance to 100%
          next = Math.min(100, prev + (prev < 90 ? 8 : 5));
        }

        const pct = Math.floor(next);

        if (statusText) {
          setStatusMessage(statusText);
        } else {
          if (pct < 25) {
            setStatusMessage('Initializing Core Modules...');
          } else if (pct < 55) {
            setStatusMessage('Connecting to Database & Cloud Storage...');
          } else if (pct < 88) {
            setStatusMessage('Loading Inventory & Production Records...');
          } else if (pct < 98) {
            setStatusMessage('Verifying User Permissions...');
          } else {
            setStatusMessage('Loading Workspace...');
          }
        }

        if (pct >= 100) {
          clearInterval(interval);
          if (!completedCalledRef.current) {
            completedCalledRef.current = true;
            setIsExiting(true);
            setTimeout(() => {
              if (onComplete) onComplete();
            }, 260);
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
        background: 'radial-gradient(circle at 50% 45%, #ffffff 0%, #f8fafc 70%, #f1f5f9 100%)',
        color: '#0f172a',
        fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
        padding: '24px',
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? 'scale(1.01)' : 'scale(1)',
        transition: 'opacity 0.26s ease-out, transform 0.26s ease-out',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Clean Centered Brand Stack */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        maxWidth: '380px',
        width: '100%'
      }}>
        {/* Logo Container with Subtle Elevation */}
        <div style={{
          position: 'relative',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {/* Subtle Outer Spinner Ring */}
          <div style={{
            position: 'absolute',
            inset: '-10px',
            borderRadius: '50%',
            border: '2px dashed rgba(2, 132, 199, 0.25)',
            animation: 'preloaderSpin 12s linear infinite'
          }}></div>

          <div style={{
            width: '84px',
            height: '84px',
            borderRadius: '22px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px'
          }}>
            <img 
              src={logoUrl || '/samyak-logo.png'} 
              alt="Samyak Logo" 
              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        </div>

        {/* Brand & System Names */}
        <h1 style={{
          fontSize: '1.15rem',
          fontWeight: '800',
          letterSpacing: '0.04em',
          margin: '0 0 4px 0',
          color: '#0f172a',
          textTransform: 'uppercase'
        }}>
          Samyak International Ltd
        </h1>

        <div style={{
          fontSize: '0.8rem',
          fontWeight: '600',
          color: '#0284c7',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '20px'
        }}>
          FlexiERP Operating System
        </div>

        {/* Minimalist Progress Track */}
        <div style={{
          width: '240px',
          height: '4px',
          background: '#e2e8f0',
          borderRadius: '999px',
          overflow: 'hidden',
          position: 'relative',
          marginBottom: '12px'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            borderRadius: '999px',
            background: 'linear-gradient(90deg, #0284c7 0%, #0ea5e9 100%)',
            transition: 'width 0.08s ease-out',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.7) 50%, transparent 100%)',
              animation: 'preloaderShimmer 1.5s infinite'
            }}></div>
          </div>
        </div>

        {/* Status Text & Subtle Percentage */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '240px',
          fontSize: '0.78rem',
          color: '#64748b',
          fontWeight: '500'
        }}>
          <span style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '190px'
          }}>
            {statusMessage}
          </span>
          <span style={{
            fontWeight: '700',
            color: '#0284c7',
            fontVariantNumeric: 'tabular-nums'
          }}>
            {progress}%
          </span>
        </div>
      </div>

      {/* Embedded Animations */}
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
