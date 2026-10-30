import React from 'react';
import { Bell } from 'lucide-react';
import { buildHref } from '../utils/slugRouter.js';

function Group({ title, lines, tone, onOpenOrder }) {
  if (!lines?.length) return null;
  const color = tone === 'overdue' ? '#991b1b' : '#92400e';
  const border = tone === 'overdue' ? '#fecaca' : '#fde68a';
  const background = tone === 'overdue' ? '#fff1f2' : '#fffbeb';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '0.78rem', fontWeight: '800', color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title} ({lines.length})
      </div>
      {lines.map((line) => (
        <a
          key={line.orderId}
          href={buildHref('orders', { id: line.orderId })}
          onClick={(event) => {
            if (!onOpenOrder) return;
            event.preventDefault();
            onOpenOrder({ id: line.orderId });
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(120px, 180px) 1fr',
            gap: '8px 16px',
            textDecoration: 'none',
            background,
            border: `1px solid ${border}`,
            borderRadius: '8px',
            padding: '8px 10px',
            color: '#0f172a',
          }}
        >
          <span style={{ fontWeight: '800', color }}>{line.orderId}</span>
          <span style={{ fontSize: '0.82rem' }}>
            {line.jobName || 'Order'} · {line.status || 'Open'} · {line.label}
            {line.blockers?.length ? ` · ${line.blockers.join('; ')}` : ''}
          </span>
        </a>
      ))}
    </div>
  );
}

export default function PrintingDeadlineSummaryCard({ summary, onOpenOrder }) {
  if (!summary || summary.type !== 'PRINTING_DEADLINE_SUMMARY') return null;
  const overdue = summary.overdue || [];
  const dueSoon = summary.dueSoon || [];
  return (
    <section
      data-testid="printing-deadline-summary"
      style={{
        background: '#ffffff',
        border: '1px solid #fecaca',
        borderLeft: '4px solid #dc2626',
        borderRadius: '12px',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: '#fee2e2',
          color: '#b91c1c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Bell size={18} />
        </div>
        <div>
          <h3 style={{ fontSize: '0.98rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            {summary.title}
          </h3>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0', lineHeight: 1.45 }}>
            {summary.message} In-app notice for Admin and Sales Manager
            {summary.plantDay ? ` · ${summary.plantDay}` : ''}. One summary per day.
          </p>
        </div>
      </div>
      <Group title="Overdue" lines={overdue} tone="overdue" onOpenOrder={onOpenOrder} />
      <Group title="Due soon" lines={dueSoon} tone="due-soon" onOpenOrder={onOpenOrder} />
    </section>
  );
}
