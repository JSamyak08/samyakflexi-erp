import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, CloudCheck, AlertTriangle } from 'lucide-react';
import { FEEDBACK_EVENT_NAME } from '../utils/statusFeedback';

/**
 * Universal Animated Status Feedback Modal
 *
 * Renders an animated modal dialog across mobile and desktop for all major actions,
 * confirming whether data has been saved to the database or if an error occurred.
 */
export default function StatusFeedbackModal() {
  const [current, setCurrent] = useState(null);
  const timerRef = useRef(null);

  const handleClose = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (current && typeof current.onClose === 'function') {
      try {
        current.onClose();
      } catch (err) {
        console.error('[StatusFeedbackModal] onClose error:', err);
      }
    }
    setCurrent(null);
  }, [current]);

  const handlePrimary = useCallback(() => {
    if (current?.primaryAction && typeof current.primaryAction.onClick === 'function') {
      try {
        current.primaryAction.onClick();
      } catch (err) {
        console.error('[StatusFeedbackModal] primaryAction error:', err);
      }
    }
    handleClose();
  }, [current, handleClose]);

  const handleSecondary = useCallback(() => {
    if (current?.secondaryAction && typeof current.secondaryAction.onClick === 'function') {
      try {
        current.secondaryAction.onClick();
      } catch (err) {
        console.error('[StatusFeedbackModal] secondaryAction error:', err);
      }
    }
    handleClose();
  }, [current, handleClose]);

  useEffect(() => {
    const handleFeedbackEvent = (event) => {
      const data = event?.detail;
      if (!data) return;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      setCurrent(data);

      if (data.duration && data.duration > 0) {
        timerRef.current = setTimeout(() => {
          handleClose();
        }, data.duration);
      }
    };

    window.addEventListener(FEEDBACK_EVENT_NAME, handleFeedbackEvent);
    return () => {
      window.removeEventListener(FEEDBACK_EVENT_NAME, handleFeedbackEvent);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [handleClose]);

  // Handle escape key to dismiss
  useEffect(() => {
    if (!current) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Trigger primary action on Enter
        e.preventDefault();
        handlePrimary();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, handleClose, handlePrimary]);

  if (!current) return null;

  const isSuccess = current.type === 'success';
  const isError = current.type === 'error';
  const isWarning = current.type === 'warning';

  return (
    <div
      className="status-feedback-overlay"
      data-testid="status-feedback-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-feedback-title"
    >
      <div
        className="status-feedback-dialog glass-card"
        data-testid="status-feedback-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          className="status-feedback-close-btn"
          onClick={handleClose}
          aria-label="Close"
          data-testid="status-feedback-close-btn"
        >
          <X size={18} />
        </button>

        {/* Animated Icon Ring */}
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

        {/* Database Status Indicator Pill */}
        <div
          className={`status-db-pill ${current.dbSaved ? 'status-db-pill-success' : 'status-db-pill-error'}`}
          data-testid="status-db-pill"
        >
          <span className="status-db-dot" />
          {current.dbSaved ? 'Saved to Cloud Database' : 'Database Save Failed'}
        </div>

        {/* Title */}
        <h2
          id="status-feedback-title"
          className="status-feedback-title"
          data-testid="status-feedback-title"
        >
          {current.title}
        </h2>

        {/* Message */}
        {current.message && (
          <p className="status-feedback-message" data-testid="status-feedback-message">
            {current.message}
          </p>
        )}

        {/* Details Breakdown (Optional) */}
        {current.details && (
          <div className="status-feedback-details" data-testid="status-feedback-details">
            {typeof current.details === 'string' ? (
              <div className="status-feedback-details-text">{current.details}</div>
            ) : (
              current.details
            )}
          </div>
        )}

        {/* Actions Button Row */}
        <div className="status-feedback-actions">
          {current.secondaryAction && (
            <button
              type="button"
              className="btn-secondary status-feedback-btn-secondary"
              onClick={handleSecondary}
              data-testid="status-feedback-secondary-btn"
            >
              {current.secondaryAction.label || 'Dismiss'}
            </button>
          )}

          <button
            type="button"
            className={`btn-primary status-feedback-btn-primary ${isError ? 'status-feedback-btn-danger' : ''}`}
            onClick={handlePrimary}
            data-testid="status-feedback-primary-btn"
            autoFocus
          >
            {current.primaryAction?.label || (isError ? 'Dismiss' : 'Done')}
          </button>
        </div>

        {/* Auto-Dismiss Progress Bar */}
        {current.duration > 0 && (
          <div className="status-feedback-progress" aria-hidden="true">
            <div
              className="status-feedback-progress-bar"
              style={{ animationDuration: `${current.duration}ms` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
