import React from 'react';
import { Plus, Scale, Trash2 } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import WeighingScaleCaptureButton from './WeighingScaleCaptureButton';
import { outputEntryNet } from '../utils/consumeRollEntries';

const fieldStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  fontSize: '0.85rem',
  background: '#ffffff'
};

const TARE_PRESETS = ['0.0', '0.5', '0.8', '1.2', '1.5'];
const BAYS = ['FG Warehouse', 'Dispatch Ready Store', 'Bay A', 'Bay B', 'Bay C', 'Quarantine / Aging Bay'];

export function Substrate2ExtraRolls({
  rows,
  rolls,
  firstConsumedKg,
  onAdd,
  onRemove,
  onChange,
  onSelectRoll,
  layerName = 'Substrate 2'
}) {
  const extraConsumed = rows.reduce((sum, row) => sum + (parseFloat(row.consumedKg) || 0), 0);
  const total = (parseFloat(firstConsumedKg) || 0) + extraConsumed;

  return (
    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {rows.map((row, index) => {
        const initial = parseFloat(row.initialKg) || 0;
        const consumed = parseFloat(row.consumedKg) || 0;
        const remaining = Math.max(0, initial - consumed);
        return (
          <div key={row.key} style={{ background: '#ffffff', border: '1px solid #f0abfc', borderRadius: '10px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
              <div style={{ fontWeight: '800', color: '#86198f', fontSize: '0.84rem' }}>
                {layerName} roll {index + 2}
              </div>
              <button
                type="button"
                onClick={() => onRemove(row.key)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #f9a8d4', background: '#fdf2f8', color: '#9d174d', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
              >
                <Trash2 size={13} /> Remove
              </button>
            </div>
            <SearchableSelect
              value={row.rollId || ''}
              onChange={(e) => onSelectRoll(row.key, e.target.value)}
              style={{ width: '100%', fontSize: '0.85rem', marginBottom: '8px' }}
            >
              <option value="">-- Choose from available inventory or enter manually below --</option>
              {(rolls || []).map((roll) => (
                <option key={roll.barcodeId || roll.id} value={roll.barcodeId || roll.id}>
                  {roll.barcodeId || roll.id} • {roll.filmType || roll.itemName || 'Film'} ({roll.micron || '-'}µ × {roll.widthMm || '-'}mm) • Avail: {Number(roll.availableWeightKg ?? roll.netWeightKg ?? 0).toFixed(1)} kg
                </option>
              ))}
            </SearchableSelect>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.3fr 1fr 1.1fr', gap: '10px' }}>
              <label style={{ fontSize: '0.76rem', fontWeight: '700', color: '#701a75' }}>
                Roll Barcode <span style={{ color: '#ef4444' }}>*</span>
                <input
                  type="text"
                  value={row.barcode}
                  onChange={(e) => onChange(row.key, { barcode: e.target.value })}
                  style={{ ...fieldStyle, border: '1.5px solid #d946ef', fontFamily: 'monospace', fontWeight: '700', marginTop: '4px' }}
                />
              </label>
              <label style={{ fontSize: '0.76rem', fontWeight: '700', color: '#701a75' }}>
                Substrate Description
                <input
                  type="text"
                  value={row.filmType}
                  onChange={(e) => onChange(row.key, { filmType: e.target.value })}
                  style={{ ...fieldStyle, marginTop: '4px' }}
                />
              </label>
              <label style={{ fontSize: '0.76rem', fontWeight: '700', color: '#701a75' }}>
                Initial Qty (kg)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.initialKg}
                  onChange={(e) => onChange(row.key, { initialKg: e.target.value })}
                  style={{ ...fieldStyle, fontWeight: '700', marginTop: '4px' }}
                />
              </label>
              <label style={{ fontSize: '0.76rem', fontWeight: '800', color: '#701a75' }}>
                Consumed (kg) *
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.consumedKg}
                    onChange={(e) => onChange(row.key, { consumedKg: e.target.value })}
                    style={{ ...fieldStyle, border: '1.5px solid #d946ef', fontWeight: '800', color: '#86198f' }}
                  />
                  <WeighingScaleCaptureButton onCapture={(weight) => onChange(row.key, { consumedKg: weight.toString() })} />
                </div>
              </label>
            </div>
            {initial > 0 && (
              <div style={{ marginTop: '8px', textAlign: 'right', fontSize: '0.78rem', color: '#701a75', fontWeight: '600' }}>
                Substrate Balance Remaining: <strong>{remaining.toFixed(2)} kg</strong>
              </div>
            )}
          </div>
        );
      })}

      {rows.length > 0 && (
        <div style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: '800', color: '#86198f' }}>
          {layerName} total consumed: {total.toFixed(2)} kg
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px dashed #d946ef', background: '#fdf4ff', color: '#86198f', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', fontWeight: '800', cursor: 'pointer' }}
      >
        <Plus size={15} /> Add another roll
      </button>
    </div>
  );
}

export function OutputExtraRolls({
  rows,
  firstNetKg,
  forceFg,
  warning,
  onAdd,
  onRemove,
  onChange
}) {
  const extraNet = rows.reduce((sum, row) => sum + outputEntryNet(row.grossKg, row.tareKg), 0);
  const totalNet = (Number(firstNetKg) || 0) + extraNet;

  return (
    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {rows.map((row, index) => {
        const net = outputEntryNet(row.grossKg, row.tareKg);
        return (
          <div key={row.key} style={{ background: '#ffffff', border: '1px solid #86efac', borderRadius: '10px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: '800', color: '#166534', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Scale size={15} /> Child roll {index + 2}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {forceFg ? (
                  <span style={{ background: '#15803d', color: '#ffffff', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', fontWeight: '800' }}>FG</span>
                ) : (
                  <div style={{ display: 'flex', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', overflow: 'hidden' }}>
                    {['SFG', 'FG'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => onChange(row.key, { outputType: type })}
                        style={{
                          border: 'none',
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          cursor: 'pointer',
                          background: row.outputType === type ? (type === 'FG' ? '#22c55e' : '#fef08a') : 'transparent',
                          color: row.outputType === type ? (type === 'FG' ? '#ffffff' : '#854d0e') : '#64748b'
                        }}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(row.key)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                >
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: '10px' }}>
              <label style={{ fontSize: '0.76rem', fontWeight: '700', color: '#14532d' }}>
                Produced Roll Barcode <span style={{ color: '#ef4444' }}>*</span>
                <input
                  type="text"
                  value={row.barcode}
                  onChange={(e) => onChange(row.key, { barcode: e.target.value })}
                  style={{ ...fieldStyle, border: '1.5px solid #86efac', fontFamily: 'monospace', fontWeight: '700', color: '#15803d', marginTop: '4px' }}
                />
              </label>
              <label style={{ fontSize: '0.76rem', fontWeight: '700', color: '#14532d' }}>
                Gross Weight (kg) <span style={{ color: '#ef4444' }}>*</span>
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.grossKg}
                    onChange={(e) => onChange(row.key, { grossKg: e.target.value })}
                    style={{ ...fieldStyle, border: '1.5px solid #22c55e', fontWeight: '800' }}
                  />
                  <WeighingScaleCaptureButton onCapture={(weight) => onChange(row.key, { grossKg: weight.toString() })} />
                </div>
              </label>
              <label style={{ fontSize: '0.76rem', fontWeight: '700', color: '#14532d' }}>
                Tare (kg)
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={row.tareKg}
                  onChange={(e) => onChange(row.key, { tareKg: e.target.value, tarePreset: 'custom' })}
                  style={{ ...fieldStyle, fontWeight: '700', marginTop: '4px' }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
              {TARE_PRESETS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onChange(row.key, { tareKg: val, tarePreset: val })}
                  style={{
                    padding: '3px 7px',
                    borderRadius: '5px',
                    fontSize: '0.72rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    border: row.tarePreset === val ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                    background: row.tarePreset === val ? '#bbf7d0' : '#ffffff',
                    color: '#14532d'
                  }}
                >
                  {val}kg
                </button>
              ))}
            </div>

            <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'end' }}>
              <label style={{ fontSize: '0.76rem', fontWeight: '700', color: '#14532d' }}>
                Storage Bay
                <SearchableSelect
                  value={row.storageBay}
                  onChange={(e) => onChange(row.key, { storageBay: e.target.value })}
                  style={{ width: '100%', fontSize: '0.85rem', marginTop: '4px' }}
                >
                  {BAYS.map((bay) => <option key={bay} value={bay}>{bay}</option>)}
                </SearchableSelect>
              </label>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700' }}>NET</div>
                <div style={{ fontSize: '1.05rem', fontWeight: '900', color: net > 0 ? '#15803d' : '#94a3b8' }}>{net.toFixed(2)} kg</div>
              </div>
            </div>
          </div>
        );
      })}

      {rows.length > 0 && (
        <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '8px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#065f46' }}>Child roll total (including roll 1)</span>
          <span style={{ fontSize: '0.95rem', fontWeight: '900', color: '#065f46' }}>{totalNet.toFixed(2)} kg</span>
        </div>
      )}
      {rows.length > 0 && warning && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: '8px', padding: '8px 12px', fontSize: '0.78rem', fontWeight: '600' }}>
          {warning}
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px dashed #16a34a', background: '#f0fdf4', color: '#166534', borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', fontWeight: '800', cursor: 'pointer' }}
      >
        <Plus size={15} /> Add another roll
      </button>
    </div>
  );
}
