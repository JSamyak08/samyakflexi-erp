import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  Filter, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Percent,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Inbox
} from 'lucide-react';
import TablePagination, { usePagination } from './TablePagination';

const MONTHS = [
  'All Months',
  'April', 'May', 'June', 'July', 'August', 'September', 
  'October', 'November', 'December', 'January', 'February', 'March'
];

const FINANCIAL_YEARS = [
  'FY 2025-26',
  'FY 2026-27',
  'FY 2027-28'
];

export default function ScrapWastageAnalysis({ productionRecords = [], orders = [] }) {
  const [selectedFY, setSelectedFY] = useState('FY 2026-27');
  const [selectedMonth, setSelectedMonth] = useState('All Months');
  const [startDate, setStartDate] = useState('2026-04-01');
  const [endDate, setEndDate] = useState('2027-03-31');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALERTS_ONLY'); // 'ALERTS_ONLY', 'ALL_RECORDS'

  // Sync date range inputs when Month or Financial Year changes
  const handleMonthChange = (month) => {
    setSelectedMonth(month);
    const fyStartYear = parseInt(selectedFY.split(' ')[1].split('-')[0], 10);
    
    if (month === 'All Months') {
      setStartDate(`${fyStartYear}-04-01`);
      setEndDate(`${fyStartYear + 1}-03-31`);
      return;
    }

    const monthMap = {
      'January': { m: 0, yrOffset: 1 },
      'February': { m: 1, yrOffset: 1 },
      'March': { m: 2, yrOffset: 1 },
      'April': { m: 3, yrOffset: 0 },
      'May': { m: 4, yrOffset: 0 },
      'June': { m: 5, yrOffset: 0 },
      'July': { m: 6, yrOffset: 0 },
      'August': { m: 7, yrOffset: 0 },
      'September': { m: 8, yrOffset: 0 },
      'October': { m: 9, yrOffset: 0 },
      'November': { m: 10, yrOffset: 0 },
      'December': { m: 11, yrOffset: 0 }
    };

    const { m, yrOffset } = monthMap[month];
    const targetYear = fyStartYear + yrOffset;
    const lastDay = new Date(targetYear, m + 1, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');

    setStartDate(`${targetYear}-${pad(m + 1)}-01`);
    setEndDate(`${targetYear}-${pad(m + 1)}-${pad(lastDay)}`);
  };

  const handleFYChange = (fy) => {
    setSelectedFY(fy);
    const fyStartYear = parseInt(fy.split(' ')[1].split('-')[0], 10);
    
    if (selectedMonth === 'All Months') {
      setStartDate(`${fyStartYear}-04-01`);
      setEndDate(`${fyStartYear + 1}-03-31`);
      return;
    }

    handleMonthChange(selectedMonth);
  };

  const handleCustomDateChange = (type, val) => {
    setSelectedMonth('Custom Range');
    if (type === 'start') {
      setStartDate(val);
    } else {
      setEndDate(val);
    }
  };

  // Filter and process production records based on rules
  const filteredRecords = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    // End date should include the full day
    end.setHours(23, 59, 59, 999);

    return productionRecords.filter(r => {
      // Date filter
      const recordDateStr = r.recordedAt || r.dateFilled;
      if (!recordDateStr) return false;
      const recordDate = new Date(recordDateStr);
      if (isNaN(recordDate.getTime())) return false;
      
      const isInDateRange = recordDate >= start && recordDate <= end;
      if (!isInDateRange) return false;

      // Search term filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesSearch = 
          (r.jobName && r.jobName.toLowerCase().includes(q)) ||
          (r.orderId && r.orderId.toLowerCase().includes(q)) ||
          (r.operatorName && r.operatorName.toLowerCase().includes(q)) ||
          (r.id && r.id.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }

      // High scrap alerts filter (wastage >= 5%)
      const wastagePct = r.wastagePercentage ?? r.overallScrapPctOfOutput ?? r.overallScrapPctOfDispatch ?? 0;
      if (filterType === 'ALERTS_ONLY' && wastagePct < 5) {
        return false;
      }

      return true;
    });
  }, [productionRecords, startDate, endDate, searchTerm, filterType]);

  const recordsPagination = usePagination(filteredRecords, 50);

  // Aggregate statistics for the filtered records
  const stats = useMemo(() => {
    let totalGross = 0;
    let totalWastage = 0;
    let highScrapCount = 0;

    // We process ALL records within date bounds to get accurate period statistics
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const allInPeriod = productionRecords.filter(r => {
      const recordDateStr = r.recordedAt || r.dateFilled;
      if (!recordDateStr) return false;
      const recordDate = new Date(recordDateStr);
      return !isNaN(recordDate.getTime()) && recordDate >= start && recordDate <= end;
    });

    allInPeriod.forEach(r => {
      const grossKg = r.grossProductionKg || r.totalProductionQtyKg || ((r.netUsableKg || r.qtyDispatch || 0) + (r.totalWastageKg || r.totalScrapQtyKg || 0));
      const wastageKg = r.totalWastageKg || r.totalScrapQtyKg || 0;
      const wastagePct = r.wastagePercentage ?? r.overallScrapPctOfOutput ?? (grossKg > 0 ? (wastageKg / grossKg) * 100 : 0);

      totalGross += grossKg;
      totalWastage += wastageKg;
      if (wastagePct >= 5) {
        highScrapCount++;
      }
    });

    const avgScrapPct = totalGross > 0 ? (totalWastage / totalGross) * 100 : 0;

    return {
      totalGross: Math.round(totalGross),
      totalWastage: Math.round(totalWastage),
      avgScrapPct: parseFloat(avgScrapPct.toFixed(2)),
      highScrapCount,
      totalProductionRecordsCount: allInPeriod.length
    };
  }, [productionRecords, startDate, endDate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px', background: '#ffffff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
              <AlertTriangle size={22} style={{ color: '#ef4444' }} /> High Scrap & Wastage Audit Registry
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '4px' }}>
              Audits and highlights job production records exceeding the standard <strong>5.0% maximum wastage threshold</strong>. 
            </p>
          </div>
          
          <span className="badge badge-error" style={{ background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', fontSize: '0.8rem', padding: '6px 12px', fontWeight: '800' }}>
            🔴 TARGET THRESHOLD: &gt;= 5.0%
          </span>
        </div>
      </div>

      {/* KPI Stats Cards Block */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <div className="glass-card stats-card" style={{ borderLeft: '4px solid var(--accent-color)' }}>
          <span className="stats-title">Period Production</span>
          <span className="stats-value">{stats.totalGross.toLocaleString()} <span style={{ fontSize: '0.85rem' }}>kg</span></span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Gross output generated</span>
        </div>

        <div className="glass-card stats-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <span className="stats-title">Period Scrap Weight</span>
          <span className="stats-value" style={{ color: '#dc2626' }}>{stats.totalWastage.toLocaleString()} <span style={{ fontSize: '0.85rem' }}>kg</span></span>
          <span style={{ fontSize: '0.8rem', color: '#b91c1c' }}>Total accumulated process waste</span>
        </div>

        <div className="glass-card stats-card" style={{ borderLeft: '4px solid #ca8a04' }}>
          <span className="stats-title">Avg Scrap %</span>
          <span className="stats-value">{stats.avgScrapPct}%</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Average rate this period</span>
        </div>

        <div className={`glass-card stats-card ${stats.highScrapCount > 0 ? 'card-alert-highlight' : ''}`} style={{ borderLeft: '4px solid #ef4444' }}>
          <span className="stats-title" style={{ color: stats.highScrapCount > 0 ? '#dc2626' : '' }}>High Scrap Alerts</span>
          <span className="stats-value" style={stats.highScrapCount > 0 ? { color: '#dc2626' } : {}}>{stats.highScrapCount}</span>
          <span style={{ fontSize: '0.8rem', color: stats.highScrapCount > 0 ? '#b91c1c' : 'var(--text-muted)', fontWeight: '600' }}>
            {stats.highScrapCount > 0 ? '⚠️ Threshold exceeded!' : 'Within safe limits'}
          </span>
        </div>
      </div>

      {/* Filter and Selection Panel */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* Financial Year Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-secondary)' }}>Financial Year</label>
            <select 
              className="form-control" 
              style={{ width: '150px', fontWeight: '700' }} 
              value={selectedFY} 
              onChange={e => handleFYChange(e.target.value)}
            >
              {FINANCIAL_YEARS.map(fy => (
                <option key={fy} value={fy}>{fy}</option>
              ))}
            </select>
          </div>

          {/* Month Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-secondary)' }}>Period / Month Wise</label>
            <select 
              className="form-control" 
              style={{ width: '180px', fontWeight: '700' }} 
              value={selectedMonth} 
              onChange={e => handleMonthChange(e.target.value)}
            >
              {MONTHS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Custom Date Pickers */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-secondary)' }}>From Date</label>
              <input 
                type="date" 
                className="form-control" 
                style={{ width: '150px' }}
                value={startDate}
                onChange={e => handleCustomDateChange('start', e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-secondary)' }}>To Date</label>
              <input 
                type="date" 
                className="form-control" 
                style={{ width: '150px' }}
                value={endDate}
                onChange={e => handleCustomDateChange('end', e.target.value)}
              />
            </div>
          </div>

          {/* Search text input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1', minWidth: '220px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-secondary)' }}>Search Job/Order</label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                className="form-control" 
                style={{ paddingLeft: '36px' }}
                placeholder="Search job name, order ID, operator..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Tab switcher for filtered record subset */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              type="button"
              className={filterType === 'ALERTS_ONLY' ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: '0.8rem', padding: '6px 12px', background: filterType === 'ALERTS_ONLY' ? '#dc2626' : '', borderColor: filterType === 'ALERTS_ONLY' ? '#dc2626' : '' }}
              onClick={() => setFilterType('ALERTS_ONLY')}
            >
              ⚠️ High Scrap Alerts Only ({stats.highScrapCount})
            </button>
            <button 
              type="button"
              className={filterType === 'ALL_RECORDS' ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              onClick={() => setFilterType('ALL_RECORDS')}
            >
              🌐 All Production Records ({stats.totalProductionRecordsCount})
            </button>
          </div>

          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Showing <strong>{filteredRecords.length} records</strong> matching active scrap filters
          </div>
        </div>
      </div>

      {/* Main Registry Table */}
      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th>Record ID</th>
                <th>Recorded Date</th>
                <th>Order ID & Job Name</th>
                <th>Operator & Shift</th>
                <th style={{ textAlign: 'right' }}>Gross Output (Kg)</th>
                <th style={{ textAlign: 'right' }}>Scrap Weight (Kg)</th>
                <th style={{ textAlign: 'center' }}>Scrap / Wastage %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <Inbox size={32} style={{ marginBottom: '8px', color: 'var(--text-muted)' }} />
                    <div>No production records found matching the active scrap filters for the selected bounds.</div>
                  </td>
                </tr>
              ) : (
                recordsPagination.paginatedItems.map(r => {
                  const grossKg = r.grossProductionKg || r.totalProductionQtyKg || ((r.netUsableKg || r.qtyDispatch || 0) + (r.totalWastageKg || r.totalScrapQtyKg || 0));
                  const wastageKg = r.totalWastageKg || r.totalScrapQtyKg || 0;
                  const wastagePct = Number(r.wastagePercentage ?? r.overallScrapPctOfOutput ?? (grossKg > 0 ? (wastageKg / grossKg) * 100 : 0));
                  const isHigh = wastagePct >= 5;
                  const dateStr = r.recordedAt || r.dateFilled || '';
                  const displayDate = dateStr ? new Date(dateStr).toLocaleDateString('en-GB') : '—';
                  
                  return (
                    <tr 
                      key={r.id}
                      style={{ 
                        background: isHigh ? '#fff5f5' : 'transparent',
                        borderLeft: isHigh ? '4px solid #ef4444' : 'none'
                      }}
                    >
                      <td style={{ fontWeight: '700', color: isHigh ? '#dc2626' : 'var(--primary-brand)' }}>{r.id}</td>
                      <td>{displayDate}</td>
                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{r.jobName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Order ID: {r.orderId}</div>
                      </td>
                      <td>
                        <div>{r.operatorName || '—'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.shift || '—'}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '600' }}>{grossKg.toLocaleString()} kg</td>
                      <td style={{ textAlign: 'right', fontWeight: '600', color: isHigh ? '#dc2626' : 'inherit' }}>
                        {wastageKg.toLocaleString()} kg
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span 
                          className={`badge ${isHigh ? 'badge-warning' : 'badge-us'}`}
                          style={{ 
                            background: isHigh ? '#fee2e2' : '#dcfce7',
                            color: isHigh ? '#b91c1c' : '#15803d',
                            borderColor: isHigh ? '#fca5a5' : '#bbf7d0',
                            fontWeight: '800',
                            fontSize: '0.8rem',
                            padding: '3px 8px',
                            minWidth: '65px',
                            display: 'inline-block',
                            textAlign: 'center'
                          }}
                        >
                          {wastagePct.toFixed(1)}%
                        </span>
                      </td>
                      <td>
                        <span 
                          className="badge" 
                          style={{ 
                            background: r.status === 'Approved by Admin' ? '#ecfdf5' : '#fffbeb', 
                            color: r.status === 'Approved by Admin' ? '#047857' : '#d97706',
                            border: r.status === 'Approved by Admin' ? '1px solid #a7f3d0' : '1px solid #fde68a',
                            fontSize: '0.75rem' 
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {filteredRecords.length > 0 && (
          <TablePagination
            currentPage={recordsPagination.currentPage}
            totalItems={recordsPagination.totalItems}
            pageSize={recordsPagination.pageSize}
            onPageChange={recordsPagination.setCurrentPage}
            onPageSizeChange={recordsPagination.setPageSize}
          />
        )}
      </div>
    </div>
  );
}
