import React, { useState, useEffect, useRef } from 'react';
import { getCompanyLogo } from '../services/settingsService';
import { ShieldCheck, Database, Cpu, Sparkles, CheckCircle2, Zap } from 'lucide-react';

export default function Preloader({ onComplete, isReady = true, statusText }) {
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Initializing ERP Core Engine...');
  const [currentStep, setCurrentStep] = useState(1);
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
          if (pct >= 90) setCurrentStep(5);
          else if (pct >= 60) setCurrentStep(3);
          else if (pct >= 30) setCurrentStep(2);
          else setCurrentStep(1);
        } else {
          if (pct < 25) {
            setStatusMessage('Initializing Core Modules & Security Rules...');
            setCurrentStep(1);
          } else if (pct < 55) {
            setStatusMessage('Connecting to Supabase Cloud Database & Storage...');
            setCurrentStep(2);
          } else if (pct < 88) {
            setStatusMessage('Loading Job Masters, Inventory & Production Records...');
            setCurrentStep(3);
          } else if (pct < 98) {
            setStatusMessage('Synchronizing User Session & RBAC Permissions...');
            setCurrentStep(4);
          } else {
            setStatusMessage('Factory Operating System Ready');
            setCurrentStep(5);
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
        background: 'radial-gradient(ellipse at 50% 35%, #0f172a 0%, #090d16 65%, #020617 100%)',
        color: '#ffffff',
        fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
        padding: 'max(20px, env(safe-area-inset-top, 20px)) max(16px, env(safe-area-inset-right, 16px)) max(20px, env(safe-area-inset-bottom, 20px)) max(16px, env(safe-area-inset-left, 16px))',
        overflow: 'hidden',
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? 'scale(1.02)' : 'scale(1)',
        transition: 'opacity 0.26s ease-out, transform 0.26s ease-out',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Ambient Multi-Glow Background Effect */}
      <div style={{
        position: 'absolute',
        top: '30%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(440px, 90vw)',
        height: 'min(440px, 90vw)',
        background: 'radial-gradient(circle, rgba(2, 132, 199, 0.22) 0%, rgba(6, 182, 212, 0.12) 40%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(60px)',
        pointerEvents: 'none'
      }}></div>

      {/* Main Glassmorphism Card */}
      <div style={{
        width: '100%',
        maxWidth: '440px',
        background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.88) 0%, rgba(9, 13, 22, 0.94) 100%)',
        backdropFilter: 'blur(24px) saturate(190%)',
        WebkitBackdropFilter: 'blur(24px) saturate(190%)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '24px',
        padding: '32px 24px',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 40px rgba(2, 132, 199, 0.18)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        position: 'relative',
        zIndex: 2,
        boxSizing: 'border-box'
      }}>
        {/* Animated Brand Emblem Header */}
        <div style={{
          position: 'relative',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          {/* Conic Ring Halo */}
          <div style={{
            position: 'absolute',
            inset: '-10px',
            borderRadius: '26px',
            background: 'conic-gradient(from 0deg, #0284c7, #06b6d4, #10b981, #38bdf8, #0284c7)',
            opacity: 0.55,
            filter: 'blur(12px)',
            animation: 'preloaderSpin 5s linear infinite'
          }}></div>

          <div style={{
            width: '78px',
            height: '78px',
            borderRadius: '20px',
            background: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            padding: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45)',
            position: 'relative',
            zIndex: 1
          }}>
            <img 
              src={logoUrl || '/samyak-logo.png'} 
              alt="Samyak Logo" 
              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        </div>

        {/* Company Title & System Badges */}
        <div style={{
          fontSize: '0.72rem',
          fontWeight: '800',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#38bdf8',
          background: 'rgba(2, 132, 199, 0.18)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          padding: '4px 12px',
          borderRadius: '999px',
          marginBottom: '10px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px'
        }}>
          <Zap size={11} style={{ color: '#38bdf8' }} /> FlexiERP 2.0 Enterprise OS
        </div>

        <h1 style={{
          fontSize: '1.35rem',
          fontWeight: '900',
          letterSpacing: '0.03em',
          margin: 0,
          background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: 1.25
        }}>
          SAMYAK INTERNATIONAL LTD.
        </h1>

        <div style={{
          fontSize: '0.78rem',
          fontWeight: '500',
          color: '#94a3b8',
          marginTop: '4px',
          marginBottom: '24px'
        }}>
          Production Automation & Resource Planning
        </div>

        {/* Percentage Counter Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'center',
          gap: '4px',
          marginBottom: '12px'
        }}>
          <span style={{
            fontSize: '3rem',
            fontWeight: '900',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            background: 'linear-gradient(135deg, #ffffff 0%, #38bdf8 60%, #34d399 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.02em'
          }}>
            {progress}
          </span>
          <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#38bdf8' }}>%</span>
        </div>

        {/* Modern Shimmer Progress Bar */}
        <div style={{
          width: '100%',
          height: '8px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '999px',
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          marginBottom: '16px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            borderRadius: '999px',
            background: 'linear-gradient(90deg, #0284c7 0%, #06b6d4 50%, #10b981 100%)',
            boxShadow: '0 0 16px rgba(6, 182, 212, 0.65)',
            transition: 'width 0.08s ease-out',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Shimmer Highlight */}
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

        {/* Live Status Message */}
        <div style={{
          minHeight: '26px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          fontSize: '0.8rem',
          color: '#e2e8f0',
          fontWeight: '600'
        }}>
          <span className="preloader-pulse-dot" style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: progress >= 90 ? '#10b981' : '#38bdf8',
            boxShadow: `0 0 8px ${progress >= 90 ? '#10b981' : '#38bdf8'}`,
            animation: 'dotPulse 1.2s ease-in-out infinite'
          }}></span>
          {currentStep === 1 && <Cpu size={14} style={{ color: '#38bdf8' }} />}
          {currentStep === 2 && <Database size={14} style={{ color: '#06b6d4' }} />}
          {currentStep === 3 && <Sparkles size={14} style={{ color: '#10b981' }} />}
          {currentStep === 4 && <ShieldCheck size={14} style={{ color: '#34d399' }} />}
          {currentStep === 5 && <CheckCircle2 size={14} style={{ color: '#10b981' }} />}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '320px' }}>
            {statusMessage}
          </span>
        </div>

        {/* 5-Step System Milestone Indicators */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          marginTop: '22px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          width: '100%',
          fontSize: '0.66rem',
          fontWeight: '700'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: progress >= 20 ? '#34d399' : '#64748b' }}>
            <span>{progress >= 20 ? '✓' : '1'}</span>
            <span>Core</span>
          </div>
          <span style={{ color: '#334155' }}>•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: progress >= 45 ? '#34d399' : '#64748b' }}>
            <span>{progress >= 45 ? '✓' : '2'}</span>
            <span>Cloud DB</span>
          </div>
          <span style={{ color: '#334155' }}>•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: progress >= 75 ? '#34d399' : '#64748b' }}>
            <span>{progress >= 75 ? '✓' : '3'}</span>
            <span>Records</span>
          </div>
          <span style={{ color: '#334155' }}>•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: progress >= 95 ? '#34d399' : '#64748b' }}>
            <span>{progress >= 95 ? '✓' : '4'}</span>
            <span>RBAC</span>
          </div>
        </div>
      </div>

      {/* Embedded Modern Keyframe Animations */}
      <style>{`
        @keyframes preloaderSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes preloaderShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}
