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
  Sparkles,
  Upload,
  Paperclip
} from 'lucide-react';
import { calculateUtilisation } from '../dataStore';
import { FILM_DENSITIES } from '../factoryStore';
import CylinderJobCardForm from '../CylinderJobCardForm';

export default function JobMasterDirectory({ 
  jobMasters = [], 
  cylinders = [], 
  productionRecords = [], 
  orders = [],
  clients = [],
  onAddJobMaster,
  onAddCylinder,
  onAddClient,
  onPunchOrderFromJobMaster
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeJobCardData, setActiveJobCardData] = useState(null);

  // Form State for New Job Master
  const [jobName, setJobName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  // Quick Client Onboarding Modal State
  const [isOnboardModalOpen, setIsOnboardModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newContactPerson, setNewContactPerson] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newGstin, setNewGstin] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newPaymentTerms, setNewPaymentTerms] = useState('30 Days Net');
  const [onboardSuccessNotice, setOnboardSuccessNotice] = useState('');

  const [skuCode, setSkuCode] = useState('');
  const [printWidthMm, setPrintWidthMm] = useState('1000');
  const [repeatLengthMm, setRepeatLengthMm] = useState('400');
  const [pouchOpenWidth, setPouchOpenWidth] = useState('120');
  const [pouchHeight, setPouchHeight] = useState('150');

  // Unified Unique Clients Options (from clients prop + orders + jobMasters)
  const allClientOptions = useMemo(() => {
    const map = new Map();
    (clients || []).forEach(c => {
      const name = c.name || c.companyName;
      if (name && !map.has(name)) {
        map.set(name, { id: c.id, name, gstin: c.gstin, phone: c.phone });
      }
    });
    (orders || []).forEach(o => {
      if (o.clientName && !map.has(o.clientName)) {
        map.set(o.clientName, { id: `CLI-${o.clientName}`, name: o.clientName });
      }
    });
    (jobMasters || []).forEach(j => {
      if (j.clientName && !map.has(j.clientName)) {
        map.set(j.clientName, { id: `CLI-${j.clientName}`, name: j.clientName });
      }
    });
    return Array.from(map.values());
  }, [clients, orders, jobMasters]);

  const filteredClients = useMemo(() => {
    const query = (clientSearchTerm || '').toLowerCase().trim();
    if (!query) return allClientOptions;
    return allClientOptions.filter(c => c.name.toLowerCase().includes(query));
  }, [allClientOptions, clientSearchTerm]);

  const handleOnboardClientSubmit = (e) => {
    e.preventDefault();
    if (!newClientName.trim()) {
      alert("Company / Client Name is required!");
      return;
    }

    const createdClient = {
      id: `CLI-2026-${Date.now().toString().slice(-4)}`,
      name: newClientName.trim(),
      companyName: newClientName.trim(),
      contactPerson: newContactPerson.trim(),
      phone: newPhone.trim(),
      email: newEmail.trim(),
      gstin: newGstin.trim(),
      address: newAddress.trim(),
      paymentTerms: newPaymentTerms,
      createdAt: new Date().toISOString()
    };

    if (onAddClient) {
      onAddClient(createdClient);
    }

    // Auto-fill Client Name in Job Master creation form!
    setClientName(createdClient.name);
    setClientSearchTerm(createdClient.name);
    setIsClientDropdownOpen(false);
    setIsOnboardModalOpen(false);

    // Show notice
    setOnboardSuccessNotice(`✨ New Client "${createdClient.name}" Onboarded & Auto-Filled!`);
    setTimeout(() => setOnboardSuccessNotice(''), 4000);

    // Clear onboarding form
    setNewClientName('');
    setNewContactPerson('');
    setNewPhone('');
    setNewEmail('');
    setNewGstin('');
    setNewAddress('');
  };
  
  // Layer state
  const availableFilmTypes = Object.keys(FILM_DENSITIES);
  const [layers, setLayers] = useState([
    { id: 1, filmType: availableFilmTypes[0] || 'PET', micron: 12 },
    { id: 2, filmType: availableFilmTypes[1] || 'METPET', micron: 12 },
    { id: 3, filmType: availableFilmTypes[2] || 'Natural GP LD', micron: 35 }
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
    const defaultFilm = availableFilmTypes[0] || 'PET';
    setLayers(prev => [...prev, { id: Date.now(), filmType: defaultFilm, micron: 12 }]);
  };

  const removeLayer = (id) => {
    if (layers.length <= 1) return;
    setLayers(prev => prev.filter(l => l.id !== id));
  };

  const getNextSerialSkuCode = () => {
    let maxIndex = 0;

    const checkStringForNum = (str) => {
      if (!str) return;
      const matches = String(str).match(/\d+/g);
      if (matches) {
        const num = parseInt(matches[matches.length - 1], 10);
        if (!isNaN(num) && num > maxIndex) maxIndex = num;
      }
    };

    (jobMasters || []).forEach(j => {
      checkStringForNum(j.skuCode);
      checkStringForNum(j.sku);
      checkStringForNum(j.cylinderSku);
    });

    (cylinders || []).forEach(c => {
      checkStringForNum(c.sku);
      checkStringForNum(c.skuCode);
    });

    (orders || []).forEach(o => {
      checkStringForNum(o.skuCode);
      checkStringForNum(o.sku);
    });

    const nextNum = maxIndex + 1;
    return `SKU-2026-${String(nextNum).padStart(3, '0')}`;
  };

  const isSkuDuplicate = useMemo(() => {
    const code = (skuCode || '').trim().toLowerCase();
    if (!code) return false;
    const existsInJobs = (jobMasters || []).some(j => (j.skuCode || j.sku || j.cylinderSku || '').toLowerCase() === code);
    const existsInCylinders = (cylinders || []).some(c => (c.sku || c.skuCode || '').toLowerCase() === code);
    return existsInJobs || existsInCylinders;
  }, [skuCode, jobMasters, cylinders]);

  const handleOpenCreateModal = () => {
    setSkuCode(getNextSerialSkuCode());
    setJobName('');
    setClientName('');
    setIsCreateModalOpen(true);
  };

  const handleCreateJobMaster = async (e) => {
    e.preventDefault();
    if (!jobName.trim() || !clientName.trim() || !skuCode.trim()) {
      alert("Job Name, Client Name, and SKU Code are required!");
      return;
    }

    if (isSkuDuplicate) {
      alert(`SKU Code "${skuCode.trim()}" is already in use! Please enter or generate a unique SKU Code.`);
      return;
    }

    const jobMasterId = `JM-2026-${String((jobMasters ? jobMasters.length : 0) + 101).padStart(3, '0')}`;
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

    if (onAddJobMaster) await onAddJobMaster(newJobMaster);

    if (createCylinder && onAddCylinder) {
      await onAddCylinder({
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

  const getLinkedCylinder = (job) => {
    if (!job || !cylinders) return null;
    return cylinders.find(c => 
      c.sku === job.skuCode || 
      c.sku === job.cylinderSku || 
      c.jobName === job.jobName
    );
  };

  const getJobProductionRecords = (job) => {
    if (!job || !productionRecords) return [];
    return productionRecords.filter(r => 
      r.jobName === job.jobName || 
      r.orderId === job.skuCode ||
      (r.jobName && r.jobName.includes(job.jobName))
    );
  };

  const handleOpenJobCard = (job) => {
    const linkedCyl = getLinkedCylinder(job);
    const cardData = {
      jobMasterId: job.id,
      skuCode: job.skuCode,
      jobName: job.jobName,
      clientName: job.clientName,
      clientGroup: job.clientName,
      printWidthMm: job.printWidthMm,
      repeatLengthMm: job.repeatLengthMm,
      circumferenceMm: job.repeatLengthMm,
      faceLengthMm: job.printWidthMm,
      pouchOpenWidth: job.pouchOpenWidth,
      pouchHeight: job.pouchHeight,
      structure: job.structure,
      layers: job.layers || [],
      colorsCount: job.colorsCount || (linkedCyl ? linkedCyl.colorsCount : 6),
      cylinderCost: job.cylinderCost || (linkedCyl ? linkedCyl.cylinderCost : '35000'),
      engravuresName: job.engravuresName || (linkedCyl ? linkedCyl.engravuresName : 'Acme Rotogravure Engravers'),
      costBorneBy: job.costBorneBy || (linkedCyl ? linkedCyl.costBorneBy : 'Client (100%)'),
      creationDate: job.creationDate || new Date().toLocaleDateString('en-GB')
    };
    setActiveJobCardData(cardData);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !selectedJob) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("File size exceeds 10MB limit!");
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const fileUrl = evt.target.result;
      const updatedJob = {
        ...selectedJob,
        jobCardFileName: file.name,
        jobCardFileUrl: fileUrl,
        jobCardUploadDate: new Date().toLocaleDateString('en-IN')
      };

      setSelectedJob(updatedJob);
      if (onAddJobMaster) onAddJobMaster(updatedJob);
      alert(`File "${file.name}" linked to Job Master ${selectedJob.id} successfully!`);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    if (!selectedJob || !window.confirm("Remove attached Job Card file from this Job Master?")) return;
    const updatedJob = {
      ...selectedJob,
      jobCardFileName: null,
      jobCardFileUrl: null,
      jobCardUploadDate: null
    };

    setSelectedJob(updatedJob);
    if (onAddJobMaster) onAddJobMaster(updatedJob);
  };

  if (selectedJob) {
    const linkedCylinder = getLinkedCylinder(selectedJob);
    const jobHistory = getJobProductionRecords(selectedJob);
    const utilPercentage = linkedCylinder 
      ? calculateUtilisation(linkedCylinder.dispatchedQty, linkedCylinder.utilisationLimit || 10000)
      : 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {activeJobCardData && (
          <div className="pdf-modal-overlay">
            <div className="pdf-modal-toolbar no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#0f172a' }}>
              <button className="btn-secondary" style={{ background: '#ffffff', color: '#0f172a' }} onClick={() => setActiveJobCardData(null)}>
                <X size={16} /> Close Job Card View
              </button>
              <div style={{ color: '#ffffff', fontWeight: '700', fontSize: '1rem' }}>
                Rotogravure Cylinder Job Card — {activeJobCardData.jobName} ({activeJobCardData.jobMasterId})
              </div>
            </div>
            <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', background: '#334155', minHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>
              <div style={{ background: '#ffffff', width: '1000px', maxWidth: '98vw', borderRadius: '8px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', padding: '24px' }}>
                <CylinderJobCardForm 
                  initialData={activeJobCardData} 
                  onSave={() => alert("Job Card settings saved successfully!")}
                />
              </div>
            </div>
          </div>
        )}

        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer', color: 'var(--primary-brand)', fontWeight: '600' }} onClick={() => setSelectedJob(null)}>
            <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} /> Back to Job Master Directory
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="badge badge-info" style={{ fontSize: '0.85rem', fontWeight: '800' }}>{selectedJob.id}</span>
                <span className="badge badge-both" style={{ fontSize: '0.75rem' }}>SKU: {selectedJob.skuCode}</span>
              </div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '8px' }}>{selectedJob.jobName}</h2>
              <div style={{ display: 'flex', gap: '20px', marginTop: '10px', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span><Building2 size={16} inline /> Client: <strong>{selectedJob.clientName}</strong></span>
                <span><Layers size={16} inline /> Structure: <strong>{selectedJob.structure}</strong></span>
                <span><Clock size={16} inline /> Created: <strong>{selectedJob.creationDate}</strong></span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn-secondary" style={{ padding: '10px 16px', fontSize: '0.85rem', fontWeight: '700', background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }} onClick={() => handleOpenJobCard(selectedJob)} title="Open interactive Rotogravure Cylinder Job Card">
                <Printer size={16} /> Open Linked Job Card
              </button>
              <label className="btn-secondary" style={{ padding: '10px 16px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Upload size={16} /> {selectedJob.jobCardFileUrl ? 'Replace Artwork / Job Card' : 'Upload Job Card PDF'}
                <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
              </label>
              <button className="btn-primary" style={{ padding: '10px 18px', fontSize: '0.9rem', fontWeight: '700', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }} onClick={() => onPunchOrderFromJobMaster && onPunchOrderFromJobMaster(selectedJob)}>
                <Calculator size={18} /> Punch New Order
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
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
                    <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{selectedJob.pouchOpenWidth} mm x {selectedJob.pouchHeight} mm</strong>
                  </div>
                )}
              </div>

              <h4 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '10px' }}>Laminate Layer Breakdown</h4>
              <table className="data-table" style={{ fontSize: '0.85rem' }}>
                <thead><tr><th>Layer #</th><th>Substrate Film Grade</th><th>Micron (µ)</th><th>Calculated GSM</th></tr></thead>
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

            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Paperclip size={18} style={{ color: 'var(--primary-brand)' }} /> Linked Job Card File & Artwork
                </h3>
                <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => handleOpenJobCard(selectedJob)}>
                  <Printer size={14} /> Open Form Job Card
                </button>
              </div>

              {selectedJob.jobCardFileUrl ? (
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: '#ecfdf5', padding: '10px', borderRadius: '8px', color: '#047857' }}><FileText size={24} /></div>
                    <div>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>{selectedJob.jobCardFileName || 'Job_Card_Artwork.pdf'}</h4>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Uploaded: {selectedJob.jobCardUploadDate || 'Recent'}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <a href={selectedJob.jobCardFileUrl} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Printer size={14} /> View / Download
                    </a>
                    <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem', color: '#dc2626', borderColor: '#fecaca' }} onClick={handleRemoveFile} title="Remove attached file">
                      <X size={14} /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>No external Job Card PDF attached to this Job Master.</p>
                  <label className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Upload size={14} /> Upload Job Card / Artwork PDF
                    <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                  </label>
                </div>
              )}
            </div>

            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} /> Shop Floor Production History ({jobHistory.length})
              </h3>
              {jobHistory.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No previous production records.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {jobHistory.map(r => (
                    <div key={r.id} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <strong style={{ color: 'var(--primary-brand)' }}>Order #{r.orderId}</strong>
                        <span className="badge badge-success">{r.status || 'Approved'}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Date: {r.logDate || 'Recent'} | Output: <strong>{r.totalOutputKg || 0} kg</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Printer size={18} style={{ color: '#2563eb' }} /> Rotogravure Cylinder & Amortization
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
                  </div>
                </div>
                <div style={{ background: '#ffffff', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <TrendingUp size={16} /> Cylinder Wear Amortization Status
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                    <span>Run: <strong>{linkedCylinder.dispatchedQty || 0} kg</strong></span>
                    <span style={{ fontWeight: '800', color: utilPercentage >= 80 ? '#d97706' : '#059669' }}>{utilPercentage}% Wear</span>
                  </div>
                  <div className="progress-container"><div className="progress-fill" style={{ width: `${utilPercentage}%`, background: utilPercentage >= 80 ? '#d97706' : '#0f172a' }}></div></div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No Rotogravure Cylinder linked to this Job Master.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--text-primary)' }}>Job Master Technical Directory ({jobMasters.length})</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>Central repository for all repeating job structures, film layer gauges, linked cylinders, and production histories.</p>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div className="search-bar" style={{ width: '280px' }}>
              <Search size={18} style={{ color: 'var(--text-muted)' }} />
              <input type="text" placeholder="Search Job Name, SKU, Client..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem' }} />
            </div>
            <button className="btn-primary" onClick={handleOpenCreateModal}><Plus size={18} /> Create New Job Master</button>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '20px' }}>
        <table className="data-table">
          <thead>
            <tr><th>Job Master ID</th><th>SKU Code</th><th>Job Name</th><th>Client Name</th><th>Laminate Structure</th><th>Print Width x Repeat</th><th>Colors & Engraver</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filteredJobMasters.map(job => (
              <tr key={job.id}>
                <td style={{ fontWeight: '800', color: 'var(--primary-brand)' }}>{job.id}</td>
                <td><span className="badge badge-both">{job.skuCode}</span></td>
                <td style={{ fontWeight: '700' }}>{job.jobName}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{job.clientName}</td>
                <td style={{ fontSize: '0.8rem', fontWeight: '600' }}>{job.structure}</td>
                <td>{job.printWidthMm}mm x {job.repeatLengthMm}mm</td>
                <td>
                  <div style={{ fontSize: '0.8rem' }}>
                    🎨 <b>{job.colorsCount || 6} Colors</b>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{job.engravuresName}</div>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => setSelectedJob(job)}>View Profile</button>
                    <button className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#047857' }} onClick={() => onPunchOrderFromJobMaster && onPunchOrderFromJobMaster(job)}>Punch Order</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '720px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={20} style={{ color: 'var(--primary-brand)' }} /> Create New Job Master
              </h3>
              <button className="btn-secondary" style={{ padding: '4px' }} onClick={() => setIsCreateModalOpen(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateJobMaster}>
              <div className="form-grid">
                <div className="form-group">
                  <label>SKU Code *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    required 
                    style={{ borderColor: isSkuDuplicate ? '#ef4444' : undefined, background: isSkuDuplicate ? '#fef2f2' : undefined }}
                    value={skuCode} 
                    onChange={e => setSkuCode(e.target.value)} 
                  />
                  {isSkuDuplicate && (
                    <div style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: '700', marginTop: '4px' }}>
                      ⚠️ SKU Code "{skuCode}" already exists! Must be unique.
                    </div>
                  )}
                </div>
                <div className="form-group"><label>Job Name *</label><input type="text" className="form-control" required value={jobName} onChange={e => setJobName(e.target.value)} /></div>
                {/* SEARCHABLE CLIENT DROPDOWN WITH QUICK ONBOARDING */}
                <div className="form-group" style={{ gridColumn: 'span 2', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontWeight: '700', fontSize: '0.85rem' }}>Client Name *</label>
                    <button 
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '3px 10px', fontSize: '0.75rem', color: '#047857', borderColor: '#a7f3d0', background: '#ecfdf5', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: '700' }}
                      onClick={() => setIsOnboardModalOpen(true)}
                    >
                      <Plus size={13} /> Onboard New Client
                    </button>
                  </div>

                  {/* Searchable Dropdown Combo Box */}
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <input 
                        type="text" 
                        className="form-control"
                        placeholder="Type to search existing clients or pick below..."
                        required
                        value={clientName}
                        onChange={e => {
                          setClientName(e.target.value);
                          setClientSearchTerm(e.target.value);
                          setIsClientDropdownOpen(true);
                        }}
                        onFocus={() => setIsClientDropdownOpen(true)}
                      />
                      {clientName && (
                        <button 
                          type="button" 
                          style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                          onClick={() => { setClientName(''); setClientSearchTerm(''); setIsClientDropdownOpen(true); }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Dropdown Options List */}
                    {isClientDropdownOpen && (
                      <div 
                        style={{ 
                          position: 'absolute', 
                          top: '100%', 
                          left: 0, 
                          right: 0, 
                          zIndex: 100, 
                          background: '#ffffff', 
                          border: '1px solid #cbd5e1', 
                          borderRadius: '8px', 
                          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', 
                          maxHeight: '210px', 
                          overflowY: 'auto',
                          marginTop: '4px'
                        }}
                      >
                        {filteredClients.length === 0 ? (
                          <div style={{ padding: '12px', fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            No matching clients found. 
                            <button 
                              type="button" 
                              style={{ marginLeft: '8px', color: '#047857', border: 'none', background: 'none', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => { setIsClientDropdownOpen(false); setIsOnboardModalOpen(true); }}
                            >
                              Onboard "{clientSearchTerm}"
                            </button>
                          </div>
                        ) : (
                          filteredClients.map(c => (
                            <div 
                              key={c.id || c.name}
                              style={{ 
                                padding: '10px 14px', 
                                fontSize: '0.85rem', 
                                cursor: 'pointer', 
                                borderBottom: '1px solid #f1f5f9',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: clientName === c.name ? '#eff6ff' : 'transparent'
                              }}
                              onMouseDown={() => {
                                setClientName(c.name);
                                setClientSearchTerm(c.name);
                                setIsClientDropdownOpen(false);
                              }}
                            >
                              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                                <Building2 size={13} style={{ display: 'inline', marginRight: '6px', color: 'var(--primary-brand)' }} />
                                {c.name}
                              </span>
                              {c.gstin && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>GST: {c.gstin}</span>}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {onboardSuccessNotice && (
                    <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: '4px', fontWeight: '700' }}>
                      {onboardSuccessNotice}
                    </div>
                  )}
                </div>

                <div className="form-group"><label>Print Width (mm)</label><input type="number" className="form-control" value={printWidthMm} onChange={e => setPrintWidthMm(e.target.value)} /></div>
                <div className="form-group"><label>Repeat Length (mm)</label><input type="number" className="form-control" value={repeatLengthMm} onChange={e => setRepeatLengthMm(e.target.value)} /></div>
                <div className="form-group"><label>Pouch Width (mm)</label><input type="number" className="form-control" value={pouchOpenWidth} onChange={e => setPouchOpenWidth(e.target.value)} /></div>
                <div className="form-group"><label>Pouch Height (mm)</label><input type="number" className="form-control" value={pouchHeight} onChange={e => setPouchHeight(e.target.value)} /></div>
              </div>

              <div style={{ marginTop: '16px', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <strong style={{ fontSize: '0.9rem' }}>Laminate Layers Structure</strong>
                  <button type="button" className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={addLayer}><Plus size={14} /> Add Layer</button>
                </div>
                {layers.map((l, idx) => (
                  <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 32px', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Layer {idx + 1}</span>
                    <select className="form-control" style={{ padding: '4px 8px', fontSize: '0.85rem' }} value={l.filmType} onChange={e => setLayers(prev => prev.map(item => item.id === l.id ? { ...item, filmType: e.target.value } : item))}>
                      {availableFilmTypes.map(filmKey => <option key={filmKey} value={filmKey}>{filmKey} ({FILM_DENSITIES[filmKey]} g/cc)</option>)}
                    </select>
                    <input type="number" className="form-control" style={{ padding: '4px 8px', fontSize: '0.85rem' }} value={l.micron} onChange={e => setLayers(prev => prev.map(item => item.id === l.id ? { ...item, micron: parseFloat(e.target.value) || 0 } : item))} />
                    {layers.length > 1 && <button type="button" className="btn-secondary" style={{ padding: '4px' }} onClick={() => removeLayer(l.id)}><X size={14} /></button>}
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

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsCreateModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSkuDuplicate} style={isSkuDuplicate ? { opacity: 0.6, cursor: 'not-allowed' } : {}}>
                  <CheckCircle2 size={16} /> Save Job Master
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK CLIENT ONBOARDING MODAL */}
      {isOnboardModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setIsOnboardModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '560px', maxWidth: '95vw', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                <Building2 size={20} style={{ color: 'var(--primary-brand)' }} /> Quick Client Onboarding
              </h3>
              <button type="button" className="btn-secondary" style={{ padding: '4px' }} onClick={() => setIsOnboardModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleOnboardClientSubmit}>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
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

                <div className="form-group">
                  <label>Contact Person</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Mr. Rajesh Sharma"
                    value={newContactPerson} 
                    onChange={e => setNewContactPerson(e.target.value)} 
                  />
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="+91 98260 XXXXX"
                    value={newPhone} 
                    onChange={e => setNewPhone(e.target.value)} 
                  />
                </div>

                <div className="form-group">
                  <label>Email Address</label>
                  <input 
                    type="email" 
                    className="form-control" 
                    placeholder="purchase@client.com"
                    value={newEmail} 
                    onChange={e => setNewEmail(e.target.value)} 
                  />
                </div>

                <div className="form-group">
                  <label>GSTIN Number</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="23AAACB1234C1Z5"
                    value={newGstin} 
                    onChange={e => setNewGstin(e.target.value)} 
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Factory / Billing Address</label>
                  <textarea 
                    className="form-control" 
                    rows="2" 
                    placeholder="Plot 45, Pithampur Industrial Area, Sector 3, Dhar MP"
                    value={newAddress} 
                    onChange={e => setNewAddress(e.target.value)} 
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Payment Terms</label>
                  <select 
                    className="form-control"
                    value={newPaymentTerms}
                    onChange={e => setNewPaymentTerms(e.target.value)}
                  >
                    <option value="30 Days Net">30 Days Net</option>
                    <option value="15 Days Net">15 Days Net</option>
                    <option value="45 Days Net">45 Days Net</option>
                    <option value="50% Advance, Balance Before Dispatch">50% Advance, Balance Before Dispatch</option>
                    <option value="Immediate / Cash on Delivery">Immediate / Cash on Delivery</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsOnboardModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ background: '#047857', borderColor: '#047857' }}>
                  <CheckCircle2 size={16} /> Save Client & Auto-Fill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
