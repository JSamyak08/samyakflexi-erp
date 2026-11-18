import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import {
  STRUCTURE_CHANGE_NOTICE_TYPE,
  canSeeStructureChangeNotice,
} from '../services/structureSync';

/**
 * In-app notice when a job master or cylinder job card changes an active order.
 * Stored in erp_notifications. No email is sent.
 * A user with any of the relevant plant roles sees it, including when that
 * role is one of several Assigned Plant Roles.
 */
export default function StructureChangeNotices({ currentUser }) {
  const [notices, setNotices] = useState([]);
  const [open, setOpen] = useState(false);
  const allowed = canSeeStructureChangeNotice(currentUser);

  const load = useCallback(async () => {
    if (!allowed) return;
    const { data, error } = await supabase
      .from('erp_notifications')
      .select('id, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) return;
    const rows = (data || [])
      .map((row) => ({ id: row.id, createdAt: row.created_at, ...(row.payload || {}) }))
      .filter((row) => row.type === STRUCTURE_CHANGE_NOTICE_TYPE);
    setNotices(rows);
  }, [allowed]);

  useEffect(() => {
    load();
    const refresh = () => { load(); };
    window.addEventListener('structure-changed', refresh);
    return () => window.removeEventListener('structure-changed', refresh);
  }, [load]);

  const markRead = async (notice) => {
    if (notice.read === true) return;
    const payload = { ...notice, read: true };
    delete payload.createdAt;
    await supabase.from('erp_notifications').update({
      payload,
      updated_at: new Date().toISOString(),
    }).eq('id', notice.id);
    setNotices((prev) => prev.map((row) => (row.id === notice.id ? { ...row, read: true } : row)));
  };

  if (!allowed) return null;
  const unread = notices.filter((row) => row.read === false).length;

  return (
    <div data-testid="structure-change-notices" style={{ margin: '0 12px 12px' }}>
      <button
        type="button"
        data-testid="structure-change-notices-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: unread > 0 ? '#1e3a8a' : 'rgba(255,255,255,0.06)',
          color: '#dbeafe',
          border: '1px solid rgba(147, 197, 253, 0.45)',
          borderRadius: '10px',
          padding: '8px 10px',
          cursor: 'pointer',
          fontWeight: 800,
          fontSize: '0.78rem'
        }}
      >
        <Bell size={15} aria-hidden="true" />
        <span>Structure changes</span>
        <span style={{ marginLeft: 'auto', background: '#eff6ff', color: '#1d4ed8', borderRadius: '999px', padding: '1px 7px' }}>{unread}</span>
      </button>
      {open && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
          {notices.length === 0 && (
            <div style={{ color: '#94a3b8', fontSize: '0.75rem', padding: '4px 2px' }}>No job structure changes.</div>
          )}
          {notices.map((notice) => (
            <button
              key={notice.id}
              type="button"
              data-testid="structure-change-notice"
              onClick={() => markRead(notice)}
              style={{
                textAlign: 'left',
                background: notice.read === false ? '#eff6ff' : '#f8fafc',
                color: '#1e3a8a',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                padding: '8px',
                fontSize: '0.75rem',
                lineHeight: 1.4,
                cursor: 'pointer'
              }}
            >
              <strong>{notice.title || 'Job structure changed'}</strong>
              <div>{notice.message}</div>
              {Array.isArray(notice.orders) && notice.orders.map((order) => (
                <div key={`${notice.id}-${order.orderId}`} style={{ marginTop: '6px' }}>
                  <div style={{ fontWeight: 800 }}>{order.orderId}{order.status ? ` · ${order.status}` : ''}</div>
                  {(order.modules || []).map((item) => (
                    <div key={`${order.orderId}-${item.module}`}>
                      <span style={{ fontWeight: 800 }}>{item.module}: </span>
                      {item.detail}
                    </div>
                  ))}
                </div>
              ))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
