import React from 'react';
import { Sparkles, RotateCcw } from 'lucide-react';
import { useUiTrial } from '../../utils/uiTrialSwitch.js';

/**
 * On/Off switch toggle button for HeroUI + Tremor modern trial.
 * Visible ONLY to Admin and Plant Manager.
 * Persisted in localStorage ('samyak_ui_trial_enabled'), default OFF.
 */
export default function UiTrialToggleButton({ currentUser, style = {} }) {
  const { enabled, canToggle, toggle } = useUiTrial(currentUser);

  if (!canToggle) return null;

  return (
    <button
      type="button"
      data-testid="ui-trial-toggle-btn"
      onClick={() => toggle()}
      className={enabled ? 'btn-secondary' : 'btn-primary'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        fontSize: '0.8rem',
        fontWeight: '700',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        background: enabled ? '#f1f5f9' : '#0f172a',
        color: enabled ? '#0f172a' : '#ffffff',
        border: enabled ? '1px solid #cbd5e1' : '1px solid #0f172a',
        ...style
      }}
      title={
        enabled
          ? 'Currently previewing HeroUI + Tremor modern design. Click to revert to the classic ERP layout.'
          : 'Trial the modern HeroUI v3 + Tremor UI design (Admin & Plant Manager preview).'
      }
    >
      {enabled ? (
        <>
          <RotateCcw size={14} style={{ flexShrink: 0 }} />
          <span>Use the current design</span>
        </>
      ) : (
        <>
          <Sparkles size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span>Try the new design</span>
        </>
      )}
    </button>
  );
}
