import React from 'react';

export default function IndentSlipSignatures({ slip }) {
  const columns = [
    { line: slip?.raisedBy?.label || '', when: '', caption: 'Requisition Raised By' },
    { line: slip?.verifiedBy?.label || '', when: '', caption: 'Verified By (Store Manager)' },
    {
      line: slip?.approvedBy?.label || '',
      when: slip?.approvedBy?.atLabel || '',
      caption: 'Approved By (Admin)',
    },
  ];
  return (
    <div className="pdf-signature-block" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1', textAlign: 'center', fontSize: '8pt' }}>
      {columns.map((column) => (
        <div key={column.caption}>
          <div style={{ borderBottom: '1px solid #0f172a', minHeight: '22px', paddingBottom: '4px', fontWeight: '700' }}>
            {column.line || '\u00A0'}
          </div>
          {column.when ? (
            <div style={{ color: '#334155', marginTop: '2px', fontWeight: '600' }}>{column.when}</div>
          ) : null}
          <div style={{ color: '#64748b', marginTop: '4px' }}>{column.caption}</div>
        </div>
      ))}
    </div>
  );
}
