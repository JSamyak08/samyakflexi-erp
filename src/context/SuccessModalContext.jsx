import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Custom event names for decoupled triggers
export const SUCCESS_EVENT_NAME = 'app:show-success-screen';
export const ERROR_EVENT_NAME = 'app:show-error-screen';
export const FEEDBACK_EVENT_NAME = 'erp-status-feedback';

export const SuccessModalContext = createContext({
  showSuccess: () => {},
  showError: () => {},
  hideSuccess: () => {},
  successData: null,
  isOpen: false,
});

/**
 * Global helper that can be called from ANY function, service, or component
 * to display an animated success popup confirming database save.
 * 
 * Usage:
 * showSuccessScreen({
 *   title: "Job Punched Successfully!",
 *   message: "Order SIL/26-27/042 and OCN have been saved to the database.",
 *   entityType: "Order",
 *   recordId: "SIL/26-27/042",
 *   details: [
 *     { label: "Job Name", value: "Purasure Elaichi Chai 100 Gm" },
 *     { label: "Client", value: "Oyster Exim Private Limited" },
 *     { label: "Order Qty", value: "600 Kg" }
 *   ],
 *   primaryActionText: "View Order Confirmation Note (PDF)",
 *   onPrimaryAction: () => setShowPDFModal(true)
 * });
 */
export function showSuccessScreen(options) {
  if (typeof window !== 'undefined') {
    const payload = {
      type: 'success',
      isError: false,
      isCloudSynced: true,
      ...options,
    };
    window.dispatchEvent(new CustomEvent(SUCCESS_EVENT_NAME, { detail: payload }));
  }
}

/**
 * Global helper that can be called from ANY function, service, or component
 * to display an animated error popup explaining why data was not saved to database.
 * 
 * Usage:
 * showErrorScreen({
 *   title: "Job Punching Failed",
 *   message: "The sales order or OCN could not be saved to the database.",
 *   error: err.message,
 *   details: [
 *     { label: "Reason", value: err.message }
 *   ]
 * });
 */
export function showErrorScreen(options) {
  if (typeof window !== 'undefined') {
    const payload = {
      type: 'error',
      isError: true,
      isCloudSynced: false,
      title: options?.title || 'Action Failed',
      message: options?.message || 'Data could not be saved to the database.',
      ...options,
      autoCloseDuration: 0, // Errors stay open until explicitly dismissed
    };
    window.dispatchEvent(new CustomEvent(ERROR_EVENT_NAME, { detail: payload }));
  }
}

export const showFailureScreen = showErrorScreen;
export const showSuccessFeedback = showSuccessScreen;
export const showErrorFeedback = showErrorScreen;

// Expose on window for easy access
if (typeof window !== 'undefined') {
  window.showSuccessScreen = showSuccessScreen;
  window.showErrorScreen = showErrorScreen;
  window.showFailureScreen = showFailureScreen;
  window.showSuccessFeedback = showSuccessFeedback;
  window.showErrorFeedback = showErrorFeedback;
}

export function SuccessModalProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [successData, setSuccessData] = useState(null);

  const showSuccess = useCallback((data) => {
    setSuccessData({
      type: 'success',
      isError: false,
      isCloudSynced: true,
      ...data,
    });
    setIsOpen(true);
  }, []);

  const showError = useCallback((data) => {
    setSuccessData({
      type: 'error',
      isError: true,
      isCloudSynced: false,
      title: data?.title || 'Database Save Failed',
      message: data?.message || 'The change could not be saved to the database.',
      autoCloseDuration: 0,
      ...data,
    });
    setIsOpen(true);
  }, []);

  const hideSuccess = useCallback(() => {
    setIsOpen(false);
    if (successData?.onClose) {
      try {
        successData.onClose();
      } catch (err) {
        console.error('Error in success modal onClose callback:', err);
      }
    }
    // Clear data after animation completes
    setTimeout(() => {
      setSuccessData(null);
    }, 300);
  }, [successData]);

  // Listen to window custom events
  useEffect(() => {
    const handleSuccessEvent = (event) => {
      if (event?.detail) {
        showSuccess(event.detail);
      }
    };

    const handleErrorEvent = (event) => {
      if (event?.detail) {
        showError(event.detail);
      }
    };

    const handleFeedbackEvent = (event) => {
      const d = event?.detail;
      if (!d) return;
      if (d.type === 'error' || d.isError) {
        showError(d);
      } else {
        showSuccess(d);
      }
    };

    window.addEventListener(SUCCESS_EVENT_NAME, handleSuccessEvent);
    window.addEventListener(ERROR_EVENT_NAME, handleErrorEvent);
    window.addEventListener(FEEDBACK_EVENT_NAME, handleFeedbackEvent);

    return () => {
      window.removeEventListener(SUCCESS_EVENT_NAME, handleSuccessEvent);
      window.removeEventListener(ERROR_EVENT_NAME, handleErrorEvent);
      window.removeEventListener(FEEDBACK_EVENT_NAME, handleFeedbackEvent);
    };
  }, [showSuccess, showError]);

  return (
    <SuccessModalContext.Provider value={{ showSuccess, showError, hideSuccess, successData, isOpen }}>
      {children}
    </SuccessModalContext.Provider>
  );
}

export function useSuccessModal() {
  const context = useContext(SuccessModalContext);
  if (!context) {
    return {
      showSuccess: showSuccessScreen,
      showError: showErrorScreen,
      hideSuccess: () => {},
      isOpen: false,
      successData: null,
    };
  }
  return context;
}
