import React, { useState, useEffect, useMemo } from 'react';
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
  Info,
  FileCode,
  X,
  Building2,
  Lock
} from 'lucide-react';
import { calculateUtilisation } from '../dataStore';
import { FILM_DENSITIES } from '../factoryStore';
import CylinderJobCardForm from '../CylinderJobCardForm';
import { uploadArtworkFile, openArtworkViewer } from '../services/supabaseStorageService';
import ArtworkModal from './ArtworkModal';

export default function CylinderManagement({ 
  urlParams = {},
  cylinders = [], 
  clients = [],
  onAddClient,
  jobMasters = [],
  onAddJobMaster,
  currentUser,
  onAddCylinder, 
  onUpdateCylinder,
  onDeleteCylinder,
  machines = []
}) {
  const EDIT_ROLES = ['Admin', 'SuperAdmin', 'Plant Manager', 'Production Manager'];
  const userRole = currentUser?.role || 'Admin';
  const canEditCylinders = EDIT_ROLES.includes(userRole);
  const isAdmin = userRole === 'Admin' || userRole === 'SuperAdmin';

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (urlParams && urlParams.id) {
      setSearchTerm(urlParams.id);
    }
  }, [urlParams?.id]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCylinder, setEditingCylinder] = useState(null);
  const [selectedForPDF, setSelectedForPDF] = useState(null);
  const [activeArtworkModal, setActiveArtworkModal] = useState({ isOpen: false, url: '', title: '' });

  // Live printing press list — only Rotogravure / Flexographic / Digital machines
  const printingPresses = useMemo(() => {
    const PRINTING_TYPES = ['Rotogravure', 'Flexographic', 'Digital'];
    const presses = machines
      .filter(m => PRINTING_TYPES.includes(m.type))
      .map(m => m.name);
    // Fallback if no machines loaded yet
    return presses.length > 0 ? presses : [
      'Rotogravure Press #1 (8-Color)',
      'Rotogravure Press #2 (10-Color)',
      'Flexographic Press #1 (6-Color)'
    ];
  }, [machines]);

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
  const [assignedPress, setAssignedPress] = useState('');
  const [artworkUrl, setArtworkUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [autoCalculateCost, setAutoCalculateCost] = useState(true);

  // Product Structure (Laminate Layers) State
  const [layers, setLayers] = useState([
    { id: 1, filmType: 'PET', micron: 12 },
    { id: 2, filmType: 'METPET', micron: 12 },
    { id: 3, filmType: 'Natural GP LD', micron: 35 }
  ]);

  // Job Master Auto-Creation Toggle
  const [createJobMaster, setCreateJobMaster] = useState(true);

  // Pouch Dimensions
  const [pouchOpenWidth, setPouchOpenWidth] = useState(0);
  const [pouchHeight, setPouchHeight] = useState(0);

  // Press Marks & Quality Guidelines State
  const [silLogo, setSilLogo] = useState("Yes - 'Pkg Material Mfg by - Samyak International Ltd'");
  const [arcMark, setArcMark] = useState('Yes');
  const [slittingMark, setSlittingMark] = useState('Yes');
  const [trackerLine, setTrackerLine] = useState('Yes');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Available film types for substrate layer dropdown
  const availableFilmTypes = useMemo(() => Object.keys(FILM_DENSITIES), []);

  // Add / Remove substrate layer helpers
  const addLayer = () => {
    setLayers(prev => [
      ...prev,
      { id: Date.now(), filmType: 'PET', micron: 12 }
    ]);
  };

  const removeLayer = (layerId) => {
    setLayers(prev => prev.filter(l => l.id !== layerId));
  };

  // Quick Client Onboarding State
  const [isOnboardClientModalOpen, setIsOnboardClientModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newContactPerson, setNewContactPerson] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newGstin, setNewGstin] = useState('');

  // Client Directory Dropdown Options
  const allClientOptions = useMemo(() => {
    const map = new Map();
    (clients || []).forEach(c => {
      if (c.companyName || c.name) {
        const name = (c.companyName || c.name).trim();
        if (name) map.set(name.toLowerCase(), { name, gstin: c.gstin || '' });
      }
    });
    (jobMasters || []).forEach(j => {
      if (j.clientName) {
        const name = j.clientName.trim();
        if (name && !map.has(name.toLowerCase())) {
          map.set(name.toLowerCase(), { name, gstin: '' });
        }
      }
    });
    (cylinders || []).forEach(c => {
      if (c.clientGroup) {
        const name = c.clientGroup.trim();
        if (name && !map.has(name.toLowerCase())) {
          map.set(name.toLowerCase(), { name, gstin: '' });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, jobMasters, cylinders]);

  const handleQuickOnboardClientSubmit = (e) => {
    e.preventDefault();
    if (!newClientName.trim()) {
      alert("Company / Client Name is required!");
      return;
    }

    const name = newClientName.trim();
    const createdClient = {
      id: `CLI-2026-${Date.now().toString().slice(-4)}`,
      name,
      companyName: name,
      contactPerson: newContactPerson.trim(),
      phone: newPhone.trim(),
      email: newEmail.trim(),
      gstin: newGstin.trim(),
      createdAt: new Date().toISOString()
    };

    if (onAddClient) {
      onAddClient(createdClient);
    }

    setClientGroup(name);
    setIsOnboardClientModalOpen(false);
    setNewClientName('');
    setNewContactPerson('');
    setNewPhone('');
    setNewEmail('');
    setNewGstin('');
    alert(`Client "${name}" onboarded and selected!`);
  };

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
    setSku(`SKU-CYL-00${(cylinders || []).length + 1}`);
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
    setAssignedPress(printingPresses[0] || '');
    setArtworkUrl('');
    setLayers([
      { id: 1, filmType: 'PET', micron: 12 },
      { id: 2, filmType: 'METPET', micron: 12 },
      { id: 3, filmType: 'Natural GP LD', micron: 35 }
    ]);
    setCreateJobMaster(true);
    setPouchOpenWidth(0);
    setPouchHeight(0);
    setSilLogo("Yes - 'Pkg Material Mfg by - Samyak International Ltd'");
    setArcMark('Yes');
    setSlittingMark('Yes');
    setTrackerLine('Yes');
    setSpecialInstructions('');
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
    setAssignedPress(cyl.assignedPress || printingPresses[0] || '');
    setArtworkUrl(cyl.artworkUrl || '');

    if (cyl.layers && cyl.layers.length > 0) {
      setLayers(cyl.layers);
    } else if (cyl.structure) {
      const parts = String(cyl.structure).split('/');
      setLayers(parts.map((p, i) => {
        const trimmed = p.trim();
        const mMatch = trimmed.match(/(\d+)\s*µ?/);
        const mic = mMatch ? parseInt(mMatch[1], 10) : 12;
        const ft = trimmed.replace(/\d+\s*µ?/, '').trim() || 'PET';
        return { id: i + 1, filmType: ft, micron: mic };
      }));
    } else {
      setLayers([
        { id: 1, filmType: 'PET', micron: 12 },
        { id: 2, filmType: 'METPET', micron: 12 },
        { id: 3, filmType: 'Natural GP LD', micron: 35 }
      ]);
    }
    setCreateJobMaster(false);
    setPouchOpenWidth(cyl.pouchOpenWidth || 0);
    setPouchHeight(cyl.pouchHeight || 0);
    setSilLogo(cyl.silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'");
    setArcMark(cyl.arcMark || 'Yes');
    setSlittingMark(cyl.slittingMark || 'Yes');
    setTrackerLine(cyl.trackerLine || 'Yes');
    setSpecialInstructions(cyl.specialInstructions || '');
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

    const structureSummary = layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ');
    const nextJmId = `JM-2026-${String((jobMasters ? jobMasters.length : 0) + 101).padStart(3, '0')}`;

    const payload = {
      id: editingCylinder ? editingCylinder.id : Date.now(),
      sku,
      jobName,
      clientGroup,
      structure: structureSummary,
      layers,
      jobMasterId: editingCylinder ? (editingCylinder.jobMasterId || editingCylinder.id) : nextJmId,
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
      pouchOpenWidth: parseFloat(pouchOpenWidth) || 0,
      pouchHeight: parseFloat(pouchHeight) || 0,
      layer1PrintedQtyKg: parseFloat(layer1PrintedQtyKg) || 0,
      dispatchedQty: parseFloat(dispatchedQty) || 0,
      utilisationLimit: parseInt(utilisationLimit) || 10000,
      status,
      assignedPress: assignedPress || '',
      artworkUrl: artworkUrl || null,
      silLogo: silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
      arcMark: arcMark || 'Yes',
      slittingMark: slittingMark || 'Yes',
      trackerLine: trackerLine || 'Yes',
      specialInstructions: specialInstructions || ''
    };

    if (editingCylinder) {
      if (onUpdateCylinder) onUpdateCylinder(payload);
    } else {
      if (onAddCylinder) onAddCylinder(payload);

      // Automatically create consequent product entry in Job Master Directory if enabled
      if (createJobMaster && onAddJobMaster) {
        const newJobMaster = {
          id: nextJmId,
          skuCode: sku.trim(),
          jobName: jobName.trim(),
          clientName: clientGroup.trim() || 'Standard Client',
          structure: structureSummary,
          printWidthMm: parseFloat(faceLengthMm) || 1050,
          repeatLengthMm: parseFloat(circumferenceMm) || 400,
          pouchOpenWidth: parseFloat(pouchOpenWidth) || 0,
          pouchHeight: parseFloat(pouchHeight) || 0,
          layers: layers,
          cylinderSku: sku.trim(),
          cylinderCost: `₹ ${parseInt(cylinderCost || 0).toLocaleString()}`,
          colorsCount: parseInt(colorsCount) || 6,
          engravuresName,
          costBorneBy,
          utilisationLimit: parseFloat(utilisationLimit) || 10000,
          artworkUrl: artworkUrl || null,
          silLogo: silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
          arcMark: arcMark || 'Yes',
          slittingMark: slittingMark || 'Yes',
          trackerLine: trackerLine || 'Yes',
          specialInstructions: specialInstructions || '',
          creationDate: new Date().toISOString().split('T')[0]
        };
        onAddJobMaster(newJobMaster);
      }
    }

    setIsModalOpen(false);
    alert(`Rotogravure Cylinder Set "${jobName}" saved successfully!${!editingCylinder && createJobMaster ? ` Linked Job Master ${nextJmId} created.` : ''}`);
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
              Automated Cylinder Surface Area {isAdmin ? '& Cost Calculation' : 'Tracking'}, Cloud Artwork Storage, and Layer 1 Substrate Wear Tracking.
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

            {canEditCylinders ? (
              <button className="btn-primary" onClick={openAddModal}>
                <Plus size={16} /> Add New Cylinder Set
              </button>
            ) : (
              <span className="badge badge-warning" style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} /> View-Only Access ({userRole})
              </span>
            )}
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
                <th>{isAdmin ? 'Cost & Engraver' : 'Engraver'}</th>
                {isAdmin && <th>Cost Borne By</th>}
                <th>Layer 1 Print (Kg)</th>
                <th>Wear Utilisation</th>
                <th>Status</th>
                <th>Assigned Press</th>
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
                        {isAdmin && (
                          <>
                            <div style={{ fontWeight: '700', color: '#0f172a' }}>{c.cylinderCost}</div>
                            {c.costPerCylinder && (
                              <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: '600' }}>
                                ({c.costPerCylinder} / cyl)
                              </div>
                            )}
                          </>
                        )}
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.engravuresName}</div>
                      </td>
                      {isAdmin && (
                        <td>
                          <span className={`badge badge-${c.costBorneType || 'client'}`}>{c.costBorneBy || 'Client (100%)'}</span>
                        </td>
                      )}
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
                      <td style={{ maxWidth: '160px' }}>
                        {c.assignedPress ? (
                          <span style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Printer size={12} />{c.assignedPress}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>— Not Assigned —</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {canEditCylinders ? (
                            <>
                              <button className="btn-secondary" style={{ padding: '6px 8px', fontSize: '0.75rem' }} onClick={() => openEditModal(c)} title="Edit Specifications">
                                <Edit3 size={14} />
                              </button>

                              <button className="btn-secondary" style={{ padding: '6px 8px', fontSize: '0.75rem' }} onClick={() => setSelectedForPDF(c)} title="Print Job Card">
                                <Printer size={14} />
                              </button>

                              <button 
                                className="btn-secondary text-danger" 
                                style={{ padding: '6px 8px', fontSize: '0.75rem' }} 
                                onClick={() => handleDelete(c)}
                                title="Delete Cylinder Set"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setSelectedForPDF(c)} title="View Job Card">
                              <Printer size={13} /> View Specs
                            </button>
                          )}
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
          <div className="glass-card modal-content" style={{ width: '850px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--text-primary)' }}>
                  <Layers size={22} style={{ color: 'var(--primary-brand)' }} /> {editingCylinder ? 'Edit Cylinder Set Specifications' : 'Add New Rotogravure Cylinder Set'}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '4px 0 0 0' }}>
                  Configure cylinder technical parameters, substrate layers, cost calculations, and production tracking.
                </p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCylinder} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '12px' }}>
              
              {/* SECTION 1: BASIC CYLINDER & JOB SPECIFICATIONS */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  1. Basic Cylinder & Job Information
                </h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label style={{ fontWeight: '700' }}>Cylinder SKU Code *</label>
                    <input type="text" className="form-control" required value={sku} onChange={e => setSku(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: '700' }}>Job / Brand Name *</label>
                    <input type="text" className="form-control" required placeholder="e.g. Britannia Bourbon 250g" value={jobName} onChange={e => setJobName(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ margin: 0, fontWeight: '700' }}>Client Group / Company *</label>
                      <button 
                        type="button" 
                        onClick={() => setIsOnboardClientModalOpen(true)}
                        style={{ background: 'none', border: 'none', color: 'var(--primary-brand)', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                      >
                        <Plus size={12} /> Add New Client
                      </button>
                    </div>
                    <select 
                      className="form-control" 
                      required 
                      value={clientGroup} 
                      onChange={e => setClientGroup(e.target.value)}
                    >
                      <option value="">-- Select Client from Directory --</option>
                      {allClientOptions.map(c => (
                        <option key={c.name} value={c.name}>{c.name} {c.gstin ? `(GST: ${c.gstin})` : ''}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: '700' }}>Number of Printing Colors (Cylinders) *</label>
                    <input type="number" className="form-control" required min="1" max="12" value={colorsCount} onChange={e => setColorsCount(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: '700' }}>Cylinder Circumference (mm) *</label>
                    <input type="number" className="form-control" required value={circumferenceMm} onChange={e => setCircumferenceMm(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label style={{ fontWeight: '700' }}>Face Length (mm) *</label>
                    <input type="number" className="form-control" required value={faceLengthMm} onChange={e => setFaceLengthMm(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* SECTION 2: ENGRAVING & COMMERCIAL COSTING (ADMIN ONLY) */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calculator size={16} style={{ color: 'var(--primary-brand)' }} /> 2. Engraving & Commercial Costing
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: '14px', marginBottom: isAdmin ? '14px' : '0' }}>
                  <div className="form-group">
                    <label>Engraver Name</label>
                    <input type="text" className="form-control" value={engravuresName} onChange={e => setEngravuresName(e.target.value)} />
                  </div>

                  {isAdmin && (
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
                  )}
                </div>

                {isAdmin && (
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>
                        Automated Cost Calculator (Formula Engine)
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={autoCalculateCost} 
                          onChange={e => setAutoCalculateCost(e.target.checked)} 
                        />
                        Auto-Calculate from Dimensions
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>Surface Area</div>
                        <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#0f172a', marginTop: '4px' }}>{billingAreaUnits.toLocaleString()} sq. cm</div>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>({faceLengthMm} × {circumferenceMm} ÷ 100)</div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>Cylinder Rate (₹/sq cm)</div>
                        <input 
                          type="number" 
                          step="0.01"
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: '0.85rem', marginTop: '4px' }}
                          value={rate} 
                          onChange={e => setRate(e.target.value)} 
                        />
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>Cost / Cylinder (₹)</div>
                        <input 
                          type="number" 
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: '0.85rem', marginTop: '4px', fontWeight: '700', color: '#047857' }}
                          value={costPerCylinder} 
                          onChange={e => {
                            setCostPerCylinder(e.target.value);
                            setAutoCalculateCost(false);
                          }} 
                        />
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>Total Set Cost ({colorsCount} Cyls)</div>
                        <input 
                          type="number" 
                          className="form-control" 
                          style={{ padding: '4px 8px', fontSize: '0.85rem', marginTop: '4px', fontWeight: '800', color: '#1e3a8a' }}
                          value={cylinderCost} 
                          onChange={e => {
                            setCylinderCost(e.target.value);
                            setAutoCalculateCost(false);
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: PRODUCT STRUCTURE & JOB MASTER INTEGRATION */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileCode size={16} style={{ color: 'var(--primary-brand)' }} /> 3. Product Substrate Structure (Laminate Layers) *
                    </h4>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                      Summary: <code style={{ fontWeight: '700', color: '#0f172a' }}>{layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')}</code>
                    </div>
                  </div>
                  <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={addLayer}>
                    <Plus size={14} /> Add Substrate Layer
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                  {layers.map((l, idx) => (
                    <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 36px', gap: '10px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569' }}>Layer {idx + 1}</span>
                      <select className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={l.filmType} onChange={e => setLayers(prev => prev.map(item => item.id === l.id ? { ...item, filmType: e.target.value } : item))}>
                        {availableFilmTypes.map(filmKey => <option key={filmKey} value={filmKey}>{filmKey} ({FILM_DENSITIES[filmKey]} g/cc)</option>)}
                      </select>
                      <input type="number" className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={l.micron} onChange={e => setLayers(prev => prev.map(item => item.id === l.id ? { ...item, micron: parseFloat(e.target.value) || 0 } : item))} placeholder="Microns (µ)" />
                      {layers.length > 1 && <button type="button" className="btn-secondary text-danger" style={{ padding: '6px' }} onClick={() => removeLayer(l.id)} title="Remove Layer"><X size={14} /></button>}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Pouch Open Width (mm)</label>
                    <input type="number" className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={pouchOpenWidth} onChange={e => setPouchOpenWidth(e.target.value)} placeholder="e.g. 240" />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Pouch Height (mm)</label>
                    <input type="number" className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={pouchHeight} onChange={e => setPouchHeight(e.target.value)} placeholder="e.g. 350" />
                  </div>
                </div>

                {!editingCylinder && (
                  <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', color: '#047857' }}>
                      <input 
                        type="checkbox" 
                        checked={createJobMaster} 
                        onChange={e => setCreateJobMaster(e.target.checked)} 
                        style={{ width: '16px', height: '16px', accentColor: '#047857' }}
                      />
                      Auto-Create Product in Job Master Directory
                    </label>
                    {createJobMaster && (
                      <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                        Consequent ID: JM-2026-{String((jobMasters ? jobMasters.length : 0) + 101).padStart(3, '0')}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* SECTION 4: PRESS MARKS & QUALITY GUIDELINES */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  4. Press Marks & Quality Guidelines
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>SIL Logo / Press Line</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      style={{ padding: '6px 10px', fontSize: '0.85rem' }} 
                      value={silLogo} 
                      onChange={e => setSilLogo(e.target.value)} 
                      placeholder="e.g. Yes - 'Pkg Material Mfg by - Samyak International Ltd'" 
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>ARC Mark</label>
                    <select className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={arcMark} onChange={e => setArcMark(e.target.value)}>
                      <option value="Yes">Yes (Standard)</option>
                      <option value="Yes (Both Edges)">Yes (Both Edges)</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Slitting Mark</label>
                    <select className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={slittingMark} onChange={e => setSlittingMark(e.target.value)}>
                      <option value="Yes">Yes (Standard)</option>
                      <option value="1.5mm Dashed">1.5mm Dashed</option>
                      <option value="Continuous Solid Line">Continuous Solid Line</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Tracker Line</label>
                    <select className="form-control" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={trackerLine} onChange={e => setTrackerLine(e.target.value)}>
                      <option value="Yes">Yes (Standard)</option>
                      <option value="Continuous 1mm">Continuous 1mm</option>
                      <option value="No">No</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Special Quality Guidelines / Operator Instructions</label>
                    <textarea 
                      className="form-control" 
                      rows="2" 
                      style={{ padding: '6px 10px', fontSize: '0.85rem' }} 
                      value={specialInstructions} 
                      onChange={e => setSpecialInstructions(e.target.value)} 
                      placeholder="e.g. Core 76mm ID. Winding direction: Face Out. Maintain solvent retention < 5 mg/m²." 
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 5: ARTWORK & MEDIA */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  5. Artwork Proof & Keyline Drawing
                </h4>

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

              {/* SECTION 6: PRODUCTION & WEAR TRACKING */}
              <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                  6. Wear Life Limits & Station Assignment
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label>Assigned Printing Press</label>
                    <select className="form-control" value={assignedPress} onChange={e => setAssignedPress(e.target.value)}>
                      <option value="">— Not Assigned —</option>
                      {printingPresses.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Cylinder Operational Status</label>
                    <select className="form-control" value={status} onChange={e => setStatus(e.target.value)}>
                      <option value="Active In-Use">Active In-Use</option>
                      <option value="Under Engraving">Under Engraving / Chroming</option>
                      <option value="Worn Out / Retouch Needed">Worn Out / Retouch Needed</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Layer 1 Printing Substrate Qty (Kg)</label>
                    <input type="number" className="form-control" value={layer1PrintedQtyKg} onChange={e => setLayer1PrintedQtyKg(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label>Total Dispatched Printed Qty (Kg)</label>
                    <input type="number" className="form-control" value={dispatchedQty} onChange={e => setDispatchedQty(e.target.value)} />
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Max Utilisation Life Limit (Kg)</label>
                    <input type="number" className="form-control" value={utilisationLimit} onChange={e => setUtilisationLimit(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* FOOTER ACTIONS */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  <CheckCircle2 size={16} /> {editingCylinder ? 'Save Changes' : 'Save Cylinder Set'}
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
              currentUser={currentUser}
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
                    artworkUrl: updated.artworkUrl || selectedForPDF.artworkUrl,
                    silLogo: updated.silLogo || selectedForPDF.silLogo,
                    arcMark: updated.arcMark || selectedForPDF.arcMark,
                    slittingMark: updated.slittingMark || selectedForPDF.slittingMark,
                    trackerLine: updated.trackerLine || selectedForPDF.trackerLine,
                    specialInstructions: updated.specialInstructions || selectedForPDF.specialInstructions,
                    chkEyemark: updated.chkEyemark ?? selectedForPDF.chkEyemark,
                    chkBarcode: updated.chkBarcode ?? selectedForPDF.chkBarcode,
                    chkOrientation: updated.chkOrientation ?? selectedForPDF.chkOrientation,
                    chkClientApproval: updated.chkClientApproval ?? selectedForPDF.chkClientApproval,
                    approvedByHead: updated.approvedByHead ?? selectedForPDF.approvedByHead,
                    approvedHeadName: updated.approvedHeadName || selectedForPDF.approvedHeadName,
                    approvedHeadDate: updated.approvedHeadDate || selectedForPDF.approvedHeadDate
                  });
                }
              }}
            />
          </div>
        </div>
      )}

      {/* QUICK CLIENT ONBOARDING MODAL */}
      {isOnboardClientModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setIsOnboardClientModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '540px', maxWidth: '95vw', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', margin: 0 }}>
                <Building2 size={20} style={{ color: 'var(--primary-brand)' }} /> Quick Onboard New Client
              </h3>
              <button type="button" className="btn-icon" onClick={() => setIsOnboardClientModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickOnboardClientSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label style={{ fontWeight: '700' }}>Company / Client Name *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    required 
                    placeholder="e.g. Britannia Industries Ltd"
                    value={newClientName} 
                    onChange={e => setNewClientName(e.target.value)} 
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Contact Person</label>
                    <input type="text" className="form-control" placeholder="Key contact" value={newContactPerson} onChange={e => setNewContactPerson(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input type="text" className="form-control" placeholder="10-digit mobile" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>GSTIN Number</label>
                    <input type="text" className="form-control" placeholder="23AAAC..." value={newGstin} onChange={e => setNewGstin(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" className="form-control" placeholder="purchase@client.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsOnboardClientModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  <Check size={16} /> Save & Select Client
                </button>
              </div>
            </form>
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
