import React, { useState, useEffect } from 'react';
import { Scale, RefreshCw, Zap, CheckCircle2, AlertCircle, Power } from 'lucide-react';
import weighingScaleService from '../services/weighingScaleService';

export default function WeighingScaleInput({
  value,
  onChange,
  label = 'Net Weight (Kg) *',
  required = false,
  showDirectInput = true
}) {
  const [scaleStatus, setScaleStatus] = useState(weighingScaleService.getStatus());
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    const unsubscribe = weighingScaleService.subscribe((status) => {
      setScaleStatus(status);
    });
    return () => unsubscribe();
  }, []);

  const handleConnectOrCapture = async () => {
    if (!scaleStatus.isConnected) {
      try {
        await weighingScaleService.connect();
      } catch (err) {
        return;
      }
    }

    setIsCapturing(true);
    const status = weighingScaleService.getStatus();
    const liveWeight = parseFloat(status.netWeight.toFixed(2));
    if (onChange) {
      onChange(liveWeight);
    }
    setTimeout(() => setIsCapturing(false), 500);
  };

  const handleTare = () => {
    weighingScaleService.tare();
    if (onChange) {
      onChange(0.0);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontWeight: '600', fontSize: '0.85rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
          <Scale size={15} style={{ color: 'var(--primary-brand)' }} />
          {label}
        </label>

        {/* Connection Status Badge */}
        <span 
          style={{ 
            fontSize: '0.7rem', 
            fontWeight: '700',
            padding: '2px 8px', 
            borderRadius: '9999px',
            background: scaleStatus.isConnected 
              ? (scaleStatus.isSimulated ? '#fef3c7' : '#ecfdf5') 
              : '#f1f5f9',
            color: scaleStatus.isConnected 
              ? (scaleStatus.isSimulated ? '#b45309' : '#047857') 
              : '#64748b',
            border: `1px solid ${scaleStatus.isConnected ? (scaleStatus.isSimulated ? '#fde68a' : '#a7f3d0') : '#cbd5e1'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: scaleStatus.isConnected ? (scaleStatus.isSimulated ? '#f59e0b' : '#10b981') : '#94a3b8' }} />
          {scaleStatus.isConnected ? (scaleStatus.isSimulated ? 'Scale (Simulated)' : 'RS-232 Online') : 'RS-232 Offline'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {/* Scale Reading Status Box */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#0a0f1d',
          color: scaleStatus.isConnected ? '#10b981' : '#64748b',
          padding: '8px 14px',
          borderRadius: '7px',
          fontFamily: '"SF Mono", "Fira Code", monospace, "Courier New"',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
          border: '1px solid #1e293b'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: scaleStatus.isConnected ? '#10b981' : '#ef4444',
              boxShadow: scaleStatus.isConnected ? '0 0 6px rgba(16,185,129,0.7)' : 'none'
            }} />
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {scaleStatus.isConnected ? (scaleStatus.isStable ? '● STABLE' : '◌ MOTION') : 'NO PORT'}
            </span>
          </div>

          <div style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '0.05em', color: scaleStatus.isConnected ? '#10b981' : '#475569' }}>
            {scaleStatus.isConnected ? scaleStatus.netWeight.toFixed(2) : (parseFloat(value) || 0.0).toFixed(2)} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>kg</span>
          </div>
        </div>

        {/* Action Buttons */}
        <button
          type="button"
          onClick={handleConnectOrCapture}
          disabled={isCapturing}
          className="btn-primary"
          style={{ padding: '8px 12px', fontSize: '0.78rem', background: '#059669', borderColor: '#059669', fontWeight: '700', whiteSpace: 'nowrap' }}
          title={scaleStatus.isConnected ? 'Capture current live weight' : 'Connect to RS-232 Scale via COM port'}
        >
          <Zap size={13} style={{ marginRight: '4px' }} />
          {scaleStatus.isConnected ? (isCapturing ? 'Captured!' : 'Capture Weight') : 'Connect Scale'}
        </button>

        {scaleStatus.isConnected && (
          <button
            type="button"
            onClick={handleTare}
            className="btn-secondary"
            style={{ padding: '8px 10px', fontSize: '0.78rem', fontWeight: '700' }}
            title="Tare Scale to Zero"
          >
            Tare
          </button>
        )}
      </div>

      {/* Manual Input Fallback */}
      {showDirectInput && (
        <div style={{ marginTop: '2px' }}>
          <input
            type="number"
            step="any"
            required={required}
            className="form-control"
            style={{ fontSize: '0.85rem', padding: '6px 10px' }}
            placeholder="Or enter / edit weight manually (Kg)..."
            value={value !== undefined ? value : ''}
            onChange={e => onChange && onChange(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
          />
        </div>
      )}
    </div>
  );
}
