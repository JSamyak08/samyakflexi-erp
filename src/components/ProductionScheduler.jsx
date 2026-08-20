import React, { useState, useMemo, useEffect } from 'react';
import { 
  Printer, 
  PlayCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Gauge, 
  Zap, 
  ChevronRight, 
  Sliders, 
  UserCheck, 
  Building2,
  Trash2,
  Edit3,
  Move,
  ArrowUp,
  ArrowDown,
  Clock,
  Image as ImageIcon,
  ExternalLink,
  Download,
  Maximize2,
  Check,
  X,
  Lock,
  Sparkles,
  StopCircle,
  Eye,
  RefreshCw,
  Tag,
  Plus
} from 'lucide-react';
import { 
  initialMachines, 
  calculatePrintingScheduleMetrics,
  isOrderOverdue,
  FILM_DENSITIES
} from '../factoryStore';

// Helper: Resolve Film Density for flexible packaging substrates
const getFilmDensity = (filmType = '') => {
  if (!filmType) return 1.40;
  if (FILM_DENSITIES && FILM_DENSITIES[filmType]) return FILM_DENSITIES[filmType];
  const lower = String(filmType).toLowerCase().trim();
  if (lower.includes('pet') || lower.includes('polyester')) return 1.40;
  if (lower.includes('pearlised')) return 0.70;
  if (lower.includes('bopp') || lower.includes('opp')) return 0.91;
  if (lower.includes('metpet')) return 1.40;
  if (lower.includes('cpp')) return 0.91;
  if (lower.includes('ld') || lower.includes('pe') || lower.includes('poly') || lower.includes('lldpe')) return 0.93;
  if (lower.includes('paper')) return 0.80;
  if (lower.includes('alu') || lower.includes('foil')) return 2.70;
  return 1.40;
};

// Helper: Parse substrate structure string into individual film layers with GSM
const parseStructureLayers = (structureStr = '') => {
  if (!structureStr || typeof structureStr !== 'string') return [];
  const parts = structureStr.split(/[\/\+]/).map(p => p.trim()).filter(Boolean);
  return parts.map(part => {
    const micronMatch = part.match(/(\d+(\.\d+)?)\s*(µ|mic|micron)?/i);
    const micron = micronMatch ? parseFloat(micronMatch[1]) : 12;
    let filmType = part.replace(/(\d+(\.\d+)?)\s*(µ|mic|micron)?/gi, '').replace(/[^\w\s-]/g, '').trim();
    if (!filmType) filmType = 'PET';
    const density = getFilmDensity(filmType);
    const gsm = parseFloat((micron * density).toFixed(2));
    return { filmType, micron, density, gsm };
  });
};

export default function ProductionScheduler({
  orders = [],
  inventory = [],
  machines = initialMachines,
  schedules = [],
  jobMasters = [],
  cylinders = [],
  productionRecords = [],
  currentUser,
  onSaveMachine,
  onUpdateMachine,
  onDeleteMachine,
  onSaveSchedule,
  onDeleteSchedule,
  onUpdateOrder,
  onStartJob,
  onEndJob,
  onReorderQueue
}) {
  // Navigation Tabs: 'queue' (Ready Queue - Default) | 'machines' (Press Configuration)
  const [activeTab, setActiveTab] = useState('queue');
  const [selectedMachineFilter, setSelectedMachineFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Ready' | 'In Production' | 'Overdue'

  // Permission Check: Only Admin, Plant Manager, and Production Manager can re-arrange the Ready Queue
  const canRearrangeQueue = useMemo(() => {
    const role = currentUser?.role;
    return role === 'Admin' || role === 'Plant Manager' || role === 'Production Manager';
  }, [currentUser]);

  // Filter machines to ONLY Rotogravure printing machine types
  const rotogravureMachines = useMemo(() => {
    return (machines || []).filter(m => {
      const type = (m.type || m.category || '').toLowerCase();
      const name = (m.name || '').toLowerCase();
      if (type.includes('pouch') || type.includes('laminat') || type.includes('slitt') || type.includes('extrud')) return false;
      if (name.includes('pouch') || name.includes('laminat') || name.includes('slitt') || name.includes('extrud')) return false;
      return true;
    });
  }, [machines]);

  // Active Job Run Modal & Artwork Preview State
  const [activeRunningJob, setActiveRunningJob] = useState(null);
  const [activeMachineSelection, setActiveMachineSelection] = useState({});
  const [isArtworkZoomOpen, setIsArtworkZoomOpen] = useState(false);
  const [zoomArtworkSrc, setZoomArtworkSrc] = useState('');

  // Live Timer State for Active Job Run
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(0);

  // Machine Management Modal State
  const [isMachineModalOpen, setIsMachineModalOpen] = useState(false);
  const [editingMachineId, setEditingMachineId] = useState(null);
  const [machineName, setMachineName] = useState('');
  const [machineType, setMachineType] = useState('Rotogravure');
  const [machineColors, setMachineColors] = useState(8);
  const [machineMaxSpeed, setMachineMaxSpeed] = useState(250);
  const [machineMaxWidth, setMachineMaxWidth] = useState(1200);
  const [machineOperator, setMachineOperator] = useState('Plant Operator');
  const [machineLocation, setMachineLocation] = useState('Bay 1 - Rotogravure Hall');
  const [machineStatus, setMachineStatus] = useState('Active');

  // Custom Queue Ordering State
  const [queueOrderIds, setQueueOrderIds] = useState(() => {
    return (orders || []).map(o => o.id);
  });

  // Keep queueOrderIds in sync with orders list
  useEffect(() => {
    setQueueOrderIds(prev => {
      const existingSet = new Set(prev);
      const currentIds = (orders || []).map(o => o.id);
      const added = currentIds.filter(id => !existingSet.has(id));
      const valid = prev.filter(id => currentIds.includes(id));
      return [...valid, ...added];
    });
  }, [orders]);

  // Derive Enriched Ready Queue with Material, Artwork, and Production Status
  const readyQueueOrders = useMemo(() => {
    const orderMap = new Map((orders || []).map(o => [o.id, o]));

    // Order items based on custom queueOrderIds if rearranged, fallback to smart auto-sort
    const orderedList = queueOrderIds
      .map(id => orderMap.get(id))
      .filter(Boolean);

    // Any remaining orders not in queueOrderIds
    (orders || []).forEach(o => {
      if (!queueOrderIds.includes(o.id)) {
        orderedList.push(o);
      }
    });

    return orderedList.map(order => {
      const isOverdue = isOrderOverdue(order);
      const reqs = order.materialRequirements || order.rawMaterialRequirements || [];
      const firstFilmReq = reqs.find(r => r.micron && r.micron !== '-') || {};

      // Match Job Master & Rotogravure Cylinder record for Artwork, Structure, Layers, Colors, Repeat, and Width
      const matchedJM = (jobMasters || []).find(j => 
        (j.id && (j.id === order.jobMasterId || j.id === order.id)) || 
        (j.jobCode && (j.jobCode === order.jobCode || j.jobCode === order.id)) || 
        (j.jobName && (j.jobName || '').toLowerCase().trim() === (order.jobName || '').toLowerCase().trim())
      );

      const matchedCylinder = (cylinders || []).find(c => 
        (c.id && (c.id === order.cylinderId || c.id === order.id)) || 
        (c.jobCode && (c.jobCode === order.jobCode || c.jobCode === order.id)) || 
        (c.jobName && (c.jobName || '').toLowerCase().trim() === (order.jobName || '').toLowerCase().trim())
      );

      // Substrate structure resolution from Job Master / Cylinder / Order
      const jmLayers = matchedJM?.layers || [];
      const cylinderLayers = matchedCylinder?.layers || [];
      const orderLayers = order.jobDetails?.layers || order.layers || [];

      const structure = (jmLayers.length > 0 ? jmLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ') : null) ||
        (matchedJM?.structure && matchedJM.structure !== 'PET / PE' && matchedJM.structure !== '—' ? matchedJM.structure : null) ||
        (cylinderLayers.length > 0 ? cylinderLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ') : null) ||
        (matchedCylinder?.structure && matchedCylinder.structure !== 'PET / PE' && matchedCylinder.structure !== '—' ? matchedCylinder.structure : null) ||
        (order.structure && order.structure !== 'PET / PE' && order.structure !== '—' ? order.structure : null) ||
        (orderLayers.length > 0 ? orderLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ') : null) ||
        (reqs.filter(r => r.micron && r.micron !== '-').map(r => `${r.filmType} ${r.micron}µ`).join(' / ')) ||
        'PET 12µ / PE 40µ';

      // Width resolution linked to Job Master / Cylinder / Order
      const widthMm = parseFloat(
        order.printWidthMm ||
        order.jobDetails?.printWidthMm ||
        matchedJM?.printWidthMm ||
        matchedJM?.cylinderData?.widthMm ||
        matchedCylinder?.widthMm ||
        matchedCylinder?.printingWidthMm ||
        order.widthMm ||
        firstFilmReq.widthMm ||
        1000
      );

      // Artwork resolution linked to Job Master / Cylinder / Order
      const artworkUrl = order.artworkUrl ||
                         order.jobDetails?.artworkUrl ||
                         matchedJM?.artworkUrl ||
                         matchedJM?.cylinderData?.artworkUrl ||
                         matchedCylinder?.artworkUrl ||
                         '';

      // Colors resolution linked to Job Master / Cylinder / Order
      const colorsCount = order.colors ||
                          order.jobDetails?.cylinderColors?.length ||
                          matchedJM?.cylinderColors?.length ||
                          matchedJM?.colors ||
                          matchedCylinder?.colors ||
                          matchedCylinder?.colorsList?.length ||
                          8;

      const cylinderColors = order.jobDetails?.cylinderColors ||
                             matchedJM?.cylinderColors ||
                             matchedCylinder?.colorsList ||
                             matchedCylinder?.cylinderColors ||
                             [];

      // Resolve layers from jobMasters, cylinder, order.jobDetails, order.layers, or parsed structure
      let resolvedLayers = [];
      if (jmLayers.length > 0) {
        resolvedLayers = jmLayers.map(l => {
          const filmType = l.filmType || 'PET';
          const micron = parseFloat(l.micron) || 12;
          const density = getFilmDensity(filmType);
          const gsm = parseFloat((micron * density).toFixed(2));
          return { ...l, filmType, micron, density, gsm };
        });
      } else if (cylinderLayers.length > 0) {
        resolvedLayers = cylinderLayers.map(l => {
          const filmType = l.filmType || 'PET';
          const micron = parseFloat(l.micron) || 12;
          const density = getFilmDensity(filmType);
          const gsm = parseFloat((micron * density).toFixed(2));
          return { ...l, filmType, micron, density, gsm };
        });
      } else if (orderLayers.length > 0) {
        resolvedLayers = orderLayers.map(l => {
          const filmType = l.filmType || 'PET';
          const micron = parseFloat(l.micron) || 12;
          const density = getFilmDensity(filmType);
          const gsm = parseFloat((micron * density).toFixed(2));
          return { ...l, filmType, micron, density, gsm };
        });
      } else if (structure) {
        resolvedLayers = parseStructureLayers(structure);
      }

      // Layer 1 is the Print Layer (printing substrate)
      const firstLayer = orderLayers[0] || {};
      const printLayer = resolvedLayers[0] || {
        filmType: order.filmType || firstFilmReq.filmType || 'PET',
        micron: parseFloat(order.micron || firstLayer.micron || firstFilmReq.micron) || 12,
        density: getFilmDensity(order.filmType || firstFilmReq.filmType || 'PET'),
        gsm: (parseFloat(order.micron || firstLayer.micron || firstFilmReq.micron) || 12) * getFilmDensity(order.filmType || firstFilmReq.filmType || 'PET')
      };

      const printFilmType = printLayer.filmType || 'PET';
      const printMicron = parseFloat(printLayer.micron) || 12;
      const printDensity = printLayer.density || getFilmDensity(printFilmType);
      const printLayerGsm = parseFloat((printMicron * printDensity).toFixed(2));

      // Calculate Total Films GSM & Laminate GSM
      const totalFilmsGsm = resolvedLayers.length > 0
        ? resolvedLayers.reduce((sum, l) => sum + (l.gsm || 0), 0)
        : printLayerGsm;

      const inkGsm = parseFloat(order.inkGsm || matchedJM?.inkGsm) || 1.5;
      const adhesiveGsm = (resolvedLayers.length > 1) 
        ? (parseFloat(order.adhesiveGsm || matchedJM?.adhesiveGsm) || 1.5) 
        : 0;

      const totalLaminateGsm = parseFloat((totalFilmsGsm + inkGsm + adhesiveGsm).toFixed(2));

      // Order Weight in KG
      const printQtyKg = parseFloat(order.quantityKg || order.quantity || order.orderQtyKg || 0);

      // Width in meters
      const widthM = widthMm > 0 ? widthMm / 1000 : 1.0;

      // Surface Area in m² based on Total Laminate GSM
      const totalAreaSqm = (totalLaminateGsm > 0 && printQtyKg > 0)
        ? (printQtyKg * 1000) / totalLaminateGsm
        : (printLayerGsm > 0 && printQtyKg > 0)
        ? (printQtyKg * 1000) / printLayerGsm
        : 0;

      // Exact Target Running Meters for the Print Layer
      const targetMeters = (totalAreaSqm > 0 && widthM > 0)
        ? Math.round(totalAreaSqm / widthM)
        : 0;

      // Print Layer Net KG
      const printLayerNetKg = totalAreaSqm > 0
        ? parseFloat(((totalAreaSqm * printLayerGsm) / 1000).toFixed(2))
        : 0;

      // Check material readiness from inventory & requirements
      let isMaterialReady = true;
      if (reqs.length > 0) {
        isMaterialReady = reqs.every(req => {
          const match = (inventory || []).find(inv => 
            inv.filmType === req.filmType && (inv.availableQtyKg || 0) >= (req.qtyKg || 0)
          );
          return !!match || req.poIssued || order.status === 'In Production' || order.status === 'Scheduled';
        });
      } else if (printFilmType) {
        const match = (inventory || []).find(inv => 
          inv.filmType === printFilmType && (inv.availableQtyKg || 0) >= (printLayerNetKg || 0)
        );
        isMaterialReady = !!match || order.status === 'In Production' || order.status === 'Scheduled';
      }

      // Check if job is actively In Production on the Printing Press
      const matchingProdRecord = (productionRecords || []).find(r => 
        (order.id && (r.orderId === order.id || r.id === order.id)) || 
        (order.jobCode && r.jobCode === order.jobCode)
      );

      const printingStartTime = order.printingStartTime || matchingProdRecord?.printingStartTime || null;
      const printingEndTime = order.printingEndTime || matchingProdRecord?.printingEndTime || null;
      const printingDurationFormatted = order.printingDurationFormatted || matchingProdRecord?.printingDurationFormatted || null;

      // STRICT CHECK: Only a job with an active press run (started and not yet ended) is 'In Production'
      const isCurrentlyInProduction = Boolean(
        order.printingStatus === 'In Production' || 
        matchingProdRecord?.printingStatus === 'In Production' || 
        (printingStartTime && !printingEndTime)
      );

      return {
        ...order,
        widthMm,
        micron: printMicron,
        printFilmType,
        printLayerGsm,
        totalLaminateGsm,
        totalAreaSqm: Math.round(totalAreaSqm),
        printLayerNetKg,
        structure,
        artworkUrl,
        colorsCount,
        cylinderColors,
        isOverdue,
        isMaterialReady,
        isCurrentlyInProduction,
        printingStartTime,
        printingEndTime,
        printingDurationFormatted,
        targetMeters,
        printQtyKg,
        priorityTag: isCurrentlyInProduction 
          ? 'IN PRODUCTION' 
          : isOverdue 
          ? 'OVERDUE' 
          : !isMaterialReady 
          ? 'MATERIAL PENDING' 
          : printingEndTime 
          ? 'COMPLETED PRINTING' 
          : 'READY'
      };
    });
  }, [orders, inventory, jobMasters, cylinders, productionRecords, queueOrderIds]);

  // Filtered Queue view
  const filteredQueue = useMemo(() => {
    return readyQueueOrders.filter(order => {
      if (selectedMachineFilter !== 'All') {
        const assignedMachine = activeMachineSelection[order.id] || order.machineId || rotogravureMachines[0]?.id;
        if (assignedMachine !== selectedMachineFilter) return false;
      }
      if (statusFilter === 'Ready' && (order.isCurrentlyInProduction || !order.isMaterialReady)) return false;
      if (statusFilter === 'In Production' && !order.isCurrentlyInProduction) return false;
      if (statusFilter === 'Overdue' && !order.isOverdue) return false;
      return true;
    });
  }, [readyQueueOrders, selectedMachineFilter, statusFilter, activeMachineSelection, rotogravureMachines]);

  // Live Timer Effect for Active Running Job
  useEffect(() => {
    if (!activeRunningJob || !activeRunningJob.printingStartTime) {
      setLiveElapsedSeconds(0);
      return;
    }

    const startMs = new Date(activeRunningJob.printingStartTime).getTime();

    const updateTimer = () => {
      const nowMs = Date.now();
      const elapsedSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      setLiveElapsedSeconds(elapsedSec);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeRunningJob]);

  // Helper to format live seconds into HH:MM:SS
  const formatLiveSeconds = (totalSec) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Re-ordering Handlers (Admin, Plant Manager, Production Manager only)
  const handleMoveQueueItem = (orderId, direction) => {
    if (!canRearrangeQueue) return;

    setQueueOrderIds(prev => {
      const idx = prev.indexOf(orderId);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;

      const updated = [...prev];
      const temp = updated[idx];
      updated[idx] = updated[targetIdx];
      updated[targetIdx] = temp;

      if (onReorderQueue) {
        onReorderQueue(updated);
      }
      return updated;
    });
  };

  // Start Job Handler
  const handleStartJobClick = (order) => {
    const assignedMachineId = activeMachineSelection[order.id] || order.machineId || rotogravureMachines[0]?.id || 'MAC-ROTO-1';
    const startTime = new Date().toISOString();

    const startedOrder = {
      ...order,
      status: 'In Production',
      printingStatus: 'In Production',
      machineId: assignedMachineId,
      printingStartTime: startTime,
      printingEndTime: null
    };

    if (onStartJob) {
      onStartJob(startedOrder, assignedMachineId, startTime);
    } else if (onUpdateOrder) {
      onUpdateOrder(startedOrder);
    }

    // Automatically open active job details screen
    setActiveRunningJob(startedOrder);
  };

  // End Job Handler
  const handleEndJobClick = (order) => {
    const endTime = new Date().toISOString();
    const startTimeMs = new Date(order.printingStartTime || Date.now() - 3600000).getTime();
    const durationMinutes = Math.max(1, Math.round((new Date(endTime).getTime() - startTimeMs) / 60000));
    const durationHours = Math.floor(durationMinutes / 60);
    const remainingMins = durationMinutes % 60;
    const durationFormatted = durationHours > 0 ? `${durationHours}h ${remainingMins}m` : `${durationMinutes}m`;

    const completedOrder = {
      ...order,
      status: 'In Production',
      printingStatus: 'Completed',
      printingEndTime: endTime,
      printingDurationMinutes: durationMinutes,
      printingDurationFormatted: durationFormatted
    };

    if (onEndJob) {
      onEndJob(completedOrder, endTime, durationMinutes);
    } else if (onUpdateOrder) {
      onUpdateOrder(completedOrder);
    }

    setActiveRunningJob(null);
    alert(`🎉 Printing Run for "${order.jobName}" Completed!\nRun Duration: ${durationFormatted} (${durationMinutes} mins).\nStatus updated across Production Records and Order Management.`);
  };

  // Machine Management Modal Actions
  const handleOpenAddMachine = () => {
    setEditingMachineId(null);
    setMachineName('');
    setMachineType('Rotogravure');
    setMachineColors(8);
    setMachineMaxSpeed(250);
    setMachineMaxWidth(1200);
    setMachineOperator('Plant Operator');
    setMachineLocation('Bay 1 - Rotogravure Hall');
    setMachineStatus('Active');
    setIsMachineModalOpen(true);
  };

  const handleOpenEditMachine = (mac) => {
    setEditingMachineId(mac.id);
    setMachineName(mac.name || '');
    setMachineType(mac.type || 'Rotogravure');
    setMachineColors(mac.colors || 8);
    setMachineMaxSpeed(mac.maxSpeedMpm || 250);
    setMachineMaxWidth(mac.maxWidthMm || 1200);
    setMachineOperator(mac.operator || 'Plant Operator');
    setMachineLocation(mac.location || 'Printing Hall');
    setMachineStatus(mac.status || 'Active');
    setIsMachineModalOpen(true);
  };

  const handleSaveMachineForm = (e) => {
    e.preventDefault();
    if (!machineName.trim()) {
      alert("Please enter Machine Name!");
      return;
    }

    const machineData = {
      id: editingMachineId || `MAC-ROTO-${Math.floor(10 + Math.random() * 90)}`,
      name: machineName,
      type: machineType,
      colors: parseInt(machineColors) || 8,
      maxSpeedMpm: parseFloat(machineMaxSpeed) || 250,
      maxWidthMm: parseFloat(machineMaxWidth) || 1200,
      status: machineStatus,
      operator: machineOperator,
      location: machineLocation
    };

    if (editingMachineId) {
      if (onUpdateMachine) onUpdateMachine(machineData);
      alert(`Printing Machine "${machineData.name}" updated successfully!`);
    } else {
      if (onSaveMachine) onSaveMachine(machineData);
      alert(`Printing Machine "${machineData.name}" added successfully!`);
    }

    setIsMachineModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Header & Navigation Bar */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
            <Printer style={{ color: '#0284c7' }} /> Printing Machine Scheduler & Execution Hub
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Live Shop Floor Queue • Job Start & End Time Tracking • High-Resolution Artwork Verification
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            className={`btn-secondary ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
            style={{ 
              background: activeTab === 'queue' ? '#0284c7' : 'transparent', 
              color: activeTab === 'queue' ? '#fff' : 'inherit',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <PlayCircle size={16} /> Ready Queue ({readyQueueOrders.length})
          </button>

          <button 
            className={`btn-secondary ${activeTab === 'machines' ? 'active' : ''}`}
            onClick={() => setActiveTab('machines')}
            style={{ 
              background: activeTab === 'machines' ? '#0284c7' : 'transparent', 
              color: activeTab === 'machines' ? '#fff' : 'inherit',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Sliders size={16} /> Printing Presses ({rotogravureMachines.length})
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: READY QUEUE & LIVE EXECUTION HUB (DEFAULT)                         */}
      {/* ========================================================================= */}
      {activeTab === 'queue' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Queue Filter Bar & RBAC Notice */}
          <div className="glass-panel" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-secondary)' }}>Filters:</span>
              
              {/* Machine Filter */}
              <select 
                className="form-control" 
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.85rem', fontWeight: '600' }}
                value={selectedMachineFilter}
                onChange={e => setSelectedMachineFilter(e.target.value)}
              >
                <option value="All">All Printing Presses</option>
                {rotogravureMachines.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select 
                className="form-control" 
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.85rem', fontWeight: '600' }}
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="All">All Queue Statuses</option>
                <option value="In Production">⚡ In Production</option>
                <option value="Ready">🟢 Ready to Start</option>
                <option value="Overdue">🔴 Overdue Orders</option>
              </select>
            </div>

            {/* Queue Re-arrangement Access Status Badge */}
            <div>
              {canRearrangeQueue ? (
                <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '6px 12px', background: '#dcfce7', color: '#15803d' }}>
                  <Move size={14} /> Queue Re-arrangement Enabled ({currentUser?.role || 'Manager'})
                </span>
              ) : (
                <span className="badge badge-neutral" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '6px 12px', background: '#f1f5f9', color: '#64748b' }}>
                  <Lock size={13} /> Queue Priority Fixed by Plant Management
                </span>
              )}
            </div>
          </div>

          {/* Active Job Alert Banner (If any job is currently in production) */}
          {readyQueueOrders.filter(o => o.isCurrentlyInProduction).length > 0 && (
            <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '1.5px solid #3b82f6', borderRadius: '12px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ background: '#2563eb', color: '#ffffff', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={22} className="animate-pulse" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: '800', textTransform: 'uppercase', color: '#1d4ed8', letterSpacing: '0.5px' }}>
                      Active Live Production Run:
                    </span>
                    <span className="badge" style={{ background: '#2563eb', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800' }}>
                      {readyQueueOrders.filter(o => o.isCurrentlyInProduction).length} Job(s) Running
                    </span>
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>
                    {readyQueueOrders.find(o => o.isCurrentlyInProduction)?.jobName}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button 
                  className="btn-primary"
                  style={{ background: '#2563eb', borderColor: '#2563eb', padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}
                  onClick={() => setActiveRunningJob(readyQueueOrders.find(o => o.isCurrentlyInProduction))}
                >
                  <Eye size={16} /> Open Job Run Screen & Artwork
                </button>
              </div>
            </div>
          )}

          {/* Queue Cards List */}
          {filteredQueue.length === 0 ? (
            <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center' }}>
              <Printer size={48} style={{ color: '#94a3b8', margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-primary)' }}>No Orders in the Queue</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>
                All confirmed manufacturing orders are either completed or filtered out.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredQueue.map((order, idx) => {
                const assignedMachineId = activeMachineSelection[order.id] || order.machineId || rotogravureMachines[0]?.id || 'MAC-ROTO-1';
                const assignedMachine = rotogravureMachines.find(m => m.id === assignedMachineId) || rotogravureMachines[0];

                return (
                  <div 
                    key={order.id} 
                    className="glass-card" 
                    style={{ 
                      padding: '18px 20px', 
                      borderRadius: '12px',
                      borderLeft: order.isCurrentlyInProduction 
                        ? '6px solid #2563eb' 
                        : order.isOverdue 
                        ? '6px solid #dc2626' 
                        : '6px solid #059669',
                      display: 'grid',
                      gridTemplateColumns: canRearrangeQueue ? '45px 1.4fr 1.6fr 1.2fr' : '1.4fr 1.6fr 1.2fr',
                      gap: '16px',
                      alignItems: 'center',
                      background: order.isCurrentlyInProduction ? '#f8fafc' : '#ffffff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}
                  >
                    {/* Move Up / Move Down Priority Controls (Admin / Plant Manager / Production Manager Only) */}
                    {canRearrangeQueue && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '4px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Move Priority Up"
                          disabled={idx === 0}
                          onClick={() => handleMoveQueueItem(order.id, 'up')}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b' }}>#{idx + 1}</span>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '4px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Move Priority Down"
                          disabled={idx === filteredQueue.length - 1}
                          onClick={() => handleMoveQueueItem(order.id, 'down')}
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                    )}

                    {/* Job Order & Artwork Preview Thumbnail */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      {/* Artwork Thumbnail with Click to Zoom */}
                      <div 
                        style={{ 
                          width: '64px', 
                          height: '64px', 
                          borderRadius: '8px', 
                          background: '#f1f5f9', 
                          border: '1px solid #cbd5e1', 
                          overflow: 'hidden', 
                          flexShrink: 0,
                          cursor: order.artworkUrl ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative'
                        }}
                        onClick={() => {
                          if (order.artworkUrl) {
                            setZoomArtworkSrc(order.artworkUrl);
                            setIsArtworkZoomOpen(true);
                          }
                        }}
                        title={order.artworkUrl ? "Click to Zoom Artwork" : "No Artwork Attached"}
                      >
                        {order.artworkUrl ? (
                          <img 
                            src={order.artworkUrl} 
                            alt={order.jobName} 
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                          />
                        ) : (
                          <ImageIcon size={24} style={{ color: '#94a3b8' }} />
                        )}
                        {order.artworkUrl && (
                          <div style={{ position: 'absolute', bottom: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', borderRadius: '3px', padding: '2px', color: '#ffffff' }}>
                            <Maximize2 size={10} />
                          </div>
                        )}
                      </div>

                      {/* Job Title & Client */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#0284c7' }}>
                            {order.jobCode || order.id}
                          </span>
                          {order.isCurrentlyInProduction ? (
                            <span className="badge" style={{ background: '#2563eb', color: '#ffffff', fontSize: '0.7rem', fontWeight: '800' }}>
                              ⚡ IN PRODUCTION
                            </span>
                          ) : order.isOverdue ? (
                            <span className="badge badge-danger" style={{ fontSize: '0.7rem', fontWeight: '800' }}>
                              OVERDUE
                            </span>
                          ) : !order.isMaterialReady ? (
                            <span className="badge badge-warning" style={{ fontSize: '0.7rem', fontWeight: '800' }}>
                              MATERIAL PENDING
                            </span>
                          ) : order.printingEndTime ? (
                            <span className="badge badge-neutral" style={{ fontSize: '0.7rem', fontWeight: '800', background: '#e2e8f0', color: '#334155' }}>
                              PRINTING COMPLETED
                            </span>
                          ) : (
                            <span className="badge badge-success" style={{ fontSize: '0.7rem', fontWeight: '800' }}>
                              READY
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
                          {order.jobName}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <Building2 size={13} /> {order.clientName || 'Direct Client'}
                        </div>
                      </div>
                    </div>

                    {/* Technical Specifications Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Printing Width</span>
                        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{order.widthMm} mm</strong>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Order Qty</span>
                        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{order.printQtyKg} kg</strong>
                        {order.printLayerNetKg > 0 && (
                          <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'block' }}>({order.printLayerNetKg} kg film)</span>
                        )}
                      </div>

                      <div>
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Target Print Length</span>
                        <strong style={{ fontSize: '0.92rem', color: '#0284c7' }}>{order.targetMeters.toLocaleString()} m</strong>
                        <span style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: '600', display: 'block' }}>
                          {order.printLayerGsm} GSM ({order.printFilmType} {order.micron}µ)
                        </span>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Colors</span>
                        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{order.colorsCount} Col</strong>
                      </div>
                    </div>

                    {/* Machine Assignment & Execution Action Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                      {/* Machine Selector */}
                      {!order.isCurrentlyInProduction && (
                        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Printer size={14} style={{ color: '#64748b' }} />
                          <select
                            className="form-control"
                            style={{ padding: '5px 10px', fontSize: '0.8rem', fontWeight: '600' }}
                            value={assignedMachineId}
                            onChange={e => setActiveMachineSelection(prev => ({ ...prev, [order.id]: e.target.value }))}
                          >
                            {rotogravureMachines.map(m => (
                              <option key={m.id} value={m.id}>{m.name} ({m.colors}C)</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'flex-end' }}>
                        {order.isCurrentlyInProduction ? (
                          <>
                            <button
                              className="btn-primary"
                              style={{ background: '#2563eb', borderColor: '#2563eb', padding: '8px 14px', fontSize: '0.85rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
                              onClick={() => setActiveRunningJob(order)}
                            >
                              <Eye size={15} /> View Job Run
                            </button>

                            <button
                              className="btn-primary"
                              style={{ background: '#dc2626', borderColor: '#dc2626', padding: '8px 14px', fontSize: '0.85rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
                              onClick={() => handleEndJobClick(order)}
                            >
                              <StopCircle size={15} /> End Job
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn-primary"
                            style={{ background: '#059669', borderColor: '#059669', padding: '8px 18px', fontSize: '0.88rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}
                            onClick={() => handleStartJobClick(order)}
                          >
                            <PlayCircle size={17} /> Start Job
                          </button>
                        )}
                      </div>

                      {/* Run Time Stamp Indicator */}
                      {order.printingDurationFormatted && !order.isCurrentlyInProduction && (
                        <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} /> Last Run: {order.printingDurationFormatted}
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ROTOGRAVURE PRINTING PRESSES CONFIGURATION                         */}
      {/* ========================================================================= */}
      {activeTab === 'machines' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-primary)' }}>
              Rotogravure Printing Presses & Plant Line Configurations
            </h3>
            {canRearrangeQueue && (
              <button 
                className="btn-primary"
                style={{ background: '#0284c7', borderColor: '#0284c7', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}
                onClick={handleOpenAddMachine}
              >
                <Plus size={16} /> Add Printing Press
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
            {rotogravureMachines.map(mac => {
              const activeOrderOnMachine = readyQueueOrders.find(o => o.isCurrentlyInProduction && (o.machineId === mac.id || activeMachineSelection[o.id] === mac.id));

              return (
                <div key={mac.id} className="glass-card" style={{ padding: '20px', borderRadius: '12px', borderTop: '4px solid #0284c7' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)' }}>{mac.name}</h4>
                      <span className="badge badge-neutral" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                        {mac.type || '8-Color Rotogravure'} • {mac.location || 'Bay 1'}
                      </span>
                    </div>

                    <span className={`badge ${activeOrderOnMachine ? 'badge-primary' : 'badge-success'}`} style={{ fontWeight: '800', fontSize: '0.78rem' }}>
                      {activeOrderOnMachine ? '⚡ RUNNING' : '🟢 READY'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Max Speed</span>
                      <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>{mac.maxSpeedMpm || 250} m/min</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Max Width</span>
                      <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>{mac.maxWidthMm || 1200} mm</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Colors</span>
                      <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>{mac.colors || 8} Color Units</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Assigned Operator</span>
                      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0f172a' }}>{mac.operator || 'Shop Floor Crew'}</div>
                    </div>
                  </div>

                  {activeOrderOnMachine && (
                    <div style={{ marginTop: '14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 12px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#1d4ed8', textTransform: 'uppercase', display: 'block' }}>Current Running Job:</span>
                      <strong style={{ color: '#1e40af', fontSize: '0.95rem' }}>{activeOrderOnMachine.jobName}</strong>
                    </div>
                  )}

                  {canRearrangeQueue && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                      <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => handleOpenEditMachine(mac)}>
                        <Edit3 size={14} /> Edit
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ACTIVE JOB ORDER DETAILS & RUNNING TIMER EXECUTION SCREEN           */}
      {/* ========================================================================= */}
      {activeRunningJob && (
        <div className="modal-overlay" onClick={() => setActiveRunningJob(null)}>
          <div className="modal-content" style={{ maxWidth: '1080px', width: '96%', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="badge" style={{ background: '#2563eb', color: '#ffffff', fontWeight: '800', fontSize: '0.8rem', padding: '4px 10px' }}>
                    ⚡ ACTIVE PRINTING RUN
                  </span>
                  <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '700' }}>
                    Job Code: <strong>{activeRunningJob.jobCode || activeRunningJob.id}</strong>
                  </span>
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0f172a', marginTop: '4px' }}>
                  {activeRunningJob.jobName}
                </h2>
                <p style={{ fontSize: '0.88rem', color: '#64748b', marginTop: '2px' }}>
                  Client: <strong>{activeRunningJob.clientName || 'Direct Client'}</strong> • Machine: <strong>{rotogravureMachines.find(m => m.id === (activeRunningJob.machineId || activeMachineSelection[activeRunningJob.id]))?.name || 'Rotogravure Press 1'}</strong>
                </p>
              </div>

              {/* Close Button */}
              <button className="btn-secondary" style={{ padding: '8px' }} onClick={() => setActiveRunningJob(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Live Ticker Clock Banner */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#ffffff', borderRadius: '12px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
              <div>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700', letterSpacing: '0.5px' }}>
                  Job Start Timestamp:
                </span>
                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#38bdf8', marginTop: '2px' }}>
                  {activeRunningJob.printingStartTime ? new Date(activeRunningJob.printingStartTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) : 'Just Started'}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '700', letterSpacing: '0.5px' }}>
                  Live Elapsed Run Time:
                </span>
                <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#4ade80', fontFamily: 'monospace', letterSpacing: '1px' }}>
                  ⏱ {formatLiveSeconds(liveElapsedSeconds)}
                </div>
              </div>
            </div>

            {/* Main Content Grid: Artwork Left & Specs Right */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr', gap: '24px', marginBottom: '24px' }}>
              
              {/* Left Column: Latest Available Artwork Viewer */}
              <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ImageIcon size={18} style={{ color: '#0284c7' }} /> Latest Approved Artwork Preview
                  </h4>

                  {activeRunningJob.artworkUrl && (
                    <button 
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => {
                        setZoomArtworkSrc(activeRunningJob.artworkUrl);
                        setIsArtworkZoomOpen(true);
                      }}
                    >
                      <Maximize2 size={13} /> Fullscreen Zoom
                    </button>
                  )}
                </div>

                {/* Artwork Display Box */}
                <div style={{ flex: 1, minHeight: '280px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '10px' }}>
                  {activeRunningJob.artworkUrl ? (
                    <img 
                      src={activeRunningJob.artworkUrl} 
                      alt={activeRunningJob.jobName} 
                      style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'contain', cursor: 'pointer' }}
                      onClick={() => {
                        setZoomArtworkSrc(activeRunningJob.artworkUrl);
                        setIsArtworkZoomOpen(true);
                      }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                      <ImageIcon size={48} style={{ margin: '0 auto 10px', color: '#cbd5e1' }} />
                      <p style={{ fontSize: '0.85rem', fontWeight: '600' }}>No artwork image attached to this Job Master.</p>
                    </div>
                  )}
                </div>

                {activeRunningJob.artworkUrl && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Verified Production Artwork Asset</span>
                    <a 
                      href={activeRunningJob.artworkUrl} 
                      download={`Artwork_${activeRunningJob.jobCode || activeRunningJob.id}.png`}
                      target="_blank" 
                      rel="noreferrer"
                      className="btn-secondary"
                      style={{ padding: '5px 12px', fontSize: '0.78rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Download size={13} /> Download File
                    </a>
                  </div>
                )}
              </div>

              {/* Right Column: Key Manufacturing Job Parameters */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px', padding: '18px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', marginBottom: '14px' }}>
                    Production Specifications & Targets
                  </h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Printing Width</span>
                      <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#0284c7', marginTop: '2px' }}>
                        {activeRunningJob.widthMm} mm
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Order Quantity</span>
                      <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#0f172a', marginTop: '2px' }}>
                        {activeRunningJob.printQtyKg} kg
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Target Print Meters</span>
                      <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#059669', marginTop: '2px' }}>
                        {activeRunningJob.targetMeters.toLocaleString()} m
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: '700', display: 'block', marginTop: '2px' }}>
                        {activeRunningJob.printLayerGsm} GSM ({activeRunningJob.printFilmType} {activeRunningJob.micron}µ)
                      </span>
                    </div>

                    <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Number of Colors</span>
                      <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#7c3aed', marginTop: '2px' }}>
                        {activeRunningJob.colorsCount} Colors
                      </div>
                    </div>
                  </div>

                  {/* Substrate Structure */}
                  <div style={{ marginTop: '14px', background: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>
                      Substrate Structure & Micron:
                    </span>
                    <strong style={{ fontSize: '0.95rem', color: '#0f172a', display: 'block', marginTop: '2px' }}>
                      {activeRunningJob.structure}
                    </strong>
                  </div>

                  {/* Cylinder Color Sequence (If Available) */}
                  {Array.isArray(activeRunningJob.cylinderColors) && activeRunningJob.cylinderColors.length > 0 && (
                    <div style={{ marginTop: '14px' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                        Cylinder Color Sequence:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {activeRunningJob.cylinderColors.map((col, cIdx) => (
                          <span key={cIdx} className="badge badge-neutral" style={{ fontSize: '0.75rem', fontWeight: '700', padding: '4px 8px' }}>
                            {cIdx + 1}. {typeof col === 'string' ? col : col.colorName || col.shade || `Color ${cIdx + 1}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>

            </div>

            {/* Bottom Actions Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '18px', borderTop: '2px solid #e2e8f0' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ padding: '10px 20px', fontWeight: '700' }}
                onClick={() => setActiveRunningJob(null)}
              >
                ← Back to Queue
              </button>

              <button 
                type="button" 
                className="btn-primary" 
                style={{ background: '#dc2626', borderColor: '#dc2626', padding: '12px 28px', fontSize: '1rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)' }}
                onClick={() => handleEndJobClick(activeRunningJob)}
              >
                <StopCircle size={20} /> Complete & End Job
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FULLSCREEN ARTWORK ZOOM VIEWER                                     */}
      {/* ========================================================================= */}
      {isArtworkZoomOpen && (
        <div className="modal-overlay" onClick={() => setIsArtworkZoomOpen(false)} style={{ background: 'rgba(0,0,0,0.85)', zIndex: 9999 }}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
            <img 
              src={zoomArtworkSrc} 
              alt="High Resolution Artwork" 
              style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} 
            />
            <button 
              className="btn-secondary"
              style={{ position: 'absolute', top: '-40px', right: '0px', color: '#ffffff', background: 'rgba(255,255,255,0.2)', border: 'none', padding: '8px' }}
              onClick={() => setIsArtworkZoomOpen(false)}
            >
              <X size={22} />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT PRINTING MACHINE MODAL                                   */}
      {/* ========================================================================= */}
      {isMachineModalOpen && (
        <div className="modal-overlay" onClick={() => setIsMachineModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '540px', width: '96%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>
                {editingMachineId ? 'Edit Rotogravure Press' : 'Add New Rotogravure Press'}
              </h3>
              <button className="btn-secondary" style={{ padding: '6px' }} onClick={() => setIsMachineModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveMachineForm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Machine Name *
                </label>
                <input 
                  type="text" 
                  className="form-control" 
                  required 
                  value={machineName} 
                  onChange={e => setMachineName(e.target.value)} 
                  placeholder="e.g. Rotogravure Press 1 (High Speed)"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Number of Colors
                  </label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={machineColors} 
                    onChange={e => setMachineColors(e.target.value)} 
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Max Width (mm)
                  </label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={machineMaxWidth} 
                    onChange={e => setMachineMaxWidth(e.target.value)} 
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Max Speed (m/min)
                  </label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={machineMaxSpeed} 
                    onChange={e => setMachineMaxSpeed(e.target.value)} 
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Status
                  </label>
                  <select className="form-control" value={machineStatus} onChange={e => setMachineStatus(e.target.value)}>
                    <option value="Active">Active</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsMachineModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: '#0284c7', borderColor: '#0284c7', fontWeight: '700' }}>
                  {editingMachineId ? 'Save Changes' : 'Create Machine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
