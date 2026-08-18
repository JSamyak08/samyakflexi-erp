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
  Sparkles, 
  Building2, 
  User, 
  Clock,
  Tag,
  Search,
  Check,
  RefreshCw,
  Sliders
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

  // Active Job Selector
  const [selectedJobId, setSelectedJobId] = useState('');

  // SFG/FG Specifics
  const [selectedType, setSelectedType] = useState(isSFG ? SFG_TYPES[0] : FG_TYPES[0]);
  const [machineName, setMachineName] = useState(isSFG ? MACHINE_OPTIONS[0] : MACHINE_OPTIONS[2]);
  const [operatorName, setOperatorName] = useState(currentUser?.name || 'Production Operator');
  const [shift, setShift] = useState('Day Shift (8 AM - 8 PM)');
  const [storageBay, setStorageBay] = useState(isSFG ? 'WIP Curing Bay A1' : 'FG Warehouse Dispatch Bay 1');
  const [productionDate, setProductionDate] = useState(new Date().toISOString().split('T')[0]);
  const [defaultTareKg, setDefaultTareKg] = useState(5.0); // 5kg standard 3" paper core
  const [coreDia, setCoreDia] = useState('3 Inch (76mm)');
  const [valuationRatePerKg, setValuationRatePerKg] = useState(isSFG ? 195 : 235);
  const [batchRemarks, setBatchRemarks] = useState('');

  // Filtered Job List
  const activeJobsList = useMemo(() => {
    const jobs = [];
    const seen = new Set();

    (orders || []).forEach(ord => {
      const jKey = `${ord.id}-${ord.jobName || ''}`;
      if (!seen.has(jKey)) {
        seen.add(jKey);
        const jm = (jobMasters || []).find(j => (j.jobName || '').toLowerCase().trim() === (ord.jobName || '').toLowerCase().trim());
        jobs.push({
          id: ord.id,
          orderId: ord.id,
          jobName: ord.jobName || `Job #${ord.id}`,
          jobCode: jm?.jobCode || ord.jobCode || `JOB-${ord.id}`,
          clientName: ord.clientName || jm?.clientName || 'Client',
          structure: jm?.structure || ord.structure || 'PET / PE',
          plannedQtyKg: parseFloat(ord.targetQtyKg || ord.qtyKg || 1000),
          widthMm: parseFloat(ord.widthMm || jm?.widthMm || 800),
          micron: parseFloat(ord.micron || jm?.micron || 12),
          filmType: ord.filmType || jm?.layers?.[0]?.filmType || 'PET'
        });
      }
    });

    if (jobs.length === 0 && (jobMasters || []).length > 0) {
      jobMasters.forEach(jm => {
        const jKey = `JM-${jm.id}-${jm.jobName}`;
        if (!seen.has(jKey)) {
          seen.add(jKey);
          jobs.push({
            id: jm.id,
            orderId: jm.id,
            jobName: jm.jobName || 'Master Job',
            jobCode: jm.jobCode || `JOB-${jm.id}`,
            clientName: jm.clientName || 'Client',
            structure: jm.structure || 'PET / PE',
            plannedQtyKg: 1000,
            widthMm: parseFloat(jm.widthMm || 800),
            micron: parseFloat(jm.micron || 12),
            filmType: jm.layers?.[0]?.filmType || 'PET'
          });
        }
      });
    }

    return jobs;
  }, [orders, jobMasters]);

  // Selected Job Object
  const currentJob = useMemo(() => {
    return activeJobsList.find(j => String(j.id) === String(selectedJobId)) || activeJobsList[0] || null;
  }, [activeJobsList, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId && activeJobsList.length > 0) {
      setSelectedJobId(activeJobsList[0].id);
    }
  }, [activeJobsList, selectedJobId]);

  // Subtype Code Helper for Barcodes
  const getSubtypeShortCode = (typeStr) => {
    if (typeStr.includes('Printed')) return 'PRN';
    if (typeStr.includes('First Pass') && typeStr.includes('Roll')) return 'LAM1-R';
    if (typeStr.includes('First Pass') && typeStr.includes('Pouch')) return 'LAM1-P';
    if (typeStr.includes('Second Pass') && typeStr.includes('Pouch')) return 'LAM2-P';
    if (typeStr.includes('Second Pass') && typeStr.includes('Roll')) return 'LAM2-R';
    return isSFG ? 'SFG' : 'FG';
  };

  // Helper to calculate roll length
  const calculateLength = (netKg, width, micron, filmType) => {
    const w = parseFloat(width || currentJob?.widthMm || 800);
    const m = parseFloat(micron || currentJob?.micron || 12);
    const wt = parseFloat(netKg);
    const density = FILM_DENSITIES[filmType || currentJob?.filmType] || 1.40;
    if (w > 0 && m > 0 && wt > 0 && density > 0) {
      return Math.round((wt * 1000000) / (w * m * density));
    }
    return 0;
  };

  // Master Rolls State (Multi-Roll Scale Entry)
  const [masterRolls, setMasterRolls] = useState([
    {
      id: `roll-${Date.now()}-1`,
      rollIndex: 1,
      barcodeId: '',
      grossWeightKg: 125,
      tareWeightKg: 5,
      netWeightKg: 120,
      widthMm: 800,
      micron: 12,
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

  // Sync / Initialize Roll Barcodes when Job or Type changes
  useEffect(() => {
    if (!currentJob) return;
    setMasterRolls(prev => prev.map((r, i) => {
      const gross = parseFloat(r.grossWeightKg) || 0;
      const tare = parseFloat(r.tareWeightKg) || defaultTareKg;
      const net = Math.max(0, gross - tare);
      const width = parseFloat(currentJob.widthMm) || 800;
      const micron = parseFloat(currentJob.micron) || 12;
      const len = calculateLength(net, width, micron, currentJob.filmType);
      const autoBarcode = r.barcodeId && !r.barcodeId.startsWith('SFG-') && !r.barcodeId.startsWith('FG-') 
        ? r.barcodeId 
        : generateRollBarcode(i + 1, currentJob.jobCode, selectedType);

      return {
        ...r,
        rollIndex: i + 1,
        barcodeId: r.isBarcodeCustom ? r.barcodeId : autoBarcode,
        tareWeightKg: tare,
        netWeightKg: net,
        widthMm: width,
        micron: micron,
        lengthMeters: len
      };
    }));
  }, [currentJob, selectedType, defaultTareKg]);

  // Roll Modification Handlers
  const handleUpdateRoll = (index, field, value) => {
    setMasterRolls(prev => {
      const updated = [...prev];
      const roll = { ...updated[index], [field]: value };

      if (field === 'grossWeightKg' || field === 'tareWeightKg') {
        const gross = parseFloat(field === 'grossWeightKg' ? value : roll.grossWeightKg) || 0;
        const tare = parseFloat(field === 'tareWeightKg' ? value : roll.tareWeightKg) || 0;
        roll.netWeightKg = Math.max(0, parseFloat((gross - tare).toFixed(2)));
        roll.lengthMeters = calculateLength(roll.netWeightKg, roll.widthMm, roll.micron, currentJob?.filmType);
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
    const autoBarcode = generateRollBarcode(nextIdx, currentJob?.jobCode, selectedType);
    const defaultGross = 120;
    const net = Math.max(0, defaultGross - defaultTareKg);
    const width = parseFloat(currentJob?.widthMm) || 800;
    const micron = parseFloat(currentJob?.micron) || 12;
    const len = calculateLength(net, width, micron, currentJob?.filmType);

    setMasterRolls(prev => [
      ...prev,
      {
        id: `roll-${Date.now()}-${nextIdx}`,
        rollIndex: nextIdx,
        barcodeId: autoBarcode,
        grossWeightKg: defaultGross,
        tareWeightKg: defaultTareKg,
        netWeightKg: net,
        widthMm: width,
        micron: micron,
        lengthMeters: len,
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
      barcodeId: r.isBarcodeCustom ? r.barcodeId : generateRollBarcode(idx + 1, currentJob?.jobCode, selectedType)
    })));
  };

  // Aggregated Totals
  const totalGrossKg = masterRolls.reduce((sum, r) => sum + (parseFloat(r.grossWeightKg) || 0), 0);
  const totalNetKg = masterRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
  const totalMeters = masterRolls.reduce((sum, r) => sum + (parseFloat(r.lengthMeters) || 0), 0);
  const totalEstimatedValuation = totalNetKg * valuationRatePerKg;

  // Submit Handler
  const handleSaveAndSubmit = (e) => {
    e.preventDefault();
    if (!currentJob) {
      alert("Please select an active production job.");
      return;
    }

    if (masterRolls.length === 0 || totalNetKg <= 0) {
      alert("Please enter at least one valid master roll with positive net weight.");
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
      structure: currentJob.structure,
      filmType: currentJob.filmType,
      micron: currentJob.micron,
      widthMm: currentJob.widthMm,
      availableQtyKg: totalNetKg,
      totalQtyKg: totalNetKg,
      unitPrice: valuationRatePerKg,
      purchaseRatePerKg: valuationRatePerKg,
      unit: 'Kg',
      rollsCount: masterRolls.length,
      storageBay,
      machineName,
      operatorName,
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
        structure: currentJob.structure,
        filmType: currentJob.filmType,
        widthMm: r.widthMm,
        micron: r.micron,
        grossWeightKg: r.grossWeightKg,
        tareWeightKg: r.tareWeightKg,
        netWeightKg: r.netWeightKg,
        availableWeightKg: r.netWeightKg,
        lengthMeters: r.lengthMeters,
        coreDia,
        jointCount: r.jointCount || 0,
        qcStatus: r.qcStatus || 'Passed',
        stationId: machineName,
        machine: machineName,
        operator: operatorName,
        shift,
        locationBay: storageBay,
        batchNo: batchCode,
        inwardDatetime: new Date().toISOString(),
        productionDate,
        purchaseRatePerKg: valuationRatePerKg,
        unitPrice: valuationRatePerKg,
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
      operatorName,
      shift,
      productionDate,
      storageBay
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
              Weigh master rolls on digital scale, generate 2D barcodes, and automatically link output to active Job & Production Records.
            </p>
          </div>

          <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSaveAndSubmit}>
          {/* Section 1: Active Job & Classification */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building2 size={15} style={{ color: '#4f46e5' }} /> 1. Active Production Job & Stage Classification
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {/* Job Selector */}
              <div>
                <label className="form-label" style={{ fontWeight: '700', fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>
                  Select Active Production Job / Order *
                </label>
                <select 
                  className="form-control" 
                  style={{ fontWeight: '700', fontSize: '0.88rem', color: '#0f172a', width: '100%' }}
                  value={selectedJobId} 
                  onChange={e => setSelectedJobId(e.target.value)}
                  required
                >
                  {activeJobsList.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.jobName} ({j.clientName}) • {j.structure} • Code: {j.jobCode}
                    </option>
                  ))}
                </select>

                {currentJob && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px', fontSize: '0.75rem', color: '#475569', marginTop: '6px', background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <span>Client: <strong>{currentJob.clientName}</strong></span>
                    <span>Structure: <strong>{currentJob.structure}</strong></span>
                    <span>Width: <strong>{currentJob.widthMm} mm</strong></span>
                    <span>Micron: <strong>{currentJob.micron} µ</strong></span>
                  </div>
                )}
              </div>

              {/* SFG / FG Type */}
              <div>
                <label className="form-label" style={{ fontWeight: '700', fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>
                  {isSFG ? 'SFG Process Type *' : 'FG Process Type *'}
                </label>
                <select 
                  className="form-control" 
                  style={{ fontWeight: '700', fontSize: '0.88rem', color: isSFG ? '#6d28d9' : '#b45309', width: '100%' }}
                  value={selectedType} 
                  onChange={e => setSelectedType(e.target.value)}
                  required
                >
                  {(isSFG ? SFG_TYPES : FG_TYPES).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Plant Machine, Operator & Shift */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '12px' }}>
              <div>
                <label className="form-label" style={{ fontWeight: '600', fontSize: '0.78rem', marginBottom: '4px', display: 'block' }}>
                  Production Machine / Press
                </label>
                <select 
                  className="form-control" 
                  style={{ fontSize: '0.8rem', width: '100%' }}
                  value={machineName} 
                  onChange={e => setMachineName(e.target.value)}
                >
                  {MACHINE_OPTIONS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '600', fontSize: '0.78rem', marginBottom: '4px', display: 'block' }}>
                  Machine Operator
                </label>
                <input 
                  type="text" 
                  className="form-control" 
                  style={{ fontSize: '0.8rem', width: '100%' }}
                  placeholder="Operator Name" 
                  value={operatorName} 
                  onChange={e => setOperatorName(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '600', fontSize: '0.78rem', marginBottom: '4px', display: 'block' }}>
                  Shift
                </label>
                <select 
                  className="form-control" 
                  style={{ fontSize: '0.8rem', width: '100%' }}
                  value={shift} 
                  onChange={e => setShift(e.target.value)}
                >
                  <option value="Day Shift (8 AM - 8 PM)">☀️ Day Shift (8 AM - 8 PM)</option>
                  <option value="Night Shift (8 PM - 8 AM)">🌙 Night Shift (8 PM - 8 AM)</option>
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '600', fontSize: '0.78rem', marginBottom: '4px', display: 'block' }}>
                  Storage Bay / Location
                </label>
                <input 
                  type="text" 
                  className="form-control" 
                  style={{ fontSize: '0.8rem', width: '100%' }}
                  value={storageBay} 
                  onChange={e => setStorageBay(e.target.value)}
                />
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
                  Capture live scale gross weight; net weight and length are calculated automatically.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#475569', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>
                  <span>Default Core Tare:</span>
                  <input 
                    type="number" 
                    step="0.1" 
                    style={{ width: '50px', padding: '2px 4px', fontSize: '0.75rem', fontWeight: '700', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    value={defaultTareKg}
                    onChange={e => setDefaultTareKg(parseFloat(e.target.value) || 0)}
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
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
              <table className="data-table" style={{ margin: 0, fontSize: '0.8rem', minWidth: '660px', width: '100%' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ width: '6%', textAlign: 'center' }}>Roll #</th>
                    <th style={{ width: '25%' }}>2D Barcode (ISO 18004)</th>
                    <th style={{ width: '18%', textAlign: 'right' }}>Scale Gross (kg)</th>
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
                            className="form-control" 
                            style={{ width: '75px', textAlign: 'right', fontWeight: '700', padding: '3px 5px', fontSize: '0.8rem' }}
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
                          className="form-control" 
                          style={{ width: '55px', textAlign: 'right', padding: '3px 5px', fontSize: '0.8rem' }}
                          value={roll.tareWeightKg}
                          onChange={e => handleUpdateRoll(idx, 'tareWeightKg', e.target.value)}
                        />
                      </td>

                      {/* Calculated Net */}
                      <td style={{ textAlign: 'right', fontWeight: '900', color: '#047857', fontSize: '0.88rem' }}>
                        {roll.netWeightKg.toFixed(2)} kg
                      </td>

                      {/* Length */}
                      <td style={{ textAlign: 'right', color: '#1e3a8a', fontWeight: '700', fontSize: '0.8rem' }}>
                        {roll.lengthMeters.toLocaleString()} m
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
          </div>

          {/* Section 3: Summary Totals & Valuation Banner */}
          <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', textAlign: 'center' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#065f46', textTransform: 'uppercase' }}>Total Master Rolls</span>
                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#047857' }}>
                  {masterRolls.length} Rolls
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#065f46', textTransform: 'uppercase' }}>Total Gross Weight</span>
                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#1e293b' }}>
                  {totalGrossKg.toFixed(2)} kg
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#065f46', textTransform: 'uppercase' }}>Total Net Output</span>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#047857' }}>
                  {totalNetKg.toFixed(2)} kg
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#065f46', textTransform: 'uppercase' }}>Est. Total Length</span>
                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#0284c7' }}>
                  {totalMeters.toLocaleString()} m
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Remarks & Valuation Rate */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label className="form-label" style={{ fontWeight: '600', fontSize: '0.78rem', marginBottom: '4px', display: 'block' }}>
                Inventory Valuation Rate (₹/kg)
              </label>
              <input 
                type="number" 
                className="form-control" 
                style={{ fontWeight: '700', fontSize: '0.82rem', width: '100%' }}
                value={valuationRatePerKg}
                onChange={e => setValuationRatePerKg(parseFloat(e.target.value) || 0)}
              />
              <span style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px', display: 'block' }}>
                Est Total Batch Value: ₹{Math.round(totalEstimatedValuation).toLocaleString('en-IN')}
              </span>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: '600', fontSize: '0.78rem', marginBottom: '4px', display: 'block' }}>
                Batch Production Notes & Remarks
              </label>
              <input 
                type="text" 
                className="form-control" 
                style={{ fontSize: '0.82rem', width: '100%' }}
                placeholder="e.g. Master rolls cleared visual inspection, corona treatment verified..."
                value={batchRemarks}
                onChange={e => setBatchRemarks(e.target.value)}
              />
            </div>
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
