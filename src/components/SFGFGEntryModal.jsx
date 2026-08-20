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
  Ruler,
  Lock,
  ShieldAlert
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
  inventoryRolls = [],
  productionRecords = [],
  machines = [],
  currentUser,
  onClose,
  onSave, // (inventoryItem, rolls, productionRecordLink) => void
  onPrintRolls // (rolls) => void
}) {
  const isSFG = mode === 'SFG';
  const title = isSFG ? 'Create Semi-Finished Goods (SFG)' : 'Create Finished Goods (FG)';
  const categoryName = isSFG ? 'Semi-Finished Goods (SFG)' : 'Finished Goods (FG)';
  const isAdmin = currentUser?.role === 'Admin' || currentUser?.role === 'SuperAdmin';

  // Sourced directly from machines stored in settings (Printing Presses / Machine Settings in Supabase)
  const availableMachines = useMemo(() => {
    if (Array.isArray(machines) && machines.length > 0) {
      return machines.filter(m => (m.status || 'Active').toLowerCase() !== 'inactive');
    }
    return [];
  }, [machines]);

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
          filmType: realFilmType,
          unitPrice: parseFloat(ord.ratePerKg || ord.sellingPricePerKg || jm?.unitPrice || 0)
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
            filmType: jm.filmType || jm.layers?.[0]?.filmType || '',
            unitPrice: parseFloat(jm.unitPrice || 0)
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

  // Helper to generate next roll barcode
  const generateRollBarcode = (rollIdx, jobCode, typeStr) => {
    const prefix = isSFG ? 'SFG' : 'FG';
    const subCode = getSubtypeShortCode(typeStr);
    const cleanJobCode = (jobCode || 'JOB').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const rollNumStr = String(rollIdx).padStart(2, '0');
    return `${prefix}-${subCode}-${cleanJobCode}-R${rollNumStr}`;
  };

  // Fetch Existing Rolls for the selected Job and Stage from Inventory & Production Records
  const existingJobRolls = useMemo(() => {
    if (!currentJob) return [];

    const existingList = [];
    const seenBarcodes = new Set();

    // 1. Check inventoryRolls
    (inventoryRolls || []).forEach(r => {
      const matchJob = (r.orderId && String(r.orderId) === String(currentJob.orderId)) ||
                       (r.jobCode && String(r.jobCode).toUpperCase() === String(currentJob.jobCode).toUpperCase()) ||
                       (r.jobName && (r.jobName || '').toLowerCase().trim() === (currentJob.jobName || '').toLowerCase().trim());
      
      const matchType = (r.rollType === (isSFG ? 'SFG' : 'FG')) || 
                        ((r.category || '').includes(isSFG ? 'Semi-Finished' : 'Finished'));

      if (matchJob && matchType && r.barcodeId && !seenBarcodes.has(r.barcodeId)) {
        seenBarcodes.add(r.barcodeId);
        existingList.push({
          id: r.id || r.barcodeId,
          barcodeId: r.barcodeId,
          grossWeightKg: parseFloat(r.grossWeightKg || r.netWeightKg || 0),
          tareWeightKg: parseFloat(r.tareWeightKg || 0),
          netWeightKg: parseFloat(r.netWeightKg || 0),
          widthMm: r.widthMm || currentJob.widthMm || '',
          micron: r.micron || currentJob.micron || '',
          lengthMeters: r.lengthMeters || 0,
          jointCount: r.jointCount || 0,
          qcStatus: r.qcStatus || 'Passed',
          machineName: r.machine || r.stationId || '',
          operatorName: r.operator || '',
          shift: r.shift || '',
          productionDate: r.productionDate || (r.inwardDatetime ? r.inwardDatetime.split('T')[0] : ''),
          isExisting: true,
          isLocked: true
        });
      }
    });

    // 2. Check productionRecords outputRolls
    (productionRecords || []).forEach(pr => {
      const matchJob = (pr.orderId && String(pr.orderId) === String(currentJob.orderId)) ||
                       (pr.jobCode && String(pr.jobCode).toUpperCase() === String(currentJob.jobCode).toUpperCase()) ||
                       (pr.jobName && (pr.jobName || '').toLowerCase().trim() === (currentJob.jobName || '').toLowerCase().trim());

      if (matchJob && Array.isArray(pr.outputRolls)) {
        pr.outputRolls.forEach(r => {
          const matchType = (r.rollType === (isSFG ? 'SFG' : 'FG')) || 
                            ((r.category || '').includes(isSFG ? 'Semi-Finished' : 'Finished'));

          if (matchType && r.barcodeId && !seenBarcodes.has(r.barcodeId)) {
            seenBarcodes.add(r.barcodeId);
            existingList.push({
              id: r.id || r.barcodeId,
              barcodeId: r.barcodeId,
              grossWeightKg: parseFloat(r.grossWeightKg || r.netWeightKg || 0),
              tareWeightKg: parseFloat(r.tareWeightKg || 0),
              netWeightKg: parseFloat(r.netWeightKg || 0),
              widthMm: r.widthMm || currentJob.widthMm || '',
              micron: r.micron || currentJob.micron || '',
              lengthMeters: r.lengthMeters || 0,
              jointCount: r.jointCount || 0,
              qcStatus: r.qcStatus || 'Passed',
              machineName: r.machine || r.stationId || '',
              operatorName: r.operator || '',
              shift: r.shift || '',
              productionDate: r.productionDate || '',
              isExisting: true,
              isLocked: true
            });
          }
        });
      }
    });

    return existingList;
  }, [currentJob, inventoryRolls, productionRecords, isSFG]);

  // Master Rolls State (Combines existing locked rolls + newly added rolls)
  const [masterRolls, setMasterRolls] = useState([]);

  // When currentJob, selectedType, or existingJobRolls changes, populate the table
  useEffect(() => {
    if (!currentJob) {
      setMasterRolls([
        {
          id: `new-roll-${Date.now()}-1`,
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
          notes: '',
          isExisting: false,
          isLocked: false
        }
      ]);
      return;
    }

    const lockedList = existingJobRolls.map((r, i) => ({
      ...r,
      rollIndex: r.rollIndex || (i + 1),
      isExisting: true,
      isLocked: true
    }));

    // Find highest roll index among all existing rolls for this job & stage
    let maxExistingIdx = 0;
    existingJobRolls.forEach(r => {
      if (r.rollIndex && Number(r.rollIndex) > maxExistingIdx) maxExistingIdx = Number(r.rollIndex);
      const match = (r.barcodeId || '').match(/-R0*(\d+)$/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxExistingIdx) maxExistingIdx = num;
      }
    });

    const nextRollIdx = Math.max(lockedList.length + 1, maxExistingIdx + 1);
    const initialNewRoll = {
      id: `new-roll-${Date.now()}-${nextRollIdx}`,
      rollIndex: nextRollIdx,
      barcodeId: generateRollBarcode(nextRollIdx, currentJob.jobCode, selectedType),
      grossWeightKg: '',
      tareWeightKg: defaultTareKg !== '' ? defaultTareKg : '',
      netWeightKg: 0,
      widthMm: jobWidthMm || '',
      micron: jobMicron || '',
      lengthMeters: 0,
      jointCount: 0,
      qcStatus: 'Passed',
      notes: '',
      isExisting: false,
      isLocked: false
    };

    setMasterRolls([...lockedList, initialNewRoll]);
  }, [currentJob?.id, selectedType, existingJobRolls.length]);

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

  // Sync new rolls dimensions/weights without altering previously assigned barcodes
  useEffect(() => {
    if (!currentJob) return;
    setMasterRolls(prev => prev.map((r, i) => {
      if (r.isExisting) return r; // DO NOT mutate previous locked rolls

      const gross = parseFloat(r.grossWeightKg) || 0;
      const tare = r.tareWeightKg !== '' ? parseFloat(r.tareWeightKg) : (parseFloat(defaultTareKg) || 0);
      const net = Math.max(0, gross - tare);
      const width = parseFloat(jobWidthMm) || 0;
      const micron = parseFloat(jobMicron) || 0;
      const len = calculateLength(net, width, micron, jobFilmType);

      return {
        ...r,
        barcodeId: r.barcodeId || generateRollBarcode(r.rollIndex || (i + 1), currentJob.jobCode, selectedType),
        netWeightKg: gross > 0 ? parseFloat(net.toFixed(2)) : 0,
        widthMm: width || '',
        micron: micron || '',
        lengthMeters: len
      };
    }));
  }, [jobWidthMm, jobMicron, jobFilmType, defaultTareKg, selectedType]);

  // Roll Modification Handlers (Only allowed for new rolls)
  const handleUpdateRoll = (index, field, value) => {
    setMasterRolls(prev => {
      const updated = [...prev];
      const roll = updated[index];
      if (roll.isLocked) return prev; // Cannot edit locked rolls

      const modRoll = { ...roll, [field]: value };

      if (field === 'grossWeightKg' || field === 'tareWeightKg') {
        const gross = parseFloat(field === 'grossWeightKg' ? value : modRoll.grossWeightKg) || 0;
        const tare = parseFloat(field === 'tareWeightKg' ? value : (modRoll.tareWeightKg || defaultTareKg)) || 0;
        const net = Math.max(0, gross - tare);
        modRoll.netWeightKg = parseFloat(net.toFixed(2));
        modRoll.lengthMeters = calculateLength(net, modRoll.widthMm, modRoll.micron, jobFilmType);
      }

      if (field === 'barcodeId') {
        modRoll.isBarcodeCustom = true;
      }

      updated[index] = modRoll;
      return updated;
    });
  };

  // Add Another Master Roll Row
  const handleAddRollRow = () => {
    let maxIdx = 0;
    masterRolls.forEach(r => {
      if (r.rollIndex && Number(r.rollIndex) > maxIdx) maxIdx = Number(r.rollIndex);
      const match = (r.barcodeId || '').match(/-R0*(\d+)$/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxIdx) maxIdx = num;
      }
    });

    const nextIdx = maxIdx + 1;
    const autoBarcode = currentJob ? generateRollBarcode(nextIdx, currentJob.jobCode, selectedType) : '';
    const tare = defaultTareKg !== '' ? defaultTareKg : '';

    setMasterRolls(prev => [
      ...prev,
      {
        id: `new-roll-${Date.now()}-${nextIdx}`,
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
        notes: '',
        isExisting: false,
        isLocked: false
      }
    ]);
  };

  // Remove Roll Row (Only allowed for new rolls)
  const handleRemoveRollRow = (index) => {
    const target = masterRolls[index];
    if (target && target.isLocked) {
      alert("⚠️ Previously entered roll with generated barcode is locked. It can only be modified/deleted from the inventory by an Admin.");
      return;
    }

    const newRollsCount = masterRolls.filter(r => !r.isExisting).length;
    if (newRollsCount <= 1) {
      alert("At least 1 new master roll is required to submit.");
      return;
    }

    setMasterRolls(prev => prev.filter((_, i) => i !== index).map((r, idx) => {
      if (r.isExisting) return r;
      return {
        ...r,
        rollIndex: idx + 1,
        barcodeId: r.isBarcodeCustom ? r.barcodeId : (currentJob ? generateRollBarcode(idx + 1, currentJob.jobCode, selectedType) : '')
      };
    }));
  };

  // Newly Added Rolls Only
  const newRollsToSave = useMemo(() => {
    return masterRolls.filter(r => !r.isExisting);
  }, [masterRolls]);

  // Existing Rolls
  const existingLockedRolls = useMemo(() => {
    return masterRolls.filter(r => r.isExisting);
  }, [masterRolls]);

  // Aggregated Totals for NEW rolls
  const newGrossKg = newRollsToSave.reduce((sum, r) => sum + (parseFloat(r.grossWeightKg) || 0), 0);
  const newNetKg = newRollsToSave.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
  const newMeters = newRollsToSave.reduce((sum, r) => sum + (parseFloat(r.lengthMeters) || 0), 0);

  // Cumulative Totals (Existing + New)
  const cumulativeNetKg = masterRolls.reduce((sum, r) => sum + (parseFloat(r.netWeightKg) || 0), 0);
  const internalValuationRate = parseFloat(currentJob?.unitPrice || 0);

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

    // Roll validation for new rolls
    if (newRollsToSave.length === 0) {
      errors.rolls = "Please add at least 1 new master roll.";
    } else {
      const invalidRolls = newRollsToSave.some(r => !r.grossWeightKg || parseFloat(r.grossWeightKg) <= 0 || parseFloat(r.netWeightKg) <= 0);
      if (invalidRolls) {
        errors.rolls = "All new master rolls must have valid gross and net weights entered on the scale.";
      }
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

    // 1. Construct Inventory Summary Item (For the new batch)
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
      availableQtyKg: newNetKg,
      totalQtyKg: newNetKg,
      unitPrice: internalValuationRate,
      purchaseRatePerKg: internalValuationRate,
      unit: 'Kg',
      rollsCount: newRollsToSave.length,
      storageBay,
      machineName,
      operatorName: operatorName.trim(),
      shift,
      productionDate,
      lastBatch: batchCode,
      status: 'In Stock',
      notes: batchRemarks || `${selectedType} generated from ${machineName}`
    };

    // 2. Construct Child Inventory Roll Objects (for new rolls ONLY)
    const formattedNewRolls = newRollsToSave.map((r) => {
      const rollBarcode = r.barcodeId || generateRollBarcode(r.rollIndex, currentJob.jobCode, selectedType);
      return {
        id: `roll-${Date.now()}-${r.rollIndex}`,
        barcodeId: rollBarcode,
        rollType: isSFG ? 'SFG' : 'FG',
        category: categoryName,
        subType: selectedType,
        sfgType: isSFG ? selectedType : undefined,
        fgType: !isSFG ? selectedType : undefined,
        itemId: batchId,
        itemName: `${selectedType} - ${currentJob.jobName} (Roll #${r.rollIndex})`,
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
      outputNetKg: newNetKg,
      outputRollsCount: newRollsToSave.length,
      rolls: formattedNewRolls,
      machineName,
      operatorName: operatorName.trim(),
      shift,
      productionDate,
      storageBay,
      widthMm: parseFloat(jobWidthMm) || 0,
      micron: parseFloat(jobMicron) || 0
    };

    if (onSave) {
      onSave(inventoryItem, formattedNewRolls, productionRecordLink);
    }

    if (onPrintRolls) {
      onPrintRolls(formattedNewRolls);
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
          maxWidth: '980px', 
          maxHeight: '92vh', 
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
              Weigh master rolls on digital scale and generate individual 2D barcodes linked to the active job record.
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
                    {existingLockedRolls.length > 0 && (
                      <span className="badge badge-info" style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#e0e7ff', color: '#3730a3' }}>
                        🔗 {existingLockedRolls.length} Previous Roll(s) Recorded
                      </span>
                    )}
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
                <Ruler size={14} style={{ color: '#0284c7' }} /> Technical Roll Dimensions (Used for Length & Meter Calculations)
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
                  <option value="">-- Select Machine from Settings * --</option>
                  {availableMachines.map(m => {
                    const mName = typeof m === 'string' ? m : (m.name || m.id);
                    const mDetails = typeof m === 'object' && m.type ? ` (${m.type}${m.location ? ' • ' + m.location : ''})` : '';
                    return (
                      <option key={typeof m === 'object' ? m.id : m} value={mName}>
                        {mName}{mDetails}
                      </option>
                    );
                  })}
                </select>
                {availableMachines.length === 0 && (
                  <div style={{ fontSize: '0.72rem', color: '#d97706', marginTop: '3px', fontWeight: '600' }}>
                    ⚠️ No active machines found in Settings. Please add machines in Printing Presses / Settings.
                  </div>
                )}
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
                  <Scale size={16} style={{ color: '#059669' }} /> 2. Master Rolls Scale Weighing & 2D Barcodes ({masterRolls.length} Total Rolls)
                </h4>
                <span style={{ fontSize: '0.73rem', color: '#64748b' }}>
                  Previously entered rolls with generated barcodes are locked. Add new rolls below to weigh on the scale.
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
                  <Plus size={13} /> + Add Next Master Roll
                </button>
              </div>
            </div>

            {/* Lock Notice if previous rolls exist */}
            {existingLockedRolls.length > 0 && (
              <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '6px', marginBottom: '8px', fontSize: '0.75rem', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={14} style={{ color: '#64748b' }} />
                  <span>
                    <strong>{existingLockedRolls.length} previous master roll(s)</strong> already have barcodes generated and are locked against accidental modification.
                  </span>
                </div>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  {isAdmin ? '🛡️ Admin can edit/delete from Inventory Stock Register' : '🔒 Editing/Deleting restricted to Admin'}
                </span>
              </div>
            )}

            {/* Rolls Entry Table Container */}
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: formErrors.rolls ? '1.5px solid #ef4444' : '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
              <table className="data-table" style={{ margin: 0, fontSize: '0.8rem', minWidth: '660px', width: '100%' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ width: '6%', textAlign: 'center' }}>Roll #</th>
                    <th style={{ width: '26%' }}>2D Barcode (ISO 18004)</th>
                    <th style={{ width: '18%', textAlign: 'right' }}>Scale Gross (kg) *</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Core (kg)</th>
                    <th style={{ width: '14%', textAlign: 'right' }}>Net Wt (kg)</th>
                    <th style={{ width: '13%', textAlign: 'right' }}>Est. Length (m)</th>
                    <th style={{ width: '6%', textAlign: 'center' }}>Joints</th>
                    <th style={{ width: '7%', textAlign: 'center' }}>Status / Action</th>
                  </tr>
                </thead>
                <tbody>
                  {masterRolls.map((roll, idx) => {
                    const isLocked = roll.isLocked;

                    return (
                      <tr 
                        key={roll.id} 
                        style={{ 
                          background: isLocked ? '#f8fafc' : '#ffffff',
                          opacity: isLocked ? 0.88 : 1
                        }}
                      >
                        <td style={{ textAlign: 'center', fontWeight: '800', color: isLocked ? '#64748b' : '#4f46e5' }}>
                          #{roll.rollIndex || idx + 1}
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input 
                              type="text" 
                              className="form-control" 
                              placeholder="Auto Barcode"
                              disabled={isLocked}
                              style={{ 
                                fontFamily: 'monospace', 
                                fontSize: '0.78rem', 
                                fontWeight: '700', 
                                padding: '3px 6px', 
                                width: '100%',
                                background: isLocked ? '#e2e8f0' : '#ffffff',
                                color: isLocked ? '#475569' : '#0f172a'
                              }}
                              value={roll.barcodeId}
                              onChange={e => handleUpdateRoll(idx, 'barcodeId', e.target.value)}
                            />
                            {isLocked && (
                              <span title="Barcode already generated - Locked" style={{ display: 'inline-flex', color: '#64748b' }}>
                                <Lock size={13} />
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Scale Gross Input & Button */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                            <input 
                              type="number" 
                              step="0.01" 
                              placeholder="0.00"
                              disabled={isLocked}
                              className="form-control" 
                              style={{ 
                                width: '85px', 
                                textAlign: 'right', 
                                fontWeight: '700', 
                                padding: '3px 5px', 
                                fontSize: '0.82rem', 
                                background: isLocked ? '#e2e8f0' : '#ffffff',
                                borderColor: !isLocked && !roll.grossWeightKg && formErrors.rolls ? '#ef4444' : undefined 
                              }}
                              value={roll.grossWeightKg}
                              onChange={e => handleUpdateRoll(idx, 'grossWeightKg', e.target.value)}
                              required={!isLocked}
                            />
                            {!isLocked && (
                              <WeighingScaleCaptureButton 
                                onWeightCapture={(captured) => handleUpdateRoll(idx, 'grossWeightKg', captured)}
                              />
                            )}
                          </div>
                        </td>

                        {/* Tare */}
                        <td style={{ textAlign: 'right' }}>
                          <input 
                            type="number" 
                            step="0.1" 
                            placeholder="0.0"
                            disabled={isLocked}
                            className="form-control" 
                            style={{ 
                              width: '55px', 
                              textAlign: 'right', 
                              padding: '3px 5px', 
                              fontSize: '0.8rem',
                              background: isLocked ? '#e2e8f0' : '#ffffff'
                            }}
                            value={roll.tareWeightKg}
                            onChange={e => handleUpdateRoll(idx, 'tareWeightKg', e.target.value)}
                          />
                        </td>

                        {/* Calculated Net */}
                        <td style={{ textAlign: 'right', fontWeight: '900', color: roll.netWeightKg > 0 ? (isLocked ? '#475569' : '#047857') : '#94a3b8', fontSize: '0.88rem' }}>
                          {roll.netWeightKg > 0 ? `${roll.netWeightKg.toFixed(2)} kg` : '—'}
                        </td>

                        {/* Length */}
                        <td style={{ textAlign: 'right', color: roll.lengthMeters > 0 ? (isLocked ? '#475569' : '#1e3a8a') : '#94a3b8', fontWeight: '700', fontSize: '0.8rem' }}>
                          {roll.lengthMeters > 0 ? `${roll.lengthMeters.toLocaleString()} m` : '—'}
                        </td>

                        {/* Splice / Joints */}
                        <td style={{ textAlign: 'center' }}>
                          <select 
                            className="form-control" 
                            disabled={isLocked}
                            style={{ width: '50px', padding: '2px 4px', fontSize: '0.75rem', background: isLocked ? '#e2e8f0' : '#ffffff' }}
                            value={roll.jointCount}
                            onChange={e => handleUpdateRoll(idx, 'jointCount', parseInt(e.target.value) || 0)}
                          >
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                          </select>
                        </td>

                        {/* Status / Delete */}
                        <td style={{ textAlign: 'center' }}>
                          {isLocked ? (
                            <span 
                              className="badge badge-neutral" 
                              style={{ fontSize: '0.68rem', padding: '2px 5px', background: '#e2e8f0', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                              title="Generated barcode locked. Only Admin can modify/delete from Inventory."
                            >
                              <Lock size={10} /> Saved
                            </span>
                          ) : (
                            <button 
                              type="button" 
                              className="btn-danger-action" 
                              style={{ padding: '3px 5px' }}
                              onClick={() => handleRemoveRollRow(idx)}
                              title="Remove this new roll"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
          <div style={{ background: newNetKg > 0 ? '#f0fdf4' : '#f8fafc', border: newNetKg > 0 ? '1.5px solid #86efac' : '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', textAlign: 'center' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>New Rolls to Weigh</span>
                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#047857' }}>
                  +{newRollsToSave.filter(r => parseFloat(r.grossWeightKg) > 0).length} / {newRollsToSave.length} Rolls
                </div>
                {existingLockedRolls.length > 0 && (
                  <span style={{ fontSize: '0.68rem', color: '#64748b' }}>({existingLockedRolls.length} previously saved)</span>
                )}
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>This Batch Gross</span>
                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: newGrossKg > 0 ? '#1e293b' : '#94a3b8' }}>
                  {newGrossKg > 0 ? `+${newGrossKg.toFixed(2)} kg` : '0.00 kg'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>This Batch Net Output</span>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', color: newNetKg > 0 ? '#047857' : '#94a3b8' }}>
                  {newNetKg > 0 ? `+${newNetKg.toFixed(2)} kg` : '0.00 kg'}
                </div>
                {existingLockedRolls.length > 0 && (
                  <span style={{ fontSize: '0.68rem', color: '#047857', fontWeight: '600' }}>
                    (Cumulative Job: {cumulativeNetKg.toFixed(1)} kg)
                  </span>
                )}
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>This Batch Est. Length</span>
                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: newMeters > 0 ? '#0284c7' : '#94a3b8' }}>
                  {newMeters > 0 ? `+${newMeters.toLocaleString()} m` : '0 m'}
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
              placeholder="Enter remarks e.g. Master roll added to job, visual inspection verified..."
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
                <Printer size={15} /> Save & Print New Roll Barcode Stickers ({newRollsToSave.length})
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
