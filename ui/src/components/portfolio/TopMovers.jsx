import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function TopMovers({ holdings }) {
  // We only want to look at tradable assets that have P&L
  const tradableHoldings = holdings.filter((h) =>
    ["IND_EQUITY", "US_EQUITY", "MF", "CRYPTO"].includes(h.assetClass),
  );

  const mapped = tradableHoldings.map((h) => {
    const invested = h.avgBuy * h.qty;
    const current = h.cmp * h.qty;
    const pnl = current - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...h, pnl, pnlPct };
  });

  const gainers = mapped
    .filter((h) => h.pnl > 0)
    .sort((a, b) => b.pnlPct - a.pnlPct)
    .slice(0, 5);
  const losers = mapped
    .filter((h) => h.pnl < 0)
    .sort((a, b) => a.pnlPct - b.pnlPct)
    .slice(0, 5);

  const renderList = (items, isGain) => {
    if (items.length === 0)
      return (
        <p className="text-muted" style={{ fontSize: 12 }}>
          No data available.
        </p>
      );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((h) => (
          <div
            key={h.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                }}
              >
                {h.symbol}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                }}
              >
                {h.name}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: isGain ? "var(--accent-green)" : "var(--accent-red)",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {isGain ? "+" : ""}
                {h.pnlPct.toFixed(2)}%
                {isGain ? (
                  <ArrowUpRight size={14} />
                ) : (
                  <ArrowDownRight size={14} />
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="card"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <div className="card-header">
        <div className="card-title">Top Movers (All Time)</div>
      </div>
      <div style={{ display: "flex", flex: 1, gap: 20 }}>
        <div style={{ flex: 1 }}>
          <h4
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: 12,
              letterSpacing: "0.05em",
            }}
          >
            Top Gainers
          </h4>
          {renderList(gainers, true)}
        </div>
        <div style={{ width: 1, background: "var(--border)" }} />
        <div style={{ flex: 1 }}>
          <h4
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: 12,
              letterSpacing: "0.05em",
            }}
          >
            Top Losers
          </h4>
          {renderList(losers, false)}
        </div>
      </div>
    </div>
  );
}
