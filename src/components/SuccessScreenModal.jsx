import React, { useState, useEffect } from 'react';
import { 
  Copy, 
  Check, 
  X, 
  Database, 
  ArrowRight,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { useSuccessModal } from '../context/SuccessModalContext';

export default function SuccessScreenModal() {
  const { isOpen, successData, hideSuccess } = useSuccessModal();
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(100);

  // Extract properties
  const isError = Boolean(successData?.isError || successData?.type === 'error');
  const isWarning = Boolean(successData?.type === 'warning');
  const isSuccess = !isError && !isWarning;

  const defaultTitle = isError 
    ? 'Database Save Failed' 
    : (isWarning ? 'Action Warning' : 'Record Successfully Saved!');
  const title = successData?.title || defaultTitle;

  const defaultMessage = isError
    ? (successData?.error || 'The entry could not be saved to the database. Please review the details below.')
    : (successData?.subtitle || 'Your entry has been securely stored in the cloud database and synced across the platform.');
  const message = successData?.message || defaultMessage;

  const entityType = successData?.entityType || (isError ? 'Error Reference' : 'Record');
  const recordId = successData?.recordId || successData?.id || '';
  const details = successData?.details || [];
  const primaryActionText = successData?.primaryActionText || (isError ? 'Dismiss' : 'Done');
  const secondaryActionText = successData?.secondaryActionText;
  const onSecondaryAction = successData?.onSecondaryAction;
  const onPrimaryAction = successData?.onPrimaryAction;
  const autoCloseDuration = isError ? 0 : (successData?.autoCloseDuration || 0); // errors don't auto close
  const isCloudSynced = isError ? false : (successData?.isCloudSynced !== false);

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
      className="status-feedback-overlay success-screen-overlay"
      data-testid="status-feedback-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10800,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      onClick={hideSuccess}
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-feedback-title"
    >
      <div 
        className="status-feedback-dialog success-screen-card"
        data-testid="status-feedback-modal"
        style={{
          width: '540px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: '22px',
          boxShadow: isError
            ? '0 25px 60px -15px rgba(220, 38, 38, 0.35), 0 0 0 1px rgba(239, 68, 68, 0.25)'
            : '0 25px 60px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(16, 185, 129, 0.2)',
          position: 'relative',
          animation: 'statusPopupEnter 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          textAlign: 'center',
          padding: 0
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Bar */}
        <div 
          style={{
            height: '6px',
            width: '100%',
            background: isError 
              ? 'linear-gradient(90deg, #ef4444 0%, #f97316 50%, #dc2626 100%)' 
              : 'linear-gradient(90deg, #10b981 0%, #06b6d4 50%, #6366f1 100%)',
            borderTopLeftRadius: '22px',
            borderTopRightRadius: '22px'
          }}
        />

        {/* Close button */}
        <button
          type="button"
          onClick={hideSuccess}
          className="status-feedback-close-btn"
          data-testid="status-feedback-close-btn"
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
            transition: 'all 0.15s ease',
            zIndex: 3
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Modal Body */}
        <div style={{ padding: '32px 28px 24px', textAlign: 'center' }}>
          
          {/* Animated Success Tick or Error Cross */}
          {isSuccess && (
            <div className="status-feedback-icon status-feedback-icon-success" data-testid="status-feedback-tick">
              <div className="status-feedback-pulse-ring" />
              <svg className="status-checkmark-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle className="status-checkmark-circle" cx="26" cy="26" r="23" fill="none" />
                <path className="status-checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
              </svg>
            </div>
          )}

          {isError && (
            <div className="status-feedback-icon status-feedback-icon-error" data-testid="status-feedback-error">
              <div className="status-feedback-pulse-ring status-feedback-pulse-error" />
              <svg className="status-error-svg" viewBox="0 0 52 52" aria-hidden="true">
                <circle className="status-error-circle" cx="26" cy="26" r="23" fill="none" />
                <path className="status-error-cross1" fill="none" d="M16 16 36 36" />
                <path className="status-error-cross2" fill="none" d="M36 16 16 36" />
              </svg>
            </div>
          )}

          {isWarning && (
            <div className="status-feedback-icon status-feedback-icon-warning">
              <div className="status-feedback-pulse-ring status-feedback-pulse-warning" />
              <div className="status-warning-badge">
                <AlertTriangle size={36} />
              </div>
            </div>
          )}

          {/* Heading */}
          <h2 
            id="status-feedback-title"
            className="status-feedback-title"
            data-testid="status-feedback-title"
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
            className="status-feedback-message"
            data-testid="status-feedback-message"
            style={{
              fontSize: '0.88rem',
              color: '#64748b',
              margin: '0 auto 16px',
              maxWidth: '460px',
              lineHeight: 1.5
            }}
          >
            {message}
          </p>

          {/* Database Verification Status Bar */}
          <div 
            className={`status-db-pill ${isCloudSynced ? 'status-db-pill-success' : 'status-db-pill-error'}`}
            data-testid="status-db-pill"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              padding: '6px 14px',
              borderRadius: '999px',
              marginBottom: '18px'
            }}
          >
            <Database size={13} />
            <span style={{ fontWeight: '700' }}>
              {isCloudSynced ? 'Committed to Cloud Database & Synced' : 'Database Save Failed / Uncommitted'}
            </span>
          </div>

          {/* Record Reference Badge */}
          {recordId && (
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: isError ? '#fef2f2' : '#f0fdf4',
                border: isError ? '1px solid #fecaca' : '1px solid #bbf7d0',
                borderRadius: '10px',
                padding: '6px 14px',
                marginBottom: '18px',
                fontSize: '0.82rem'
              }}
            >
              <span style={{ color: isError ? '#991b1b' : '#166534', fontWeight: '600' }}>
                {entityType}:
              </span>
              <code 
                style={{
                  fontWeight: '800',
                  color: isError ? '#dc2626' : '#15803d',
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
              className="status-feedback-details"
              data-testid="status-feedback-details"
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
                <span>Transaction & Specification Details</span>
                <span style={{ color: isError ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'none', fontWeight: '700' }}>
                  <ShieldCheck size={13} /> {isError ? 'Action Unverified' : 'Verified'}
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

          {/* Action Buttons */}
          <div 
            className="status-feedback-actions"
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
                className="btn-secondary status-feedback-btn-secondary"
                data-testid="status-feedback-secondary-btn"
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
              className={`btn-primary status-feedback-btn-primary ${isError ? 'status-feedback-btn-danger' : ''}`}
              data-testid="status-feedback-primary-btn"
              autoFocus
              style={{
                background: isError 
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                  : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
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
                boxShadow: isError 
                  ? '0 4px 14px 0 rgba(239, 68, 68, 0.4)' 
                  : '0 4px 14px 0 rgba(16, 185, 129, 0.4)',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { 
                e.currentTarget.style.transform = 'translateY(-1px)'; 
                e.currentTarget.style.boxShadow = isError 
                  ? '0 6px 20px 0 rgba(239, 68, 68, 0.5)' 
                  : '0 6px 20px 0 rgba(16, 185, 129, 0.5)'; 
              }}
              onMouseLeave={(e) => { 
                e.currentTarget.style.transform = 'none'; 
                e.currentTarget.style.boxShadow = isError 
                  ? '0 4px 14px 0 rgba(239, 68, 68, 0.4)' 
                  : '0 4px 14px 0 rgba(16, 185, 129, 0.4)'; 
              }}
            >
              {primaryActionText}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Auto-close Progress Bar (if countdown enabled) */}
        {autoCloseDuration > 0 && (
          <div 
            className="status-feedback-progress"
            style={{
              height: '3px',
              width: '100%',
              background: '#e2e8f0',
              overflow: 'hidden',
              borderBottomLeftRadius: '22px',
              borderBottomRightRadius: '22px'
            }}
          >
            <div 
              className="status-feedback-progress-bar"
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
    </div>
  );
}
