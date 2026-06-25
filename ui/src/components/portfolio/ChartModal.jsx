import React, { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { X } from 'lucide-react';
import { fmtVal } from '../../utils/formatters';

const RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'ALL', days: Infinity }
];

const CustomTooltip = ({ active, payload, label, currency, rate }) => {
  if (active && payload && payload.length) {
    const val = payload[0].value;
    return (
      <div style={{
        background: 'rgba(20, 20, 22, 0.8)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        color: 'white'
      }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
          {new Date(label).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
        </div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          {fmtVal(val, currency, rate)}
        </div>
      </div>
    );
  }
  return null;
};

export default function ChartModal({ selectedChart, onClose, currency, rate }) {
  const [timeRange, setTimeRange] = useState('1M'); // Default to 1M

  const filteredData = useMemo(() => {
    if (!selectedChart || !selectedChart.rawData || selectedChart.rawData.length === 0) return [];
    
    const rangeObj = RANGES.find(r => r.label === timeRange);
    const daysLimit = rangeObj ? rangeObj.days : 30;
    
    if (daysLimit === Infinity) return selectedChart.rawData;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysLimit);
    const cutoffTime = cutoffDate.getTime();

    // rawData is sorted ascending. We want dates >= cutoffDate
    const filtered = selectedChart.rawData.filter(d => {
      const time = new Date(d.date).getTime();
      return time >= cutoffTime;
    });
    
    return filtered;
  }, [selectedChart, timeRange]);

  if (!selectedChart) return null;

  const { title, themeColor } = selectedChart;

  // Handle abbreviated Y Axis ticks
  const formatYAxis = (tickItem) => {
      if (tickItem === 0) return '0';
      // If we are in USD, adjust the tick scale conceptually, but since value is native, just format it
      const val = currency === 'USD' ? tickItem / rate : tickItem;
      const absVal = Math.abs(val);
      
      let formatted = val.toString();
      if (absVal >= 1.0e+7) formatted = (val / 1.0e+7).toFixed(1) + "Cr";
      else if (absVal >= 1.0e+5) formatted = (val / 1.0e+5).toFixed(1) + "L";
      else if (absVal >= 1.0e+3) formatted = (val / 1.0e+3).toFixed(1) + "K";
      else formatted = val.toFixed(0);
      
      return currency === 'USD' ? `$${formatted}` : `₹${formatted}`;
  };

  const formatXAxis = (tickItem) => {
      const date = new Date(tickItem);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '20px'
      }} 
      onClick={onClose}
    >
      <div 
        className="card" 
        style={{ 
          width: '100%', 
          maxWidth: 900, 
          background: 'var(--surface)', 
          borderRadius: 16,
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }} 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h2>
            {filteredData.length > 0 && (
               <div style={{ fontSize: 28, fontWeight: 700, color: themeColor, marginTop: 4 }}>
                  {fmtVal(filteredData[filteredData.length - 1].value, currency, rate)}
               </div>
            )}
          </div>
          <button 
            onClick={onClose}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--text-muted)', 
              cursor: 'pointer',
              padding: 8,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'var(--border)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <X size={24} />
          </button>
        </div>

        {/* Time Range Filters */}
        <div style={{ display: 'flex', gap: 8, padding: '20px 32px 0 32px' }}>
          {RANGES.map(range => (
            <button
              key={range.label}
              onClick={() => setTimeRange(range.label)}
              style={{
                padding: '6px 16px',
                borderRadius: 20,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: timeRange === range.label ? themeColor : 'var(--border)',
                color: timeRange === range.label ? '#fff' : 'var(--text-muted)',
              }}
            >
              {range.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div style={{ width: '100%', height: 400, padding: '24px 32px 32px 16px' }}>
          {filteredData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredData}>
                <defs>
                  <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={themeColor} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={themeColor} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatXAxis} 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                  dy={10}
                  minTickGap={30}
                />
                <YAxis 
                  tickFormatter={formatYAxis} 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                  dx={-10}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<CustomTooltip currency={currency} rate={rate} />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke={themeColor} 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorGradient)" 
                  animationDuration={1000}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              Not enough data points to render trend line.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
