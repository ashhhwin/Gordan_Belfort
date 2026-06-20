import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
} from "recharts";
import { useStore } from "../../store";

export default function NetWorthChart({ filters }) {
  const { history, isFamilyMode, activeUser, users } = useStore();

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

    const earliestDate = new Date(dates[0]);

    // Format data for Recharts
    const data = dates.map((d) => {
      const entry = { date: d };
      const currentDate = new Date(d);

      // Calculate Benchmark (12% annualized)
      const daysDiff = (currentDate - earliestDate) / (1000 * 60 * 60 * 24);
      entry.benchmark = (Math.pow(1.12, daysDiff / 365) - 1) * 100;

      // Calculate Return % for each user
      users.forEach((u) => {
        const userStats = grouped[d][u.id];
        if (userStats && userStats.invested_amount > 0) {
          entry[u.id] =
            (userStats.total_value / userStats.invested_amount - 1) * 100;
        } else {
          entry[u.id] = 0; // fallback to 0 instead of undefined to ensure rendering
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
        height: "400px",
        marginBottom: "20px",
        paddingBottom: "20px",
        display: "flex",
        flexDirection: "column",
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
              Market (12% CAGR)
            </span>
          </div>
          {isFamilyMode &&
            users.map((u) => (
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
        style={{ flex: 1, position: "relative", width: "100%", minHeight: 0 }}
      >
        <ResponsiveContainer
          width="99%"
          height="100%"
          minWidth={0}
          minHeight={0}
        >
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 20, left: 20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              stroke="var(--text-muted)"
              fontSize={11}
              tickMargin={10}
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
              tickFormatter={(tick) => `${tick}%`}
              domain={["dataMin - 2", "dataMax + 2"]}
            />
            <ReferenceLine y={0} stroke="var(--border-light)" />
            <Tooltip content={<CustomTooltip users={users} />} />

            {/* Market Benchmark Line */}
            <Line
              type="monotone"
              dataKey="benchmark"
              stroke="var(--accent-amber)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />

            {/* Portfolio Lines */}
            {isFamilyMode
              ? users.map((u) => (
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

            <Brush
              dataKey="date"
              height={30}
              stroke="var(--border-light)"
              fill="var(--surface-2)"
              tickFormatter={() => ""}
            />
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
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          padding: "12px",
          borderRadius: "8px",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <p
          style={{
            margin: "0 0 8px 0",
            fontSize: "12px",
            color: "var(--text-muted)",
          }}
        >
          {label}
        </p>
        {payload.map((p, i) => {
          const isBenchmark = p.dataKey === "benchmark";
          const user = users.find((u) => u.id === p.dataKey);
          const color = isBenchmark
            ? "var(--accent-amber)"
            : user
              ? user.color
              : "var(--accent-blue)";
          const name = isBenchmark
            ? "Market Benchmark (12%)"
            : user
              ? user.name
              : "Return";

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                margin: "4px 0",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                }}
              />
              <span
                style={{ fontSize: "13px", color: "var(--text-secondary)" }}
              >
                {name}:
              </span>
              <span
                style={{
                  fontSize: "13px",
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
