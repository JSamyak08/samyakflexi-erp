import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw, X, CheckCircle2 } from 'lucide-react';
import { userHasRole } from '../assignedRoles';
import { supabase } from '../services/supabaseClient';
import ModalOverlay from './ModalOverlay';

/**
 * Admin notice for a reverted consumption. Stored in erp_notifications,
 * the same in-app list as QC and deadline notices, and shown on the sidebar
 * as a minimized icon button opening a closable popup modal.
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
      .map((row) => ({ id: row.id, createdAt: row.created_at, ...(row.payload || {}) }))
      .filter((row) => row.type === 'CONSUMPTION_REVERTED');
    setNotices(rows);
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
    <div data-testid="consumption-revert-notices" className="sidebar-action-item">
      <button
        type="button"
        data-testid="consumption-revert-notices-toggle"
        className={`sidebar-action-icon-btn sidebar-action-revert ${unread > 0 ? 'has-unread' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        title={`Revert notices (${unread} unread)`}
        aria-label={`Revert notices (${unread} unread)`}
        data-nav-label={`Revert notices (${unread})`}
      >
        <RotateCcw size={17} aria-hidden="true" />
        {unread > 0 && (
          <span className="sidebar-action-badge" data-testid="consumption-revert-badge">
            {unread}
          </span>
        )}
        <span className="sidebar-action-tooltip">Revert Notices ({unread})</span>
      </button>

      {/* Closable Popup Modal */}
      {open && (
        <ModalOverlay onClose={() => setOpen(false)}>
          <div 
            className="modal-content" 
            style={{ maxWidth: '520px', width: '92%', maxHeight: '85vh', overflowY: 'auto' }} 
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#fff7ed', border: '1px solid #fdba74', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c2410c' }}>
                  <RotateCcw size={17} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                    Consumption Revert Notices
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0 0' }}>
                    Admin log of rolled-back stage material consumptions
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => setOpen(false)}
                aria-label="Close notices modal"
              >
                <X size={15} /> Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '120px' }}>
              {notices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>
                  <CheckCircle2 size={32} style={{ color: '#10b981', margin: '0 auto 8px auto', display: 'block' }} />
                  No reverted material consumptions logged.
                </div>
              ) : (
                notices.map((notice) => (
                  <div
                    key={notice.id}
                    data-testid="consumption-revert-notice"
                    style={{ background: notice.read === false ? '#fff7ed' : '#f8fafc', color: '#7c2d12', border: notice.read === false ? '1px solid #fed7aa' : '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', fontSize: '0.82rem', lineHeight: 1.45 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ color: '#9a3412', fontSize: '0.85rem' }}>{notice.title || 'Consumption Reverted'}</strong>
                      {notice.createdAt && (
                        <span style={{ fontSize: '0.72rem', color: '#9a3412', opacity: 0.8 }}>
                          {new Date(notice.createdAt).toLocaleDateString('en-GB')}
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#431407' }}>{notice.message}</div>
                  </div>
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
