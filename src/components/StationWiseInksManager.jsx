import React, { useState, useEffect, useMemo } from 'react';
import { 
  Droplet, 
  Plus, 
  Trash2, 
  Search, 
  CheckCircle2, 
  Sparkles, 
  Save, 
  RefreshCw, 
  RotateCcw,
  Tag, 
  Info, 
  DollarSign,
  Layers
} from 'lucide-react';
import { 
  autoGenerateColorTag, 
  calculateSolidEquivalentRate, 
  calculateStationInksMetrics,
  isStationActive
} from '../utils/inkStationCalculations';

export default function StationWiseInksManager({
  stationWiseInks = [],
  colorsCount = 6,
  inks = [],
  solventPricePerKg = 150,
  fallbackInkRate = 1500,
  onChange,
  onSave,
  readOnly = false,
  title = "Station-wise Inks Configuration"
}) {
  const effectiveFallbackRate = Number(fallbackInkRate) > 0 ? Number(fallbackInkRate) : 1500;

  const createEmptyStation = (stationNo) => ({
    stationNo,
    stationNumber: stationNo,
    shade: '',
    shadeName: '',
    itemCode: '',
    company: '',
    colorTag: autoGenerateColorTag(`Station ${stationNo}`),
    solidContentPct: '',
    solidPercentage: '',
    pricePerKg: '',
    solidEquivalentRate: 0
  });

  const formatStation = (s, idx) => {
    const stationNo = s.stationNo || s.stationNumber || idx + 1;
    const active = isStationActive(s);
    const shade = active ? (s.shade || s.shadeName || '') : '';
    const shadeName = active ? (s.shadeName || s.shade || '') : '';
    const solids = active ? (s.solidContentPct ?? s.solidPercentage ?? '') : '';
    const price = active ? (s.pricePerKg ?? s.ratePerKg ?? '') : '';
    const solidEquiv = active ? calculateSolidEquivalentRate(price, solids) : 0;
    const tag = active 
      ? (s.colorTag || autoGenerateColorTag(shade || `Station ${stationNo}`))
      : autoGenerateColorTag(`Station ${stationNo}`);

    return {
      ...s,
      stationNo,
      stationNumber: stationNo,
      shade,
      shadeName,
      itemCode: active ? (s.itemCode || s.productCode || '') : '',
      company: active ? (s.company || s.manufacturer || s.supplierName || '') : '',
      colorTag: tag,
      solidContentPct: solids,
      solidPercentage: solids,
      pricePerKg: price,
      solidEquivalentRate: solidEquiv
    };
  };

  const initialStations = useMemo(() => {
    if (Array.isArray(stationWiseInks) && stationWiseInks.length > 0) {
      return stationWiseInks.map((s, idx) => formatStation(s, idx));
    }
    // Default to colorsCount
    const count = Math.max(1, parseInt(colorsCount) || 6);
    return Array.from({ length: count }, (_, idx) => createEmptyStation(idx + 1));
  }, [stationWiseInks, colorsCount]);

  const [stations, setStations] = useState(initialStations);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [resetNotice, setResetNotice] = useState(null);

  useEffect(() => {
    if (Array.isArray(stationWiseInks) && stationWiseInks.length > 0) {
      setStations(stationWiseInks.map((s, idx) => formatStation(s, idx)));
    }
  }, [stationWiseInks]);

  const metrics = useMemo(() => {
    return calculateStationInksMetrics(stations, solventPricePerKg, effectiveFallbackRate);
  }, [stations, solventPricePerKg, effectiveFallbackRate]);

  const handleResetStation = (index) => {
    const newStations = [...stations];
    const stationNo = newStations[index]?.stationNo || newStations[index]?.stationNumber || (index + 1);
    newStations[index] = createEmptyStation(stationNo);

    setStations(newStations);
    const updatedMetrics = calculateStationInksMetrics(newStations, solventPricePerKg, effectiveFallbackRate);
    if (onChange) onChange(newStations, updatedMetrics);

    setResetNotice(`Station ${stationNo} ink shade reset to unassigned.`);
    setTimeout(() => setResetNotice(null), 3000);
  };

  const handleResetAllStations = () => {
    const activeCount = stations.filter(isStationActive).length;
    const confirmMsg = activeCount > 0
      ? `Are you sure you want to reset all station inks for this job?\n\n${activeCount} assigned ink shade(s) will be cleared back to unassigned.`
      : `Reset all stations back to unassigned?`;

    if (!window.confirm(confirmMsg)) return;

    const reset = stations.map((s, idx) => {
      const stationNo = s.stationNo || s.stationNumber || (idx + 1);
      return createEmptyStation(stationNo);
    });

    setStations(reset);
    const updatedMetrics = calculateStationInksMetrics(reset, solventPricePerKg, effectiveFallbackRate);
    if (onChange) onChange(reset, updatedMetrics);

    setResetNotice("All station inks have been reset. Click 'Save Inks to Job Profile' to persist.");
    setTimeout(() => setResetNotice(null), 4000);
  };

  const handleSelectInk = (index, inkId) => {
    if (!inkId || inkId === '') {
      handleResetStation(index);
      return;
    }

    const selectedInk = (inks || []).find(i => String(i.id) === String(inkId));
    if (!selectedInk) {
      handleResetStation(index);
      return;
    }

    const newStations = [...stations];
    const stationNo = newStations[index]?.stationNo || newStations[index]?.stationNumber || (index + 1);
    const solids = parseFloat(selectedInk.solidContentPct) || 25;
    const price = parseFloat(selectedInk.pricePerKg) || 280;
    const solidRate = calculateSolidEquivalentRate(price, solids);
    const tag = autoGenerateColorTag(selectedInk.shade);

    newStations[index] = {
      ...newStations[index],
      stationNo,
      stationNumber: stationNo,
      shade: selectedInk.shade,
      shadeName: selectedInk.shade,
      itemCode: selectedInk.productCode || selectedInk.itemCode || '',
      company: selectedInk.manufacturer || selectedInk.supplierName || 'Ink Maker',
      solidContentPct: solids,
      solidPercentage: solids,
      pricePerKg: price,
      solidEquivalentRate: solidRate,
      colorTag: tag
    };

    setStations(newStations);
    if (onChange) onChange(newStations, calculateStationInksMetrics(newStations, solventPricePerKg, effectiveFallbackRate));
  };

  const handleUpdateField = (index, field, value) => {
    const newStations = [...stations];
    newStations[index] = { ...newStations[index], [field]: value };

    if (field === 'pricePerKg' || field === 'solidContentPct') {
      const price = parseFloat(field === 'pricePerKg' ? value : newStations[index].pricePerKg) || 0;
      const solids = parseFloat(field === 'solidContentPct' ? value : newStations[index].solidContentPct) || 0;
      newStations[index].solidEquivalentRate = calculateSolidEquivalentRate(price, solids);
    }
    if (field === 'shade') {
      newStations[index].shadeName = value;
      newStations[index].colorTag = autoGenerateColorTag(value);
    }

    setStations(newStations);
    if (onChange) onChange(newStations, calculateStationInksMetrics(newStations, solventPricePerKg, effectiveFallbackRate));
  };

  const handleAddStation = () => {
    const nextNo = stations.length + 1;
    const newStation = createEmptyStation(nextNo);
    const updated = [...stations, newStation];
    setStations(updated);
    if (onChange) onChange(updated, calculateStationInksMetrics(updated, solventPricePerKg, effectiveFallbackRate));
  };

  const handleRemoveStation = (index) => {
    if (stations.length <= 1) return;
    const updated = stations.filter((_, i) => i !== index).map((s, i) => ({ 
      ...s, 
      stationNo: i + 1,
      stationNumber: i + 1
    }));
    setStations(updated);
    if (onChange) onChange(updated, calculateStationInksMetrics(updated, solventPricePerKg, effectiveFallbackRate));
  };

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(stations, metrics);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (e) {
      console.error("Save station inks failed", e);
      alert("Failed to save station inks: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ background: '#ffffff', borderRadius: '12px', border: '1.5px solid #cbd5e1', padding: '18px', marginTop: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Droplet size={18} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '900', color: '#0f172a' }}>
              {title}
            </h4>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
              Fetched from Ink Master • Calculates Solid Equivalent Rates + Solvent Addition
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {!readOnly && (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleAddStation}
                style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={14} /> Add Station
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleResetAllStations}
                title="Reset all station inks for this job back to unassigned"
                style={{ 
                  fontSize: '0.75rem', 
                  padding: '4px 10px', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  color: '#b91c1c',
                  backgroundColor: '#fef2f2',
                  borderColor: '#fca5a5'
                }}
              >
                <RotateCcw size={13} /> Reset All Inks
              </button>
            </>
          )}

          {onSave && !readOnly && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={isSaving}
              style={{ fontSize: '0.75rem', padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              {isSaving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />} Save Inks to Job Profile
            </button>
          )}
        </div>
      </div>

      {saveSuccess && (
        <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '8px 12px', borderRadius: '6px', fontSize: '0.78rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CheckCircle2 size={16} /> Station-wise Inks successfully saved & synced across Job Master and Cylinders!
        </div>
      )}

      {resetNotice && (
        <div style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', padding: '8px 12px', borderRadius: '6px', fontSize: '0.78rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RotateCcw size={16} /> {resetNotice}
        </div>
      )}

      {/* KPI Metrics Dashboard Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Active Inks</div>
          <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0f172a', marginTop: '2px' }}>
            🎨 {metrics.activeStationsCount} / {stations.length} Stns
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Avg Solids %</div>
          <div style={{ fontSize: '1.05rem', fontWeight: '900', color: metrics.activeStationsCount > 0 ? '#0284c7' : '#94a3b8', marginTop: '2px' }}>
            {metrics.activeStationsCount > 0 ? `${metrics.avgSolidsPct}%` : '—'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Avg 100% Solid Rate</div>
          <div style={{ fontSize: '1.05rem', fontWeight: '900', color: metrics.activeStationsCount > 0 ? '#b45309' : '#94a3b8', marginTop: '2px' }}>
            {metrics.activeStationsCount > 0 ? `₹ ${metrics.avgSolidEquivalentRate.toFixed(2)}/kg` : '—'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Solvent Addition</div>
          <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#059669', marginTop: '2px' }}>
            + ₹ {solventPricePerKg}/kg
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Effective Combined Rate</div>
          <div style={{ fontSize: '1.05rem', fontWeight: '900', color: metrics.activeStationsCount > 0 ? '#0f172a' : '#d97706', marginTop: '2px' }}>
            {metrics.activeStationsCount > 0 
              ? `₹ ${metrics.effectiveDryInkRate.toFixed(2)}/kg` 
              : `₹ ${effectiveFallbackRate.toFixed(2)}/kg`}
          </div>
          {metrics.activeStationsCount === 0 && (
            <span style={{ fontSize: '0.65rem', color: '#b45309', fontWeight: '700', display: 'block', marginTop: '1px' }}>
              (Default from Settings)
            </span>
          )}
        </div>
      </div>

      {/* Fallback Rate Notice Banner when no station inks entered */}
      {metrics.activeStationsCount === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', border: '1px solid #fde68a', padding: '8px 12px', borderRadius: '8px', fontSize: '0.75rem', color: '#92400e', marginBottom: '14px' }}>
          <Info size={15} style={{ color: '#d97706', flexShrink: 0 }} />
          <span>
            Station-wise inks are not entered for this job. Costing will automatically use the <b>default fallback rate of ₹{effectiveFallbackRate.toFixed(2)}/kg</b> configured in System Settings → Material Costs.
          </span>
        </div>
      )}

      {/* Stations Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ fontSize: '0.78rem', width: '100%', minWidth: '820px', margin: 0 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ width: '65px', textAlign: 'center' }}>Station</th>
              <th style={{ width: '85px' }}>Color Tag</th>
              <th>Ink Shade / Master Picker</th>
              <th>Item Code</th>
              <th>Company</th>
              <th style={{ width: '85px' }}>Solids %</th>
              <th style={{ width: '105px' }}>Liquid Price</th>
              <th style={{ width: '120px' }}>100% Solid Equiv</th>
              {!readOnly && <th style={{ width: '85px', textAlign: 'center' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {stations.map((st, idx) => {
              const tag = st.colorTag || autoGenerateColorTag(st.shade || `Station ${idx + 1}`);
              const isActive = isStationActive(st);
              const stationNo = st.stationNo || idx + 1;

              return (
                <tr key={idx} style={{ background: isActive ? 'transparent' : '#fcfdfe' }}>
                  <td style={{ fontWeight: '800', textAlign: 'center' }}>
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      width: '22px', 
                      height: '22px', 
                      borderRadius: '50%', 
                      background: isActive ? '#0284c7' : '#94a3b8', 
                      color: '#ffffff', 
                      fontSize: '0.72rem' 
                    }}>
                      {stationNo}
                    </span>
                  </td>

                  {/* Visual Color Tag Swatch */}
                  <td>
                    <span 
                      style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        padding: '2px 8px', 
                        borderRadius: '4px', 
                        fontSize: '0.7rem', 
                        fontWeight: '800', 
                        background: tag.bg || '#f1f5f9', 
                        color: tag.text || '#0f172a', 
                        border: `1.5px solid ${tag.border || '#cbd5e1'}` 
                      }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tag.hex || (isActive ? '#0284c7' : '#94a3b8') }} />
                      {tag.colorName || `Station ${stationNo}`}
                    </span>
                  </td>

                  {/* Ink Shade Selector */}
                  <td>
                    {readOnly ? (
                      <span style={{ fontWeight: '700' }}>{st.shade || '—'}</span>
                    ) : (
                      <select
                        className="form-control"
                        style={{ fontSize: '0.76rem', padding: '4px 6px', height: '28px', fontWeight: isActive ? '700' : '500' }}
                        value={st.shade ? ((inks || []).find(i => i.shade === st.shade || i.productCode === st.itemCode)?.id || '') : ''}
                        onChange={e => handleSelectInk(idx, e.target.value)}
                      >
                        <option value="">-- Select from Ink Master --</option>
                        {(inks || []).map(ink => (
                          <option key={ink.id} value={ink.id}>
                            {ink.shade} ({ink.productCode}) • {ink.solidContentPct}% Solid @ ₹{ink.pricePerKg}/kg [{ink.manufacturer || 'DIC'}]
                          </option>
                        ))}
                      </select>
                    )}
                  </td>

                  {/* Item Code */}
                  <td>
                    <input
                      type="text"
                      className="form-control"
                      style={{ fontSize: '0.75rem', padding: '3px 6px', height: '26px' }}
                      value={st.itemCode || ''}
                      onChange={e => handleUpdateField(idx, 'itemCode', e.target.value)}
                      placeholder="e.g. FW-55B"
                      disabled={readOnly}
                    />
                  </td>

                  {/* Company */}
                  <td>
                    <input
                      type="text"
                      className="form-control"
                      style={{ fontSize: '0.75rem', padding: '3px 6px', height: '26px' }}
                      value={st.company || ''}
                      onChange={e => handleUpdateField(idx, 'company', e.target.value)}
                      placeholder="e.g. Flint / Siegwerk"
                      disabled={readOnly}
                    />
                  </td>

                  {/* Solids % */}
                  <td>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="100"
                      className="form-control"
                      style={{ fontSize: '0.75rem', padding: '3px 6px', height: '26px', fontWeight: '700', textAlign: 'right' }}
                      value={st.solidContentPct !== undefined && st.solidContentPct !== null ? st.solidContentPct : ''}
                      onChange={e => handleUpdateField(idx, 'solidContentPct', e.target.value)}
                      placeholder="—"
                      disabled={readOnly}
                    />
                  </td>

                  {/* Liquid Price */}
                  <td>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: '#64748b' }}>₹</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className="form-control"
                        style={{ fontSize: '0.75rem', padding: '3px 6px 3px 18px', height: '26px', fontWeight: '700', textAlign: 'right' }}
                        value={st.pricePerKg !== undefined && st.pricePerKg !== null ? st.pricePerKg : ''}
                        onChange={e => handleUpdateField(idx, 'pricePerKg', e.target.value)}
                        placeholder="—"
                        disabled={readOnly}
                      />
                    </div>
                  </td>

                  {/* 100% Solid Equivalent */}
                  <td style={{ fontWeight: '800', color: st.solidEquivalentRate > 0 ? '#b45309' : '#94a3b8', textAlign: 'right' }}>
                    {st.solidEquivalentRate > 0 ? `₹ ${(st.solidEquivalentRate || 0).toFixed(2)}/kg` : '—'}
                  </td>

                  {!readOnly && (
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {/* Individual Station Reset Action */}
                        <button
                          type="button"
                          onClick={() => handleResetStation(idx)}
                          title={`Reset / Clear Station ${stationNo} ink shade`}
                          style={{ 
                            padding: '2px 6px', 
                            fontSize: '0.68rem', 
                            borderRadius: '4px', 
                            border: '1px solid #cbd5e1', 
                            background: isActive ? '#f0f9ff' : '#f8fafc', 
                            color: isActive ? '#0284c7' : '#94a3b8',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          <RotateCcw size={11} />
                          <span style={{ fontWeight: '700' }}>Reset</span>
                        </button>

                        {/* Remove Station Row Action */}
                        {stations.length > 1 && (
                          <button
                            type="button"
                            className="btn-danger"
                            style={{ padding: '2px 5px', fontSize: '0.7rem', border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}
                            onClick={() => handleRemoveStation(idx)}
                            title={`Remove Station ${stationNo}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
