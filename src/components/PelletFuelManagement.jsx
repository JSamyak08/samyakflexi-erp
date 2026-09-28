import React, { useState, useMemo } from 'react';
import { 
  Flame, 
  Plus, 
  Download, 
  Search, 
  Calendar, 
  Clock, 
  TrendingUp, 
  Package, 
  Building2, 
  UserCheck, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Edit3, 
  SlidersHorizontal,
  Printer,
  DollarSign,
  X,
  Layers,
  Sparkles,
  Zap,
  Info
} from 'lucide-react';

export default function PelletFuelManagement({
  urlParams = {},
  userRole = "Admin",
  userName = "Plant Manager",
  vendors = [],
  machines = [],
  pelletInwards = [],
  pelletConsumptions = [],
  onSavePelletInward,
  onDeletePelletInward,
  onSavePelletConsumption,
  onDeletePelletConsumption
}) {
  const [activeSubTab, setActiveSubTab] = useState(urlParams?.subTab || 'consumption'); // 'consumption' | 'inward'

  // Filter Bar States
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [machineFilter, setMachineFilter] = useState('ALL');
  const [shiftFilter, setShiftFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showConsumptionModal, setShowConsumptionModal] = useState(false);
  const [editingConsumption, setEditingConsumption] = useState(null);

  const [showInwardModal, setShowInwardModal] = useState(false);
  const [editingInward, setEditingInward] = useState(null);

  // Form State: Consumption
  const [cDate, setCDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [cShift, setCShift] = useState('Shift A: Day (08:00 - 20:00)');
  const [cMachine, setCMachine] = useState('');
  const [cQtyKg, setCQtyKg] = useState('');
  const [cHours, setCHours] = useState(12);
  const [cPrintedKg, setCPrintedKg] = useState('');
  const [cGrnSource, setCGrnSource] = useState('AUTO_WEIGHTED');
  const [cManager, setCManager] = useState(userName || 'Plant Manager');
  const [cRemarks, setCRemarks] = useState('');

  // Auto-calculated effective cost rate directly pulled from Inward GRNs
  const effectiveInwardCostRate = useMemo(() => {
    if (cGrnSource && cGrnSource !== 'AUTO_WEIGHTED') {
      const grn = (pelletInwards || []).find(i => String(i.id) === String(cGrnSource) || String(i.grnNo) === String(cGrnSource));
      if (grn && Number(grn.unitCostPerKg) > 0) {
        return Number(grn.unitCostPerKg);
      }
    }
    return stockSummary.weightedAvgCostPerKg || 0;
  }, [cGrnSource, pelletInwards, stockSummary.weightedAvgCostPerKg]);

  // Form State: Inward
  const [iGrnNo, setIGrnNo] = useState('');
  const [iDate, setIDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [iVendor, setIVendor] = useState('');
  const [iInvoiceNo, setIInvoiceNo] = useState('');
  const [iChalanNo, setIChalanNo] = useState('');
  const [iQtyKg, setIQtyKg] = useState('');
  const [iRatePerKg, setIRatePerKg] = useState('');
  const [iLocation, setILocation] = useState('Boiler Fuel Bay');
  const [iVehicleNo, setIVehicleNo] = useState('');
  const [iReceivedBy, setIReceivedBy] = useState(userName || 'Plant Manager');
  const [iRemarks, setIRemarks] = useState('');

  // Sourced Machines list
  const availableMachines = useMemo(() => {
    if (machines && machines.length > 0) {
      return machines.map(m => m.name).filter(Boolean);
    }
    return [
      'Printing Press 1 (Boiler 1)',
      'Printing Press 2 (Boiler 2)',
      'Solventless Laminator (Hot Water Unit)',
      'Utility Hot Air Generator'
    ];
  }, [machines]);

  // Overall Stock & Weighted Average Cost Calculation
  const stockSummary = useMemo(() => {
    const totalInwardKg = (pelletInwards || []).reduce((acc, item) => acc + (Number(item.inwardQtyKg) || 0), 0);
    const totalInwardAmount = (pelletInwards || []).reduce((acc, item) => acc + (Number(item.totalAmount) || (Number(item.inwardQtyKg) * Number(item.unitCostPerKg)) || 0), 0);
    
    const weightedAvgCostPerKg = totalInwardKg > 0 ? (totalInwardAmount / totalInwardKg) : 0;

    const totalConsumedKg = (pelletConsumptions || []).reduce((acc, item) => acc + (Number(item.consumedQtyKg) || 0), 0);
    
    const currentStockKg = totalInwardKg - totalConsumedKg;

    // Month-to-Date (MTD) Calculations
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const mtdConsumptions = (pelletConsumptions || []).filter(item => {
      if (!item.consumptionDate) return false;
      const d = new Date(item.consumptionDate);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });

    const mtdConsumedKg = mtdConsumptions.reduce((acc, item) => acc + (Number(item.consumedQtyKg) || 0), 0);
    const mtdOperatingHours = mtdConsumptions.reduce((acc, item) => acc + (Number(item.operatingHours) || 0), 0);
    const mtdPrintedKg = mtdConsumptions.reduce((acc, item) => acc + (Number(item.referencePrintingDoneKg) || 0), 0);

    // Active logging days in current month
    const activeLoggingDaysSet = new Set(mtdConsumptions.map(c => c.consumptionDate));
    const activeLoggingDaysCount = activeLoggingDaysSet.size || 1;

    const avgDailyConsumptionKg = (mtdConsumedKg / activeLoggingDaysCount) || 0;

    // Cost calculations
    const mtdExpenditure = mtdConsumptions.reduce((acc, item) => {
      const costPerKg = Number(item.inwardCostPerKgUsed) || weightedAvgCostPerKg;
      return acc + ((Number(item.consumedQtyKg) || 0) * costPerKg);
    }, 0);

    const avgCostPerHour = mtdOperatingHours > 0 ? (mtdExpenditure / mtdOperatingHours) : 0;
    const avgCostPerKgPrinted = mtdPrintedKg > 0 ? (mtdExpenditure / mtdPrintedKg) : 0;

    return {
      totalInwardKg,
      totalConsumedKg,
      currentStockKg,
      weightedAvgCostPerKg,
      mtdConsumedKg,
      mtdExpenditure,
      avgDailyConsumptionKg,
      avgCostPerHour,
      avgCostPerKgPrinted,
      activeLoggingDaysCount
    };
  }, [pelletInwards, pelletConsumptions]);

  // Filtered Consumption Records
  const filteredConsumptions = useMemo(() => {
    return (pelletConsumptions || []).filter(item => {
      if (startDate && item.consumptionDate && item.consumptionDate < startDate) return false;
      if (endDate && item.consumptionDate && item.consumptionDate > endDate) return false;
      if (machineFilter !== 'ALL' && item.machineName !== machineFilter) return false;
      if (shiftFilter !== 'ALL' && item.shift !== shiftFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const m = (item.machineName || '').toLowerCase();
        const mgr = (item.plantManagerName || '').toLowerCase();
        const rem = (item.remarks || '').toLowerCase();
        const shift = (item.shift || '').toLowerCase();
        if (!m.includes(q) && !mgr.includes(q) && !rem.includes(q) && !shift.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [pelletConsumptions, startDate, endDate, machineFilter, shiftFilter, searchQuery]);

  // Filtered Inward Records
  const filteredInwards = useMemo(() => {
    return (pelletInwards || []).filter(item => {
      if (startDate && item.inwardDate && item.inwardDate < startDate) return false;
      if (endDate && item.inwardDate && item.inwardDate > endDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const grn = (item.grnNo || '').toLowerCase();
        const v = (item.vendorName || '').toLowerCase();
        const inv = (item.invoiceNo || '').toLowerCase();
        const loc = (item.storageLocation || '').toLowerCase();
        if (!grn.includes(q) && !v.includes(q) && !inv.includes(q) && !loc.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [pelletInwards, startDate, endDate, searchQuery]);

  // Open Add Consumption Modal
  const handleOpenNewConsumption = () => {
    setEditingConsumption(null);
    setCDate(new Date().toISOString().split('T')[0]);
    setCShift('Shift A: Day (08:00 - 20:00)');
    setCMachine(availableMachines[0] || '');
    setCQtyKg('');
    setCHours(12);
    setCPrintedKg('');
    setCGrnSource('AUTO_WEIGHTED');
    setCManager(userName || 'Plant Manager');
    setCRemarks('');
    setShowConsumptionModal(true);
  };

  // Open Edit Consumption Modal
  const handleEditConsumption = (item) => {
    setEditingConsumption(item);
    setCDate(item.consumptionDate || new Date().toISOString().split('T')[0]);
    setCShift(item.shift || 'Shift A: Day (08:00 - 20:00)');
    setCMachine(item.machineName || availableMachines[0] || '');
    setCQtyKg(item.consumedQtyKg || '');
    setCHours(item.operatingHours || 12);
    setCPrintedKg(item.referencePrintingDoneKg || '');
    setCGrnSource(item.grnNoRef || 'AUTO_WEIGHTED');
    setCManager(item.plantManagerName || userName || 'Plant Manager');
    setCRemarks(item.remarks || '');
    setShowConsumptionModal(true);
  };

  // Save Consumption Record
  const handleSaveConsumptionForm = async (e) => {
    e.preventDefault();
    if (!cQtyKg || Number(cQtyKg) <= 0) {
      alert("Please enter a valid consumed quantity in Kgs.");
      return;
    }
    if (!cHours || Number(cHours) <= 0) {
      alert("Please enter valid operating hours.");
      return;
    }
    if (!cPrintedKg || Number(cPrintedKg) <= 0) {
      alert("Please enter reference printing done in Kgs during the shift.");
      return;
    }

    const costPerKg = effectiveInwardCostRate;
    const consumed = Number(cQtyKg);
    const hours = Number(cHours);
    const printedKg = Number(cPrintedKg);

    const costPerHour = hours > 0 ? (consumed * costPerKg) / hours : 0;
    const costPerKgPrinted = printedKg > 0 ? (consumed * costPerKg) / printedKg : 0;

    const record = {
      id: editingConsumption ? editingConsumption.id : `PEL-CON-${Date.now()}`,
      consumptionDate: cDate,
      shift: cShift,
      machineName: cMachine,
      consumedQtyKg: consumed,
      operatingHours: hours,
      referencePrintingDoneKg: printedKg,
      inwardCostPerKgUsed: costPerKg,
      grnNoRef: cGrnSource,
      costPerHour: Math.round(costPerHour * 100) / 100,
      costPerKgPrinted: Math.round(costPerKgPrinted * 100) / 100,
      plantManagerName: cManager,
      remarks: cRemarks,
      updatedAt: new Date().toISOString()
    };

    if (onSavePelletConsumption) {
      await onSavePelletConsumption(record);
    }
    setShowConsumptionModal(false);
  };

  // Open Add Inward Modal
  const handleOpenNewInward = () => {
    setEditingInward(null);
    setIGrnNo(`GRN-PEL-${Math.floor(1000 + Math.random() * 9000)}`);
    setIDate(new Date().toISOString().split('T')[0]);
    setIVendor(vendors[0]?.name || vendors[0]?.companyName || '');
    setIInvoiceNo('');
    setIChalanNo('');
    setIQtyKg('');
    setIRatePerKg('');
    setILocation('Boiler Fuel Bay');
    setIVehicleNo('');
    setIReceivedBy(userName || 'Plant Manager');
    setIRemarks('');
    setShowInwardModal(true);
  };

  // Open Edit Inward Modal
  const handleEditInward = (item) => {
    setEditingInward(item);
    setIGrnNo(item.grnNo || `GRN-PEL-${Math.floor(1000 + Math.random() * 9000)}`);
    setIDate(item.inwardDate || new Date().toISOString().split('T')[0]);
    setIVendor(item.vendorName || '');
    setIInvoiceNo(item.invoiceNo || '');
    setIChalanNo(item.chalanNo || '');
    setIQtyKg(item.inwardQtyKg || '');
    setIRatePerKg(item.unitCostPerKg || '');
    setILocation(item.storageLocation || 'Boiler Fuel Bay');
    setIVehicleNo(item.vehicleNo || '');
    setIReceivedBy(item.receivedBy || userName || 'Plant Manager');
    setIRemarks(item.remarks || '');
    setShowInwardModal(true);
  };

  // Save Inward Form
  const handleSaveInwardForm = async (e) => {
    e.preventDefault();
    if (!iQtyKg || Number(iQtyKg) <= 0) {
      alert("Please enter a valid inward quantity in Kgs.");
      return;
    }
    if (!iRatePerKg || Number(iRatePerKg) <= 0) {
      alert("Please enter a valid purchase price per Kg.");
      return;
    }

    const qty = Number(iQtyKg);
    const rate = Number(iRatePerKg);
    const totalAmt = qty * rate;

    const record = {
      id: editingInward ? editingInward.id : `PEL-GRN-${Date.now()}`,
      grnNo: iGrnNo,
      inwardDate: iDate,
      vendorName: iVendor,
      invoiceNo: iInvoiceNo,
      chalanNo: iChalanNo,
      inwardQtyKg: qty,
      unitCostPerKg: rate,
      totalAmount: Math.round(totalAmt * 100) / 100,
      storageLocation: iLocation,
      vehicleNo: iVehicleNo,
      receivedBy: iReceivedBy,
      remarks: iRemarks,
      updatedAt: new Date().toISOString()
    };

    if (onSavePelletInward) {
      await onSavePelletInward(record);
    }
    setShowInwardModal(false);
  };

  // Export Consumptions CSV
  const handleExportConsumptionsCSV = () => {
    let csv = "Consumption Date,Shift,Boiler / Machine,Pellet Consumed (Kg),Operating Time (Hrs),Ref Printing Done (Kg),Inward Cost / Kg (₹),Cost / Operating Hour (₹/hr),Cost / Kg Printed (₹/kg),Plant Manager,Remarks\n";
    filteredConsumptions.forEach(c => {
      csv += `"${c.consumptionDate}","${c.shift}","${c.machineName}",${c.consumedQtyKg},${c.operatingHours},${c.referencePrintingDoneKg},${c.inwardCostPerKgUsed || stockSummary.weightedAvgCostPerKg},${c.costPerHour || 0},${c.costPerKgPrinted || 0},"${c.plantManagerName || ''}","${(c.remarks || '').replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Boiler_Pellet_Consumption_Log_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Export Inwards CSV
  const handleExportInwardsCSV = () => {
    let csv = "GRN No,Inward Date,Vendor / Supplier,Invoice No,Chalan No,Inward Qty (Kg),Rate / Kg (₹),Total Amount (₹),Storage Bay,Received By,Remarks\n";
    filteredInwards.forEach(i => {
      csv += `"${i.grnNo}","${i.inwardDate}","${i.vendorName || ''}","${i.invoiceNo || ''}","${i.chalanNo || ''}",${i.inwardQtyKg},${i.unitCostPerKg},${i.totalAmount},"${i.storageLocation || ''}","${i.receivedBy || ''}","${(i.remarks || '').replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Boiler_Pellet_GRN_Inwards_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="tab-container" style={{ padding: '24px 28px' }}>
      
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#ffffff', width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)' }}>
              <Flame size={24} />
            </span>
            Boiler Pellet Fuel Stock & Consumption Engine
          </h2>
          <p style={{ fontSize: '0.86rem', color: '#64748b', marginTop: '4px', marginLeft: '54px' }}>
            Day-wise boiler pellet fuel consumption logging, GRN inwarding, cost per operating hour & cost per kg of printing produced.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            type="button" 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
            onClick={activeSubTab === 'consumption' ? handleExportConsumptionsCSV : handleExportInwardsCSV}
          >
            <Download size={16} /> Export CSV Report
          </button>
          <button 
            type="button" 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', padding: '9px 16px', borderRadius: '8px', background: '#fef3c7', borderColor: '#fde68a', color: '#92400e', boxShadow: '0 2px 4px rgba(217, 119, 6, 0.12)' }}
            onClick={handleOpenNewInward}
          >
            <Package size={16} /> + GRN Inward Stock
          </button>
          <button 
            type="button" 
            className="btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', padding: '9px 18px', borderRadius: '8px', background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)', borderColor: '#b45309', boxShadow: '0 4px 10px rgba(217, 119, 6, 0.3)' }}
            onClick={handleOpenNewConsumption}
          >
            <Flame size={16} /> + Record Daily Consumption
          </button>
        </div>
      </div>

      {/* Executive KPI Cards Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px', marginBottom: '24px' }}>
        
        {/* Current Stock */}
        <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', background: 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)', border: '1px solid #fde68a', boxShadow: '0 4px 12px -2px rgba(217, 119, 6, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: '800', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Pellet Stock
            </span>
            <div style={{ background: '#fef3c7', color: '#d97706', padding: '6px', borderRadius: '8px' }}>
              <Flame size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: '900', color: '#78350f', marginTop: '8px', letterSpacing: '-0.02em' }}>
            {stockSummary.currentStockKg.toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#b45309' }}>Kg</span>
          </div>
          <div style={{ fontSize: '0.76rem', color: '#b45309', marginTop: '6px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Avg Inward Rate: <strong style={{ color: '#78350f' }}>₹ {stockSummary.weightedAvgCostPerKg ? stockSummary.weightedAvgCostPerKg.toFixed(2) : '0.00'} / kg</strong>
          </div>
        </div>

        {/* MTD Consumption */}
        <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Month-to-Date Consumed
            </span>
            <div style={{ background: '#e0f2fe', color: '#0284c7', padding: '6px', borderRadius: '8px' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: '900', color: '#0f172a', marginTop: '8px', letterSpacing: '-0.02em' }}>
            {stockSummary.mtdConsumedKg.toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#64748b' }}>Kg</span>
          </div>
          <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '6px' }}>
            MTD Expense: <strong style={{ color: '#0284c7' }}>₹ {Math.round(stockSummary.mtdExpenditure).toLocaleString()}</strong>
          </div>
        </div>

        {/* Avg Daily Consumption */}
        <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Avg. Daily Consumption
            </span>
            <div style={{ background: '#d1fae5', color: '#059669', padding: '6px', borderRadius: '8px' }}>
              <Calendar size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: '900', color: '#059669', marginTop: '8px', letterSpacing: '-0.02em' }}>
            {Math.round(stockSummary.avgDailyConsumptionKg).toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#047857' }}>Kg/day</span>
          </div>
          <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '6px' }}>
            Across {stockSummary.activeLoggingDaysCount} active logged shift days
          </div>
        </div>

        {/* Cost / Operating Hour */}
        <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pellet Cost / Boiler Hour
            </span>
            <div style={{ background: '#f3e8ff', color: '#7c3aed', padding: '6px', borderRadius: '8px' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: '900', color: '#7c3aed', marginTop: '8px', letterSpacing: '-0.02em' }}>
            ₹ {stockSummary.avgCostPerHour.toFixed(2)} <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#6d28d9' }}>/hr</span>
          </div>
          <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '6px' }}>
            (Utilised stock × Cost/kg) / Operating hrs
          </div>
        </div>

        {/* Cost / Kg Printing Done */}
        <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pellet Cost / Kg Printed
            </span>
            <div style={{ background: '#ffe4e6', color: '#e11d48', padding: '6px', borderRadius: '8px' }}>
              <Printer size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: '900', color: '#dc2626', marginTop: '8px', letterSpacing: '-0.02em' }}>
            ₹ {stockSummary.avgCostPerKgPrinted.toFixed(2)} <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#b91c1c' }}>/kg</span>
          </div>
          <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '6px' }}>
            Reference printed output in shift
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('consumption')}
          style={{
            padding: '12px 22px',
            fontSize: '0.92rem',
            fontWeight: '800',
            color: activeSubTab === 'consumption' ? '#d97706' : '#64748b',
            borderBottom: activeSubTab === 'consumption' ? '3px solid #d97706' : '3px solid transparent',
            background: 'none',
            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
            transition: 'all 0.15s ease'
          }}
        >
          <Flame size={18} /> Daily Boiler Consumption Log ({filteredConsumptions.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('inward')}
          style={{
            padding: '12px 22px',
            fontSize: '0.92rem',
            fontWeight: '800',
            color: activeSubTab === 'inward' ? '#d97706' : '#64748b',
            borderBottom: activeSubTab === 'inward' ? '3px solid #d97706' : '3px solid transparent',
            background: 'none',
            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
            transition: 'all 0.15s ease'
          }}
        >
          <Package size={18} /> GRN Inward & Pellet Stock Register ({filteredInwards.length})
        </button>
      </div>

      {/* Sleek Filter Toolbar */}
      <div className="glass-panel" style={{ padding: '18px 22px', marginBottom: '20px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#475569', fontSize: '0.82rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <SlidersHorizontal size={15} style={{ color: '#d97706' }} /> Filter Logs & Analysis Range
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>
              From Date
            </label>
            <input 
              type="date" 
              className="input-field" 
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>
              To Date
            </label>
            <input 
              type="date" 
              className="input-field" 
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
            />
          </div>

          {activeSubTab === 'consumption' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>
                  Machine / Boiler Unit
                </label>
                <select 
                  className="input-field" 
                  style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  value={machineFilter} 
                  onChange={(e) => setMachineFilter(e.target.value)}
                >
                  <option value="ALL">All Machines & Boilers</option>
                  {availableMachines.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>
                  Shift Filter
                </label>
                <select 
                  className="input-field" 
                  style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  value={shiftFilter} 
                  onChange={(e) => setShiftFilter(e.target.value)}
                >
                  <option value="ALL">All Shifts</option>
                  <option value="Shift A: Day (08:00 - 20:00)">Shift A (Day)</option>
                  <option value="Shift B: Night (20:00 - 08:00)">Shift B (Night)</option>
                  <option value="Full Day 24h">Full Day 24h</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>
              Search Records
            </label>
            <input 
              type="text" 
              className="input-field" 
              style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              placeholder={activeSubTab === 'consumption' ? "Search manager, machine, notes..." : "Search GRN, vendor, invoice..."} 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
            />
          </div>

          {(startDate || endDate || machineFilter !== 'ALL' || shiftFilter !== 'ALL' || searchQuery) && (
            <div>
              <button 
                type="button" 
                className="btn-secondary" 
                style={{ width: '100%', fontSize: '0.82rem', padding: '9px', borderRadius: '8px', fontWeight: '700' }}
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setMachineFilter('ALL');
                  setShiftFilter('ALL');
                  setSearchQuery('');
                }}
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SUB-TAB 1: DAILY CONSUMPTION LOG REGISTER */}
      {activeSubTab === 'consumption' && (
        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
          <table className="data-table" style={{ width: '100%', margin: 0 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Date & Shift</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Boiler / Machine</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Pellet Consumed (Kg)</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Operating Time (Hrs)</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Ref Printing Output (Kg)</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Cost / Boiler Hour (₹/hr)</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Cost / Kg Printed (₹/kg)</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Plant Manager</th>
                <th style={{ textAlign: 'center', padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredConsumptions.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                    <Flame size={36} style={{ color: '#cbd5e1', marginBottom: '10px' }} />
                    <div style={{ fontWeight: '700', fontSize: '0.98rem', color: '#64748b' }}>No boiler pellet consumption records found</div>
                    <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '4px' }}>Click "+ Record Daily Consumption" to log day-wise boiler fuel usage.</div>
                  </td>
                </tr>
              ) : (
                filteredConsumptions.map(item => {
                  const costPerKg = Number(item.inwardCostPerKgUsed) || stockSummary.weightedAvgCostPerKg || 0;
                  const consumed = Number(item.consumedQtyKg) || 0;
                  const hours = Number(item.operatingHours) || 12;
                  const printed = Number(item.referencePrintingDoneKg) || 0;

                  const costHr = item.costPerHour || (hours > 0 ? (consumed * costPerKg) / hours : 0);
                  const costKgPrinted = item.costPerKgPrinted || (printed > 0 ? (consumed * costPerKg) / printed : 0);

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.88rem' }}>{item.consumptionDate}</div>
                        <span style={{ display: 'inline-block', marginTop: '4px', background: item.shift.includes('Day') ? '#fef3c7' : '#e0e7ff', color: item.shift.includes('Day') ? '#92400e' : '#3730a3', fontSize: '0.7rem', fontWeight: '800', padding: '2px 7px', borderRadius: '4px' }}>
                          {item.shift}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.88rem' }}>{item.machineName || 'Printing Boiler'}</div>
                        {item.remarks && (
                          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '3px' }}>Note: {item.remarks}</div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: '900', color: '#b45309', fontSize: '0.98rem' }}>
                          {consumed.toLocaleString()} <span style={{ fontSize: '0.78rem' }}>Kg</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>@ ₹{costPerKg.toFixed(2)}/kg</div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.88rem' }}>{hours} hrs</div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: '800', color: '#0284c7', fontSize: '0.92rem' }}>
                          {printed.toLocaleString()} <span style={{ fontSize: '0.75rem' }}>Kg</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: '900', color: '#7c3aed', fontSize: '0.96rem' }}>
                          ₹ {costHr.toFixed(2)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>per operating hr</div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: '900', color: '#dc2626', fontSize: '0.96rem' }}>
                          ₹ {costKgPrinted.toFixed(2)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>per kg printed</div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: '700', color: '#334155', fontSize: '0.85rem' }}>{item.plantManagerName || 'Plant Manager'}</div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button 
                            type="button" 
                            className="btn-secondary" 
                            style={{ padding: '4px 10px', fontSize: '0.78rem', borderRadius: '6px', fontWeight: '700' }}
                            onClick={() => handleEditConsumption(item)}
                            title="Edit Consumption Record"
                          >
                            <Edit3 size={13} /> Edit
                          </button>
                          {onDeletePelletConsumption && (
                            <button 
                              type="button" 
                              className="btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '0.78rem', color: '#dc2626', borderRadius: '6px' }}
                              onClick={() => {
                                if (window.confirm("Are you sure you want to delete this pellet consumption log?")) {
                                  onDeletePelletConsumption(item.id);
                                }
                              }}
                              title="Delete Record"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* SUB-TAB 2: GRN INWARD REGISTER & PELLET STOCK */}
      {activeSubTab === 'inward' && (
        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
          <table className="data-table" style={{ width: '100%', margin: 0 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>GRN No & Date</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Supplier / Vendor</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Invoice / Chalan</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Inward Qty (Kg)</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Unit Price (₹/kg)</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Total Inward Value (₹)</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Storage Bay / Silo</th>
                <th style={{ padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Received By</th>
                <th style={{ textAlign: 'center', padding: '14px 16px', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredInwards.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                    <Package size={36} style={{ color: '#cbd5e1', marginBottom: '10px' }} />
                    <div style={{ fontWeight: '700', fontSize: '0.98rem', color: '#64748b' }}>No pellet GRN inward records found</div>
                    <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '4px' }}>Click "+ GRN Inward Stock" to record incoming pellet shipments.</div>
                  </td>
                </tr>
              ) : (
                filteredInwards.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.88rem' }}>{item.grnNo}</div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>Date: {item.inwardDate}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: '800', color: '#1e293b', fontSize: '0.88rem' }}>{item.vendorName || 'Direct Factory Purchase'}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#475569' }}>
                        Inv: {item.invoiceNo || 'N/A'}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Ch: {item.chalanNo || 'N/A'}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: '900', color: '#059669', fontSize: '0.98rem' }}>
                        + {(Number(item.inwardQtyKg) || 0).toLocaleString()} <span style={{ fontSize: '0.78rem' }}>Kg</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.88rem' }}>
                        ₹ {(Number(item.unitCostPerKg) || 0).toFixed(2)} / kg
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: '900', color: '#0284c7', fontSize: '0.96rem' }}>
                        ₹ {(Number(item.totalAmount) || (Number(item.inwardQtyKg) * Number(item.unitCostPerKg))).toLocaleString()}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: '6px', fontSize: '0.76rem', fontWeight: '800' }}>
                        {item.storageLocation || 'Silo 1'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: '700', color: '#334155', fontSize: '0.85rem' }}>{item.receivedBy || 'Plant Manager'}</div>
                    </td>
                    <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          style={{ padding: '4px 10px', fontSize: '0.78rem', borderRadius: '6px', fontWeight: '700' }}
                          onClick={() => handleEditInward(item)}
                          title="Edit GRN Inward"
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        {onDeletePelletInward && (
                          <button 
                            type="button" 
                            className="btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '0.78rem', color: '#dc2626', borderRadius: '6px' }}
                            onClick={() => {
                              if (window.confirm("Are you sure you want to delete this GRN inward record?")) {
                                onDeletePelletInward(item.id);
                              }
                            }}
                            title="Delete Record"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL 1: DAILY CONSUMPTION ENTRY */}
      {showConsumptionModal && (
        <div className="modal-backdrop" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '720px', width: '92%', borderRadius: '18px', border: '1px solid #cbd5e1', boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)', padding: '0', overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)', padding: '20px 24px', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ background: 'rgba(255, 255, 255, 0.2)', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Flame size={22} />
                </span>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '900', margin: 0, color: '#ffffff' }}>
                    {editingConsumption ? 'Edit Daily Boiler Consumption' : 'Record Daily Boiler Pellet Consumption'}
                  </h3>
                  <p style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '2px', margin: 0 }}>
                    Enter day-wise shift operating logs, pellet fuel consumption, and printing output.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowConsumptionModal(false)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#ffffff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveConsumptionForm} style={{ padding: '24px 28px' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Consumption Date <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input 
                    type="date" 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    required
                    value={cDate}
                    onChange={(e) => setCDate(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Operating Shift <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <select 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    value={cShift}
                    onChange={(e) => setCShift(e.target.value)}
                  >
                    <option value="Shift A: Day (08:00 - 20:00)">Shift A: Day (08:00 - 20:00)</option>
                    <option value="Shift B: Night (20:00 - 08:00)">Shift B: Night (20:00 - 08:00)</option>
                    <option value="Full Day 24h">Full Day 24h</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                  Boiler / Printing Machine Unit <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select 
                  className="input-field"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  required
                  value={cMachine}
                  onChange={(e) => setCMachine(e.target.value)}
                >
                  <option value="" disabled>Select Boiler / Machine Press...</option>
                  {availableMachines.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Pellet Consumed (Kg) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input 
                    type="number" 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    placeholder="e.g. 450" 
                    required
                    min="0.1"
                    step="0.1"
                    value={cQtyKg}
                    onChange={(e) => setCQtyKg(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Operating Time (Hrs) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input 
                    type="number" 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    placeholder="e.g. 12" 
                    required
                    min="0.5"
                    step="0.5"
                    value={cHours}
                    onChange={(e) => setCHours(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Printed Output (Kg) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input 
                    type="number" 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    placeholder="e.g. 1200" 
                    required
                    min="1"
                    step="1"
                    value={cPrintedKg}
                    onChange={(e) => setCPrintedKg(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Inward GRN Stock Batch Source <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <select 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    value={cGrnSource}
                    onChange={(e) => setCGrnSource(e.target.value)}
                  >
                    <option value="AUTO_WEIGHTED">
                      Auto Weighted Average (₹ {stockSummary.weightedAvgCostPerKg ? stockSummary.weightedAvgCostPerKg.toFixed(2) : '0.00'} / kg)
                    </option>
                    {(pelletInwards || []).map(g => (
                      <option key={g.id || g.grnNo} value={g.grnNo || g.id}>
                        {g.grnNo} - {g.vendorName || 'Inward Stock'} (₹ {Number(g.unitCostPerKg || 0).toFixed(2)}/kg - {g.inwardDate})
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px' }}>
                    Select specific GRN shipment or use auto-weighted inward average
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Inward Cost Rate per Kg (₹) <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#059669' }}>(Auto-Taken From GRN)</span>
                  </label>
                  <input 
                    type="text" 
                    className="input-field" 
                    readOnly
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', background: '#f8fafc', color: '#0f172a', fontWeight: '800', cursor: 'not-allowed' }}
                    value={`₹ ${effectiveInwardCostRate.toFixed(2)} / Kg`}
                  />
                  <div style={{ fontSize: '0.74rem', color: '#059669', marginTop: '4px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={12} /> Auto-fetched directly from Inward GRN records
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                  Recorded By (Plant Manager) <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input 
                  type="text" 
                  className="input-field" 
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  required
                  value={cManager}
                  onChange={(e) => setCManager(e.target.value)}
                />
              </div>

              {/* Dynamic Live Cost Calculations Preview Card */}
              {cQtyKg && cHours && cPrintedKg && (
                <div style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', padding: '16px 20px', borderRadius: '12px', border: '1px solid #fde68a', marginBottom: '20px', boxShadow: '0 2px 6px rgba(217, 119, 6, 0.08)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#92400e', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={16} style={{ color: '#d97706' }} /> Shift Pellet Fuel Cost Metrics Analysis:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                      <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: '700' }}>Cost / Boiler Hour:</span>
                      <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#7c3aed', marginTop: '2px' }}>
                        ₹ {((Number(cQtyKg) * effectiveInwardCostRate) / Number(cHours)).toFixed(2)} <span style={{ fontSize: '0.76rem', fontWeight: '700' }}>/hr</span>
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                      <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: '700' }}>Cost / Kg Printed:</span>
                      <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#dc2626', marginTop: '2px' }}>
                        ₹ {((Number(cQtyKg) * effectiveInwardCostRate) / Number(cPrintedKg)).toFixed(2)} <span style={{ fontSize: '0.76rem', fontWeight: '700' }}>/kg</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                  Remarks / Shift Notes
                </label>
                <textarea 
                  className="input-field" 
                  rows={2} 
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', resize: 'vertical' }}
                  placeholder="Boiler pressure, temperature, pellet moisture, or shift notes..."
                  value={cRemarks}
                  onChange={(e) => setCRemarks(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '18px' }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  style={{ padding: '10px 22px', borderRadius: '8px', fontWeight: '700', fontSize: '0.88rem' }}
                  onClick={() => setShowConsumptionModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ padding: '10px 24px', borderRadius: '8px', fontWeight: '800', fontSize: '0.88rem', background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)', borderColor: '#b45309', boxShadow: '0 4px 10px rgba(217, 119, 6, 0.25)', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Flame size={16} /> Save Consumption Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: GRN INWARD ENTRY */}
      {showInwardModal && (
        <div className="modal-backdrop" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '720px', width: '92%', borderRadius: '18px', border: '1px solid #cbd5e1', boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)', padding: '0', overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', padding: '20px 24px', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ background: 'rgba(255, 255, 255, 0.2)', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Package size={22} />
                </span>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '900', margin: 0, color: '#ffffff' }}>
                    {editingInward ? 'Edit Pellet GRN Inward' : 'Inward Boiler Pellet Fuel Stock (GRN)'}
                  </h3>
                  <p style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '2px', margin: 0 }}>
                    Inward incoming boiler fuel shipment into store stock.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowInwardModal(false)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#ffffff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveInwardForm} style={{ padding: '24px 28px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    GRN Inward Ref No <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input 
                    type="text" 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    required
                    value={iGrnNo}
                    onChange={(e) => setIGrnNo(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Inward Date <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input 
                    type="date" 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    required
                    value={iDate}
                    onChange={(e) => setIDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                  Pellet Supplier / Vendor Name <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input 
                  type="text" 
                  className="input-field" 
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  placeholder="Supplier name..." 
                  required
                  value={iVendor}
                  onChange={(e) => setIVendor(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Invoice Number
                  </label>
                  <input 
                    type="text" 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    placeholder="e.g. INV-8821" 
                    value={iInvoiceNo}
                    onChange={(e) => setIInvoiceNo(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Delivery Chalan Number
                  </label>
                  <input 
                    type="text" 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    placeholder="e.g. DC-4410" 
                    value={iChalanNo}
                    onChange={(e) => setIChalanNo(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Inward Qty (Kgs) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input 
                    type="number" 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    placeholder="e.g. 5000" 
                    required
                    min="1"
                    step="1"
                    value={iQtyKg}
                    onChange={(e) => setIQtyKg(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Rate / Kg (₹) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input 
                    type="number" 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    placeholder="e.g. 18.50" 
                    required
                    min="0.1"
                    step="0.01"
                    value={iRatePerKg}
                    onChange={(e) => setIRatePerKg(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Total Value (₹)
                  </label>
                  <input 
                    type="text" 
                    className="input-field" 
                    readOnly
                    disabled
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', background: '#f8fafc', fontWeight: '800', color: '#0284c7' }}
                    value={iQtyKg && iRatePerKg ? `₹ ${(Number(iQtyKg) * Number(iRatePerKg)).toLocaleString()}` : '₹ 0'}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Storage Location / Silo <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input 
                    type="text" 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    placeholder="e.g. Boiler Fuel Bay" 
                    required
                    value={iLocation}
                    onChange={(e) => setILocation(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                    Received & Verified By <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input 
                    type="text" 
                    className="input-field" 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                    required
                    value={iReceivedBy}
                    onChange={(e) => setIReceivedBy(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                  Vehicle / Lot Number / Remarks
                </label>
                <textarea 
                  className="input-field" 
                  rows={2} 
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', resize: 'vertical' }}
                  placeholder="Truck No, Moisture Content %, Quality certification notes..."
                  value={iRemarks}
                  onChange={(e) => setIRemarks(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '18px' }}>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  style={{ padding: '10px 22px', borderRadius: '8px', fontWeight: '700', fontSize: '0.88rem' }}
                  onClick={() => setShowInwardModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ padding: '10px 24px', borderRadius: '8px', fontWeight: '800', fontSize: '0.88rem', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', borderColor: '#047857', boxShadow: '0 4px 10px rgba(5, 150, 105, 0.25)', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Package size={16} /> Inward Pellet Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
