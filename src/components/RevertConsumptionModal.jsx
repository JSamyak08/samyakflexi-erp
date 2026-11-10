import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { previewSfgConsumptionRevert, revertSfgConsumption } from '../services/revertConsumption';

/**
 * Confirmation for reverting one consumption.
 * The backdrop does not close it. Escape and Close do.
 */
export default function RevertConsumptionModal({ batch, log, onClose, onReverted }) {
  const [plan, setPlan] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    previewSfgConsumptionRevert(batch, log?.id)
      .then((next) => {
        if (!cancelled) setPlan(next || {});
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error?.message || 'The revert could not be checked.');
      });
    return () => {
      cancelled = true;
    };
  }, [batch, log?.id]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !saving) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const blocks = Array.isArray(plan?.blocks) ? plan.blocks : [];
  const lines = Array.isArray(plan?.lines) ? plan.lines : [];
  const blocked = Boolean(loadError) || blocks.length > 0 || plan?.ok === false;
  const reasonMissing = !reason.trim();

  const confirm = async () => {
    if (saving || blocked || reasonMissing) return;
    setSaving(true);
    setSaveError('');
    try {
      const result = await revertSfgConsumption(batch, log.id, reason.trim());
      onReverted?.(result);
    } catch (error) {
      setSaveError(error?.message || 'The consumption was not reverted.');
      setSaving(false);
    }
  };

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: '16px'
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="revert-consumption-title"
        data-testid="sfg-revert-modal"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden'
        }}
      >
        <div style={{ background: '#0f172a', color: '#ffffff', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <h3 id="revert-consumption-title" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Revert consumption</h3>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>{batch} · {log?.targetProcess || 'Process'}</div>
          </div>
          <button
            type="button"
            data-testid="sfg-revert-close"
            aria-label="Close"
            onClick={() => { if (!saving) onClose?.(); }}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {!plan && !loadError && <p style={{ margin: 0, color: '#64748b' }}>Checking what this revert will restore…</p>}
          {loadError && <p data-testid="sfg-revert-block" style={{ margin: 0, color: '#b91c1c', fontWeight: 700 }}>{loadError}</p>}
          {blocks.map((block) => (
            <p key={block} data-testid="sfg-revert-block" style={{ margin: 0, color: '#b91c1c', fontWeight: 700 }}>{block}</p>
          ))}
          {plan?.ok && (
            <>
              <p style={{ margin: 0, color: '#334155', fontSize: '0.9rem' }}>
                This puts the stock back and marks the consumption as reverted. The log stays on the roll.
              </p>
              <ul style={{ margin: 0, paddingLeft: '18px', color: '#0f172a', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {lines.map((line) => <li key={line}>{line}</li>)}
              </ul>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                Reason
                <textarea
                  data-testid="sfg-revert-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  required
                  placeholder="What was recorded by mistake?"
                  style={{ fontWeight: 500, border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '0.9rem', resize: 'vertical' }}
                />
              </label>
            </>
          )}
          {saveError && <p style={{ margin: 0, color: '#b91c1c', fontWeight: 700 }}>{saveError}</p>}
        </div>

        <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={() => { if (!saving) onClose?.(); }}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}
          >
            Close
          </button>
          <button
            type="button"
            data-testid="sfg-revert-confirm"
            disabled={saving || blocked || !plan?.ok || reasonMissing}
            onClick={confirm}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: saving || blocked || !plan?.ok || reasonMissing ? '#94a3b8' : '#b45309',
              color: '#ffffff',
              fontWeight: 800,
              cursor: saving || blocked || !plan?.ok || reasonMissing ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? 'Reverting…' : 'Revert consumption'}
          </button>
        </div>
      </div>
    </div>
  );
}
