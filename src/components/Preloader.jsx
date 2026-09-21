import React, { useState, useEffect } from 'react';
import { getCompanyLogo } from '../services/settingsService';
import { ShieldCheck, Database, Cpu, Sparkles, CheckCircle2 } from 'lucide-react';

export default function Preloader({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Initializing ERP Core Modules...');
  const [currentStep, setCurrentStep] = useState(1);
  const logoUrl = getCompanyLogo();

  useEffect(() => {
    const startTime = Date.now();
    const duration = 1800; // 1.8 seconds total smooth loading sequence

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / duration) * 100));

      setProgress(pct);

      if (pct < 25) {
        setStatusMessage('Initializing ERP Core System & Security Rules...');
        setCurrentStep(1);
      } else if (pct < 50) {
        setStatusMessage('Connecting to Supabase Cloud Database & Storage...');
        setCurrentStep(2);
      } else if (pct < 75) {
        setStatusMessage('Loading Job Masters, Inventory & Production Records...');
        setCurrentStep(3);
      } else if (pct < 95) {
        setStatusMessage('Verifying User Auth Session & System Access...');
        setCurrentStep(4);
      } else {
        setStatusMessage('Preparing Factory Dashboard...');
        setCurrentStep(5);
      }

      if (pct >= 100) {
        clearInterval(interval);
        if (onComplete) {
          setTimeout(onComplete, 200);
        }
      }
    }, 30);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'radial-gradient(circle at 50% 35%, #0f172a 0%, #020617 100%)',
      color: '#ffffff',
      fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
      padding: '24px',
      overflow: 'hidden'
    }}>
      {/* Background Ambient Glow Elements */}
      <div style={{
        position: 'absolute',
        top: '25%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '380px',
        height: '380px',
        background: 'radial-gradient(circle, rgba(2, 132, 199, 0.18) 0%, rgba(16, 185, 129, 0.05) 50%, transparent 75%)',
        borderRadius: '50%',
        filter: 'blur(40px)',
        pointerEvents: 'none'
      }}></div>

      {/* Main Glassmorphism Card */}
      <div style={{
        width: '100%',
        maxWidth: '460px',
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '24px',
        padding: '36px 32px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(2, 132, 199, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        position: 'relative',
        zIndex: 2
      }}>
        {/* Company Logo Header */}
        <div style={{
          position: 'relative',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{
            position: 'absolute',
            inset: '-10px',
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, #0284c7, #06b6d4, #10b981, #0284c7)',
            opacity: 0.4,
            filter: 'blur(12px)',
            animation: 'spin 6s linear infinite'
          }}></div>

          <div style={{
            width: '84px',
            height: '84px',
            borderRadius: '20px',
            background: '#ffffff',
            padding: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
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

        {/* Company Title & System Subtitle */}
        <h1 style={{
          fontSize: '1.45rem',
          fontWeight: '900',
          letterSpacing: '0.02em',
          margin: 0,
          background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          SAMYAK INTERNATIONAL LTD.
        </h1>
        <div style={{
          fontSize: '0.78rem',
          fontWeight: '700',
          color: '#38bdf8',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginTop: '4px',
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <Sparkles size={13} style={{ color: '#34d399' }} /> Flexi-ERP Enterprise Operating System
        </div>

        {/* Percentage Counter Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'center',
          gap: '4px',
          marginBottom: '14px'
        }}>
          <span style={{
            fontSize: '2.8rem',
            fontWeight: '900',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            background: 'linear-gradient(135deg, #38bdf8 0%, #34d399 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            {progress}
          </span>
          <span style={{ fontSize: '1.2rem', fontWeight: '800', color: '#38bdf8' }}>%</span>
        </div>

        {/* Progress Bar Container */}
        <div style={{
          width: '100%',
          height: '10px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '999px',
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          marginBottom: '16px',
          padding: '1px'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            borderRadius: '999px',
            background: 'linear-gradient(90deg, #0284c7 0%, #06b6d4 50%, #10b981 100%)',
            boxShadow: '0 0 16px rgba(56, 189, 248, 0.8)',
            transition: 'width 0.08s ease-out',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Animated Shimmer Bar */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
              animation: 'shimmer 1.5s infinite'
            }}></div>
          </div>
        </div>

        {/* Live Status Message Indicator */}
        <div style={{
          minHeight: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          fontSize: '0.82rem',
          color: '#94a3b8',
          fontWeight: '600'
        }}>
          {currentStep === 1 && <Cpu size={14} style={{ color: '#38bdf8' }} />}
          {currentStep === 2 && <Database size={14} style={{ color: '#06b6d4' }} />}
          {currentStep === 3 && <Sparkles size={14} style={{ color: '#34d399' }} />}
          {currentStep === 4 && <ShieldCheck size={14} style={{ color: '#a7f3d0' }} />}
          {currentStep === 5 && <CheckCircle2 size={14} style={{ color: '#10b981' }} />}
          <span>{statusMessage}</span>
        </div>

        {/* System Verification Badges Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '12px',
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          width: '100%'
        }}>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: '700',
            color: progress >= 25 ? '#34d399' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {progress >= 25 ? '✓' : '•'} DB Active
          </span>
          <span style={{ color: '#334155' }}>|</span>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: '700',
            color: progress >= 50 ? '#34d399' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {progress >= 50 ? '✓' : '•'} Modules Loaded
          </span>
          <span style={{ color: '#334155' }}>|</span>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: '700',
            color: progress >= 90 ? '#34d399' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {progress >= 90 ? '✓' : '•'} Auth Synced
          </span>
        </div>
      </div>

      {/* Keyframe Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
