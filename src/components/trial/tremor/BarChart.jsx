import React from 'react';
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

const DEFAULT_COLORS = ['#0f172a', '#059669', '#2563eb', '#d97706', '#7c3aed'];

export default function BarChart({
  data = [],
  index = 'category',
  categories = ['value'],
  colors = DEFAULT_COLORS,
  valueFormatter = (val) => String(val),
  height = 260,
  showLegend = true,
  showGridLines = true,
  layout = 'horizontal',
  className = ''
}) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
        No bar chart data available
      </div>
    );
  }

  const isVertical = layout === 'vertical';

  return (
    <div style={{ width: '100%', height }} className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          layout={layout}
          margin={{ top: 10, right: 10, left: isVertical ? 20 : -10, bottom: 0 }}
        >
          {showGridLines && <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />}
          {isVertical ? (
            <>
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={valueFormatter}
              />
              <YAxis
                dataKey={index}
                type="category"
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                tick={{ fontSize: 11, fill: '#64748b' }}
                width={110}
              />
            </>
          ) : (
            <>
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
            </>
          )}
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null;
              return (
                <div style={{ background: '#0f172a', color: '#ffffff', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)' }}>
                  <div style={{ fontWeight: '700', marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '2px' }}>{label}</div>
                  {payload.map((item) => (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: item.color }} />
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
              iconType="square"
              wrapperStyle={{ paddingBottom: '10px', fontSize: '0.78rem' }}
            />
          )}
          {categories.map((cat, i) => (
            <Bar
              key={cat}
              dataKey={cat}
              fill={colors[i % colors.length]}
              radius={isVertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={45}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
