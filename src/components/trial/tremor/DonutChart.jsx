import React from 'react';
import {
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend
} from 'recharts';

const DEFAULT_COLORS = ['#0f172a', '#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626'];

export default function DonutChart({
  data = [],
  category = 'value',
  index = 'name',
  colors = DEFAULT_COLORS,
  valueFormatter = (val) => String(val),
  height = 260,
  variant = 'donut', // 'donut' | 'pie'
  showLegend = true,
  className = ''
}) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
        No distribution data available
      </div>
    );
  }

  const innerRadius = variant === 'donut' ? 60 : 0;
  const outerRadius = 85;

  return (
    <div style={{ width: '100%', height }} className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const item = payload[0];
              return (
                <div style={{ background: '#0f172a', color: '#ffffff', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.payload?.fill || item.color }} />
                    <span style={{ fontWeight: '600' }}>{item.name}:</span>
                    <span style={{ fontWeight: '800' }}>{valueFormatter(item.value)}</span>
                  </div>
                </div>
              );
            }}
          />
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              wrapperStyle={{ paddingTop: '10px', fontSize: '0.78rem' }}
            />
          )}
          <Pie
            data={data}
            cx="50%"
            cy={showLegend ? '45%' : '50%'}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey={category}
            nameKey={index}
          >
            {data.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />
            ))}
          </Pie>
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}
