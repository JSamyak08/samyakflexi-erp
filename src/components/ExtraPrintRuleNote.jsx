import React from 'react';
import { extraPrintIncludedNote } from '../utils/extraPrintRule';

function metresText(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${number.toLocaleString()} m`;
}

function kgText(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`;
}

export function ExtraPrintIncludedNote({ percent, testId = 'extra-print-included' }) {
  if (percent === undefined || percent === null || percent === '') return null;
  return (
    <span data-testid={testId} style={{ fontWeight: 700, color: '#1d4ed8' }}>
      {extraPrintIncludedNote(percent)}
    </span>
  );
}

export function ExtraPrintTargetFigure({ plan, testId = 'extra-print-target' }) {
  if (!plan?.hasPrintLine) return null;
  const metres = metresText(plan.targetMeters);
  return (
    <span data-testid={testId} style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>
      {kgText(plan.targetKg)}{metres ? ` · ${metres}` : ''}{' '}
      <ExtraPrintIncludedNote percent={plan.percent} />
    </span>
  );
}

export function ExtraPrintShortfallNote({ shortfall, testId = 'extra-print-shortfall' }) {
  if (!shortfall?.below) return null;
  return (
    <div
      data-testid={testId}
      role="status"
      style={{
        marginTop: '10px',
        background: '#fffbeb',
        border: '1px solid #fcd34d',
        borderRadius: '8px',
        padding: '10px 12px',
        color: '#92400e'
      }}
    >
      <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>
        Printed output is below the target {shortfall.percent !== undefined && shortfall.percent !== null ? extraPrintIncludedNote(shortfall.percent) : ''}
      </div>
      <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>
        Shortfall {kgText(shortfall.shortKg)} · {metresText(shortfall.shortMeters) || '—'}. This is a warning. It does not block the save.
      </div>
    </div>
  );
}
