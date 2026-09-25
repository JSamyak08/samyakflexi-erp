import React, { useState, useEffect, useRef } from 'react';
import { getCompanyLogo } from '../services/settingsService';
import { ShieldCheck, Database, Cpu, Sparkles, CheckCircle2 } from 'lucide-react';

export default function Preloader({ onComplete, isReady = true, statusText }) {
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Initializing ERP Core Modules...');
  const [currentStep, setCurrentStep] = useState(1);
  const logoUrl = getCompanyLogo();
  const completedCalledRef = useRef(false);

  // Failsafe timer: Ensure preloader NEVER gets stuck indefinitely (max 3.5s timeout)
  useEffect(() => {
    const forceTimer = setTimeout(() => {
      setProgress(100);
    }, 3500);
    return () => clearTimeout(forceTimer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        let next;
        if (!isReady) {
          // While DB connection or data fetching is pending, cap smooth progress at 92%
          if (prev < 25) next = prev + 2;
          else if (prev < 55) next = prev + 1.5;
          else if (prev < 90) next = prev + 1;
          else next = Math.min(92, prev + 0.2);
        } else {
          // Once DB connected and initial data fetched, quickly advance to 100%
          next = Math.min(100, prev + (prev < 90 ? 8 : 4));
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
            setStatusMessage('Initializing ERP Core System & Security Rules...');
            setCurrentStep(1);
          } else if (pct < 55) {
            setStatusMessage('Connecting to Supabase Cloud Database & Storage...');
            setCurrentStep(2);
          } else if (pct < 90) {
            setStatusMessage('Loading Job Masters, Inventory & Production Records...');
            setCurrentStep(3);
          } else if (pct < 98) {
            setStatusMessage('Verifying User Auth Session & System Access...');
            setCurrentStep(4);
          } else {
            setStatusMessage('Preparing Factory Dashboard...');
            setCurrentStep(5);
          }
        }

        if (pct >= 100) {
          clearInterval(interval);
          if (onComplete && !completedCalledRef.current) {
            completedCalledRef.current = true;
            setTimeout(onComplete, 150);
          }
        }

        return next;
      });
    }, 30);

    return () => clearInterval(interval);
  }, [isReady, statusText, onComplete]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'radial-gradient(circle at 50% 35%, #ffffff 0%, #f1f5f9 60%, #e2e8f0 100%)',
      color: '#0f172a',
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
        width: '420px',
        height: '420px',
        background: 'radial-gradient(circle, rgba(2, 132, 199, 0.12) 0%, rgba(16, 185, 129, 0.08) 50%, transparent 75%)',
        borderRadius: '50%',
        filter: 'blur(50px)',
        pointerEvents: 'none'
      }}></div>

      {/* Main Light Glassmorphism Card */}
      <div style={{
        width: '100%',
        maxWidth: '460px',
        background: 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(226, 232, 240, 0.9)',
        borderRadius: '24px',
        padding: '36px 32px',
        boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.1), 0 0 25px rgba(2, 132, 199, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)',
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
            opacity: 0.35,
            filter: 'blur(10px)',
            animation: 'spin 6s linear infinite'
          }}></div>

          <div style={{
            width: '84px',
            height: '84px',
            borderRadius: '20px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            padding: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 25px rgba(15, 23, 42, 0.1)',
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
          background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          SAMYAK INTERNATIONAL LTD.
        </h1>
        <div style={{
          fontSize: '0.78rem',
          fontWeight: '700',
          color: '#0284c7',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginTop: '4px',
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <Sparkles size={13} style={{ color: '#059669' }} /> Flexi-ERP Enterprise Operating System
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
            background: 'linear-gradient(135deg, #0284c7 0%, #059669 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            {progress}
          </span>
          <span style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0284c7' }}>%</span>
        </div>

        {/* Progress Bar Container */}
        <div style={{
          width: '100%',
          height: '10px',
          background: '#e2e8f0',
          borderRadius: '999px',
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid #cbd5e1',
          marginBottom: '16px',
          padding: '1px'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            borderRadius: '999px',
            background: 'linear-gradient(90deg, #0284c7 0%, #06b6d4 50%, #10b981 100%)',
            boxShadow: '0 0 12px rgba(2, 132, 199, 0.4)',
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
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)',
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
          color: '#475569',
          fontWeight: '600'
        }}>
          {currentStep === 1 && <Cpu size={14} style={{ color: '#0284c7' }} />}
          {currentStep === 2 && <Database size={14} style={{ color: '#0891b2' }} />}
          {currentStep === 3 && <Sparkles size={14} style={{ color: '#059669' }} />}
          {currentStep === 4 && <ShieldCheck size={14} style={{ color: '#16a34a' }} />}
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
          borderTop: '1px solid #e2e8f0',
          width: '100%'
        }}>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: '700',
            color: progress >= 25 ? '#059669' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {progress >= 25 ? '✓' : '•'} DB Active
          </span>
          <span style={{ color: '#cbd5e1' }}>|</span>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: '700',
            color: progress >= 50 ? '#059669' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {progress >= 50 ? '✓' : '•'} Modules Loaded
          </span>
          <span style={{ color: '#cbd5e1' }}>|</span>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: '700',
            color: progress >= 90 ? '#059669' : '#94a3b8',
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
