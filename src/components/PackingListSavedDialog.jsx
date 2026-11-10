import React, { useEffect } from 'react';
import { CheckCircle2, Truck, X } from 'lucide-react';
import { packingListSavedSummary, packingSavedStepStates } from '../utils/sfgStoreActions';

/**
 * Shown after a packing list is saved. Backdrop clicks do nothing.
 * Escape, Close, and Do this later dismiss it. Generate Delivery Challan
 * is the next step and does not count as a dismiss.
 */
export default function PackingListSavedDialog({ shipment, onClose, onGenerateDc }) {
  const summary = packingListSavedSummary(shipment);
  const steps = packingSavedStepStates();

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      data-testid="packing-saved-backdrop"
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: 'rgba(15, 23, 42, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="packing-saved-title"
        data-testid="packing-saved-dialog"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '560px',
          maxWidth: '96vw',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          border: '1px solid #bbf7d0',
          overflow: 'hidden'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', padding: '18px 18px 0 20px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <div style={{ background: '#d1fae5', color: '#047857', borderRadius: '12px', padding: '10px', display: 'flex' }}>
              <CheckCircle2 size={22} />
            </div>
            <div>
              <h3 id="packing-saved-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#064e3b' }}>
                Packing list {summary.packingListId} saved
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#475569' }}>
                Next, generate the delivery challan. The goods are not dispatched until that challan is issued.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            data-testid="packing-saved-close"
            onClick={onClose}
            style={{
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              borderRadius: '8px',
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#475569'
            }}
          >
            <X size={16} />
          </button>
        </div>

        <ol
          data-testid="packing-saved-steps"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            listStyle: 'none',
            margin: '16px 20px 0',
            padding: 0
          }}
        >
          {steps.map((step, index) => (
            <li key={step.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span
                data-step={step.id}
                data-state={step.state}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  background: step.state === 'current' ? '#eff6ff' : (step.state === 'done' ? '#ecfdf5' : '#f8fafc'),
                  color: step.state === 'current' ? '#1d4ed8' : (step.state === 'done' ? '#047857' : '#64748b'),
                  border: `1px solid ${step.state === 'current' ? '#93c5fd' : (step.state === 'done' ? '#a7f3d0' : '#e2e8f0')}`
                }}
              >
                <span>{step.number}</span>
                {step.label}
              </span>
              {index < steps.length - 1 && <span aria-hidden="true" style={{ color: '#94a3b8', fontWeight: 700 }}>→</span>}
            </li>
          ))}
        </ol>

        <div
          data-testid="packing-saved-summary"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '10px',
            margin: '16px 20px 0'
          }}
        >
          <SummaryTile label="Rolls" value={String(summary.rollCount)} />
          <SummaryTile label="Net" value={`${summary.netKg.toFixed(2)} kg`} />
          <SummaryTile label="Gross" value={`${summary.grossKg.toFixed(2)} kg`} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '10px', padding: '18px 20px 20px' }}>
          <button
            type="button"
            data-testid="packing-saved-later"
            onClick={onClose}
            style={{
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              borderRadius: '8px',
              padding: '10px 14px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Do this later
          </button>
          <button
            type="button"
            data-testid="packing-saved-generate-dc"
            onClick={onGenerateDc}
            style={{
              border: 'none',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '10px 14px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Truck size={16} /> Generate Delivery Challan
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b' }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{value}</div>
    </div>
  );
}
