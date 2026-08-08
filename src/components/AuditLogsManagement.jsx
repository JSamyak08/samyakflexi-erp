import React, { useState, useMemo } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  Trash2, 
  RefreshCw, 
  Clock, 
  User, 
  FileText, 
  Activity,
  Layers,
  Database,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { pruneOldAuditLogs } from '../services/auditLogger';

export default function AuditLogsManagement({ 
  auditLogs = [], 
  currentUser, 
  onRefreshLogs, 
  onPurgeOldLogs 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState('All');
  const [selectedAction, setSelectedAction] = useState('All');
  const [selectedDateRange, setSelectedDateRange] = useState('All');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Admin access guard
  if (currentUser?.role !== 'Admin') {
    return (
      <div className="glass-panel" style={{ padding: '60px 24px', textAlign: 'center', maxWidth: '600px', margin: '40px auto' }}>
        <ShieldAlert size={56} style={{ color: 'var(--danger)', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
          Access Restricted to Admin Role Only
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
          The System Audit Logs ledger contains sensitive security and operational records. Access is restricted strictly to users with <strong>Admin Role</strong> privileges.
        </p>
      </div>
    );
  }

  // Filter logs by search term, module, action type, and date range
  const filteredLogs = useMemo(() => {
    return (auditLogs || []).filter(log => {
      // 1. Module filter
      if (selectedModule !== 'All' && log.module !== selectedModule) return false;

      // 2. Action filter
      if (selectedAction !== 'All' && (log.actionType || '').toUpperCase() !== selectedAction.toUpperCase()) return false;

      // 3. Date range filter
      if (selectedDateRange !== 'All') {
        const logTime = new Date(log.timestamp).getTime();
        const now = Date.now();
        if (selectedDateRange === 'Today') {
          const todayStart = new Date().setHours(0, 0, 0, 0);
          if (logTime < todayStart) return false;
        } else if (selectedDateRange === 'Yesterday') {
          const todayStart = new Date().setHours(0, 0, 0, 0);
          const yestStart = todayStart - (24 * 60 * 60 * 1000);
          if (logTime < yestStart || logTime >= todayStart) return false;
        } else if (selectedDateRange === '7days') {
          if (logTime < now - (7 * 24 * 60 * 60 * 1000)) return false;
        } else if (selectedDateRange === '30days') {
          if (logTime < now - (30 * 24 * 60 * 60 * 1000)) return false;
        }
      }

      // 4. Keyword search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchUser = (log.username || '').toLowerCase().includes(term);
        const matchRole = (log.userRole || '').toLowerCase().includes(term);
        const matchDetails = (log.details || '').toLowerCase().includes(term);
        const matchTarget = (log.targetId || '').toLowerCase().includes(term);
        const matchModule = (log.module || '').toLowerCase().includes(term);
        if (!matchUser && !matchRole && !matchDetails && !matchTarget && !matchModule) return false;
      }

      return true;
    });
  }, [auditLogs, selectedModule, selectedAction, selectedDateRange, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const total = (auditLogs || []).length;
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayCount = (auditLogs || []).filter(l => new Date(l.timestamp).getTime() >= todayStart).length;
    const mutationCount = (auditLogs || []).filter(l => ['CREATE', 'UPDATE', 'DELETE'].includes((l.actionType || '').toUpperCase())).length;
    
    const uniqueUsers = new Set((auditLogs || []).map(l => l.username || 'System')).size;

    return { total, todayCount, mutationCount, uniqueUsers };
  }, [auditLogs]);

  // Available unique modules
  const uniqueModules = useMemo(() => {
    const set = new Set((auditLogs || []).map(l => l.module).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [auditLogs]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (onRefreshLogs) await onRefreshLogs();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      alert("No audit log entries to export.");
      return;
    }
    const headers = ["Log ID", "Date", "Time", "Timestamp", "Username", "Role", "Action Type", "Module", "Target ID", "Details"];
    const rows = filteredLogs.map(l => [
      l.id,
      l.dateStr || '',
      l.timeStr || '',
      l.timestamp || '',
      `"${(l.username || '').replace(/"/g, '""')}"`,
      `"${(l.userRole || '').replace(/"/g, '""')}"`,
      l.actionType || '',
      l.module || '',
      l.targetId || '',
      `"${(l.details || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Samyak_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadgeStyle = (actionType = '') => {
    const act = actionType.toUpperCase();
    if (act === 'CREATE') return { background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' };
    if (act === 'UPDATE') return { background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' };
    if (act === 'DELETE') return { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' };
    if (act === 'AUTH') return { background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa' };
    if (act === 'SYSTEM') return { background: '#f3e8ff', color: '#6b21a8', border: '1px solid #e9d5ff' };
    return { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
              <ShieldCheck size={24} style={{ color: 'var(--primary-brand)' }} /> System Audit Logs & Compliance Ledger
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
              Immutable system activity trail logging user mutations, job punchings, stock adjustments, and administrative security events (6-Month Retention).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-secondary" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw size={16} className={isRefreshing ? 'spin-icon' : ''} /> Refresh Logs
            </button>
            <button className="btn-primary" onClick={handleExportCSV}>
              <Download size={16} /> Export Audit CSV
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--primary-brand)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>TOTAL AUDIT LOGS</span>
            <Activity size={18} style={{ color: 'var(--primary-brand)' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '8px', color: 'var(--text-primary)' }}>
            {stats.total}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Min. 180-Day Retention Active
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--success)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>TODAY'S MUTATIONS</span>
            <Clock size={18} style={{ color: 'var(--success)' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '8px', color: 'var(--success)' }}>
            {stats.todayCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Actions recorded today
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #7c3aed' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>DATA MUTATIONS</span>
            <Database size={18} style={{ color: '#7c3aed' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '8px', color: '#7c3aed' }}>
            {stats.mutationCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Creates, updates & deletes
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>LOGGED USERS</span>
            <User size={18} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginTop: '8px', color: '#f59e0b' }}>
            {stats.uniqueUsers}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Active system operators
          </div>
        </div>
      </div>

      {/* Filters and Search Control Panel */}
      <div className="glass-panel" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '16px', alignItems: 'center' }}>
          {/* Keyword Search */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              className="form-control"
              style={{ paddingLeft: '36px' }}
              placeholder="Search by User, Ref ID, Detail..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Module Filter */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select 
              className="form-control"
              value={selectedModule}
              onChange={e => setSelectedModule(e.target.value)}
            >
              <option value="All">All Modules ({uniqueModules.length - 1})</option>
              {uniqueModules.filter(m => m !== 'All').map(mod => (
                <option key={mod} value={mod}>{mod}</option>
              ))}
            </select>
          </div>

          {/* Action Filter */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select 
              className="form-control"
              value={selectedAction}
              onChange={e => setSelectedAction(e.target.value)}
            >
              <option value="All">All Action Types</option>
              <option value="CREATE">CREATE (Adds)</option>
              <option value="UPDATE">UPDATE (Edits)</option>
              <option value="DELETE">DELETE (Removals)</option>
              <option value="SYSTEM">SYSTEM (Settings)</option>
              <option value="AUTH">AUTH (Sign In)</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select 
              className="form-control"
              value={selectedDateRange}
              onChange={e => setSelectedDateRange(e.target.value)}
            >
              <option value="All">All Stored Logs (6 Months)</option>
              <option value="Today">Today Only</option>
              <option value="Yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Audit Trail Data Table */}
      <div className="glass-panel" style={{ padding: '20px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} style={{ color: 'var(--primary-brand)' }} /> Recorded Activity Trail ({filteredLogs.length} entries)
          </h3>
          {onPurgeOldLogs && (
            <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px', color: 'var(--danger)' }} onClick={onPurgeOldLogs}>
              <Trash2 size={14} /> Purge &gt;6 Mo. Logs
            </button>
          )}
        </div>

        {filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
            <AlertCircle size={40} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
            <p style={{ fontSize: '1rem', fontWeight: '600' }}>No Audit Logs Found</p>
            <p style={{ fontSize: '0.85rem' }}>No system events match the current filter or search criteria.</p>
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Date & Time</th>
                <th style={{ padding: '12px' }}>User & Role</th>
                <th style={{ padding: '12px' }}>Action</th>
                <th style={{ padding: '12px' }}>Module</th>
                <th style={{ padding: '12px' }}>Details & Description</th>
                <th style={{ padding: '12px' }}>Ref ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => {
                const badgeStyle = getActionBadgeStyle(log.actionType);
                return (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}>
                    <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{log.dateStr}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{log.timeStr}</div>
                    </td>

                    <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <User size={14} style={{ color: 'var(--primary-brand)' }} /> {log.username}
                      </div>
                      <span className="badge" style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#f1f5f9', color: '#475569', marginTop: '2px', display: 'inline-block' }}>
                        {log.userRole || 'Admin'}
                      </span>
                    </td>

                    <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                      <span style={{ 
                        display: 'inline-block', 
                        padding: '4px 8px', 
                        borderRadius: '4px', 
                        fontSize: '0.75rem', 
                        fontWeight: '700',
                        ...badgeStyle 
                      }}>
                        {log.actionType || 'UPDATE'}
                      </span>
                    </td>

                    <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                      <span className="badge badge-info" style={{ fontSize: '0.78rem', padding: '4px 8px' }}>
                        {log.module}
                      </span>
                    </td>

                    <td style={{ padding: '12px', color: 'var(--text-primary)', lineHeight: '1.45', maxWidth: '400px' }}>
                      {log.details}
                    </td>

                    <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                      {log.targetId ? (
                        <code style={{ background: '#f1f5f9', padding: '3px 6px', borderRadius: '4px', fontSize: '0.8rem', color: '#334155' }}>
                          {log.targetId}
                        </code>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
