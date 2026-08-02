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

export default function JobPunchingForm({ onSaveOrder, onNavigateToDashboard }) {
  // Form State
  const [jobName, setJobName] = useState('Britannia Bourbon 250g Packaging');
  const [clientName, setClientName] = useState('Britannia Industries Ltd');
  const [printWidthMm, setPrintWidthMm] = useState(1000);
  const [repeatLengthMm, setRepeatLengthMm] = useState(400);
  const [orderQtyKg, setOrderQtyKg] = useState(1000);
  const [orderType, setOrderType] = useState('Pouching'); // Reel or Pouching
  const [inkGsm, setInkGsm] = useState(1.5);
  const [adhesiveGsm, setAdhesiveGsm] = useState(1.5);
  const [colorsCount, setColorsCount] = useState(6);
  const [targetDeliveryDays, setTargetDeliveryDays] = useState(10);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Dynamic Layers State
  const [layers, setLayers] = useState([
    { id: 1, filmType: 'PET', micron: 12 },
    { id: 2, filmType: 'METPET', micron: 12 },
    { id: 3, filmType: 'Natural GP LD', micron: 35 }
  ]);

  // Editable Daily Prices State
  const [filmPrices, setFilmPrices] = useState({ ...DEFAULT_DAILY_RATES });
  const [inkPrice, setInkPrice] = useState(DEFAULT_PROCESSING_RATES.liquidInkPrice);
  const [adhesivePrice, setAdhesivePrice] = useState(DEFAULT_PROCESSING_RATES.adhesivePrice);

  // Price Modal / Section toggle
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showPDFModal, setShowPDFModal] = useState(false);

  // Preset structures selector for convenience
  const applyPresetStructure = (presetName) => {
    if (presetName === '3layer_pet_metpet_ld') {
      setLayers([
        { id: 1, filmType: 'PET', micron: 12 },
        { id: 2, filmType: 'METPET', micron: 12 },
        { id: 3, filmType: 'Natural GP LD', micron: 35 }
      ]);
    } else if (presetName === '2layer_pet_ld') {
      setLayers([
        { id: 1, filmType: 'PET', micron: 12 },
        { id: 2, filmType: 'Natural GP LD', micron: 50 }
      ]);
    } else if (presetName === '3layer_bopp_metbopp_ld') {
      setLayers([
        { id: 1, filmType: 'BOPP Natural', micron: 15 },
        { id: 2, filmType: 'Metalised BOPP', micron: 12 },
        { id: 3, filmType: 'White LD', micron: 40 }
      ]);
    } else if (presetName === '2layer_pearlised_ld') {
      setLayers([
        { id: 1, filmType: 'Pearlised BOPP', micron: 20 },
        { id: 2, filmType: 'Natural LD GP Film', micron: 30 }
      ]);
    } else if (presetName === '3layer_metallocene') {
      setLayers([
        { id: 1, filmType: 'PET', micron: 12 },
        { id: 2, filmType: 'METPET', micron: 12 },
        { id: 3, filmType: 'Natural LD Metallocene Film', micron: 40 }
      ]);
    } else if (presetName === '3layer_atta_high_dart') {
      setLayers([
        { id: 1, filmType: 'PET', micron: 12 },
        { id: 2, filmType: 'METPET', micron: 12 },
        { id: 3, filmType: 'Milky Atta (High Dart) Film', micron: 60 }
      ]);
    }
  };

  // Add/Remove Layers
  const addLayer = () => {
    setLayers(prev => [...prev, { id: Date.now(), filmType: 'Natural GP LD', micron: 35 }]);
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
    return calculateJobRawMaterials({
      jobName,
      printWidthMm: parseFloat(printWidthMm) || 0,
      repeatLengthMm: parseFloat(repeatLengthMm) || 0,
      orderQtyKg: parseFloat(orderQtyKg) || 0,
      orderType,
      inkGsm: parseFloat(inkGsm) || 0,
      adhesiveGsm: parseFloat(adhesiveGsm) || 0,
      layers,
      filmPrices,
      inkPrice: parseFloat(inkPrice) || 1500,
      adhesivePrice: parseFloat(adhesivePrice) || 270
    });
  }, [
    jobName,
    printWidthMm,
    repeatLengthMm,
    orderQtyKg,
    orderType,
    inkGsm,
    adhesiveGsm,
    layers,
    filmPrices,
    inkPrice,
    adhesivePrice
  ]);

  const handleSaveToOrderList = () => {
    if (isSubmitted) return;
    if (!jobName.trim() || !clientName.trim()) {
      alert("Please enter Job Name and Client Name.");
      return;
    }

    setIsSubmitted(true);

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + parseInt(targetDeliveryDays || 10));

    const structureString = layers.map(l => `${l.micron} ${l.filmType}`).join(' / ');

    const newOrder = {
      id: `ORD-2026-${Math.floor(100 + Math.random() * 900)}`,
      jobName,
      clientName,
      orderDate: new Date().toISOString().split('T')[0],
      targetDeliveryDate: targetDate.toISOString().split('T')[0],
      orderQtyKg: parseFloat(orderQtyKg),
      orderType,
      status: "Material Required",
      delayReason: "",
      structure: structureString,
      poIssued: false,
      poNumber: "",
      calculationDetails: calculationResults
    };

    if (onSaveOrder) {
      onSaveOrder(newOrder);
    }
    setShowPDFModal(true);
  };

  const handleClosePDFAndNavigate = () => {
    setShowPDFModal(false);
    setIsSubmitted(false);
    if (onNavigateToDashboard) {
      onNavigateToDashboard();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* PDF View Modal */}
      {showPDFModal && (
        <OrderConfirmationPDF 
          calculationData={calculationResults} 
          onClose={handleClosePDFAndNavigate} 
        />
      )}

      <div className="hide-on-print" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px', background: '#ffffff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
              <Calculator size={22} style={{ color: 'var(--primary-brand)' }} /> Order Confirmation & Job Punching Area
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
              Input job specs, substrate layers & microns. Calculates exact raw material requirement in Kgs, ink & adhesive costs, and wastage rules.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-secondary" onClick={() => setShowPriceModal(true)}>
              <DollarSign size={18} /> Edit Today's Market Rates
            </button>

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

          {/* Quick Presets */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>
              QUICK STRUCTURE PRESETS:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="preset-chip" onClick={() => applyPresetStructure('3layer_pet_metpet_ld')}>
                12 PET / 12 METPET / 35 LD
              </button>
              <button className="preset-chip" onClick={() => applyPresetStructure('2layer_pet_ld')}>
                12 PET / 50 LD
              </button>
              <button className="preset-chip" onClick={() => applyPresetStructure('3layer_bopp_metbopp_ld')}>
                15 BOPP / 12 MET BOPP / 40 LD
              </button>
              <button className="preset-chip" onClick={() => applyPresetStructure('2layer_pearlised_ld')}>
                20 Pearlised BOPP / 30 LD
              </button>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Job Name *</label>
              <input 
                type="text" 
                className="form-control"
                value={jobName}
                onChange={e => setJobName(e.target.value)}
                placeholder="e.g. Britannia Bourbon 250g"
              />
            </div>

            <div className="form-group">
              <label>Client Name *</label>
              <input 
                type="text" 
                className="form-control"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="e.g. Britannia Industries"
              />
            </div>

            <div className="form-group">
              <label>Print Width (mm)</label>
              <input 
                type="number" 
                className="form-control"
                value={printWidthMm}
                onChange={e => setPrintWidthMm(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Repeat Length (mm)</label>
              <input 
                type="number" 
                className="form-control"
                value={repeatLengthMm}
                onChange={e => setRepeatLengthMm(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Order Quantity (Kg) *</label>
              <input 
                type="number" 
                className="form-control"
                value={orderQtyKg}
                onChange={e => setOrderQtyKg(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Number of Printing Colors *</label>
              <input 
                type="number" 
                className="form-control"
                min="1"
                max="12"
                value={colorsCount}
                onChange={e => setColorsCount(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Order Type</label>
              <select 
                className="form-control"
                value={orderType}
                onChange={e => setOrderType(e.target.value)}
              >
                <option value="Reel">Reel Form</option>
                <option value="Pouching">Pouching Form</option>
              </select>
            </div>

            <div className="form-group">
              <label>Estimated Ink GSM (g/m²)</label>
              <input 
                type="number" 
                step="0.1"
                className="form-control"
                value={inkGsm}
                onChange={e => setInkGsm(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Estimated Adhesive GSM (g/m²)</label>
              <input 
                type="number" 
                step="0.1"
                className="form-control"
                value={adhesiveGsm}
                onChange={e => setAdhesiveGsm(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Target Delivery (Days from today)</label>
              <input 
                type="number" 
                className="form-control"
                value={targetDeliveryDays}
                onChange={e => setTargetDeliveryDays(e.target.value)}
              />
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
              const price = filmPrices[layer.filmType] || DEFAULT_DAILY_RATES[layer.filmType] || 130;

              return (
                <div key={layer.id} className="layer-row-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '80px', fontWeight: '600' }}>
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
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Micron (µ)</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      style={{ padding: '8px' }}
                      value={layer.micron}
                      onChange={e => updateLayer(layer.id, 'micron', e.target.value)}
                    />
                  </div>

                  <div style={{ minWidth: '110px', fontSize: '0.8rem', textAlign: 'right' }}>
                    <span style={{ display: 'block', color: 'var(--text-secondary)' }}>Density: <b>{density}</b></span>
                    <span style={{ display: 'block', color: 'var(--accent-color)', fontWeight: '600' }}>{gsm} GSM</span>
                    <span style={{ display: 'block', color: 'var(--success)' }}>₹{price}/kg</span>
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
              onClick={handleSaveToOrderList}
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
                <span className="badge badge-warning" style={{ fontSize: '0.85rem' }}>
                  {calculationResults.wastagePct}% Wastage
                </span>
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

      {/* Edit Market Rates Modal */}
      {showPriceModal && (
        <div className="modal-overlay" onClick={() => setShowPriceModal(false)}>
          <div className="glass-card modal-content" style={{ width: '650px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={20} style={{ color: 'var(--success)' }} /> Daily Raw Material Market Rates (₹ / Kg)
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Film prices change daily. Update today's vendor prices per kg here to apply across job calculations.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {Object.keys(filmPrices).map(type => (
                <div key={type} className="form-group" style={{ marginBottom: '8px' }}>
                  <label>{type} Rate (₹/kg)</label>
                  <input 
                    type="number"
                    className="form-control"
                    value={filmPrices[type]}
                    onChange={e => setFilmPrices({ ...filmPrices, [type]: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              ))}
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label>Liquid Ink Rate (₹/kg incl. solvents)</label>
                <input 
                  type="number"
                  className="form-control"
                  value={inkPrice}
                  onChange={e => setInkPrice(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label>Solvent-less Adhesive Rate (₹/kg)</label>
                <input 
                  type="number"
                  className="form-control"
                  value={adhesivePrice}
                  onChange={e => setAdhesivePrice(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button className="btn-primary" onClick={() => setShowPriceModal(false)}>
                Save Market Rates
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
