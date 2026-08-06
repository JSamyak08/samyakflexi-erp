import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  UserCheck, 
  Calculator, 
  Package, 
  ArrowUpRight, 
  ArrowDownLeft,
  FileCheck,
  Search,
  Filter,
  DollarSign,
  Tag,
  Scale,
  Barcode,
  Printer,
  Play,
  Scan,
  Lock,
  X
} from 'lucide-react';
import WeighingScaleInput from './WeighingScaleInput';
import BarcodePrinterModal from './BarcodePrinterModal';
import CylinderJobCardForm from '../CylinderJobCardForm';
import { DEFAULT_DAILY_RATES, generateBarcodeId } from '../factoryStore';

export default function ProductionRecordManagement({
  productionRecords = [],
  orders = [],
  inventory = [],
  jobMasters = [],
  currentUser,
  onSaveProductionRecord,
  onApproveProductionRecord,
  onAddRoll
}) {
  // Helper: derive substrate structure from Job Master layers (authoritative source)
  const getSubstrateStructure = (order) => {
    if (!order) return '—';
    const jm = jobMasters.find(j =>
      (j.jobName || '').toLowerCase().trim() === (order.jobName || '').toLowerCase().trim()
    );
    if (jm && jm.layers && jm.layers.length > 0) {
      return jm.layers.map(l => `${l.filmType} ${l.micron}µ`).join(' / ');
    }
    if (jm && jm.structure && jm.structure !== 'PET / PE' && jm.structure !== '—') {
      return jm.structure;
    }
    if (order.structure && order.structure !== 'PET / PE' && order.structure !== '—') {
      return order.structure;
    }
    return jm?.structure || order.structure || '—';
  };
  const isPlantManager = currentUser?.role === 'Plant Manager' || currentUser?.role === 'Admin' || currentUser?.role === 'Production Manager';
  const isAdmin = currentUser?.role === 'Admin';

  const [activeTab, setActiveTab] = useState('punched_jobs'); // 'punched_jobs', 'list', 'new_record', 'job_cards'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [activeJobCardData, setActiveJobCardData] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Form State for creating/editing a Production Record
  const [selectedOrder, setSelectedOrder] = useState(orders[0] || null);
  
  const DEFAULT_6_INGREDIENTS = [
    { id: '1', filmType: 'PET Film', micron: '12', widthMm: '1000', barcode: '', issueQtyKg: 400, returnQtyKg: 0, unitPricePerKg: 125 },
    { id: '2', filmType: 'METPET Film', micron: '12', widthMm: '1000', barcode: '', issueQtyKg: 400, returnQtyKg: 0, unitPricePerKg: 140 },
    { id: '3', filmType: 'Natural LD Film', micron: '35', widthMm: '1005', barcode: '', issueQtyKg: 850, returnQtyKg: 0, unitPricePerKg: 115 },
    { id: '4', filmType: 'Ethyl Acetate (Solvent)', micron: '-', widthMm: '-', barcode: '', issueQtyKg: 55, returnQtyKg: 0, unitPricePerKg: 210 },
    { id: '5', filmType: 'Toluene (Solvent)', micron: '-', widthMm: '-', barcode: '', issueQtyKg: 40, returnQtyKg: 0, unitPricePerKg: 185 },
    { id: '6', filmType: 'MIBK (Solvent)', micron: '-', widthMm: '-', barcode: '', issueQtyKg: 25, returnQtyKg: 0, unitPricePerKg: 260 }
  ];

  const [materialsList, setMaterialsList] = useState([]);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Processing Cost Per Kg (Default from Settings: ₹ 25/kg)
  const [processingCostPerKg, setProcessingCostPerKg] = useState(25);

  // Stage-wise Production Quantities (in kg)
  const [qtyFirstPassL1, setQtyFirstPassL1] = useState(1040);
  const [qtySecondPassL2, setQtySecondPassL2] = useState(0);
  const [qtyInspection, setQtyInspection] = useState(1010);
  const [qtySlitting, setQtySlitting] = useState(1005);
  const [qtyDispatch, setQtyDispatch] = useState(1000);

  // Stage-wise Scrap & Wastage Breakdown fields (in kg)
  const [printingPlainSettingWastageKg, setPrintingPlainSettingWastageKg] = useState(15.0);
  const [printingWastageKg, setPrintingWastageKg] = useState(12.5);
  const [laminationPlainSubstrateWastageKg, setLaminationPlainSubstrateWastageKg] = useState(10.0);
  const [printedWastageKg, setPrintedWastageKg] = useState(8.0);
  const [laminateWastageKg, setLaminateWastageKg] = useState(7.0);
  const [trimWastageKg, setTrimWastageKg] = useState(14.0);

  // Scrap Disposal Transactions State
  const [scrapDisposals, setScrapDisposals] = useState(() => {
    try {
      const saved = localStorage.getItem('samyak_erp_scrap_disposals');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [isDisposeModalOpen, setIsDisposeModalOpen] = useState(false);
  const [disposeCategory, setDisposeCategory] = useState('Printing Plain Setting (kg)');
  const [disposeQtyKg, setDisposeQtyKg] = useState('');
  const [disposeVendor, setDisposeVendor] = useState('');
  const [disposeRefNo, setDisposeRefNo] = useState('');
  const [disposeNotes, setDisposeNotes] = useState('');

  const [recordNotes, setRecordNotes] = useState('');

  // Helper to open 'Start Production' for a specific punched job/order — pulls strictly from Job Master
  const handleStartProductionForOrder = (ord) => {
    setSelectedOrder(ord);
    setSelectedRecord(null);

    // Match Job Master (authoritative specification benchmark)
    const matchedJM = jobMasters.find(j => 
      (j.jobName || '').toLowerCase().trim() === (ord.jobName || '').toLowerCase().trim() ||
      (j.skuCode || '').toLowerCase().trim() === (ord.id || '').toLowerCase().trim()
    );

    let initialMaterials = [];

    // Pre-populate raw materials directly from Job Master layers
    if (matchedJM && matchedJM.layers && matchedJM.layers.length > 0) {
      const targetWidth = matchedJM.printWidthMm ? String(matchedJM.printWidthMm) : (ord.printWidthMm ? String(ord.printWidthMm) : '1000');
      initialMaterials = matchedJM.layers.map((l, idx) => ({
        id: String(idx + 1),
        filmType: l.filmType || 'PET Film',
        micron: l.micron ? String(l.micron) : '12',
        widthMm: targetWidth,
        barcode: '',
        issueQtyKg: Math.round(((ord.orderQtyKg || 1000) * 0.45) * 1.05),
        returnQtyKg: 0,
        unitPricePerKg: DEFAULT_DAILY_RATES[l.filmType] || 125,
        // Benchmark Job Master Specs for Spec Variation Calculation
        jobMasterFilmType: l.filmType || 'PET Film',
        jobMasterMicron: l.micron ? Number(l.micron) : 12,
        jobMasterWidthMm: Number(targetWidth) || 1000
      }));
    } else if (ord.materialRequirements && ord.materialRequirements.length > 0) {
      initialMaterials = ord.materialRequirements.map((req, idx) => ({
        id: String(idx + 1),
        filmType: req.filmType,
        micron: req.micron ? String(req.micron) : '12',
        widthMm: req.widthMm ? String(req.widthMm) : '1000',
        barcode: '',
        issueQtyKg: Math.round((req.qtyKg || 500) * 1.05),
        returnQtyKg: 0,
        unitPricePerKg: DEFAULT_DAILY_RATES[req.filmType] || 120,
        jobMasterFilmType: req.filmType,
        jobMasterMicron: req.micron ? Number(req.micron) : 12,
        jobMasterWidthMm: req.widthMm ? Number(req.widthMm) : 1000
      }));
    } else {
      // Benchmark Fallback: 2 Substrate Layers
      initialMaterials = [
        { id: '1', filmType: 'PET Film', micron: '12', widthMm: '1000', barcode: '', issueQtyKg: 400, returnQtyKg: 0, unitPricePerKg: 125, jobMasterFilmType: 'PET Film', jobMasterMicron: 12, jobMasterWidthMm: 1000 },
        { id: '2', filmType: 'METPET Film', micron: '12', widthMm: '1000', barcode: '', issueQtyKg: 400, returnQtyKg: 0, unitPricePerKg: 140, jobMasterFilmType: 'METPET Film', jobMasterMicron: 12, jobMasterWidthMm: 1000 }
      ];
    }

    // Always include standard process solvents/adhesives relevant for lamination & printing
    const processIngredients = [
      { id: `proc-1`, filmType: 'Ethyl Acetate (Solvent)', micron: '-', widthMm: '-', barcode: '', issueQtyKg: 45, returnQtyKg: 0, unitPricePerKg: 210, jobMasterFilmType: 'Ethyl Acetate (Solvent)', jobMasterMicron: 0, jobMasterWidthMm: 0 },
      { id: `proc-2`, filmType: 'Liquid Inks & Solvents', micron: '-', widthMm: '-', barcode: '', issueQtyKg: 35, returnQtyKg: 0, unitPricePerKg: 185, jobMasterFilmType: 'Liquid Inks & Solvents', jobMasterMicron: 0, jobMasterWidthMm: 0 }
    ];

    setMaterialsList([...initialMaterials, ...processIngredients]);

    // Stage Production Qty Pre-fills
    const ordQty = Number(ord.orderQtyKg) || 1000;
    setQtyFirstPassL1(Math.round(ordQty * 1.04));
    setQtySecondPassL2(matchedJM?.layers?.length >= 3 ? Math.round(ordQty * 1.02) : 0);
    setQtyInspection(Math.round(ordQty * 1.01));
    setQtySlitting(Math.round(ordQty * 1.005));
    setQtyDispatch(ordQty);

    setActiveTab('new_record');
  };

  // Helper to open order details for dropdown selection
  const handleSelectOrderForRecord = (orderId) => {
    const ord = orders.find(o => o.id === orderId);
    if (ord) {
      handleStartProductionForOrder(ord);
    }
  };

  const addMaterialRow = () => {
    setMaterialsList(prev => [
      ...prev,
      {
        id: String(Date.now()),
        filmType: 'PET Film',
        micron: '12',
        widthMm: '1000',
        barcode: '',
        issueQtyKg: 100,
        returnQtyKg: 0,
        unitPricePerKg: 125,
        jobMasterFilmType: 'PET Film',
        jobMasterMicron: 12,
        jobMasterWidthMm: 1000
      }
    ]);
  };

  const removeMaterialRow = (id) => {
    setMaterialsList(prev => prev.filter(m => m.id !== id));
  };

  const updateMaterialRow = (id, field, value) => {
    setMaterialsList(prev => prev.map(m => {
      if (m.id === id) {
        return { ...m, [field]: value };
      }
      return m;
    }));
  };

  // Calculations with Spec Variation detection against Job Master
  const calculatedMaterials = materialsList.map(m => {
    const issued = parseFloat(m.issueQtyKg) || 0;
    const returned = parseFloat(m.returnQtyKg) || 0;
    const netConsumed = Math.max(0, issued - returned);
    const rate = parseFloat(m.unitPricePerKg) || 0;
    const cost = netConsumed * rate;

    // Spec Variation Calculations
    const actualMicron = parseFloat(m.micron) || 0;
    const jmMicron = parseFloat(m.jobMasterMicron) || 0;
    const micronVarPct = (jmMicron > 0 && actualMicron > 0 && Math.abs(actualMicron - jmMicron) > 0.01)
      ? Number((((actualMicron - jmMicron) / jmMicron) * 100).toFixed(1))
      : null;

    const actualWidth = parseFloat(m.widthMm) || 0;
    const jmWidth = parseFloat(m.jobMasterWidthMm) || 0;
    const widthVarPct = (jmWidth > 0 && actualWidth > 0 && Math.abs(actualWidth - jmWidth) > 0.5)
      ? Number((((actualWidth - jmWidth) / jmWidth) * 100).toFixed(1))
      : null;

    const hasFilmTypeVar = Boolean(m.jobMasterFilmType && m.filmType && m.jobMasterFilmType !== m.filmType);

    return {
      ...m,
      netConsumedQtyKg: netConsumed,
      totalMaterialCost: cost,
      micronVarPct,
      widthVarPct,
      hasFilmTypeVar,
      hasVariation: !!(micronVarPct !== null || widthVarPct !== null || hasFilmTypeVar)
    };
  });

  // Net Produced Quantity = Dispatch Ready Quantity (or Slitting / First Pass if dispatch unpopulated)
  const totalNetQtyKg = parseFloat(qtyDispatch) || parseFloat(qtySlitting) || parseFloat(qtyFirstPassL1) || 0;
  const totalMaterialCostRs = calculatedMaterials.reduce((sum, m) => sum + m.totalMaterialCost, 0);
  
  // Total Processing Cost = Total Qty Produced x Processing Cost Per Kg
  const totalProcessingCostRs = totalNetQtyKg * (parseFloat(processingCostPerKg) || 0);

  // Total Scrap Weight across 6 process wastage categories
  const totalScrapQtyKg = (parseFloat(printingPlainSettingWastageKg) || 0) +
                         (parseFloat(printingWastageKg) || 0) +
                         (parseFloat(laminationPlainSubstrateWastageKg) || 0) +
                         (parseFloat(printedWastageKg) || 0) +
                         (parseFloat(laminateWastageKg) || 0) +
                         (parseFloat(trimWastageKg) || 0);

  // Cost Formula: (Total Qty Produced x Processing Cost Rate) + (Ingredients Cost)
  // Scrap Rate removed as per directive
  const finalProductionCostRs = totalProcessingCostRs + totalMaterialCostRs;

  // Scrap Metrics & Percentages
  const totalJobMaterialOutputKg = totalNetQtyKg + totalScrapQtyKg;
  const overallScrapPctOfOutput = totalJobMaterialOutputKg > 0 ? Number(((totalScrapQtyKg / totalJobMaterialOutputKg) * 100).toFixed(1)) : 0;
  const overallScrapPctOfDispatch = totalNetQtyKg > 0 ? Number(((totalScrapQtyKg / totalNetQtyKg) * 100).toFixed(1)) : 0;

  // Handle Scrap Disposal Submission
  const handleAddScrapDisposal = (e) => {
    e.preventDefault();
    if (!disposeQtyKg || parseFloat(disposeQtyKg) <= 0) {
      alert("Please enter a valid disposal quantity in kg.");
      return;
    }
    const newDisposal = {
      id: `DISP-${Date.now()}`,
      category: disposeCategory,
      qtyKg: parseFloat(disposeQtyKg),
      vendor: disposeVendor.trim() || 'Scrap Buyer / Recycler',
      refNo: disposeRefNo.trim() || `GP-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString().split('T')[0],
      disposedBy: `${currentUser.name} (${currentUser.role})`,
      notes: disposeNotes
    };

    const updated = [newDisposal, ...scrapDisposals];
    setScrapDisposals(updated);
    try {
      localStorage.setItem('samyak_erp_scrap_disposals', JSON.stringify(updated));
    } catch (err) {
      console.warn("Disposal storage warning:", err);
    }

    setDisposeQtyKg('');
    setDisposeVendor('');
    setDisposeRefNo('');
    setDisposeNotes('');
    setIsDisposeModalOpen(false);
    alert(`✅ Scrap disposal of ${newDisposal.qtyKg} kg recorded! Stock deducted successfully.`);
  };

  // Calculate Cumulative Scrap Stock across all submitted records minus disposals
  const calculateScrapStock = () => {
    const rawCategories = {
      'Printing Plain Setting (kg)': 0,
      'Printing Wastage (kg)': 0,
      'Lamination Plain Substrate (kg)': 0,
      'Printed Wastage (kg)': 0,
      'Laminate Wastage (kg)': 0,
      'Trim Wastage (kg)': 0
    };

    // Accumulate from all submitted records
    productionRecords.forEach(r => {
      rawCategories['Printing Plain Setting (kg)'] += Number(r.printingPlainSettingWastageKg || 0);
      rawCategories['Printing Wastage (kg)'] += Number(r.printingWastageKg || 0);
      rawCategories['Lamination Plain Substrate (kg)'] += Number(r.laminationPlainSubstrateWastageKg || 0);
      rawCategories['Printed Wastage (kg)'] += Number(r.printedWastageKg || 0);
      rawCategories['Laminate Wastage (kg)'] += Number(r.laminateWastageKg || 0);
      rawCategories['Trim Wastage (kg)'] += Number(r.trimWastageKg || 0);
    });

    // Deduct disposals
    scrapDisposals.forEach(d => {
      if (rawCategories[d.category] !== undefined) {
        rawCategories[d.category] = Math.max(0, rawCategories[d.category] - (Number(d.qtyKg) || 0));
      }
    });

    return rawCategories;
  };

  const scrapStockData = calculateScrapStock();
  const totalScrapStockInPlantKg = Object.values(scrapStockData).reduce((sum, v) => sum + v, 0);

  // Step 1: Open Detailed Confirmation Popup
  const handleOpenConfirmModal = (e) => {
    if (e) e.preventDefault();

    if (!selectedOrder) {
      alert('Please select an order for this Production Record.');
      return;
    }

    if (calculatedMaterials.length === 0) {
      alert('Please add at least one ingredient material line.');
      return;
    }

    setIsConfirmModalOpen(true);
  };

  // Step 2: Final Submit upon confirmation
  const handleFinalSubmitRecord = () => {
    const newRecord = {
      id: `REC-${Date.now()}`,
      orderId: selectedOrder.id,
      jobName: selectedOrder.jobName,
      clientName: selectedOrder.clientName,
      dateFilled: new Date().toISOString().split('T')[0],
      materialsList: calculatedMaterials,
      
      // Stage-wise Quantities
      qtyFirstPassL1: parseFloat(qtyFirstPassL1) || 0,
      qtySecondPassL2: parseFloat(qtySecondPassL2) || 0,
      qtyInspection: parseFloat(qtyInspection) || 0,
      qtySlitting: parseFloat(qtySlitting) || 0,
      qtyDispatch: parseFloat(qtyDispatch) || 0,
      totalProductionQtyKg: totalNetQtyKg,

      totalMaterialCostRs: totalMaterialCostRs,
      processingCostPerKg: parseFloat(processingCostPerKg) || 25,
      totalProcessingCostRs: totalProcessingCostRs,

      // Stage-wise Scrap Breakdown (in kg)
      printingPlainSettingWastageKg: parseFloat(printingPlainSettingWastageKg) || 0,
      printingWastageKg: parseFloat(printingWastageKg) || 0,
      laminationPlainSubstrateWastageKg: parseFloat(laminationPlainSubstrateWastageKg) || 0,
      printedWastageKg: parseFloat(printedWastageKg) || 0,
      laminateWastageKg: parseFloat(laminateWastageKg) || 0,
      trimWastageKg: parseFloat(trimWastageKg) || 0,
      
      totalScrapQtyKg: totalScrapQtyKg,
      overallScrapPctOfOutput: overallScrapPctOfOutput,
      overallScrapPctOfDispatch: overallScrapPctOfDispatch,
      finalProductionCostRs: finalProductionCostRs,

      status: "Filled by Plant Manager",
      filledBy: `${currentUser.name} (${currentUser.role})`,
      approvedBy: "",
      approvalDate: "",
      notes: recordNotes
    };

    if (onSaveProductionRecord) onSaveProductionRecord(newRecord);
    setIsConfirmModalOpen(false);
    alert(`🎉 Production Record for "${selectedOrder.jobName}" saved & submitted for Admin Approval!\n\nStage production, scrap generated (${totalScrapQtyKg} kg), and inventory roll returns updated successfully.`);
    setActiveTab('list');
  };
  const filteredRecords = productionRecords.filter(r => {
    const matchesSearch = r.jobName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          r.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || r.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const filteredPunchedOrders = orders.filter(o => {
    return o.jobName.toLowerCase().includes(searchTerm.toLowerCase()) || 
           o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
           o.clientName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner & Approval Flow Notice */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileSpreadsheet style={{ color: 'var(--primary-brand)' }} /> Job Production Records & Material Costing
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            All punched jobs appear here. Click <strong>"Start Production" 🚀</strong> to fill material usage & barcode consumption.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className={`tab-pill ${activeTab === 'punched_jobs' ? 'active' : ''}`}
            onClick={() => { setActiveTab('punched_jobs'); setSelectedRecord(null); }}
          >
            📦 Punched Jobs ({orders.length})
          </button>

          <button 
            className={`tab-pill ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => { setActiveTab('list'); setSelectedRecord(null); }}
          >
            📑 Submitted Records ({productionRecords.length})
          </button>

          <button 
            className={`tab-pill ${activeTab === 'job_cards' ? 'active' : ''}`}
            onClick={() => { setActiveTab('job_cards'); setSelectedRecord(null); }}
          >
            📋 Job Cards Sign-Off ({jobMasters.length})
          </button>

          <button 
            className={`tab-pill ${activeTab === 'scrap_inventory' ? 'active' : ''}`}
            onClick={() => { setActiveTab('scrap_inventory'); setSelectedRecord(null); }}
          >
            ♻️ Scrap Inventory ({totalScrapStockInPlantKg.toFixed(0)} kg)
          </button>

          {isPlantManager && (
            <button 
              className="btn-primary"
              onClick={() => { 
                if (orders.length > 0) handleStartProductionForOrder(orders[0]);
                else setActiveTab('new_record');
                setSelectedRecord(null); 
              }}
            >
              <Plus size={16} /> Fill New Production Record
            </button>
          )}
        </div>
      </div>

      {/* Modal View for CylinderJobCardForm when reviewing a Job Card */}
      {activeJobCardData && (
        <div className="pdf-modal-overlay">
          <div className="pdf-modal-toolbar no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#0f172a' }}>
            <button className="btn-secondary" style={{ background: '#ffffff', color: '#0f172a' }} onClick={() => setActiveJobCardData(null)}>
              <X size={16} /> Close Job Card View
            </button>
            <div style={{ color: '#ffffff', fontWeight: '700', fontSize: '1rem' }}>
              Production Head Review: Rotogravure Cylinder Job Card — {activeJobCardData.jobName} ({activeJobCardData.skuCode})
            </div>
          </div>
          <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', background: '#334155', minHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>
            <div style={{ background: '#ffffff', width: '1000px', maxWidth: '98vw', borderRadius: '8px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', padding: '24px' }}>
              <CylinderJobCardForm 
                initialData={activeJobCardData} 
                currentUser={currentUser}
                onSave={(updatedData) => {
                  setActiveJobCardData(prev => ({ ...prev, ...updatedData }));
                  alert("Job Card sign-off and parameters updated!");
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 0: JOB CARDS & SIGN-OFFS (PRODUCTION HEAD VIEW) */}
      {activeTab === 'job_cards' && !selectedRecord && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="input-with-icon" style={{ width: '300px' }}>
                <Search size={16} className="input-icon" />
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Search Job Name, SKU or Client..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {jobMasters.length} Job Masters for Production Sign-Off
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU / Job ID</th>
                  <th>Job Name & Client</th>
                  <th>Structure & Colors</th>
                  <th>Pre-Press Checklist</th>
                  <th>Production Head Sign-Off</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {jobMasters.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No Job Masters found in directory.
                    </td>
                  </tr>
                ) : (
                  jobMasters
                    .filter(j => 
                      (j.jobName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (j.skuCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (j.clientName || '').toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(jm => {
                      const isChecklistVerified = jm.chkEyemark && jm.chkBarcode && jm.chkOrientation && jm.chkClientApproval;
                      const isApproved = jm.approvedByHead || jm.productionApproved;

                      return (
                        <tr key={jm.id}>
                          <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>
                            {jm.skuCode || jm.id}
                          </td>
                          <td>
                            <div style={{ fontWeight: '700', color: '#0f172a' }}>{jm.jobName}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{jm.clientName}</div>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: '#334155' }}>
                            <div><code>{jm.structure || '—'}</code></div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{jm.colorsCount || 6} Colors</div>
                          </td>
                          <td>
                            {isChecklistVerified ? (
                              <span className="badge badge-us" style={{ background: '#dcfce7', color: '#15803d' }}>
                                <CheckCircle2 size={12} /> 4/4 Verified
                              </span>
                            ) : (
                              <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309' }}>
                                ⚠️ Pending Checklist
                              </span>
                            )}
                          </td>
                          <td>
                            {isApproved ? (
                              <span className="badge badge-us" style={{ background: '#dcfce7', color: '#15803d', fontWeight: '800' }}>
                                <ShieldCheck size={12} /> Approved by {jm.approvedHeadName || 'Production Head'}
                              </span>
                            ) : (
                              <span className="badge badge-client" style={{ background: '#fff7ed', color: '#c2410c', fontWeight: '700' }}>
                                ⏳ Pending Sign-Off
                              </span>
                            )}
                          </td>
                          <td>
                            <button 
                              className="btn-primary" 
                              style={{ padding: '6px 14px', fontSize: '0.82rem', background: '#059669', borderColor: '#059669' }}
                              onClick={() => {
                                setActiveJobCardData({
                                  jobMasterId: jm.id,
                                  skuCode: jm.skuCode,
                                  jobName: jm.jobName,
                                  clientName: jm.clientName,
                                  clientGroup: jm.clientName,
                                  structure: jm.structure,
                                  layers: jm.layers || [],
                                  colorsCount: jm.colorsCount || 6,
                                  chkEyemark: jm.chkEyemark,
                                  chkBarcode: jm.chkBarcode,
                                  chkOrientation: jm.chkOrientation,
                                  chkClientApproval: jm.chkClientApproval,
                                  approvedByHead: jm.approvedByHead || jm.productionApproved,
                                  approvedHeadName: jm.approvedHeadName,
                                  approvedHeadDate: jm.approvedHeadDate
                                });
                              }}
                            >
                              <ShieldCheck size={14} /> Review & Sign-Off Job Card
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 1: PUNCHED JOBS READY FOR PRODUCTION */}
      {activeTab === 'punched_jobs' && !selectedRecord && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="input-with-icon" style={{ width: '300px' }}>
                <Search size={16} className="input-icon" />
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Search Punched Job or Order ID..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {filteredPunchedOrders.length} punched jobs
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Job Name & Customer</th>
                  <th>Substrate Structure</th>
                  <th>Order Qty (kg)</th>
                  <th>Target Delivery</th>
                  <th>Production Record Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPunchedOrders.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No punched jobs found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredPunchedOrders.map(ord => {
                    const existingRecord = productionRecords.find(r => r.orderId === ord.id);
                    return (
                      <tr key={ord.id} style={{ background: existingRecord ? 'transparent' : '#f0f9ff' }}>
                        <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{ord.id}</td>
                        <td>
                          <div style={{ fontWeight: '700', color: '#0f172a' }}>{ord.jobName}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{ord.clientName}</div>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#334155' }}>
                          <code>{getSubstrateStructure(ord)}</code>
                        </td>
                        <td style={{ fontWeight: '700' }}>
                          {ord.orderQtyKg ? ord.orderQtyKg.toLocaleString() : '1,500'} kg
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>{ord.targetDeliveryDate || '2026-07-28'}</td>
                        <td>
                          {existingRecord ? (
                            existingRecord.status === 'Approved by Admin' ? (
                              <span className="badge badge-us" style={{ background: '#dcfce7', color: '#15803d' }}>
                                <CheckCircle2 size={12} /> Approved Record
                              </span>
                            ) : (
                              <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309' }}>
                                <Clock size={12} /> Filled (Pending Approval)
                              </span>
                            )
                          ) : (
                            <span className="badge badge-client" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: '700' }}>
                              🚀 Punched - Ready for Production
                            </span>
                          )}
                        </td>
                        <td>
                          <button 
                            className="btn-primary" 
                            style={{ 
                              padding: '6px 14px', 
                              fontSize: '0.82rem', 
                              background: existingRecord ? '#64748b' : '#4f46e5',
                              borderColor: existingRecord ? '#64748b' : '#4f46e5'
                            }}
                            onClick={() => {
                              if (existingRecord) {
                                setSelectedRecord(existingRecord);
                              } else {
                                handleStartProductionForOrder(ord);
                              }
                            }}
                          >
                            <Play size={13} fill="currentColor" /> {existingRecord ? 'View/Edit Record' : 'Start Production'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SUBMITTED PRODUCTION RECORDS LIST */}
      {activeTab === 'list' && !selectedRecord && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="input-with-icon" style={{ width: '280px' }}>
                <Search size={16} className="input-icon" />
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Search Job Name or Order ID..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <select 
                className="form-control"
                style={{ width: '200px' }}
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
              >
                <option value="all">All Approval Statuses</option>
                <option value="Filled by Plant Manager">Pending Admin Approval</option>
                <option value="Approved by Admin">Approved by Admin</option>
                <option value="Draft">Draft Records</option>
              </select>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {filteredRecords.length} records
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Job / Client Name</th>
                  <th>Date Filled</th>
                  <th>Net Produced (kg)</th>
                  <th>Material Cost (₹)</th>
                  <th>Final Cost (₹)</th>
                  {isAdmin && <th>Profitability & Margin (Admin Only)</th>}
                  <th>Approval Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? "9" : "8"} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No production records found. Click "Fill New Production Record" to create one.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(rec => {
                    const linkedOrder = orders.find(o => o.id === rec.orderId || o.jobName === rec.jobName) || {};
                    const sellingPrice = linkedOrder.sellingPricePerKg || 245;
                    const revenue = Math.round((rec.totalProductionQtyKg || 1000) * sellingPrice);
                    const actualCost = rec.finalProductionCostRs || 0;
                    const profitRs = revenue - actualCost;
                    const marginPct = revenue > 0 ? ((profitRs / revenue) * 100).toFixed(1) : 0;

                    return (
                      <tr key={rec.id}>
                        <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{rec.orderId}</td>
                        <td>
                          <div style={{ fontWeight: '600' }}>{rec.jobName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rec.clientName} • <span style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{rec.jobMasterId || 'JM-2026-089'}</span></div>
                        </td>
                        <td>{rec.dateFilled}</td>
                        <td style={{ fontWeight: '600' }}>{(rec.totalProductionQtyKg ?? 0).toLocaleString()} kg</td>
                        <td>₹ {(rec.totalMaterialCostRs ?? 0).toLocaleString()}</td>
                        <td style={{ fontWeight: '700', color: '#047857' }}>₹ {(rec.finalProductionCostRs ?? 0).toLocaleString()}</td>
                        
                        {/* Admin Only Profitability Column */}
                        {isAdmin && (
                          <td>
                            <div style={{ fontWeight: '800', color: profitRs > 0 ? '#047857' : '#dc2626', fontSize: '0.85rem' }}>
                              ₹ {profitRs.toLocaleString('en-IN')} ({marginPct}%)
                            </div>
                            <span className={`badge ${marginPct >= 15 ? 'badge-success' : marginPct >= 5 ? 'badge-info' : 'badge-danger'}`} style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                              {marginPct >= 15 ? 'HIGH MARGIN' : marginPct >= 5 ? 'MODERATE' : 'THIN / LOSS'}
                            </span>
                          </td>
                        )}

                        <td>
                          {rec.status === 'Approved by Admin' ? (
                            <span className="badge badge-us">
                              <CheckCircle2 size={12} /> Approved by Admin
                            </span>
                          ) : rec.status === 'Filled by Plant Manager' ? (
                            <span className="badge badge-warning">
                              <Clock size={12} /> Pending Admin Approval
                            </span>
                          ) : (
                            <span className="badge badge-client">Draft</span>
                          )}
                        </td>
                        <td>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            onClick={() => setSelectedRecord(rec)}
                          >
                            View Record
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: VIEW SINGLE RECORD DETAILS & ADMIN APPROVAL */}
      {selectedRecord && (
        <div className="glass-panel" style={{ padding: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <button className="btn-secondary" style={{ marginBottom: '12px', padding: '5px 12px', fontSize: '0.8rem' }} onClick={() => setSelectedRecord(null)}>
                ← Back to Records List
              </button>
              <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                Production Record: {selectedRecord.jobName}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Job Master ID: <b>{selectedRecord.jobMasterId || 'JM-2026-089'}</b> • Order ID: <b>{selectedRecord.orderId}</b> • Client: {selectedRecord.clientName}
              </p>
            </div>

            {/* Approval Status Banner & Action */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              {selectedRecord.status === 'Approved by Admin' ? (
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '8px 14px', borderRadius: '8px', color: '#047857', textAlign: 'right' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} /> Fully Approved by Admin
                  </div>
                  <div style={{ fontSize: '0.75rem', marginTop: '2px', color: '#065f46' }}>
                    Approved by: {selectedRecord.approvedBy} on {selectedRecord.approvalDate}
                  </div>
                </div>
              ) : selectedRecord.status === 'Filled by Plant Manager' ? (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '8px 14px', borderRadius: '8px', color: '#b45309' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>Filled by: {selectedRecord.filledBy}</div>
                    <div style={{ fontSize: '0.75rem' }}>Awaiting Admin Approval</div>
                  </div>

                  {isAdmin && (
                    <button 
                      className="btn-primary" 
                      style={{ background: '#059669', borderColor: '#059669', padding: '10px 18px' }}
                      onClick={() => {
                        if (onApproveProductionRecord) {
                          onApproveProductionRecord(selectedRecord.id, `${currentUser.name} (Admin)`);
                          setSelectedRecord({
                            ...selectedRecord,
                            status: 'Approved by Admin',
                            approvedBy: `${currentUser.name} (Admin)`,
                            approvalDate: new Date().toLocaleString()
                          });
                          alert(`Production Record for "${selectedRecord.jobName}" APPROVED successfully! Job can now be completed.`);
                        }
                      }}
                    >
                      <ShieldCheck size={18} /> Approve Production Record
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Ingredient Materials Breakdown Table */}
          <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px', color: 'var(--text-primary)' }}>
            📦 Ingredient Materials Issue & Return Record
          </h4>
          <table className="data-table" style={{ marginBottom: '24px' }}>
            <thead>
              <tr>
                <th>Raw Material / Ingredient</th>
                <th>Micron</th>
                <th>Width (mm)</th>
                <th>Issued (kg)</th>
                <th>Returned (kg)</th>
                <th>Net Consumed (kg)</th>
                <th>Unit Price (₹/kg)</th>
                <th>Total Material Cost (₹)</th>
              </tr>
            </thead>
            <tbody>
              {selectedRecord.materialsList.map((m, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: '600' }}>{m.filmType}</td>
                  <td>{m.micron}</td>
                  <td>{m.widthMm}</td>
                  <td>{m.issueQtyKg} kg</td>
                  <td style={{ color: '#dc2626' }}>{m.returnQtyKg} kg</td>
                  <td style={{ fontWeight: '700' }}>{m.netConsumedQtyKg} kg</td>
                  <td>₹ {m.unitPricePerKg}</td>
                  <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                    ₹ {m.totalMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ========================================================================= */}
          {/* ADMIN ROLE ONLY: FINANCIAL PROFITABILITY & COST VARIANCE ANALYSIS */}
          {/* ========================================================================= */}
          {isAdmin ? (
            <div className="glass-panel" style={{ marginTop: '24px', padding: '24px', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #cbd5e1', paddingBottom: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--primary-brand)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <DollarSign size={20} /> Admin Financial Profitability & Cost Variance Report
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Quoted Pre-Costing Target vs Post-Production Actual Material & Operating Costs
                  </p>
                </div>
                <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Lock size={12} /> Visible Only to Admin Role
                </span>
              </div>

              {(() => {
                // Calculate Profitability & Variances for this job
                const linkedOrder = orders.find(o => o.id === selectedRecord.orderId || o.jobName === selectedRecord.jobName) || orders[0] || {};
                const preCosting = linkedOrder.calculationDetails || {};

                const sellingPricePerKg = linkedOrder.sellingPricePerKg || 245;
                const actualQtyKg = selectedRecord.totalProductionQtyKg || 1000;
                const targetOrderQtyKg = linkedOrder.quantityKg || linkedOrder.jobQuantityKg || actualQtyKg;

                const totalGrossRevenue = Math.round(actualQtyKg * sellingPricePerKg);
                const actualProductionCost = selectedRecord.finalProductionCostRs || 0;
                const netProfitRs = totalGrossRevenue - actualProductionCost;
                const profitMarginPct = totalGrossRevenue > 0 ? ((netProfitRs / totalGrossRevenue) * 100).toFixed(1) : 0;

                // Quoted Pre-Costing Target
                const estRawMaterialCost = preCosting.summary?.totalRawMaterialCost || (targetOrderQtyKg * 140);
                const estProcessingCost = targetOrderQtyKg * (selectedRecord.processingCostRs ? (selectedRecord.processingCostRs / actualQtyKg) : 25);
                const estTotalCost = estRawMaterialCost + estProcessingCost;

                const costVarianceRs = actualProductionCost - estTotalCost;
                const costVariancePct = estTotalCost > 0 ? ((costVarianceRs / estTotalCost) * 100).toFixed(1) : 0;

                const isHighProfit = profitMarginPct >= 20;
                const isModerateProfit = profitMarginPct >= 10 && profitMarginPct < 20;
                const isLowProfit = profitMarginPct >= 0 && profitMarginPct < 10;

                return (
                  <div>
                    {/* Key Metric KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                      <div className="glass-card" style={{ padding: '16px', background: '#ffffff' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '700' }}>CONTRACT REVENUE</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#0284c7', marginTop: '4px' }}>
                          ₹ {totalGrossRevenue.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Selling Rate: ₹ {sellingPricePerKg}/kg
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px', background: '#ffffff' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '700' }}>QUOTED TARGET COST</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>
                          ₹ {Math.round(estTotalCost).toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Pre-Cost Rate: ₹ {(estTotalCost / (targetOrderQtyKg || 1)).toFixed(2)}/kg
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px', background: '#ffffff' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '700' }}>ACTUAL PRODUCTION COST</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: costVarianceRs > 0 ? '#b91c1c' : '#047857', marginTop: '4px' }}>
                          ₹ {Math.round(actualProductionCost).toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: costVarianceRs > 0 ? '#dc2626' : '#059669', marginTop: '2px', fontWeight: '700' }}>
                          Variance: {costVarianceRs > 0 ? `+₹ ${Math.round(costVarianceRs).toLocaleString()} (+${costVariancePct}%)` : `-₹ ${Math.abs(Math.round(costVarianceRs)).toLocaleString()} (${costVariancePct}%)`}
                        </div>
                      </div>

                      <div className="glass-card" style={{ padding: '16px', background: isHighProfit ? '#ecfdf5' : isModerateProfit ? '#f0f9ff' : isLowProfit ? '#fffbeb' : '#fef2f2', border: `1px solid ${isHighProfit ? '#a7f3d0' : isModerateProfit ? '#bae6fd' : isLowProfit ? '#fde68a' : '#fca5a5'}` }}>
                        <div style={{ fontSize: '0.78rem', color: isHighProfit ? '#065f46' : isModerateProfit ? '#0369a1' : isLowProfit ? '#92400e' : '#991b1b', fontWeight: '800' }}>NET PROFIT / MARGIN</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: isHighProfit ? '#047857' : isModerateProfit ? '#0284c7' : isLowProfit ? '#b45309' : '#dc2626', marginTop: '4px' }}>
                          ₹ {Math.round(netProfitRs).toLocaleString('en-IN')} ({profitMarginPct}%)
                        </div>
                        <div style={{ marginTop: '4px' }}>
                          <span className={`badge ${isHighProfit ? 'badge-success' : isModerateProfit ? 'badge-info' : isLowProfit ? 'badge-warning' : 'badge-danger'}`} style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                            {isHighProfit ? '🟢 HIGH PROFIT (+20%+)' : isModerateProfit ? '🔵 GOOD MARGIN (10-20%)' : isLowProfit ? '🟡 THIN MARGIN (<10%)' : '🔴 COST OVERRUN / LOSS'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Variance Breakdown Table */}
                    <h5 style={{ fontSize: '0.92rem', fontWeight: '800', marginBottom: '10px', color: 'var(--text-primary)' }}>
                      📊 Cost Element Variance Breakdown
                    </h5>
                    <table className="data-table" style={{ background: '#ffffff' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th>Cost Component</th>
                          <th>Pre-Costing Quoted Target (₹)</th>
                          <th>Post-Production Actual (₹)</th>
                          <th>Cost Variance Delta (₹)</th>
                          <th>Variance Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const materials = selectedRecord.materialsList || [];
                          const filmsCost = materials.filter(m => (m.filmType || '').includes('Film')).reduce((a, b) => a + (b.totalMaterialCost || 0), 0);
                          const inksSolventsCost = materials.filter(m => (m.filmType || '').includes('Ink') || (m.filmType || '').includes('Solvent')).reduce((a, b) => a + (b.totalMaterialCost || 0), 0);
                          const adhesiveCost = materials.filter(m => (m.filmType || '').includes('Adhesive') || (m.filmType || '').includes('Hardener')).reduce((a, b) => a + (b.totalMaterialCost || 0), 0);

                          const estFilmCost = preCosting.summary?.totalFilmGrossKg ? (preCosting.summary.totalFilmGrossKg * 130) : (filmsCost * 0.95);
                          const estInkCost = preCosting.inkDetails?.grossKg ? (preCosting.inkDetails.grossKg * 1500) : (inksSolventsCost * 0.95);
                          const estAdhesiveCost = preCosting.adhesiveDetails?.grossKg ? (preCosting.adhesiveDetails.grossKg * 270) : (adhesiveCost * 0.95);
                          const estProcCost = targetOrderQtyKg * 25;
                          const actualProcCost = selectedRecord.processingCostRs || (actualQtyKg * 25);

                          const rows = [
                            { label: "Film Substrates (PET / LDPE / BOPP)", est: Math.round(estFilmCost), act: Math.round(filmsCost) },
                            { label: "Printing Inks & Solvents", est: Math.round(estInkCost), act: Math.round(inksSolventsCost) },
                            { label: "Lamination Adhesives & Hardeners", est: Math.round(estAdhesiveCost), act: Math.round(adhesiveCost) },
                            { label: "Machine Processing & Conversion Overhead", est: Math.round(estProcCost), act: Math.round(actualProcCost) }
                          ];

                          return rows.map((r, idx) => {
                            const delta = r.act - r.est;
                            const deltaPct = r.est > 0 ? ((delta / r.est) * 100).toFixed(1) : 0;
                            const isOver = delta > 0;

                            return (
                              <tr key={idx}>
                                <td style={{ fontWeight: '700' }}>{r.label}</td>
                                <td>₹ {r.est.toLocaleString()}</td>
                                <td style={{ fontWeight: '700' }}>₹ {r.act.toLocaleString()}</td>
                                <td style={{ fontWeight: '800', color: isOver ? '#dc2626' : '#059669' }}>
                                  {isOver ? `+₹ ${delta.toLocaleString()} (+${deltaPct}%)` : `${delta.toLocaleString()} (${deltaPct}%)`}
                                </td>
                                <td>
                                  <span className={`badge ${isOver ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '0.72rem' }}>
                                    {isOver ? '🔺 COST OVERRUN' : '🟢 SAVING / WITHIN BUDGET'}
                                  </span>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                )})()}
              </div>
            ) : (
            <div style={{ marginTop: '20px', padding: '14px 18px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={16} /> <span>Financial Profitability, Revenue Margins & Cost Variance reports are restricted to the <b>Admin Role</b>.</span>
            </div>
          )}
        </div>
      )}



      {/* SCRAP INVENTORY & DISPOSAL TAB VIEW */}
      {activeTab === 'scrap_inventory' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ♻️ Plant Scrap Inventory & Disposal Stock Register
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                Track accumulated process wastage across 6 standard categories and log disposal sales to remove scrap from factory stock.
              </p>
            </div>

            <button className="btn-primary" style={{ background: '#b45309', borderColor: '#b45309' }} onClick={() => setIsDisposeModalOpen(true)}>
              <Plus size={16} /> Dispose Scrap / Log Clearance
            </button>
          </div>

          {/* 6 Category Stock Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
            {Object.entries(scrapStockData).map(([cat, qty]) => (
              <div key={cat} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#92400e', textTransform: 'uppercase' }}>{cat}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#78350f', marginTop: '6px' }}>
                  {qty.toFixed(1)} <span style={{ fontSize: '0.85rem' }}>kg</span>
                </div>
              </div>
            ))}
          </div>

          {/* Total In-Stock Banner */}
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', padding: '14px 20px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ fontWeight: '800', color: '#78350f', fontSize: '0.95rem' }}>
              Total Net Scrap Stock Available in Factory:
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#92400e' }}>
              {totalScrapStockInPlantKg.toFixed(1)} kg
            </div>
          </div>

          {/* Scrap Disposal Transactions History Table */}
          <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>📋 Scrap Disposal Clearance History ({scrapDisposals.length})</h4>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ref / Gate Pass #</th>
                  <th>Disposal Date</th>
                  <th>Scrap Category</th>
                  <th>Disposed Qty (kg)</th>
                  <th>Vendor / Buyer</th>
                  <th>Disposed By</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {scrapDisposals.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      No scrap disposals recorded yet. Click "Dispose Scrap / Log Clearance" to register a clearance sale.
                    </td>
                  </tr>
                ) : (
                  scrapDisposals.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{d.refNo}</td>
                      <td>{d.date}</td>
                      <td style={{ fontWeight: '600' }}>{d.category}</td>
                      <td style={{ fontWeight: '800', color: '#dc2626' }}>-{d.qtyKg} kg</td>
                      <td>{d.vendor}</td>
                      <td style={{ fontSize: '0.78rem' }}>{d.disposedBy}</td>
                      <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{d.notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: FILL NEW PRODUCTION RECORD */}
      {activeTab === 'new_record' && (
        <form onSubmit={handleOpenConfirmModal} className="glass-panel" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.3rem', fontWeight: '800', marginBottom: '20px', color: 'var(--text-primary)' }}>
            📝 Fill Job Production Record & Ingredient Usage
          </h3>

          <div className="form-grid" style={{ marginBottom: '24px' }}>
            <div className="form-group">
              <label>Select Job / Order</label>
              <select 
                className="form-control"
                value={selectedOrder?.id || ''}
                onChange={e => handleSelectOrderForRecord(e.target.value)}
                required
              >
                {orders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.id} — {o.jobName} ({o.clientName})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Client Name</label>
              <input type="text" className="form-control" value={selectedOrder?.clientName || ''} readOnly />
            </div>

            <div className="form-group">
              <label>Record Filled By</label>
              <input type="text" className="form-control" value={`${currentUser.name} (${currentUser.role})`} readOnly />
            </div>
          </div>

          {/* Ingredient Materials Form Table */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                📦 Ingredient Materials Issued & Returned List (Pre-selected from Job Master)
              </h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Substrate layers pre-filled as per Job Master. Any variation in Micron, Width, or Substrate type will be calculated and highlighted automatically.
              </p>
            </div>
            <button type="button" className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem' }} onClick={addMaterialRow}>
              <Plus size={14} /> Add Raw Material Row
            </button>
          </div>

          <table className="data-table" style={{ marginBottom: '24px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ minWidth: '220px' }}>Raw Material / Ingredient</th>
                <th style={{ minWidth: '170px' }}>Barcode / Roll ID (Scan 📷)</th>
                <th style={{ width: '85px' }}>Micron</th>
                <th style={{ width: '95px' }}>Width (mm)</th>
                <th style={{ width: '110px' }}>Issued Qty (kg)</th>
                <th style={{ width: '110px' }}>Unused Return (kg)</th>
                <th style={{ color: '#047857' }}>Net Consumed (kg)</th>
                <th style={{ width: '110px' }}>Unit Rate (₹/kg)</th>
                <th>Total Cost (₹)</th>
                <th style={{ width: '50px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {calculatedMaterials.map((m) => {
                const isPartialReturn = (parseFloat(m.returnQtyKg) || 0) > 0;
                const rawMaterialOptions = [
                  ...new Set([
                    'PET Film',
                    'METPET Film',
                    'Natural LD Film',
                    'Ethyl Acetate (Solvent)',
                    'Toluene (Solvent)',
                    'MIBK (Solvent)',
                    'Liquid Inks & Solvents',
                    'Solvent-less Adhesive',
                    'Solvent-based Adhesive',
                    'Milky LD Film',
                    'BOPP Natural',
                    'Metalised BOPP',
                    'Pearlised BOPP',
                    'CPP Natural',
                    'Metalised CPP',
                    ...inventory.map(i => i.filmType).filter(Boolean)
                  ])
                ];

                return (
                  <tr key={m.id}>
                    <td>
                      <select 
                        className="form-control"
                        style={{ fontWeight: '600', minWidth: '180px' }}
                        value={m.filmType}
                        onChange={e => {
                          const val = e.target.value;
                          updateMaterialRow(m.id, 'filmType', val);
                          if (DEFAULT_DAILY_RATES[val]) {
                            updateMaterialRow(m.id, 'unitPricePerKg', DEFAULT_DAILY_RATES[val]);
                          }
                        }}
                      >
                        {rawMaterialOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      {m.hasFilmTypeVar && (
                        <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem', marginTop: '3px', display: 'block' }}>
                          ⚠️ Substrate Mismatch vs JM ({m.jobMasterFilmType})
                        </span>
                      )}
                    </td>

                    <td>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text" 
                          className="form-control"
                          style={{ paddingLeft: '28px', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: '700', background: m.barcode ? '#f0f9ff' : '#ffffff' }}
                          placeholder="Scan or type Barcode..."
                          value={m.barcode || ''}
                          onChange={e => {
                            const val = e.target.value;
                            updateMaterialRow(m.id, 'barcode', val);
                            if (val.trim()) {
                              const match = inventory.find(inv => 
                                (inv.lastBatch || '').toLowerCase() === val.trim().toLowerCase() || 
                                (inv.id || '').toLowerCase() === val.trim().toLowerCase() ||
                                (inv.filmType || '').toLowerCase() === val.trim().toLowerCase()
                              );
                              if (match) {
                                updateMaterialRow(m.id, 'issueQtyKg', match.availableQtyKg || 400);
                                updateMaterialRow(m.id, 'returnQtyKg', 0);
                                if (match.filmType) updateMaterialRow(m.id, 'filmType', match.filmType);
                                if (match.micron) updateMaterialRow(m.id, 'micron', match.micron);
                                if (match.widthMm) updateMaterialRow(m.id, 'widthMm', match.widthMm);
                                if (match.unitPricePerKg || DEFAULT_DAILY_RATES[match.filmType]) {
                                  updateMaterialRow(m.id, 'unitPricePerKg', match.unitPricePerKg || DEFAULT_DAILY_RATES[match.filmType] || 120);
                                }
                              }
                            }
                          }}
                        />
                        <Scan size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: m.barcode ? '#0284c7' : '#94a3b8' }} />
                      </div>
                    </td>

                    <td>
                      <input 
                        type="text" 
                        className="form-control"
                        value={m.micron}
                        onChange={e => updateMaterialRow(m.id, 'micron', e.target.value)}
                      />
                      {m.micronVarPct !== null && (
                        <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem', marginTop: '2px', display: 'block' }}>
                          ⚠️ {m.micronVarPct > 0 ? `+${m.micronVarPct}%` : `${m.micronVarPct}%`}
                        </span>
                      )}
                    </td>

                    <td>
                      <input 
                        type="text" 
                        className="form-control"
                        value={m.widthMm}
                        onChange={e => updateMaterialRow(m.id, 'widthMm', e.target.value)}
                      />
                      {m.widthVarPct !== null && (
                        <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem', marginTop: '2px', display: 'block' }}>
                          ⚠️ {m.widthVarPct > 0 ? `+${m.widthVarPct}%` : `${m.widthVarPct}%`}
                        </span>
                      )}
                    </td>

                    <td>
                      <input 
                        type="number" 
                        step="0.1"
                        className="form-control"
                        style={{ fontWeight: '600' }}
                        value={m.issueQtyKg}
                        onChange={e => updateMaterialRow(m.id, 'issueQtyKg', e.target.value)}
                        required
                      />
                    </td>

                    <td>
                      <input 
                        type="number" 
                        step="0.1"
                        className="form-control"
                        style={{ fontWeight: '600', color: isPartialReturn ? '#dc2626' : 'var(--text-muted)' }}
                        value={m.returnQtyKg}
                        onChange={e => updateMaterialRow(m.id, 'returnQtyKg', e.target.value)}
                      />
                    </td>

                    <td>
                      <div style={{ fontWeight: '800', color: '#047857', fontSize: '0.9rem' }}>
                        {m.netConsumedQtyKg} kg
                      </div>
                      {isPartialReturn ? (
                        <span className="badge badge-warning" style={{ fontSize: '0.68rem', padding: '1px 5px', marginTop: '3px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                          📦 {m.returnQtyKg} kg returned
                        </span>
                      ) : (
                        <span className="badge badge-us" style={{ fontSize: '0.68rem', padding: '1px 5px', marginTop: '3px' }}>
                          Return: 0 kg
                        </span>
                      )}
                    </td>

                    <td>
                      <input 
                        type="number" 
                        step="0.1"
                        className="form-control"
                        value={m.unitPricePerKg}
                        onChange={e => updateMaterialRow(m.id, 'unitPricePerKg', e.target.value)}
                        required
                      />
                    </td>

                    <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                      ₹ {m.totalMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>

                    <td>
                      <button type="button" className="icon-btn-danger" onClick={() => removeMaterialRow(m.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* STAGE-WISE PRODUCTION QUANTITIES & SCRAP WASTAGE BREAKDOWN */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚙️ Stage-wise Production Quantities & Process Scrap Inputs
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* STAGE 1: FIRST PASS L1 */}
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '16px 20px', borderRadius: '10px' }}>
                <div style={{ fontWeight: '800', color: '#0369a1', fontSize: '0.9rem', marginBottom: '10px' }}>
                  🔹 STAGE 1: FIRST PASS L1 (Single / Surface & 2-Layer Jobs)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#0369a1' }}>First Pass L1 Output (kg) *</label>
                    <input type="number" step="0.1" className="form-control" style={{ fontWeight: '700', background: '#ffffff' }} value={qtyFirstPassL1} onChange={e => setQtyFirstPassL1(e.target.value)} required />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b45309' }}>Printing Plain Setting Scrap (kg)</label>
                    <input type="number" step="0.1" className="form-control" style={{ background: '#ffffff' }} value={printingPlainSettingWastageKg} onChange={e => setPrintingPlainSettingWastageKg(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b45309' }}>Printing Wastage Scrap (kg)</label>
                    <input type="number" step="0.1" className="form-control" style={{ background: '#ffffff' }} value={printingWastageKg} onChange={e => setPrintingWastageKg(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* STAGE 2: SECOND PASS L2 */}
              <div style={{ background: '#fdf4ff', border: '1px solid #f5d0fe', padding: '16px 20px', borderRadius: '10px' }}>
                <div style={{ fontWeight: '800', color: '#86198f', fontSize: '0.9rem', marginBottom: '10px' }}>
                  🔹 STAGE 2: SECOND PASS L2 (For 3-Layer Jobs)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#86198f' }}>Second Pass L2 Output (kg)</label>
                    <input type="number" step="0.1" className="form-control" style={{ fontWeight: '700', background: '#ffffff' }} value={qtySecondPassL2} onChange={e => setQtySecondPassL2(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b45309' }}>Lamination Plain Substrate Scrap (kg)</label>
                    <input type="number" step="0.1" className="form-control" style={{ background: '#ffffff' }} value={laminationPlainSubstrateWastageKg} onChange={e => setLaminationPlainSubstrateWastageKg(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* STAGE 3: INSPECTION */}
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '16px 20px', borderRadius: '10px' }}>
                <div style={{ fontWeight: '800', color: '#b45309', fontSize: '0.9rem', marginBottom: '10px' }}>
                  🔹 STAGE 3: INSPECTION (Optional QC Pass)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#b45309' }}>Inspected Qty (kg)</label>
                    <input type="number" step="0.1" className="form-control" style={{ fontWeight: '700', background: '#ffffff' }} value={qtyInspection} onChange={e => setQtyInspection(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b45309' }}>Printed Wastage Scrap (kg)</label>
                    <input type="number" step="0.1" className="form-control" style={{ background: '#ffffff' }} value={printedWastageKg} onChange={e => setPrintedWastageKg(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* STAGE 4: SLITTING */}
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '16px 20px', borderRadius: '10px' }}>
                <div style={{ fontWeight: '800', color: '#047857', fontSize: '0.9rem', marginBottom: '10px' }}>
                  🔹 STAGE 4: SLITTING
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#047857' }}>Slitting Output (kg)</label>
                    <input type="number" step="0.1" className="form-control" style={{ fontWeight: '700', background: '#ffffff' }} value={qtySlitting} onChange={e => setQtySlitting(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b45309' }}>Laminate Wastage Scrap (kg)</label>
                    <input type="number" step="0.1" className="form-control" style={{ background: '#ffffff' }} value={laminateWastageKg} onChange={e => setLaminateWastageKg(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b45309' }}>Trim Wastage Scrap (kg)</label>
                    <input type="number" step="0.1" className="form-control" style={{ background: '#ffffff' }} value={trimWastageKg} onChange={e => setTrimWastageKg(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* STAGE 5: DISPATCH READY */}
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '16px 20px', borderRadius: '10px' }}>
                <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.9rem', marginBottom: '10px' }}>
                  🔹 STAGE 5: DISPATCH READY
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0f172a' }}>Dispatch Ready Qty (kg) *</label>
                    <input type="number" step="0.1" className="form-control" style={{ fontWeight: '800', fontSize: '1.05rem', background: '#ffffff', color: '#047857', border: '2px solid #059669' }} value={qtyDispatch} onChange={e => setQtyDispatch(e.target.value)} required />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b' }}>Total Scrap Generated (kg)</label>
                    <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#b45309', marginTop: '6px' }}>
                      {totalScrapQtyKg.toFixed(1)} kg ({overallScrapPctOfDispatch}% of dispatch)
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b' }}>Overall Scrap Share %</label>
                    <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0369a1', marginTop: '6px' }}>
                      {overallScrapPctOfOutput}% of total material output
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Cost Summary Box with Formula */}
          <div className="glass-card" style={{ background: '#f8fafc', padding: '24px', marginBottom: '24px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--primary-brand)', marginBottom: '16px' }}>
              📐 COST OF PRODUCTION FORMULA: (Total Qty Produced × Processing Cost Rate) + (Ingredients Cost)
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
              <div>
                <span className="stats-title">Total Net Qty Produced</span>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', marginTop: '4px' }}>
                  {(totalNetQtyKg ?? 0).toLocaleString()} <span style={{ fontSize: '0.85rem' }}>kg</span>
                </div>
              </div>

              <div>
                <span className="stats-title">Total Ingredients Cost</span>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', marginTop: '4px' }}>
                  ₹ {totalMaterialCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Processing & Lamination Rate (₹ / kg)
                </label>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{ marginTop: '4px', fontSize: '1rem', fontWeight: '700' }}
                  value={processingCostPerKg}
                  onChange={e => setProcessingCostPerKg(e.target.value)}
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Processing Cost: ₹ {totalProcessingCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div style={{ borderLeft: '2px solid #cbd5e1', paddingLeft: '20px' }}>
                <span className="stats-title" style={{ color: '#047857' }}>TOTAL COST OF PRODUCTION</span>
                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#047857', marginTop: '4px' }}>
                  ₹ {finalProductionCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="btn-secondary" onClick={() => setActiveTab('list')}>
              Cancel
            </button>
            <button 
              type="button" 
              className="btn-primary" 
              style={{ background: '#059669', borderColor: '#059669', padding: '10px 20px', fontSize: '0.9rem' }}
              onClick={handleOpenConfirmModal}
            >
              <CheckCircle2 size={18} /> Submit Record for Admin Approval
            </button>
          </div>
        </form>
      )}

      {/* DETAILED CONFIRMATION POPUP MODAL */}
      {isConfirmModalOpen && (
        <div className="modal-overlay" onClick={() => setIsConfirmModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '750px', maxWidth: '95vw', padding: '28px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '800', marginBottom: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileSpreadsheet style={{ color: 'var(--primary-brand)' }} /> Confirm Job Production Record Submission
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Please review stage production quantities, specification variations, material consumption, and process scrap generation before submitting for Admin approval.
            </p>

            {/* Job & Client Meta Header */}
            <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '0.85rem' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Job ID / Order:</span> <strong style={{ color: 'var(--primary-brand)' }}>{selectedOrder?.id}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Job Name:</span> <strong>{selectedOrder?.jobName}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Customer / Client:</span> <strong>{selectedOrder?.clientName}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Recorded By:</span> <strong>{currentUser.name} ({currentUser.role})</strong></div>
            </div>

            {/* Itemized Material Usage & Spec Variation Preview */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                📦 Consumed Materials & Spec Variations ({calculatedMaterials.length} Lines)
              </h4>
              <div style={{ maxHeight: '170px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                <table className="data-table" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th>Material</th>
                      <th>Spec Variation vs Job Master</th>
                      <th>Issued</th>
                      <th>Returned</th>
                      <th>Net Consumed</th>
                      <th>Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculatedMaterials.map((m, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '600' }}>{m.filmType}</td>
                        <td>
                          {m.hasVariation ? (
                            <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontSize: '0.68rem' }}>
                              ⚠️ {m.micronVarPct !== null && `Micron: ${m.micronVarPct > 0 ? `+${m.micronVarPct}%` : `${m.micronVarPct}%`} `}
                              {m.widthVarPct !== null && `Width: ${m.widthVarPct > 0 ? `+${m.widthVarPct}%` : `${m.widthVarPct}%`} `}
                              {m.hasFilmTypeVar && `Type Mismatch `}
                            </span>
                          ) : (
                            <span className="badge badge-us" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.68rem' }}>
                              Exact Match
                            </span>
                          )}
                        </td>
                        <td>{m.issueQtyKg} kg</td>
                        <td style={{ color: (parseFloat(m.returnQtyKg) || 0) > 0 ? '#047857' : 'inherit', fontWeight: '600' }}>
                          {m.returnQtyKg || 0} kg
                        </td>
                        <td style={{ fontWeight: '700' }}>{m.netConsumedQtyKg} kg</td>
                        <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>₹ {(m.totalMaterialCost ?? 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Costing & Scrap Summary Box */}
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '16px 20px', borderRadius: '10px', marginBottom: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.85rem', marginBottom: '12px' }}>
                <div>Dispatch Ready Produced Qty: <strong>{(totalNetQtyKg ?? 0).toLocaleString()} kg</strong></div>
                <div>Total Ingredients Cost: <strong>₹ {totalMaterialCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                <div>Processing Cost (₹ {processingCostPerKg}/kg): <strong>₹ {totalProcessingCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                <div>Total Scrap Generated: <strong style={{ color: '#b45309' }}>{totalScrapQtyKg.toFixed(1)} kg ({overallScrapPctOfDispatch}% of dispatch)</strong></div>
              </div>

              <div style={{ borderTop: '1px solid #6ee7b7', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '800', color: '#065f46', fontSize: '0.9rem' }}>TOTAL COST OF PRODUCTION:</span>
                <span style={{ fontSize: '1.5rem', fontWeight: '900', color: '#047857' }}>
                  ₹ {finalProductionCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" className="btn-secondary" style={{ padding: '8px 16px' }} onClick={() => setIsConfirmModalOpen(false)}>
                ← Review & Edit
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                style={{ background: '#059669', borderColor: '#059669', padding: '8px 20px', fontSize: '0.88rem' }}
                onClick={handleFinalSubmitRecord}
              >
                <CheckCircle2 size={16} /> Confirm & Submit to Admin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISPOSE SCRAP MODAL */}
      {isDisposeModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDisposeModalOpen(false)}>
          <div className="glass-card modal-content" style={{ width: '520px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ♻️ Log Scrap Disposal & Remove Stock
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: '16px' }}>
              Record scrap sale / clearance to deduct weight from plant scrap inventory.
            </p>

            <form onSubmit={handleAddScrapDisposal}>
              <div className="form-group">
                <label>Scrap Category *</label>
                <select className="form-control" value={disposeCategory} onChange={e => setDisposeCategory(e.target.value)}>
                  <option value="Printing Plain Setting (kg)">Printing Plain Setting (kg)</option>
                  <option value="Printing Wastage (kg)">Printing Wastage (kg)</option>
                  <option value="Lamination Plain Substrate (kg)">Lamination Plain Substrate (kg)</option>
                  <option value="Printed Wastage (kg)">Printed Wastage (kg)</option>
                  <option value="Laminate Wastage (kg)">Laminate Wastage (kg)</option>
                  <option value="Trim Wastage (kg)">Trim Wastage (kg)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>Disposal Qty (kg) *</label>
                  <input type="number" step="0.1" className="form-control" required value={disposeQtyKg} onChange={e => setDisposeQtyKg(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Gate Pass / Invoice #</label>
                  <input type="text" className="form-control" placeholder="e.g. GP-9821" value={disposeRefNo} onChange={e => setDisposeRefNo(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label>Scrap Buyer / Recycler Vendor Name</label>
                <input type="text" className="form-control" placeholder="e.g. Universal Traders & Recyclers" value={disposeVendor} onChange={e => setDisposeVendor(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Remarks / Notes</label>
                <input type="text" className="form-control" placeholder="Optional notes..." value={disposeNotes} onChange={e => setDisposeNotes(e.target.value)} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsDisposeModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: '#b45309', borderColor: '#b45309' }}>
                  <CheckCircle2 size={16} /> Confirm Scrap Disposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
