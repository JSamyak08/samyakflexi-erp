import React from 'react';
import { AlertTriangle, ArrowRight, Printer, X } from 'lucide-react';
import { formatDeadlineDistance } from '../utils/orderDeadlineReminder.js';

export default function DeadlineReminderBanner({
  reminders = [],
  onOpenOrder,
  onPlanPrinting,
  canPlanPrinting = false,
  onDismiss,
}) {
  if (!reminders.length) return null;
  const countLabel = reminders.length === 1 ? '1 order' : `${reminders.length} orders`;

  return (
    <div
      role="status"
      style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)',
        border: '1px solid #fde68a',
        borderLeft: '4px solid #d97706',
        borderRadius: '12px',
        padding: '18px 20px',
        boxShadow: '0 2px 8px -2px rgba(217, 119, 6, 0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: '#fef3c7',
            color: '#b45309',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '0.98rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                Due before printing starts
              </h3>
              <span style={{
                background: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
                fontSize: '0.72rem',
                fontWeight: '800',
                padding: '2px 8px',
                borderRadius: '9999px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                {countLabel}
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '3px 0 0', lineHeight: '1.4' }}>
              These jobs are under 2 days from delivery, or already late, and the stage track has not reached Printing.
              Revise the date, plan the press, and tick Client informed after the WhatsApp update. That tick quiets the current revision. Dismissing this only hides the list until reload.
            </p>
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            className="btn-secondary"
            onClick={onDismiss}
            style={{ padding: '7px 12px', fontSize: '0.8rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <X size={14} /> Dismiss for now
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '6px', borderTop: '1px dashed #fde68a' }}>
        {reminders.slice(0, 4).map((item) => (
          <span
            key={item.order.id}
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: '0.75rem',
              fontWeight: '600',
              padding: '4px 10px',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => onOpenOrder?.(item.order)}
              style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', fontWeight: '700' }}
            >
              {item.order.id}: {item.order.jobName}
            </button>
            <span style={{ color: '#b45309' }}>· {formatDeadlineDistance(item.assessment.daysRemaining)}</span>
            {canPlanPrinting && (
              <button
                type="button"
                onClick={() => onPlanPrinting?.(item.order)}
                style={{
                  background: '#fff7ed',
                  border: '1px solid #fdba74',
                  color: '#9a3412',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '0.7rem',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Printer size={11} /> Plan printing <ArrowRight size={11} />
              </button>
            )}
          </span>
        ))}
        {reminders.length > 4 && (
          <span style={{ fontSize: '0.75rem', color: '#92400e', alignSelf: 'center', fontWeight: '700' }}>
            +{reminders.length - 4} more
          </span>
        )}
      </div>
    </div>
  );
}
