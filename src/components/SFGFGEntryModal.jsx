import React, { useState, useMemo, useEffect } from 'react';
import { 
  Layers, 
  Package, 
  Scale, 
  Plus, 
  Trash2, 
  Printer, 
  CheckCircle2, 
  QrCode, 
  X, 
  AlertTriangle, 
  Building2, 
  User, 
  Clock,
  Tag,
  Search,
  Check,
  RefreshCw,
  Sliders,
  Ruler
} from 'lucide-react';
import WeighingScaleCaptureButton from './WeighingScaleCaptureButton';
import { FILM_DENSITIES, COMPANY_DETAILS } from '../factoryStore';

export const SFG_TYPES = [
  'Printed Rolls',
  'Laminated Rolls (First Pass) for Roll Form',
  'Laminated Rolls (First Pass) for Pouch Form',
  'Laminated Rolls (Second Pass) for Pouch Form'
];

export const FG_TYPES = [
  'Laminated Rolls (First Pass) for Roll Form',
  'Laminated Rolls (Second Pass) for Roll Form'
];

export const MACHINE_OPTIONS = [
  'Rotogravure Printing Press #1 (8-Color)',
  'Rotogravure Printing Press #2 (9-Color High Speed)',
  'Solventless Lamination Machine #1 (Nordmeccanica)',
  'Solventless Lamination Machine #2',
  'Solvent-Based Lamination Machine',
  'Slitter Rewinder Machine #1 (High Speed)',
  'Slitter Rewinder Machine #2',
  'Doctoring / Inspection Rewinder #1',
  'Doctoring / Inspection Rewinder #2',
  'Pouch Making Machine #1 (Center Seal / 3-Side)',
  'Pouch Making Machine #2 (Stand-Up Zipper)'
];

export const FILM_TYPE_OPTIONS = [
  'PET (Polyester)',
  'BOPP (Plain / Matt)',
  'BOPP (Met)',
  'MET PET',
  'CPP (Cast Polypropylene)',
  'MET CPP',
  'Natural LDPE',
  'White LDPE / Milk Film',
  'Aluminum Foil',
  'Nylon / OPA',
  'Paper'
];

export default function SFGFGEntryModal({
  mode = 'SFG', // 'SFG' | 'FG'
  orders = [],
  jobMasters = [],
  inventory = [],
  currentUser,
  onClose,
  onSave, // (inventoryItem, rolls, productionRecordLink) => void
  onPrintRolls // (rolls) => void
}) {
  const isSFG = mode === 'SFG';
  const title = isSFG ? 'Create Semi-Finished Goods (SFG)' : 'Create Finished Goods (FG)';
  const categoryName = isSFG ? 'Semi-Finished Goods (SFG)' : 'Finished Goods (FG)';

  // All inputs start blank - ZERO pre-filled dummy/seed data
  const [selectedJobId, setSelectedJobId] = useState('');
  const [jobWidthMm, setJobWidthMm] = useState('');
  const [jobMicron, setJobMicron] = useState('');
  const [jobStructure, setJobStructure] = useState('');
  const [jobFilmType, setJobFilmType] = useState('');
  
  const [selectedType, setSelectedType] = useState('');
  const [machineName, setMachineName] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [shift, setShift] = useState('');
  const [storageBay, setStorageBay] = useState('');
  const [productionDate, setProductionDate] = useState(new Date().toISOString().split('T')[0]);
  const [defaultTareKg, setDefaultTareKg] = useState('');
  const [coreDia, setCoreDia] = useState('3 Inch (76mm)');
  const [batchRemarks, setBatchRemarks] = useState('');
  const [formErrors, setFormErrors] = useState({});

  // Filtered Job List from Orders & Job Masters (Strictly real data only, zero dummy fallbacks)
  const activeJobsList = useMemo(() => {
    const jobs = [];
    const seen = new Set();

    (orders || []).forEach(ord => {
      const jKey = `${ord.id}-${ord.jobName || ''}`;
      if (!seen.has(jKey)) {
        seen.add(jKey);
        const jm = (jobMasters || []).find(j => (j.jobName || '').toLowerCase().trim() === (ord.jobName || '').toLowerCase().trim());
        
        const realWidth = ord.printWidthMm || ord.widthMm || ord.width || ord.pouchWidthMm || ord.sizeMm || jm?.printWidthMm || jm?.pouchWidthMm || jm?.widthMm || jm?.width || '';
        const realMicron = ord.micron || jm?.micron || jm?.totalMicron || (jm?.layers ? jm.layers.reduce((sum, l) => sum + (parseFloat(l.micron) || 0), 0) : '') || '';
        const realStructure = ord.structure || jm?.structure || '';
        const realFilmType = ord.filmType || jm?.filmType || jm?.layers?.[0]?.filmType || '';

        jobs.push({
          id: ord.id,
          orderId: ord.id,
          jobName: ord.jobName || `Job #${ord.id}`,
          jobCode: jm?.jobCode || ord.jobCode || `JOB-${ord.id}`,
          clientName: ord.clientName || jm?.clientName || '',
          structure: realStructure,
          plannedQtyKg: parseFloat(ord.targetQtyKg || ord.qtyKg || 0),
          widthMm: realWidth ? String(realWidth) : '',
          micron: realMicron ? String(realMicron) : '',
          filmType: realFilmType
        });
      }
    });

    if (jobs.length === 0 && (jobMasters || []).length > 0) {
      jobMasters.forEach(jm => {
        const jKey = `JM-${jm.id}-${jm.jobName}`;
        if (!seen.has(jKey)) {
          seen.add(jKey);
          const realWidth = jm.printWidthMm || jm.pouchWidthMm || jm.widthMm || jm.width || '';
          const realMicron = jm.micron || jm.totalMicron || (jm.layers ? jm.layers.reduce((sum, l) => sum + (parseFloat(l.micron) || 0), 0) : '') || '';

          jobs.push({
            id: jm.id,
            orderId: jm.id,
            jobName: jm.jobName || '',
            jobCode: jm.jobCode || `JOB-${jm.id}`,
            clientName: jm.clientName || '',
            structure: jm.structure || '',
            plannedQtyKg: 0,
            widthMm: realWidth ? String(realWidth) : '',
            micron: realMicron ? String(realMicron) : '',
            filmType: jm.filmType || jm.layers?.[0]?.filmType || ''
          });
        }
      });
    }

    return jobs;
  }, [orders, jobMasters]);

  // Selected Job Object
  const currentJob = useMemo(() => {
    if (!selectedJobId) return null;
    return activeJobsList.find(j => String(j.id) === String(selectedJobId)) || null;
  }, [activeJobsList, selectedJobId]);

  // When a job is selected, sync its dimensions into editable state
  const handleJobSelect = (jobId) => {
    setSelectedJobId(jobId);
    if (formErrors.selectedJobId) {
      setFormErrors(prev => ({ ...prev, selectedJobId: null }));
    }

    const job = activeJobsList.find(j => String(j.id) === String(jobId));
    if (job) {
      setJobWidthMm(job.widthMm || '');
      setJobMicron(job.micron || '');
      setJobStructure(job.structure || '');
      setJobFilmType(job.filmType || '');
    } else {
      setJobWidthMm('');
      setJobMicron('');
      setJobStructure('');
      setJobFilmType('');
    }
  };

  // Subtype Code Helper for Barcodes
  const getSubtypeShortCode = (typeStr) => {
    if (!typeStr) return isSFG ? 'SFG' : 'FG';
    if (typeStr.includes('Printed')) return 'PRN';
    if (typeStr.includes('First Pass') && typeStr.includes('Roll')) return 'LAM1-R';
    if (typeStr.includes('First Pass') && typeStr.includes('Pouch')) return 'LAM1-P';
    if (typeStr.includes('Second Pass') && typeStr.includes('Pouch')) return 'LAM2-P';
    if (typeStr.includes('Second Pass') && typeStr.includes('Roll')) return 'LAM2-R';
    return isSFG ? 'SFG' : 'FG';
  };

  // Helper to calculate roll length in meters based on user's actual entered width & micron
  const calculateLength = (netKg, width, micron, filmType) => {
    const w = parseFloat(width || jobWidthMm || 0);
    const m = parseFloat(micron || jobMicron || 0);
    const wt = parseFloat(netKg);
    const densityKey = filmType || jobFilmType || 'PET';
    const density = FILM_DENSITIES[densityKey] || 1.40;
    if (w > 0 && m > 0 && wt > 0 && density > 0) {
      return Math.round((wt * 1000000) / (w * m * density));
    }
    return 0;
  };

  // Master Rolls State (Starts with 1 blank row)
  const [masterRolls, setMasterRolls] = useState([
    {
      id: `roll-${Date.now()}-1`,
      rollIndex: 1,
      barcodeId: '',
      grossWeightKg: '',
      tareWeightKg: '',
      netWeightKg: 0,
      widthMm: '',
      micron: '',
      lengthMeters: 0,
      jointCount: 0,
      qcStatus: 'Passed',
      notes: ''
    }
  ]);

  // Generate Roll Barcode Helper
  const generateRollBarcode = (rollIdx, jobCode, typeStr) => {
    const prefix = isSFG ? 'SFG' : 'FG';
    const subCode = getSubtypeShortCode(typeStr);
    const cleanJobCode = (jobCode || 'JOB').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const rollNumStr = String(rollIdx).padStart(2, '0');
    return `${prefix}-${subCode}-${cleanJobCode}-R${rollNumStr}`;
  };

  // Sync Roll Barcodes & dimensions when Job, dimensions or Type changes
  useEffect(() => {
    if (!currentJob) return;
    setMasterRolls(prev => prev.map((r, i) => {
      const gross = parseFloat(r.grossWeightKg) || 0;
      const tare = r.tareWeightKg !== '' ? parseFloat(r.tareWeightKg) : (parseFloat(defaultTareKg) || 0);
      const net = Math.max(0, gross - tare);
      const width = parseFloat(jobWidthMm) || 0;
      const micron = parseFloat(jobMicron) || 0;
      const len = calculateLength(net, width, micron, jobFilmType);
      const autoBarcode = generateRollBarcode(i + 1, currentJob.jobCode, selectedType);

      return {
        ...r,
        rollIndex: i + 1,
        barcodeId: r.isBarcodeCustom ? r.barcodeId : autoBarcode,
        netWeightKg: gross > 0 ? parseFloat(net.toFixed(2)) : 0,
        widthMm: width || '',
        micron: micron || '',
        lengthMeters: len
      };
    }));
  }, [currentJob, selectedType, defaultTareKg, jobWidthMm, jobMicron, jobFilmType]);

  // Roll Modification Handlers
  const handleUpdateRoll = (index, field, value) => {
    setMasterRolls(prev => {
      const updated = [...prev];
      const roll = { ...updated[index], [field]: value };

      if (field === 'grossWeightKg' || field === 'tareWeightKg') {
        const gross = parseFloat(field === 'grossWeightKg' ? value : roll.grossWeightKg) || 0;
        const tareVal = field === 'tareWeightKg' ? value : roll.tareWeightKg;
        const tare = tareVal !== '' ? (parseFloat(tareVal) || 0) : (parseFloat(defaultTareKg) || 0);
        
        if (gross > 0) {
          roll.netWeightKg = Math.max(0, parseFloat((gross - tare).toFixed(2)));
          roll.lengthMeters = calculateLength(roll.netWeightKg, jobWidthMm, jobMicron, jobFilmType);
        } else {
          roll.netWeightKg = 0;
          roll.lengthMeters = 0;
        }
      }

      if (field === 'barcodeId') {
        roll.isBarcodeCustom = true;
      }

      updated[index] = roll;
      return updated;
    });
  };

  // Add Another Master Roll Row
  const handleAddRollRow = () => {
    const nextIdx = masterRolls.length + 1;
    const autoBarcode = currentJob ? generateRollBarcode(nextIdx, currentJob.jobCode, selectedType) : '';
    const tare = defaultTareKg !== '' ? defaultTareKg : '';

    setMasterRolls(prev => [
      ...prev,
      {
        id: `roll-${Date.now()}-${nextIdx}`,
        rollIndex: nextIdx,
        barcodeId: autoBarcode,
        grossWeightKg: '',
        tareWeightKg: tare,
        netWeightKg: 0,
        widthMm: jobWidthMm || '',
        micron: jobMicron || '',
        lengthMeters: 0,
        jointCount: 0,
        qcStatus: 'Passed',
        notes: ''
      }
    ]);
  };

  // Remove Roll Row
  const handleRemoveRollRow = (index) => {
    if (masterRolls.length <= 1) {
      alert("At least 1 master roll is required.");
      return;
    }
    setMasterRolls(prev => prev.filter((_, i) => i !== index).map((r, idx) => ({
      ...r,
      rollIndex: idx + 1,
      barcodeId: r.isBarcodeCustom ? r.barcodeId : (currentJob ? generateRollBarcode(idx + 1, currentJob.jobCode, selectedType) : '')
    })));
  };

  // Aggregated Totals
  const totalGrossKg = masterRolls.reduce((sum, r) => sum + (parseFloat(r.grossWeightKg) || 0), 0);
  const totalNetKg = masterRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
  const totalMeters = masterRolls.reduce((sum, r) => sum + (parseFloat(r.lengthMeters) || 0), 0);
  const internalValuationRate = parseFloat(currentJob?.unitPrice || currentJob?.ratePerKg || 0);

  // Validate all fields before submission
  const validateForm = () => {
    const errors = {};

    if (!selectedJobId) {
      errors.selectedJobId = "Please select an active production job.";
    }
    if (!jobWidthMm || parseFloat(jobWidthMm) <= 0) {
      errors.jobWidthMm = "Please enter valid roll width in mm (> 0).";
    }
    if (!jobMicron || parseFloat(jobMicron) <= 0) {
      errors.jobMicron = "Please enter valid film micron (> 0).";
    }
    if (!selectedType) {
      errors.selectedType = "Please select the process stage type.";
    }
    if (!machineName) {
      errors.machineName = "Please select the production machine.";
    }
    if (!operatorName || !operatorName.trim()) {
      errors.operatorName = "Machine operator name is required.";
    }
    if (!shift) {
      errors.shift = "Please select the shift.";
    }
    if (!storageBay || !storageBay.trim()) {
      errors.storageBay = "Storage bay / location is required.";
    }

    // Roll validation
    const invalidRolls = masterRolls.some(r => !r.grossWeightKg || parseFloat(r.grossWeightKg) <= 0 || parseFloat(r.netWeightKg) <= 0);
    if (invalidRolls) {
      errors.rolls = "All master rolls must have valid gross and net weights entered on the scale.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Handler
  const handleSaveAndSubmit = (e) => {
    e.preventDefault();

    if (!validateForm()) {
      alert("Please fill in all required fields accurately before submitting.");
      return;
    }

    const batchCode = `${isSFG ? 'SFG' : 'FG'}-${currentJob.jobCode || currentJob.id}-${Date.now().toString().slice(-4)}`;
    const batchId = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    // 1. Construct Inventory Summary Item
    const inventoryItem = {
      id: batchId,
      itemCode: batchCode,
      itemName: `${selectedType} - ${currentJob.jobName}`,
      category: categoryName,
      subCategory: selectedType,
      jobName: currentJob.jobName,
      jobCode: currentJob.jobCode,
      orderId: currentJob.orderId,
      clientName: currentJob.clientName,
      structure: jobStructure || currentJob.structure,
      filmType: jobFilmType || currentJob.filmType,
      micron: parseFloat(jobMicron) || 0,
      widthMm: parseFloat(jobWidthMm) || 0,
      availableQtyKg: totalNetKg,
      totalQtyKg: totalNetKg,
      unitPrice: internalValuationRate,
      purchaseRatePerKg: internalValuationRate,
      unit: 'Kg',
      rollsCount: masterRolls.length,
      storageBay,
      machineName,
      operatorName: operatorName.trim(),
      shift,
      productionDate,
      lastBatch: batchCode,
      status: 'In Stock',
      notes: batchRemarks || `${selectedType} generated from ${machineName}`
    };

    // 2. Construct Child Inventory Roll Objects (for inventoryRolls & Supabase)
    const formattedRolls = masterRolls.map((r, idx) => {
      const rollBarcode = r.barcodeId || generateRollBarcode(idx + 1, currentJob.jobCode, selectedType);
      return {
        id: `roll-${Date.now()}-${idx + 1}`,
        barcodeId: rollBarcode,
        rollType: isSFG ? 'SFG' : 'FG',
        category: categoryName,
        subType: selectedType,
        sfgType: isSFG ? selectedType : undefined,
        fgType: !isSFG ? selectedType : undefined,
        itemId: batchId,
        itemName: `${selectedType} - ${currentJob.jobName} (Roll #${idx + 1})`,
        jobName: currentJob.jobName,
        jobCode: currentJob.jobCode,
        orderId: currentJob.orderId,
        clientName: currentJob.clientName,
        structure: jobStructure || currentJob.structure,
        filmType: jobFilmType || currentJob.filmType,
        widthMm: parseFloat(jobWidthMm) || 0,
        micron: parseFloat(jobMicron) || 0,
        grossWeightKg: parseFloat(r.grossWeightKg) || 0,
        tareWeightKg: parseFloat(r.tareWeightKg) || 0,
        netWeightKg: parseFloat(r.netWeightKg) || 0,
        availableWeightKg: parseFloat(r.netWeightKg) || 0,
        lengthMeters: r.lengthMeters,
        coreDia,
        jointCount: r.jointCount || 0,
        qcStatus: r.qcStatus || 'Passed',
        stationId: machineName,
        machine: machineName,
        operator: operatorName.trim(),
        shift,
        locationBay: storageBay,
        batchNo: batchCode,
        inwardDatetime: new Date().toISOString(),
        productionDate,
        purchaseRatePerKg: internalValuationRate,
        unitPrice: internalValuationRate,
        unit: 'Kg',
        status: isSFG ? 'In Stock (WIP)' : 'In Stock (Ready for Dispatch)'
      };
    });

    // 3. Construct Production Record Linkage Object
    const productionRecordLink = {
      orderId: currentJob.orderId,
      jobName: currentJob.jobName,
      jobCode: currentJob.jobCode,
      stageType: selectedType,
      isSFG,
      isFG: !isSFG,
      outputNetKg: totalNetKg,
      outputRollsCount: masterRolls.length,
      rolls: formattedRolls,
      machineName,
      operatorName: operatorName.trim(),
      shift,
      productionDate,
      storageBay,
      widthMm: parseFloat(jobWidthMm) || 0,
      micron: parseFloat(jobMicron) || 0
    };

    if (onSave) {
      onSave(inventoryItem, formattedRolls, productionRecordLink);
    }

    if (onPrintRolls) {
      onPrintRolls(formattedRolls);
    }

    onClose();
  };

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose} 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(6px)'
      }}
    >
      <div 
        className="modal-content" 
        style={{ 
          width: '100%', 
          maxWidth: '960px', 
          maxHeight: '90vh', 
          overflowY: 'auto', 
          padding: 'clamp(16px, 2.5vw, 24px)', 
          borderRadius: '12px',
          background: '#ffffff',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
          margin: 'auto'
        }} 
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="badge" style={{ 
                background: isSFG ? '#ede9fe' : '#fef3c7', 
                color: isSFG ? '#6d28d9' : '#b45309', 
                border: `1px solid ${isSFG ? '#c4b5fd' : '#fde68a'}`,
                fontWeight: '800',
                fontSize: '0.75rem',
                padding: '3px 8px'
              }}>
                {isSFG ? '📦 SEMI-FINISHED (SFG)' : '🏆 FINISHED GOODS (FG)'}
              </span>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>
                {title}
              </h3>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '4px 0 0 0' }}>
              Select production job, verify exact physical dimensions, and capture master rolls from the digital scale.
            </p>
          </div>

          <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSaveAndSubmit}>
          {/* Section 1: Active Job & Classification */}
          <div style={{ background: '#f8fafc', border: formErrors.selectedJobId || formErrors.selectedType ? '1.5px solid #ef4444' : '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building2 size={15} style={{ color: '#4f46e5' }} /> 1. Active Production Job & Stage Classification
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {/* Job Selector */}
              <div>
                <label className="form-label" style={{ fontWeight: '700', fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>
                  Select Active Production Job / Order <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select 
                  className="form-control" 
                  style={{ fontWeight: selectedJobId ? '700' : '400', fontSize: '0.88rem', color: selectedJobId ? '#0f172a' : '#94a3b8', width: '100%', borderColor: formErrors.selectedJobId ? '#ef4444' : undefined }}
                  value={selectedJobId} 
                  onChange={e => handleJobSelect(e.target.value)}
                  required
                >
                  <option value="">-- Select Active Production Job / Order * --</option>
                  {activeJobsList.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.jobName} {j.clientName ? `(${j.clientName})` : ''} {j.structure ? `• ${j.structure}` : ''} • Code: {j.jobCode}
                    </option>
                  ))}
                </select>

                {currentJob && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px', fontSize: '0.75rem', color: '#475569', marginTop: '6px', background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <span>Client: <strong>{currentJob.clientName || '—'}</strong></span>
                    <span>Structure: <strong>{currentJob.structure || '—'}</strong></span>
                  </div>
                )}
                {formErrors.selectedJobId && (
                  <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '2px', fontWeight: '600' }}>
                    {formErrors.selectedJobId}
                  </div>
                )}
              </div>

              {/* SFG / FG Type */}
              <div>
                <label className="form-label" style={{ fontWeight: '700', fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>
                  {isSFG ? 'SFG Process Type' : 'FG Process Type'} <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select 
                  className="form-control" 
                  style={{ fontWeight: selectedType ? '700' : '400', fontSize: '0.88rem', color: selectedType ? (isSFG ? '#6d28d9' : '#b45309') : '#94a3b8', width: '100%', borderColor: formErrors.selectedType ? '#ef4444' : undefined }}
                  value={selectedType} 
                  onChange={e => {
                    setSelectedType(e.target.value);
                    if (formErrors.selectedType) setFormErrors(prev => ({ ...prev, selectedType: null }));
                  }}
                  required
                >
                  <option value="">-- Select {isSFG ? 'SFG' : 'FG'} Stage Classification * --</option>
                  {(isSFG ? SFG_TYPES : FG_TYPES).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {formErrors.selectedType && (
                  <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '2px', fontWeight: '600' }}>
                    {formErrors.selectedType}
                  </div>
                )}
              </div>
            </div>

            {/* Technical Job Specifications: Real Width, Micron & Film Type */}
            <div style={{ marginTop: '12px', background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
              <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#1e293b', marginBottom: '8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Ruler size={14} style={{ color: '#0284c7' }} /> Technical Roll Dimensions (Used for Meter Calculation)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.76rem', marginBottom: '3px', display: 'block' }}>
                    Roll Width (mm) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input 
                    type="number" 
                    step="1"
                    className="form-control" 
                    style={{ fontSize: '0.82rem', fontWeight: '700', width: '100%', borderColor: formErrors.jobWidthMm ? '#ef4444' : undefined }}
                    placeholder="Enter Width mm *"
                    value={jobWidthMm} 
                    onChange={e => {
                      setJobWidthMm(e.target.value);
                      if (formErrors.jobWidthMm) setFormErrors(prev => ({ ...prev, jobWidthMm: null }));
                    }}
                    required
                  />
                  {formErrors.jobWidthMm && (
                    <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '2px' }}>
                      {formErrors.jobWidthMm}
                    </div>
                  )}
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.76rem', marginBottom: '3px', display: 'block' }}>
                    Total Micron (µ) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input 
                    type="number" 
                    step="0.1"
                    className="form-control" 
                    style={{ fontSize: '0.82rem', fontWeight: '700', width: '100%', borderColor: formErrors.jobMicron ? '#ef4444' : undefined }}
                    placeholder="Enter Micron µ *"
                    value={jobMicron} 
                    onChange={e => {
                      setJobMicron(e.target.value);
                      if (formErrors.jobMicron) setFormErrors(prev => ({ ...prev, jobMicron: null }));
                    }}
                    required
                  />
                  {formErrors.jobMicron && (
                    <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '2px' }}>
                      {formErrors.jobMicron}
                    </div>
                  )}
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.76rem', marginBottom: '3px', display: 'block' }}>
                    Film Substrate Density
                  </label>
                  <select 
                    className="form-control" 
                    style={{ fontSize: '0.82rem', width: '100%' }}
                    value={jobFilmType} 
                    onChange={e => setJobFilmType(e.target.value)}
                  >
                    <option value="">-- Select Film Density --</option>
                    {Object.keys(FILM_DENSITIES).map(f => (
                      <option key={f} value={f}>{f} (Density: {FILM_DENSITIES[f]})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Plant Machine, Operator, Shift & Bay */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '12px' }}>
              <div>
                <label className="form-label" style={{ fontWeight: '600', fontSize: '0.78rem', marginBottom: '4px', display: 'block' }}>
                  Production Machine / Press <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select 
                  className="form-control" 
                  style={{ fontSize: '0.8rem', width: '100%', borderColor: formErrors.machineName ? '#ef4444' : undefined }}
                  value={machineName} 
                  onChange={e => {
                    setMachineName(e.target.value);
                    if (formErrors.machineName) setFormErrors(prev => ({ ...prev, machineName: null }));
                  }}
                  required
                >
                  <option value="">-- Select Machine * --</option>
                  {MACHINE_OPTIONS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {formErrors.machineName && (
                  <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '2px', fontWeight: '600' }}>
                    {formErrors.machineName}
                  </div>
                )}
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '600', fontSize: '0.78rem', marginBottom: '4px', display: 'block' }}>
                  Machine Operator <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input 
                  type="text" 
                  className="form-control" 
                  style={{ fontSize: '0.8rem', width: '100%', borderColor: formErrors.operatorName ? '#ef4444' : undefined }}
                  placeholder="Enter Operator Name *" 
                  value={operatorName} 
                  onChange={e => {
                    setOperatorName(e.target.value);
                    if (formErrors.operatorName) setFormErrors(prev => ({ ...prev, operatorName: null }));
                  }}
                  required
                />
                {formErrors.operatorName && (
                  <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '2px', fontWeight: '600' }}>
                    {formErrors.operatorName}
                  </div>
                )}
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '600', fontSize: '0.78rem', marginBottom: '4px', display: 'block' }}>
                  Shift <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select 
                  className="form-control" 
                  style={{ fontSize: '0.8rem', width: '100%', borderColor: formErrors.shift ? '#ef4444' : undefined }}
                  value={shift} 
                  onChange={e => {
                    setShift(e.target.value);
                    if (formErrors.shift) setFormErrors(prev => ({ ...prev, shift: null }));
                  }}
                  required
                >
                  <option value="">-- Select Shift * --</option>
                  <option value="Day Shift (8 AM - 8 PM)">☀️ Day Shift (8 AM - 8 PM)</option>
                  <option value="Night Shift (8 PM - 8 AM)">🌙 Night Shift (8 PM - 8 AM)</option>
                </select>
                {formErrors.shift && (
                  <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '2px', fontWeight: '600' }}>
                    {formErrors.shift}
                  </div>
                )}
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '600', fontSize: '0.78rem', marginBottom: '4px', display: 'block' }}>
                  Storage Bay / Location <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input 
                  type="text" 
                  className="form-control" 
                  style={{ fontSize: '0.8rem', width: '100%', borderColor: formErrors.storageBay ? '#ef4444' : undefined }}
                  placeholder="e.g. Curing Bay A1, Bay 2 *"
                  value={storageBay} 
                  onChange={e => {
                    setStorageBay(e.target.value);
                    if (formErrors.storageBay) setFormErrors(prev => ({ ...prev, storageBay: null }));
                  }}
                  required
                />
                {formErrors.storageBay && (
                  <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '2px', fontWeight: '600' }}>
                    {formErrors.storageBay}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Master Rolls Multi-Weighing Table */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Scale size={16} style={{ color: '#059669' }} /> 2. Master Rolls Scale Weighing & 2D Barcodes ({masterRolls.length} Rolls)
                </h4>
                <span style={{ fontSize: '0.73rem', color: '#64748b' }}>
                  Place roll on digital scale and enter gross weight; net weight is computed after core deduction.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#475569', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>
                  <span>Default Core Tare:</span>
                  <input 
                    type="number" 
                    step="0.1" 
                    placeholder="Tare kg"
                    style={{ width: '65px', padding: '2px 4px', fontSize: '0.75rem', fontWeight: '700', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    value={defaultTareKg}
                    onChange={e => setDefaultTareKg(e.target.value)}
                  />
                  <span>kg</span>
                </div>

                <button 
                  type="button" 
                  className="btn-primary" 
                  style={{ padding: '5px 12px', fontSize: '0.75rem', background: '#047857', borderColor: '#047857', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={handleAddRollRow}
                >
                  <Plus size={13} /> Add Master Roll
                </button>
              </div>
            </div>

            {/* Rolls Entry Table Container */}
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: formErrors.rolls ? '1.5px solid #ef4444' : '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
              <table className="data-table" style={{ margin: 0, fontSize: '0.8rem', minWidth: '660px', width: '100%' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ width: '6%', textAlign: 'center' }}>Roll #</th>
                    <th style={{ width: '25%' }}>2D Barcode (ISO 18004)</th>
                    <th style={{ width: '18%', textAlign: 'right' }}>Scale Gross (kg) *</th>
                    <th style={{ width: '11%', textAlign: 'right' }}>Core (kg)</th>
                    <th style={{ width: '14%', textAlign: 'right' }}>Net Wt (kg)</th>
                    <th style={{ width: '13%', textAlign: 'right' }}>Est. Length (m)</th>
                    <th style={{ width: '8%', textAlign: 'center' }}>Joints</th>
                    <th style={{ width: '5%', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {masterRolls.map((roll, idx) => (
                    <tr key={roll.id}>
                      <td style={{ textAlign: 'center', fontWeight: '800', color: '#4f46e5' }}>
                        #{idx + 1}
                      </td>

                      <td>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="Auto Barcode"
                          style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: '700', padding: '3px 6px', width: '100%' }}
                          value={roll.barcodeId}
                          onChange={e => handleUpdateRoll(idx, 'barcodeId', e.target.value)}
                        />
                      </td>

                      {/* Scale Gross Input & Button */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                          <input 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00"
                            className="form-control" 
                            style={{ width: '85px', textAlign: 'right', fontWeight: '700', padding: '3px 5px', fontSize: '0.82rem', borderColor: !roll.grossWeightKg && formErrors.rolls ? '#ef4444' : undefined }}
                            value={roll.grossWeightKg}
                            onChange={e => handleUpdateRoll(idx, 'grossWeightKg', e.target.value)}
                            required
                          />
                          <WeighingScaleCaptureButton 
                            onWeightCapture={(captured) => handleUpdateRoll(idx, 'grossWeightKg', captured)}
                          />
                        </div>
                      </td>

                      {/* Tare */}
                      <td style={{ textAlign: 'right' }}>
                        <input 
                          type="number" 
                          step="0.1" 
                          placeholder="0.0"
                          className="form-control" 
                          style={{ width: '55px', textAlign: 'right', padding: '3px 5px', fontSize: '0.8rem' }}
                          value={roll.tareWeightKg}
                          onChange={e => handleUpdateRoll(idx, 'tareWeightKg', e.target.value)}
                        />
                      </td>

                      {/* Calculated Net */}
                      <td style={{ textAlign: 'right', fontWeight: '900', color: roll.netWeightKg > 0 ? '#047857' : '#94a3b8', fontSize: '0.88rem' }}>
                        {roll.netWeightKg > 0 ? `${roll.netWeightKg.toFixed(2)} kg` : '—'}
                      </td>

                      {/* Length */}
                      <td style={{ textAlign: 'right', color: roll.lengthMeters > 0 ? '#1e3a8a' : '#94a3b8', fontWeight: '700', fontSize: '0.8rem' }}>
                        {roll.lengthMeters > 0 ? `${roll.lengthMeters.toLocaleString()} m` : '—'}
                      </td>

                      {/* Splice / Joints */}
                      <td style={{ textAlign: 'center' }}>
                        <select 
                          className="form-control" 
                          style={{ width: '50px', padding: '2px 4px', fontSize: '0.75rem' }}
                          value={roll.jointCount}
                          onChange={e => handleUpdateRoll(idx, 'jointCount', parseInt(e.target.value) || 0)}
                        >
                          <option value="0">0</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                        </select>
                      </td>

                      {/* Delete */}
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          type="button" 
                          className="btn-danger-action" 
                          style={{ padding: '3px 5px' }}
                          onClick={() => handleRemoveRollRow(idx)}
                          disabled={masterRolls.length <= 1}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {formErrors.rolls && (
              <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '4px', fontWeight: '600' }}>
                {formErrors.rolls}
              </div>
            )}
          </div>

          {/* Section 3: Summary Totals Banner */}
          <div style={{ background: totalNetKg > 0 ? '#f0fdf4' : '#f8fafc', border: totalNetKg > 0 ? '1.5px solid #86efac' : '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', textAlign: 'center' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Total Master Rolls</span>
                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#047857' }}>
                  {masterRolls.filter(r => parseFloat(r.grossWeightKg) > 0).length} / {masterRolls.length} Weighed
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Total Gross Weight</span>
                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: totalGrossKg > 0 ? '#1e293b' : '#94a3b8' }}>
                  {totalGrossKg > 0 ? `${totalGrossKg.toFixed(2)} kg` : '0.00 kg'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Total Net Output</span>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', color: totalNetKg > 0 ? '#047857' : '#94a3b8' }}>
                  {totalNetKg > 0 ? `${totalNetKg.toFixed(2)} kg` : '0.00 kg'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Est. Total Length</span>
                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: totalMeters > 0 ? '#0284c7' : '#94a3b8' }}>
                  {totalMeters > 0 ? `${totalMeters.toLocaleString()} m` : '0 m'}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Batch Production Notes & Remarks */}
          <div style={{ marginBottom: '16px' }}>
            <label className="form-label" style={{ fontWeight: '600', fontSize: '0.78rem', marginBottom: '4px', display: 'block' }}>
              Batch Production Notes & Remarks
            </label>
            <input 
              type="text" 
              className="form-control" 
              style={{ fontSize: '0.82rem', width: '100%' }}
              placeholder="Enter remarks e.g. Corona tested, approved by QA, master roll batch notes..."
              value={batchRemarks}
              onChange={e => setBatchRemarks(e.target.value)}
            />
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '8px 16px' }}>
              Cancel
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="submit" 
                className="btn-primary" 
                style={{ 
                  background: isSFG ? '#6d28d9' : '#059669', 
                  borderColor: isSFG ? '#6d28d9' : '#059669', 
                  fontWeight: '800', 
                  padding: '8px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.85rem'
                }}
              >
                <Printer size={15} /> Save & Print Roll Barcode Stickers ({masterRolls.length})
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
