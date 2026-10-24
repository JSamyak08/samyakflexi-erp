import React from 'react';
import { classifyMeasure } from '../utils/productionRecordQuality';

export default function MeasureRangeHint({ field, value, inputKg }) {
  const result = classifyMeasure(field, value, { mode: 'form', inputKg });
  if (!result.message || (result.level !== 'warn' && result.level !== 'block')) return null;
  const warn = result.level === 'warn';
  return (
    <div style={{
      marginTop: '6px',
      fontSize: '0.75rem',
      fontWeight: '700',
      color: warn ? '#b45309' : '#b91c1c',
      background: warn ? '#fffbeb' : '#fef2f2',
      border: warn ? '1px solid #fde68a' : '1px solid #fecaca',
      borderRadius: '6px',
      padding: '6px 8px'
    }}>
      {result.message}
    </div>
  );
}
