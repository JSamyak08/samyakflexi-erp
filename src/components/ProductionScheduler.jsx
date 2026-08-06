import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Clock, 
  Settings, 
  Plus, 
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
  ArrowDown
} from 'lucide-react';
import { 
  initialMachines, 
  initialProductionSchedules, 
  calculatePrintingScheduleMetrics 
} from '../factoryStore';

export default function ProductionScheduler({
  orders = [],
  inventory = [],
  machines = initialMachines,
  schedules = initialProductionSchedules,
  jobMasters = [],
  onSaveMachine,
  onUpdateMachine,
  onDeleteMachine,
  onSaveSchedule,
  onDeleteSchedule
}) {
  const [activeTab, setActiveTab] = useState('gantt'); // 'gantt', 'queue', 'machines'
  const [selectedDate, setSelectedDate] = useState('2026-08-02');
  const [selectedShiftFilter, setSelectedShiftFilter] = useState('All'); // 'All', 'Day Shift', 'Night Shift'
  
  // Machine Management Modal State
  const [isMachineModalOpen, setIsMachineModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);
  const [machineName, setMachineName] = useState('');
  const [machineType, setMachineType] = useState('8-Color Rotogravure Press');
  const [maxPrintWidthMm, setMaxPrintWidthMm] = useState(1200);
  const [speedMpm, setSpeedMpm] = useState(250);
  const [setupTimeMins, setSetupTimeMins] = useState(60);
  const [hourlyOperatorCost, setHourlyOperatorCost] = useState(1200);
  const [machineStatus, setMachineStatus] = useState('Active');

  // Schedule Event Modal State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [schedulingOrder, setSchedulingOrder] = useState(null);
  const [targetMachineId, setTargetMachineId] = useState('');
  const [targetShift, setTargetShift] = useState('Day Shift');
  const [scheduledDateInput, setScheduledDateInput] = useState('2026-08-02');
  const [startTimeInput, setStartTimeInput] = useState('08:00');
  const [customSpeedInput, setCustomSpeedInput] = useState(250);
  const [customJobChangeoverInput, setCustomJobChangeoverInput] = useState(120);
  const [customRollChangeoverRateInput, setCustomRollChangeoverRateInput] = useState(20);
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [scheduleDate, setScheduleDate] = useState('2026-08-02');
  const [scheduleShift, setScheduleShift] = useState('Day Shift');
  const [plannedMeters, setPlannedMeters] = useState(10000);
  const [scheduledStatus, setScheduledStatus] = useState('Scheduled');
  const [scheduleNotes, setScheduleNotes] = useState('');

  // Drag and drop state
  const [draggedOrder, setDraggedOrder] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(null);

  // Auto-detect Ready for Production Scheduling Queue (Orders where raw materials are available)
  const readyForScheduleOrders = useMemo(() => {
    return orders.map(order => {
      const isOverdue = order.status === 'Delayed' || new Date(order.targetDeliveryDate) < new Date('2026-07-24');
      const reqs = order.materialRequirements || order.rawMaterialRequirements || [];

      // Extract Print Width and Micron — check multiple field paths for
      // compatibility with both Job Punching and Quotation-converted orders
      const layers = order.jobDetails?.layers || order.layers || [];
      const firstLayer = layers[0] || {};
      const firstFilmReq = reqs.find(r => r.micron && r.micron !== '-') || {};
      const widthMm = parseFloat(
        order.printWidthMm ||
        order.jobDetails?.printWidthMm ||
        order.widthMm ||
        firstFilmReq.widthMm ||
        1000
      );
      const micron = parseFloat(
        order.micron ||
        firstLayer.micron ||
        firstFilmReq.micron ||
        12
      );

      // Derive substrate structure string from matching Job Master or order sources
      const matchedJM = (jobMasters || []).find(j => (j.jobName || '').toLowerCase().trim() === (order.jobName || '').toLowerCase().trim());
      const jmLayers = matchedJM?.layers || [];
      const structure = (jmLayers.length > 0 ? jmLayers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ') : null) ||
        (matchedJM?.structure && matchedJM.structure !== 'PET / PE' && matchedJM.structure !== '—' ? matchedJM.structure : null) ||
        (order.structure && order.structure !== 'PET / PE' && order.structure !== '—' ? order.structure : null) ||
        (layers.length > 0 ? layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ') : null) ||
        (reqs.filter(r => r.micron && r.micron !== '-').map(r => `${r.filmType} ${r.micron}µ`).join(' / ')) ||
        '—';

      // Check stock availability for order materials
      let isMaterialReady = true;
      if (reqs.length > 0) {
        isMaterialReady = reqs.every(req => {
          const match = inventory.find(inv => 
            inv.filmType === req.filmType && inv.availableQtyKg >= (req.qtyKg || 0)
          );
          return !!match || req.poIssued || order.status === 'Material Required' || order.status === 'Scheduled';
        });
      }

      const isAlreadyScheduled = schedules.some(s => s.orderId === order.id);

      return {
        ...order,
        widthMm,
        micron,
        structure,
        isOverdue,
        isMaterialReady,
        isAlreadyScheduled,
        priorityTag: isOverdue ? 'HIGH PRIORITY - OVERDUE' : isMaterialReady ? 'READY FOR SCHEDULING' : 'MATERIAL PENDING'
      };
    }).sort((a, b) => {
      // Primary sort: Decreasing order of Print Film Size (Width in mm)
      if (b.widthMm !== a.widthMm) {
        return b.widthMm - a.widthMm;
      }
      // Secondary sort: Decreasing order of Micron (µ)
      if (b.micron !== a.micron) {
        return b.micron - a.micron;
      }
      // Tertiary sort: Overdue priority
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return 0;
    });
  }, [orders, inventory, schedules]);

  // Open Add Machine Modal
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

  // Open Edit Machine Modal
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

  // Handle Delete Machine
  const handleDeleteMachineClick = (mac) => {
    if (window.confirm(`Are you sure you want to delete printing machine "${mac.name}" (${mac.id})?`)) {
      if (onDeleteMachine) {
        onDeleteMachine(mac.id);
      }
    }
  };

  // Handle Save (Create or Update) Machine Form
  const handleSaveMachineForm = (e) => {
    e.preventDefault();
    if (!machineName.trim()) {
      alert("Please enter Machine Name!");
      return;
    }

    const machineData = {
      id: editingMachineId || `MAC-PRINT-${Math.floor(10 + Math.random() * 90)}`,
      name: machineName,
      type: machineType,
      colors: parseInt(machineColors),
      maxSpeedMpm: parseFloat(machineMaxSpeed),
      maxWidthMm: parseFloat(machineMaxWidth),
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

  // Drag and Drop Handler: Move Schedule to target machine and shift
  const handleDropScheduleToShift = (scheduleId, targetMachineId, targetShift) => {
    setDragOverZone(null);
    const existing = schedules.find(s => s.id === scheduleId);
    if (!existing) return;

    let newStartTime = existing.startTime || '08:00';
    if (existing.shift !== targetShift) {
      const [h, m] = newStartTime.split(':').map(Number);
      const adjustedH = (h + 12) % 24;
      newStartTime = `${adjustedH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    const updatedSchedule = {
      ...existing,
      machineId: targetMachineId,
      shift: targetShift,
      startTime: newStartTime
    };

    if (onSaveSchedule) {
      onSaveSchedule(updatedSchedule);
    }
  };

  // 1-Click Quick Shift Toggle
  const handleQuickToggleShift = (e, schedule) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const newShift = schedule.shift === 'Day Shift' ? 'Night Shift' : 'Day Shift';
    
    let newStartTime = schedule.startTime || '08:00';
    const [h, m] = newStartTime.split(':').map(Number);
    const adjustedH = (h + 12) % 24;
    newStartTime = `${adjustedH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

    const updated = { ...schedule, shift: newShift, startTime: newStartTime };
    if (onSaveSchedule) {
      onSaveSchedule(updated);
    }
  };

  // Handle Delete Schedule
  const handleDeleteScheduleClick = (e, schedule) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete the schedule for "${schedule.jobName}" on ${schedule.shift}?`)) {
      if (onDeleteSchedule) {
        onDeleteSchedule(schedule.id);
      }
    }
  };

  // Open Scheduling Modal for a New Order
  const handleOpenScheduleModal = (order) => {
    setEditingScheduleId(null);
    setSchedulingOrder(order);

    const firstMachine = machines[0] || initialMachines[0];
    setTargetMachineId(firstMachine.id);
    setCustomSpeedInput(firstMachine.maxSpeedMpm || 250);
    setTargetShift('Day Shift');
    setScheduledDateInput('2026-08-02');
    setStartTimeInput('08:00');

    // Auto-check size change changeover time
    const widthMm = order.printWidthMm || order.jobDetails?.printWidthMm || 1000;
    const machineSchedules = schedules.filter(s => s.machineId === firstMachine.id);
    const lastJob = machineSchedules[machineSchedules.length - 1];
    const isSame = lastJob && Math.abs((lastJob.widthMm || 0) - widthMm) < 5;

    setCustomJobChangeoverInput(isSame ? 60 : 120);
    setCustomRollChangeoverRateInput(20);

    setIsScheduleModalOpen(true);
  };

  // Open Reschedule Modal for an Existing Schedule
  const handleEditExistingSchedule = (e, schedule) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setEditingScheduleId(schedule.id);
    
    // Find matching order or build dummy order structure for preview
    const matchingOrder = orders.find(o => o.id === schedule.orderId) || {
      id: schedule.orderId,
      jobName: schedule.jobName,
      clientName: schedule.clientName,
      orderQtyKg: schedule.orderQtyKg,
      printWidthMm: schedule.widthMm
    };

    setSchedulingOrder(matchingOrder);
    setTargetMachineId(schedule.machineId);
    setTargetShift(schedule.shift || 'Day Shift');
    setScheduledDateInput(schedule.scheduledDate || '2026-08-02');
    setStartTimeInput(schedule.startTime || '08:00');
    setCustomSpeedInput(schedule.maxSpeedMpm || 250);
    setCustomJobChangeoverInput(schedule.jobChangeoverMins || 120);
    setCustomRollChangeoverRateInput(schedule.rollChangeoverMins ? Math.round(schedule.rollChangeoverMins / Math.max(1, Math.ceil(schedule.totalLengthMeters / 3000))) : 20);

    setIsScheduleModalOpen(true);
  };

  const printQtyKg = useMemo(() => {
    if (!schedulingOrder) return 1000;
    const layers = schedulingOrder.jobDetails?.layers || [];
    const firstLayer = layers[0] || { filmType: 'PET', micron: 12 };
    const reqs = schedulingOrder.materialRequirements || schedulingOrder.rawMaterialRequirements || [];
    const firstLayerReq = reqs.find(r => r.filmType === firstLayer.filmType) || reqs[0];
    return firstLayerReq?.qtyKg || schedulingOrder.orderQtyKg || 1000;
  }, [schedulingOrder]);

  // Live calculation of metrics for modal preview
  const previewMetrics = useMemo(() => {
    if (!schedulingOrder) return null;

    const layers = schedulingOrder.jobDetails?.layers || [];
    const firstLayer = layers[0] || { filmType: 'PET', micron: 12 };
    const widthMm = schedulingOrder.printWidthMm || schedulingOrder.jobDetails?.printWidthMm || 1000;
    const repeatMm = schedulingOrder.repeatLengthMm || schedulingOrder.jobDetails?.repeatLengthMm || 400;

    // Find previous job scheduled on target machine to check changeover time
    const machineSchedules = schedules.filter(s => s.machineId === targetMachineId && s.id !== editingScheduleId);
    const lastJob = machineSchedules[machineSchedules.length - 1];

    return calculatePrintingScheduleMetrics({
      orderQtyKg: printQtyKg,
      widthMm,
      micron: firstLayer.micron || 12,
      filmType: firstLayer.filmType || 'PET',
      maxSpeedMpm: parseFloat(customSpeedInput) || 250,
      prevJobWidthMm: lastJob?.widthMm || null,
      prevJobRepeatMm: lastJob?.repeatLengthMm || null,
      repeatLengthMm: repeatMm,
      customJobChangeoverMins: customJobChangeoverInput,
      customRollChangeoverRateMins: customRollChangeoverRateInput
    });
  }, [schedulingOrder, targetMachineId, customSpeedInput, customJobChangeoverInput, customRollChangeoverRateInput, schedules, editingScheduleId, printQtyKg]);

  // Handle Save Scheduled Job
  const handleConfirmSchedule = (e) => {
    e.preventDefault();
    if (!schedulingOrder || !previewMetrics) return;

    // Calculate End Time
    const [startH, startM] = startTimeInput.split(':').map(Number);
    const totalMinutes = startH * 60 + startM + previewMetrics.totalDurationMins;
    const endH = Math.floor((totalMinutes / 60) % 24).toString().padStart(2, '0');
    const endM = Math.floor(totalMinutes % 60).toString().padStart(2, '0');
    const endTimeStr = `${endH}:${endM}`;

    const newSchedule = {
      id: editingScheduleId || `SCHED-2026-${Math.floor(100 + Math.random() * 900)}`,
      orderId: schedulingOrder.id,
      jobName: schedulingOrder.jobName,
      clientName: schedulingOrder.clientName,
      machineId: targetMachineId,
      shift: targetShift,
      scheduledDate: scheduledDateInput,
      startTime: startTimeInput,
      orderQtyKg: schedulingOrder.orderQtyKg,
      printQtyKg: printQtyKg,
      widthMm: schedulingOrder.printWidthMm || 1000,
      micron: 12,
      filmType: 'PET',
      maxSpeedMpm: parseFloat(customSpeedInput),
      totalLengthMeters: previewMetrics.totalLengthMeters,
      runTimeMins: previewMetrics.runTimeMins,
      rollChangeoverMins: previewMetrics.rollChangeoverMins,
      jobChangeoverMins: previewMetrics.jobChangeoverMins,
      totalDurationMins: previewMetrics.totalDurationMins,
      endTime: endTimeStr,
      status: "Scheduled",
      priority: schedulingOrder.isOverdue ? "HIGH PRIORITY - OVERDUE" : "Normal"
    };

    if (onSaveSchedule) {
      onSaveSchedule(newSchedule);
    }

    setIsScheduleModalOpen(false);
    setEditingScheduleId(null);
    setSchedulingOrder(null);
    alert(`Job "${newSchedule.jobName}" ${editingScheduleId ? 'updated' : 'scheduled'} on ${machines.find(m => m.id === targetMachineId)?.name} (${targetShift})! Total duration: ${previewMetrics.totalDurationHours} hrs.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Header & Navigation Tabs */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Printer style={{ color: 'var(--primary-brand)' }} /> Printing Machines Production Scheduler
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            2×12h Shift Allocation (Day & Night) • Meter Calculations & Setup Changeover Accounting
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className={`btn-secondary ${activeTab === 'gantt' ? 'active' : ''}`}
            onClick={() => setActiveTab('gantt')}
            style={{ background: activeTab === 'gantt' ? 'var(--primary-brand)' : 'transparent', color: activeTab === 'gantt' ? '#fff' : 'inherit' }}
          >
            <Calendar size={16} /> 2×12h Shift Gantt Chart
          </button>
          
          <button 
            className={`btn-secondary ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
            style={{ background: activeTab === 'queue' ? 'var(--primary-brand)' : 'transparent', color: activeTab === 'queue' ? '#fff' : 'inherit' }}
          >
            <PlayCircle size={16} /> Ready Queue ({readyForScheduleOrders.filter(o => !o.isAlreadyScheduled).length})
          </button>

          <button 
            className={`btn-secondary ${activeTab === 'machines' ? 'active' : ''}`}
            onClick={() => setActiveTab('machines')}
            style={{ background: activeTab === 'machines' ? 'var(--primary-brand)' : 'transparent', color: activeTab === 'machines' ? '#fff' : 'inherit' }}
          >
            <Settings size={16} /> Machine Settings ({machines.length})
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: VISUAL 2x12H SHIFT GANTT TIMEBOARD CHART */}
      {/* ==================================================================== */}
      {activeTab === 'gantt' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Controls Bar: Date & Shift Selection */}
          <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} style={{ color: 'var(--primary-brand)' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>Schedule Date:</span>
                <input 
                  type="date" 
                  className="form-control" 
                  style={{ width: '150px', padding: '4px 8px', fontSize: '0.85rem' }} 
                  value={selectedDate} 
                  onChange={e => setSelectedDate(e.target.value)} 
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>Shift Filter:</span>
                <select 
                  className="form-control" 
                  style={{ width: '160px', padding: '4px 8px', fontSize: '0.85rem' }}
                  value={selectedShiftFilter}
                  onChange={e => setSelectedShiftFilter(e.target.value)}
                >
                  <option value="All">All Shifts (24 Hours)</option>
                  <option value="Day Shift">Day Shift (08:00 - 20:00)</option>
                  <option value="Night Shift">Night Shift (20:00 - 08:00)</option>
                </select>
              </div>
            </div>

            {/* Legend Indicators */}
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.78rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '12px', background: '#8b5cf6', borderRadius: '3px' }}></span> Job Changeover (Setup)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '12px', background: '#f59e0b', borderRadius: '3px' }}></span> Roll Changeover (20m)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '12px', background: '#10b981', borderRadius: '3px' }}></span> Net Printing Run
              </span>
            </div>
          </div>

          {/* Machine Gantt Timeline Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {machines.map(mac => {
              const windowStart = new Date(selectedDate);
              const windowEnd = new Date(selectedDate);
              windowEnd.setDate(windowEnd.getDate() + 6); // include 7 days total

              const machineScheds = schedules.filter(s => {
                if (s.machineId !== mac.id) return false;
                if (!s.scheduledDate) return false;
                const schedDate = new Date(s.scheduledDate);
                return schedDate >= windowStart && schedDate <= windowEnd;
              });              
              const getJobOffsetMins = (startTime, shift) => {
                if (!startTime) return 0;
                const [h, m] = startTime.split(':').map(Number);
                let mins = h * 60 + m;
                if (shift === 'Day Shift') {
                  return Math.max(0, mins - 480); // 08:00
                } else {
                  if (mins < 720) mins += 1440; // < 12:00 -> next day
                  return Math.max(0, mins - 1200); // 20:00
                }
              };

              // --- Layout Calculation ---
              const dayJobs = machineScheds.filter(s => s.shift === 'Day Shift').sort((a, b) => getJobOffsetMins(a.startTime, 'Day Shift') - getJobOffsetMins(b.startTime, 'Day Shift'));
              const dayBlocks = [];
              let dayCurrentMins = 0;
              const dayOverflows = [];

              dayJobs.forEach(s => {
                const jobOffset = getJobOffsetMins(s.startTime, 'Day Shift');
                const actualStart = Math.max(jobOffset, dayCurrentMins);
                
                if (actualStart > dayCurrentMins) {
                  dayBlocks.push({ type: 'gap', durationMins: actualStart - dayCurrentMins });
                  dayCurrentMins = actualStart;
                }
                
                const duration = Math.max(s.totalDurationMins || 120, 1);
                const blockDuration = Math.min(duration, 720 - dayCurrentMins);
                const overflowMins = duration - blockDuration;
                
                if (blockDuration > 0) {
                  dayBlocks.push({ type: 'job', job: s, durationMins: blockDuration, totalDuration: duration, isOverflowing: overflowMins > 0, overflowMins });
                  dayCurrentMins += blockDuration;
                }
                
                if (overflowMins > 0) {
                  dayOverflows.push({ job: s, durationMins: overflowMins });
                }
              });

              if (dayCurrentMins < 720) {
                dayBlocks.push({ type: 'gap', durationMins: 720 - dayCurrentMins });
              }

              const nightJobs = machineScheds.filter(s => s.shift === 'Night Shift').sort((a, b) => getJobOffsetMins(a.startTime, 'Night Shift') - getJobOffsetMins(b.startTime, 'Night Shift'));
              const nightBlocks = [];
              let nightCurrentMins = 0;

              dayOverflows.forEach(overflow => {
                const blockDuration = Math.min(overflow.durationMins, 720 - nightCurrentMins);
                if (blockDuration > 0) {
                  nightBlocks.push({ type: 'continuation', job: overflow.job, durationMins: blockDuration, originalOverflowMins: overflow.durationMins });
                  nightCurrentMins += blockDuration;
                }
              });

              nightJobs.forEach(s => {
                const jobOffset = getJobOffsetMins(s.startTime, 'Night Shift');
                const actualStart = Math.max(jobOffset, nightCurrentMins);
                
                if (actualStart > nightCurrentMins) {
                  nightBlocks.push({ type: 'gap', durationMins: actualStart - nightCurrentMins });
                  nightCurrentMins = actualStart;
                }
                
                const duration = Math.max(s.totalDurationMins || 120, 1);
                const blockDuration = Math.min(duration, 720 - nightCurrentMins);
                
                if (blockDuration > 0) {
                  nightBlocks.push({ type: 'job', job: s, durationMins: blockDuration, totalDuration: duration });
                  nightCurrentMins += blockDuration;
                }
              });

              if (nightCurrentMins < 720) {
                nightBlocks.push({ type: 'gap', durationMins: 720 - nightCurrentMins });
              }
              // ------------------------

                return (
                  <div key={mac.id} className="glass-panel" style={{ padding: '20px' }}>
                  {/* Machine Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ background: '#ecfdf5', color: '#047857', padding: '8px 12px', borderRadius: '8px', fontWeight: '800', fontSize: '1rem' }}>
                        {mac.name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Type: <b>{mac.type} ({mac.colors} Colors)</b> | Speed: <b>{mac.maxSpeedMpm} m/min</b> | Max Width: <b>{mac.maxWidthMm} mm</b>
                      </div>
                    </div>

                    <span className="badge badge-us">
                      {machineScheds.length} Jobs Scheduled Today
                    </span>
                  </div>

                  {/* 2x12h Timeboard Grid View */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    
                    {/* DAY SHIFT TIMELINE (08:00 to 20:00 - 12 Hours) */}
                    {(selectedShiftFilter === 'All' || selectedShiftFilter === 'Day Shift') && (() => {
                      const dayScheduledMins = dayJobs.reduce((acc, s) => acc + (s.totalDurationMins || 0), 0);
                      const dayUtilPct = Math.round((dayScheduledMins / 720) * 100);
                      const zoneKey = `${mac.id}_Day Shift`;
                      const isDragOver = dragOverZone === zoneKey;

                      return (
                        <div 
                          style={{ 
                            background: isDragOver ? '#f0f9ff' : '#f8fafc', 
                            padding: '14px 18px', 
                            borderRadius: '10px', 
                            border: isDragOver ? '2px dashed #0284c7' : '1px solid #e2e8f0', 
                            boxShadow: isDragOver ? '0 0 12px rgba(2, 132, 199, 0.25)' : 'none',
                            transition: 'all 0.2s ease' 
                          }}
                          onDragOver={(e) => { 
                            e.preventDefault(); 
                            e.dataTransfer.dropEffect = 'move'; 
                            if (dragOverZone !== zoneKey) setDragOverZone(zoneKey);
                          }}
                          onDragLeave={() => setDragOverZone(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOverZone(null);
                            try {
                              const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                              if (data?.scheduleId) handleDropScheduleToShift(data.scheduleId, mac.id, 'Day Shift');
                            } catch (err) {}
                          }}
                        >
                          {/* Shift Header & Utilization Meter */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1e293b' }}>☀️ DAY SHIFT (08:00 AM – 08:00 PM)</span>
                              <span style={{ 
                                fontSize: '0.72rem', 
                                fontWeight: '700', 
                                padding: '2px 8px', 
                                borderRadius: '12px',
                                background: dayUtilPct > 100 ? '#fef2f2' : dayUtilPct > 85 ? '#fffbe6' : '#f0fdf4',
                                color: dayUtilPct > 100 ? '#dc2626' : dayUtilPct > 85 ? '#d97706' : '#15803d',
                                border: `1px solid ${dayUtilPct > 100 ? '#fecaca' : dayUtilPct > 85 ? '#fef08a' : '#bbf7d0'}`
                              }}>
                                {dayUtilPct > 100 ? '🔴 Overloaded' : dayUtilPct > 85 ? '🟡 Near Capacity' : '🟢 Optimal'} ({(dayScheduledMins/60).toFixed(1)}h / 12h • {dayUtilPct}%)
                              </span>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>💡 Drag & Drop to Move or Click ✏️ to Reschedule</span>
                          </div>

                          {/* Hour Grid Ruler Ticks */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: '700', color: '#64748b', padding: '0 4px 4px 4px' }}>
                            <span>08:00 AM</span>
                            <span>10:00 AM</span>
                            <span>12:00 PM</span>
                            <span>02:00 PM</span>
                            <span>04:00 PM</span>
                            <span>06:00 PM</span>
                            <span>08:00 PM</span>
                          </div>

                          {/* Visual Timeline Bar Container */}
                          <div style={{ minHeight: '62px', background: '#e2e8f0', borderRadius: '8px', overflow: 'hidden', display: 'flex', position: 'relative', border: '1px solid #cbd5e1' }}>
                            {dayBlocks.length === 0 ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', color: '#64748b', fontSize: '0.8rem', fontWeight: '600', padding: '16px' }}>
                                No jobs scheduled for Day Shift
                              </div>
                            ) : (
                              dayBlocks.map((b, idx) => {
                                const pctWidth = (b.durationMins / 720) * 100;
                                
                                if (b.type === 'gap') {
                                  return (
                                    <div 
                                      key={`gap-${idx}`}
                                      style={{
                                        width: `${pctWidth}%`,
                                        height: '100%',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        borderRight: '1px dashed rgba(239, 68, 68, 0.3)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#ef4444',
                                        fontSize: '0.75rem',
                                        fontWeight: '600',
                                        overflow: 'hidden'
                                      }}
                                      title={`Unallocated time: ${b.durationMins} mins`}
                                    >
                                      {pctWidth > 8 ? 'Unallocated' : ''}
                                    </div>
                                  );
                                } else if (b.type === 'job') {
                                  const s = b.job;
                                  const totalDuration = b.totalDuration;
                                  const setupMins = s.jobChangeoverMins || 60;
                                  const rollMins = s.rollChangeoverMins || 20;
                                  const runMins = s.runTimeMins || Math.max(10, totalDuration - setupMins - rollMins);

                                  const blockSetupMins = Math.min(setupMins, b.durationMins);
                                  const blockRollMins = Math.min(rollMins, b.durationMins - blockSetupMins);
                                  const blockRunMins = Math.max(0, b.durationMins - blockSetupMins - blockRollMins);

                                  const setupPct = (blockSetupMins / b.durationMins) * 100;
                                  const rollPct = (blockRollMins / b.durationMins) * 100;
                                  const runPct = (blockRunMins / b.durationMins) * 100;

                                  const isOverflowing = b.isOverflowing;
                                  const overflowMins = b.overflowMins;

                                  return (
                                    <div 
                                      key={s.id}
                                      draggable="true"
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', JSON.stringify({ scheduleId: s.id }));
                                      }}
                                      style={{
                                        width: `${pctWidth}%`,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        borderRight: '2px solid #ffffff',
                                        cursor: 'grab',
                                        background: '#0f172a',
                                        color: '#ffffff',
                                        padding: '6px 8px',
                                        borderRadius: '6px',
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                                        transition: 'transform 0.15s',
                                        overflow: 'hidden'
                                      }}
                                      title={`Job: ${s.jobName} (${s.clientName})\nStart: ${s.startTime} | End: ${s.endTime}\nSetup Time: ${setupMins} mins\nRoll Changeover: ${rollMins} mins\nNet Printing Run: ${runMins} mins\nTotal Duration: ${(totalDuration/60).toFixed(1)} hrs${isOverflowing ? `\n(Spills ${ (overflowMins/60).toFixed(1) } hrs into Night Shift)` : ''}`}
                                    >
                                      {/* Job Header & Action Controls */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', fontWeight: '800' }}>
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.jobName}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>
                                            {(totalDuration/60).toFixed(1)}h
                                          </span>
                                          {/* Edit / Reschedule Button */}
                                          <button 
                                            type="button"
                                            onClick={(e) => handleEditExistingSchedule(e, s)}
                                            style={{ background: 'rgba(59, 130, 246, 0.8)', border: 'none', color: '#ffffff', borderRadius: '3px', cursor: 'pointer', padding: '2px 4px', fontSize: '0.65rem', display: 'flex', alignItems: 'center' }}
                                            title="Reschedule / Edit Parameters"
                                          >
                                            <Edit3 size={11} />
                                          </button>
                                          {/* Quick Shift Toggle Button */}
                                          <button 
                                            type="button"
                                            onClick={(e) => handleQuickToggleShift(e, s)}
                                            style={{ background: 'rgba(245, 158, 11, 0.8)', border: 'none', color: '#ffffff', borderRadius: '3px', cursor: 'pointer', padding: '2px 4px', fontSize: '0.65rem', display: 'flex', alignItems: 'center' }}
                                            title="Switch to Night Shift (1-Click)"
                                          >
                                            🌙
                                          </button>
                                          {/* Delete Button */}
                                          <button 
                                            type="button"
                                            onClick={(e) => handleDeleteScheduleClick(e, s)}
                                            style={{ background: 'rgba(239, 68, 68, 0.8)', border: 'none', color: '#ffffff', borderRadius: '3px', cursor: 'pointer', padding: '2px 4px', fontSize: '0.65rem', display: 'flex', alignItems: 'center' }}
                                            title="Delete Schedule"
                                          >
                                            <Trash2 size={11} />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Segmented Color Bar */}
                                      <div style={{ height: '20px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden', display: 'flex', marginTop: '3px', fontSize: '0.68rem', fontWeight: '700' }}>
                                        <div 
                                          style={{ width: `${setupPct}%`, background: '#8b5cf6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', overflow: 'hidden' }}
                                          title={`Job Setup: ${setupMins} mins`}
                                        >
                                          {setupPct > 10 && `⚙️ ${blockSetupMins}m`}
                                        </div>
                                        <div 
                                          style={{ width: `${rollPct}%`, background: '#f59e0b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', overflow: 'hidden' }}
                                          title={`Roll Changeovers: ${rollMins} mins`}
                                        >
                                          {rollPct > 10 && `📦 ${blockRollMins}m`}
                                        </div>
                                        <div 
                                          style={{ width: `${runPct}%`, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', overflow: 'hidden' }}
                                          title={`Net Printing Run: ${runMins} mins`}
                                        >
                                          {runPct > 12 && `🖨️ ${blockRunMins}m`}
                                        </div>
                                      </div>

                                      {/* Overflow Banner */}
                                      {isOverflowing && (
                                        <div style={{ fontSize: '0.62rem', background: '#ef4444', color: '#fff', padding: '1px 4px', borderRadius: '2px', fontWeight: 'bold', marginTop: '2px', textTransform: 'uppercase' }}>
                                          🔄 Spills +{(overflowMins/60).toFixed(1)}h to Night Shift
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                return null;
                              })
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* NIGHT SHIFT TIMELINE (20:00 to 08:00 - 12 Hours) */}
                    {(selectedShiftFilter === 'All' || selectedShiftFilter === 'Night Shift') && (() => {
                      const nightScheduledMins = nightJobs.reduce((acc, s) => acc + (s.totalDurationMins || 0), 0);
                      const nightUtilPct = Math.round((nightScheduledMins / 720) * 100);
                      const zoneKey = `${mac.id}_Night Shift`;
                      const isDragOver = dragOverZone === zoneKey;

                      return (
                        <div 
                          style={{ 
                            background: isDragOver ? '#f0f9ff' : '#f1f5f9', 
                            padding: '14px 18px', 
                            borderRadius: '10px', 
                            border: isDragOver ? '2px dashed #0284c7' : '1px solid #cbd5e1', 
                            boxShadow: isDragOver ? '0 0 12px rgba(2, 132, 199, 0.25)' : 'none',
                            transition: 'all 0.2s ease' 
                          }}
                          onDragOver={(e) => { 
                            e.preventDefault(); 
                            e.dataTransfer.dropEffect = 'move'; 
                            if (dragOverZone !== zoneKey) setDragOverZone(zoneKey);
                          }}
                          onDragLeave={() => setDragOverZone(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOverZone(null);
                            try {
                              const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                              if (data?.scheduleId) handleDropScheduleToShift(data.scheduleId, mac.id, 'Night Shift');
                            } catch (err) {}
                          }}
                        >
                          {/* Shift Header & Utilization Meter */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a' }}>🌙 NIGHT SHIFT (08:00 PM – 08:00 AM)</span>
                              <span style={{ 
                                fontSize: '0.72rem', 
                                fontWeight: '700', 
                                padding: '2px 8px', 
                                borderRadius: '12px',
                                background: nightUtilPct > 100 ? '#fef2f2' : nightUtilPct > 85 ? '#fffbe6' : '#f0fdf4',
                                color: nightUtilPct > 100 ? '#dc2626' : nightUtilPct > 85 ? '#d97706' : '#15803d',
                                border: `1px solid ${nightUtilPct > 100 ? '#fecaca' : nightUtilPct > 85 ? '#fef08a' : '#bbf7d0'}`
                              }}>
                                {nightUtilPct > 100 ? '🔴 Overloaded' : nightUtilPct > 85 ? '🟡 Near Capacity' : '🟢 Optimal'} ({(nightScheduledMins/60).toFixed(1)}h / 12h • {nightUtilPct}%)
                              </span>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>💡 Drag & Drop to Move or Click ✏️ to Reschedule</span>
                          </div>

                          {/* Hour Grid Ruler Ticks */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: '700', color: '#475569', padding: '0 4px 4px 4px' }}>
                            <span>08:00 PM</span>
                            <span>10:00 PM</span>
                            <span>12:00 AM</span>
                            <span>02:00 AM</span>
                            <span>04:00 AM</span>
                            <span>06:00 AM</span>
                            <span>08:00 AM</span>
                          </div>

                          {/* Visual Timeline Bar Container */}
                          <div style={{ minHeight: '62px', background: '#94a3b8', borderRadius: '8px', overflow: 'hidden', display: 'flex', position: 'relative', border: '1px solid #64748b' }}>
                            {nightBlocks.length === 0 ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', color: '#ffffff', fontSize: '0.8rem', fontWeight: '600', padding: '16px' }}>
                                No jobs scheduled for Night Shift
                              </div>
                            ) : (
                              nightBlocks.map((b, idx) => {
                                const pctWidth = (b.durationMins / 720) * 100;
                                
                                if (b.type === 'gap') {
                                  return (
                                    <div 
                                      key={`gap-${idx}`}
                                      style={{
                                        width: `${pctWidth}%`,
                                        height: '100%',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        borderRight: '1px dashed rgba(239, 68, 68, 0.3)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#ef4444',
                                        fontSize: '0.75rem',
                                        fontWeight: '600',
                                        overflow: 'hidden'
                                      }}
                                      title={`Unallocated time: ${b.durationMins} mins`}
                                    >
                                      {pctWidth > 8 ? 'Unallocated' : ''}
                                    </div>
                                  );
                                } else if (b.type === 'continuation') {
                                  const s = b.job;
                                  const totalDuration = s.totalDurationMins || 120;
                                  const setupMins = s.jobChangeoverMins || 60;
                                  const rollMins = s.rollChangeoverMins || 20;
                                  const runMins = s.runTimeMins || Math.max(10, totalDuration - setupMins - rollMins);

                                  const dayDuration = totalDuration - b.originalOverflowMins;
                                  const daySetupMins = Math.min(setupMins, dayDuration);
                                  const dayRollMins = Math.min(rollMins, dayDuration - daySetupMins);
                                  
                                  const nightSetupMins = Math.min(setupMins - daySetupMins, b.durationMins);
                                  const nightRollMins = Math.min(rollMins - dayRollMins, b.durationMins - nightSetupMins);
                                  const nightRunMins = Math.max(0, b.durationMins - nightSetupMins - nightRollMins);

                                  const setupPct = (nightSetupMins / b.durationMins) * 100;
                                  const rollPct = (nightRollMins / b.durationMins) * 100;
                                  const runPct = (nightRunMins / b.durationMins) * 100;

                                  return (
                                    <div 
                                      key={`overflow-${s.id}`}
                                      style={{
                                        width: `${pctWidth}%`,
                                        height: '100%',
                                        background: '#4338ca',
                                        color: '#ffffff',
                                        padding: '6px 10px',
                                        fontSize: '0.72rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        borderRight: '2px solid #ffffff',
                                        borderLeft: '4px solid #f59e0b',
                                        overflow: 'hidden'
                                      }}
                                      title={`Continued from Day Shift: ${s.jobName}\nRemaining run time: ${(b.durationMins/60).toFixed(1)} hrs`}
                                    >
                                      <div>
                                        <div style={{ fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>➡️ CONTINUATION: {s.jobName}</div>
                                        <div style={{ fontSize: '0.65rem', opacity: 0.9 }}>Remaining: {(b.durationMins/60).toFixed(1)} hrs</div>
                                      </div>
                                      
                                      <div style={{ height: '20px', background: '#312e81', borderRadius: '4px', overflow: 'hidden', display: 'flex', marginTop: '3px', fontSize: '0.68rem', fontWeight: '700' }}>
                                        <div style={{ width: `${setupPct}%`, background: '#8b5cf6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', overflow: 'hidden' }}>
                                          {setupPct > 10 && `⚙️ ${nightSetupMins}m`}
                                        </div>
                                        <div style={{ width: `${rollPct}%`, background: '#f59e0b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', overflow: 'hidden' }}>
                                          {rollPct > 10 && `📦 ${nightRollMins}m`}
                                        </div>
                                        <div style={{ width: `${runPct}%`, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', overflow: 'hidden' }}>
                                          {runPct > 12 && `🖨️ ${nightRunMins}m`}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                } else if (b.type === 'job') {
                                  const s = b.job;
                                  const totalDuration = b.totalDuration;
                                  const setupMins = s.jobChangeoverMins || 60;
                                  const rollMins = s.rollChangeoverMins || 20;
                                  const runMins = s.runTimeMins || Math.max(10, totalDuration - setupMins - rollMins);

                                  const blockSetupMins = Math.min(setupMins, b.durationMins);
                                  const blockRollMins = Math.min(rollMins, b.durationMins - blockSetupMins);
                                  const blockRunMins = Math.max(0, b.durationMins - blockSetupMins - blockRollMins);

                                  const setupPct = (blockSetupMins / b.durationMins) * 100;
                                  const rollPct = (blockRollMins / b.durationMins) * 100;
                                  const runPct = (blockRunMins / b.durationMins) * 100;

                                  return (
                                    <div 
                                      key={s.id}
                                      draggable="true"
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', JSON.stringify({ scheduleId: s.id }));
                                      }}
                                      style={{
                                        width: `${pctWidth}%`,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        borderRight: '2px solid #ffffff',
                                        cursor: 'grab',
                                        background: '#0f172a',
                                        color: '#ffffff',
                                        padding: '6px 8px',
                                        borderRadius: '6px',
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                                        transition: 'transform 0.15s',
                                        overflow: 'hidden'
                                      }}
                                      title={`Job: ${s.jobName} (${s.clientName})\nStart: ${s.startTime} | End: ${s.endTime}\nSetup Time: ${setupMins} mins\nRoll Changeover: ${rollMins} mins\nNet Printing Run: ${runMins} mins\nTotal Duration: ${(totalDuration/60).toFixed(1)} hrs`}
                                    >
                                      {/* Job Header & Action Controls */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', fontWeight: '800' }}>
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.jobName}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>
                                            {(totalDuration/60).toFixed(1)}h
                                          </span>
                                          {/* Edit / Reschedule Button */}
                                          <button 
                                            type="button"
                                            onClick={(e) => handleEditExistingSchedule(e, s)}
                                            style={{ background: 'rgba(59, 130, 246, 0.8)', border: 'none', color: '#ffffff', borderRadius: '3px', cursor: 'pointer', padding: '2px 4px', fontSize: '0.65rem', display: 'flex', alignItems: 'center' }}
                                            title="Reschedule / Edit Parameters"
                                          >
                                            <Edit3 size={11} />
                                          </button>
                                          {/* Quick Shift Toggle Button */}
                                          <button 
                                            type="button"
                                            onClick={(e) => handleQuickToggleShift(e, s)}
                                            style={{ background: 'rgba(245, 158, 11, 0.8)', border: 'none', color: '#ffffff', borderRadius: '3px', cursor: 'pointer', padding: '2px 4px', fontSize: '0.65rem', display: 'flex', alignItems: 'center' }}
                                            title="Switch to Day Shift (1-Click)"
                                          >
                                            ☀️
                                          </button>
                                          {/* Delete Button */}
                                          <button 
                                            type="button"
                                            onClick={(e) => handleDeleteScheduleClick(e, s)}
                                            style={{ background: 'rgba(239, 68, 68, 0.8)', border: 'none', color: '#ffffff', borderRadius: '3px', cursor: 'pointer', padding: '2px 4px', fontSize: '0.65rem', display: 'flex', alignItems: 'center' }}
                                            title="Delete Schedule"
                                          >
                                            <Trash2 size={11} />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Segmented Color Bar */}
                                      <div style={{ height: '20px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden', display: 'flex', marginTop: '3px', fontSize: '0.68rem', fontWeight: '700' }}>
                                        <div 
                                          style={{ width: `${setupPct}%`, background: '#8b5cf6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', overflow: 'hidden' }}
                                          title={`Job Setup: ${setupMins} mins`}
                                        >
                                          {setupPct > 10 && `⚙️ ${blockSetupMins}m`}
                                        </div>
                                        <div 
                                          style={{ width: `${rollPct}%`, background: '#f59e0b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', overflow: 'hidden' }}
                                          title={`Roll Changeovers: ${rollMins} mins`}
                                        >
                                          {rollPct > 10 && `📦 ${blockRollMins}m`}
                                        </div>
                                        <div 
                                          style={{ width: `${runPct}%`, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', overflow: 'hidden' }}
                                          title={`Net Printing Run: ${runMins} mins`}
                                        >
                                          {runPct > 12 && `🖨️ ${blockRunMins}m`}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: READY FOR SCHEDULING QUEUE */}
      {/* ==================================================================== */}
      {activeTab === 'queue' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                Material-Ready Order Scheduling Queue ({readyForScheduleOrders.length})
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Sorted in <b>decreasing order of Print Size (Width in mm) & Micron (µ)</b> to minimize cylinder & deck changeover times. Overdue jobs highlighted in red.
              </p>
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Priority / Status</th>
                <th>Order ID</th>
                <th>Job & Client Name</th>
                <th>Print Size (mm) × Micron (µ)</th>
                <th>Substrate Structure</th>
                <th>Order Qty (Kg)</th>
                <th>Delivery Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {readyForScheduleOrders.map(order => {
                const assignedSchedule = schedules.find(s => s.orderId === order.id);
                const assignedMachine = assignedSchedule ? machines.find(m => m.id === assignedSchedule.machineId) : null;

                return (
                  <tr key={order.id} className={order.isOverdue ? 'row-delayed-highlight' : ''}>
                    <td>
                      {order.isOverdue ? (
                        <span className="badge-delayed-tag">🚨 HIGH PRIORITY - OVERDUE</span>
                      ) : order.isAlreadyScheduled ? (
                        <span className="badge badge-us">
                          SCHEDULED ({assignedMachine?.name || assignedSchedule?.machineId || 'Assigned'})
                        </span>
                      ) : (
                        <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>READY TO SCHEDULE</span>
                      )}
                    </td>
                    <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{order.id}</td>
                    <td>
                      <div style={{ fontWeight: '700' }}>{order.jobName}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{order.clientName}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '800', color: '#047857', fontSize: '0.9rem', background: '#ecfdf5', padding: '4px 8px', borderRadius: '6px', display: 'inline-block', border: '1px solid #a7f3d0' }}>
                        📐 {order.widthMm} mm • {order.micron} µ
                      </div>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{order.structure || '—'}</td>
                    <td className="bold-val">{(order.orderQtyKg ?? 0).toLocaleString()} kg</td>
                    <td style={{ color: order.isOverdue ? '#dc2626' : 'inherit', fontWeight: order.isOverdue ? 'bold' : 'normal' }}>
                      {order.targetDeliveryDate}
                    </td>
                    <td>
                      {order.isAlreadyScheduled ? (
                        <button 
                          type="button"
                          className="btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '0.78rem', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onClick={() => {
                            if (assignedSchedule && window.confirm(`Remove schedule for "${order.jobName}"?`)) {
                              if (onDeleteSchedule) onDeleteSchedule(assignedSchedule.id);
                            }
                          }}
                        >
                          <Trash2 size={13} /> Remove Schedule
                        </button>
                      ) : (
                        <button 
                          type="button"
                          className="btn-primary" 
                          style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onClick={() => handleOpenScheduleModal(order)}
                        >
                          <Clock size={13} /> Schedule Job
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: PRINTING MACHINE SETTINGS & MANAGEMENT */}
      {/* ==================================================================== */}
      {activeTab === 'machines' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                Printing Presses & Machine Settings
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Configure printing machines, max speeds (m/min), width limits, and operator stations.
              </p>
            </div>

            <button className="btn-primary" onClick={handleOpenAddMachine}>
              <Plus size={16} /> Onboard New Printing Machine
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
            {machines.map(mac => (
              <div key={mac.id} className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--primary-brand)' }}>{mac.id}</span>
                  <span className={`badge ${mac.status === 'Active' ? 'badge-us' : mac.status === 'Maintenance' ? 'badge-warning' : ''}`}>
                    {mac.status}
                  </span>
                </div>

                <div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)' }}>{mac.name}</h4>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {mac.type} • {mac.colors} Printing Stations
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#f8fafc', padding: '10px', borderRadius: '6px', fontSize: '0.8rem' }}>
                  <div>
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>MAX SPEED</span>
                    <div style={{ fontWeight: '800', color: '#047857' }}>{mac.maxSpeedMpm} m/min</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>MAX PRINT WIDTH</span>
                    <div style={{ fontWeight: '800', color: '#1e293b' }}>{mac.maxWidthMm} mm</div>
                  </div>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>Operator: <strong>{mac.operator || 'Unassigned'}</strong></div>
                  <div>Location: <strong>{mac.location || 'Printing Hall'}</strong></div>
                </div>

                {/* Edit & Delete Action Buttons */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                  <button 
                    className="btn-secondary" 
                    style={{ flex: 1, padding: '6px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={() => handleOpenEditMachine(mac)}
                  >
                    <Edit3 size={14} style={{ color: 'var(--primary-brand)' }} /> Edit Machine
                  </button>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '6px 10px', fontSize: '0.78rem', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                    onClick={() => handleDeleteMachineClick(mac)}
                    title="Delete Machine"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: ONBOARD / EDIT PRINTING MACHINE */}
      {/* ==================================================================== */}
      {isMachineModalOpen && (
        <div className="modal-overlay" onClick={() => setIsMachineModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '500px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '16px' }}>
              {editingMachineId ? `Edit Printing Machine (${editingMachineId})` : 'Onboard New Printing Machine'}
            </h3>

            <form onSubmit={handleSaveMachineForm}>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Machine Name *</label>
                  <input type="text" className="form-control" required placeholder="e.g. Rotogravure Press #3 (12-Color)" value={machineName} onChange={e => setMachineName(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Machine Technology *</label>
                  <select className="form-control" value={machineType} onChange={e => setMachineType(e.target.value)}>
                    <optgroup label="Printing Presses">
                      <option value="Rotogravure">Rotogravure Press</option>
                      <option value="Flexographic">Flexographic Press</option>
                      <option value="Digital">Digital Printing Unit</option>
                    </optgroup>
                    <optgroup label="Post-Press Machinery">
                      <option value="Laminator">Laminator (Solventless / Combi)</option>
                      <option value="Slitter">Slitter / Rewinder</option>
                      <option value="Pouching">Pouching Machine</option>
                      <option value="Rewinder">Doctoring & Inspection Rewinder</option>
                      <option value="Coating">UV / Coating Machine</option>
                    </optgroup>
                    <optgroup label="Support Areas">
                      <option value="Workshop">Maintenance & Utility Workshop</option>
                      <option value="Store">Factory / Store Area</option>
                      <option value="Lab">Quality & Inspection Lab</option>
                    </optgroup>
                  </select>
                </div>

                <div className="form-group">
                  <label>Number of Colors *</label>
                  <input type="number" className="form-control" required value={machineColors} onChange={e => setMachineColors(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Max Speed (m/min) *</label>
                  <input type="number" className="form-control" required value={machineMaxSpeed} onChange={e => setMachineMaxSpeed(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Max Print Width (mm) *</label>
                  <input type="number" className="form-control" required value={machineMaxWidth} onChange={e => setMachineMaxWidth(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Operational Status *</label>
                  <select className="form-control" value={machineStatus} onChange={e => setMachineStatus(e.target.value)}>
                    <option value="Active">Active In-Use</option>
                    <option value="Maintenance">Under Maintenance</option>
                    <option value="Idle">Idle / Standby</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Assigned Operator</label>
                  <input type="text" className="form-control" value={machineOperator} onChange={e => setMachineOperator(e.target.value)} />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Location / Bay</label>
                  <input type="text" className="form-control" value={machineLocation} onChange={e => setMachineLocation(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsMachineModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">
                  {editingMachineId ? 'Update Machine Settings' : 'Save Printing Machine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: SCHEDULE JOB ON PRINTING MACHINE */}
      {/* ==================================================================== */}
      {isScheduleModalOpen && schedulingOrder && (
        <div className="modal-overlay" onClick={() => setIsScheduleModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '600px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '6px' }}>
              Schedule Job: {schedulingOrder.jobName}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Client: <b>{schedulingOrder.clientName}</b> | Order Qty: <b>{schedulingOrder.orderQtyKg} kg</b> | Print Qty: <b>{printQtyKg} kg</b>
            </p>

            <form onSubmit={handleConfirmSchedule}>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Target Printing Machine *</label>
                  <select 
                    className="form-control"
                    value={targetMachineId}
                    onChange={e => {
                      setTargetMachineId(e.target.value);
                      const mac = machines.find(m => m.id === e.target.value);
                      if (mac) setCustomSpeedInput(mac.maxSpeedMpm);
                    }}
                  >
                    {machines.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.type} - Max {m.maxSpeedMpm} m/min)</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Shift Allocation *</label>
                  <select className="form-control" value={targetShift} onChange={e => setTargetShift(e.target.value)}>
                    <option value="Day Shift">Day Shift (08:00 AM – 08:00 PM)</option>
                    <option value="Night Shift">Night Shift (08:00 PM – 08:00 AM)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Scheduled Date *</label>
                  <input type="date" className="form-control" required value={scheduledDateInput} onChange={e => setScheduledDateInput(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Job Start Time *</label>
                  <input type="time" className="form-control" required value={startTimeInput} onChange={e => setStartTimeInput(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Operating Speed (m/min) *</label>
                  <input type="number" className="form-control" required value={customSpeedInput} onChange={e => setCustomSpeedInput(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Job Setup / Cylinder Changeover (mins) *</label>
                  <input type="number" className="form-control" required value={customJobChangeoverInput} onChange={e => setCustomJobChangeoverInput(e.target.value)} title="Job changeover / size setup duration in minutes" />
                </div>

                <div className="form-group">
                  <label>Roll Changeover Rate (mins / roll) *</label>
                  <input type="number" className="form-control" required value={customRollChangeoverRateInput} onChange={e => setCustomRollChangeoverRateInput(e.target.value)} title="Average changeover time per jumbo film roll" />
                </div>
              </div>

              {/* Live Metric Calculations Box */}
              {previewMetrics && (
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '14px', borderRadius: '8px', marginTop: '16px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#065f46', marginBottom: '8px' }}>
                    ⚡ AUTOMATED PRODUCTION METRICS & TIME BREAKDOWN
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '0.8rem' }}>
                    <div>
                      <span style={{ color: '#047857' }}>Total Length:</span>
                      <div style={{ fontWeight: '800' }}>{(previewMetrics.totalLengthMeters ?? 0).toLocaleString()} meters</div>
                    </div>
                    <div>
                      <span style={{ color: '#047857' }}>Net Run Time:</span>
                      <div style={{ fontWeight: '800' }}>{previewMetrics.runTimeMins} mins</div>
                    </div>
                    <div>
                      <span style={{ color: '#047857' }}>Roll Changes:</span>
                      <div style={{ fontWeight: '800' }}>{previewMetrics.rollChangeoverMins} mins ({previewMetrics.rollCount} rolls)</div>
                    </div>
                    <div>
                      <span style={{ color: '#047857' }}>Job Setup:</span>
                      <div style={{ fontWeight: '800' }}>{previewMetrics.jobChangeoverMins} mins ({previewMetrics.isSameSize ? '1h Same Size' : '2h Size Change'})</div>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: '#047857' }}>Total Allocated Time:</span>
                      <div style={{ fontWeight: '900', fontSize: '1.05rem', color: '#065f46' }}>
                        {previewMetrics.totalDurationHours} Hours ({previewMetrics.totalDurationMins} mins)
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsScheduleModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Confirm & Add to Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
