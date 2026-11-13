import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { userHasRole } from '../assignedRoles';
import { supabase } from '../services/supabaseClient';

/**
 * Admin notice for a reverted consumption. Stored in erp_notifications,
 * the same in-app list as QC and deadline notices, and shown on the sidebar.
 */
export default function ConsumptionRevertNotices({ currentUser }) {
  const [notices, setNotices] = useState([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userHasRole(currentUser, 'Admin')) return;
    const { data, error } = await supabase
      .from('erp_notifications')
      .select('id, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) return;
    const rows = (data || [])
      .map((row) => ({ id: row.id, ...(row.payload || {}) }))
      .filter((row) => row.type === 'CONSUMPTION_REVERTED');
    setNotices(rows);
    if (rows.some((row) => row.read === false)) setOpen(true);
  }, [currentUser]);

  useEffect(() => {
    load();
    const onRevert = () => { load(); };
    window.addEventListener('sfg-consumption-reverted', onRevert);
    return () => window.removeEventListener('sfg-consumption-reverted', onRevert);
  }, [load]);

  if (!userHasRole(currentUser, 'Admin')) return null;
  const unread = notices.filter((row) => row.read === false).length;

  return (
    <div data-testid="consumption-revert-notices" style={{ margin: '0 12px 12px' }}>
      <button
        type="button"
        data-testid="consumption-revert-notices-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: unread > 0 ? '#7c2d12' : 'rgba(255,255,255,0.06)',
          color: '#ffedd5',
          border: '1px solid rgba(253, 186, 116, 0.45)',
          borderRadius: '10px',
          padding: '8px 10px',
          cursor: 'pointer',
          fontWeight: 800,
          fontSize: '0.78rem'
        }}
      >
        <Bell size={15} aria-hidden="true" />
        <span>Revert notices</span>
        <span style={{ marginLeft: 'auto', background: '#fff7ed', color: '#9a3412', borderRadius: '999px', padding: '1px 7px' }}>{unread}</span>
      </button>
      {open && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
          {notices.length === 0 && (
            <div style={{ color: '#94a3b8', fontSize: '0.75rem', padding: '4px 2px' }}>No reverted consumptions.</div>
          )}
          {notices.map((notice) => (
            <div
              key={notice.id}
              data-testid="consumption-revert-notice"
              style={{ background: '#fff7ed', color: '#7c2d12', borderRadius: '8px', padding: '8px', fontSize: '0.75rem', lineHeight: 1.4 }}
            >
              <strong>{notice.title || 'Consumption reverted'}</strong>
              <div>{notice.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
