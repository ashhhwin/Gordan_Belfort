import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush, Area, AreaChart } from 'recharts';
import { useStore } from '../../store';

export default function NetWorthChart({ filters }) {
  const { history, currency, usdInr, isFamilyMode, activeUser } = useStore();

  const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];

    // Filter the raw history rows based on current UI filters
    const filteredRows = history.filter(row => {
      if (!isFamilyMode && row.user_id !== activeUser?.id) return false;
      if (isFamilyMode && filters.userId !== 'ALL' && row.user_id !== filters.userId) return false;
      if (filters.assetClass !== 'ALL' && row.asset_class !== filters.assetClass) return false;
      return true;
    });

    // Group by Date
    const grouped = {};
    filteredRows.forEach(row => {
      const d = new Date(row.date).toISOString().split('T')[0];
      if (!grouped[d]) {
        grouped[d] = { date: d, total_value: 0, invested_amount: 0 };
      }
      grouped[d].total_value += parseFloat(row.total_value);
      grouped[d].invested_amount += parseFloat(row.invested_amount);
    });

    // Convert to array and sort chronologically
    let data = Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));

    // Convert currency if needed
    if (currency === 'USD') {
      data = data.map(d => ({
        ...d,
        total_value: d.total_value / usdInr,
        invested_amount: d.invested_amount / usdInr,
      }));
    }

    return data;
  }, [history, filters, isFamilyMode, activeUser, currency, usdInr]);

  if (chartData.length === 0) {
    return (
      <div className="card" style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted">No historical data available for the selected filters.</p>
      </div>
    );
  }

  const fmtCurrency = (val) => {
    if (currency === 'USD') return `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--text-muted)' }}>{label}</p>
          <p style={{ margin: '0', fontSize: '14px', fontWeight: 600, color: 'var(--accent-blue)' }}>
            Net Worth: {fmtCurrency(payload[0].value)}
          </p>
          {payload[1] && (
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Invested: {fmtCurrency(payload[1].value)}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card" style={{ height: '400px', marginBottom: '20px', paddingBottom: '40px' }}>
      <div className="card-header">
        <div className="card-title">Historical Net Worth</div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis 
            dataKey="date" 
            stroke="var(--text-muted)" 
            fontSize={11} 
            tickMargin={10} 
            tickFormatter={(tick) => new Date(tick).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          />
          <YAxis 
            stroke="var(--text-muted)" 
            fontSize={11} 
            tickFormatter={(tick) => {
              if (tick >= 10000000) return `${(tick/10000000).toFixed(1)}Cr`;
              if (tick >= 100000) return `${(tick/100000).toFixed(1)}L`;
              if (tick >= 1000) return `${(tick/1000).toFixed(1)}k`;
              return tick;
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="total_value" stroke="var(--accent-blue)" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
          <Line type="monotone" dataKey="invested_amount" stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="5 5" dot={false} />
          <Brush dataKey="date" height={30} stroke="var(--border-light)" fill="var(--surface-2)" tickFormatter={() => ''} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
