import React, { useState, useMemo } from 'react';
import { 
  FILM_DENSITIES, 
  DEFAULT_DAILY_RATES, 
  DEFAULT_PROCESSING_RATES,
  calculateJobRawMaterials 
} from '../factoryStore';
import { 
  Calculator, 
  Plus, 
  Trash2, 
  FileText, 
  CheckCircle2, 
  Sparkles,
  Info,
  DollarSign
} from 'lucide-react';
import OrderConfirmationPDF from './OrderConfirmationPDF';
import { notifyOrderPunched } from '../services/emailService';

export default function JobPunchingForm({ onSaveOrder, onNavigateToDashboard, initialJobMasterData, clients = [], jobMasters = [] }) {
  // Form State
  const [jobName, setJobName] = useState(() => initialJobMasterData?.jobName || 'Britannia Bourbon 250g Packaging');
  const [clientName, setClientName] = useState(() => initialJobMasterData?.clientName || 'Britannia Industries Ltd');
  const [printWidthMm, setPrintWidthMm] = useState(() => initialJobMasterData?.printWidthMm || 1000);
  const [repeatLengthMm, setRepeatLengthMm] = useState(() => initialJobMasterData?.repeatLengthMm || 400);
  const [orderQtyKg, setOrderQtyKg] = useState(1000);
  const [orderType, setOrderType] = useState('Pouching'); // Reel or Pouching
  const [inkGsm, setInkGsm] = useState(1.5);
  const [adhesiveGsm, setAdhesiveGsm] = useState(1.5);
  const [colorsCount, setColorsCount] = useState(() => initialJobMasterData?.colorsCount || 6);
  const [targetDeliveryDays, setTargetDeliveryDays] = useState(10);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Dynamic Layers State
  const [layers, setLayers] = useState(() => initialJobMasterData?.layers ? initialJobMasterData.layers.map(l => ({ ...l, rate: l.rate ?? l.ratePerKg ?? '' })) : [
    { id: 1, filmType: 'PET', micron: 12, rate: '' },
    { id: 2, filmType: 'METPET', micron: 12, rate: '' },
    { id: 3, filmType: 'Natural GP LD', micron: 35, rate: '' }
  ]);

  React.useEffect(() => {
    if (initialJobMasterData) {
      setJobName(initialJobMasterData.jobName || '');
      setClientName(initialJobMasterData.clientName || '');
      if (initialJobMasterData.printWidthMm) setPrintWidthMm(initialJobMasterData.printWidthMm);
      if (initialJobMasterData.repeatLengthMm) setRepeatLengthMm(initialJobMasterData.repeatLengthMm);
      if (initialJobMasterData.colorsCount) setColorsCount(initialJobMasterData.colorsCount);
      if (initialJobMasterData.layers && initialJobMasterData.layers.length > 0) {
        setLayers(initialJobMasterData.layers.map(l => ({ ...l, rate: l.rate ?? l.ratePerKg ?? '' })));
      }
    }
  }, [initialJobMasterData]);

  // Auto-sync Print Width, Repeat Length, Client, Colors & Layers whenever jobName matches a Job Master
  React.useEffect(() => {
    if (!jobName) return;
    const allJM = (jobMasters && jobMasters.length > 0) ? jobMasters : [];
    const search = jobName.toLowerCase().trim();
    const matchedJM = allJM.find(j => (j.jobName || '').toLowerCase().trim() === search) ||
                      allJM.find(j => (j.jobName || '').toLowerCase().includes(search));
    if (matchedJM) {
      if (matchedJM.printWidthMm) setPrintWidthMm(matchedJM.printWidthMm);
      if (matchedJM.repeatLengthMm) setRepeatLengthMm(matchedJM.repeatLengthMm);
      if (matchedJM.clientName && (!clientName || clientName === 'Britannia Industries Ltd')) setClientName(matchedJM.clientName);
      if (matchedJM.colorsCount) setColorsCount(matchedJM.colorsCount);
      if (matchedJM.layers && matchedJM.layers.length > 0) {
        setLayers(matchedJM.layers.map(l => ({ ...l, rate: l.rate ?? l.ratePerKg ?? '' })));
      }
    }
  }, [jobName, jobMasters]);

  // Lookup matched client in Client Directory
  const matchedClient = useMemo(() => {
    if (!clientName) return null;
    const search = clientName.toLowerCase().trim();
    if (!search) return null;

    const list = (clients && clients.length > 0) ? clients : [];
    return list.find(c => (c.name || c.companyName || '').toLowerCase().trim() === search) ||
           list.find(c => (c.name || c.companyName || '').toLowerCase().includes(search) || search.includes((c.name || c.companyName || '').toLowerCase().trim())) ||
           list.find(c => {
             const firstWord = search.split(' ')[0];
             return firstWord && firstWord.length > 3 && (c.name || c.companyName || '').toLowerCase().includes(firstWord);
           }) || null;
  }, [clientName, clients]);

  // Editable Processing Prices State
  const [inkPrice, setInkPrice] = useState(DEFAULT_PROCESSING_RATES.liquidInkPrice);
  const [adhesivePrice, setAdhesivePrice] = useState(DEFAULT_PROCESSING_RATES.adhesivePrice);

  // Price Modal / Section toggle
  const [showPDFModal, setShowPDFModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Preset structures selector for convenience
  const applyPresetStructure = (presetName) => {
    if (presetName === '3layer_pet_metpet_ld') {
      setLayers([
        { id: 1, filmType: 'PET', micron: 12, rate: '' },
        { id: 2, filmType: 'METPET', micron: 12, rate: '' },
        { id: 3, filmType: 'Natural GP LD', micron: 35, rate: '' }
      ]);
    } else if (presetName === '2layer_pet_ld') {
      setLayers([
        { id: 1, filmType: 'PET', micron: 12, rate: '' },
        { id: 2, filmType: 'Natural GP LD', micron: 50, rate: '' }
      ]);
    } else if (presetName === '3layer_bopp_metbopp_ld') {
      setLayers([
        { id: 1, filmType: 'BOPP Natural', micron: 15, rate: '' },
        { id: 2, filmType: 'Metalised BOPP', micron: 12, rate: '' },
        { id: 3, filmType: 'White LD', micron: 40, rate: '' }
      ]);
    } else if (presetName === '2layer_pearlised_ld') {
      setLayers([
        { id: 1, filmType: 'Pearlised BOPP', micron: 20, rate: '' },
        { id: 2, filmType: 'Natural LD GP Film', micron: 30, rate: '' }
      ]);
    } else if (presetName === '3layer_metallocene') {
      setLayers([
        { id: 1, filmType: 'PET', micron: 12, rate: '' },
        { id: 2, filmType: 'METPET', micron: 12, rate: '' },
        { id: 3, filmType: 'Natural LD Metallocene Film', micron: 40, rate: '' }
      ]);
    } else if (presetName === '3layer_atta_high_dart') {
      setLayers([
        { id: 1, filmType: 'PET', micron: 12, rate: '' },
        { id: 2, filmType: 'METPET', micron: 12, rate: '' },
        { id: 3, filmType: 'Milky Atta (High Dart) Film', micron: 60, rate: '' }
      ]);
    }
  };

  // Add/Remove Layers
  const addLayer = () => {
    setLayers(prev => [...prev, { id: Date.now(), filmType: 'Natural GP LD', micron: 35, rate: '' }]);
  };

  const removeLayer = (id) => {
    if (layers.length <= 1) {
      alert("At least 1 layer is required for laminate calculation.");
      return;
    }
    setLayers(prev => prev.filter(l => l.id !== id));
  };

  const updateLayer = (id, field, value) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  // Live calculation results
  const calculationResults = useMemo(() => {
    const calc = calculateJobRawMaterials({
      jobName,
      printWidthMm: parseFloat(printWidthMm) || 1000,
      repeatLengthMm: parseFloat(repeatLengthMm) || 400,
      orderQtyKg: parseFloat(orderQtyKg) || 0,
      orderType,
      inkGsm: parseFloat(inkGsm) || 0,
      adhesiveGsm: parseFloat(adhesiveGsm) || 0,
      layers,
      filmPrices: {},
      inkPrice: parseFloat(inkPrice) || 1500,
      adhesivePrice: parseFloat(adhesivePrice) || 270
    });

    return {
      ...calc,
      jobName,
      clientName,
      clientDetails: matchedClient,
      printWidthMm: parseFloat(printWidthMm) || 1000,
      repeatLengthMm: parseFloat(repeatLengthMm) || 400
    };
  }, [
    jobName,
    clientName,
    matchedClient,
    printWidthMm,
    repeatLengthMm,
    orderQtyKg,
    orderType,
    inkGsm,
    adhesiveGsm,
    layers,
    inkPrice,
    adhesivePrice
  ]);

  const handleInitiatePunchJob = () => {
    if (isSubmitted) return;
    if (!jobName.trim() || !clientName.trim()) {
      alert("Please enter Job Name and Client Name.");
      return;
    }

    const unratedLayer = layers.find(l => (!l.rate && l.rate !== 0) && (l.rate === '' || l.rate === undefined));
    if (unratedLayer) {
      alert(`Please enter the Market Rate (₹/kg) for Layer (${unratedLayer.filmType}) before proceeding.`);
      return;
    }

    setShowConfirmModal(true);
  };

  const handleFinalConfirmAndPunch = () => {
    setShowConfirmModal(false);
    setIsSubmitted(true);

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + parseInt(targetDeliveryDays || 10));

    const newOrder = {
      id: `ORD-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      jobName,
      clientName,
      orderDate: new Date().toLocaleDateString('en-GB'),
      targetDeliveryDate: targetDate.toLocaleDateString('en-GB'),
      orderQtyKg: parseFloat(orderQtyKg),
      printWidthMm: parseFloat(printWidthMm),
      repeatLengthMm: parseFloat(repeatLengthMm),
      colorsCount: parseInt(colorsCount),
      status: 'In Progress',
      layers,
      structure: layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / '),
      calculationDetails: calculationResults,
      materialRequirements: calculationResults.layerResults.map(l => ({
        id: `REQ-${Math.floor(100 + Math.random() * 900)}`,
        filmType: l.filmType,
        micron: l.micron,
        widthMm: l.widthMm,
        qtyKg: l.grossKg,
        ratePerKg: l.pricePerKg,
        status: 'Required',
        assignedVendor: ''
      }))
    };

    if (onSaveOrder) {
      onSaveOrder(newOrder);
    }

    notifyOrderPunched(newOrder).catch(err => console.error("Order punched email error:", err));

    setShowPDFModal(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Controls */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
              <Calculator size={22} style={{ color: 'var(--primary-brand)' }} /> Order Confirmation & Job Punching Area
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
              Input job specs, substrate layers & microns. Calculates exact raw material requirement in Kgs, ink & adhesive costs, and wastage rules.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-primary" onClick={() => setShowPDFModal(true)}>
              <FileText size={18} /> View Order Confirmation Note (PDF)
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 420px', gap: '24px' }}>
        {/* Left Side: Job Entry Form */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} style={{ color: 'var(--accent-color)' }} /> Job & Layer Specifications
          </h3>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>
              QUICK STRUCTURE PRESETS:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="preset-chip" onClick={() => applyPresetStructure('3layer_pet_metpet_ld')}>12 PET / 12 METPET / 35 LD</button>
              <button className="preset-chip" onClick={() => applyPresetStructure('2layer_pet_ld')}>12 PET / 50 LD</button>
              <button className="preset-chip" onClick={() => applyPresetStructure('3layer_bopp_metbopp_ld')}>15 BOPP / 12 MET BOPP / 40 LD</button>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Job Name *</label>
              <input 
                type="text" 
                className="form-control"
                list="job-masters-options-list"
                value={jobName}
                onChange={e => {
                  const val = e.target.value;
                  setJobName(val);
                  const selectedJM = (jobMasters || []).find(j => j.jobName === val);
                  if (selectedJM) {
                    if (selectedJM.clientName) setClientName(selectedJM.clientName);
                    if (selectedJM.printWidthMm) setPrintWidthMm(selectedJM.printWidthMm);
                    if (selectedJM.repeatLengthMm) setRepeatLengthMm(selectedJM.repeatLengthMm);
                    if (selectedJM.colorsCount) setColorsCount(selectedJM.colorsCount);
                    if (selectedJM.layers && selectedJM.layers.length > 0) {
                      setLayers(selectedJM.layers.map(l => ({ ...l, rate: l.rate ?? l.ratePerKg ?? '' })));
                    }
                  }
                }}
                placeholder="e.g. Britannia Bourbon 250g"
              />
              <datalist id="job-masters-options-list">
                {(jobMasters || []).map((j, i) => (
                  <option key={j.id || i} value={j.jobName}>{j.clientName ? `${j.jobName} (${j.clientName})` : j.jobName}</option>
                ))}
              </datalist>
            </div>

            <div className="form-group">
              <label>Client Name *</label>
              <input 
                type="text" 
                className="form-control"
                list="client-options-list"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="e.g. Britannia Industries"
              />
              <datalist id="client-options-list">
                {(clients || []).map((c, i) => (
                  <option key={c.id || i} value={c.name || c.companyName} />
                ))}
              </datalist>
            </div>

            <div className="form-group">
              <label>Print Width (mm)</label>
              <input type="number" className="form-control" value={printWidthMm} onChange={e => setPrintWidthMm(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Repeat Length (mm)</label>
              <input type="number" className="form-control" value={repeatLengthMm} onChange={e => setRepeatLengthMm(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Order Quantity (Kg) *</label>
              <input type="number" className="form-control" value={orderQtyKg} onChange={e => setOrderQtyKg(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Number of Printing Colors *</label>
              <input type="number" className="form-control" min="1" max="12" value={colorsCount} onChange={e => setColorsCount(e.target.value)} />
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '24px 0' }} />

          {/* Layers Builder */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: '600' }}>Substrate Layers Structure</h4>
            <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={addLayer}>
              <Plus size={14} /> Add Layer
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {layers.map((layer, index) => {
              const density = FILM_DENSITIES[layer.filmType] || 1.0;
              const gsm = ((parseFloat(layer.micron) || 0) * density).toFixed(2);
              const price = (layer.rate !== undefined && layer.rate !== '' && layer.rate !== null && !isNaN(layer.rate)) 
                ? layer.rate 
                : (DEFAULT_DAILY_RATES[layer.filmType] || 130);

              return (
                <div key={layer.id} className="layer-row-card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '40px', fontWeight: '600' }}>
                    <span className="layer-badge">L{index + 1}</span>
                  </div>

                  <div style={{ flex: 2 }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Film Substrate</label>
                    <select 
                      className="form-control" 
                      style={{ padding: '8px' }}
                      value={layer.filmType}
                      onChange={e => updateLayer(layer.id, 'filmType', e.target.value)}
                    >
                      {Object.keys(FILM_DENSITIES).map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Micron (µ) *</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      style={{ padding: '8px' }}
                      value={layer.micron}
                      onChange={e => updateLayer(layer.id, 'micron', e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Rate (₹/kg) *</label>
                    <input 
                      type="number" 
                      step="any"
                      className="form-control" 
                      style={{ padding: '8px', fontWeight: '700', color: '#047857' }}
                      placeholder={`e.g. ${DEFAULT_DAILY_RATES[layer.filmType] || 125}`}
                      value={layer.rate ?? ''}
                      onChange={e => updateLayer(layer.id, 'rate', e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ minWidth: '100px', fontSize: '0.8rem', textAlign: 'right' }}>
                    <span style={{ display: 'block', color: 'var(--text-secondary)' }}>Density: <b>{density}</b></span>
                    <span style={{ display: 'block', color: 'var(--accent-color)', fontWeight: '600' }}>{gsm} GSM</span>
                    <span style={{ display: 'block', color: 'var(--success)', fontWeight: '700' }}>
                      ₹{price}/kg
                    </span>
                  </div>

                  <button className="icon-btn-danger" onClick={() => removeLayer(layer.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button 
              className="btn-primary" 
              style={{ padding: '12px 24px', fontSize: '1rem', opacity: isSubmitted ? 0.6 : 1 }} 
              onClick={handleInitiatePunchJob}
              disabled={isSubmitted}
            >
              <CheckCircle2 size={20} /> {isSubmitted ? 'Job Punched Successfully!' : 'Punch Job & Generate OCN Note'}
            </button>
          </div>
        </div>

        {/* Right Side: Live Calculation Summary Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-card" style={{ background: '#ffffff' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '16px', color: 'var(--primary-brand)' }}>
              🧮 Live Calculation Breakdown
            </h3>

            <div className="calc-summary-box">
              <div className="calc-summary-row">
                <span>Total Laminate GSM:</span>
                <span className="bold-val">{calculationResults.totalLaminateGsm} g/m²</span>
              </div>
              <div className="calc-summary-row">
                <span>Total Surface Area:</span>
                <span className="bold-val">{calculationResults.totalAreaSqm.toLocaleString()} m²</span>
              </div>
              <div className="calc-summary-row">
                <span>Applied Wastage %:</span>
                <span className="badge badge-warning" style={{ fontSize: '0.85rem' }}>{calculationResults.wastagePct}%</span>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '16px 0' }} />

            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>RAW MATERIAL REQUIREMENTS (KG)</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {calculationResults.layerResults.map((l, i) => (
                <div key={i} className="mat-req-card">
                  <div>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Layer {i + 1}: {l.filmType} ({l.micron}µ)
                      {l.isLDFilm && (
                        <span className="badge badge-warning" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                          Width: {l.widthMm}mm (+5mm extra)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Slit Width: <b>{l.widthMm}mm</b> | Rate: ₹{l.pricePerKg}/kg | Net: {l.netKg} kg
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--primary-brand)' }}>{l.grossKg} Kg</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>₹{l.totalCost.toLocaleString()}</div>
                  </div>
                </div>
              ))}

              {/* Ink Details */}
              <div className="mat-req-card">
                <div>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Liquid Ink (+20% solvent wt gain)</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Rate: ₹{calculationResults.inkDetails.pricePerKg}/kg | {calculationResults.inkDetails.gsm} GSM
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#7c3aed' }}>
                    {calculationResults.inkDetails.grossKg} Kg
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    ₹{calculationResults.inkDetails.totalCost?.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Adhesive Details */}
              <div className="mat-req-card">
                <div>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Solvent-less Adhesive (100% wt gain)</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Rate: ₹{calculationResults.adhesiveDetails.pricePerKg}/kg | {calculationResults.adhesiveDetails.gsm} GSM
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#059669' }}>
                    {calculationResults.adhesiveDetails.grossKg} Kg
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    ₹{calculationResults.adhesiveDetails.totalCost?.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '16px 0' }} />

            {/* Total Cost Box */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '16px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Gross Raw Material Required:</span>
                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                  {(calculationResults.summary.totalFilmGrossKg + (calculationResults.inkDetails.grossKg || 0) + (calculationResults.adhesiveDetails.grossKg || 0)).toFixed(2)} Kg
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Cost per finished Kg:</span>
                <span style={{ fontWeight: '700', color: 'var(--success)' }}>
                  ₹{calculationResults.summary.costPerKg} / kg
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #dbeafe', paddingTop: '8px' }}>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Total Raw Material Cost:</span>
                <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1e40af' }}>
                  ₹{calculationResults.summary.totalRawMaterialCost?.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
              <Info size={16} style={{ color: 'var(--warning)' }} /> Note on Densities & Wastage:
            </p>
            <p>• PET / METPET: <b>1.40 g/cm³</b></p>
            <p>• LD Films: <b>0.93 g/cm³</b></p>
            <p>• BOPP (Nat / Met): <b>0.91 g/cm³</b> | Pearlised: <b>0.70 g/cm³</b></p>
            <p>• CPP (Nat / Met): <b>0.91 g/cm³</b></p>
            <p>• Wastage: <b>4.5%</b> (&ge;2MT) | <b>5%</b> (1-2MT) | <b>7%</b> (&le;500kg reel) | <b>8%</b> (&le;500kg pouch)</p>
          </div>
        </div>
      </div>

      {/* Job Punching Final Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="glass-card modal-content" style={{ width: '700px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <CheckCircle2 size={24} style={{ color: 'var(--primary-brand)' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0 }}>Review Job Specifications & Final OCN Summary</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Please double-check all details below. After confirmation, the job order will be saved and an Order Confirmation Note (OCN) will be generated.
            </p>

            {/* Grid of Job Specifications */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--primary-brand)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Job & Client Information
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.88rem' }}>
                <div><span style={{ color: 'var(--text-secondary)' }}>Job Name:</span> <b>{jobName}</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Client Name:</span> <b>{clientName}</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Print Width × Repeat:</span> <b>{printWidthMm}mm × {repeatLengthMm}mm</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Order Quantity:</span> <b>{orderQtyKg} Kg ({orderType})</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Printing Colors:</span> <b>{colorsCount} Colors</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Ink / Adhesive GSM:</span> <b>{inkGsm} / {adhesiveGsm} g/m²</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Target Delivery:</span> <b>{targetDeliveryDays} Days from today</b></div>
              </div>
            </div>

            {/* Substrate Layers Breakdown */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--primary-brand)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Substrate Layers & Market Rates
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {layers.map((l, i) => {
                  const density = FILM_DENSITIES[l.filmType] || 1.0;
                  const gsm = ((parseFloat(l.micron) || 0) * density).toFixed(2);
                  const rateVal = (l.rate !== undefined && l.rate !== '' && l.rate !== null) ? l.rate : (DEFAULT_DAILY_RATES[l.filmType] || 130);
                  return (
                    <div key={l.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '6px', fontSize: '0.88rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="layer-badge">L{i + 1}</span>
                        <span><b>{l.filmType}</b> ({l.micron}µ) — {gsm} GSM</span>
                      </div>
                      <div style={{ fontWeight: '700', color: '#047857' }}>
                        Rate: ₹{rateVal}/kg
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Material & Cost Summary */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <h4 style={{ fontSize: '0.85rem', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                Raw Material & Financial Estimation
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.88rem', marginBottom: '12px' }}>
                <div><span style={{ color: 'var(--text-secondary)' }}>Total Surface Area:</span> <b>{calculationResults.totalAreaSqm?.toLocaleString()} m²</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Applied Wastage %:</span> <b>{calculationResults.wastagePct}%</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Gross RM Required:</span> <b>{(calculationResults.summary.totalFilmGrossKg + (calculationResults.inkDetails.grossKg || 0) + (calculationResults.adhesiveDetails.grossKg || 0)).toFixed(2)} Kg</b></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Cost Per Finished Kg:</span> <b style={{ color: 'var(--success)' }}>₹{calculationResults.summary.costPerKg}/kg</b></div>
              </div>
              <div style={{ borderTop: '1px solid #dbeafe', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1e3a8a' }}>Total Estimated Raw Material Cost:</span>
                <span style={{ fontSize: '1.3rem', fontWeight: '800', color: '#1e40af' }}>₹{calculationResults.summary.totalRawMaterialCost?.toLocaleString()}</span>
              </div>
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn-secondary" onClick={() => setShowConfirmModal(false)}>
                Back to Edit
              </button>
              <button className="btn-primary" onClick={handleFinalConfirmAndPunch} style={{ background: 'var(--primary-brand)', color: '#ffffff' }}>
                <CheckCircle2 size={18} /> Confirm & Generate OCN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF View Modal */}
      {showPDFModal && (
        <OrderConfirmationPDF 
          calculationData={calculationResults} 
          clientDetails={matchedClient}
          clients={clients}
          onClose={() => setShowPDFModal(false)} 
        />
      )}
    </div>
  );
}
