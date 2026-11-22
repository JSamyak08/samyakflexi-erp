import React from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';

/**
 * Tremor-style KPI Card with modern elevation, badges, and clean typography.
 */
export default function KpiCard({
  title,
  value,
  subtitle,
  change,
  changeType = 'neutral', // 'positive' | 'negative' | 'neutral' | 'alert'
  icon: Icon,
  onClick,
  badgeText,
  color = 'slate',
  style = {}
}) {
  const isClickable = typeof onClick === 'function';

  const changeColors = {
    positive: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
    negative: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
    alert: { bg: '#fff1f2', text: '#e11d48', border: '#fda4af' },
    warning: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
    neutral: { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' }
  };

  const activeChangeStyle = changeColors[changeType] || changeColors.neutral;

  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className="tremor-kpi-card"
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        ...style
      }}
    >
      {/* Top Header Row: Title & Optional Icon / Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
        <span
          style={{
            fontSize: '0.82rem',
            fontWeight: '600',
            color: '#64748b',
            letterSpacing: '0.01em',
            textTransform: 'uppercase'
          }}
        >
          {title}
        </span>
        {badgeText && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '9999px',
              background: activeChangeStyle.bg,
              color: activeChangeStyle.text,
              border: `1px solid ${activeChangeStyle.border}`
            }}
          >
            {badgeText}
          </span>
        )}
        {Icon && (
          <div
            style={{
              padding: '6px',
              borderRadius: '8px',
              background: '#f8fafc',
              color: '#334155',
              border: '1px solid #e2e8f0'
            }}
          >
            <Icon size={16} />
          </div>
        )}
      </div>

      {/* Primary Value */}
      <div style={{ margin: '4px 0 6px' }}>
        <div
          style={{
            fontSize: '1.75rem',
            fontWeight: '800',
            color: changeType === 'alert' || changeType === 'negative' ? '#dc2626' : '#0f172a',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
            wordBreak: 'break-word'
          }}
        >
          {value}
        </div>
      </div>

      {/* Footer / Subtitle & Trend */}
      {(subtitle || change) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px', fontSize: '0.78rem' }}>
          {change && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontWeight: '700',
                padding: '2px 6px',
                borderRadius: '6px',
                background: activeChangeStyle.bg,
                color: activeChangeStyle.text,
                border: `1px solid ${activeChangeStyle.border}`,
                fontSize: '0.74rem'
              }}
            >
              {changeType === 'positive' && <ArrowUpRight size={13} />}
              {changeType === 'negative' && <ArrowDownRight size={13} />}
              {changeType === 'warning' && <TrendingUp size={13} />}
              {change}
            </span>
          )}
          {subtitle && (
            <span style={{ color: '#64748b', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
