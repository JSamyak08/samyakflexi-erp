import React, { useState, useMemo } from 'react';
import { 
  Flame, 
  Plus, 
  Download, 
  Search, 
  Calendar, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  Package, 
  Building2, 
  UserCheck, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Edit3, 
  ArrowDownToLine, 
  RotateCcw,
  SlidersHorizontal,
  Printer,
  DollarSign
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
  const [cMachine, setCMachine] = useState('Printing Press 1 (Boiler 1)');
  const [cQtyKg, setCQtyKg] = useState('');
  const [cHours, setCHours] = useState(12);
  const [cPrintedKg, setCPrintedKg] = useState('');
  const [cCostPerKgOverride, setCCostPerKgOverride] = useState('');
  const [cManager, setCManager] = useState(userName || 'Plant Manager');
  const [cRemarks, setCRemarks] = useState('');

  // Form State: Inward
  const [iGrnNo, setIGrnNo] = useState('');
  const [iDate, setIDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [iVendor, setIVendor] = useState('');
  const [iInvoiceNo, setIInvoiceNo] = useState('');
  const [iChalanNo, setIChalanNo] = useState('');
  const [iQtyKg, setIQtyKg] = useState('');
  const [iRatePerKg, setIRatePerKg] = useState('');
  const [iLocation, setILocation] = useState('Boiler Fuel Bay (Silo 1)');
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
    
    const weightedAvgCostPerKg = totalInwardKg > 0 ? (totalInwardAmount / totalInwardKg) : 18.5; // default benchmark if 0

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
    const daysInMonthElapsed = now.getDate() || 1;

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
    setCMachine(availableMachines[0] || 'Printing Press 1 (Boiler 1)');
    setCQtyKg('');
    setCHours(12);
    setCPrintedKg('');
    setCCostPerKgOverride(stockSummary.weightedAvgCostPerKg ? stockSummary.weightedAvgCostPerKg.toFixed(2) : '18.50');
    setCManager(userName || 'Plant Manager');
    setCRemarks('');
    setShowConsumptionModal(true);
  };

  // Open Edit Consumption Modal
  const handleEditConsumption = (item) => {
    setEditingConsumption(item);
    setCDate(item.consumptionDate || new Date().toISOString().split('T')[0]);
    setCShift(item.shift || 'Shift A: Day (08:00 - 20:00)');
    setCMachine(item.machineName || availableMachines[0] || 'Printing Press 1 (Boiler 1)');
    setCQtyKg(item.consumedQtyKg || '');
    setCHours(item.operatingHours || 12);
    setCPrintedKg(item.referencePrintingDoneKg || '');
    setCCostPerKgOverride(item.inwardCostPerKgUsed || stockSummary.weightedAvgCostPerKg || 18.50);
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

    const costPerKg = Number(cCostPerKgOverride) || stockSummary.weightedAvgCostPerKg || 18.50;
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
    setIRatePerKg('18.50');
    setILocation('Boiler Fuel Bay (Silo 1)');
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
    setIRatePerKg(item.unitCostPerKg || '18.50');
    setILocation(item.storageLocation || 'Boiler Fuel Bay (Silo 1)');
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
    <div className="tab-container" style={{ padding: '20px 24px' }}>
      
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#b45309', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Flame size={28} style={{ color: '#d97706' }} /> Boiler Pellet Fuel Stock & Consumption Engine
          </h2>
          <p style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '4px' }}>
            Day-wise boiler pellet fuel consumption logging, GRN inwarding, cost per operating hour & cost per kg of printing produced.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            type="button" 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}
            onClick={activeSubTab === 'consumption' ? handleExportConsumptionsCSV : handleExportInwardsCSV}
          >
            <Download size={16} /> Download CSV Report
          </button>
          <button 
            type="button" 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}
            onClick={handleOpenNewInward}
          >
            <Package size={16} /> + GRN Inward Pellet Stock
          </button>
          <button 
            type="button" 
            className="btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', background: '#d97706', borderColor: '#d97706' }}
            onClick={handleOpenNewConsumption}
          >
            <Flame size={16} /> + Record Daily Consumption
          </button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        
        {/* Current Stock */}
        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)', border: '1px solid #fde68a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Current Pellet Stock
            </span>
            <Flame size={20} style={{ color: '#d97706' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#78350f', marginTop: '6px' }}>
            {stockSummary.currentStockKg.toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: '700' }}>Kg</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#b45309', marginTop: '4px', fontWeight: '600' }}>
            Avg Inward Rate: <strong>₹ {stockSummary.weightedAvgCostPerKg.toFixed(2)} / kg</strong>
          </div>
        </div>

        {/* MTD Consumption */}
        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Month-to-Date Consumed
            </span>
            <TrendingUp size={20} style={{ color: '#0284c7' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#0f172a', marginTop: '6px' }}>
            {stockSummary.mtdConsumedKg.toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: '700' }}>Kg</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px' }}>
            MTD Expense: <strong style={{ color: '#0284c7' }}>₹ {Math.round(stockSummary.mtdExpenditure).toLocaleString()}</strong>
          </div>
        </div>

        {/* Avg Daily Consumption */}
        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Avg. Daily Consumption
            </span>
            <Calendar size={20} style={{ color: '#059669' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#059669', marginTop: '6px' }}>
            {Math.round(stockSummary.avgDailyConsumptionKg).toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: '700' }}>Kg/day</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px' }}>
            Across {stockSummary.activeLoggingDaysCount} active logged shift days
          </div>
        </div>

        {/* Cost / Operating Hour */}
        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pellet Cost / Boiler Hour
            </span>
            <Clock size={20} style={{ color: '#7c3aed' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#7c3aed', marginTop: '6px' }}>
            ₹ {stockSummary.avgCostPerHour.toFixed(2)} <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>/hr</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px' }}>
            (Utilised stock × Cost/kg) / Operating hrs
          </div>
        </div>

        {/* Cost / Kg Printing Done */}
        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pellet Cost / Kg Printed
            </span>
            <Printer size={20} style={{ color: '#dc2626' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#dc2626', marginTop: '6px' }}>
            ₹ {stockSummary.avgCostPerKgPrinted.toFixed(2)} <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>/kg</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px' }}>
            Reference printed output in shift
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '18px' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('consumption')}
          style={{
            padding: '10px 18px',
            fontSize: '0.9rem',
            fontWeight: '800',
            color: activeSubTab === 'consumption' ? '#d97706' : '#64748b',
            borderBottom: activeSubTab === 'consumption' ? '3px solid #d97706' : '3px solid transparent',
            background: 'none',
            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <Flame size={18} /> Daily Boiler Consumption Log ({filteredConsumptions.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('inward')}
          style={{
            padding: '10px 18px',
            fontSize: '0.9rem',
            fontWeight: '800',
            color: activeSubTab === 'inward' ? '#d97706' : '#64748b',
            borderBottom: activeSubTab === 'inward' ? '3px solid #d97706' : '3px solid transparent',
            background: 'none',
            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <Package size={18} /> GRN Inward & Pellet Stock Register ({filteredInwards.length})
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px', borderRadius: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
              From Date
            </label>
            <input 
              type="date" 
              className="input-field" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
              To Date
            </label>
            <input 
              type="date" 
              className="input-field" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
            />
          </div>

          {activeSubTab === 'consumption' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                  Machine / Boiler Unit
                </label>
                <select 
                  className="input-field" 
                  value={machineFilter} 
                  onChange={(e) => setMachineFilter(e.target.value)}
                >
                  <option value="ALL">All Machines</option>
                  {availableMachines.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                  Shift Filter
                </label>
                <select 
                  className="input-field" 
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
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
              Search Records
            </label>
            <input 
              type="text" 
              className="input-field" 
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
                style={{ width: '100%', fontSize: '0.78rem', padding: '8px' }}
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
        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
          <table className="data-table" style={{ width: '100%', margin: 0 }}>
            <thead>
              <tr>
                <th>Date & Shift</th>
                <th>Boiler / Machine</th>
                <th>Pellet Consumed (Kg)</th>
                <th>Operating Time (Hrs)</th>
                <th>Ref Printing Output (Kg)</th>
                <th>Cost / Boiler Hour (₹/hr)</th>
                <th>Cost / Kg Printed (₹/kg)</th>
                <th>Plant Manager</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredConsumptions.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    No boiler pellet consumption records found matching the active filters.
                  </td>
                </tr>
              ) : (
                filteredConsumptions.map(item => {
                  const costPerKg = Number(item.inwardCostPerKgUsed) || stockSummary.weightedAvgCostPerKg || 18.50;
                  const consumed = Number(item.consumedQtyKg) || 0;
                  const hours = Number(item.operatingHours) || 12;
                  const printed = Number(item.referencePrintingDoneKg) || 0;

                  const costHr = item.costPerHour || (hours > 0 ? (consumed * costPerKg) / hours : 0);
                  const costKgPrinted = item.costPerKgPrinted || (printed > 0 ? (consumed * costPerKg) / printed : 0);

                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>{item.consumptionDate}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{item.shift}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '700', color: '#1e293b' }}>{item.machineName}</div>
                        {item.remarks && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Note: {item.remarks}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: '900', color: '#b45309', fontSize: '0.95rem' }}>
                          {consumed.toLocaleString()} <span style={{ fontSize: '0.75rem' }}>Kg</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>@ ₹{costPerKg.toFixed(2)}/kg</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>{hours} hrs</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '800', color: '#0284c7' }}>
                          {printed.toLocaleString()} <span style={{ fontSize: '0.75rem' }}>Kg</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '900', color: '#7c3aed', fontSize: '0.92rem' }}>
                          ₹ {costHr.toFixed(2)}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>per operating hr</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '900', color: '#dc2626', fontSize: '0.92rem' }}>
                          ₹ {costKgPrinted.toFixed(2)}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>per kg printed</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '700', color: '#334155' }}>{item.plantManagerName || 'Plant Manager'}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button 
                            type="button" 
                            className="btn-secondary" 
                            style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                            onClick={() => handleEditConsumption(item)}
                            title="Edit Consumption Record"
                          >
                            <Edit3 size={13} /> Edit
                          </button>
                          {onDeletePelletConsumption && (
                            <button 
                              type="button" 
                              className="btn-secondary" 
                              style={{ padding: '3px 6px', fontSize: '0.75rem', color: '#dc2626' }}
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
        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
          <table className="data-table" style={{ width: '100%', margin: 0 }}>
            <thead>
              <tr>
                <th>GRN No & Date</th>
                <th>Supplier / Vendor</th>
                <th>Invoice / Chalan</th>
                <th>Inward Qty (Kg)</th>
                <th>Unit Price (₹/kg)</th>
                <th>Total Inward Value (₹)</th>
                <th>Storage Bay / Silo</th>
                <th>Received By</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredInwards.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    No pellet GRN inward records found. Click "+ GRN Inward Pellet Stock" to add inventory.
                  </td>
                </tr>
              ) : (
                filteredInwards.map(item => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: '800', color: '#0f172a' }}>{item.grnNo}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Date: {item.inwardDate}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '800', color: '#1e293b' }}>{item.vendorName || 'Direct Factory Purchase'}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569' }}>
                        Inv: {item.invoiceNo || 'N/A'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Ch: {item.chalanNo || 'N/A'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '900', color: '#059669', fontSize: '0.95rem' }}>
                        + {(Number(item.inwardQtyKg) || 0).toLocaleString()} <span style={{ fontSize: '0.75rem' }}>Kg</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '800', color: '#0f172a' }}>
                        ₹ {(Number(item.unitCostPerKg) || 0).toFixed(2)} / kg
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '900', color: '#0284c7', fontSize: '0.92rem' }}>
                        ₹ {(Number(item.totalAmount) || (Number(item.inwardQtyKg) * Number(item.unitCostPerKg))).toLocaleString()}
                      </div>
                    </td>
                    <td>
                      <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px', fontSize: '0.74rem', fontWeight: '800' }}>
                        {item.storageLocation || 'Silo 1'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: '700', color: '#334155' }}>{item.receivedBy || 'Plant Manager'}</div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                          onClick={() => handleEditInward(item)}
                          title="Edit GRN Inward"
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        {onDeletePelletInward && (
                          <button 
                            type="button" 
                            className="btn-secondary" 
                            style={{ padding: '3px 6px', fontSize: '0.75rem', color: '#dc2626' }}
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

      {/* MODAL: DAILY CONSUMPTION ENTRY */}
      {showConsumptionModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '600px', borderRadius: '16px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#b45309', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flame size={22} /> {editingConsumption ? 'Edit Daily Boiler Consumption' : 'Record Daily Boiler Pellet Consumption'}
              </h3>
              <button className="modal-close-btn" onClick={() => setShowConsumptionModal(false)}>×</button>
            </div>

            <form onSubmit={handleSaveConsumptionForm} style={{ padding: '16px 0 0 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Consumption Date *</label>
                  <input 
                    type="date" 
                    className="input-field" 
                    required
                    value={cDate}
                    onChange={(e) => setCDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Operating Shift *</label>
                  <select 
                    className="input-field" 
                    value={cShift}
                    onChange={(e) => setCShift(e.target.value)}
                  >
                    <option value="Shift A: Day (08:00 - 20:00)">Shift A: Day (08:00 - 20:00)</option>
                    <option value="Shift B: Night (20:00 - 08:00)">Shift B: Night (20:00 - 08:00)</option>
                    <option value="Full Day 24h">Full Day 24h</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontWeight: '700' }}>Boiler / Machine Unit *</label>
                <select 
                  className="input-field"
                  value={cMachine}
                  onChange={(e) => setCMachine(e.target.value)}
                >
                  {availableMachines.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Pellet Consumed (Kg) *</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    placeholder="e.g. 450" 
                    required
                    min="1"
                    step="0.1"
                    value={cQtyKg}
                    onChange={(e) => setCQtyKg(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Operating Time (Hrs) *</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    placeholder="e.g. 12" 
                    required
                    min="0.5"
                    step="0.5"
                    value={cHours}
                    onChange={(e) => setCHours(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Printed Output (Kg) *</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    placeholder="e.g. 1200" 
                    required
                    min="1"
                    step="1"
                    value={cPrintedKg}
                    onChange={(e) => setCPrintedKg(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Inward Cost Rate per Kg (₹) *</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    placeholder="18.50" 
                    required
                    step="0.01"
                    value={cCostPerKgOverride}
                    onChange={(e) => setCCostPerKgOverride(e.target.value)}
                  />
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                    Auto-weighted inward cost: ₹{stockSummary.weightedAvgCostPerKg.toFixed(2)}/kg
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Recorded By (Plant Manager) *</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    required
                    value={cManager}
                    onChange={(e) => setCManager(e.target.value)}
                  />
                </div>
              </div>

              {/* Dynamic Live Cost Calculations Preview */}
              {cQtyKg && cHours && cPrintedKg && (
                <div style={{ background: '#fef3c7', padding: '12px 16px', borderRadius: '10px', border: '1px solid #fde68a', marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#92400e', marginBottom: '6px' }}>
                    📊 Real-Time Consumption Cost Analysis Preview:
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
                    <span>Cost of Pellet / Operating Hour:</span>
                    <strong style={{ color: '#7c3aed' }}>
                      ₹ {((Number(cQtyKg) * Number(cCostPerKgOverride || stockSummary.weightedAvgCostPerKg)) / Number(cHours)).toFixed(2)} / hr
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginTop: '4px' }}>
                    <span>Pellet Cost / Kg Printing Done:</span>
                    <strong style={{ color: '#dc2626' }}>
                      ₹ {((Number(cQtyKg) * Number(cCostPerKgOverride || stockSummary.weightedAvgCostPerKg)) / Number(cPrintedKg)).toFixed(2)} / kg
                    </strong>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: '700' }}>Remarks / Shift Notes</label>
                <textarea 
                  className="input-field" 
                  rows={2} 
                  placeholder="Boiler pressure, temperature, pellet moisture, or shift notes..."
                  value={cRemarks}
                  onChange={(e) => setCRemarks(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowConsumptionModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ background: '#d97706', borderColor: '#d97706' }}>
                  Save Consumption Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GRN INWARD ENTRY */}
      {showInwardModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '640px', borderRadius: '16px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#059669', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={22} /> {editingInward ? 'Edit Pellet GRN Inward' : 'Inward Boiler Pellet Fuel Stock (GRN)'}
              </h3>
              <button className="modal-close-btn" onClick={() => setShowInwardModal(false)}>×</button>
            </div>

            <form onSubmit={handleSaveInwardForm} style={{ padding: '16px 0 0 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>GRN Inward Ref No *</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    required
                    value={iGrnNo}
                    onChange={(e) => setIGrnNo(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Inward Date *</label>
                  <input 
                    type="date" 
                    className="input-field" 
                    required
                    value={iDate}
                    onChange={(e) => setIDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontWeight: '700' }}>Pellet Supplier / Vendor Name *</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Supplier name..." 
                  required
                  value={iVendor}
                  onChange={(e) => setIVendor(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Invoice Number</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="e.g. INV-8821" 
                    value={iInvoiceNo}
                    onChange={(e) => setIInvoiceNo(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Delivery Chalan Number</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="e.g. DC-4410" 
                    value={iChalanNo}
                    onChange={(e) => setIChalanNo(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Inward Qty (Kgs) *</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    placeholder="e.g. 5000" 
                    required
                    min="1"
                    step="1"
                    value={iQtyKg}
                    onChange={(e) => setIQtyKg(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Rate / Kg (₹) *</label>
                  <input 
                    type="number" 
                    className="input-field" 
                    placeholder="18.50" 
                    required
                    min="0.1"
                    step="0.01"
                    value={iRatePerKg}
                    onChange={(e) => setIRatePerKg(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Total Purchase Value (₹)</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    readOnly
                    disabled
                    style={{ background: '#f1f5f9', fontWeight: '800', color: '#0284c7' }}
                    value={iQtyKg && iRatePerKg ? `₹ ${(Number(iQtyKg) * Number(iRatePerKg)).toLocaleString()}` : '₹ 0'}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Storage Location / Silo *</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="e.g. Boiler Fuel Bay (Silo 1)" 
                    required
                    value={iLocation}
                    onChange={(e) => setILocation(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: '700' }}>Received & Verified By *</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    required
                    value={iReceivedBy}
                    onChange={(e) => setIReceivedBy(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: '700' }}>Vehicle / Lot Number / Remarks</label>
                <textarea 
                  className="input-field" 
                  rows={2} 
                  placeholder="Truck No, Moisture Content %, Quality certification notes..."
                  value={iRemarks}
                  onChange={(e) => setIRemarks(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowInwardModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ background: '#059669', borderColor: '#059669' }}>
                  Inward Pellet Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
