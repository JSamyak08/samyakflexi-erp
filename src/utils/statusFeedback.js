/**
 * Global Database & Action Status Feedback Service
 * Dispatches animated success/failure status dialogs across the platform
 * to confirm whether data has been saved to the database.
 */

import {
  showSuccessScreen,
  showErrorScreen,
  SUCCESS_EVENT_NAME,
  ERROR_EVENT_NAME,
  FEEDBACK_EVENT_NAME
} from '../context/SuccessModalContext';

export {
  showSuccessScreen,
  showErrorScreen,
  showSuccessScreen as showSuccessFeedback,
  showErrorScreen as showErrorFeedback,
  SUCCESS_EVENT_NAME,
  ERROR_EVENT_NAME,
  FEEDBACK_EVENT_NAME
};

/**
 * Universal feedback trigger.
 */
export function showStatusFeedback(options = {}) {
  if (options.type === 'error' || options.isError) {
    showErrorScreen(options);
  } else {
    showSuccessScreen(options);
  }
}

/**
 * Helper to wrap an async database write call with animated success & error feedback.
 */
export async function withDatabaseFeedback(
  asyncFn,
  {
    successTitle = 'Data Saved Successfully!',
    successMessage = 'Saved to database.',
    successDetails,
    primaryActionText,
    onPrimaryAction,
    errorTitle = 'Database Save Failed',
    errorMessage = 'The change could not be saved to the database.',
    onSuccess,
    onError,
  } = {}
) {
  try {
    const result = await asyncFn();
    showSuccessScreen({
      title: typeof successTitle === 'function' ? successTitle(result) : successTitle,
      message: typeof successMessage === 'function' ? successMessage(result) : successMessage,
      details: typeof successDetails === 'function' ? successDetails(result) : successDetails,
      primaryActionText,
      onPrimaryAction,
    });
    onSuccess?.(result);
    return result;
  } catch (err) {
    showErrorScreen({
      title: errorTitle,
      message: errorMessage,
      error: err?.message || String(err),
      details: [{ label: 'Error', value: err?.message || String(err) }]
    });
    onError?.(err);
    throw err;
  }
}
