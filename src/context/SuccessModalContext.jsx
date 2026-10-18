import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Custom event name for decoupled triggers
const SUCCESS_EVENT_NAME = 'app:show-success-screen';

export const SuccessModalContext = createContext({
  showSuccess: () => {},
  hideSuccess: () => {},
  successData: null,
  isOpen: false
});

/**
 * Global helper that can be called from ANY function, service, or component
 * without needing React hooks.
 * 
 * Usage:
 * showSuccessScreen({
 *   title: "Production Record Logged!",
 *   message: "Your entry has been securely stored in the database.",
 *   entityType: "Production Record",
 *   recordId: "REC-2026-089",
 *   details: [
 *     { label: "Job Name", value: "Tata Tea Pouch" },
 *     { label: "Net Qty", value: "450 Kg" },
 *     { label: "Machine", value: "Rotogravure Press 1" }
 *   ],
 *   primaryActionText: "Done",
 *   onPrimaryAction: () => console.log('closed')
 * });
 */
export function showSuccessScreen(options) {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent(SUCCESS_EVENT_NAME, { detail: options });
    window.dispatchEvent(event);
  }
}

export function SuccessModalProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [successData, setSuccessData] = useState(null);

  const showSuccess = useCallback((data) => {
    setSuccessData(data);
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
    const handleCustomEvent = (event) => {
      if (event && event.detail) {
        showSuccess(event.detail);
      }
    };

    window.addEventListener(SUCCESS_EVENT_NAME, handleCustomEvent);
    return () => {
      window.removeEventListener(SUCCESS_EVENT_NAME, handleCustomEvent);
    };
  }, [showSuccess]);

  return (
    <SuccessModalContext.Provider value={{ showSuccess, hideSuccess, successData, isOpen }}>
      {children}
    </SuccessModalContext.Provider>
  );
}

export function useSuccessModal() {
  const context = useContext(SuccessModalContext);
  if (!context) {
    return {
      showSuccess: showSuccessScreen,
      hideSuccess: () => {},
      isOpen: false,
      successData: null
    };
  }
  return context;
}
