import React, { useCallback, useEffect, useState } from 'react';
import { Layers, X, CheckCircle2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import ModalOverlay from './ModalOverlay';
import {
  STRUCTURE_CHANGE_NOTICE_TYPE,
  canSeeStructureChangeNotice,
} from '../services/structureSync';

/**
 * In-app notice when a job master or cylinder job card changes an active order.
 * Stored in erp_notifications. Shown on the sidebar as a minimized icon button
 * opening a closable popup modal.
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
    <div data-testid="structure-change-notices" className="sidebar-action-item">
      <button
        type="button"
        data-testid="structure-change-notices-toggle"
        className={`sidebar-action-icon-btn sidebar-action-structure ${unread > 0 ? 'has-unread' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        title={`Structure changes (${unread} unread)`}
        aria-label={`Structure changes (${unread} unread)`}
        data-nav-label={`Structure changes (${unread})`}
      >
        <Layers size={17} aria-hidden="true" />
        {unread > 0 && (
          <span className="sidebar-action-badge" data-testid="structure-change-badge">
            {unread}
          </span>
        )}
        <span className="sidebar-action-tooltip">Structure Changes ({unread})</span>
      </button>

      {/* Closable Popup Modal */}
      {open && (
        <ModalOverlay onClose={() => setOpen(false)}>
          <div 
            className="modal-content" 
            style={{ maxWidth: '560px', width: '92%', maxHeight: '85vh', overflowY: 'auto' }} 
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1d4ed8' }}>
                  <Layers size={17} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                    Job Structure Change Notices
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0 0' }}>
                    Notifications when a job master or cylinder card updates an active order
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => setOpen(false)}
                aria-label="Close structure notices modal"
              >
                <X size={15} /> Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px' }}>
              {notices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>
                  <CheckCircle2 size={32} style={{ color: '#10b981', margin: '0 auto 8px auto', display: 'block' }} />
                  No job structure changes reported.
                </div>
              ) : (
                notices.map((notice) => (
                  <button
                    key={notice.id}
                    type="button"
                    data-testid="structure-change-notice"
                    onClick={() => markRead(notice)}
                    style={{
                      textAlign: 'left',
                      background: notice.read === false ? '#eff6ff' : '#f8fafc',
                      color: '#1e3a8a',
                      border: notice.read === false ? '1.5px solid #93c5fd' : '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '12px',
                      fontSize: '0.82rem',
                      lineHeight: 1.45,
                      cursor: 'pointer',
                      width: '100%',
                      boxShadow: notice.read === false ? '0 1px 3px rgba(37, 99, 235, 0.08)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ color: '#1e40af', fontSize: '0.85rem' }}>{notice.title || 'Job Structure Changed'}</strong>
                      {notice.read === false ? (
                        <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px' }}>
                          Mark as Read
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Read</span>
                      )}
                    </div>
                    <div style={{ color: '#334155' }}>{notice.message}</div>
                    {Array.isArray(notice.orders) && notice.orders.map((order) => (
                      <div key={`${notice.id}-${order.orderId}`} style={{ marginTop: '8px', padding: '6px 8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
                        <div style={{ fontWeight: '800', color: '#0f172a' }}>{order.orderId}{order.status ? ` · ${order.status}` : ''}</div>
                        {(order.modules || []).map((item) => (
                          <div key={`${order.orderId}-${item.module}`} style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
                            <span style={{ fontWeight: '700', color: '#0f172a' }}>{item.module}: </span>
                            {item.detail}
                          </div>
                        ))}
                      </div>
                    ))}
                  </button>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '7px 20px', fontSize: '0.84rem', fontWeight: '700' }}
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
