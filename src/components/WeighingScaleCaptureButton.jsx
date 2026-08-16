import React, { useState, useEffect } from 'react';
import { Scale, Zap, Check } from 'lucide-react';
import weighingScaleService from '../services/weighingScaleService';

/**
 * 1-Click Scale Weight Capture Button
 * Usage: <WeighingScaleCaptureButton onCapture={(weight) => setWeightKg(weight)} />
 */
export default function WeighingScaleCaptureButton({ onCapture, label = 'Scale', title = 'Capture live weight from RS-232 scale', style = {} }) {
  const [scaleState, setScaleState] = useState(weighingScaleService.getStatus());
  const [justCaptured, setJustCaptured] = useState(false);

  useEffect(() => {
    const unsubscribe = weighingScaleService.subscribe((status) => {
      setScaleState(status);
    });
    return () => unsubscribe();
  }, []);

  const handleClick = async () => {
    if (!scaleState.isConnected) {
      try {
        await weighingScaleService.connect();
      } catch (e) {
        return;
      }
    }

    const currentStatus = weighingScaleService.getStatus();
    const weightToUse = currentStatus.netWeight || currentStatus.currentWeight;

    if (onCapture) {
      onCapture(weightToUse);
      setJustCaptured(true);
      setTimeout(() => setJustCaptured(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: justCaptured 
          ? '#ecfdf5' 
          : (scaleState.isConnected ? '#f0fdf4' : '#f8fafc'),
        color: justCaptured 
          ? '#047857' 
          : (scaleState.isConnected ? '#15803d' : '#64748b'),
        border: `1px solid ${justCaptured ? '#a7f3d0' : (scaleState.isConnected ? '#bbf7d0' : '#cbd5e1')}`,
        padding: '3px 8px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: '700',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        ...style
      }}
      title={scaleState.isConnected ? `${title} (Live: ${scaleState.netWeight.toFixed(2)} kg)` : 'Click to connect RS-232 scale & capture weight'}
    >
      {justCaptured ? (
        <>
          <Check size={12} style={{ color: '#047857' }} />
          <span>{scaleState.netWeight.toFixed(1)} kg</span>
        </>
      ) : (
        <>
          <Scale size={12} style={{ color: scaleState.isConnected ? '#16a34a' : '#64748b' }} />
          <span>{label}</span>
          {scaleState.isConnected && (
            <span style={{ fontSize: '0.7rem', color: '#15803d', fontWeight: '800' }}>
              ({scaleState.netWeight.toFixed(1)})
            </span>
          )}
        </>
      )}
    </button>
  );
}
