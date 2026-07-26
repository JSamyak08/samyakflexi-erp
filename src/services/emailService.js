/**
 * Frontend Email & Password Recovery Service
 * Communicates with backend Express SMTP server (Hostinger: admin@samyakinternational.in)
 */

export const requestPasswordRecovery = async (email) => {
  try {
    const response = await fetch('/api/recover-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Password recovery service error:', error);
    return {
      success: false,
      message: 'Unable to connect to email recovery server. Please ensure backend server is running.',
      error: error.message
    };
  }
};

export const sendERPEmailNotification = async ({ to, subject, html, text }) => {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, subject, html, text }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('ERP email notification error:', error);
    return {
      success: false,
      message: 'Failed to dispatch email notification.',
      error: error.message
    };
  }
};
