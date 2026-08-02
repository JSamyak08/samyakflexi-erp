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
  Printer
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

  const [activeTab, setActiveTab] = useState('list'); // 'list' or 'new_record'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Form State for creating/editing a Production Record
  const [selectedOrder, setSelectedOrder] = useState(orders[0] || null);
  const [materialsList, setMaterialsList] = useState([
    { id: '1', filmType: 'PET', micron: 12, widthMm: 1000, issueQtyKg: 400, returnQtyKg: 14.5, unitPricePerKg: 125 },
    { id: '2', filmType: 'METPET', micron: 12, widthMm: 1000, issueQtyKg: 400, returnQtyKg: 12.0, unitPricePerKg: 140 },
    { id: '3', filmType: 'Natural LD GP Film', micron: 35, widthMm: 1005, issueQtyKg: 850, returnQtyKg: 40.0, unitPricePerKg: 115 },
    { id: '4', filmType: 'Liquid Inks & Solvents', micron: '-', widthMm: '-', issueQtyKg: 55, returnQtyKg: 3.0, unitPricePerKg: 1500 },
    { id: '5', filmType: 'Solvent-less Adhesive', micron: '-', widthMm: '-', issueQtyKg: 48, returnQtyKg: 1.5, unitPricePerKg: 270 }
  ]);
  const [processingCostRs, setProcessingCostRs] = useState(45000);
  const [recordNotes, setRecordNotes] = useState('');

  // Helper to open order details for new record
  const handleSelectOrderForRecord = (orderId) => {
    const ord = orders.find(o => o.id === orderId);
    if (ord) {
      setSelectedOrder(ord);
      if (ord.materialRequirements && ord.materialRequirements.length > 0) {
        const mappedList = ord.materialRequirements.map((req, idx) => ({
          id: String(idx + 1),
          filmType: req.filmType,
          micron: req.micron,
          widthMm: req.widthMm,
          issueQtyKg: Math.round(req.qtyKg * 1.05),
          returnQtyKg: Math.round(req.qtyKg * 0.05),
          unitPricePerKg: DEFAULT_DAILY_RATES[req.filmType] || 120
        }));
        setMaterialsList(mappedList);
      }
    }
  };

  const addMaterialRow = () => {
    setMaterialsList(prev => [
      ...prev,
      {
        id: String(Date.now()),
        filmType: 'PET',
        micron: 12,
        widthMm: 1000,
        issueQtyKg: 100,
        returnQtyKg: 0,
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
  const finalProductionCostRs = totalMaterialCostRs + (parseFloat(processingCostRs) || 0);

  // Save / Fill by Plant Manager
  const handleSubmitRecord = (e) => {
    e.preventDefault();

    if (!selectedOrder) {
      alert('Please select an order for this Production Record.');
      return;
    }

    const newRecord = {
      id: `REC-${Date.now()}`,
      orderId: selectedOrder.id,
      jobName: selectedOrder.jobName,
      clientName: selectedOrder.clientName,
      dateFilled: new Date().toISOString().split('T')[0],
      materialsList: calculatedMaterials,
      totalProductionQtyKg: totalNetQtyKg,
      totalMaterialCostRs: totalMaterialCostRs,
      processingCostRs: parseFloat(processingCostRs) || 0,
      finalProductionCostRs: finalProductionCostRs,
      status: "Filled by Plant Manager",
      filledBy: `${currentUser.name} (${currentUser.role})`,
      approvedBy: "",
      approvalDate: "",
      notes: recordNotes
    };

    if (onSaveProductionRecord) onSaveProductionRecord(newRecord);
    alert(`Production Record for "${selectedOrder.jobName}" saved & submitted for Admin Approval!`);
    setActiveTab('list');
  };

  const filteredRecords = productionRecords.filter(r => {
    const matchesSearch = r.jobName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          r.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || r.status === filterStatus;
    return matchesSearch && matchesFilter;
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
            Record material issue & returns, ingredients price, and final cost of production. Required prior to job completion.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className={`tab-pill ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => { setActiveTab('list'); setSelectedRecord(null); }}
          >
            Production Records ({productionRecords.length})
          </button>

          {isPlantManager && (
            <button 
              className="btn-primary"
              onClick={() => { setSelectedOrder(orders[0] || null); setActiveTab('new_record'); setSelectedRecord(null); }}
            >
              <Plus size={16} /> Fill New Production Record
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: PRODUCTION RECORDS LIST */}
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
        <form onSubmit={handleSubmitRecord} className="glass-panel" style={{ padding: '28px' }}>
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
            <h4 style={{ fontSize: '1rem', fontWeight: '700' }}>Ingredient Materials Issued & Returned List</h4>
            <button type="button" className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.8rem' }} onClick={addMaterialRow}>
              <Plus size={14} /> Add Ingredient Row
            </button>
          </div>

          <table className="data-table" style={{ marginBottom: '24px' }}>
            <thead>
              <tr>
                <th>Raw Material / Ingredient</th>
                <th>Micron</th>
                <th>Width (mm)</th>
                <th>Issued (kg)</th>
                <th>Returned (kg)</th>
                <th>Net Consumed (kg)</th>
                <th>Unit Rate (₹/kg)</th>
                <th>Total Cost (₹)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {calculatedMaterials.map((m) => (
                <tr key={m.id}>
                  <td>
                    <input 
                      type="text" 
                      className="form-control"
                      value={m.filmType}
                      onChange={e => updateMaterialRow(m.id, 'filmType', e.target.value)}
                      required
                    />
                  </td>
                  <td style={{ width: '80px' }}>
                    <input 
                      type="text" 
                      className="form-control"
                      value={m.micron}
                      onChange={e => updateMaterialRow(m.id, 'micron', e.target.value)}
                    />
                  </td>
                  <td style={{ width: '90px' }}>
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
                      className="form-control"
                      value={m.issueQtyKg}
                      onChange={e => updateMaterialRow(m.id, 'issueQtyKg', e.target.value)}
                      required
                    />
                  </td>
                  <td style={{ width: '110px' }}>
                    <input 
                      type="number" 
                      className="form-control"
                      value={m.returnQtyKg}
                      onChange={e => updateMaterialRow(m.id, 'returnQtyKg', e.target.value)}
                    />
                  </td>
                  <td style={{ fontWeight: '700' }}>
                    {m.netConsumedQtyKg} kg
                  </td>
                  <td style={{ width: '120px' }}>
                    <input 
                      type="number" 
                      className="form-control"
                      value={m.unitPricePerKg}
                      onChange={e => updateMaterialRow(m.id, 'unitPricePerKg', e.target.value)}
                      required
                    />
                  </td>
                  <td style={{ fontWeight: '700' }}>
                    ₹ {m.totalMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    <button type="button" className="icon-btn-danger" onClick={() => removeMaterialRow(m.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Cost Summary Box */}
          <div className="glass-card" style={{ background: '#f8fafc', padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
              <div>
                <span className="stats-title">Total Ingredients Cost</span>
                <div style={{ fontSize: '1.4rem', fontWeight: '800' }}>
                  ₹ {totalMaterialCostRs.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Processing & Lamination Cost (₹)
                </label>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{ marginTop: '4px', fontSize: '1.1rem', fontWeight: '700' }}
                  value={processingCostRs}
                  onChange={e => setProcessingCostRs(e.target.value)}
                />
              </div>

              <div style={{ borderLeft: '2px solid #cbd5e1', paddingLeft: '20px' }}>
                <span className="stats-title" style={{ color: '#047857' }}>FINAL COST OF PRODUCTION</span>
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
            <button type="submit" className="btn-primary">
              <CheckCircle2 size={16} /> Submit Record for Admin Approval
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
