import React from 'react';
import * as Sentry from '@sentry/react';
import { Bug } from 'lucide-react';

// Button component to test Sentry's error tracking
export default function ErrorButton() {
  return (
    <button
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: '#ef4444',
        color: '#ffffff',
        border: '1px solid #dc2626',
        padding: '6px 12px',
        borderRadius: '8px',
        fontSize: '0.8rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      }}
      title="Test Sentry error tracking"
      onClick={() => {
        throw new Error('This is your first error!');
      }}
    >
      <Bug size={14} /> Break the world
    </button>
  );
}
