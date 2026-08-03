import React, { useState } from 'react';
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
  Scan
} from 'lucide-react';
import WeighingScaleInput from './WeighingScaleInput';
import BarcodePrinterModal from './BarcodePrinterModal';
import { DEFAULT_DAILY_RATES, generateBarcodeId } from '../factoryStore';

export default function ProductionRecordManagement({
  productionRecords = [],
  orders = [],
  inventory = [],
  currentUser,
  onSaveProductionRecord,
  onApproveProductionRecord,
  onAddRoll
}) {
  const isPlantManager = currentUser?.role === 'Plant Manager' || currentUser?.role === 'Admin';
  const isAdmin = currentUser?.role === 'Admin';

  const [activeTab, setActiveTab] = useState('punched_jobs'); // 'punched_jobs', 'list', 'new_record'
  const [selectedRecord, setSelectedRecord] = useState(null);
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

  const [materialsList, setMaterialsList] = useState(DEFAULT_6_INGREDIENTS);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Processing Cost Per Kg (Default from Settings: ₹ 25/kg)
  const [processingCostPerKg, setProcessingCostPerKg] = useState(25);

  // Scrap / Wastage breakdown fields (in kg)
  const [printingPlainSettingWastageKg, setPrintingPlainSettingWastageKg] = useState(15.0);
  const [printingWastageKg, setPrintingWastageKg] = useState(12.5);
  const [laminationPlainSubstrateWastageKg, setLaminationPlainSubstrateWastageKg] = useState(10.0);
  const [laminateWastageKg, setLaminateWastageKg] = useState(8.0);
  const [trimWastageKg, setTrimWastageKg] = useState(14.0);
  const [scrapRatePerKg, setScrapRatePerKg] = useState(20); // ₹ 20/kg scrap value

  const [recordNotes, setRecordNotes] = useState('');

  // Helper to open 'Start Production' for a specific punched job/order
  const handleStartProductionForOrder = (ord) => {
    setSelectedOrder(ord);
    setSelectedRecord(null);
    if (ord.materialRequirements && ord.materialRequirements.length > 0) {
      const mappedList = ord.materialRequirements.map((req, idx) => ({
        id: String(idx + 1),
        filmType: req.filmType,
        micron: req.micron,
        widthMm: req.widthMm,
        barcode: '', // Empty by default
        issueQtyKg: Math.round(req.qtyKg * 1.05),
        returnQtyKg: 0, // Default Unused Return is 0
        unitPricePerKg: DEFAULT_DAILY_RATES[req.filmType] || 120
      }));
      setMaterialsList(mappedList);
    } else {
      setMaterialsList(DEFAULT_6_INGREDIENTS);
    }
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
        barcode: '', // Empty by default
        issueQtyKg: 100,
        returnQtyKg: 0, // Default Unused Return is 0
        unitPricePerKg: 125
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

  // Calculations
  const calculatedMaterials = materialsList.map(m => {
    const issued = parseFloat(m.issueQtyKg) || 0;
    const returned = parseFloat(m.returnQtyKg) || 0;
    const netConsumed = Math.max(0, issued - returned);
    const rate = parseFloat(m.unitPricePerKg) || 0;
    const cost = netConsumed * rate;
    return {
      ...m,
      netConsumedQtyKg: netConsumed,
      totalMaterialCost: cost
    };
  });

  const totalNetQtyKg = calculatedMaterials.reduce((sum, m) => sum + m.netConsumedQtyKg, 0);
  const totalMaterialCostRs = calculatedMaterials.reduce((sum, m) => sum + m.totalMaterialCost, 0);
  
  // Total Processing Cost = Total Qty Produced x Processing Cost Per Kg
  const totalProcessingCostRs = totalNetQtyKg * (parseFloat(processingCostPerKg) || 0);

  // Total Scrap Weight = Printing Plain Setting + Printing Wastage + Lamination Plain Substrate + Laminate Wastage + Trim Wastage
  const totalScrapQtyKg = (parseFloat(printingPlainSettingWastageKg) || 0) +
                         (parseFloat(printingWastageKg) || 0) +
                         (parseFloat(laminationPlainSubstrateWastageKg) || 0) +
                         (parseFloat(laminateWastageKg) || 0) +
                         (parseFloat(trimWastageKg) || 0);
  const totalScrapCostRs = totalScrapQtyKg * (parseFloat(scrapRatePerKg) || 0);

  // Formula: (Total Qty produced x Default Processing Cost) + (Total Cost of Ingredients) + Scrap = Total Cost of Production
  const finalProductionCostRs = totalProcessingCostRs + totalMaterialCostRs + totalScrapCostRs;

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
      totalProductionQtyKg: totalNetQtyKg,
      totalMaterialCostRs: totalMaterialCostRs,
      processingCostPerKg: parseFloat(processingCostPerKg) || 25,
      totalProcessingCostRs: totalProcessingCostRs,
      printingPlainSettingWastageKg: parseFloat(printingPlainSettingWastageKg) || 0,
      printingWastageKg: parseFloat(printingWastageKg) || 0,
      laminationPlainSubstrateWastageKg: parseFloat(laminationPlainSubstrateWastageKg) || 0,
      laminateWastageKg: parseFloat(laminateWastageKg) || 0,
      trimWastageKg: parseFloat(trimWastageKg) || 0,
      totalScrapQtyKg: totalScrapQtyKg,
      scrapRatePerKg: parseFloat(scrapRatePerKg) || 0,
      totalScrapCostRs: totalScrapCostRs,
      finalProductionCostRs: finalProductionCostRs,
      status: "Filled by Plant Manager",
      filledBy: `${currentUser.name} (${currentUser.role})`,
      approvedBy: "",
      approvalDate: "",
      notes: recordNotes
    };

    if (onSaveProductionRecord) onSaveProductionRecord(newRecord);
    setIsConfirmModalOpen(false);
    alert(`🎉 Production Record for "${selectedOrder.jobName}" saved & submitted for Admin Approval!\n\nAvailable stock and roll balance for scanned barcodes updated successfully.`);
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
                          <code>{ord.structure || 'PET / METPET / LDPE'}</code>
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
                  <th>Final Production Cost (₹)</th>
                  <th>Approval Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textCenter: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No production records found. Click "Fill New Production Record" to create one.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(rec => (
                    <tr key={rec.id}>
                      <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{rec.orderId}</td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{rec.jobName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rec.clientName} • <span style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{rec.jobMasterId || 'JM-2026-089'}</span></div>
                      </td>
                      <td>{rec.dateFilled}</td>
                      <td style={{ fontWeight: '600' }}>{rec.totalProductionQtyKg.toLocaleString()} kg</td>
                      <td>₹ {rec.totalMaterialCostRs.toLocaleString()}</td>
                      <td style={{ fontWeight: '700', color: '#047857' }}>₹ {rec.finalProductionCostRs.toLocaleString()}</td>
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
                  ))
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

          {/* Summary Calculation Footer Card */}
          <div className="glass-card" style={{ background: '#f8fafc', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', padding: '20px' }}>
            <div>
              <span className="stats-title">Total Material Issued / Consumed</span>
              <div style={{ fontSize: '1.4rem', fontWeight: '800', marginTop: '4px' }}>
                {selectedRecord.totalProductionQtyKg.toLocaleString()} <span style={{ fontSize: '0.9rem' }}>kg</span>
              </div>
            </div>

            <div>
              <span className="stats-title">Total Ingredients Cost</span>
              <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>
                ₹ {selectedRecord.totalMaterialCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div style={{ borderLeft: '2px solid #cbd5e1', paddingLeft: '20px' }}>
              <span className="stats-title" style={{ color: '#047857' }}>FINAL COST OF PRODUCTION</span>
              <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#047857', marginTop: '4px' }}>
                ₹ {selectedRecord.finalProductionCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: FILL NEW PRODUCTION RECORD (PLANT MANAGER) */}
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
                📦 Ingredient Materials Issued & Returned List
              </h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Select raw material from inventory dropdown or scan roll barcode to auto-populate rate, width, micron, and roll quantity.
              </p>
            </div>
            <button type="button" className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem' }} onClick={addMaterialRow}>
              <Plus size={14} /> Add Raw Material Row
            </button>
          </div>

          <table className="data-table" style={{ marginBottom: '24px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ minWidth: '200px' }}>Raw Material / Ingredient</th>
                <th style={{ minWidth: '180px' }}>Barcode / Roll ID (Scan 📷)</th>
                <th style={{ width: '75px' }}>Micron</th>
                <th style={{ width: '85px' }}>Width (mm)</th>
                <th style={{ width: '110px' }}>Issued Roll Qty (kg)</th>
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
                    {/* Searchable / Select Dropdown for Raw Material */}
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
                    </td>

                    {/* Barcode Scanner / Picker (Auto-populates Rate, Width, Micron, Issued Qty, Sets Unused Return to 0) */}
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
                                updateMaterialRow(m.id, 'returnQtyKg', 0); // Default Unused Return is 0
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

                    <td style={{ width: '75px' }}>
                      <input 
                        type="text" 
                        className="form-control"
                        value={m.micron}
                        onChange={e => updateMaterialRow(m.id, 'micron', e.target.value)}
                      />
                    </td>

                    <td style={{ width: '85px' }}>
                      <input 
                        type="text" 
                        className="form-control"
                        value={m.widthMm}
                        onChange={e => updateMaterialRow(m.id, 'widthMm', e.target.value)}
                      />
                    </td>

                    <td style={{ width: '110px' }}>
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

                    <td style={{ width: '110px' }}>
                      <input 
                        type="number" 
                        step="0.1"
                        className="form-control"
                        style={{ fontWeight: '600', color: isPartialReturn ? '#dc2626' : 'var(--text-muted)' }}
                        value={m.returnQtyKg}
                        onChange={e => updateMaterialRow(m.id, 'returnQtyKg', e.target.value)}
                      />
                    </td>

                    {/* Net Consumed & Roll Return Status Badge */}
                    <td>
                      <div style={{ fontWeight: '800', color: '#047857', fontSize: '0.9rem' }}>
                        {m.netConsumedQtyKg} kg
                      </div>
                      {isPartialReturn ? (
                        <span className="badge badge-warning" style={{ fontSize: '0.68rem', padding: '1px 5px', marginTop: '3px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                          📦 {m.returnQtyKg} kg returned to store
                        </span>
                      ) : (
                        <span className="badge badge-us" style={{ fontSize: '0.68rem', padding: '1px 5px', marginTop: '3px' }}>
                          Default Return: 0 kg
                        </span>
                      )}
                    </td>

                    <td style={{ width: '110px' }}>
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

          {/* SCRAP & WASTAGE BREAKDOWN SECTION */}
          <div className="glass-card" style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '20px', marginBottom: '24px' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#b45309', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ♻️ Production Scrap & Wastage Breakdown (in Kg)
            </h4>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#78350f' }}>
                  Printing Plain Setting (kg)
                </label>
                <input 
                  type="number" 
                  step="0.1"
                  className="form-control"
                  style={{ marginTop: '4px', background: '#ffffff' }}
                  value={printingPlainSettingWastageKg}
                  onChange={e => setPrintingPlainSettingWastageKg(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#78350f' }}>
                  Printing Wastage (kg)
                </label>
                <input 
                  type="number" 
                  step="0.1"
                  className="form-control"
                  style={{ marginTop: '4px', background: '#ffffff' }}
                  value={printingWastageKg}
                  onChange={e => setPrintingWastageKg(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#78350f' }}>
                  Lamination Plain Substrate (kg)
                </label>
                <input 
                  type="number" 
                  step="0.1"
                  className="form-control"
                  style={{ marginTop: '4px', background: '#ffffff' }}
                  value={laminationPlainSubstrateWastageKg}
                  onChange={e => setLaminationPlainSubstrateWastageKg(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#78350f' }}>
                  Laminate Wastage (kg)
                </label>
                <input 
                  type="number" 
                  step="0.1"
                  className="form-control"
                  style={{ marginTop: '4px', background: '#ffffff' }}
                  value={laminateWastageKg}
                  onChange={e => setLaminateWastageKg(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#78350f' }}>
                  Trim Wastage (kg)
                </label>
                <input 
                  type="number" 
                  step="0.1"
                  className="form-control"
                  style={{ marginTop: '4px', background: '#ffffff' }}
                  value={trimWastageKg}
                  onChange={e => setTrimWastageKg(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#78350f' }}>
                  Scrap Rate (₹ / kg)
                </label>
                <input 
                  type="number" 
                  step="0.1"
                  className="form-control"
                  style={{ marginTop: '4px', background: '#ffffff', fontWeight: '700' }}
                  value={scrapRatePerKg}
                  onChange={e => setScrapRatePerKg(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #fcd34d', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#92400e' }}>
              <div>Total Scrap Qty: <strong>{totalScrapQtyKg.toFixed(1)} kg</strong></div>
              <div>Total Scrap Cost: <strong>₹ {totalScrapCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
            </div>
          </div>

          {/* Cost Summary Box with Formula */}
          <div className="glass-card" style={{ background: '#f8fafc', padding: '24px', marginBottom: '24px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--primary-brand)', marginBottom: '16px' }}>
              📐 COST OF PRODUCTION FORMULA: (Total Qty Produced × Processing Cost Rate) + (Ingredients Cost) + (Scrap Cost)
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
              <div>
                <span className="stats-title">Total Net Qty Produced</span>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', marginTop: '4px' }}>
                  {totalNetQtyKg.toLocaleString()} <span style={{ fontSize: '0.85rem' }}>kg</span>
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
                  Cost: ₹ {totalProcessingCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
          <div className="glass-card modal-content" style={{ width: '680px', maxWidth: '95vw', padding: '28px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '800', marginBottom: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileSpreadsheet style={{ color: 'var(--primary-brand)' }} /> Confirm Job Production Record Submission
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Please review the final costing, material consumption, and inventory roll returns before submitting for Admin approval.
            </p>

            {/* Job & Client Meta Header */}
            <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '0.85rem' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Job ID / Order:</span> <strong style={{ color: 'var(--primary-brand)' }}>{selectedOrder?.id}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Job Name:</span> <strong>{selectedOrder?.jobName}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Customer / Client:</span> <strong>{selectedOrder?.clientName}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Recorded By:</span> <strong>{currentUser.name} ({currentUser.role})</strong></div>
            </div>

            {/* Itemized Material Usage Preview */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                📦 Consumed Materials & Roll Return Summary ({calculatedMaterials.length} Lines)
              </h4>
              <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                <table className="data-table" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th>Material</th>
                      <th>Barcode Tag</th>
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
                        <td><code>{m.barcode || 'Standard Stock'}</code></td>
                        <td>{m.issueQtyKg} kg</td>
                        <td style={{ color: (parseFloat(m.returnQtyKg) || 0) > 0 ? '#047857' : 'inherit', fontWeight: '600' }}>
                          {m.returnQtyKg || 0} kg
                        </td>
                        <td style={{ fontWeight: '700' }}>{m.netConsumedQtyKg} kg</td>
                        <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>₹ {m.totalMaterialCost.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Costing Summary Box */}
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '16px 20px', borderRadius: '10px', marginBottom: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.85rem', marginBottom: '12px' }}>
                <div>Net Produced Qty: <strong>{totalNetQtyKg.toLocaleString()} kg</strong></div>
                <div>Total Ingredients Cost: <strong>₹ {totalMaterialCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                <div>Processing Cost (₹ {processingCostPerKg}/kg): <strong>₹ {totalProcessingCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                <div>Scrap & Wastage ({totalScrapQtyKg.toFixed(1)} kg): <strong>₹ {totalScrapCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
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
    </div>
  );
}
