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
  Plus,
  Search,
  CheckCircle,
  FileCheck,
  Calendar,
  BarChart3,
  Award,
  Filter,
  Scale,
  FileText,
  CheckCheck
} from 'lucide-react';
import { 
  initialMachines, 
  calculatePrintingScheduleMetrics,
  isOrderOverdue,
  FILM_DENSITIES
} from '../factoryStore';
import WeighingScaleCaptureButton from './WeighingScaleCaptureButton';

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
  // Navigation Tabs: 'queue' (Ready Queue - Default) | 'completed' (Completed Jobs) | 'machines' (Press Configuration)
  const [activeTab, setActiveTab] = useState('queue');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMachineFilter, setSelectedMachineFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'In Production' | 'Ready' | 'Overdue' | 'Material Pending'

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

  // End Job Information & Confirmation Modal State
  const [isEndJobModalOpen, setIsEndJobModalOpen] = useState(false);
  const [endJobTargetOrder, setEndJobTargetOrder] = useState(null);
  const [endJobStep, setEndJobStep] = useState('input'); // 'input' | 'confirm'
  const [inputActualMeters, setInputActualMeters] = useState('');
  const [inputInkGsm, setInputInkGsm] = useState('1.5');
  const [inputPrintedOutputKg, setInputPrintedOutputKg] = useState('');
  const [inputOperatorNotes, setInputOperatorNotes] = useState('');
  const [isSubmittingEndJob, setIsSubmittingEndJob] = useState(false);

  // Custom Queue Ordering State
  const [queueOrderIds, setQueueOrderIds] = useState(() => {
    return (orders || []).map(o => o.id);
  });

  // Keep queueOrderIds in sync with orders list
  useEffect(() => {
    setQueueOrderIds(prev => {
      const currentIds = (orders || []).map(o => o.id);
      const filteredPrev = prev.filter(id => currentIds.includes(id));
      const newIds = currentIds.filter(id => !prev.includes(id));
      return [...filteredPrev, ...newIds];
    });
  }, [orders]);

  // Derive All Enriched Manufacturing Orders
  const allEnrichedOrders = useMemo(() => {
    const orderMap = new Map((orders || []).map(o => [o.id, o]));

    const orderedList = queueOrderIds
      .map(id => orderMap.get(id))
      .filter(Boolean);

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
      const printingDurationMinutes = order.printingDurationMinutes || matchingProdRecord?.printingDurationMinutes || null;

      // Actuals captured at completion
      const actualMetersPrinted = order.actualMetersPrinted || matchingProdRecord?.actualMetersPrinted || targetMeters;
      const inkGsmInSpeed = order.inkGsmInSpeed || matchingProdRecord?.inkGsmInSpeed || inkGsm;
      const printedOutputKg = order.printedOutputKg || matchingProdRecord?.qtyFirstPassL1 || printLayerNetKg || printQtyKg;

      // STRICT CHECK: Only a job with an active press run (started and not yet ended) is 'In Production'
      const isCurrentlyInProduction = Boolean(
        order.printingStatus === 'In Production' || 
        matchingProdRecord?.printingStatus === 'In Production' || 
        (printingStartTime && !printingEndTime)
      );

      const isPrintingCompleted = Boolean(
        printingEndTime || 
        order.printingStatus === 'Completed' || 
        matchingProdRecord?.stages?.printing?.status === 'Completed'
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
        isPrintingCompleted,
        printingStartTime,
        printingEndTime,
        printingDurationMinutes,
        printingDurationFormatted,
        actualMetersPrinted,
        inkGsmInSpeed,
        printedOutputKg,
        targetMeters,
        printQtyKg,
        priorityTag: isCurrentlyInProduction 
          ? 'IN PRODUCTION' 
          : isOverdue 
          ? 'OVERDUE' 
          : !isMaterialReady 
          ? 'MATERIAL PENDING' 
          : isPrintingCompleted 
          ? 'PRINTING COMPLETED' 
          : 'READY'
      };
    });
  }, [orders, inventory, jobMasters, cylinders, productionRecords, queueOrderIds]);

  // 1. Ready Queue Orders (Active & Unfinished Jobs Only)
  const readyQueueOrders = useMemo(() => {
    return allEnrichedOrders.filter(order => !order.isPrintingCompleted);
  }, [allEnrichedOrders]);

  // 2. Completed Printing Orders (Finished Press Jobs Only)
  const completedPrintingOrders = useMemo(() => {
    return allEnrichedOrders
      .filter(order => order.isPrintingCompleted)
      .sort((a, b) => new Date(b.printingEndTime || 0) - new Date(a.printingEndTime || 0));
  }, [allEnrichedOrders]);

  // Filtered Ready Queue View
  const filteredQueue = useMemo(() => {
    return readyQueueOrders.filter(order => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesJobName = (order.jobName || '').toLowerCase().includes(q);
        const matchesClient = (order.clientName || '').toLowerCase().includes(q);
        const matchesJobCode = (order.jobCode || order.id || '').toLowerCase().includes(q);
        if (!matchesJobName && !matchesClient && !matchesJobCode) return false;
      }
      // Machine filter
      if (selectedMachineFilter !== 'All') {
        const assignedMachine = activeMachineSelection[order.id] || order.machineId || rotogravureMachines[0]?.id;
        if (assignedMachine !== selectedMachineFilter) return false;
      }
      // Status filter
      if (statusFilter === 'In Production' && !order.isCurrentlyInProduction) return false;
      if (statusFilter === 'Ready' && (order.isCurrentlyInProduction || !order.isMaterialReady || order.isOverdue)) return false;
      if (statusFilter === 'Overdue' && (!order.isOverdue || order.isCurrentlyInProduction)) return false;
      if (statusFilter === 'Material Pending' && (order.isMaterialReady || order.isCurrentlyInProduction)) return false;
      return true;
    });
  }, [readyQueueOrders, searchQuery, selectedMachineFilter, statusFilter, activeMachineSelection, rotogravureMachines]);

  // Filtered Completed Jobs View
  const filteredCompleted = useMemo(() => {
    return completedPrintingOrders.filter(order => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesJobName = (order.jobName || '').toLowerCase().includes(q);
        const matchesClient = (order.clientName || '').toLowerCase().includes(q);
        const matchesJobCode = (order.jobCode || order.id || '').toLowerCase().includes(q);
        if (!matchesJobName && !matchesClient && !matchesJobCode) return false;
      }
      if (selectedMachineFilter !== 'All') {
        const assignedMachine = order.machineId || rotogravureMachines[0]?.id;
        if (assignedMachine !== selectedMachineFilter) return false;
      }
      return true;
    });
  }, [completedPrintingOrders, searchQuery, selectedMachineFilter, rotogravureMachines]);

  // KPI Metrics for Completed Jobs
  const completedMetrics = useMemo(() => {
    const totalJobs = completedPrintingOrders.length;
    const totalMeters = completedPrintingOrders.reduce((sum, o) => sum + (parseFloat(o.actualMetersPrinted) || o.targetMeters || 0), 0);
    const totalKg = completedPrintingOrders.reduce((sum, o) => sum + (parseFloat(o.printedOutputKg) || o.printQtyKg || 0), 0);
    const totalDurationMins = completedPrintingOrders.reduce((sum, o) => sum + (parseFloat(o.printingDurationMinutes) || 0), 0);
    const avgDurationMins = totalJobs > 0 ? Math.round(totalDurationMins / totalJobs) : 0;
    const avgHours = Math.floor(avgDurationMins / 60);
    const avgMins = avgDurationMins % 60;
    const avgFormatted = avgHours > 0 ? `${avgHours}h ${avgMins}m` : `${avgMins}m`;

    return {
      totalJobs,
      totalMeters,
      totalKg,
      avgFormatted
    };
  }, [completedPrintingOrders]);

  // Live Timer Effect for Active Running Job
  useEffect(() => {
    if (!activeRunningJob || !activeRunningJob.printingStartTime) {
      setLiveElapsedSeconds(0);
      return;
    }

    const startTimestamp = new Date(activeRunningJob.printingStartTime).getTime();
    const updateElapsed = () => {
      const now = Date.now();
      const diffSecs = Math.max(0, Math.floor((now - startTimestamp) / 1000));
      setLiveElapsedSeconds(diffSecs);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeRunningJob]);

  // Format live seconds as HH:MM:SS
  const formatLiveSeconds = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Re-ordering queue item handler
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

  // Initiate End Job: Open Pop-up & Prefill Shop Floor Inputs
  const handleInitiateEndJob = (order) => {
    setEndJobTargetOrder(order);
    setInputActualMeters(order.targetMeters ? String(order.targetMeters) : '');
    setInputInkGsm(order.inkGsm ? String(order.inkGsm) : '1.5');
    setInputPrintedOutputKg(order.printLayerNetKg ? String(order.printLayerNetKg) : (order.printQtyKg ? String(order.printQtyKg) : ''));
    setInputOperatorNotes('');
    setEndJobStep('input');
    setIsEndJobModalOpen(true);
  };

  // Proceed to Confirmation Step
  const handleProceedToConfirmation = (e) => {
    e.preventDefault();
    if (!inputActualMeters || parseFloat(inputActualMeters) <= 0) {
      alert("Please enter a valid number for 'Actual Meters Printed'.");
      return;
    }
    if (!inputInkGsm || parseFloat(inputInkGsm) <= 0) {
      alert("Please enter a valid 'Ink GSM (In Speed)'.");
      return;
    }
    if (!inputPrintedOutputKg || parseFloat(inputPrintedOutputKg) <= 0) {
      alert("Please enter a valid 'Printed Output (in kgs)'.");
      return;
    }
    setEndJobStep('confirm');
  };

  // Final Confirmation & Database Save Handler
  const handleConfirmEndJobSave = async () => {
    if (!endJobTargetOrder) return;
    setIsSubmittingEndJob(true);

    try {
      const endTime = new Date().toISOString();
      const startTimeMs = new Date(endJobTargetOrder.printingStartTime || Date.now() - 3600000).getTime();
      const durationMinutes = Math.max(1, Math.round((new Date(endTime).getTime() - startTimeMs) / 60000));
      const durationHours = Math.floor(durationMinutes / 60);
      const remainingMins = durationMinutes % 60;
      const durationFormatted = durationHours > 0 ? `${durationHours}h ${remainingMins}m` : `${durationMinutes}m`;

      const actualMetersNum = parseFloat(inputActualMeters) || endJobTargetOrder.targetMeters || 0;
      const inkGsmNum = parseFloat(inputInkGsm) || 1.5;
      const outputKgNum = parseFloat(inputPrintedOutputKg) || endJobTargetOrder.printQtyKg || 0;

      const endData = {
        endTime,
        durationMinutes,
        durationFormatted,
        actualMetersPrinted: actualMetersNum,
        inkGsmInSpeed: inkGsmNum,
        printedOutputKg: outputKgNum,
        notes: inputOperatorNotes
      };

      const completedOrder = {
        ...endJobTargetOrder,
        status: 'In Production',
        printingStatus: 'Completed',
        printingEndTime: endTime,
        printingDurationMinutes: durationMinutes,
        printingDurationFormatted: durationFormatted,
        actualMetersPrinted: actualMetersNum,
        inkGsmInSpeed: inkGsmNum,
        printedOutputKg: outputKgNum,
        printingNotes: inputOperatorNotes
      };

      if (onEndJob) {
        await onEndJob(completedOrder, endData);
      } else if (onUpdateOrder) {
        await onUpdateOrder(completedOrder);
      }

      setIsEndJobModalOpen(false);
      setActiveRunningJob(null);
      setEndJobTargetOrder(null);
      alert(`🎉 Printing Run for "${completedOrder.jobName}" Completed & Saved!\n\n• Actual Meters: ${actualMetersNum.toLocaleString()} m\n• Ink GSM: ${inkGsmNum} g/m²\n• Printed Output: ${outputKgNum} kg\n• Run Duration: ${durationFormatted}\n\nJob has moved to "Completed Jobs" tab.`);
    } catch (err) {
      console.error("Error ending printing job:", err);
      alert("Failed to save job completion data. Please try again.");
    } finally {
      setIsSubmittingEndJob(false);
    }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* Top Header & Navigation Bar */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderRadius: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)' }}>
              <Printer size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--text-primary)', margin: 0 }}>
                Printing Press Scheduler & Execution Hub
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px', margin: 0 }}>
                Live Shop Floor Ready Queue • Production Parameters Capture • Completed Jobs Archive
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
          <button 
            onClick={() => setActiveTab('queue')}
            style={{ 
              background: activeTab === 'queue' ? '#0284c7' : 'transparent', 
              color: activeTab === 'queue' ? '#ffffff' : '#475569',
              fontWeight: '800',
              fontSize: '0.85rem',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            <PlayCircle size={16} /> 
            Ready Queue 
            <span style={{ background: activeTab === 'queue' ? 'rgba(255,255,255,0.25)' : '#e2e8f0', color: activeTab === 'queue' ? '#ffffff' : '#0f172a', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900' }}>
              {readyQueueOrders.length}
            </span>
          </button>

          <button 
            onClick={() => setActiveTab('completed')}
            style={{ 
              background: activeTab === 'completed' ? '#059669' : 'transparent', 
              color: activeTab === 'completed' ? '#ffffff' : '#475569',
              fontWeight: '800',
              fontSize: '0.85rem',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            <CheckCircle2 size={16} /> 
            Completed Jobs
            <span style={{ background: activeTab === 'completed' ? 'rgba(255,255,255,0.25)' : '#e2e8f0', color: activeTab === 'completed' ? '#ffffff' : '#0f172a', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900' }}>
              {completedPrintingOrders.length}
            </span>
          </button>

          <button 
            onClick={() => setActiveTab('machines')}
            style={{ 
              background: activeTab === 'machines' ? '#0f172a' : 'transparent', 
              color: activeTab === 'machines' ? '#ffffff' : '#475569',
              fontWeight: '800',
              fontSize: '0.85rem',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            <Sliders size={16} /> 
            Printing Presses
            <span style={{ background: activeTab === 'machines' ? 'rgba(255,255,255,0.25)' : '#e2e8f0', color: activeTab === 'machines' ? '#ffffff' : '#0f172a', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900' }}>
              {rotogravureMachines.length}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: READY QUEUE (ACTIVE UNFINISHED JOBS)                                */}
      {/* ========================================================================= */}
      {activeTab === 'queue' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Queue Filter Bar & Controls */}
          <div className="glass-panel" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
              {/* Search Bar */}
              <div style={{ position: 'relative', minWidth: '240px', maxWidth: '340px', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input 
                  type="text"
                  placeholder="Search job, client, order code..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '36px', fontSize: '0.85rem' }}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

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

              {/* Status Pills */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['All', 'In Production', 'Ready', 'Overdue', 'Material Pending'].map(status => {
                  const isSelected = statusFilter === status;
                  return (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '20px',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        border: isSelected ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
                        background: isSelected ? '#e0f2fe' : '#ffffff',
                        color: isSelected ? '#0369a1' : '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      {status === 'In Production' ? '⚡ In Production' : status === 'Ready' ? '🟢 Ready' : status === 'Overdue' ? '🔴 Overdue' : status === 'Material Pending' ? '⚠️ Material Pending' : 'All'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Queue Re-arrangement Access Status Badge */}
            <div>
              {canRearrangeQueue ? (
                <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '6px 12px', background: '#dcfce7', color: '#15803d', fontWeight: '800' }}>
                  <Move size={14} /> Queue Re-arrangement Enabled ({currentUser?.role || 'Manager'})
                </span>
              ) : (
                <span className="badge badge-neutral" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '6px 12px', background: '#f1f5f9', color: '#64748b', fontWeight: '700' }}>
                  <Lock size={13} /> Queue Priority Fixed by Plant Management
                </span>
              )}
            </div>
          </div>

          {/* Active Running Job Highlight Banner if one is running */}
          {readyQueueOrders.some(o => o.isCurrentlyInProduction) && (
            <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)', color: '#ffffff', padding: '16px 20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 16px rgba(30, 58, 138, 0.25)', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulse 2s infinite' }}>
                  <Zap size={20} style={{ color: '#ffffff' }} />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#93c5fd', fontWeight: '800' }}>
                    Active Press Job Running
                  </span>
                  <div style={{ fontSize: '1.1rem', fontWeight: '900' }}>
                    {readyQueueOrders.find(o => o.isCurrentlyInProduction)?.jobName}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  className="btn-primary"
                  style={{ background: '#ffffff', color: '#1e3a8a', fontWeight: '900', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={() => setActiveRunningJob(readyQueueOrders.find(o => o.isCurrentlyInProduction))}
                >
                  <Eye size={16} /> Open Job Run Screen & Artwork
                </button>
                <button
                  className="btn-danger"
                  style={{ background: '#ef4444', color: '#ffffff', fontWeight: '900', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={() => handleInitiateEndJob(readyQueueOrders.find(o => o.isCurrentlyInProduction))}
                >
                  <StopCircle size={16} /> End Job
                </button>
              </div>
            </div>
          )}

          {/* Queue Cards List */}
          {filteredQueue.length === 0 ? (
            <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '12px' }}>
              <Printer size={48} style={{ color: '#94a3b8', margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-primary)' }}>No Active Orders in Ready Queue</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>
                All scheduled jobs are completed. Check the <strong>Completed Jobs</strong> tab for past runs.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredQueue.map((order, idx) => {
                const assignedMachineId = activeMachineSelection[order.id] || order.machineId || rotogravureMachines[0]?.id || 'MAC-ROTO-1';
                const assignedMachine = rotogravureMachines.find(m => m.id === assignedMachineId) || rotogravureMachines[0];

                return (
                  <div 
                    key={order.id} 
                    className="glass-card" 
                    style={{ 
                      padding: '18px 22px', 
                      borderRadius: '14px',
                      borderLeft: order.isCurrentlyInProduction 
                        ? '6px solid #2563eb' 
                        : order.isOverdue 
                        ? '6px solid #dc2626' 
                        : '6px solid #059669',
                      display: 'grid',
                      gridTemplateColumns: canRearrangeQueue ? '45px 1.4fr 1.6fr 1.2fr' : '1.4fr 1.6fr 1.2fr',
                      gap: '18px',
                      alignItems: 'center',
                      background: order.isCurrentlyInProduction ? '#f8fafc' : '#ffffff',
                      boxShadow: order.isCurrentlyInProduction ? '0 4px 16px rgba(37, 99, 235, 0.12)' : '0 2px 8px rgba(0,0,0,0.04)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {/* Move Up / Move Down Priority Controls (Managers Only) */}
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
                          width: '68px', 
                          height: '68px', 
                          borderRadius: '10px', 
                          background: '#f1f5f9', 
                          border: '1.5px solid #cbd5e1', 
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
                          <ImageIcon size={26} style={{ color: '#94a3b8' }} />
                        )}
                        {order.artworkUrl && (
                          <div style={{ position: 'absolute', bottom: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', borderRadius: '4px', padding: '2px 4px', color: '#ffffff' }}>
                            <Maximize2 size={10} />
                          </div>
                        )}
                      </div>

                      {/* Job Title & Client */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#0284c7' }}>
                            {order.jobCode || order.id}
                          </span>
                          {order.isCurrentlyInProduction ? (
                            <span className="badge" style={{ background: '#2563eb', color: '#ffffff', fontSize: '0.7rem', fontWeight: '900', letterSpacing: '0.5px' }}>
                              ⚡ IN PRODUCTION
                            </span>
                          ) : order.isOverdue ? (
                            <span className="badge badge-danger" style={{ fontSize: '0.7rem', fontWeight: '900' }}>
                              OVERDUE
                            </span>
                          ) : !order.isMaterialReady ? (
                            <span className="badge badge-warning" style={{ fontSize: '0.7rem', fontWeight: '800' }}>
                              MATERIAL PENDING
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>Printing Width</span>
                        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{order.widthMm} mm</strong>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>Order Qty</span>
                        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{order.printQtyKg} kg</strong>
                        {order.printLayerNetKg > 0 && (
                          <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'block' }}>({order.printLayerNetKg} kg film)</span>
                        )}
                      </div>

                      <div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>Target Print Length</span>
                        <strong style={{ fontSize: '0.92rem', color: '#0284c7' }}>{order.targetMeters.toLocaleString()} m</strong>
                        <span style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: '700', display: 'block' }}>
                          {order.printLayerGsm} GSM ({order.printFilmType} {order.micron}µ)
                        </span>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>Colors</span>
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
                            style={{ padding: '5px 10px', fontSize: '0.8rem', fontWeight: '700' }}
                            value={assignedMachineId}
                            onChange={e => setActiveMachineSelection(prev => ({ ...prev, [order.id]: e.target.value }))}
                          >
                            {rotogravureMachines.map(m => (
                              <option key={m.id} value={m.id}>{m.name} ({m.colors}C)</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Execution Action Button */}
                      {order.isCurrentlyInProduction ? (
                        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                          <button
                            className="btn-secondary"
                            style={{ flex: 1, padding: '7px 12px', fontSize: '0.8rem', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                            onClick={() => setActiveRunningJob(order)}
                          >
                            <Eye size={14} /> View Run
                          </button>
                          <button
                            className="btn-danger"
                            style={{ flex: 1, padding: '7px 12px', fontSize: '0.8rem', fontWeight: '800', background: '#dc2626', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                            onClick={() => handleInitiateEndJob(order)}
                          >
                            <StopCircle size={14} /> End Job
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn-primary"
                          style={{
                            width: '100%',
                            padding: '9px 16px',
                            fontSize: '0.88rem',
                            fontWeight: '900',
                            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                            color: '#ffffff',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)'
                          }}
                          onClick={() => handleStartJobClick(order)}
                        >
                          <PlayCircle size={16} /> Start Job
                        </button>
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
      {/* TAB 2: COMPLETED JOBS ARCHIVE                                              */}
      {/* ========================================================================= */}
      {activeTab === 'completed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* KPI Analytics Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '14px', background: '#ffffff' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Award size={24} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Completed Runs</span>
                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0f172a' }}>{completedMetrics.totalJobs} Jobs</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '14px', background: '#ffffff' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Gauge size={24} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Total Meters Printed</span>
                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#2563eb' }}>{completedMetrics.totalMeters.toLocaleString()} m</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '14px', background: '#ffffff' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#fdf4ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={24} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Total Weight Output</span>
                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#9333ea' }}>{completedMetrics.totalKg.toLocaleString()} kg</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '14px', background: '#ffffff' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={24} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Avg Press Runtime</span>
                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#d97706' }}>{completedMetrics.avgFormatted}</div>
              </div>
            </div>
          </div>

          {/* Search & Machine Filter for Completed Archive */}
          <div className="glass-panel" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '260px' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input 
                  type="text"
                  placeholder="Search completed jobs by name, client, code..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '36px', fontSize: '0.85rem' }}
                />
              </div>

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
            </div>

            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '700' }}>
              Showing {filteredCompleted.length} of {completedPrintingOrders.length} completed jobs
            </div>
          </div>

          {/* Completed Jobs Cards List */}
          {filteredCompleted.length === 0 ? (
            <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', borderRadius: '12px' }}>
              <CheckCircle2 size={48} style={{ color: '#94a3b8', margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-primary)' }}>No Completed Jobs Found</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>
                When jobs are started and ended in the Ready Queue, they will be archived here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredCompleted.map((order) => {
                const assignedMachine = rotogravureMachines.find(m => m.id === order.machineId) || rotogravureMachines[0];

                return (
                  <div 
                    key={order.id} 
                    className="glass-card" 
                    style={{ 
                      padding: '18px 22px', 
                      borderRadius: '14px',
                      borderLeft: '6px solid #059669',
                      display: 'grid',
                      gridTemplateColumns: '1.4fr 1.6fr 1.2fr',
                      gap: '18px',
                      alignItems: 'center',
                      background: '#ffffff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}
                  >
                    {/* Job Order & Artwork Preview Thumbnail */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div 
                        style={{ 
                          width: '68px', 
                          height: '68px', 
                          borderRadius: '10px', 
                          background: '#f1f5f9', 
                          border: '1.5px solid #cbd5e1', 
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
                          <ImageIcon size={26} style={{ color: '#94a3b8' }} />
                        )}
                        {order.artworkUrl && (
                          <div style={{ position: 'absolute', bottom: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', borderRadius: '4px', padding: '2px 4px', color: '#ffffff' }}>
                            <Maximize2 size={10} />
                          </div>
                        )}
                      </div>

                      {/* Job Title, Client & Completion Badge */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#059669' }}>
                            {order.jobCode || order.id}
                          </span>
                          <span className="badge badge-success" style={{ fontSize: '0.7rem', fontWeight: '900', background: '#dcfce7', color: '#15803d' }}>
                            ✓ PRINTING COMPLETE
                          </span>
                        </div>

                        <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
                          {order.jobName}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <Building2 size={13} /> {order.clientName || 'Direct Client'} • <Printer size={13} /> {assignedMachine?.name || 'Rotogravure Press'}
                        </div>
                      </div>
                    </div>

                    {/* Technical Output Specifications Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>Actual Meters</span>
                        <strong style={{ fontSize: '0.95rem', color: '#059669' }}>{(parseFloat(order.actualMetersPrinted) || order.targetMeters || 0).toLocaleString()} m</strong>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'block' }}>Target: {order.targetMeters.toLocaleString()}m</span>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>Printed Output</span>
                        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{(parseFloat(order.printedOutputKg) || order.printQtyKg || 0)} kg</strong>
                        <span style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: '700', display: 'block' }}>
                          Ink: {order.inkGsmInSpeed || 1.5} GSM
                        </span>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>Substrate Layer</span>
                        <strong style={{ fontSize: '0.88rem', color: '#0284c7' }}>{order.printFilmType} {order.micron}µ</strong>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'block' }}>{order.printLayerGsm} GSM</span>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block' }}>Colors</span>
                        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{order.colorsCount} Colors</strong>
                      </div>
                    </div>

                    {/* Completion Timestamps & Duration Action */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>
                          Completed: {order.printingEndTime ? new Date(order.printingEndTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Recently'}
                        </span>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: '6px', fontWeight: '800', fontSize: '0.82rem', marginTop: '4px' }}>
                          <Clock size={14} style={{ color: '#16a34a' }} />
                          <span>Run Duration: {order.printingDurationFormatted || 'Completed'}</span>
                        </div>
                      </div>

                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => setActiveRunningJob(order)}
                      >
                        <Eye size={14} /> View Details & Artwork
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PRINTING PRESSES CONFIGURATION & SETTINGS                          */}
      {/* ========================================================================= */}
      {activeTab === 'machines' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderRadius: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-primary)' }}>Rotogravure Printing Presses</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Manage press color units, web width capacities, rated mechanical speed, and plant locations.
              </p>
            </div>

            {canRearrangeQueue && (
              <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: '800' }} onClick={handleOpenAddMachine}>
                <Plus size={16} /> Add Printing Machine
              </button>
            )}
          </div>

          {/* Machine Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
            {rotogravureMachines.map(mac => {
              const activeOrderOnMachine = readyQueueOrders.find(o => 
                o.isCurrentlyInProduction && (o.machineId === mac.id || activeMachineSelection[o.id] === mac.id)
              );

              return (
                <div key={mac.id} className="glass-card" style={{ padding: '22px', borderRadius: '14px', borderTop: '4px solid #0284c7', background: '#ffffff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontSize: '1.15rem', fontWeight: '900', color: 'var(--text-primary)' }}>{mac.name}</h4>
                      <span className="badge badge-neutral" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                        {mac.type || '8-Color Rotogravure'} • {mac.location || 'Bay 1'}
                      </span>
                    </div>

                    <span className={`badge ${activeOrderOnMachine ? 'badge-primary' : 'badge-success'}`} style={{ fontWeight: '800', fontSize: '0.78rem' }}>
                      {activeOrderOnMachine ? '⚡ RUNNING' : '🟢 READY'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px', background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Max Speed</span>
                      <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>{mac.maxSpeedMpm || 250} m/min</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Max Width</span>
                      <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>{mac.maxWidthMm || 1200} mm</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Colors</span>
                      <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>{mac.colors || 8} Color Units</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Assigned Operator</span>
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
                      <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: '700' }} onClick={() => handleOpenEditMachine(mac)}>
                        <Edit3 size={14} /> Edit Press
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
          <div className="modal-content" style={{ maxWidth: '1080px', width: '96%', maxHeight: '92vh', overflowY: 'auto', borderRadius: '16px' }} onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {activeRunningJob.isPrintingCompleted ? (
                    <span className="badge badge-success" style={{ fontWeight: '900', fontSize: '0.8rem', padding: '4px 10px', background: '#dcfce7', color: '#15803d' }}>
                      ✓ COMPLETED JOB DETAILS
                    </span>
                  ) : (
                    <span className="badge" style={{ background: '#2563eb', color: '#ffffff', fontWeight: '900', fontSize: '0.8rem', padding: '4px 10px' }}>
                      ⚡ ACTIVE PRINTING RUN
                    </span>
                  )}
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

            {/* Live Ticker Clock Banner (for Active Job) or Completion Banner (for Completed Job) */}
            {activeRunningJob.isPrintingCompleted ? (
              <div style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)', color: '#ffffff', borderRadius: '12px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', boxShadow: '0 4px 16px rgba(6, 78, 59, 0.2)' }}>
                <div>
                  <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#a7f3d0', fontWeight: '800', letterSpacing: '0.5px' }}>
                    Job Timestamps & Execution Actuals:
                  </span>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#ffffff', marginTop: '2px' }}>
                    Started: {activeRunningJob.printingStartTime ? new Date(activeRunningJob.printingStartTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'} • Ended: {activeRunningJob.printingEndTime ? new Date(activeRunningJob.printingEndTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#a7f3d0', marginTop: '4px' }}>
                    Actual Meters: <strong>{(parseFloat(activeRunningJob.actualMetersPrinted) || activeRunningJob.targetMeters || 0).toLocaleString()} m</strong> • Ink: <strong>{activeRunningJob.inkGsmInSpeed || 1.5} GSM</strong> • Output: <strong>{(parseFloat(activeRunningJob.printedOutputKg) || activeRunningJob.printQtyKg || 0)} kg</strong>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#a7f3d0', fontWeight: '800', letterSpacing: '0.5px' }}>
                    Recorded Total Duration:
                  </span>
                  <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#6ee7b7' }}>
                    ⏱ {activeRunningJob.printingDurationFormatted || 'Completed'}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#ffffff', borderRadius: '12px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                <div>
                  <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '800', letterSpacing: '0.5px' }}>
                    Job Start Timestamp:
                  </span>
                  <div style={{ fontSize: '1rem', fontWeight: '800', color: '#38bdf8', marginTop: '2px' }}>
                    {activeRunningJob.printingStartTime ? new Date(activeRunningJob.printingStartTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) : 'Just Started'}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: '800', letterSpacing: '0.5px' }}>
                    Live Elapsed Run Time:
                  </span>
                  <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#4ade80', fontFamily: 'monospace', letterSpacing: '1px' }}>
                    ⏱ {formatLiveSeconds(liveElapsedSeconds)}
                  </div>
                </div>
              </div>
            )}

            {/* Split Screen Layout: Left Specifications & Cylinder Sequence | Right High-Res Artwork Preview */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '24px', alignItems: 'start' }}>
              
              {/* Left Column: Job Order Technical Specifications */}
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={18} style={{ color: '#0284c7' }} /> Technical Printing Specifications
                </h3>

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
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                      Cylinder Station Sequence:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {activeRunningJob.cylinderColors.map((col, idx) => (
                        <div 
                          key={idx} 
                          style={{ 
                            padding: '4px 10px', 
                            background: '#ffffff', 
                            border: '1px solid #cbd5e1', 
                            borderRadius: '6px', 
                            fontSize: '0.78rem', 
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#0284c7', color: '#ffffff', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900' }}>
                            {idx + 1}
                          </span>
                          <span>{typeof col === 'string' ? col : col.colorName || col.name || `Color ${idx + 1}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Latest Available Artwork Verification */}
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ImageIcon size={18} style={{ color: '#0284c7' }} /> Latest Approved Artwork
                  </h3>

                  {activeRunningJob.artworkUrl && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '5px 10px', fontSize: '0.75rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => {
                          setZoomArtworkSrc(activeRunningJob.artworkUrl);
                          setIsArtworkZoomOpen(true);
                        }}
                      >
                        <Maximize2 size={13} /> Zoom
                      </button>
                      <a 
                        href={activeRunningJob.artworkUrl} 
                        download={`${activeRunningJob.jobName || 'Artwork'}.jpg`}
                        target="_blank" 
                        rel="noreferrer"
                        className="btn-secondary" 
                        style={{ padding: '5px 10px', fontSize: '0.75rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                      >
                        <Download size={13} /> Save
                      </a>
                    </div>
                  )}
                </div>

                <div 
                  style={{ 
                    flex: 1, 
                    minHeight: '280px', 
                    maxHeight: '380px', 
                    background: '#ffffff', 
                    borderRadius: '8px', 
                    border: '1px solid #cbd5e1', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    overflow: 'hidden', 
                    cursor: activeRunningJob.artworkUrl ? 'zoom-in' : 'default',
                    position: 'relative'
                  }}
                  onClick={() => {
                    if (activeRunningJob.artworkUrl) {
                      setZoomArtworkSrc(activeRunningJob.artworkUrl);
                      setIsArtworkZoomOpen(true);
                    }
                  }}
                >
                  {activeRunningJob.artworkUrl ? (
                    <img 
                      src={activeRunningJob.artworkUrl} 
                      alt={activeRunningJob.jobName} 
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                    />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                      <ImageIcon size={48} style={{ margin: '0 auto 8px' }} />
                      <p style={{ fontSize: '0.9rem', fontWeight: '600' }}>No artwork image attached</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* End Job Action Footer (Only shown for active running job) */}
            {!activeRunningJob.isPrintingCompleted && (
              <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '2px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button 
                  className="btn-secondary" 
                  style={{ padding: '10px 20px', fontWeight: '700', fontSize: '0.9rem' }}
                  onClick={() => setActiveRunningJob(null)}
                >
                  Close View
                </button>
                <button 
                  className="btn-danger" 
                  style={{ 
                    padding: '10px 24px', 
                    fontWeight: '900', 
                    fontSize: '0.95rem', 
                    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', 
                    color: '#ffffff', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(220, 38, 38, 0.3)'
                  }}
                  onClick={() => handleInitiateEndJob(activeRunningJob)}
                >
                  <StopCircle size={18} /> End Job & Enter Production Data
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: END JOB POP-UP - SHOP FLOOR INPUTS & CONFIRMATION TAB              */}
      {/* ========================================================================= */}
      {isEndJobModalOpen && endJobTargetOrder && (
        <div className="modal-overlay" onClick={() => !isSubmittingEndJob && setIsEndJobModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '640px', width: '96%', borderRadius: '16px' }} onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '2px solid #e2e8f0', marginBottom: '16px' }}>
              <div>
                <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: '900', fontSize: '0.72rem' }}>
                  PRESS RUN COMPLETION
                </span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0f172a', marginTop: '4px', margin: 0 }}>
                  {endJobStep === 'input' ? 'Enter Final Production Output Data' : 'Review & Confirm Printing Run Data'}
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '2px 0 0' }}>
                  Job: <strong>{endJobTargetOrder.jobName}</strong> ({endJobTargetOrder.jobCode || endJobTargetOrder.id})
                </p>
              </div>

              {!isSubmittingEndJob && (
                <button className="btn-secondary" style={{ padding: '6px' }} onClick={() => setIsEndJobModalOpen(false)}>
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Stepper Tabs Bar */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', marginBottom: '20px' }}>
              <div 
                style={{ 
                  flex: 1, 
                  textAlign: 'center', 
                  padding: '8px', 
                  borderRadius: '8px', 
                  fontSize: '0.82rem', 
                  fontWeight: '800', 
                  background: endJobStep === 'input' ? '#ffffff' : 'transparent',
                  color: endJobStep === 'input' ? '#0284c7' : '#64748b',
                  boxShadow: endJobStep === 'input' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                1. Operator Shop Floor Data
              </div>
              <div 
                style={{ 
                  flex: 1, 
                  textAlign: 'center', 
                  padding: '8px', 
                  borderRadius: '8px', 
                  fontSize: '0.82rem', 
                  fontWeight: '800', 
                  background: endJobStep === 'confirm' ? '#059669' : 'transparent',
                  color: endJobStep === 'confirm' ? '#ffffff' : '#64748b',
                  boxShadow: endJobStep === 'confirm' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                2. Confirmation & Save
              </div>
            </div>

            {/* STEP 1: SHOP FLOOR PRODUCTION INPUT FORM */}
            {endJobStep === 'input' && (
              <form onSubmit={handleProceedToConfirmation} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                
                {/* Field 1: Actual Meters Printed */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                      📏 Actual Meters Printed (m) *
                    </label>
                    <span style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: '700' }}>
                      Target: {endJobTargetOrder.targetMeters.toLocaleString()} m
                    </span>
                  </div>
                  <input 
                    type="number"
                    step="1"
                    min="1"
                    className="form-control"
                    style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', border: '1.5px solid #0284c7', background: '#ffffff' }}
                    placeholder="e.g. 5200"
                    value={inputActualMeters}
                    onChange={e => setInputActualMeters(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Enter final counter meter reading recorded on the press rewinder.
                  </span>
                </div>

                {/* Field 2: Ink GSM (In Speed) */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                      🎨 Ink GSM (In Speed) (g/m²) *
                    </label>
                    <span style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: '700' }}>
                      Standard: 1.50 GSM
                    </span>
                  </div>
                  <input 
                    type="number"
                    step="0.05"
                    min="0.1"
                    className="form-control"
                    style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', border: '1.5px solid #7c3aed', background: '#ffffff' }}
                    placeholder="e.g. 1.50"
                    value={inputInkGsm}
                    onChange={e => setInputInkGsm(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Measured ink application weight on web during running mechanical speed.
                  </span>
                </div>

                {/* Field 3: Printed Output (in kgs) */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                      ⚖️ Printed Output (in kgs) *
                    </label>
                    <WeighingScaleCaptureButton onCapture={(weight) => setInputPrintedOutputKg(String(weight))} />
                  </div>
                  <input 
                    type="number"
                    step="0.1"
                    min="0.1"
                    className="form-control"
                    style={{ fontSize: '1.1rem', fontWeight: '800', color: '#059669', border: '1.5px solid #059669', background: '#ffffff' }}
                    placeholder="e.g. 245.5"
                    value={inputPrintedOutputKg}
                    onChange={e => setInputPrintedOutputKg(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Total net weight of printed rolls before transfer to Lamination / Slitting.
                  </span>
                </div>

                {/* Field 4: Operator Remarks / Notes (Optional) */}
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                    Shift / Operator Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    className="form-control"
                    placeholder="e.g. Viscosity maintained at 15s B4 cup, blade changed at 3000m..."
                    value={inputOperatorNotes}
                    onChange={e => setInputOperatorNotes(e.target.value)}
                    style={{ fontSize: '0.85rem' }}
                  />
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    onClick={() => setIsEndJobModalOpen(false)}
                    style={{ padding: '9px 18px', fontWeight: '700' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn-primary" 
                    style={{ padding: '9px 22px', fontWeight: '900', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    Proceed to Confirmation Review <ChevronRight size={16} />
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: CONFIRMATION TAB & FINAL SUMMARY */}
            {endJobStep === 'confirm' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                
                <div style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', padding: '16px 20px', borderRadius: '12px', color: '#065f46' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle size={22} style={{ color: '#059669' }} />
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900' }}>Confirm Job Completion Summary</h4>
                      <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#047857' }}>
                        Please review the shop floor execution figures before saving to the database.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Data Review Comparison Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  
                  <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Actual Meters Printed</span>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#0284c7', marginTop: '2px' }}>
                      {parseFloat(inputActualMeters).toLocaleString()} m
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Target: {endJobTargetOrder.targetMeters.toLocaleString()} m</span>
                  </div>

                  <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Printed Output (Net Weight)</span>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#059669', marginTop: '2px' }}>
                      {parseFloat(inputPrintedOutputKg).toLocaleString()} kg
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Order Qty: {endJobTargetOrder.printQtyKg} kg</span>
                  </div>

                  <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Ink GSM (In Speed)</span>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#7c3aed', marginTop: '2px' }}>
                      {parseFloat(inputInkGsm).toFixed(2)} GSM
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Measured on running web</span>
                  </div>

                  <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Substrate Layer</span>
                    <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', marginTop: '4px' }}>
                      {endJobTargetOrder.printFilmType} {endJobTargetOrder.micron}µ
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{endJobTargetOrder.printLayerGsm} GSM • {endJobTargetOrder.widthMm} mm width</span>
                  </div>
                </div>

                {inputOperatorNotes && (
                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '800', textTransform: 'uppercase' }}>Operator Notes:</span>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#0f172a' }}>{inputOperatorNotes}</p>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    disabled={isSubmittingEndJob}
                    onClick={() => setEndJobStep('input')}
                    style={{ padding: '9px 18px', fontWeight: '700' }}
                  >
                    ← Back to Edit
                  </button>

                  <button 
                    type="button" 
                    className="btn-success" 
                    disabled={isSubmittingEndJob}
                    onClick={handleConfirmEndJobSave}
                    style={{ 
                      padding: '10px 24px', 
                      fontWeight: '900', 
                      fontSize: '0.95rem', 
                      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', 
                      color: '#ffffff', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)' 
                    }}
                  >
                    {isSubmittingEndJob ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" /> Saving to Database...
                      </>
                    ) : (
                      <>
                        <CheckCheck size={18} /> Confirm & Save to Database
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Fullscreen Artwork Zoom Modal */}
      {isArtworkZoomOpen && zoomArtworkSrc && (
        <div className="modal-overlay" onClick={() => setIsArtworkZoomOpen(false)} style={{ zIndex: 10000 }}>
          <div style={{ position: 'relative', maxWidth: '92vw', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setIsArtworkZoomOpen(false)}
              style={{ position: 'absolute', top: '-14px', right: '-14px', width: '36px', height: '36px', borderRadius: '50%', background: '#0f172a', color: '#ffffff', border: '2px solid #ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10001 }}
            >
              <X size={20} />
            </button>
            <img 
              src={zoomArtworkSrc} 
              alt="Artwork Fullscreen" 
              style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', background: '#ffffff' }} 
            />
          </div>
        </div>
      )}

      {/* Machine Add/Edit Modal */}
      {isMachineModalOpen && (
        <div className="modal-overlay" onClick={() => setIsMachineModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800' }}>
                {editingMachineId ? 'Edit Printing Machine' : 'Add New Rotogravure Press'}
              </h3>
              <button className="btn-secondary" style={{ padding: '6px' }} onClick={() => setIsMachineModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveMachineForm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700' }}>Machine Name *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Rotogravure Press 1 (8-Color)" 
                  value={machineName} 
                  onChange={e => setMachineName(e.target.value)} 
                  required 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700' }}>Colors Capacity *</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={machineColors} 
                    onChange={e => setMachineColors(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700' }}>Max Speed (m/min) *</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={machineMaxSpeed} 
                    onChange={e => setMachineMaxSpeed(e.target.value)} 
                    required 
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700' }}>Max Web Width (mm) *</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={machineMaxWidth} 
                    onChange={e => setMachineMaxWidth(e.target.value)} 
                    required 
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700' }}>Status</label>
                  <select className="form-control" value={machineStatus} onChange={e => setMachineStatus(e.target.value)}>
                    <option value="Active">Active / Operational</option>
                    <option value="Maintenance">Under Maintenance</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700' }}>Plant Location</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Bay 1 - Rotogravure Hall" 
                  value={machineLocation} 
                  onChange={e => setMachineLocation(e.target.value)} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsMachineModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '8px 20px', fontWeight: '800' }}>
                  Save Press Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
