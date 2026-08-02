import React, { useState } from 'react';
import { Scale, RefreshCw, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
import { WEIGHING_STATIONS } from '../factoryStore';

export default function WeighingScaleInput({
  value,
  onChange,
  stationId = 'SCALE_1_INWARD',
  label = 'Net Weight (Kg) *',
  required = false
}) {
  const station = WEIGHING_STATIONS.find(s => s.id === stationId) || WEIGHING_STATIONS[0];
  const [isLiveScaleConnected, setIsLiveScaleConnected] = useState(true);
  const [liveReadout, setLiveReadout] = useState(() => value || 1450.0);
  const [isReading, setIsReading] = useState(false);

  // Simulate reading from scale
  const handleReadScale = () => {
    setIsReading(true);
    setTimeout(() => {
      // Small variation to simulate live scale fluctuation if value not set
      const scaleValue = parseFloat((value || (1200 + Math.random() * 500)).toFixed(1));
      setLiveReadout(scaleValue);
      onChange(scaleValue);
      setIsReading(false);
    }, 400);
  };

  const handleTare = () => {
    setLiveReadout(0.0);
    onChange(0.0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Scale size={16} style={{ color: 'var(--primary-brand)' }} />
          {label}
        </label>

        {/* Station Indicator Badge */}
        <span 
          className="badge badge-client" 
          style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#f1f5f9', color: '#334155' }}
          title={`Digital Scale at ${station.department}`}
        >
          📍 {station.name.split(' - ')[0]}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {/* Scale Reading Status Box */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#0f172a',
          color: '#34d399',
          padding: '8px 14px',
          borderRadius: '7px',
          fontFamily: 'Consolas, Monaco, monospace',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)',
          border: '1px solid #1e293b'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isLiveScaleConnected ? '#10b981' : '#f59e0b',
              boxShadow: isLiveScaleConnected ? '0 0 8px #10b981' : 'none'
            }} />
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isLiveScaleConnected ? 'LIVE SCALE COM3' : 'SCALE MAN'}
            </span>
          </div>

          <div style={{ fontSize: '1.25rem', fontWeight: '800', tracking: '0.05em', color: '#34d399' }}>
            {(parseFloat(value) || 0.0).toFixed(1)} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>kg</span>
          </div>
        </div>

        {/* Action Buttons */}
        <button
          type="button"
          onClick={handleReadScale}
          disabled={isReading}
          className="btn-primary"
          style={{ padding: '9px 12px', fontSize: '0.8rem', background: '#059669', borderColor: '#059669' }}
          title="Fetch current weight from scale"
        >
          <RefreshCw size={14} className={isReading ? 'animate-spin' : ''} />
          {isReading ? 'Reading...' : 'Capture Scale Weight'}
        </button>

        <button
          type="button"
          onClick={handleTare}
          className="btn-secondary"
          style={{ padding: '9px 10px', fontSize: '0.8rem' }}
          title="Tare Scale to Zero"
        >
          TARE
        </button>
      </div>

      {/* Manual Input Fallback */}
      <div style={{ marginTop: '2px' }}>
        <input
          type="number"
          step="0.1"
          required={required}
          className="form-control"
          style={{ fontSize: '0.85rem', padding: '6px 10px' }}
          placeholder="Manual weight entry (Kg)..."
          value={value || ''}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
        />
      </div>
    </div>
  );
}
