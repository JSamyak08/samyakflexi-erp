import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Copy, 
  Check, 
  X, 
  ExternalLink, 
  Database, 
  ArrowRight,
  ShieldCheck,
  FileCheck,
  Sparkles,
  Printer,
  Download
} from 'lucide-react';
import { useSuccessModal } from '../context/SuccessModalContext';

export default function SuccessScreenModal() {
  const { isOpen, successData, hideSuccess } = useSuccessModal();
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(100);

  // Extract properties
  const title = successData?.title || 'Record Successfully Saved!';
  const message = successData?.message || successData?.subtitle || 'Your entry has been securely stored in the database and synced across the platform.';
  const entityType = successData?.entityType || 'Record';
  const recordId = successData?.recordId || successData?.id || '';
  const details = successData?.details || [];
  const primaryActionText = successData?.primaryActionText || 'Done';
  const secondaryActionText = successData?.secondaryActionText;
  const onSecondaryAction = successData?.onSecondaryAction;
  const onPrimaryAction = successData?.onPrimaryAction;
  const autoCloseDuration = successData?.autoCloseDuration || 0; // ms, 0 means no auto-close
  const isCloudSynced = successData?.isCloudSynced !== false; // default true

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        hideSuccess();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hideSuccess]);

  // Handle auto-close countdown if set
  useEffect(() => {
    if (!isOpen || !autoCloseDuration || autoCloseDuration <= 0) {
      setCountdown(100);
      return;
    }

    const intervalTime = 50;
    const totalSteps = autoCloseDuration / intervalTime;
    const stepDecrement = 100 / totalSteps;

    setCountdown(100);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= stepDecrement) {
          clearInterval(timer);
          hideSuccess();
          return 0;
        }
        return prev - stepDecrement;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isOpen, autoCloseDuration, hideSuccess]);

  if (!isOpen) return null;

  const handleCopyId = () => {
    if (!recordId) return;
    navigator.clipboard.writeText(String(recordId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrimaryClick = () => {
    if (onPrimaryAction) {
      onPrimaryAction();
    }
    hideSuccess();
  };

  const handleSecondaryClick = () => {
    if (onSecondaryAction) {
      onSecondaryAction();
    }
    hideSuccess();
  };

  return (
    <div 
      className="success-screen-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      onClick={hideSuccess}
    >
      <div 
        className="success-screen-card"
        style={{
          width: '540px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(16, 185, 129, 0.2)',
          position: 'relative',
          animation: 'slideUpScale 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Celebration Accent Bar */}
        <div 
          style={{
            height: '6px',
            width: '100%',
            background: 'linear-gradient(90deg, #10b981 0%, #06b6d4 50%, #6366f1 100%)',
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px'
          }}
        />

        {/* Close button */}
        <button
          type="button"
          onClick={hideSuccess}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: '#f1f5f9',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Modal Body */}
        <div style={{ padding: '32px 28px 24px', textAlign: 'center' }}>
          {/* Animated Success Icon with pulsing rings */}
          <div style={{ position: 'relative', display: 'inline-flex', marginBottom: '20px' }}>
            <div 
              style={{
                position: 'absolute',
                inset: '-8px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                animation: 'pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
              }}
            />
            <div 
              style={{
                position: 'absolute',
                inset: '-16px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.08)',
                animation: 'pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite 0.5s'
              }}
            />
            <div 
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.45)',
                position: 'relative',
                zIndex: 1
              }}
            >
              <CheckCircle2 size={40} strokeWidth={2.6} />
            </div>
          </div>

          {/* Heading */}
          <h2 
            style={{
              fontSize: '1.45rem',
              fontWeight: '800',
              color: '#0f172a',
              margin: '0 0 8px 0',
              letterSpacing: '-0.02em',
              lineHeight: 1.25
            }}
          >
            {title}
          </h2>

          {/* Subtitle / Explanatory message */}
          <p 
            style={{
              fontSize: '0.88rem',
              color: '#64748b',
              margin: '0 auto 18px',
              maxWidth: '440px',
              lineHeight: 1.5
            }}
          >
            {message}
          </p>

          {/* Record Reference Badge */}
          {recordId && (
            <div 
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '10px',
                padding: '6px 14px',
                marginBottom: '20px',
                fontSize: '0.82rem'
              }}
            >
              <span style={{ color: '#166534', fontWeight: '600' }}>
                {entityType} Reference:
              </span>
              <code 
                style={{
                  fontWeight: '800',
                  color: '#15803d',
                  fontFamily: 'monospace',
                  letterSpacing: '0.02em'
                }}
              >
                {recordId}
              </code>
              <button
                type="button"
                onClick={handleCopyId}
                title="Copy Reference ID"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: copied ? '#16a34a' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px',
                  borderRadius: '4px',
                  marginLeft: '2px'
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          )}

          {/* Submission Details Card */}
          {Array.isArray(details) && details.length > 0 && (
            <div 
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px 16px',
                marginBottom: '20px',
                textAlign: 'left'
              }}
            >
              <div 
                style={{
                  fontSize: '0.72rem',
                  fontWeight: '800',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span>Transaction & Attribute Details</span>
                <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'none', fontWeight: '700' }}>
                  <ShieldCheck size={13} /> Verified
                </span>
              </div>

              <div 
                style={{
                  display: 'grid',
                  gridTemplateColumns: details.length > 3 ? 'repeat(2, 1fr)' : '1fr',
                  gap: '10px 14px'
                }}
              >
                {details.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: '600' }}>
                      {item.label}
                    </span>
                    <span 
                      style={{
                        fontSize: '0.86rem',
                        fontWeight: '700',
                        color: '#0f172a',
                        wordBreak: 'break-word',
                        marginTop: '1px'
                      }}
                    >
                      {item.value || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cloud Storage Verification Bar */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              color: '#059669',
              background: '#ecfdf5',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #d1fae5',
              marginBottom: '22px'
            }}
          >
            <Database size={13} />
            <span style={{ fontWeight: '600' }}>
              {isCloudSynced ? 'Permanently Committed to Supabase Database & Synced' : 'Saved to Local Store & Ledger'}
            </span>
          </div>

          {/* Action Buttons */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              flexWrap: 'wrap'
            }}
          >
            {secondaryActionText && (
              <button
                type="button"
                onClick={handleSecondaryClick}
                className="btn-secondary"
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                {secondaryActionText}
              </button>
            )}

            <button
              type="button"
              onClick={handlePrimaryClick}
              style={{
                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '10px 28px',
                borderRadius: '10px',
                fontSize: '0.9rem',
                fontWeight: '800',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.4)',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px 0 rgba(16, 185, 129, 0.5)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px 0 rgba(16, 185, 129, 0.4)'; }}
            >
              {primaryActionText}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Auto-close Progress Bar (if countdown enabled) */}
        {autoCloseDuration > 0 && (
          <div 
            style={{
              height: '3px',
              width: '100%',
              background: '#e2e8f0',
              overflow: 'hidden',
              borderBottomLeftRadius: '20px',
              borderBottomRightRadius: '20px'
            }}
          >
            <div 
              style={{
                height: '100%',
                width: `${countdown}%`,
                background: '#10b981',
                transition: 'width 0.05s linear'
              }}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUpScale {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulseRing {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 0.3; }
          100% { transform: scale(1.3); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
