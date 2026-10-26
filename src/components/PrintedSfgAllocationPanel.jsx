import React from 'react';

export default function PrintedSfgAllocationPanel({ plan, mode, partKg, onChange, onReserve }) {
  if (!plan || plan.offers.length === 0) return null;
  const selected = mode || 'all';

  return (
    <div style={{ marginBottom: '16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '14px 16px' }}>
      <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#14532d', marginBottom: '8px' }}>
        Printed SFG in stock for this product
      </div>
      <div style={{ fontSize: '0.75rem', color: '#166534', marginBottom: '10px' }}>
        Same product is the job master id{plan.offers[0].jobMasterId ? ` (${plan.offers[0].jobMasterId})` : ''}. If that id is missing, the exact job name is used.
      </div>
      {plan.offers.map((offer) => (
        <div key={offer.sfgBatchCode} style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 10px', marginBottom: '8px', fontSize: '0.78rem', color: '#14532d' }}>
          <div style={{ fontWeight: '800' }}>
            {offer.freeKg.toFixed(2)} kg free · {Number(offer.metersForFreeKg || 0).toLocaleString()} m · lot {offer.sfgBatchCode}
          </div>
          <div>Source job {offer.sourceOrderId}{offer.sourceJobName ? ` · ${offer.sourceJobName}` : ''}</div>
          <div style={{ fontFamily: 'monospace', marginTop: '2px' }}>
            Rolls: {offer.childBarcodes.length ? offer.childBarcodes.join(', ') : '—'}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
        {['all', 'part', 'none'].map((value) => (
          <button
            key={value}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onChange?.({ mode: value, kg: partKg });
            }}
            style={{
              borderRadius: '6px',
              border: selected === value ? '1px solid #15803d' : '1px solid #86efac',
              background: selected === value ? '#15803d' : '#ffffff',
              color: selected === value ? '#ffffff' : '#166534',
              fontWeight: '800',
              fontSize: '0.75rem',
              padding: '4px 10px',
              cursor: 'pointer'
            }}
          >
            {value === 'all' ? 'Use all' : value === 'part' ? 'Use part' : 'Use none'}
          </button>
        ))}
        {selected === 'part' && (
          <input
            type="number"
            min="0"
            step="0.1"
            value={partKg ?? ''}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onChange?.({ mode: 'part', kg: event.target.value })}
            placeholder="kg"
            style={{ width: '90px', padding: '4px 6px' }}
          />
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onReserve?.({ mode: selected, kg: parseFloat(partKg) || 0 });
          }}
          style={{ border: 'none', background: '#14532d', color: '#ffffff', borderRadius: '6px', padding: '5px 10px', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer' }}
        >
          Reserve for this order
        </button>
      </div>
      <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0f172a' }}>
        Required print quantity {plan.printQtyBefore.toFixed(2)} kg → {plan.printQtyAfter.toFixed(2)} kg. The print-film line in the table below is reduced by the same amount.
      </div>
    </div>
  );
}
