import React from 'react';
import { Bell } from 'lucide-react';
import { buildHref } from '../utils/slugRouter.js';
import { ListPager, SectionChevron, useCollapsedSection, usePagedItems } from './printingDeadlineSection.jsx';

function Group({ title, lines, total, tone, onOpenOrder }) {
  if (!lines?.length) return null;
  const color = tone === 'overdue' ? '#991b1b' : '#92400e';
  const border = tone === 'overdue' ? '#fecaca' : '#fde68a';
  const background = tone === 'overdue' ? '#fff1f2' : '#fffbeb';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '0.78rem', fontWeight: '800', color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {title} ({total ?? lines.length})
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

function CountBadge({ children, background, color, border }) {
  return (
    <span style={{
      background,
      color,
      border: `1px solid ${border}`,
      fontSize: '0.72rem',
      fontWeight: '800',
      padding: '2px 8px',
      borderRadius: '9999px',
    }}>
      {children}
    </span>
  );
}

export default function PrintingDeadlineSummaryCard({ summary, onOpenOrder, leadDays = 3, userKey = '' }) {
  const overdue = summary?.overdue || [];
  const dueSoon = summary?.dueSoon || [];
  const lines = [...overdue, ...dueSoon];
  const { collapsed, toggle } = useCollapsedSection('summary', userKey);
  const { view, setPage } = usePagedItems(lines);
  if (!summary || summary.type !== 'PRINTING_DEADLINE_SUMMARY') return null;
  const total = overdue.length + dueSoon.length;
  const countLabel = total === 1 ? '1 order' : `${total} orders`;
  const pageOverdue = view.items.filter((line) => line.stage === 'overdue');
  const pageDueSoon = view.items.filter((line) => line.stage !== 'overdue');

  return (
    <section
      data-testid="printing-deadline-summary"
      data-collapsed={collapsed ? 'true' : 'false'}
      data-page={view.page}
      style={{
        background: '#ffffff',
        border: '1px solid #fecaca',
        borderLeft: '4px solid #dc2626',
        borderRadius: '12px',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: collapsed ? '0' : '14px',
      }}
    >
      <button
        type="button"
        data-testid="printing-deadline-summary-toggle"
        aria-expanded={!collapsed}
        aria-controls="printing-deadline-summary-body"
        onClick={toggle}
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-start',
          background: 'transparent',
          border: 0,
          padding: 0,
          textAlign: 'left',
          cursor: 'pointer',
          color: 'inherit',
          width: '100%',
        }}
      >
        <SectionChevron collapsed={collapsed} />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '0.98rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              {summary.title || 'Daily summary'}
            </h3>
            <CountBadge background="#fee2e2" color="#991b1b" border="#fecaca">{countLabel}</CountBadge>
            {overdue.length > 0 && (
              <CountBadge background="#fee2e2" color="#991b1b" border="#fecaca">{overdue.length} overdue</CountBadge>
            )}
            {dueSoon.length > 0 && (
              <CountBadge background="#fef3c7" color="#92400e" border="#fde68a">{dueSoon.length} due within {leadDays} days</CountBadge>
            )}
          </div>
          {!collapsed && (
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0', lineHeight: 1.45, textTransform: 'none' }}>
              {summary.message} In-app notice for Admin and Sales Manager
              {summary.plantDay ? ` · ${summary.plantDay}` : ''}. One summary per day.
            </p>
          )}
        </div>
      </button>
      {!collapsed && (
        <div id="printing-deadline-summary-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Group title="Overdue" lines={pageOverdue} total={overdue.length} tone="overdue" onOpenOrder={onOpenOrder} />
          <Group title="Due soon" lines={pageDueSoon} total={dueSoon.length} tone="due-soon" onOpenOrder={onOpenOrder} />
          <ListPager view={view} onPage={setPage} testId="printing-deadline-summary" />
        </div>
      )}
    </section>
  );
}
