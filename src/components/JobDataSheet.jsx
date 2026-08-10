import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  Printer, 
  Layers,
  Sparkles,
  ShieldCheck,
  Calendar,
  Search,
  Trash2,
  Edit3,
  Plus,
  Eye,
  ListFilter,
  FileText
} from 'lucide-react';
import { calculatePreVsPostCosting } from '../factoryStore';
import { formatINR } from '../utils/pdfHelpers';
import JobDataSheetPDF from './JobDataSheetPDF';
import { getNextDocRefNumber, generateDocRefNumber } from '../services/settingsService';

export default function JobDataSheet({ 
  orders = [], 
  jobDataSheets = [],
  currentUser, 
  onSaveJobDataSheet,
  onDeleteJobDataSheet 
}) {
  const isAdmin = currentUser?.role === 'Admin';
  const isAuthorizedToViewProfit = isAdmin || currentUser?.role === 'Plant Manager';

  const [activeTab, setActiveTab] = useState('records'); // 'records', 'form'
  const [selectedJobId, setSelectedJobId] = useState((orders || [])[0]?.id || '');
  const [sellingPricePerKg, setSellingPricePerKg] = useState(245);
  
  // Form state
  const [editingSheetId, setEditingSheetId] = useState(null);
  const [actualInkKg, setActualInkKg] = useState(52.0);
  const [actualSolventsKg, setActualSolventsKg] = useState(18.5);
  const [actualAdhesiveKg, setActualAdhesiveKg] = useState(46.5);
  const [actualScrapKg, setActualScrapKg] = useState(125.0);
  const [operatorNotes, setOperatorNotes] = useState('Smooth production run on Rotogravure Line 2.');
  const [layerActualKgs, setLayerActualKgs] = useState({});

  // Filter States for Saved Records Table
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datePreset, setDatePreset] = useState('all'); // 'all', 'today', 'week', 'month'

  // PDF Preview State
  const [previewPdfSheet, setPreviewPdfSheet] = useState(null);

  const selectedOrder = orders.find(o => o.id === selectedJobId) || orders[0] || {};
  const preCostingDetails = selectedOrder?.calculationDetails || {};

  // Compute live Pre vs Post Costing variance & profitability
  const preVsPost = calculatePreVsPostCosting(preCostingDetails, {
    sellingPricePerKg,
    actualFilmConsumedKg: layerActualKgs,
    actualInkConsumedKg: actualInkKg,
    actualSolventsConsumedKg: actualSolventsKg,
    actualAdhesiveConsumedKg: actualAdhesiveKg
  });

  const handleSaveDataSheet = (e) => {
    e.preventDefault();

    const sheetId = editingSheetId || getNextDocRefNumber('jds');

    const newSheet = {
      id: sheetId,
      jobId: selectedJobId || selectedOrder.id || 'ORD-001',
      jobName: selectedOrder.jobName || 'Standard Flexible Packaging Job',
      clientName: selectedOrder.clientName || 'Valued Client',
      sellingPricePerKg: parseFloat(sellingPricePerKg) || 0,
      preCostPerKg: parseFloat(preVsPost.preCostPerKg) || 185.50,
      postCostPerKg: parseFloat(preVsPost.postCostPerKg) || 189.20,
      profitMarginPct: parseFloat(preVsPost.netProfitMarginPct) || 22.5,
      completionDate: new Date().toISOString().split('T')[0],
      actualFilmConsumedKg: layerActualKgs,
      actualInkConsumedKg: parseFloat(actualInkKg) || 0,
      actualSolventsConsumedKg: parseFloat(actualSolventsKg) || 0,
      actualAdhesiveConsumedKg: parseFloat(actualAdhesiveKg) || 0,
      actualScrapWastageKg: parseFloat(actualScrapKg) || 0,
      operatorNotes,
      createdBy: currentUser?.name || 'Plant Manager'
    };

    if (onSaveJobDataSheet) {
      onSaveJobDataSheet(newSheet);
    }

    alert(`Job Data Sheet "${sheetId}" saved successfully!`);
    setEditingSheetId(null);
    setActiveTab('records');
  };

  const handleEditSheet = (sheet) => {
    if (!isAdmin) {
      alert("Only Administrators are permitted to edit Job Data Sheet records.");
      return;
    }

    setEditingSheetId(sheet.id);
    setSelectedJobId(sheet.jobId);
    setSellingPricePerKg(sheet.sellingPricePerKg || 245);
    setActualInkKg(sheet.actualInkConsumedKg || 52);
    setActualSolventsKg(sheet.actualSolventsConsumedKg || 18.5);
    setActualAdhesiveKg(sheet.actualAdhesiveConsumedKg || 46.5);
    setActualScrapKg(sheet.actualScrapWastageKg || 125);
    setOperatorNotes(sheet.operatorNotes || '');
    setActiveTab('form');
  };

  const handleDeleteSheet = (sheetId) => {
    if (!isAdmin) {
      alert("Only Administrators are permitted to delete Job Data Sheet records.");
      return;
    }

    if (window.confirm(`Are you sure you want to delete Job Data Sheet record ${sheetId}?`)) {
      if (onDeleteJobDataSheet) {
        onDeleteJobDataSheet(sheetId);
      }
    }
  };

  // Date Filter Quick Presets
  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      const pastWeek = new Date(today);
      pastWeek.setDate(today.getDate() - 7);
      setStartDate(pastWeek.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'month') {
      const pastMonth = new Date(today);
      pastMonth.setDate(1);
      setStartDate(pastMonth.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  // Filtered Job Data Sheets
  const filteredSheets = jobDataSheets.filter(sheet => {
    // Search query match
    const query = searchTerm.toLowerCase().trim();
    const matchesQuery = !query || 
      sheet.id?.toLowerCase().includes(query) ||
      sheet.jobName?.toLowerCase().includes(query) ||
      sheet.clientName?.toLowerCase().includes(query) ||
      sheet.jobId?.toLowerCase().includes(query);

    // Date range match
    const sheetDate = sheet.completionDate;
    const matchesStartDate = !startDate || (sheetDate && sheetDate >= startDate);
    const matchesEndDate = !endDate || (sheetDate && sheetDate <= endDate);

    return matchesQuery && matchesStartDate && matchesEndDate;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* PDF Modal */}
      {previewPdfSheet && (
        <JobDataSheetPDF sheetData={previewPdfSheet} onClose={() => setPreviewPdfSheet(null)} />
      )}

      <div className="hide-on-print" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileSpreadsheet size={22} style={{ color: 'var(--primary-brand)' }} /> Job Data Sheet & Actual Consumption Records
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
              Store, filter, print, and audit shop floor actual consumption sheets & Pre vs Post costing profitability.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: isAuthorizedToViewProfit ? '#ecfdf5' : '#fffbeb', border: `1px solid ${isAuthorizedToViewProfit ? '#a7f3d0' : '#fde68a'}`, padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', color: isAuthorizedToViewProfit ? '#047857' : '#b45309' }}>
              {isAuthorizedToViewProfit ? <ShieldCheck size={16} /> : <Lock size={16} />}
              Role: <b>{currentUser?.role || 'Guest'}</b> ({isAdmin ? 'Full Admin Access' : 'View Only'})
            </div>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <button
            onClick={() => setActiveTab('records')}
            className={`btn-secondary ${activeTab === 'records' ? 'btn-primary' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <FileText size={16} /> Saved Records Table ({jobDataSheets.length})
          </button>
          
          <button
            onClick={() => {
              setEditingSheetId(null);
              setActiveTab('form');
            }}
            className={`btn-secondary ${activeTab === 'form' ? 'btn-primary' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Plus size={16} /> Record New Job Data Sheet
          </button>
        </div>
      </div>

      {/* VIEW 1: SAVED RECORDS TABLE & DATE FILTERS */}
      {activeTab === 'records' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="glass-card stats-card">
              <span className="stats-title">Total Records</span>
              <span className="stats-value">{jobDataSheets.length}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Saved Job Data Sheets</span>
            </div>

            <div className="glass-card stats-card">
              <span className="stats-title">Avg Selling Price</span>
              <span className="stats-value" style={{ color: 'var(--primary-brand)' }}>
                ₹{(jobDataSheets.reduce((a, b) => a + (b.sellingPricePerKg || 0), 0) / (jobDataSheets.length || 1)).toFixed(2)}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>per kg</span>
            </div>

            <div className="glass-card stats-card">
              <span className="stats-title">Avg Post-Cost</span>
              <span className="stats-value" style={{ color: '#d97706' }}>
                ₹{(jobDataSheets.reduce((a, b) => a + (b.postCostPerKg || 0), 0) / (jobDataSheets.length || 1)).toFixed(2)}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Actual Shop Floor Cost</span>
            </div>

            <div className="glass-card stats-card">
              <span className="stats-title">Avg Profitability</span>
              <span className="stats-value" style={{ color: '#059669' }}>
                {(jobDataSheets.reduce((a, b) => a + (b.profitMarginPct || 0), 0) / (jobDataSheets.length || 1)).toFixed(1)}%
              </span>
              <span style={{ fontSize: '0.78rem', color: '#059669' }}>Net Profit Margin</span>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: '260px' }}>
                <Search size={18} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search by Job Name, Client, or Sheet Ref ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-control"
                  style={{ width: '100%' }}
                />
              </div>

              {/* Date Presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button 
                  className={`btn-secondary ${datePreset === 'all' ? 'btn-primary' : ''}`}
                  onClick={() => applyDatePreset('all')}
                  style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                >
                  All Time
                </button>
                <button 
                  className={`btn-secondary ${datePreset === 'today' ? 'btn-primary' : ''}`}
                  onClick={() => applyDatePreset('today')}
                  style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                >
                  Today
                </button>
                <button 
                  className={`btn-secondary ${datePreset === 'week' ? 'btn-primary' : ''}`}
                  onClick={() => applyDatePreset('week')}
                  style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                >
                  Last 7 Days
                </button>
                <button 
                  className={`btn-secondary ${datePreset === 'month' ? 'btn-primary' : ''}`}
                  onClick={() => applyDatePreset('month')}
                  style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                >
                  This Month
                </button>
              </div>
            </div>

            {/* Custom Date Range Selectors */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <Calendar size={16} /> <span>From Date:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    setStartDate(e.target.value);
                  }}
                  className="form-control"
                  style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <Calendar size={16} /> <span>To Date:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    setEndDate(e.target.value);
                  }}
                  className="form-control"
                  style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                />
              </div>

              {(startDate || endDate || searchTerm) && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStartDate('');
                    setEndDate('');
                    setDatePreset('all');
                  }}
                  style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '0.78rem', cursor: 'pointer', marginLeft: 'auto', fontWeight: 'bold' }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sheet Ref ID</th>
                    <th>Date</th>
                    <th>Job Name</th>
                    <th>Client Name</th>
                    <th>Selling Price</th>
                    <th>Pre Cost/kg</th>
                    <th>Post Cost/kg</th>
                    <th>Profit Margin</th>
                    <th>Recorded By</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSheets.length > 0 ? (
                    filteredSheets.map(sheet => (
                      <tr key={sheet.id}>
                        <td style={{ fontWeight: '700', color: 'var(--primary-brand)' }}>{sheet.id}</td>
                        <td>{sheet.completionDate || '2026-07-24'}</td>
                        <td style={{ fontWeight: '600' }}>{sheet.jobName}</td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{sheet.clientName}</td>
                        <td style={{ fontWeight: '600' }}>₹{sheet.sellingPricePerKg}/kg</td>
                        <td style={{ color: '#2563eb' }}>₹{sheet.preCostPerKg}</td>
                        <td style={{ color: sheet.postCostPerKg > sheet.preCostPerKg ? '#dc2626' : '#059669', fontWeight: 'bold' }}>
                          ₹{sheet.postCostPerKg}
                        </td>
                        <td>
                          <span className="badge badge-us" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                            {sheet.profitMarginPct}%
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{sheet.createdBy || 'Plant Manager'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => setPreviewPdfSheet(sheet)}
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                              title="View & Print Formal Job Data Sheet PDF"
                            >
                              <Printer size={14} /> PDF
                            </button>

                            <button
                              onClick={() => handleEditSheet(sheet)}
                              disabled={!isAdmin}
                              className="btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', opacity: isAdmin ? 1 : 0.4 }}
                              title={isAdmin ? "Edit Sheet Record" : "Admin Only: Edit restricted"}
                            >
                              <Edit3 size={14} /> Edit
                            </button>

                            <button
                              onClick={() => handleDeleteSheet(sheet.id)}
                              disabled={!isAdmin}
                              style={{ background: 'none', border: '1px solid #fecaca', color: '#dc2626', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', cursor: isAdmin ? 'pointer' : 'not-allowed', opacity: isAdmin ? 1 : 0.4 }}
                              title={isAdmin ? "Delete Sheet Record" : "Admin Only: Delete restricted"}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        No Job Data Sheet records match the selected date filters or search query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* VIEW 2: RECORD / EDIT FORM */}
      {activeTab === 'form' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Left Side: Shop Floor Actual Consumption Form */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} style={{ color: 'var(--primary-brand)' }} />
              {editingSheetId ? `Edit Job Data Sheet (${editingSheetId})` : 'Record Shop Floor Actual Consumption'}
            </h3>

            <form onSubmit={handleSaveDataSheet} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Select Job Order</label>
                <select 
                  className="form-control"
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                >
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.id} - {o.jobName} ({o.clientName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Actual Agreed Selling Price (₹ / kg)</label>
                <input 
                  type="number"
                  step="0.1"
                  className="form-control"
                  value={sellingPricePerKg}
                  onChange={(e) => setSellingPricePerKg(e.target.value)}
                />
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Actual Inks, Solvents & Adhesives Consumed (kg)
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Total Ink (kg)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control"
                      value={actualInkKg}
                      onChange={(e) => setActualInkKg(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Total Solvents (kg)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control"
                      value={actualSolventsKg}
                      onChange={(e) => setActualSolventsKg(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Total Adhesive System (kg)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control"
                      value={actualAdhesiveKg}
                      onChange={(e) => setActualAdhesiveKg(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Total Process Scrap (kg)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      className="form-control"
                      value={actualScrapKg}
                      onChange={(e) => setActualScrapKg(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Shop Floor Operator Remarks & QC Observations</label>
                <textarea 
                  rows="3"
                  className="form-control"
                  value={operatorNotes}
                  onChange={(e) => setOperatorNotes(e.target.value)}
                ></textarea>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '10px' }}>
                  <CheckCircle2 size={18} /> {editingSheetId ? 'Update Data Sheet' : 'Save Actual Job Data Sheet'}
                </button>
                {editingSheetId && (
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={() => {
                      setEditingSheetId(null);
                      setActiveTab('records');
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Right Side: Pre vs Post Costing Live Variance Analytics */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} style={{ color: '#059669' }} /> Live Pre vs Post Costing & Margin Analytics
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pre-Costing Target / kg</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--primary-brand)', marginTop: '4px' }}>
                    {formatINR(preVsPost.preCostPerKg)}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Actual Post-Cost / kg</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: preVsPost.postCostPerKg > preVsPost.preCostPerKg ? '#dc2626' : '#059669', marginTop: '4px' }}>
                    {formatINR(preVsPost.postCostPerKg)}
                  </div>
                </div>
              </div>

              {isAuthorizedToViewProfit ? (
                <div style={{ background: '#ecfdf5', padding: '16px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.85rem', color: '#047857', fontWeight: '600' }}>Actual Net Profit Margin</span>
                      <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#047857', marginTop: '2px' }}>
                        {preVsPost.netProfitMarginPct}%
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.85rem', color: '#047857', fontWeight: '600' }}>Total Net Margin</span>
                      <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#047857', marginTop: '2px' }}>
                        {formatINR(preVsPost.totalProfitMarginRs)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '8px', border: '1px solid #fde68a', textAlign: 'center', color: '#b45309', fontSize: '0.85rem' }}>
                  <Lock size={18} style={{ marginBottom: '4px' }} />
                  <div>Profit Margin analytics restricted to Admin & Plant Manager roles.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
