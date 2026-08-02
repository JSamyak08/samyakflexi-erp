import React, { useState, useMemo } from 'react';
import { 
  FileCode, 
  Search, 
  Plus, 
  ChevronRight, 
  Package, 
  Layers, 
  Calculator, 
  Clock, 
  Building2, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Edit, 
  Printer, 
  FileText,
  TrendingUp,
  Sparkles
} from 'lucide-react';
import { calculateUtilisation } from '../dataStore';
import { FILM_DENSITIES } from '../factoryStore';

export default function JobMasterDirectory({ 
  jobMasters = [], 
  cylinders = [], 
  productionRecords = [], 
  orders = [],
  onAddJobMaster,
  onAddCylinder,
  onPunchOrderFromJobMaster
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form State for New Job Master
  const [jobName, setJobName] = useState('');
  const [clientName, setClientName] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [printWidthMm, setPrintWidthMm] = useState('1000');
  const [repeatLengthMm, setRepeatLengthMm] = useState('400');
  const [pouchOpenWidth, setPouchOpenWidth] = useState('120');
  const [pouchHeight, setPouchHeight] = useState('150');
  
  // Layer state
  const [layers, setLayers] = useState([
    { id: 1, filmType: 'PET', micron: 12 },
    { id: 2, filmType: 'METPET', micron: 12 },
    { id: 3, filmType: 'Natural GP LD', micron: 35 }
  ]);

  // Cylinder creation state
  const [createCylinder, setCreateCylinder] = useState(true);
  const [colorsCount, setColorsCount] = useState(6);
  const [cylinderCost, setCylinderCost] = useState('35000');
  const [costBorneBy, setCostBorneBy] = useState('Client (100%)');
  const [engravuresName, setEngravuresName] = useState('Acme Rotogravure Engravers');
  const [utilisationLimit, setUtilisationLimit] = useState(10000);

  const filteredJobMasters = useMemo(() => {
    if (!jobMasters) return [];
    return jobMasters.filter(j => 
      j.jobName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (j.id && j.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (j.skuCode && j.skuCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (j.clientName && j.clientName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [jobMasters, searchTerm]);

  const addLayer = () => {
    setLayers(prev => [...prev, { id: Date.now(), filmType: 'Natural GP LD', micron: 35 }]);
  };

  const removeLayer = (id) => {
    if (layers.length <= 1) return;
    setLayers(prev => prev.filter(l => l.id !== id));
  };

  const handleCreateJobMaster = (e) => {
    e.preventDefault();
    if (!jobName.trim() || !clientName.trim() || !skuCode.trim()) {
      alert("Job Name, Client Name, and SKU Code are required!");
      return;
    }

    const jobMasterId = `JM-2026-${Math.floor(100 + Math.random() * 900)}`;
    const structureSummary = layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ');

    const newJobMaster = {
      id: jobMasterId,
      skuCode: skuCode.trim(),
      jobName: jobName.trim(),
      clientName: clientName.trim(),
      structure: structureSummary,
      printWidthMm: parseFloat(printWidthMm) || 1000,
      repeatLengthMm: parseFloat(repeatLengthMm) || 400,
      pouchOpenWidth: parseFloat(pouchOpenWidth) || 0,
      pouchHeight: parseFloat(pouchHeight) || 0,
      layers,
      cylinderSku: skuCode.trim(),
      cylinderCost: `₹ ${parseInt(cylinderCost || 0).toLocaleString()}`,
      colorsCount: parseInt(colorsCount) || 6,
      engravuresName,
      costBorneBy,
      utilisationLimit: parseFloat(utilisationLimit) || 10000,
      creationDate: new Date().toISOString().split('T')[0]
    };

    if (onAddJobMaster) onAddJobMaster(newJobMaster);

    if (createCylinder && onAddCylinder) {
      onAddCylinder({
        id: Date.now(),
        sku: skuCode.trim(),
        jobName: jobName.trim(),
        clientGroup: clientName.trim(),
        colorsCount: parseInt(colorsCount) || 6,
        cylinderCost: `₹ ${parseInt(cylinderCost || 0).toLocaleString()}`,
        engravuresName,
        costBorneBy,
        costBorneType: costBorneBy.includes('Client') ? 'client' : (costBorneBy.includes('Us') ? 'us' : 'both'),
        circumferenceMm: parseFloat(repeatLengthMm) || 400,
        faceLengthMm: parseFloat(printWidthMm) || 1050,
        layer1PrintedQtyKg: 0,
        dispatchedQty: 0,
        utilisationLimit: parseFloat(utilisationLimit) || 10000,
        status: 'Active In-Use'
      });
    }

    setIsCreateModalOpen(false);
    setSelectedJob(newJobMaster);
    alert(`Job Master ${jobMasterId} created successfully!`);
  };

  // Helper to find cylinder data for a selected job
  const getLinkedCylinder = (job) => {
    if (!job || !cylinders) return null;
    return cylinders.find(c => 
      c.sku === job.skuCode || 
      c.sku === job.cylinderSku || 
      c.jobName === job.jobName
    );
  };

  // Helper to find production records for a selected job
  const getJobProductionRecords = (job) => {
    if (!job || !productionRecords) return [];
    return productionRecords.filter(r => 
      r.jobName === job.jobName || 
      r.orderId === job.skuCode ||
      (r.jobName && r.jobName.includes(job.jobName))
    );
  };

  // Profile View for Selected Job
  if (selectedJob) {
    const linkedCylinder = getLinkedCylinder(selectedJob);
    const jobHistory = getJobProductionRecords(selectedJob);
    const utilPercentage = linkedCylinder 
      ? calculateUtilisation(linkedCylinder.dispatchedQty, linkedCylinder.utilisationLimit || 10000)
      : 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Header Bar */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer', color: 'var(--primary-brand)', fontWeight: '600' }} onClick={() => setSelectedJob(null)}>
            <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} /> Back to Job Master Directory
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="badge badge-info" style={{ fontSize: '0.85rem', fontWeight: '800' }}>
                  {selectedJob.id}
                </span>
                <span className="badge badge-both" style={{ fontSize: '0.75rem' }}>
                  SKU: {selectedJob.skuCode}
                </span>
              </div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '8px' }}>
                {selectedJob.jobName}
              </h2>
              <div style={{ display: 'flex', gap: '20px', marginTop: '10px', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span><Building2 size={16} inline /> Client: <strong>{selectedJob.clientName}</strong></span>
                <span><Layers size={16} inline /> Structure: <strong>{selectedJob.structure}</strong></span>
                <span><Clock size={16} inline /> Created: <strong>{selectedJob.creationDate}</strong></span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn-primary" 
                style={{ padding: '10px 18px', fontSize: '0.9rem', fontWeight: '700', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }} 
                onClick={() => onPunchOrderFromJobMaster && onPunchOrderFromJobMaster(selectedJob)}
              >
                <Calculator size={18} /> Punch New Order for this Job
              </button>
            </div>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          
          {/* Left Column: Structure & Dimensions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={18} style={{ color: 'var(--primary-brand)' }} /> Technical Structure & Dimensions
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '0.85rem', marginBottom: '16px' }}>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Print Width (Face Length)</div>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{selectedJob.printWidthMm} mm</strong>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Repeat Length (Circumference)</div>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{selectedJob.repeatLengthMm} mm</strong>
                </div>
                {selectedJob.pouchOpenWidth > 0 && (
                  <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', gridColumn: 'span 2' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Individual Pouch Size (Open W x H)</div>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {selectedJob.pouchOpenWidth} mm x {selectedJob.pouchHeight} mm
                    </strong>
                  </div>
                )}
              </div>

              <h4 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '10px' }}>Laminate Layer Breakdown</h4>
              <table className="data-table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Layer #</th>
                    <th>Substrate Film Grade</th>
                    <th>Micron (µ)</th>
                    <th>Calculated GSM</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedJob.layers && selectedJob.layers.map((l, idx) => {
                    const density = FILM_DENSITIES[l.filmType] || 1.0;
                    const gsm = (l.micron * density).toFixed(1);
                    return (
                      <tr key={l.id || idx}>
                        <td style={{ fontWeight: '700' }}>Layer {idx + 1}</td>
                        <td style={{ fontWeight: '600', color: 'var(--primary-brand)' }}>{l.filmType}</td>
                        <td>{l.micron} µ</td>
                        <td>{gsm} g/m²</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Production Job History */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} /> Shop Floor Production History ({jobHistory.length})
              </h3>
              {jobHistory.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No previous production records logged for this job master.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {jobHistory.map(r => (
                    <div key={r.id} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <strong style={{ color: 'var(--primary-brand)' }}>Order #{r.orderId}</strong>
                        <span className="badge badge-success">{r.status || 'Approved'}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Date: {r.logDate || 'Recent'} | Output: <strong>{r.totalOutputKg || 0} kg</strong> | Scrappage: {r.scrapKg || 0} kg
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Linked Cylinder Record & Amortization Wear */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Printer size={18} style={{ color: '#2563eb' }} /> Rotogravure Cylinder & Amortization Wear
            </h3>

            {linkedCylinder ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{linkedCylinder.sku}</span>
                    <span className="badge badge-both">🎨 {linkedCylinder.colorsCount || selectedJob.colorsCount} Colors</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>Engraver: <strong>{linkedCylinder.engravuresName || selectedJob.engravuresName}</strong></div>
                    <div>Set Cost: <strong>{linkedCylinder.cylinderCost || selectedJob.cylinderCost}</strong></div>
                    <div>Cost Borne By: <strong>{linkedCylinder.costBorneBy || selectedJob.costBorneBy}</strong></div>
                    <div>Face x Circum.: <strong>{linkedCylinder.faceLengthMm || selectedJob.printWidthMm}mm x {linkedCylinder.circumferenceMm || selectedJob.repeatLengthMm}mm</strong></div>
                  </div>
                </div>

                {/* Amortization Progress Bar */}
                <div style={{ background: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <TrendingUp size={16} style={{ color: utilPercentage >= 80 ? '#d97706' : '#059669' }} /> Cylinder Wear Amortization Status
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                    <span>Layer 1 Print Substrate Run: <strong>{linkedCylinder.dispatchedQty || 0} kg</strong></span>
                    <span style={{ fontWeight: '800', color: utilPercentage >= 80 ? '#d97706' : '#059669' }}>{utilPercentage}% Wear</span>
                  </div>
                  <div className="progress-container">
                    <div className="progress-fill" style={{ width: `${utilPercentage}%`, background: utilPercentage >= 80 ? '#d97706' : '#0f172a' }}></div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Max Utilisation Limit: {linkedCylinder.utilisationLimit ? linkedCylinder.utilisationLimit.toLocaleString() : '10,000'} kg
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px' }}>No rotogravure cylinder record currently linked to this Job Master ID.</p>
                <button className="btn-secondary" onClick={() => {
                  if (onAddCylinder) {
                    onAddCylinder({
                      id: Date.now(),
                      sku: selectedJob.skuCode,
                      jobName: selectedJob.jobName,
                      clientGroup: selectedJob.clientName,
                      colorsCount: selectedJob.colorsCount || 6,
                      cylinderCost: selectedJob.cylinderCost || '₹ 35,000',
                      engravuresName: selectedJob.engravuresName || 'Acme Rotogravure Engravers',
                      costBorneBy: selectedJob.costBorneBy || 'Client (100%)',
                      costBorneType: 'client',
                      circumferenceMm: selectedJob.repeatLengthMm,
                      faceLengthMm: selectedJob.printWidthMm,
                      dispatchedQty: 0,
                      utilisationLimit: selectedJob.utilisationLimit || 10000,
                      status: 'Active In-Use'
                    });
                    alert("Cylinder record created and linked successfully!");
                  }
                }}>
                  <Plus size={16} /> Link / Create Cylinder Set
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Action Bar */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="search-bar" style={{ width: '320px' }}>
            <Search size={18} style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search Job ID, SKU, Name, or Client..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem' }}
            />
          </div>
        </div>

        <button className="btn-primary" onClick={() => setIsCreateModalOpen(true)}>
          <Plus size={18} /> Create New Job Master
        </button>
      </div>

      {/* Directory Table */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileCode size={20} style={{ color: 'var(--primary-brand)' }} /> Job Master Technical Directory ({filteredJobMasters.length})
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Job Master ID</th>
                <th>Job Name & SKU</th>
                <th>Client Name</th>
                <th>Laminate Structure</th>
                <th>Film Sizes (Face x Repeat)</th>
                <th>Colors & Engraver</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobMasters.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No Job Masters found. Click "Create New Job Master" to add one.
                  </td>
                </tr>
              ) : (
                filteredJobMasters.map(j => (
                  <tr key={j.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedJob(j)}>
                    <td style={{ fontWeight: '800', color: 'var(--primary-brand)' }}>{j.id}</td>
                    <td>
                      <div style={{ fontWeight: '700' }}>{j.jobName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SKU: {j.skuCode}</div>
                    </td>
                    <td style={{ fontWeight: '600' }}>{j.clientName}</td>
                    <td style={{ fontSize: '0.85rem' }}>{j.structure}</td>
                    <td style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                      {j.printWidthMm} mm x {j.repeatLengthMm} mm
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>🎨 {j.colorsCount || 6} Colors</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{j.engravuresName || 'Standard'}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={(e) => { e.stopPropagation(); setSelectedJob(j); }}>
                          View Profile
                        </button>
                        <button className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#059669' }} onClick={(e) => { e.stopPropagation(); onPunchOrderFromJobMaster && onPunchOrderFromJobMaster(j); }}>
                          Punch Order
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create New Job Master */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="glass-card modal-content" onClick={e => e.stopPropagation()} style={{ width: '680px', maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={20} style={{ color: 'var(--primary-brand)' }} /> Create New Job Master
              </h3>
              <button className="btn-secondary" style={{ padding: '6px' }} onClick={() => setIsCreateModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateJobMaster}>
              <div className="form-grid">
                <div className="form-group">
                  <label>SKU Code *</label>
                  <input type="text" className="form-control" required placeholder="e.g. SKU-BR-005" value={skuCode} onChange={e => setSkuCode(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Job Name *</label>
                  <input type="text" className="form-control" required placeholder="e.g. Parle-G 100g Pouch" value={jobName} onChange={e => setJobName(e.target.value)} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Client Name *</label>
                  <input type="text" className="form-control" required placeholder="e.g. Parle Products Pvt Ltd" value={clientName} onChange={e => setClientName(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Print Width / Face Length (mm)</label>
                  <input type="number" className="form-control" value={printWidthMm} onChange={e => setPrintWidthMm(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Repeat Length / Circumference (mm)</label>
                  <input type="number" className="form-control" value={repeatLengthMm} onChange={e => setRepeatLengthMm(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Individual Pouch Width (mm)</label>
                  <input type="number" className="form-control" value={pouchOpenWidth} onChange={e => setPouchOpenWidth(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Individual Pouch Height (mm)</label>
                  <input type="number" className="form-control" value={pouchHeight} onChange={e => setPouchHeight(e.target.value)} />
                </div>
              </div>

              {/* Dynamic Layers Builder */}
              <div style={{ marginTop: '16px', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <strong style={{ fontSize: '0.9rem' }}>Laminate Layers Structure</strong>
                  <button type="button" className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={addLayer}>
                    <Plus size={14} /> Add Layer
                  </button>
                </div>
                {layers.map((l, idx) => (
                  <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 32px', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Layer {idx + 1}</span>
                    <input type="text" className="form-control" style={{ padding: '4px 8px', fontSize: '0.85rem' }} value={l.filmType} onChange={e => {
                      const val = e.target.value;
                      setLayers(prev => prev.map(item => item.id === l.id ? { ...item, filmType: val } : item));
                    }} />
                    <input type="number" className="form-control" style={{ padding: '4px 8px', fontSize: '0.85rem' }} value={l.micron} onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setLayers(prev => prev.map(item => item.id === l.id ? { ...item, micron: val } : item));
                    }} placeholder="Micron" />
                    {layers.length > 1 && (
                      <button type="button" className="btn-secondary" style={{ padding: '4px' }} onClick={() => removeLayer(l.id)}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Checkbox for Cylinder Creation */}
              <div style={{ marginTop: '16px', background: '#ecfdf5', padding: '12px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600', color: '#047857' }}>
                  <input type="checkbox" checked={createCylinder} onChange={e => setCreateCylinder(e.target.checked)} />
                  Also create & link a Rotogravure Cylinder Record for this Job Master
                </label>

                {createCylinder && (
                  <div className="form-grid" style={{ marginTop: '12px' }}>
                    <div className="form-group">
                      <label>Number of Colors</label>
                      <input type="number" className="form-control" value={colorsCount} onChange={e => setColorsCount(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Cylinder Set Cost (₹)</label>
                      <input type="number" className="form-control" value={cylinderCost} onChange={e => setCylinderCost(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Cost Borne By</label>
                      <select className="form-control" value={costBorneBy} onChange={e => setCostBorneBy(e.target.value)}>
                        <option value="Client (100%)">Client (100%)</option>
                        <option value="Us (100%)">Us / Samyak (100%)</option>
                        <option value="Both (50/50)">Both (50/50)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Engraver Name</label>
                      <input type="text" className="form-control" value={engravuresName} onChange={e => setEngravuresName(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsCreateModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  <CheckCircle2 size={16} /> Save Job Master
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
