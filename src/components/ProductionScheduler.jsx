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
  const [editingMachineId, setEditingMachineId] = useState(null);
  const [machineName, setMachineName] = useState('');
  const [machineType, setMachineType] = useState('Rotogravure');
  const [machineColors, setMachineColors] = useState(8);
  const [machineMaxSpeed, setMachineMaxSpeed] = useState(250);
  const [machineMaxWidth, setMachineMaxWidth] = useState(1200);
  const [machineOperator, setMachineOperator] = useState('Plant Operator');
  const [machineLocation, setMachineLocation] = useState('Bay 1 - Rotogravure Hall');
  const [machineStatus, setMachineStatus] = useState('Active');

  // Job Scheduling Modal State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [schedulingOrder, setSchedulingOrder] = useState(null);
  const [targetMachineId, setTargetMachineId] = useState(machines[0]?.id || 'MAC-PRINT-01');
  const [targetShift, setTargetShift] = useState('Day Shift');
  const [scheduledDateInput, setScheduledDateInput] = useState('2026-08-02');
  const [startTimeInput, setStartTimeInput] = useState('08:00');
  const [customSpeedInput, setCustomSpeedInput] = useState(250);

  // Auto-detect Ready for Production Scheduling Queue (Orders where raw materials are available)
  const readyForScheduleOrders = useMemo(() => {
    return orders.map(order => {
      const isOverdue = order.status === 'Delayed' || new Date(order.targetDeliveryDate) < new Date('2026-07-24');
      const reqs = order.materialRequirements || order.rawMaterialRequirements || [];

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
        isOverdue,
        isMaterialReady,
        isAlreadyScheduled,
        priorityTag: isOverdue ? 'HIGH PRIORITY - OVERDUE' : isMaterialReady ? 'READY FOR SCHEDULING' : 'MATERIAL PENDING'
      };
    }).sort((a, b) => {
      // Prioritize overdue jobs first, then ready jobs
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

  // Open Scheduling Modal for an Order
  const handleOpenScheduleModal = (order) => {
    setSchedulingOrder(order);

    const firstMachine = machines[0] || initialMachines[0];
    setTargetMachineId(firstMachine.id);
    setCustomSpeedInput(firstMachine.maxSpeedMpm || 250);
    setTargetShift('Day Shift');
    setScheduledDateInput('2026-08-02');
    setStartTimeInput('08:00');

    setIsScheduleModalOpen(true);
  };

  // Live calculation of metrics for modal preview
  const previewMetrics = useMemo(() => {
    if (!schedulingOrder) return null;

    const layers = schedulingOrder.jobDetails?.layers || [];
    const firstLayer = layers[0] || { filmType: 'PET', micron: 12 };
    const widthMm = schedulingOrder.printWidthMm || schedulingOrder.jobDetails?.printWidthMm || 1000;
    const repeatMm = schedulingOrder.repeatLengthMm || schedulingOrder.jobDetails?.repeatLengthMm || 400;

    // Find previous job scheduled on target machine to check changeover time
    const machineSchedules = schedules.filter(s => s.machineId === targetMachineId);
    const lastJob = machineSchedules[machineSchedules.length - 1];

    return calculatePrintingScheduleMetrics({
      orderQtyKg: schedulingOrder.orderQtyKg || 1000,
      widthMm,
      micron: firstLayer.micron || 12,
      filmType: firstLayer.filmType || 'PET',
      maxSpeedMpm: parseFloat(customSpeedInput) || 250,
      prevJobWidthMm: lastJob?.widthMm || null,
      prevJobRepeatMm: lastJob?.repeatLengthMm || null,
      repeatLengthMm: repeatMm
    });
  }, [schedulingOrder, targetMachineId, customSpeedInput, schedules]);

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
      id: `SCHED-2026-${Math.floor(100 + Math.random() * 900)}`,
      orderId: schedulingOrder.id,
      jobName: schedulingOrder.jobName,
      clientName: schedulingOrder.clientName,
      machineId: targetMachineId,
      shift: targetShift,
      scheduledDate: scheduledDateInput,
      startTime: startTimeInput,
      orderQtyKg: schedulingOrder.orderQtyKg,
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
    setSchedulingOrder(null);
    alert(`Job "${newSchedule.jobName}" scheduled on ${machines.find(m => m.id === targetMachineId)?.name} (${targetShift})! Total duration: ${previewMetrics.totalDurationHours} hrs.`);
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
              const machineScheds = schedules.filter(s => s.machineId === mac.id);

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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    
                    {/* DAY SHIFT TIMELINE (08:00 to 20:00 - 12 Hours) */}
                    {(selectedShiftFilter === 'All' || selectedShiftFilter === 'Day Shift') && (
                      <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                          <span>☀️ DAY SHIFT (08:00 AM – 08:00 PM)</span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>12 Hours Capacity Window</span>
                        </div>

                        {/* Visual Timeline Bar */}
                        <div style={{ height: '48px', background: '#cbd5e1', borderRadius: '6px', overflow: 'hidden', display: 'flex', position: 'relative' }}>
                          {machineScheds.filter(s => s.shift === 'Day Shift').length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', color: '#64748b', fontSize: '0.8rem', fontWeight: '600' }}>
                              No jobs scheduled for Day Shift (Machine Available)
                            </div>
                          ) : (
                            machineScheds.filter(s => s.shift === 'Day Shift').map(s => {
                              const pctWidth = Math.min(100, Math.max(10, (s.totalDurationMins / 720) * 100));
                              return (
                                <div 
                                  key={s.id}
                                  style={{
                                    width: `${pctWidth}%`,
                                    height: '100%',
                                    background: s.priority.includes('OVERDUE') ? '#ef4444' : '#059669',
                                    color: '#ffffff',
                                    padding: '6px 10px',
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justify: 'center',
                                    borderRight: '2px solid #ffffff',
                                    cursor: 'pointer'
                                  }}
                                  title={`Job: ${s.jobName} (${s.clientName})\nStart: ${s.startTime} | End: ${s.endTime}\nMeters: ${s.totalLengthMeters?.toLocaleString()} m\nDuration: ${(s.totalDurationMins/60).toFixed(1)} hrs`}
                                >
                                  <div style={{ fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {s.jobName}
                                  </div>
                                  <div style={{ fontSize: '0.68rem', opacity: 0.9 }}>
                                    {s.startTime} – {s.endTime} ({s.orderQtyKg} kg)
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* NIGHT SHIFT TIMELINE (20:00 to 08:00 - 12 Hours) */}
                    {(selectedShiftFilter === 'All' || selectedShiftFilter === 'Night Shift') && (
                      <div style={{ background: '#f1f5f9', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
                          <span>🌙 NIGHT SHIFT (08:00 PM – 08:00 AM)</span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>12 Hours Capacity Window</span>
                        </div>

                        {/* Visual Timeline Bar */}
                        <div style={{ height: '48px', background: '#94a3b8', borderRadius: '6px', overflow: 'hidden', display: 'flex', position: 'relative' }}>
                          {machineScheds.filter(s => s.shift === 'Night Shift').length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', color: '#ffffff', fontSize: '0.8rem', fontWeight: '600' }}>
                              No jobs scheduled for Night Shift (Machine Available)
                            </div>
                          ) : (
                            machineScheds.filter(s => s.shift === 'Night Shift').map(s => {
                              const pctWidth = Math.min(100, Math.max(10, (s.totalDurationMins / 720) * 100));
                              return (
                                <div 
                                  key={s.id}
                                  style={{
                                    width: `${pctWidth}%`,
                                    height: '100%',
                                    background: '#6366f1',
                                    color: '#ffffff',
                                    padding: '6px 10px',
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justify: 'center',
                                    borderRight: '2px solid #ffffff',
                                    cursor: 'pointer'
                                  }}
                                  title={`Job: ${s.jobName} (${s.clientName})\nStart: ${s.startTime} | End: ${s.endTime}\nMeters: ${s.totalLengthMeters?.toLocaleString()} m`}
                                >
                                  <div style={{ fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {s.jobName}
                                  </div>
                                  <div style={{ fontSize: '0.68rem', opacity: 0.9 }}>
                                    {s.startTime} – {s.endTime} ({s.orderQtyKg} kg)
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

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
                Orders with verified film stock are pushed to top. Overdue jobs highlighted in red for urgent scheduling.
              </p>
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Priority / Status</th>
                <th>Order ID</th>
                <th>Job & Client Name</th>
                <th>Substrate Structure</th>
                <th>Order Qty (Kg)</th>
                <th>Delivery Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {readyForScheduleOrders.map(order => (
                <tr key={order.id} className={order.isOverdue ? 'row-delayed-highlight' : ''}>
                  <td>
                    {order.isOverdue ? (
                      <span className="badge-delayed-tag">🚨 HIGH PRIORITY - OVERDUE</span>
                    ) : order.isAlreadyScheduled ? (
                      <span className="badge badge-us">SCHEDULED</span>
                    ) : (
                      <span className="badge" style={{ background: '#dcfce7', color: '#166534' }}>READY TO SCHEDULE</span>
                    )}
                  </td>
                  <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{order.id}</td>
                  <td>
                    <div style={{ fontWeight: '700' }}>{order.jobName}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{order.clientName}</div>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{order.structure}</td>
                  <td className="bold-val">{order.orderQtyKg.toLocaleString()} kg</td>
                  <td style={{ color: order.isOverdue ? '#dc2626' : 'inherit', fontWeight: order.isOverdue ? 'bold' : 'normal' }}>
                    {order.targetDeliveryDate}
                  </td>
                  <td>
                    <button 
                      className="btn-primary" 
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                      onClick={() => handleOpenScheduleModal(order)}
                    >
                      <Clock size={14} /> Schedule Job
                    </button>
                  </td>
                </tr>
              ))}
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
                    <option value="Rotogravure">Rotogravure Press</option>
                    <option value="Flexographic">Flexographic Press</option>
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
              Client: <b>{schedulingOrder.clientName}</b> | Qty: <b>{schedulingOrder.orderQtyKg} kg</b>
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
                  <label>Shift Start Time *</label>
                  <input type="time" className="form-control" required value={startTimeInput} onChange={e => setStartTimeInput(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Operating Speed (m/min) *</label>
                  <input type="number" className="form-control" required value={customSpeedInput} onChange={e => setCustomSpeedInput(e.target.value)} />
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
                      <div style={{ fontWeight: '800' }}>{previewMetrics.totalLengthMeters.toLocaleString()} meters</div>
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
