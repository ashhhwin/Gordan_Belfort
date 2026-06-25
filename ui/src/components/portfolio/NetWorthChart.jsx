import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useStore } from "../../store";

export default function NetWorthChart({ filters }) {
  const { history, isFamilyMode, activeUser, users, marketIndices } = useStore();

  const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];

    // Filter history based on assetClass filters if necessary
    const filteredRows = history.filter((row) => {
      if (
        filters.assetClass !== "ALL" &&
        row.asset_class !== filters.assetClass
      )
        return false;
      return true;
    });

    // Group by Date and User
    const grouped = {};
    filteredRows.forEach((row) => {
      const d = new Date(row.date).toISOString().split("T")[0];
      if (!grouped[d]) grouped[d] = { date: d };

      const uid = row.user_id;
      if (!grouped[d][uid]) {
        grouped[d][uid] = { total_value: 0, invested_amount: 0 };
      }
      grouped[d][uid].total_value += parseFloat(row.total_value || 0);
      grouped[d][uid].invested_amount += parseFloat(row.invested_amount || 0);
    });

    const dates = Object.keys(grouped).sort(
      (a, b) => new Date(a) - new Date(b),
    );
    if (dates.length === 0) return [];

    const getIndexForDate = (dateStr) => {
      if (!marketIndices || !marketIndices.length) return {};
      const targetTime = new Date(dateStr).getTime();
      let bestNifty = null;
      let bestSpy = null;
      for (let i = 0; i < marketIndices.length; i++) {
         const mTime = new Date(marketIndices[i].date).getTime();
         if (mTime <= targetTime) {
           if (marketIndices[i].nifty) bestNifty = marketIndices[i].nifty;
           if (marketIndices[i].spy) bestSpy = marketIndices[i].spy;
         } else {
           break;
         }
      }
      return { nifty: bestNifty, spy: bestSpy };
    };

    const baseIndices = getIndexForDate(dates[0]);
    if (!baseIndices.nifty) baseIndices.nifty = marketIndices?.find(m => m.nifty)?.nifty;
    if (!baseIndices.spy) baseIndices.spy = marketIndices?.find(m => m.spy)?.spy;

// Pre-calculate base portfolio returns for each user on the earliest date
    const currentTWR = {};
    const prevInvested = {};
    const prevTotal = {};

    users.forEach(u => {
      currentTWR[u.id] = 1;
      prevInvested[u.id] = 0;
      prevTotal[u.id] = 0;
    });

    // Format data for Recharts
    const data = dates.map((d) => {
      const entry = { date: d };

      // Base index handling
      const mIdx = getIndexForDate(d);
      if (baseIndices.nifty && mIdx.nifty) {
        entry.nifty = ((mIdx.nifty / baseIndices.nifty) - 1) * 100;
      }
      if (baseIndices.spy && mIdx.spy) {
        entry.spy = ((mIdx.spy / baseIndices.spy) - 1) * 100;
      }

      // Calculate Relative Return % for each user over this timeframe using TWR
      users.forEach((u) => {
        const userStats = grouped[d][u.id];
        if (userStats && userStats.invested_amount > 0) {
          if (prevInvested[u.id] === 0) {
            // First day
            prevInvested[u.id] = userStats.invested_amount;
            prevTotal[u.id] = userStats.total_value;
            entry[u.id] = 0;
          } else {
            // TWR calculation
            const cashInjected = userStats.invested_amount - prevInvested[u.id];
            let periodReturn = 1;
            const startVal = prevTotal[u.id] + cashInjected;
            if (startVal > 0) {
              periodReturn = userStats.total_value / startVal;
            }
            
            currentTWR[u.id] = currentTWR[u.id] * periodReturn;
            entry[u.id] = (currentTWR[u.id] - 1) * 100;
            
            prevInvested[u.id] = userStats.invested_amount;
            prevTotal[u.id] = userStats.total_value;
          }
        } else {
          entry[u.id] = 0;
        }
      });
      return entry;
    });

    return data;
  }, [history, filters, users]);

  if (chartData.length === 0) {
    return (
      <div
        className="card"
        style={{
          height: "300px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p className="text-muted">
          No historical data available for the selected filters.
        </p>
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{
        marginBottom: "20px",
        paddingBottom: "20px",
      }}
    >
      <div
        className="card-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div className="card-title">Cumulative Performance (Return %)</div>
        <div style={{ fontSize: 12, display: "flex", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--accent-amber)",
              }}
            />
            <span style={{ color: "var(--text-muted)" }}>
              NIFTY 50
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--accent-purple)",
              }}
            />
            <span style={{ color: "var(--text-muted)" }}>
              S&P 500 (SPY)
            </span>
          </div>
          {isFamilyMode &&
            users.filter(u => filters.userId === "ALL" || u.id === filters.userId).map((u) => (
              <div
                key={u.id}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: u.color,
                  }}
                />
                <span style={{ color: "var(--text-muted)" }}>
                  {u.name.split(" ")[0]}
                </span>
              </div>
            ))}
          {!isFamilyMode && activeUser && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--accent-blue)",
                }}
              />
              <span style={{ color: "var(--text-muted)" }}>My Portfolio</span>
            </div>
          )}
        </div>
      </div>
      <div
        style={{ width: "100%", height: "320px", marginTop: "20px" }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 20, left: 20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              stroke="var(--text-muted)"
              fontSize={11}
              axisLine={false}
              tickLine={false}
              tickMargin={12}
              minTickGap={30}
              tickFormatter={(tick) =>
                new Date(tick).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              }
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={11}
              axisLine={false}
              tickLine={false}
              dx={-10}
              tickFormatter={(tick) => `${tick}%`}
              domain={["dataMin - 2", "dataMax + 2"]}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
            <Tooltip content={<CustomTooltip users={users} />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} />

            {/* Market Benchmark Lines */}
            <Line
              type="monotone"
              dataKey="nifty"
              stroke="var(--accent-amber)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="spy"
              stroke="var(--accent-purple)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 4 }}
            />

            {/* Portfolio Lines */}
            {isFamilyMode
              ? users.filter(u => filters.userId === "ALL" || u.id === filters.userId).map((u) => (
                  <Line
                    key={u.id}
                    type="monotone"
                    dataKey={u.id}
                    stroke={u.color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))
              : activeUser && (
                  <Line
                    type="monotone"
                    dataKey={activeUser.id}
                    stroke="var(--accent-blue)"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
const CustomTooltip = ({ active, payload, label, users }) => {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: 'rgba(20, 20, 22, 0.8)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '12px 16px',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          color: 'white'
        }}
      >
        <p
          style={{
            margin: "0 0 12px 0",
            fontSize: "12px",
            color: "rgba(255,255,255,0.6)",
          }}
        >
          {new Date(label).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
        </p>
        {payload.map((p, i) => {
          const isNifty = p.dataKey === "nifty";
          const isSpy = p.dataKey === "spy";
          const user = users.find((u) => u.id === p.dataKey);
          
          let color = "var(--accent-blue)";
          let name = "Return";
          
          if (isNifty) {
            color = "var(--accent-amber)";
            name = "NIFTY 50";
          } else if (isSpy) {
            color = "var(--accent-purple)";
            name = "S&P 500 (SPY)";
          } else if (user) {
            color = user.color;
            name = user.name.split(" ")[0];
          }

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20,
                margin: "6px 0",
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: color,
                      boxShadow: `0 0 8px ${color}`
                    }}
                  />
                  <span
                    style={{ fontSize: "13px", color: "var(--text-secondary)" }}
                  >
                    {name}
                  </span>
              </div>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color:
                    p.value >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                }}
              >
                {p.value > 0 ? "+" : ""}
                {(p.value || 0).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};
