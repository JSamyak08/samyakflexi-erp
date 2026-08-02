import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  Plus, 
  Edit3, 
  Printer, 
  Search, 
  CheckCircle2, 
  AlertTriangle,
  FileCheck,
  Calculator,
  Trash2,
  UploadCloud,
  ExternalLink,
  Image as ImageIcon,
  Check,
  Info
} from 'lucide-react';
import { calculateUtilisation } from '../dataStore';
import CylinderJobCardForm from '../CylinderJobCardForm';
import { uploadArtworkFile, openArtworkViewer } from '../services/supabaseStorageService';
import ArtworkModal from './ArtworkModal';

export default function CylinderManagement({ 
  cylinders, 
  onAddCylinder, 
  onUpdateCylinder,
  onDeleteCylinder
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCylinder, setEditingCylinder] = useState(null);
  const [selectedForPDF, setSelectedForPDF] = useState(null);
  const [activeArtworkModal, setActiveArtworkModal] = useState({ isOpen: false, url: '', title: '' });

  // Form State
  const [sku, setSku] = useState('');
  const [jobName, setJobName] = useState('');
  const [clientGroup, setClientGroup] = useState('');
  const [colorsCount, setColorsCount] = useState(6);
  const [engravuresName, setEngravuresName] = useState('Acme Rotogravure Engravers');
  const [rate, setRate] = useState(1.60);
  const [cylinderCost, setCylinderCost] = useState('35000');
  const [costPerCylinder, setCostPerCylinder] = useState('5833');
  const [costBorneBy, setCostBorneBy] = useState('Client (100%)');
  const [costBorneType, setCostBorneType] = useState('client');
  const [circumferenceMm, setCircumferenceMm] = useState(400);
  const [faceLengthMm, setFaceLengthMm] = useState(1050);
  const [layer1PrintedQtyKg, setLayer1PrintedQtyKg] = useState(385.5);
  const [dispatchedQty, setDispatchedQty] = useState(3855);
  const [utilisationLimit, setUtilisationLimit] = useState(10000);
  const [status, setStatus] = useState('Active In-Use');
  const [artworkUrl, setArtworkUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [autoCalculateCost, setAutoCalculateCost] = useState(true);

  // Surface Area and Cost Calculations: (Face Length × Circumference ÷ 100) × Rate × Colors
  const billingAreaUnits = Number(((Number(circumferenceMm || 0) * Number(faceLengthMm || 0)) / 100).toFixed(2));
  const calculatedCostPerCylinder = Math.round(billingAreaUnits * Number(rate || 1.6));
  const calculatedTotalSetCost = Math.round(calculatedCostPerCylinder * (parseInt(colorsCount) || 1));

  // Automatically update costs when dimensions, colors, or rates change if autoCalculateCost is active
  useEffect(() => {
    if (autoCalculateCost && circumferenceMm > 0 && faceLengthMm > 0) {
      setCostPerCylinder(String(calculatedCostPerCylinder));
      setCylinderCost(String(calculatedTotalSetCost));
    }
  }, [circumferenceMm, faceLengthMm, rate, colorsCount, autoCalculateCost, calculatedCostPerCylinder, calculatedTotalSetCost]);

  const openAddModal = () => {
    setEditingCylinder(null);
    setSku(`SKU-CYL-00${cylinders.length + 1}`);
    setJobName('');
    setClientGroup('');
    setColorsCount(6);
    setEngravuresName('Acme Rotogravure Engravers');
    setRate(1.60);
    setCircumferenceMm(400);
    setFaceLengthMm(1050);
    setAutoCalculateCost(true);
    setCostBorneBy('Client (100%)');
    setCostBorneType('client');
    setLayer1PrintedQtyKg(500);
    setDispatchedQty(500);
    setUtilisationLimit(10000);
    setStatus('Active In-Use');
    setArtworkUrl('');
    setIsModalOpen(true);
  };

  const openEditModal = (cyl) => {
    setEditingCylinder(cyl);
    setSku(cyl.sku || '');
    setJobName(cyl.jobName || '');
    setClientGroup(cyl.clientGroup || '');
    setColorsCount(cyl.colorsCount || 6);
    setEngravuresName(cyl.engravuresName || 'Acme Rotogravure Engravers');
    setRate(cyl.rate || cyl.ratePerSqInch || 1.60);
    setCircumferenceMm(cyl.circumferenceMm || 400);
    setFaceLengthMm(cyl.faceLengthMm || 1050);
    setCylinderCost(`${cyl.cylinderCost || ''}`.replace(/[^0-9]/g, ''));
    setCostPerCylinder(`${cyl.costPerCylinder || ''}`.replace(/[^0-9]/g, '') || String(Math.round((parseInt(`${cyl.cylinderCost || 0}`.replace(/[^0-9]/g, '')) || 0) / (cyl.colorsCount || 1))));
    setAutoCalculateCost(false);
    setCostBorneBy(cyl.costBorneBy || 'Client (100%)');
    setCostBorneType(cyl.costBorneType || 'client');
    setLayer1PrintedQtyKg(cyl.layer1PrintedQtyKg || 385);
    setDispatchedQty(cyl.dispatchedQty || 0);
    setUtilisationLimit(cyl.utilisationLimit || 10000);
    setStatus(cyl.status || 'Active In-Use');
    setArtworkUrl(cyl.artworkUrl || '');
    setIsModalOpen(true);
  };

  const handleArtworkUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await uploadArtworkFile(file, sku || jobName || 'cylinder');
      if (result.success && result.publicUrl) {
        setArtworkUrl(result.publicUrl);
        alert("Artwork uploaded to Supabase Storage successfully!");
      } else {
        alert("Artwork upload note: " + (result.error || "Stored locally in session"));
        if (result.publicUrl) setArtworkUrl(result.publicUrl);
      }
    } catch (err) {
      console.error("Artwork upload error:", err);
      alert("Artwork upload failed: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveCylinder = (e) => {
    e.preventDefault();
    if (!jobName.trim() || !sku.trim()) {
      alert("SKU and Job Name are required!");
      return;
    }

    const payload = {
      id: editingCylinder ? editingCylinder.id : Date.now(),
      sku,
      jobName,
      clientGroup,
      colorsCount: parseInt(colorsCount) || 1,
      rate: parseFloat(rate) || 1.6,
      ratePerSqInch: parseFloat(rate) || 1.6,
      costPerCylinder: `₹ ${parseInt(costPerCylinder || 0).toLocaleString()}`,
      cylinderCost: `₹ ${parseInt(cylinderCost || 0).toLocaleString()}`,
      engravuresName,
      costBorneBy,
      costBorneType,
      circumferenceMm: parseInt(circumferenceMm) || 400,
      faceLengthMm: parseInt(faceLengthMm) || 1050,
      layer1PrintedQtyKg: parseFloat(layer1PrintedQtyKg) || 0,
      dispatchedQty: parseFloat(dispatchedQty) || 0,
      utilisationLimit: parseInt(utilisationLimit) || 10000,
      status,
      artworkUrl: artworkUrl || null
    };

    if (editingCylinder) {
      if (onUpdateCylinder) onUpdateCylinder(payload);
    } else {
      if (onAddCylinder) onAddCylinder(payload);
    }

    setIsModalOpen(false);
    alert(`Rotogravure Cylinder Set "${jobName}" saved successfully!`);
  };

  const handleDelete = (cyl) => {
    if (window.confirm(`Are you sure you want to delete Cylinder Set "${cyl.jobName}" (${cyl.sku})? This cannot be undone.`)) {
      if (onDeleteCylinder) {
        onDeleteCylinder(cyl.id);
      }
    }
  };

  const filteredCylinders = cylinders.filter(c => 
    c.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.jobName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.clientGroup && c.clientGroup.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.engravuresName && c.engravuresName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Layers size={22} style={{ color: 'var(--primary-brand)' }} /> Rotogravure Cylinder Database & Utilisation Tracking
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
              Automated Cylinder Surface Area & Cost Calculation, Cloud Artwork Storage, and Layer 1 Substrate Wear Tracking.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                className="form-control"
                style={{ paddingLeft: '36px' }}
                placeholder="Search SKU, job name, or client..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <button className="btn-primary" onClick={openAddModal}>
              <Plus size={16} /> Add New Cylinder Set
            </button>
          </div>
        </div>
      </div>

      {/* Main Cylinders Directory Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700' }}>Active Printing Cylinders Directory</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Showing <strong>{filteredCylinders.length}</strong> cylinder sets
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU & Artwork</th>
                <th>Job Name & Colors</th>
                <th>Dimensions & Area</th>
                <th>Client Group</th>
                <th>Cost & Engraver</th>
                <th>Cost Borne By</th>
                <th>Layer 1 Print (Kg)</th>
                <th>Wear Utilisation</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCylinders.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No cylinders found matching your search.
                  </td>
                </tr>
              ) : (
                filteredCylinders.map(c => {
                  const util = calculateUtilisation(c.dispatchedQty, c.utilisationLimit || 10000);
                  const isWarning = util >= 80;
                  const cCirc = c.circumferenceMm || 400;
                  const cFace = c.faceLengthMm || 1050;
                  const cUnits = Math.round((cCirc * cFace) / 100);

                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {c.artworkUrl ? (
                            <img 
                              src={c.artworkUrl} 
                              alt="Artwork" 
                              style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }} 
                              onClick={() => setActiveArtworkModal({ isOpen: true, url: c.artworkUrl, title: `${c.sku} - ${c.jobName}` })}
                              title="Click to view artwork"
                            />
                          ) : (
                            <div style={{ width: '36px', height: '36px', background: '#f1f5f9', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                              <Layers size={18} />
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: '700', color: 'var(--primary-brand)', fontSize: '0.85rem' }}>{c.sku}</div>
                            {c.artworkUrl && (
                              <button 
                                type="button"
                                onClick={() => setActiveArtworkModal({ isOpen: true, url: c.artworkUrl, title: `${c.sku} - ${c.jobName}` })}
                                style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.7rem', color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: '500' }}
                              >
                                View Artwork <ExternalLink size={10} />
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '700' }}>{c.jobName}</div>
                        <span className="badge badge-both" style={{ fontSize: '0.7rem', padding: '2px 6px', marginTop: '2px' }}>
                          🎨 {c.colorsCount || 6} Printing Colors
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>{cFace}L × {cCirc}C mm</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cUnits.toLocaleString()} sq. cm (L×C÷100)</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{c.clientGroup || 'Standard'}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>{c.cylinderCost}</div>
                        {c.costPerCylinder && (
                          <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: '600' }}>
                            ({c.costPerCylinder} / cyl)
                          </div>
                        )}
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.engravuresName}</div>
                      </td>
                      <td>
                        <span className={`badge badge-${c.costBorneType || 'client'}`}>{c.costBorneBy || 'Client (100%)'}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '800', color: 'var(--primary-brand)' }}>
                          {c.layer1PrintedQtyKg ? `${c.layer1PrintedQtyKg} kg` : `${c.dispatchedQty} kg`}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Layer 1 Substrate</div>
                      </td>
                      <td style={{ minWidth: '160px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{c.dispatchedQty}kg / {c.utilisationLimit || 10000}kg</span>
                          <span style={{ color: isWarning ? 'var(--warning)' : 'var(--success)', fontWeight: 'bold' }}>{util}%</span>
                        </div>
                        <div className="progress-container" style={{ marginTop: '4px' }}>
                          <div className={`progress-fill ${isWarning ? 'warning' : ''}`} style={{ width: `${util}%`, background: isWarning ? '#d97706' : '#0f172a' }}></div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${c.status === 'Worn Out / Retouch Needed' ? 'badge-warning' : 'badge-us'}`}>
                          {c.status || 'Active In-Use'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn-secondary" style={{ padding: '6px 8px', fontSize: '0.75rem' }} onClick={() => openEditModal(c)} title="Edit Specifications">
                            <Edit3 size={14} />
                          </button>

                          <button className="btn-secondary" style={{ padding: '6px 8px', fontSize: '0.75rem' }} onClick={() => setSelectedForPDF(c)} title="Print Job Card">
                            <Printer size={14} />
                          </button>

                          <button 
                            className="btn-secondary" 
                            style={{ padding: '6px 8px', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fecaca' }} 
                            onClick={() => handleDelete(c)}
                            title="Delete Cylinder Set"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Cylinder Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '760px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={20} style={{ color: 'var(--primary-brand)' }} /> {editingCylinder ? 'Edit Cylinder Set' : 'Add New Rotogravure Cylinder Set'}
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '18px' }}>
              Enter cylinder technical parameters, substrate wear limits, and calculate engraving costs automatically.
            </p>

            <form onSubmit={handleSaveCylinder}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Cylinder SKU Code *</label>
                  <input type="text" className="form-control" required value={sku} onChange={e => setSku(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Job / Brand Name *</label>
                  <input type="text" className="form-control" required placeholder="e.g. Britannia Bourbon 250g" value={jobName} onChange={e => setJobName(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Client Group *</label>
                  <input type="text" className="form-control" required placeholder="e.g. Britannia Industries" value={clientGroup} onChange={e => setClientGroup(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Number of Printing Colors (Cylinders) *</label>
                  <input type="number" className="form-control" required min="1" max="12" value={colorsCount} onChange={e => setColorsCount(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Cylinder Circumference (mm) *</label>
                  <input type="number" className="form-control" required value={circumferenceMm} onChange={e => setCircumferenceMm(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Face Length (mm) *</label>
                  <input type="number" className="form-control" required value={faceLengthMm} onChange={e => setFaceLengthMm(e.target.value)} />
                </div>

                {/* AUTOMATED COST CALCULATION SECTION */}
                <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calculator size={18} style={{ color: '#2563eb' }} />
                      Cylinder Cost Calculator (Formula Engine)
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={autoCalculateCost} 
                        onChange={e => setAutoCalculateCost(e.target.checked)} 
                      />
                      Auto-Calculate from Dimensions
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Surface Area (sq cm)</div>
                      <div style={{ fontWeight: '700', fontSize: '1rem', color: '#0f172a' }}>{billingAreaUnits.toLocaleString()} sq. cm</div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>({faceLengthMm} × {circumferenceMm} ÷ 100)</div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Cylinder Rate (₹/sq cm)</div>
                      <input 
                        type="number" 
                        step="0.01"
                        className="form-control" 
                        style={{ padding: '4px 8px', fontSize: '0.9rem', marginTop: '2px' }}
                        value={rate} 
                        onChange={e => setRate(e.target.value)} 
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Cost / Cylinder (₹)</div>
                      <input 
                        type="number" 
                        className="form-control" 
                        style={{ padding: '4px 8px', fontSize: '0.9rem', marginTop: '2px', fontWeight: '700', color: '#047857' }}
                        value={costPerCylinder} 
                        onChange={e => {
                          setCostPerCylinder(e.target.value);
                          setAutoCalculateCost(false);
                        }} 
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Set Cost ({colorsCount} Cyls)</div>
                      <input 
                        type="number" 
                        className="form-control" 
                        style={{ padding: '4px 8px', fontSize: '0.9rem', marginTop: '2px', fontWeight: '800', color: '#1e3a8a' }}
                        value={cylinderCost} 
                        onChange={e => {
                          setCylinderCost(e.target.value);
                          setAutoCalculateCost(false);
                        }} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#475569', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                    <span>Formula: <code>(Face Length × Circumference ÷ 100) × Rate × Colors</code></span>
                    {!autoCalculateCost && (
                      <button 
                        type="button" 
                        className="btn-secondary" 
                        style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                        onClick={() => {
                          setAutoCalculateCost(true);
                          setCostPerCylinder(String(calculatedCostPerCylinder));
                          setCylinderCost(String(calculatedTotalSetCost));
                        }}
                      >
                        Reset to Calculated (₹{calculatedTotalSetCost.toLocaleString()})
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Engraver Name</label>
                  <input type="text" className="form-control" value={engravuresName} onChange={e => setEngravuresName(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Cost Borne By</label>
                  <select className="form-control" value={costBorneBy} onChange={e => {
                    setCostBorneBy(e.target.value);
                    if (e.target.value.includes('Client')) setCostBorneType('client');
                    else if (e.target.value.includes('Us')) setCostBorneType('us');
                    else setCostBorneType('both');
                  }}>
                    <option value="Client (100%)">Client (100%)</option>
                    <option value="Us (100%)">Us / Samyak (100%)</option>
                    <option value="Both (50/50)">Both (50/50)</option>
                  </select>
                </div>

                {/* ARTWORK UPLOAD SECTION (SUPABASE STORAGE) */}
                <div style={{ gridColumn: 'span 2', border: '1px dashed #cbd5e1', padding: '14px', borderRadius: '8px', background: '#fafafa' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.85rem' }}>
                    Artwork Proof / Keyline Drawing (Supabase Cloud Storage)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    {artworkUrl ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img 
                          src={artworkUrl} 
                          alt="Artwork Preview" 
                          style={{ width: '60px', height: '60px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }} 
                          onClick={() => setActiveArtworkModal({ isOpen: true, url: artworkUrl, title: `${sku || 'Cylinder'} Artwork` })}
                          title="Click to view full image"
                        />
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#047857', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Check size={14} /> Artwork Stored
                          </div>
                          <button 
                            type="button" 
                            onClick={() => setActiveArtworkModal({ isOpen: true, url: artworkUrl, title: `${sku || 'Cylinder'} Artwork` })}
                            style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            View Full Artwork
                          </button>
                          <button type="button" style={{ display: 'block', fontSize: '0.7rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '2px' }} onClick={() => setArtworkUrl('')}>
                            Remove Artwork
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ImageIcon size={20} /> No artwork uploaded yet.
                      </div>
                    )}

                    <div style={{ marginLeft: 'auto' }}>
                      <label className="btn-secondary" style={{ cursor: isUploading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                        <UploadCloud size={14} /> {isUploading ? 'Uploading to Supabase...' : 'Upload Artwork File'}
                        <input 
                          type="file" 
                          accept="image/*,.pdf" 
                          style={{ display: 'none' }} 
                          disabled={isUploading}
                          onChange={handleArtworkUpload} 
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Layer 1 Printing Substrate Qty (Kg)</label>
                  <input type="number" className="form-control" value={layer1PrintedQtyKg} onChange={e => setLayer1PrintedQtyKg(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Total Dispatched Printed Qty (Kg)</label>
                  <input type="number" className="form-control" value={dispatchedQty} onChange={e => setDispatchedQty(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Max Utilisation Life Limit (Kg)</label>
                  <input type="number" className="form-control" value={utilisationLimit} onChange={e => setUtilisationLimit(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Cylinder Status</label>
                  <select className="form-control" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="Active In-Use">Active In-Use</option>
                    <option value="Under Engraving">Under Engraving / Chroming</option>
                    <option value="Worn Out / Retouch Needed">Worn Out / Retouch Needed</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  <CheckCircle2 size={16} /> Save Cylinder Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Job Card PDF Modal */}
      {selectedForPDF && (
        <div className="pdf-modal-overlay">
          <div className="pdf-modal-toolbar no-print">
            <button className="btn-secondary" onClick={() => setSelectedForPDF(null)}>
              Close Job Card
            </button>
          </div>
          <div className="pdf-paper-container landscape" style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', maxWidth: '1200px', width: '95vw', overflowY: 'auto' }}>
            <CylinderJobCardForm 
              initialData={selectedForPDF} 
              onClose={() => setSelectedForPDF(null)} 
              onSave={(updated) => {
                if (onUpdateCylinder) {
                  onUpdateCylinder({
                    ...selectedForPDF,
                    sku: updated.skuCode || updated.sku || selectedForPDF.sku,
                    jobName: updated.jobName || selectedForPDF.jobName,
                    cylinderCost: updated.cylinderCost || selectedForPDF.cylinderCost,
                    costPerCylinder: updated.costPerCylinder || selectedForPDF.costPerCylinder,
                    ratePerSqInch: updated.ratePerSqInch || selectedForPDF.ratePerSqInch,
                    engravuresName: updated.engravure || selectedForPDF.engravuresName,
                    costBorneBy: updated.costBorneBy || selectedForPDF.costBorneBy,
                    clientGroup: updated.partyName || selectedForPDF.clientGroup,
                    colorsCount: parseInt(updated.numberOfCylinders) || selectedForPDF.colorsCount,
                    artworkUrl: updated.artworkUrl || selectedForPDF.artworkUrl
                  });
                }
              }}
            />
          </div>
        </div>
      )}

      {/* In-App Artwork Lightbox Modal */}
      <ArtworkModal
        isOpen={activeArtworkModal.isOpen}
        onClose={() => setActiveArtworkModal({ isOpen: false, url: '', title: '' })}
        artworkUrl={activeArtworkModal.url}
        title={activeArtworkModal.title}
        onReupload={() => {
          setIsModalOpen(true);
        }}
      />
    </div>
  );
}
