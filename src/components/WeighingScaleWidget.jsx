import React, { useState, useEffect } from 'react';
import { 
  Scale, 
  Cpu, 
  Activity, 
  Settings, 
  RefreshCw, 
  Power, 
  Sliders, 
  Check, 
  AlertCircle, 
  X, 
  Zap, 
  HelpCircle 
} from 'lucide-react';
import weighingScaleService from '../services/weighingScaleService';

export default function WeighingScaleWidget({ onCaptureWeight }) {
  const [scaleState, setScaleState] = useState(weighingScaleService.getStatus());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('live'); // 'live' | 'settings' | 'troubleshoot'
  const [isConnecting, setIsConnecting] = useState(false);
  const [customSimWeight, setCustomSimWeight] = useState('245.5');
  const [toastMsg, setToastMsg] = useState(null);

  const [baudRate, setBaudRate] = useState(scaleState.config.baudRate || 9600);
  const [dataBits, setDataBits] = useState(scaleState.config.dataBits || 8);
  const [stopBits, setStopBits] = useState(scaleState.config.stopBits || 1);
  const [parity, setParity] = useState(scaleState.config.parity || 'none');

  useEffect(() => {
    const unsubscribe = weighingScaleService.subscribe((status) => {
      setScaleState(status);
    });
    return () => unsubscribe();
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      weighingScaleService.saveConfig({ baudRate, dataBits, stopBits, parity });
      await weighingScaleService.connect();
      showToast('✅ RS-232 Digital Scale Connected Successfully!');
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        showToast(`❌ Connection Error: ${err.message}`);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await weighingScaleService.disconnect();
    showToast('🔌 Scale Disconnected.');
  };

  const handleForceReset = async () => {
    await weighingScaleService.forceReset();
    showToast('🔄 Serial Port & Driver Lock Reset. You can now reconnect.');
  };

  const handleSaveSettings = () => {
    weighingScaleService.saveConfig({ baudRate, dataBits, stopBits, parity });
    showToast('⚙️ RS-232 Communication Settings Saved!');
    setActiveTab('live');
  };

  const handleTare = () => {
    weighingScaleService.tare();
    showToast('⚖️ Scale Tared to 0.00 kg');
  };

  const handleClearTare = () => {
    weighingScaleService.clearTare();
    showToast('⚖️ Tare Cleared');
  };

  const handleToggleSimulation = () => {
    if (scaleState.isSimulated) {
      weighingScaleService.stopSimulation();
      showToast('Simulation stopped');
    } else {
      weighingScaleService.startSimulation(parseFloat(customSimWeight) || 245.5);
      showToast('🔬 Test Scale Simulation Active');
    }
  };

  const handleCaptureToCallback = () => {
    if (onCaptureWeight) {
      onCaptureWeight(scaleState.netWeight);
    }
    showToast(`📋 Captured ${scaleState.netWeight.toFixed(2)} kg`);
  };

  return (
    <>
      {/* Navbar Scale Quick Status Badge */}
      <button 
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="scale-badge-btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: scaleState.isConnected 
            ? (scaleState.isSimulated ? '#fef3c7' : '#ecfdf5') 
            : '#f1f5f9',
          border: `1px solid ${scaleState.isConnected ? (scaleState.isSimulated ? '#fde68a' : '#a7f3d0') : '#cbd5e1'}`,
          padding: '5px 12px',
          borderRadius: '8px',
          fontSize: '0.82rem',
          fontWeight: '700',
          color: scaleState.isConnected 
            ? (scaleState.isSimulated ? '#b45309' : '#047857') 
            : '#475569',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: scaleState.isConnected ? '0 1px 3px rgba(4,120,87,0.1)' : 'none'
        }}
        title="Click to view RS-232 Digital Weighing Scale Monitor"
      >
        <Scale size={15} style={{ color: scaleState.isConnected ? (scaleState.isSimulated ? '#d97706' : '#10b981') : '#64748b' }} />
        <span>
          {scaleState.isConnected ? (
            <>
              Scale: <strong style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{scaleState.netWeight.toFixed(2)} kg</strong>
              {scaleState.isSimulated && <span style={{ fontSize: '0.68rem', marginLeft: '4px', opacity: 0.8 }}>(SIM)</span>}
            </>
          ) : (
            'RS232 Scale: Disconnected'
          )}
        </span>
        <span 
          style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            background: scaleState.isConnected ? (scaleState.isSimulated ? '#f59e0b' : '#10b981') : '#94a3b8',
            boxShadow: scaleState.isConnected ? '0 0 6px rgba(16,185,129,0.6)' : 'none',
            display: 'inline-block' 
          }} 
        />
      </button>

      {/* Full Modal Scale Console */}
      {isModalOpen && (
        <div className="pdf-modal-overlay" style={{ zIndex: 9999 }}>
          <div style={{
            background: '#ffffff',
            width: '640px',
            maxWidth: '95vw',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              background: '#0f172a',
              color: '#ffffff',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Scale size={20} style={{ color: '#38bdf8' }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', letterSpacing: '-0.2px' }}>
                    RS-232 Industrial Weighing Scale Terminal
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                    Real-time COM / USB-Serial load cell integration for Rolls, Ink & Dispatch
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
              padding: '0 16px'
            }}>
              <button
                type="button"
                onClick={() => setActiveTab('live')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'live' ? '2px solid var(--primary-brand)' : '2px solid transparent',
                  color: activeTab === 'live' ? 'var(--primary-brand)' : '#64748b',
                  fontWeight: '700',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Activity size={15} /> Live Indicator
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'settings' ? '2px solid var(--primary-brand)' : '2px solid transparent',
                  color: activeTab === 'settings' ? 'var(--primary-brand)' : '#64748b',
                  fontWeight: '700',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Sliders size={15} /> Port Settings (RS-232)
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('troubleshoot')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'troubleshoot' ? '2px solid var(--primary-brand)' : '2px solid transparent',
                  color: activeTab === 'troubleshoot' ? 'var(--primary-brand)' : '#64748b',
                  fontWeight: '700',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <HelpCircle size={15} /> Setup Guide
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', background: '#ffffff', minHeight: '320px' }}>
              {toastMsg && (
                <div style={{
                  background: toastMsg.startsWith('✅') ? '#ecfdf5' : '#fef3c7',
                  color: toastMsg.startsWith('✅') ? '#047857' : '#92400e',
                  border: `1px solid ${toastMsg.startsWith('✅') ? '#a7f3d0' : '#fde68a'}`,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  marginBottom: '14px'
                }}>
                  {toastMsg}
                </div>
              )}

              {activeTab === 'live' && (
                <div>
                  {/* Digital LED Weight Display */}
                  <div style={{
                    background: '#0a0f1d',
                    borderRadius: '10px',
                    padding: '24px',
                    color: '#10b981',
                    boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.6)',
                    border: '2px solid #1e293b',
                    textAlign: 'center',
                    marginBottom: '16px',
                    position: 'relative'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: scaleState.isConnected ? '#10b981' : '#ef4444', display: 'inline-block' }} />
                        {scaleState.isConnected ? (scaleState.isSimulated ? 'TEST SIMULATION' : 'ONLINE (RS-232)') : 'DISCONNECTED'}
                      </span>
                      <span>{scaleState.isStable ? '● STABLE' : '◌ MOTION'}</span>
                    </div>

                    <div style={{
                      fontFamily: '"SF Mono", "Fira Code", monospace, "Courier New"',
                      fontSize: '3.5rem',
                      fontWeight: '800',
                      letterSpacing: '2px',
                      color: scaleState.isConnected ? '#10b981' : '#475569',
                      textShadow: scaleState.isConnected ? '0 0 15px rgba(16, 185, 129, 0.4)' : 'none',
                      lineHeight: '1.1'
                    }}>
                      {scaleState.netWeight.toFixed(2)}
                      <span style={{ fontSize: '1.6rem', marginLeft: '8px', color: '#38bdf8', fontWeight: '600' }}>kg</span>
                    </div>

                    {/* Breakdown sub-bar */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '12px', borderTop: '1px solid #1e293b', paddingTop: '10px', fontSize: '0.78rem', color: '#94a3b8' }}>
                      <span>Gross: <strong style={{ color: '#e2e8f0' }}>{scaleState.grossWeight.toFixed(2)} kg</strong></span>
                      <span>Tare: <strong style={{ color: '#e2e8f0' }}>{scaleState.tareWeight.toFixed(2)} kg</strong></span>
                      <span>Net: <strong style={{ color: '#10b981' }}>{scaleState.netWeight.toFixed(2)} kg</strong></span>
                    </div>

                    {scaleState.lastRawLine && (
                      <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#475569', fontFamily: 'monospace' }}>
                        Raw Stream: {scaleState.lastRawLine}
                      </div>
                    )}
                  </div>

                  {/* Primary Connection & Tare Controls */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                    {!scaleState.isConnected ? (
                      <button
                        type="button"
                        onClick={handleConnect}
                        disabled={isConnecting}
                        className="btn-primary"
                        style={{
                          padding: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          fontSize: '0.9rem',
                          fontWeight: '800',
                          gridColumn: 'span 2'
                        }}
                      >
                        <Power size={18} /> {isConnecting ? 'Selecting COM Port...' : 'Connect RS-232 Weighing Scale'}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleTare}
                          className="btn-secondary"
                          style={{ padding: '10px', fontWeight: '700', fontSize: '0.85rem' }}
                        >
                          ⚖️ Tare (Zero Out)
                        </button>
                        <button
                          type="button"
                          onClick={handleClearTare}
                          className="btn-secondary"
                          style={{ padding: '10px', fontWeight: '700', fontSize: '0.85rem' }}
                        >
                          Clear Tare
                        </button>
                        <button
                          type="button"
                          onClick={handleDisconnect}
                          className="btn-secondary"
                          style={{ padding: '10px', color: '#dc2626', borderColor: '#fca5a5', fontWeight: '700', fontSize: '0.85rem', gridColumn: 'span 2' }}
                        >
                          <Power size={16} style={{ marginRight: '6px' }} /> Disconnect Serial Port
                        </button>
                      </>
                    )}
                  </div>

                  {scaleState.errorMessage && (
                    <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '8px', padding: '12px', color: '#991b1b', fontSize: '0.78rem', lineHeight: '1.5' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', marginBottom: '4px' }}>
                        <AlertCircle size={15} style={{ color: '#dc2626' }} />
                        Windows COM Port Connection Issue:
                      </div>
                      <div>{scaleState.errorMessage}</div>
                      <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                        <button 
                          type="button" 
                          onClick={handleForceReset}
                          className="btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.72rem', fontWeight: '700', background: '#ffffff', color: '#b91c1c', borderColor: '#fca5a5' }}
                        >
                          🔄 Force Reset / Release Port
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setActiveTab('troubleshoot')}
                          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          View Windows Steps
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Simulation / Offline Mode for Testing */}
                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <strong style={{ fontSize: '0.82rem', color: '#334155' }}>Test / Simulation Mode</strong>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          Simulate live digital weight without a physical RS-232 scale attached.
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input 
                          type="number" 
                          step="0.1"
                          style={{ width: '80px', padding: '4px 8px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                          value={customSimWeight}
                          onChange={e => {
                            setCustomSimWeight(e.target.value);
                            if (scaleState.isSimulated) {
                              weighingScaleService.setManualWeight(e.target.value);
                            }
                          }}
                        />
                        <button 
                          type="button"
                          onClick={handleToggleSimulation}
                          className="btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: '700' }}
                        >
                          {scaleState.isSimulated ? 'Stop Sim' : 'Start Sim'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '6px', fontSize: '0.78rem', color: '#475569' }}>
                    Configure the RS-232 serial parameters to match your weighing scale indicator (e.g. Essae, Avery, CAS, Yaohua).
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>Baud Rate (bps)</label>
                      <select 
                        className="form-control" 
                        value={baudRate} 
                        onChange={e => setBaudRate(parseInt(e.target.value, 10))}
                      >
                        <option value="2400">2400 baud</option>
                        <option value="4800">4800 baud</option>
                        <option value="9600">9600 baud (Standard)</option>
                        <option value="19200">19200 baud</option>
                        <option value="38400">38400 baud</option>
                        <option value="115200">115200 baud</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>Data Bits</label>
                      <select 
                        className="form-control" 
                        value={dataBits} 
                        onChange={e => setDataBits(parseInt(e.target.value, 10))}
                      >
                        <option value="8">8 Data Bits (Standard)</option>
                        <option value="7">7 Data Bits</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>Stop Bits</label>
                      <select 
                        className="form-control" 
                        value={stopBits} 
                        onChange={e => setStopBits(parseInt(e.target.value, 10))}
                      >
                        <option value="1">1 Stop Bit (Standard)</option>
                        <option value="2">2 Stop Bits</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>Parity</label>
                      <select 
                        className="form-control" 
                        value={parity} 
                        onChange={e => setParity(e.target.value)}
                      >
                        <option value="none">None (Standard 8-N-1)</option>
                        <option value="even">Even</option>
                        <option value="odd">Odd</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                    <button 
                      type="button" 
                      onClick={() => setActiveTab('live')} 
                      className="btn-secondary" 
                      style={{ padding: '8px 14px', fontSize: '0.82rem' }}
                    >
                      Cancel
                    </button>
                    <button 
                      type="button" 
                      onClick={handleSaveSettings} 
                      className="btn-primary" 
                      style={{ padding: '8px 16px', fontSize: '0.82rem', fontWeight: '700' }}
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'troubleshoot' && (
                <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: '1.6' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                    How to Connect Your RS-232 Weighing Scale:
                  </h4>
                  <ol style={{ paddingLeft: '18px', margin: '0 0 16px 0' }}>
                    <li style={{ marginBottom: '6px' }}>
                      <strong>Physical Cable:</strong> Connect the DB9 RS-232 serial cable from your weighing indicator to your computer (use a USB-to-RS232 FTDI or Prolific adapter if PC has no DB9 port).
                    </li>
                    <li style={{ marginBottom: '6px' }}>
                      <strong>Browser Support:</strong> Open this ERP in <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong> (Web Serial API is natively supported).
                    </li>
                    <li style={{ marginBottom: '6px' }}>
                      <strong>Click Connect:</strong> Click the blue <strong>"Connect RS-232 Weighing Scale"</strong> button. The browser prompt will ask you to select the connected USB/COM port.
                    </li>
                    <li style={{ marginBottom: '6px' }}>
                      <strong>Indicator Mode:</strong> Ensure your weighing indicator is set to <strong>Continuous Send</strong> (or Stream output) in its internal calibration menu.
                    </li>
                  </ol>

                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '6px', color: '#991b1b', marginBottom: '14px' }}>
                    <strong>⚠️ Windows "Failed to open serial port" Fix:</strong>
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px', fontSize: '0.76rem' }}>
                      <li><strong>1. Port in Use:</strong> Windows allows only ONE application to access a COM port at a time. Close any other tabs, PuTTY, Arduino, or indicator utilities.</li>
                      <li><strong>2. Re-plug USB:</strong> Unplug the USB-RS232 converter cable from the PC and plug it back in.</li>
                      <li><strong>3. Device Manager:</strong> Open Windows <em>Device Manager &rarr; Ports (COM &amp; LPT)</em> to confirm the driver is installed without a yellow exclamation icon.</li>
                      <li><strong>4. Force Reset:</strong> Use the <strong>"Force Reset / Release Port"</strong> button in the Live tab before reconnecting.</li>
                    </ul>
                  </div>

                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px 14px', borderRadius: '6px', color: '#1e40af' }}>
                    💡 <strong>Auto Weight Capture:</strong> Once connected, you can click the <strong>⚡ Scale</strong> icon next to any Weight field across GRN Inward, Production records, and Dispatch to instantly populate the live weight!
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              padding: '12px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Status: <strong style={{ color: scaleState.isConnected ? '#047857' : '#64748b' }}>{scaleState.isConnected ? 'Connected' : 'Offline'}</strong>
              </div>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => setIsModalOpen(false)}
                style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              >
                Close Terminal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
