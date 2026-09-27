import React, { useState, useMemo, useEffect } from 'react';
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
  Inbox,
  Trash2,
  Package,
  Layers,
  ShieldAlert,
  Sliders
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

export default function ScrapWastageAnalysis({ productionRecords = [], orders = [], sfgGoods = [] }) {
  const [selectedFY, setSelectedFY] = useState('FY 2026-27');
  const [selectedMonth, setSelectedMonth] = useState('All Months');
  const [startDate, setStartDate] = useState('2026-04-01');
  const [endDate, setEndDate] = useState('2027-03-31');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter types: 'ALERTS_ONLY' (High Scrap >= limit), 'SCRAP_STORE_ONLY' (Physical Scrap Store), 'PRODUCTION_ONLY', 'ALL_RECORDS'
  const [filterType, setFilterType] = useState('ALERTS_ONLY');

  // Configurable Maximum Wastage Threshold Percentage Limit (Default 5.0%)
  const [wastageThresholdLimit, setWastageThresholdLimit] = useState(5.0);

  // Local storage persisted Physical Scrap Store Items (from QC Hold transfers)
  const [scrapStoreItems, setScrapStoreItems] = useState(() => {
    try {
      const saved = localStorage.getItem('sfg_scrap_items');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Keep scrap store items updated from localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const saved = localStorage.getItem('sfg_scrap_items');
        if (saved) setScrapStoreItems(JSON.parse(saved));
      } catch (e) {
        console.error("Error reading sfg_scrap_items", e);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

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

  // Merge both Production Process Records and Scrap Store Inventory Items into a single unified record list
  const mergedRecordsList = useMemo(() => {
    const list = [];

    // 1. Process Production Records
    (productionRecords || []).forEach(r => {
      const grossKg = r.grossProductionKg || r.totalProductionQtyKg || ((r.netUsableKg || r.qtyDispatch || 0) + (r.totalWastageKg || r.totalScrapQtyKg || 0));
      const wastageKg = r.totalWastageKg || r.totalScrapQtyKg || 0;
      const wastagePct = Number(r.wastagePercentage ?? r.overallScrapPctOfOutput ?? (grossKg > 0 ? (wastageKg / grossKg) * 100 : 0));
      const dateStr = r.recordedAt || r.dateFilled || r.timestamp || '';

      list.push({
        id: r.id || `PROD-REC-${Date.now()}`,
        sourceType: 'PRODUCTION_PROCESS',
        sourceLabel: 'Production Process',
        rawDate: dateStr,
        dateDisplay: dateStr ? new Date(dateStr).toLocaleDateString('en-GB') : '—',
        orderId: r.orderId || 'N/A',
        jobName: r.jobName || 'Production Job',
        operatorName: r.operatorName || 'Operator',
        shift: r.shift || 'Day Shift',
        grossKg,
        scrapKg: wastageKg,
        wastagePct,
        reasonOrCategory: r.wastageReason || r.defectCategory || 'Process Wastage',
        status: r.status || 'Recorded',
        isHighWastage: wastagePct >= wastageThresholdLimit
      });
    });

    // 2. Physical Scrap Store Inventory Items (transferred from QC Hold or store rejection)
    (scrapStoreItems || []).forEach(item => {
      const scrapKg = Number(item.scrapQtyKg || 0);
      const dateStr = item.date || item.timestamp || '';

      list.push({
        id: item.id || item.holdTagId || `SCRAP-${Date.now()}`,
        sourceType: 'SCRAP_STORE',
        sourceLabel: 'Scrap Store (QC Hold)',
        rawDate: dateStr,
        dateDisplay: dateStr ? new Date(dateStr).toLocaleDateString('en-GB') : '—',
        orderId: item.orderId || 'N/A',
        jobName: item.jobName || 'Scrapped SFG / FG Material',
        operatorName: item.scrappedBy || item.operatorName || 'QC Inspector',
        shift: 'Day Shift',
        grossKg: scrapKg,
        scrapKg: scrapKg,
        wastagePct: 100, // 100% scrapped item
        reasonOrCategory: item.defectCategory ? `${item.defectCategory}: ${item.scrapReason || ''}` : (item.scrapReason || 'Quarantine Rejection'),
        status: 'Transferred to Scrap Store',
        isHighWastage: true // Physical scrap items are high wastage / rejected items
      });
    });

    return list;
  }, [productionRecords, scrapStoreItems, wastageThresholdLimit]);

  // Filter the merged record list based on date bounds, search term, and filter type
  const filteredRecords = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return mergedRecordsList.filter(r => {
      // Date filter
      if (!r.rawDate) return false;
      const recordDate = new Date(r.rawDate);
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
          (r.id && r.id.toLowerCase().includes(q)) ||
          (r.reasonOrCategory && r.reasonOrCategory.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }

      // Filter type tabs
      if (filterType === 'ALERTS_ONLY' && !r.isHighWastage) {
        return false;
      }
      if (filterType === 'SCRAP_STORE_ONLY' && r.sourceType !== 'SCRAP_STORE') {
        return false;
      }
      if (filterType === 'PRODUCTION_ONLY' && r.sourceType !== 'PRODUCTION_PROCESS') {
        return false;
      }

      return true;
    });
  }, [mergedRecordsList, startDate, endDate, searchTerm, filterType]);

  const recordsPagination = usePagination(filteredRecords, 50);

  // Aggregate statistics for the filtered period
  const stats = useMemo(() => {
    let totalGross = 0;
    let totalScrap = 0;
    let highScrapCount = 0;
    let scrapStoreItemsCount = 0;

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const periodRecords = mergedRecordsList.filter(r => {
      if (!r.rawDate) return false;
      const d = new Date(r.rawDate);
      return !isNaN(d.getTime()) && d >= start && d <= end;
    });

    periodRecords.forEach(r => {
      totalGross += r.grossKg;
      totalScrap += r.scrapKg;

      if (r.isHighWastage) {
        highScrapCount++;
      }
      if (r.sourceType === 'SCRAP_STORE') {
        scrapStoreItemsCount++;
      }
    });

    const avgScrapPct = totalGross > 0 ? (totalScrap / totalGross) * 100 : 0;

    return {
      totalGross: Math.round(totalGross),
      totalScrap: Math.round(totalScrap),
      avgScrapPct: parseFloat(avgScrapPct.toFixed(2)),
      highScrapCount,
      scrapStoreItemsCount,
      totalRecordsCount: periodRecords.length
    };
  }, [mergedRecordsList, startDate, endDate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '24px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldAlert size={24} style={{ color: '#dc2626' }} />
              <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                Unified Scrap Store & Wastage Audit Registry
              </h2>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.88rem', marginTop: '4px', margin: '4px 0 0 0' }}>
              Consolidated registry merging <strong>Scrap Store Inventory Logs</strong> and <strong>Production Process Wastage Audits</strong>. Highlights job records and physical scrap items exceeding set limits.
            </p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#475569' }}>
              High Wastage Limit Threshold:
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fef2f2', border: '1.5px solid #fca5a5', padding: '4px 10px', borderRadius: '8px' }}>
              <AlertTriangle size={16} color="#dc2626" />
              <select
                value={wastageThresholdLimit}
                onChange={(e) => setWastageThresholdLimit(parseFloat(e.target.value))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#991b1b',
                  fontWeight: '900',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value={3.0}>&gt;= 3.0% Limit</option>
                <option value={5.0}>&gt;= 5.0% Limit (Default)</option>
                <option value={7.5}>&gt;= 7.5% Limit</option>
                <option value={10.0}>&gt;= 10.0% Limit</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards Block */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        
        {/* Period Gross Output */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: '600' }}>Period Output / Material</div>
          <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#0f172a', marginTop: '6px' }}>
            {stats.totalGross.toLocaleString()} <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>kg</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>Gross production + hold material</div>
        </div>

        {/* Period Scrap Weight */}
        <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: '14px', padding: '18px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '0.82rem', color: '#991b1b', fontWeight: '700' }}>Total Scrap Weight</div>
          <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#dc2626', marginTop: '6px' }}>
            {stats.totalScrap.toLocaleString()} <span style={{ fontSize: '0.85rem', color: '#991b1b' }}>kg</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: '600' }}>Process waste + physical scrap store</div>
        </div>

        {/* Avg Scrap % */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', borderLeft: '4px solid #ca8a04' }}>
          <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: '600' }}>Avg Scrap Rate %</div>
          <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#a16207', marginTop: '6px' }}>
            {stats.avgScrapPct}%
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>Average period wastage rate</div>
        </div>

        {/* High Scrap Alerts Count */}
        <div style={{ 
          background: stats.highScrapCount > 0 ? '#fef2f2' : '#ffffff', 
          border: stats.highScrapCount > 0 ? '1.5px solid #fca5a5' : '1px solid #e2e8f0', 
          borderRadius: '14px', 
          padding: '18px', 
          borderLeft: '4px solid #ef4444' 
        }}>
          <div style={{ fontSize: '0.82rem', color: stats.highScrapCount > 0 ? '#991b1b' : '#64748b', fontWeight: '700' }}>
            High Scrap Alerts (&gt;={wastageThresholdLimit}%)
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '900', color: stats.highScrapCount > 0 ? '#dc2626' : '#0f172a', marginTop: '6px' }}>
            {stats.highScrapCount} <span style={{ fontSize: '0.85rem' }}>Records</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: stats.highScrapCount > 0 ? '#b91c1c' : '#64748b', fontWeight: '600' }}>
            {stats.highScrapCount > 0 ? '⚠️ High wastage limits exceeded!' : 'All within safe limits'}
          </div>
        </div>

        {/* Scrap Store Physical Items Count */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', borderLeft: '4px solid #64748b' }}>
          <div style={{ fontSize: '0.82rem', color: '#475569', fontWeight: '700' }}>Physical Scrap Store</div>
          <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#334155', marginTop: '6px' }}>
            {stats.scrapStoreItemsCount} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Batches</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Transferred from QC hold store</div>
        </div>

      </div>

      {/* Filter and Selection Panel */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* Financial Year Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Financial Year</label>
            <select 
              value={selectedFY} 
              onChange={e => handleFYChange(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '700', width: '150px' }}
            >
              {FINANCIAL_YEARS.map(fy => (
                <option key={fy} value={fy}>{fy}</option>
              ))}
            </select>
          </div>

          {/* Month Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Period / Month Wise</label>
            <select 
              value={selectedMonth} 
              onChange={e => handleMonthChange(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '700', width: '180px' }}
            >
              {MONTHS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Custom Date Pickers */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>From Date</label>
              <input 
                type="date" 
                value={startDate}
                onChange={e => handleCustomDateChange('start', e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', width: '150px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>To Date</label>
              <input 
                type="date" 
                value={endDate}
                onChange={e => handleCustomDateChange('end', e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', width: '150px' }}
              />
            </div>
          </div>

          {/* Search text input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1', minWidth: '220px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Search Job, Order ID or Defect</label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input 
                type="text" 
                placeholder="Search job name, order ID, operator, defect reason..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              />
            </div>
          </div>
        </div>

        {/* Tab switcher for filtered record subset */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            
            <button 
              type="button"
              onClick={() => setFilterType('ALERTS_ONLY')}
              style={{
                fontSize: '0.8rem',
                fontWeight: '800',
                padding: '8px 14px',
                borderRadius: '8px',
                border: filterType === 'ALERTS_ONLY' ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                background: filterType === 'ALERTS_ONLY' ? '#dc2626' : '#ffffff',
                color: filterType === 'ALERTS_ONLY' ? '#ffffff' : '#991b1b',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <AlertTriangle size={14} /> High Scrap Alerts Only (&gt;={wastageThresholdLimit}%) ({stats.highScrapCount})
            </button>

            <button 
              type="button"
              onClick={() => setFilterType('SCRAP_STORE_ONLY')}
              style={{
                fontSize: '0.8rem',
                fontWeight: '800',
                padding: '8px 14px',
                borderRadius: '8px',
                border: filterType === 'SCRAP_STORE_ONLY' ? '1.5px solid #64748b' : '1px solid #cbd5e1',
                background: filterType === 'SCRAP_STORE_ONLY' ? '#475569' : '#ffffff',
                color: filterType === 'SCRAP_STORE_ONLY' ? '#ffffff' : '#334155',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Trash2 size={14} /> Physical Scrap Store Items ({stats.scrapStoreItemsCount})
            </button>

            <button 
              type="button"
              onClick={() => setFilterType('PRODUCTION_ONLY')}
              style={{
                fontSize: '0.8rem',
                fontWeight: '800',
                padding: '8px 14px',
                borderRadius: '8px',
                border: filterType === 'PRODUCTION_ONLY' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                background: filterType === 'PRODUCTION_ONLY' ? '#2563eb' : '#ffffff',
                color: filterType === 'PRODUCTION_ONLY' ? '#ffffff' : '#1e40af',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Layers size={14} /> Production Wastage Logs
            </button>

            <button 
              type="button"
              onClick={() => setFilterType('ALL_RECORDS')}
              style={{
                fontSize: '0.8rem',
                fontWeight: '800',
                padding: '8px 14px',
                borderRadius: '8px',
                border: filterType === 'ALL_RECORDS' ? '1.5px solid #0f172a' : '1px solid #cbd5e1',
                background: filterType === 'ALL_RECORDS' ? '#0f172a' : '#ffffff',
                color: filterType === 'ALL_RECORDS' ? '#ffffff' : '#334155',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              🌐 All Merged Records ({stats.totalRecordsCount})
            </button>
          </div>

          <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: '600' }}>
            Showing <strong>{filteredRecords.length} records</strong> matching active filters
          </div>
        </div>
      </div>

      {/* Main Unified Registry Table */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '12px 16px' }}>Record Source & ID</th>
                <th style={{ padding: '12px 16px' }}>Date</th>
                <th style={{ padding: '12px 16px' }}>Job Name & Order ID</th>
                <th style={{ padding: '12px 16px' }}>Operator / Inspector</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Gross Output / Qty (Kg)</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Scrap Weight (Kg)</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Scrap / Wastage %</th>
                <th style={{ padding: '12px 16px' }}>Defect Category / Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                    <Inbox size={36} style={{ marginBottom: '8px', color: '#94a3b8', display: 'block', margin: '0 auto 8px' }} />
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: '#475569' }}>No scrap or wastage records found</div>
                    <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>Try switching filter tabs or widening date bounds.</div>
                  </td>
                </tr>
              ) : (
                recordsPagination.paginatedItems.map(r => {
                  const isHigh = r.isHighWastage;
                  const isScrapStore = r.sourceType === 'SCRAP_STORE';
                  
                  return (
                    <tr 
                      key={r.id}
                      style={{ 
                        background: isHigh ? '#fff5f5' : '#ffffff',
                        borderBottom: '1px solid #e2e8f0',
                        borderLeft: isHigh ? '4px solid #ef4444' : '4px solid transparent',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      {/* Record Source & ID */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: '800',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            background: isScrapStore ? '#f1f5f9' : '#eff6ff',
                            color: isScrapStore ? '#475569' : '#1d4ed8',
                            border: `1px solid ${isScrapStore ? '#cbd5e1' : '#bfdbfe'}`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            {isScrapStore ? <Trash2 size={11} /> : <Layers size={11} />}
                            {r.sourceLabel}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontWeight: '800', color: isHigh ? '#dc2626' : '#0f172a', fontSize: '0.82rem' }}>
                            {r.id}
                          </span>
                        </div>
                      </td>

                      {/* Date */}
                      <td style={{ padding: '12px 16px', color: '#475569', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {r.dateDisplay}
                      </td>

                      {/* Job & Order */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.88rem' }}>{r.jobName}</div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>Order ID: <strong>{r.orderId}</strong></div>
                      </td>

                      {/* Operator & Shift */}
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem' }}>
                        <div style={{ fontWeight: '700', color: '#334155' }}>{r.operatorName}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{r.shift}</div>
                      </td>

                      {/* Gross Output / Qty */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#334155', whiteSpace: 'nowrap' }}>
                        {r.grossKg.toLocaleString()} kg
                      </td>

                      {/* Scrap Weight */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '900', color: isHigh ? '#dc2626' : '#991b1b', whiteSpace: 'nowrap' }}>
                        {r.scrapKg.toLocaleString()} kg
                      </td>

                      {/* Wastage % Badge (Highlighted when high scrap) */}
                      <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span 
                          style={{ 
                            background: isHigh ? '#fee2e2' : '#dcfce7',
                            color: isHigh ? '#b91c1c' : '#15803d',
                            border: `1.5px solid ${isHigh ? '#fca5a5' : '#bbf7d0'}`,
                            fontWeight: '900',
                            fontSize: '0.82rem',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            textAlign: 'center'
                          }}
                        >
                          {isHigh && <AlertTriangle size={12} color="#b91c1c" />}
                          {r.wastagePct >= 100 ? '100% REJECT' : `${r.wastagePct.toFixed(1)}%`}
                        </span>
                        {isHigh && (
                          <div style={{ fontSize: '0.65rem', color: '#b91c1c', fontWeight: '800', marginTop: '2px' }}>
                            ⚠️ EXCEEDS {wastageThresholdLimit}% LIMIT
                          </div>
                        )}
                      </td>

                      {/* Defect Category / Remarks */}
                      <td style={{ padding: '12px 16px', color: '#334155', fontSize: '0.82rem', maxWidth: '240px' }}>
                        <div style={{ fontWeight: '700', color: isHigh ? '#991b1b' : '#334155' }}>
                          {r.reasonOrCategory}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>
                          Status: <strong>{r.status}</strong>
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredRecords.length > 0 && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0' }}>
            <TablePagination
              currentPage={recordsPagination.currentPage}
              totalItems={recordsPagination.totalItems}
              pageSize={recordsPagination.pageSize}
              onPageChange={recordsPagination.setCurrentPage}
              onPageSizeChange={recordsPagination.setPageSize}
            />
          </div>
        )}
      </div>

    </div>
  );
}
