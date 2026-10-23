import React from 'react';

export default function CompanyProfileNotice({
  title = 'This document cannot be printed',
  message,
  onClose,
}) {
  return (
    <div className="pdf-modal-overlay" role="alertdialog" aria-labelledby="company-profile-notice-title">
      <div className="glass-panel" style={{ maxWidth: '560px', margin: '12vh auto', padding: '24px', background: '#ffffff' }}>
        <h2 id="company-profile-notice-title" style={{ marginTop: 0, fontSize: '1.15rem' }}>{title}</h2>
        <p style={{ color: '#334155', lineHeight: 1.5 }}>{message}</p>
        {onClose ? (
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        ) : null}
      </div>
    </div>
  );
}
