import React from 'react';
import {
  ResponsiveContainer,
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

const DEFAULT_COLORS = ['#0284c7', '#059669', '#d97706', '#dc2626', '#7c3aed'];

export default function AreaChart({
  data = [],
  index = 'date',
  categories = ['value'],
  colors = DEFAULT_COLORS,
  valueFormatter = (val) => String(val),
  height = 260,
  showLegend = true,
  showGridLines = true,
  className = ''
}) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
        No trend data available
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }} className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            {categories.map((cat, i) => {
              const color = colors[i % colors.length];
              return (
                <linearGradient key={cat} id={`area-grad-${cat}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                </linearGradient>
              );
            })}
          </defs>
          {showGridLines && <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />}
          <XAxis
            dataKey={index}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
            tick={{ fontSize: 11, fill: '#64748b' }}
            dy={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickFormatter={valueFormatter}
            dx={-4}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null;
              return (
                <div style={{ background: '#0f172a', color: '#ffffff', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)' }}>
                  <div style={{ fontWeight: '700', marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '2px' }}>{label}</div>
                  {payload.map((item) => (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color }} />
                      <span style={{ color: '#cbd5e1' }}>{item.name}:</span>
                      <span style={{ fontWeight: '700' }}>{valueFormatter(item.value)}</span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          {showLegend && (
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ paddingBottom: '10px', fontSize: '0.78rem' }}
            />
          )}
          {categories.map((cat, i) => {
            const color = colors[i % colors.length];
            return (
              <Area
                key={cat}
                type="monotone"
                dataKey={cat}
                stroke={color}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#area-grad-${cat})`}
              />
            );
          })}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
