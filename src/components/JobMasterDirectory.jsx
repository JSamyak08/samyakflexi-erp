import React, { useState, useMemo } from 'react';
import TablePagination, { usePagination } from './TablePagination';
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
  Paperclip,
  Filter,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Cpu,
  Repeat,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  GitBranch
} from 'lucide-react';
import { calculateUtilisation } from '../dataStore';
import { FILM_DENSITIES } from '../factoryStore';
import CylinderJobCardForm from '../CylinderJobCardForm';
import { saveJobMasterToSupabase, saveCylinderToSupabase } from '../services/supabaseDataService';

export default function JobMasterDirectory({ 
  urlParams = {},
  jobMasters = [], 
  cylinders = [], 
  productionRecords = [], 
  orders = [],
  clients = [],
  machines = [],
  currentUser,
  onAddJobMaster,
  onAddCylinder,
  onAddClient,
  onPunchOrderFromJobMaster,
  onUpdateJobMaster,
  onDeleteJobMaster
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState(null);
  const [activeJobCardData, setActiveJobCardData] = useState(null);

  // Auto-select job master if unique id is present in URL params
  React.useEffect(() => {
    if (urlParams && urlParams.id && jobMasters && jobMasters.length > 0) {
      const match = jobMasters.find(j => 
        j.id === urlParams.id || 
        j.skuCode === urlParams.id || 
        (j.jobName && j.jobName.toLowerCase().includes(urlParams.id.toLowerCase()))
      );
      if (match) {
        setSelectedJob(match);
      }
    }
  }, [urlParams?.id, jobMasters]);

  // Sync browser URL whenever selectedJob changes
  const handleSelectJob = (job) => {
    setSelectedJob(job);
    if (job) {
      pushSlugState('job_masters', { id: job.id });
    } else {
      pushSlugState('job_masters');
    }
  };

  // Filter States for Job Masters Technical Directory
  const [clientFilter, setClientFilter] = useState('ALL');
  const [substrateFilter, setSubstrateFilter] = useState('ALL');
  const [layerCountFilter, setLayerCountFilter] = useState('ALL');
  const [colorsFilter, setColorsFilter] = useState('ALL');
  const [costBorneFilter, setCostBorneFilter] = useState('ALL');

  // Form State for New Job Master
  const [jobName, setJobName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  // Press Marks & Quality Guidelines Form State
  const [silLogo, setSilLogo] = useState("Yes - 'Pkg Material Mfg by - Samyak International Ltd'");
  const [arcMark, setArcMark] = useState('Yes');
  const [slittingMark, setSlittingMark] = useState('Yes');
  const [trackerLine, setTrackerLine] = useState('Yes');
  const [specialInstructions, setSpecialInstructions] = useState('');

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
  const [faceLengthMm, setFaceLengthMm] = useState('1050');
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

    setClientName(newClientName.trim());
    setIsClientDropdownOpen(false);
    setIsOnboardModalOpen(false);
    setOnboardSuccessNotice(`Client "${newClientName.trim()}" onboarded and selected!`);
    setTimeout(() => setOnboardSuccessNotice(''), 4000);

    // Clear onboarding form
    setNewClientName('');
    setNewContactPerson('');
    setNewPhone('');
    setNewEmail('');
    setNewGstin('');
    setNewAddress('');
  };
  
  // Unique available film types for multi-layer structure builder
  const availableFilmTypes = useMemo(() => Object.keys(FILM_DENSITIES), []);

  const [colorsCount, setColorsCount] = useState(6);
  const [createCylinder, setCreateCylinder] = useState(true);
  const [layers, setLayers] = useState([
    { id: 1, filmType: 'PET', micron: 12 },
    { id: 2, filmType: 'METPET', micron: 12 },
    { id: 3, filmType: 'Natural GP LD', micron: 35 }
  ]);
  const [cylinderCost, setCylinderCost] = useState('');
  const [costBorneBy, setCostBorneBy] = useState('Client (100%)');
  const [engravuresName, setEngravuresName] = useState('');
  const [utilisationLimit, setUtilisationLimit] = useState(10000);
  const [processRouting, setProcessRouting] = useState([]);

  // Helper: Auto-generate Process Routing based on layers and available machinery
  const generateDefaultRouting = (layersList = layers, availableMachines = machines) => {
    const list = Array.isArray(layersList) && layersList.length > 0 ? layersList : [
      { id: 1, filmType: 'PET', micron: 12 },
      { id: 2, filmType: 'METPET', micron: 12 },
      { id: 3, filmType: 'Natural GP LD', micron: 35 }
    ];
    
    // Find machinery matching type or default from Settings
    const rotoMachine = (availableMachines || []).find(m => (m.type || '').toLowerCase().includes('roto') || (m.name || '').toLowerCase().includes('roto') || (m.type || '').toLowerCase().includes('print')) || (availableMachines || [])[0] || { id: 'MAC-ROTO-1', name: 'Rotogravure Press 1', type: 'Rotogravure', maxSpeedMpm: 250 };
    const lamMachine = (availableMachines || []).find(m => (m.type || '').toLowerCase().includes('lam') || (m.name || '').toLowerCase().includes('lam')) || (availableMachines || [])[1] || { id: 'MAC-LAM-1', name: 'Solventless Laminator 1', type: 'Lamination', maxSpeedMpm: 300 };
    const slitMachine = (availableMachines || []).find(m => (m.type || '').toLowerCase().includes('slit') || (m.name || '').toLowerCase().includes('slit')) || (availableMachines || [])[2] || { id: 'MAC-SLIT-1', name: 'High Speed Slitter 1', type: 'Slitting', maxSpeedMpm: 400 };

    const routing = [];
    let stepNo = 1;

    // 1. Printing Operation (Pass 1)
    routing.push({
      id: `step-${Date.now()}-${stepNo}`,
      stepNumber: stepNo++,
      operation: 'Rotogravure Printing (Reverse)',
      machineId: rotoMachine.id || 'MAC-ROTO-1',
      machineName: rotoMachine.name || 'Rotogravure Press',
      machineType: rotoMachine.type || 'Rotogravure',
      pass: 'Pass 1 (Single Pass)',
      stageOutput: 'Semi-Finished Goods (SFG)',
      stageDescription: `SFG - Printed Web (${list[0]?.filmType || 'PET'} ${list[0]?.micron || 12}µ)`,
      targetSpeedMpm: rotoMachine.maxSpeedMpm || 250,
      notes: 'Ensure accurate eyemark & reverse printing registration.'
    });

    // 2. Multi-Pass Lamination based on layers count
    if (list.length >= 2) {
      // First Pass: Layer 1 + Layer 2
      routing.push({
        id: `step-${Date.now()}-${stepNo}`,
        stepNumber: stepNo++,
        operation: 'Solventless Lamination',
        machineId: lamMachine.id || 'MAC-LAM-1',
        machineName: lamMachine.name || 'Solventless Laminator',
        machineType: lamMachine.type || 'Lamination',
        pass: 'Pass 1 (Layer 1 + Layer 2)',
        stageOutput: 'Semi-Finished Goods (SFG)',
        stageDescription: `SFG - 2-Ply Laminate (${list[0]?.filmType || 'L1'} + ${list[1]?.filmType || 'L2'})`,
        targetSpeedMpm: lamMachine.maxSpeedMpm || 280,
        notes: list.length > 2 ? 'Allow 12-24h curing before secondary lamination pass.' : 'Standard curing before slitting.'
      });
    }

    if (list.length >= 3) {
      // Second Pass: 2-Ply + Layer 3 (Triplex structure)
      routing.push({
        id: `step-${Date.now()}-${stepNo}`,
        stepNumber: stepNo++,
        operation: 'Solventless Lamination',
        machineId: lamMachine.id || 'MAC-LAM-1',
        machineName: lamMachine.name || 'Solventless Laminator',
        machineType: lamMachine.type || 'Lamination',
        pass: 'Pass 2 (2-Ply + Layer 3)',
        stageOutput: 'Semi-Finished Goods (SFG)',
        stageDescription: `SFG - 3-Ply Triplex Laminate (${list.map(l => l.filmType).join(' + ')})`,
        targetSpeedMpm: lamMachine.maxSpeedMpm || 260,
        notes: 'Final triplex curing before slitting/pouching.'
      });
    }

    if (list.length >= 4) {
      // Third Pass: 3-Ply + Layer 4 (Quadplex structure)
      routing.push({
        id: `step-${Date.now()}-${stepNo}`,
        stepNumber: stepNo++,
        operation: 'Solventless Lamination',
        machineId: lamMachine.id || 'MAC-LAM-1',
        machineName: lamMachine.name || 'Solventless Laminator',
        machineType: lamMachine.type || 'Lamination',
        pass: 'Pass 3 (3-Ply + Layer 4)',
        stageOutput: 'Semi-Finished Goods (SFG)',
        stageDescription: 'SFG - 4-Ply Quadplex Laminate',
        targetSpeedMpm: lamMachine.maxSpeedMpm || 240,
        notes: 'Quadplex curing sequence.'
      });
    }

    // 3. Slitting & Rewinding
    routing.push({
      id: `step-${Date.now()}-${stepNo}`,
      stepNumber: stepNo++,
      operation: 'Slitting & Rewinding',
      machineId: slitMachine.id || 'MAC-SLIT-1',
      machineName: slitMachine.name || 'High Speed Slitter',
      machineType: slitMachine.type || 'Slitting',
      pass: 'Single Pass',
      stageOutput: 'Semi-Finished Goods (SFG)',
      stageDescription: 'SFG - Slit Rolls / Inspection Passed',
      targetSpeedMpm: slitMachine.maxSpeedMpm || 400,
      notes: 'Trim width check, tension control, core alignment.'
    });

    // 4. Final Packing & Dispatch stage
    routing.push({
      id: `step-${Date.now()}-${stepNo}`,
      stepNumber: stepNo++,
      operation: 'Final Inspection & Dispatch',
      machineId: 'MANUAL-PACKING',
      machineName: 'Dispatch & Packing Bay',
      machineType: 'Packing / QC',
      pass: 'Final Stage',
      stageOutput: 'Finished Goods (FG)',
      stageDescription: 'Finished Goods (FG) - Ready for Client Dispatch',
      targetSpeedMpm: 0,
      notes: 'QC CoA verification, roll stretch wrapping, barcode labeling.'
    });

    return routing;
  };

  const handleAddRoutingStep = () => {
    const nextStepNo = processRouting.length + 1;
    const defaultMac = (machines && machines.length > 0) ? machines[0] : { id: 'MAC-ROTO-1', name: 'Rotogravure Press 1', type: 'Rotogravure', maxSpeedMpm: 250 };
    setProcessRouting(prev => [
      ...prev,
      {
        id: `step-${Date.now()}-${nextStepNo}`,
        stepNumber: nextStepNo,
        operation: 'Rotogravure Printing (Reverse)',
        machineId: defaultMac.id,
        machineName: defaultMac.name,
        machineType: defaultMac.type || 'General',
        pass: 'Single Pass',
        stageOutput: 'Semi-Finished Goods (SFG)',
        stageDescription: 'SFG - Intermediate Process Web',
        targetSpeedMpm: defaultMac.maxSpeedMpm || 200,
        notes: ''
      }
    ]);
  };

  const handleRemoveRoutingStep = (stepId) => {
    if (processRouting.length <= 1) {
      alert("At least 1 process routing step is required!");
      return;
    }
    setProcessRouting(prev => {
      const filtered = prev.filter(s => s.id !== stepId);
      return filtered.map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
    });
  };

  const handleMoveRoutingStep = (idx, direction) => {
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === processRouting.length - 1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    setProcessRouting(prev => {
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    });
  };

  const handleUpdateRoutingStep = (stepId, field, value) => {
    setProcessRouting(prev => prev.map(s => {
      if (s.id !== stepId) return s;
      const updated = { ...s, [field]: value };
      if (field === 'machineId') {
        const found = (machines || []).find(m => m.id === value);
        if (found) {
          updated.machineName = found.name;
          updated.machineType = found.type || 'General';
          if (!updated.targetSpeedMpm || updated.targetSpeedMpm === 0) {
            updated.targetSpeedMpm = found.maxSpeedMpm || 200;
          }
        }
      }
      return updated;
    }));
  };

  const filteredJobMasters = useMemo(() => {
    if (!jobMasters) return [];
    return jobMasters.filter(j => {
      // 1. Search Query Filter
      const search = (searchTerm || '').toLowerCase().trim();
      if (search) {
        const matchName = (j.jobName || '').toLowerCase().includes(search);
        const matchId = (j.id || '').toLowerCase().includes(search);
        const matchSku = (j.skuCode || j.sku || j.cylinderSku || '').toLowerCase().includes(search);
        const matchClient = (j.clientName || '').toLowerCase().includes(search);
        const matchStructure = (j.structure || '').toLowerCase().includes(search);
        if (!matchName && !matchId && !matchSku && !matchClient && !matchStructure) return false;
      }

      // 2. Client Filter
      if (clientFilter !== 'ALL') {
        if ((j.clientName || '').toLowerCase().trim() !== clientFilter.toLowerCase().trim()) return false;
      }

      // 3. Substrate / Film Filter
      if (substrateFilter !== 'ALL') {
        const subSearch = substrateFilter.toLowerCase();
        const hasFilmInLayers = (j.layers || []).some(l => (l.filmType || '').toLowerCase().includes(subSearch));
        const hasFilmInStructure = (j.structure || '').toLowerCase().includes(subSearch);
        if (!hasFilmInLayers && !hasFilmInStructure) return false;
      }

      // 4. Layer Count Filter
      if (layerCountFilter !== 'ALL') {
        const count = j.layers ? j.layers.length : (j.structure ? j.structure.split('/').length : 0);
        if (layerCountFilter === '2' && count !== 2) return false;
        if (layerCountFilter === '3' && count !== 3) return false;
        if (layerCountFilter === '4+' && count < 4) return false;
      }

      // 5. Colors Filter
      if (colorsFilter !== 'ALL') {
        const colors = parseInt(j.colorsCount || 0, 10);
        if (colorsFilter === '1-4' && (colors < 1 || colors > 4)) return false;
        if (colorsFilter === '5-7' && (colors < 5 || colors > 7)) return false;
        if (colorsFilter === '8+' && colors < 8) return false;
      }

      // 6. Cost Borne By Filter
      if (costBorneFilter !== 'ALL') {
        const costStr = (j.costBorneBy || '').toLowerCase();
        if (costBorneFilter === 'client' && !costStr.includes('client')) return false;
        if (costBorneFilter === 'us' && !costStr.includes('us')) return false;
        if (costBorneFilter === 'both' && !costStr.includes('both')) return false;
      }

      return true;
    });
  }, [jobMasters, searchTerm, clientFilter, substrateFilter, layerCountFilter, colorsFilter, costBorneFilter]);

  const jobsPagination = usePagination(filteredJobMasters, 50);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim()) count++;
    if (clientFilter !== 'ALL') count++;
    if (substrateFilter !== 'ALL') count++;
    if (layerCountFilter !== 'ALL') count++;
    if (colorsFilter !== 'ALL') count++;
    if (costBorneFilter !== 'ALL') count++;
    return count;
  }, [searchTerm, clientFilter, substrateFilter, layerCountFilter, colorsFilter, costBorneFilter]);

  const resetAllFilters = () => {
    setSearchTerm('');
    setClientFilter('ALL');
    setSubstrateFilter('ALL');
    setLayerCountFilter('ALL');
    setColorsFilter('ALL');
    setCostBorneFilter('ALL');
  };

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
    // Only check actual job master SKU codes, excluding the job currently being edited
    const existsInJobs = (jobMasters || []).some(j => 
      j.id !== editingJobId && 
      ((j.skuCode || j.sku || '').toLowerCase() === code)
    );
    return existsInJobs;
  }, [skuCode, jobMasters, editingJobId]);

  const handleConfirmDeleteJobMaster = (job) => {
    if (!job) return;
    if (window.confirm(`Are you sure you want to delete Job Master "${job.jobName}" (${job.skuCode || job.id})?\n\nThis action cannot be undone.`)) {
      if (onDeleteJobMaster) {
        onDeleteJobMaster(job.id);
      }
      if (selectedJob && selectedJob.id === job.id) {
        setSelectedJob(null);
      }
      alert(`Job Master "${job.jobName}" deleted successfully.`);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingJobId(null);
    setSkuCode(getNextSerialSkuCode());
    setJobName('');
    setClientName('');
    setPrintWidthMm('1000');
    setFaceLengthMm('1050');
    setRepeatLengthMm('400');
    setPouchOpenWidth('120');
    setPouchHeight('150');
    setColorsCount(6);
    setCylinderCost('35000');
    setCostBorneBy('Client (100%)');
    setUtilisationLimit(10000);
    setSilLogo("Yes - 'Pkg Material Mfg by - Samyak International Ltd'");
    setArcMark('Yes');
    setSlittingMark('Yes');
    setTrackerLine('Yes');
    setSpecialInstructions('');
    const defaultFilm = availableFilmTypes[0] || 'PET';
    const initLayers = [
      { id: Date.now(), filmType: defaultFilm, micron: 12 },
      { id: Date.now()+1, filmType: availableFilmTypes[1] || 'METPET', micron: 12 },
      { id: Date.now()+2, filmType: availableFilmTypes[2] || 'Natural GP LD', micron: 35 }
    ];
    setLayers(initLayers);
    setProcessRouting(generateDefaultRouting(initLayers, machines));
    setIsCreateModalOpen(true);
  };

  // Helper: Parse structure string into layers array if job.layers is empty
  const parseStructureToLayers = (structureStr) => {
    if (!structureStr || structureStr === '—') return null;
    const parts = String(structureStr).split('/').map(p => p.trim());
    if (parts.length === 0) return null;

    return parts.map((part, idx) => {
      const micronMatch = part.match(/(\d+(\.\d+)?)\s*µ?/i);
      const micron = micronMatch ? parseFloat(micronMatch[1]) : 12;
      let rawType = part.replace(/(\d+(\.\d+)?)\s*µ?/gi, '').trim().toLowerCase();

      let matchedFilm = availableFilmTypes.find(f => f.toLowerCase() === rawType);
      if (!matchedFilm) {
        matchedFilm = availableFilmTypes.find(f => rawType.includes(f.toLowerCase()) || f.toLowerCase().includes(rawType));
      }
      if (!matchedFilm) {
        if (rawType.includes('metpet')) matchedFilm = 'METPET';
        else if (rawType.includes('pet')) matchedFilm = 'PET';
        else if (rawType.includes('matte') || rawType.includes('matt')) matchedFilm = 'Matte Finish BOPP';
        else if (rawType.includes('pearl')) matchedFilm = 'Pearlised BOPP';
        else if (rawType.includes('met') && rawType.includes('bopp')) matchedFilm = 'Metalised BOPP';
        else if (rawType.includes('atta')) matchedFilm = 'Milky Atta (High Dart) Film';
        else if (rawType.includes('metallocene')) matchedFilm = 'Natural LD Metallocene Film';
        else if (rawType.includes('ld')) matchedFilm = 'Natural LD GP Film';
        else if (rawType.includes('bopp')) matchedFilm = 'BOPP Natural';
        else if (rawType.includes('cpp')) matchedFilm = 'CPP Natural';
        else matchedFilm = availableFilmTypes[0] || 'PET';
      }

      return {
        id: Date.now() + idx,
        filmType: matchedFilm,
        micron: micron
      };
    });
  };

  const handleOpenEditModal = (job) => {
    setEditingJobId(job.id);
    setSkuCode(job.skuCode || '');
    setJobName(job.jobName || '');
    setClientName(job.clientName || '');
    setPrintWidthMm(job.printWidthMm ? String(job.printWidthMm) : '1000');
    setFaceLengthMm(job.faceLengthMm ? String(job.faceLengthMm) : (job.printWidthMm ? String(job.printWidthMm) : '1050'));
    setRepeatLengthMm(job.repeatLengthMm ? String(job.repeatLengthMm) : '400');
    setPouchOpenWidth(job.pouchOpenWidth ? String(job.pouchOpenWidth) : '120');
    setPouchHeight(job.pouchHeight ? String(job.pouchHeight) : '150');
    setColorsCount(job.colorsCount || 6);
    setCylinderCost(job.cylinderCost ? String(job.cylinderCost).replace(/[^0-9]/g, '') : '');
    setCostBorneBy(job.costBorneBy || 'Client (100%)');
    setEngravuresName(job.engravuresName || '');
    setUtilisationLimit(job.utilisationLimit || 10000);
    setSilLogo(job.silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'");
    setArcMark(job.arcMark || 'Yes');
    setSlittingMark(job.slittingMark || 'Yes');
    setTrackerLine(job.trackerLine || 'Yes');
    setSpecialInstructions(job.specialInstructions || '');
    
    let currentLayers = [];
    if (job.layers && job.layers.length > 0) {
      currentLayers = job.layers.map((l, idx) => ({ ...l, id: l.id || Date.now() + idx }));
      setLayers(currentLayers);
    } else if (job.structure) {
      const parsed = parseStructureToLayers(job.structure);
      if (parsed && parsed.length > 0) {
        currentLayers = parsed;
        setLayers(parsed);
      }
    }

    if (job.processRouting && job.processRouting.length > 0) {
      setProcessRouting(job.processRouting.map((s, idx) => ({ ...s, id: s.id || `step-${Date.now()}-${idx}` })));
    } else {
      setProcessRouting(generateDefaultRouting(currentLayers, machines));
    }
    setIsCreateModalOpen(true);
  };

  const handleCreateJobMaster = async (e) => {
    e.preventDefault();
    if (!jobName.trim() || !clientName.trim() || !skuCode.trim()) {
      alert("Job Name, Client Name, and SKU Code are required!");
      return;
    }

    if (!layers || layers.length === 0 || layers.some(l => !l.filmType || !l.micron || parseFloat(l.micron) <= 0)) {
      alert("Substrate Structure / Layers (Film Type & Micron Gauge) is a mandatory entry in Job Master! Please specify valid film type and micron for all layers.");
      return;
    }

    if (!editingJobId && isSkuDuplicate) {
      alert(`SKU Code "${skuCode.trim()}" is already in use! Please enter or generate a unique SKU Code.`);
      return;
    }

    const structureSummary = layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ');
    
    if (editingJobId) {
      const existingJob = jobMasters.find(j => j.id === editingJobId) || {};
      const updatedJobMaster = {
        ...existingJob,
        skuCode: skuCode.trim(),
        jobName: jobName.trim(),
        clientName: clientName.trim(),
        structure: structureSummary,
        printWidthMm: parseFloat(printWidthMm) || 1000,
        faceLengthMm: parseFloat(faceLengthMm) || 1050,
        repeatLengthMm: parseFloat(repeatLengthMm) || 400,
        pouchOpenWidth: parseFloat(pouchOpenWidth) || 0,
        pouchHeight: parseFloat(pouchHeight) || 0,
        layers,
        processRouting: Array.isArray(processRouting) && processRouting.length > 0 ? processRouting : generateDefaultRouting(layers, machines),
        cylinderSku: skuCode.trim(),
        cylinderCost: `₹ ${parseInt(cylinderCost || 0).toLocaleString()}`,
        colorsCount: parseInt(colorsCount) || 6,
        engravuresName,
        costBorneBy,
        utilisationLimit: parseFloat(utilisationLimit) || 10000,
        silLogo: silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
        arcMark: arcMark || 'Yes',
        slittingMark: slittingMark || 'Yes',
        trackerLine: trackerLine || 'Yes',
        specialInstructions: specialInstructions || ''
      };

      if (onUpdateJobMaster) await onUpdateJobMaster(updatedJobMaster);
      setIsCreateModalOpen(false);
      setSelectedJob(updatedJobMaster);
      alert(`Job Master ${updatedJobMaster.id} updated successfully!`);
      return;
    }

    const jobMasterId = `JM-2026-${String((jobMasters ? jobMasters.length : 0) + 101).padStart(3, '0')}`;

    const newJobMaster = {
      id: jobMasterId,
      skuCode: skuCode.trim(),
      jobName: jobName.trim(),
      clientName: clientName.trim(),
      structure: structureSummary,
      printWidthMm: parseFloat(printWidthMm) || 1000,
      faceLengthMm: parseFloat(faceLengthMm) || 1050,
      repeatLengthMm: parseFloat(repeatLengthMm) || 400,
      pouchOpenWidth: parseFloat(pouchOpenWidth) || 0,
      pouchHeight: parseFloat(pouchHeight) || 0,
      layers,
      processRouting: Array.isArray(processRouting) && processRouting.length > 0 ? processRouting : generateDefaultRouting(layers, machines),
      cylinderSku: skuCode.trim(),
      cylinderCost: `₹ ${parseInt(cylinderCost || 0).toLocaleString()}`,
      colorsCount: parseInt(colorsCount) || 6,
      engravuresName,
      costBorneBy,
      utilisationLimit: parseFloat(utilisationLimit) || 10000,
      silLogo: silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
      arcMark: arcMark || 'Yes',
      slittingMark: slittingMark || 'Yes',
      trackerLine: trackerLine || 'Yes',
      specialInstructions: specialInstructions || '',
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
        faceLengthMm: parseFloat(faceLengthMm) || 1050,
        printWidthMm: parseFloat(printWidthMm) || 1000,
        layer1PrintedQtyKg: 0,
        dispatchedQty: 0,
        utilisationLimit: parseFloat(utilisationLimit) || 10000,
        status: 'Active In-Use',
        silLogo: silLogo || "Yes - 'Pkg Material Mfg by - Samyak International Ltd'",
        arcMark: arcMark || 'Yes',
        slittingMark: slittingMark || 'Yes',
        trackerLine: trackerLine || 'Yes',
        specialInstructions: specialInstructions || ''
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
      printWidthMm: job.printWidthMm || 1000,
      faceLengthMm: job.faceLengthMm || job.printWidthMm || 1050,
      repeatLengthMm: job.repeatLengthMm,
      circumferenceMm: job.repeatLengthMm,
      pouchOpenWidth: job.pouchOpenWidth,
      pouchHeight: job.pouchHeight,
      structure: job.structure,
      layers: job.layers || [],
      colorsCount: job.colorsCount || (linkedCyl ? linkedCyl.colorsCount : 6),
      cylinderCost: job.cylinderCost || (linkedCyl ? linkedCyl.cylinderCost : ''),
      engravuresName: job.engravuresName || (linkedCyl ? linkedCyl.engravuresName : ''),
      costBorneBy: job.costBorneBy || (linkedCyl ? linkedCyl.costBorneBy : 'Client (100%)'),
      creationDate: job.creationDate || new Date().toLocaleDateString('en-GB'),
      jobCardFileUrl: job.jobCardFileUrl || job.artworkUrl || '',
      artworkUrl: job.jobCardFileUrl || job.artworkUrl || '',
      silLogo: job.silLogo || (linkedCyl ? linkedCyl.silLogo : "Yes - 'Pkg Material Mfg by - Samyak International Ltd'"),
      arcMark: job.arcMark || (linkedCyl ? linkedCyl.arcMark : 'Yes'),
      slittingMark: job.slittingMark || (linkedCyl ? linkedCyl.slittingMark : 'Yes'),
      trackerLine: job.trackerLine || (linkedCyl ? linkedCyl.trackerLine : 'Yes'),
      specialInstructions: job.specialInstructions || (linkedCyl ? linkedCyl.specialInstructions : ''),
      chkEyemark: job.chkEyemark ?? (linkedCyl?.chkEyemark ?? false),
      chkBarcode: job.chkBarcode ?? (linkedCyl?.chkBarcode ?? false),
      chkOrientation: job.chkOrientation ?? (linkedCyl?.chkOrientation ?? false),
      chkClientApproval: job.chkClientApproval ?? (linkedCyl?.chkClientApproval ?? false),
      approvedByHead: job.approvedByHead ?? (linkedCyl?.approvedByHead ?? false),
      approvedHeadName: job.approvedHeadName || (linkedCyl?.approvedHeadName || ''),
      approvedHeadDate: job.approvedHeadDate || (linkedCyl?.approvedHeadDate || ''),
      variant: job.variant || 'Standard',
      printing: job.printing || 'Reverse',
      invoiceTo: job.invoiceTo || 'Samyak International Ltd',
      shellSize: job.shellSize || '',
      petSize: job.petSize || ''
    };
    setActiveJobCardData(cardData);
  };

  const handleSaveJobCardData = (updatedData, targetJobMaster, targetCylinder) => {
    const targetJob = targetJobMaster || selectedJob || jobMasters.find(j => j.id === updatedData.jobMasterId || j.skuCode === updatedData.skuCode);
    if (!targetJob) return;

    const fileUrl = updatedData.artworkUrl || updatedData.jobCardFileUrl || targetJob.jobCardFileUrl || '';
    const updatedJob = {
      ...targetJob,
      ...updatedData,
      jobCardFileUrl: fileUrl,
      artworkUrl: fileUrl,
      jobCardFileName: fileUrl ? (targetJob.jobCardFileName || 'Artwork_KLD_Proof.pdf') : null
    };

    if (selectedJob && selectedJob.id === updatedJob.id) {
      setSelectedJob(updatedJob);
    }
    if (activeJobCardData) {
      setActiveJobCardData(prev => ({ ...prev, ...updatedJob }));
    }
    if (onUpdateJobMaster) {
      onUpdateJobMaster(updatedJob);
    } else if (onAddJobMaster) {
      onAddJobMaster(updatedJob);
    }

    try {
      const updatedJobs = jobMasters.map(j => j.id === updatedJob.id ? updatedJob : j);
      localStorage.setItem('samyak_erp_job_masters', JSON.stringify(updatedJobs));
    } catch (e) {}

    saveJobMasterToSupabase(updatedJob);
    if (targetCylinder) {
      saveCylinderToSupabase(targetCylinder);
    }
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
        artworkUrl: fileUrl,
        jobCardUploadDate: new Date().toLocaleDateString('en-IN')
      };

      setSelectedJob(updatedJob);
      if (onAddJobMaster) onAddJobMaster(updatedJob);
      try {
        localStorage.setItem('samyak_erp_job_masters', JSON.stringify(jobMasters.map(j => j.id === updatedJob.id ? updatedJob : j)));
      } catch (err) {}
      saveJobMasterToSupabase(updatedJob);
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
      artworkUrl: null,
      jobCardUploadDate: null
    };

    setSelectedJob(updatedJob);
    if (onAddJobMaster) onAddJobMaster(updatedJob);
    try {
      localStorage.setItem('samyak_erp_job_masters', JSON.stringify(jobMasters.map(j => j.id === updatedJob.id ? updatedJob : j)));
    } catch (err) {}
    saveJobMasterToSupabase(updatedJob);
  };

  const renderJobMasterModals = () => (
    <>
      {/* CREATE / EDIT JOB MASTER MODAL */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content" style={{ width: '820px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCode size={20} style={{ color: 'var(--primary-brand)' }} />
                {editingJobId ? 'Edit Job Master' : 'Create New Job Master'}
              </h3>
              <button className="btn-secondary" style={{ padding: '4px' }} onClick={() => setIsCreateModalOpen(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateJobMaster}>
              <div className="form-grid">
                {/* SKU Code */}
                <div>
                  <label className="form-label">SKU Code *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={skuCode}
                    onChange={e => setSkuCode(e.target.value.toUpperCase())}
                    required
                    disabled={!!editingJobId}
                    style={editingJobId ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {}}
                  />
                  {isSkuDuplicate && (
                    <div style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: '700', marginTop: '4px' }}>
                      ⚠️ SKU Code "{skuCode}" already exists! Must be unique.
                    </div>
                  )}
                </div>

                {/* Job Name */}
                <div className="form-group">
                  <label>Job Name *</label>
                  <input type="text" className="form-control" required value={jobName} onChange={e => setJobName(e.target.value)} />
                </div>

                {/* Client Name with Dropdown */}
                <div className="form-group" style={{ gridColumn: 'span 2', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontWeight: '700', fontSize: '0.85rem' }}>Client Name *</label>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '3px 10px', fontSize: '0.75rem', color: '#047857', borderColor: '#a7f3d0', background: '#ecfdf5', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '700' }}
                      onClick={() => setIsOnboardModalOpen(true)}
                    >
                      <Plus size={13} /> Onboard New Client
                    </button>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Type to search or select a client..."
                        required
                        value={clientName}
                        onChange={e => { setClientName(e.target.value); setClientSearchTerm(e.target.value); setIsClientDropdownOpen(true); }}
                        onFocus={() => setIsClientDropdownOpen(true)}
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ marginLeft: '6px', padding: '6px 10px', whiteSpace: 'nowrap' }}
                        onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                      >
                        {isClientDropdownOpen ? '▲ Hide' : '▼ List All'}
                      </button>
                    </div>
                    {isClientDropdownOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                        background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px',
                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxHeight: '220px', overflowY: 'auto', marginTop: '4px'
                      }}>
                        <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                          <input
                            type="text"
                            className="form-control"
                            style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                            placeholder="Filter clients..."
                            value={clientSearchTerm}
                            onChange={e => setClientSearchTerm(e.target.value)}
                            autoFocus
                          />
                        </div>
                        {filteredClients.length > 0 ? (
                          filteredClients.map(c => (
                            <div
                              key={c.name}
                              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid #f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                              onClick={() => { setClientName(c.name); setIsClientDropdownOpen(false); }}
                            >
                              <span style={{ fontWeight: '600', color: '#0f172a' }}>{c.name}</span>
                              {c.gstin && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>GST: {c.gstin}</span>}
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: '12px', fontSize: '0.8rem', color: '#64748b', textAlign: 'center' }}>
                            No client found matching "{clientSearchTerm}".
                            <button
                              type="button"
                              style={{ display: 'block', margin: '6px auto 0', color: 'var(--primary-brand)', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontWeight: '700' }}
                              onClick={() => { setNewClientName(clientSearchTerm); setIsOnboardModalOpen(true); setIsClientDropdownOpen(false); }}
                            >
                              + Quick Onboard "{clientSearchTerm}"
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dimensions: Separate Inputs for Print Width and Face Length */}
                <div className="form-group">
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontWeight: '700' }}>Print Width (PET Size) (mm) *</span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'normal' }}>Used for substrate raw material ordering & slitting</span>
                  </label>
                  <input 
                    type="number" 
                    className="form-control" 
                    required 
                    value={printWidthMm} 
                    onChange={e => setPrintWidthMm(e.target.value)} 
                    placeholder="e.g. 1000"
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontWeight: '700' }}>Face Length (Shell) (mm) *</span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'normal' }}>Used for cylinder records & cost calculations</span>
                  </label>
                  <input 
                    type="number" 
                    className="form-control" 
                    required 
                    value={faceLengthMm} 
                    onChange={e => setFaceLengthMm(e.target.value)} 
                    placeholder="e.g. 1050"
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontWeight: '700' }}>Repeat Length / Circumference (mm) *</span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'normal' }}>Printing repeat cylinder circumference</span>
                  </label>
                  <input 
                    type="number" 
                    className="form-control" 
                    required 
                    value={repeatLengthMm} 
                    onChange={e => setRepeatLengthMm(e.target.value)} 
                    placeholder="e.g. 400"
                  />
                </div>

                <div className="form-group">
                  <label>Pouch Open Width (mm)</label>
                  <input type="number" className="form-control" value={pouchOpenWidth} onChange={e => setPouchOpenWidth(e.target.value)} placeholder="e.g. 120" />
                </div>
                <div className="form-group">
                  <label>Pouch Height (mm)</label>
                  <input type="number" className="form-control" value={pouchHeight} onChange={e => setPouchHeight(e.target.value)} placeholder="e.g. 150" />
                </div>

                {/* Multi-Layer Substrate */}
                <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>Substrate Structure (Laminate Layers) <span style={{ color: '#dc2626' }}>*</span></strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        Summary: <code style={{ fontWeight: '700', color: '#0f172a' }}>{layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ')}</code>
                      </div>
                    </div>
                    <button type="button" className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={addLayer}>
                      <Plus size={14} /> Add Layer
                    </button>
                  </div>
                  {layers.map((l, idx) => (
                    <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 32px', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Layer {idx + 1}</span>
                      <select className="form-control" style={{ padding: '4px 8px', fontSize: '0.85rem' }} value={l.filmType} onChange={e => setLayers(prev => prev.map(item => item.id === l.id ? { ...item, filmType: e.target.value } : item))}>
                        {availableFilmTypes.map(f => <option key={f} value={f}>{f} ({FILM_DENSITIES[f]} g/cc)</option>)}
                      </select>
                      <input type="number" className="form-control" style={{ padding: '4px 8px', fontSize: '0.85rem' }} value={l.micron} onChange={e => setLayers(prev => prev.map(item => item.id === l.id ? { ...item, micron: parseFloat(e.target.value) || 0 } : item))} placeholder="Microns" />
                      {layers.length > 1 && <button type="button" className="btn-secondary" style={{ padding: '4px' }} onClick={() => removeLayer(l.id)}><X size={14} /></button>}
                    </div>
                  ))}
                </div>

                {/* Process Routing & Machine Sequence (SFG Tracking) */}
                <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Cpu size={16} style={{ color: 'var(--primary-brand)' }} /> Process Routing & Machine Sequence
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        Sequence of machinery and multi-pass operations. Material is classified as <strong>Semi-Finished Goods (SFG)</strong> until final dispatch.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        type="button" 
                        className="btn-secondary" 
                        style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }} 
                        onClick={() => setProcessRouting(generateDefaultRouting(layers, machines))}
                        title="Auto-configure lamination passes and machines based on active layers"
                      >
                        <Sparkles size={13} style={{ color: '#d97706' }} /> Auto-Suggest from Layers
                      </button>
                      <button 
                        type="button" 
                        className="btn-secondary" 
                        style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }} 
                        onClick={handleAddRoutingStep}
                      >
                        <Plus size={13} /> Add Operation / Pass
                      </button>
                    </div>
                  </div>

                  {processRouting.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', background: '#ffffff', borderRadius: '6px', border: '1px dashed #cbd5e1', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      No process routing steps configured. Click <strong>Auto-Suggest from Layers</strong> to generate standard passes.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {processRouting.map((step, idx) => (
                        <div 
                          key={step.id || idx} 
                          style={{ 
                            background: '#ffffff', 
                            border: '1px solid #e2e8f0', 
                            borderRadius: '8px', 
                            padding: '12px 14px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ 
                                width: '24px', 
                                height: '24px', 
                                borderRadius: '50%', 
                                background: step.stageOutput === 'Finished Goods (FG)' ? '#047857' : 'var(--primary-brand)', 
                                color: '#ffffff', 
                                fontSize: '0.75rem', 
                                fontWeight: '800', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center' 
                              }}>
                                {idx + 1}
                              </span>
                              <strong style={{ fontSize: '0.86rem', color: '#0f172a' }}>Step {idx + 1}: {step.operation}</strong>
                              
                              {/* SFG / FG Classification Badge */}
                              <span style={{
                                fontSize: '0.72rem',
                                fontWeight: '800',
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                background: step.stageOutput === 'Finished Goods (FG)' ? '#ecfdf5' : '#e0f2fe',
                                color: step.stageOutput === 'Finished Goods (FG)' ? '#047857' : '#0369a1',
                                border: step.stageOutput === 'Finished Goods (FG)' ? '1px solid #a7f3d0' : '1px solid #bae6fd',
                                textTransform: 'uppercase',
                                letterSpacing: '0.03em'
                              }}>
                                {step.stageOutput === 'Finished Goods (FG)' ? 'FG (Finished Goods)' : 'SFG (Semi-Finished Goods)'}
                              </span>
                            </div>

                            {/* Reorder and Delete Controls */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                style={{ padding: '2px 6px', fontSize: '0.7rem' }} 
                                disabled={idx === 0} 
                                onClick={() => handleMoveRoutingStep(idx, 'up')}
                                title="Move Step Up"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                style={{ padding: '2px 6px', fontSize: '0.7rem' }} 
                                disabled={idx === processRouting.length - 1} 
                                onClick={() => handleMoveRoutingStep(idx, 'down')}
                                title="Move Step Down"
                              >
                                <ChevronDown size={14} />
                              </button>
                              {processRouting.length > 1 && (
                                <button 
                                  type="button" 
                                  className="btn-secondary" 
                                  style={{ padding: '2px 6px', fontSize: '0.7rem', color: '#dc2626', borderColor: '#fca5a5' }} 
                                  onClick={() => handleRemoveRoutingStep(step.id)}
                                  title="Delete Step"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                            {/* Operation / Stage */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700' }}>Operation / Process</label>
                              <select 
                                className="form-control" 
                                style={{ padding: '4px 8px', fontSize: '0.82rem' }}
                                value={step.operation}
                                onChange={e => handleUpdateRoutingStep(step.id, 'operation', e.target.value)}
                              >
                                <option value="Rotogravure Printing (Reverse)">Rotogravure Printing (Reverse)</option>
                                <option value="Rotogravure Printing (Surface)">Rotogravure Printing (Surface)</option>
                                <option value="Solventless Lamination">Solventless Lamination</option>
                                <option value="Solvent-based Lamination">Solvent-based Lamination</option>
                                <option value="Extrusion Lamination">Extrusion Lamination</option>
                                <option value="Slitting & Rewinding">Slitting & Rewinding</option>
                                <option value="Center Seal Pouching">Center Seal Pouching</option>
                                <option value="3-Side Seal Pouching">3-Side Seal Pouching</option>
                                <option value="Stand-up Zipper Pouching">Stand-up Zipper Pouching</option>
                                <option value="Doctoring / Inspection Rewinder">Doctoring / Inspection Rewinder</option>
                                <option value="Final QC Inspection & Dispatch">Final QC Inspection & Dispatch</option>
                                <option value="Custom Operation">Custom Operation</option>
                              </select>
                            </div>

                            {/* Machine Selection (From Settings) */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700' }}>Allocated Machine (from Settings)</label>
                              <select 
                                className="form-control" 
                                style={{ padding: '4px 8px', fontSize: '0.82rem' }}
                                value={step.machineId}
                                onChange={e => handleUpdateRoutingStep(step.id, 'machineId', e.target.value)}
                              >
                                {machines && machines.length > 0 ? (
                                  machines.map(m => (
                                    <option key={m.id} value={m.id}>
                                      {m.name} ({m.type || 'Machine'} • Max {m.maxSpeedMpm || 0} mpm)
                                    </option>
                                  ))
                                ) : (
                                  <>
                                    <option value="MAC-ROTO-1">Rotogravure Press 1 (Rotogravure)</option>
                                    <option value="MAC-LAM-1">Solventless Laminator 1 (Lamination)</option>
                                    <option value="MAC-SLIT-1">High Speed Slitter 1 (Slitting)</option>
                                  </>
                                )}
                                <option value="MANUAL-PACKING">Manual / Dispatch Bay (QC & Packing)</option>
                              </select>
                            </div>

                            {/* Pass Selection */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700' }}>Machine Pass / Cycle</label>
                              <select 
                                className="form-control" 
                                style={{ padding: '4px 8px', fontSize: '0.82rem' }}
                                value={step.pass}
                                onChange={e => handleUpdateRoutingStep(step.id, 'pass', e.target.value)}
                              >
                                <option value="Single Pass">Single Pass</option>
                                <option value="Pass 1 (Single Pass)">Pass 1 (Single Pass)</option>
                                <option value="Pass 1 (Layer 1 + Layer 2)">Pass 1 (Layer 1 + Layer 2)</option>
                                <option value="Pass 2 (2-Ply + Layer 3)">Pass 2 (2-Ply + Layer 3)</option>
                                <option value="Pass 3 (3-Ply + Layer 4)">Pass 3 (3-Ply + Layer 4)</option>
                                <option value="Pass 1 (Front Print)">Pass 1 (Front Print)</option>
                                <option value="Pass 2 (Reverse Print)">Pass 2 (Reverse Print)</option>
                                <option value="Pass 1 (Base Coat)">Pass 1 (Base Coat)</option>
                                <option value="Pass 2 (Top Coat)">Pass 2 (Top Coat)</option>
                                <option value="Final Stage">Final Stage</option>
                              </select>
                            </div>

                            {/* Stage Output Classification (SFG vs FG) */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700' }}>Stage Output Classification</label>
                              <select 
                                className="form-control" 
                                style={{ padding: '4px 8px', fontSize: '0.82rem', fontWeight: '700' }}
                                value={step.stageOutput}
                                onChange={e => handleUpdateRoutingStep(step.id, 'stageOutput', e.target.value)}
                              >
                                <option value="Semi-Finished Goods (SFG)">Semi-Finished Goods (SFG)</option>
                                <option value="Finished Goods (FG)">Finished Goods (FG) / Dispatch</option>
                              </select>
                            </div>

                            {/* Stage Output Description */}
                            <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
                              <label style={{ fontSize: '0.72rem', color: '#64748b' }}>Stage Output Label & Remarks</label>
                              <input 
                                type="text"
                                className="form-control"
                                style={{ padding: '4px 8px', fontSize: '0.82rem' }}
                                placeholder="e.g. SFG - 2-Ply Laminate Web. 24 hr curing before Pass 2."
                                value={step.stageDescription || step.notes || ''}
                                onChange={e => handleUpdateRoutingStep(step.id, 'stageDescription', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Colors & Cost */}
                <div className="form-group"><label>Colors Count (No. of Cylinders)</label><input type="number" className="form-control" value={colorsCount} onChange={e => setColorsCount(e.target.value)} /></div>
                <div className="form-group"><label>Engraver Name</label><input type="text" className="form-control" value={engravuresName} onChange={e => setEngravuresName(e.target.value)} /></div>

                <div className="form-group"><label>Total Set Cylinder Cost (₹)</label><input type="text" className="form-control" value={cylinderCost} onChange={e => setCylinderCost(e.target.value)} /></div>
                <div className="form-group"><label>Cost Borne By</label>
                  <select className="form-control" value={costBorneBy} onChange={e => setCostBorneBy(e.target.value)}>
                    <option value="Client (100%)">Client (100%)</option>
                    <option value="Us (100%)">Us / Samyak (100%)</option>
                    <option value="Both (50/50)">Both (50/50)</option>
                  </select>
                </div>

                <div className="form-group"><label>Max Utilisation Limit (Kg)</label><input type="number" className="form-control" value={utilisationLimit} onChange={e => setUtilisationLimit(e.target.value)} /></div>

                {/* Press Marks & Quality Guidelines Section */}
                <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                    Press Marks & Quality Guidelines
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
                      <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Special Quality Guidelines & Plant Instructions</label>
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

                {!editingJobId && (
                  <div style={{ gridColumn: 'span 2', background: '#ecfdf5', padding: '12px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '700', color: '#047857' }}>
                      <input type="checkbox" checked={createCylinder} onChange={e => setCreateCylinder(e.target.checked)} />
                      Automatically create linked Cylinder Set in Cylinder Database
                    </label>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsCreateModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSkuDuplicate} style={isSkuDuplicate ? { opacity: 0.6, cursor: 'not-allowed' } : {}}>
                  <CheckCircle2 size={16} /> {editingJobId ? 'Save Changes' : 'Save Job Master'}
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
              <button type="button" className="btn-secondary" style={{ padding: '4px' }} onClick={() => setIsOnboardModalOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleOnboardClientSubmit}>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontWeight: '700' }}>Company / Client Name *</label>
                  <input type="text" className="form-control" required placeholder="e.g. Britannia Industries Ltd" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Contact Person</label>
                  <input type="text" className="form-control" placeholder="Key contact name" value={newContactPerson} onChange={e => setNewContactPerson(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input type="text" className="form-control" placeholder="10-digit mobile" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>GSTIN Number</label>
                  <input type="text" className="form-control" placeholder="23AAAC..." value={newGstin} onChange={e => setNewGstin(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" className="form-control" placeholder="purchase@client.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Billing & Delivery Address</label>
                  <textarea className="form-control" rows="2" placeholder="Plot 45, Pithampur Industrial Area, Sector 3, Dhar MP" value={newAddress} onChange={e => setNewAddress(e.target.value)} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Payment Terms</label>
                  <select className="form-control" value={newPaymentTerms} onChange={e => setNewPaymentTerms(e.target.value)}>
                    <option value="30 Days Net">30 Days Net</option>
                    <option value="15 Days Net">15 Days Net</option>
                    <option value="45 Days Net">45 Days Net</option>
                    <option value="50% Advance, Balance Before Dispatch">50% Advance, Balance Before Dispatch</option>
                    <option value="Immediate / Cash on Delivery">Immediate / Cash on Delivery</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsOnboardModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: '#047857', borderColor: '#047857' }}>
                  <CheckCircle2 size={16} /> Save Client & Auto-Fill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );

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
                  onSave={handleSaveJobCardData}
                  currentUser={currentUser}
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
              <button className="btn-secondary" style={{ padding: '10px 14px', fontSize: '0.85rem', fontWeight: '700' }} onClick={() => handleOpenEditModal(selectedJob)} title="Edit Job Master">
                <Edit size={16} /> Edit Specs
              </button>
              <button className="btn-primary" style={{ padding: '10px 18px', fontSize: '0.9rem', fontWeight: '700', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }} onClick={() => onPunchOrderFromJobMaster && onPunchOrderFromJobMaster(selectedJob)}>
                <Calculator size={18} /> Punch New Order
              </button>
              <button className="btn-secondary" style={{ padding: '10px 14px', fontSize: '0.85rem', fontWeight: '700', color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => handleConfirmDeleteJobMaster(selectedJob)} title="Delete Job Master">
                <Trash2 size={16} /> Delete
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
                  <div style={{ color: '#047857', fontSize: '0.75rem', fontWeight: '700' }}>Print Width (PET Size)</div>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{selectedJob.printWidthMm} mm</strong>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ color: '#2563eb', fontSize: '0.75rem', fontWeight: '700' }}>Face Length (Shell)</div>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{selectedJob.faceLengthMm || selectedJob.printWidthMm || 1050} mm</strong>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Repeat Length (Circumference)</div>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{selectedJob.repeatLengthMm} mm</strong>
                </div>
                {selectedJob.pouchOpenWidth > 0 && (
                  <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Individual Pouch Size (Open W x H)</div>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{selectedJob.pouchOpenWidth} mm x {selectedJob.pouchHeight} mm</strong>
                  </div>
                )}
              </div>

              <h4 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '10px' }}>Laminate Layer Breakdown</h4>
              <table className="data-table" style={{ fontSize: '0.85rem' }}>
                <thead><tr><th>Layer #</th><th>Substrate Film Grade</th><th>Micron (µ)</th><th>Calculated GSM</th></tr></thead>
                <tbody>
                  {(() => {
                    const displayLayers = (selectedJob.layers && selectedJob.layers.length > 0)
                      ? selectedJob.layers
                      : (parseStructureToLayers(selectedJob.structure) || []);

                    if (displayLayers.length === 0) {
                      return (
                        <tr>
                          <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '12px' }}>
                            No layers defined for this structure.
                          </td>
                        </tr>
                      );
                    }

                    return displayLayers.map((l, idx) => {
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
                  });
                })()}
                </tbody>
              </table>
            </div>

            {/* Process Routing & Machinery Sequence Panel */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Cpu size={18} style={{ color: 'var(--primary-brand)' }} /> Process Routing & Machine Sequence
                </h3>
                <span className="badge" style={{ background: '#f1f5f9', color: '#334155', fontWeight: '700', fontSize: '0.75rem' }}>
                  {(selectedJob.processRouting && selectedJob.processRouting.length > 0 ? selectedJob.processRouting : generateDefaultRouting(selectedJob.layers, machines)).length} Total Stages
                </span>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                Sequential workflow across shopfloor machinery. Up until final dispatch, material in progress is classified as <strong>Semi-Finished Goods (SFG)</strong>.
              </div>

              {(() => {
                const routingList = (selectedJob.processRouting && selectedJob.processRouting.length > 0)
                  ? selectedJob.processRouting
                  : generateDefaultRouting(selectedJob.layers, machines);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {routingList.map((step, idx) => (
                      <div 
                        key={step.id || idx}
                        style={{
                          background: '#f8fafc',
                          border: '1px solid var(--border-color)',
                          borderLeft: step.stageOutput === 'Finished Goods (FG)' ? '4px solid #047857' : '4px solid var(--primary-brand)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              background: step.stageOutput === 'Finished Goods (FG)' ? '#047857' : 'var(--primary-brand)',
                              color: '#ffffff',
                              fontSize: '0.72rem',
                              fontWeight: '800',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {idx + 1}
                            </span>
                            <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{step.operation}</strong>
                            <span className="badge" style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: '700', fontSize: '0.72rem' }}>
                              {step.pass || 'Single Pass'}
                            </span>
                          </div>

                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            background: step.stageOutput === 'Finished Goods (FG)' ? '#ecfdf5' : '#e0f2fe',
                            color: step.stageOutput === 'Finished Goods (FG)' ? '#047857' : '#0369a1',
                            border: step.stageOutput === 'Finished Goods (FG)' ? '1px solid #a7f3d0' : '1px solid #bae6fd',
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em'
                          }}>
                            {step.stageOutput === 'Finished Goods (FG)' ? 'FG (Finished Goods)' : 'SFG (Semi-Finished Goods)'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            Allocated Machine: <strong style={{ color: '#0f172a' }}>{step.machineName || 'Allocated Press'}</strong>
                            {step.targetSpeedMpm > 0 && <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>({step.targetSpeedMpm} mpm)</span>}
                          </div>
                          {step.stageDescription && (
                            <div style={{ fontStyle: 'italic', color: '#475569' }}>
                              {step.stageDescription}
                            </div>
                          )}
                        </div>

                        {step.notes && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#ffffff', padding: '4px 8px', borderRadius: '4px', border: '1px dashed #cbd5e1' }}>
                            📝 {step.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
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


        {/* EDIT & ONBOARD CLIENT MODALS */}
        {renderJobMasterModals()}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--text-primary)' }}>Job Master Technical Directory ({(jobMasters || []).length})</h2>
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

      {/* FILTER TOOLBAR PANEL */}
      <div className="glass-panel" style={{ padding: '18px 22px', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            <SlidersHorizontal size={18} style={{ color: 'var(--primary-brand)' }} /> Filter Job Technical Directory
            {activeFiltersCount > 0 && (
              <span className="badge badge-info" style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px' }}>
                {activeFiltersCount} Active {activeFiltersCount === 1 ? 'Filter' : 'Filters'}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
              Showing <strong>{(filteredJobMasters || []).length}</strong> of <strong>{(jobMasters || []).length}</strong> Job Masters
            </span>
            {activeFiltersCount > 0 && (
              <button 
                onClick={resetAllFilters} 
                className="btn-secondary" 
                style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#dc2626', borderColor: '#fca5a5', cursor: 'pointer' }}
              >
                <RotateCcw size={12} /> Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Dropdown Filters Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', alignItems: 'center' }}>
          {/* Client Filter */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
              Client Directory
            </label>
            <select 
              className="form-control" 
              style={{ fontSize: '0.85rem', padding: '6px 10px' }} 
              value={clientFilter} 
              onChange={e => setClientFilter(e.target.value)}
            >
              <option value="ALL">All Clients ({(allClientOptions || []).length})</option>
              {allClientOptions.map(c => (
                <option key={c.id || c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Substrate Film Filter */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
              Film Substrate
            </label>
            <select 
              className="form-control" 
              style={{ fontSize: '0.85rem', padding: '6px 10px' }} 
              value={substrateFilter} 
              onChange={e => setSubstrateFilter(e.target.value)}
            >
              <option value="ALL">All Substrates</option>
              <option value="PET">PET Film</option>
              <option value="METPET">METPET Film</option>
              <option value="LD">LD / LDPE Films</option>
              <option value="BOPP">BOPP Natural / Met / Pearlised</option>
              <option value="CPP">CPP Films</option>
              <option value="Atta">Atta (High Dart) Film</option>
              <option value="Metallocene">Metallocene Film</option>
            </select>
          </div>

          {/* Layer Count Filter */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
              Layer Structure
            </label>
            <select 
              className="form-control" 
              style={{ fontSize: '0.85rem', padding: '6px 10px' }} 
              value={layerCountFilter} 
              onChange={e => setLayerCountFilter(e.target.value)}
            >
              <option value="ALL">All Layer Counts</option>
              <option value="2">2-Layer Laminates</option>
              <option value="3">3-Layer Laminates</option>
              <option value="4+">4+ Layer Laminates</option>
            </select>
          </div>

          {/* Printing Colors Filter */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
              Printing Colors
            </label>
            <select 
              className="form-control" 
              style={{ fontSize: '0.85rem', padding: '6px 10px' }} 
              value={colorsFilter} 
              onChange={e => setColorsFilter(e.target.value)}
            >
              <option value="ALL">All Color Counts</option>
              <option value="1-4">1 - 4 Colors</option>
              <option value="5-7">5 - 7 Colors</option>
              <option value="8+">8+ Colors</option>
            </select>
          </div>

          {/* Cylinder Cost Borne Filter */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
              Cylinder Cost Borne By
            </label>
            <select 
              className="form-control" 
              style={{ fontSize: '0.85rem', padding: '6px 10px' }} 
              value={costBorneFilter} 
              onChange={e => setCostBorneFilter(e.target.value)}
            >
              <option value="ALL">All Cost Models</option>
              <option value="client">Client (100%)</option>
              <option value="us">Us / Factory (100%)</option>
              <option value="both">Both (50/50 Shared)</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Preset Chips */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600', marginRight: '4px' }}>
              Quick Presets:
            </span>
            <button 
              type="button"
              className="preset-chip" 
              style={{ fontSize: '0.75rem', padding: '4px 10px', background: activeFiltersCount === 0 ? 'var(--primary-brand)' : '#f1f5f9', color: activeFiltersCount === 0 ? '#ffffff' : '#334155', cursor: 'pointer' }} 
              onClick={resetAllFilters}
            >
              All Jobs ({(jobMasters || []).length})
            </button>
            <button 
              type="button"
              className="preset-chip" 
              style={{ fontSize: '0.75rem', padding: '4px 10px', background: layerCountFilter === '3' ? 'var(--primary-brand)' : '#f1f5f9', color: layerCountFilter === '3' ? '#ffffff' : '#334155', cursor: 'pointer' }} 
              onClick={() => { resetAllFilters(); setLayerCountFilter('3'); }}
            >
              3-Layer Structures
            </button>
            <button 
              type="button"
              className="preset-chip" 
              style={{ fontSize: '0.75rem', padding: '4px 10px', background: substrateFilter === 'PET' ? 'var(--primary-brand)' : '#f1f5f9', color: substrateFilter === 'PET' ? '#ffffff' : '#334155', cursor: 'pointer' }} 
              onClick={() => { resetAllFilters(); setSubstrateFilter('PET'); }}
            >
              PET Substrates
            </button>
            <button 
              type="button"
              className="preset-chip" 
              style={{ fontSize: '0.75rem', padding: '4px 10px', background: costBorneFilter === 'client' ? 'var(--primary-brand)' : '#f1f5f9', color: costBorneFilter === 'client' ? '#ffffff' : '#334155', cursor: 'pointer' }} 
              onClick={() => { resetAllFilters(); setCostBorneFilter('client'); }}
            >
              Client-Owned Cylinders
            </button>
          </div>

          {activeFiltersCount > 0 && (
            <button className="btn-secondary" onClick={resetAllFilters} style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fca5a5', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <RotateCcw size={12} /> Clear Filters ({activeFiltersCount})
            </button>
          )}
        </div>
      </div>

      {/* Main Jobs Directory Table */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ marginBottom: '16px', maxWidth: '400px', position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            className="form-control" 
            placeholder="Search Job Name, SKU, Client..." 
            style={{ paddingLeft: '38px' }}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {filteredJobMasters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
            <Filter size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
            <h4 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '4px' }}>No Job Masters Found</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>No jobs match your currently applied filters.</p>
            <button className="btn-secondary" onClick={resetAllFilters} style={{ margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <RotateCcw size={14} /> Reset All Filters
            </button>
          </div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr><th>Job Master ID</th><th>SKU Code</th><th>Job Name</th><th>Client Name</th><th>Laminate Structure</th><th>Process Routing</th><th>Print Width x Repeat</th><th>Colors & Engraver</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {jobsPagination.paginatedItems.map(job => (
                  <tr key={job.id}>
                    <td style={{ fontWeight: '800', color: 'var(--primary-brand)' }}>{job.id}</td>
                    <td><span className="badge badge-both">{job.skuCode}</span></td>
                    <td style={{ fontWeight: '700' }}>{job.jobName}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{job.clientName}</td>
                    <td style={{ fontSize: '0.8rem', fontWeight: '600' }}>{job.structure}</td>
                    <td>
                      <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Cpu size={12} />
                        {(job.processRouting && job.processRouting.length > 0 ? job.processRouting : generateDefaultRouting(job.layers, machines)).length} Stages
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: '600' }}>
                        SFG → FG
                      </div>
                    </td>
                    <td>{job.printWidthMm}mm x {job.repeatLengthMm}mm</td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>
                        🎨 <b>{job.colorsCount || 6} Colors</b>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{job.engravuresName}</div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleSelectJob(job)}>View Profile</button>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleOpenEditModal(job)}>Edit</button>
                        <button className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#047857' }} onClick={() => onPunchOrderFromJobMaster && onPunchOrderFromJobMaster(job)}>Punch Order</button>
                        <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => handleConfirmDeleteJobMaster(job)} title="Delete Job Master">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination
              currentPage={jobsPagination.currentPage}
              totalItems={jobsPagination.totalItems}
              pageSize={jobsPagination.pageSize}
              onPageChange={jobsPagination.setCurrentPage}
              onPageSizeChange={jobsPagination.setPageSize}
            />
          </>
        )}
      </div>
      {renderJobMasterModals()}
    </div>
  );
}
