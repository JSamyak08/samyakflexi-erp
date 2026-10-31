import React from 'react';
import { AlertTriangle, ArrowRight, Printer, X } from 'lucide-react';
import { buildHref } from '../utils/slugRouter.js';
import { ListPager, SectionChevron, useCollapsedSection, usePagedItems } from './printingDeadlineSection.jsx';

function orderHref(order) {
  return buildHref('orders', { id: order.id });
}

function Row({ item, canPlanPrinting, onOpenOrder, onPlanPrinting }) {
  const overdue = item.assessment.stage === 'overdue';
  const color = overdue ? '#991b1b' : '#92400e';
  const background = overdue ? '#fef2f2' : '#fffbeb';
  const border = overdue ? '#fecaca' : '#fde68a';
  const blockers = item.assessment.blockers || [];
  return (
    <div
      data-testid="printing-deadline-row"
      data-stage={item.assessment.stage}
      style={{
        background,
        border: `1px solid ${border}`,
        borderLeft: `4px solid ${overdue ? '#dc2626' : '#d97706'}`,
        borderRadius: '8px',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <a
            href={orderHref(item.order)}
            onClick={(event) => {
              event.preventDefault();
              onOpenOrder?.(item.order);
            }}
            style={{ color, fontWeight: '800', textDecoration: 'none' }}
          >
            {item.order.id}: {item.order.jobName}
          </a>
          <span style={{
            background: overdue ? '#fee2e2' : '#fef3c7',
            color,
            border: `1px solid ${border}`,
            borderRadius: '999px',
            padding: '2px 8px',
            fontSize: '0.72rem',
            fontWeight: '800',
          }}>
            {overdue ? item.assessment.overdueLabel : item.assessment.distanceLabel}
          </span>
          <span style={{ fontSize: '0.78rem', color: '#334155', fontWeight: '700' }}>
            Status: {item.assessment.status || item.order.status || 'Open'}
          </span>
        </div>
        {canPlanPrinting && (
          <button
            type="button"
            onClick={() => onPlanPrinting?.(item.order)}
            style={{
              background: '#fff7ed',
              border: '1px solid #fdba74',
              color: '#9a3412',
              borderRadius: '999px',
              padding: '4px 10px',
              fontSize: '0.72rem',
              fontWeight: '800',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Printer size={12} /> Plan printing <ArrowRight size={12} />
          </button>
        )}
      </div>
      {(blockers.length > 0 || item.assessment.blockersChecked) && (
        <div style={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.4 }}>
          <strong style={{ color }}>Blocking printing: </strong>
          {blockers.length ? blockers.map((blocker) => blocker.label).join(' · ') : 'No tracked blocker on file'}
        </div>
      )}
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

export default function DeadlineReminderBanner({
  reminders = [],
  leadDays = 3,
  onOpenOrder,
  onPlanPrinting,
  canPlanPrinting = false,
  onDismiss,
  userKey = '',
}) {
  const { collapsed, toggle } = useCollapsedSection('list', userKey);
  const { view, setPage } = usePagedItems(reminders);
  if (!reminders.length) return null;
  const overdueCount = reminders.filter((item) => item.assessment.stage === 'overdue').length;
  const dueSoonCount = reminders.length - overdueCount;
  const high = overdueCount > 0;
  const countLabel = reminders.length === 1 ? '1 order' : `${reminders.length} orders`;

  return (
    <div
      role="status"
      data-testid="printing-deadline-list"
      data-collapsed={collapsed ? 'true' : 'false'}
      data-page={view.page}
      style={{
        background: '#ffffff',
        border: `1px solid ${high ? '#fecaca' : '#fde68a'}`,
        borderLeft: `4px solid ${high ? '#dc2626' : '#d97706'}`,
        borderRadius: '12px',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: collapsed ? '0' : '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="printing-deadline-toggle"
          aria-expanded={!collapsed}
          aria-controls="printing-deadline-list-body"
          onClick={toggle}
          style={{
            flex: '1 1 280px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            background: 'transparent',
            border: 0,
            padding: 0,
            textAlign: 'left',
            cursor: 'pointer',
            color: 'inherit',
          }}
        >
          <SectionChevron collapsed={collapsed} />
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: high ? '#fee2e2' : '#fef3c7',
            color: high ? '#b91c1c' : '#b45309',
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
              <CountBadge background={high ? '#fee2e2' : '#fef3c7'} color={high ? '#b91c1c' : '#b45309'} border={high ? '#fecaca' : '#fde68a'}>
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{countLabel}</span>
              </CountBadge>
              {overdueCount > 0 && (
                <CountBadge background="#fee2e2" color="#991b1b" border="#fecaca">
                  {overdueCount} overdue
                </CountBadge>
              )}
              {dueSoonCount > 0 && (
                <CountBadge background="#fef3c7" color="#92400e" border="#fde68a">
                  {dueSoonCount} due within {leadDays} days
                </CountBadge>
              )}
            </div>
            {!collapsed && (
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '3px 0 0', lineHeight: '1.4', textTransform: 'none' }}>
                Shown {leadDays} days before the deadline, and after it, until a print run starts or the order is closed or cancelled.
                Overdue rows stay at the top. The list is for Admin and Sales Manager.
              </p>
            )}
          </div>
        </button>
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
      {!collapsed && (
        <div id="printing-deadline-list-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {view.items.map((item) => (
            <Row
              key={item.order.id}
              item={item}
              canPlanPrinting={canPlanPrinting}
              onOpenOrder={onOpenOrder}
              onPlanPrinting={onPlanPrinting}
            />
          ))}
          <ListPager view={view} onPage={setPage} testId="printing-deadline-list" />
        </div>
      )}
    </div>
  );
}
