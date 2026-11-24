import React from 'react';
import { extraPrintRuleLabel } from '../utils/extraPrintRule';

function metresText(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toLocaleString()} m`;
}

function kgText(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg`;
}

export default function ExtraPrintRuleNote({ plan, testId = 'extra-print-rule' }) {
  if (!plan?.hasPrintLine) return null;
  const label = plan.label || extraPrintRuleLabel(plan.percent);
  return (
    <div
      data-testid={testId}
      style={{
        margin: '8px 0 12px',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        padding: '10px 12px',
        color: '#1e3a8a'
      }}
    >
      <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: '0.78rem', marginTop: '4px', lineHeight: 1.45 }}>
        Base {kgText(plan.baseKg)} · {metresText(plan.baseMeters)}
        {' · '}Extra {kgText(plan.extraKg)} · {metresText(plan.extraMeters)}
        {' · '}Target {kgText(plan.targetKg)} · {metresText(plan.targetMeters)}
      </div>
      {Number(plan.sfgBalanceKg) > 0 && (
        <div style={{ fontSize: '0.74rem', marginTop: '4px', color: '#1d4ed8' }}>
          Printed SFG reused {kgText(plan.sfgBalanceKg)} is already taken off what needs to be printed.
        </div>
      )}
    </div>
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
        Printed output is below the {shortfall.label || extraPrintRuleLabel()}
      </div>
      <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>
        Shortfall {kgText(shortfall.shortKg)} · {metresText(shortfall.shortMeters)}. This is a warning. It does not block the save.
      </div>
    </div>
  );
}
