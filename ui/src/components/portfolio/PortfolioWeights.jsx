export default function PortfolioWeights({ holdings }) {
  // Only tradable assets with actual market value
  const validHoldings = holdings.filter(
    (h) =>
      (h.cmp || h.avgBuy) > 0 && h.qty > 0 && h.assetClass !== "CREDIT_CARD",
  );

  const totalValue = validHoldings.reduce(
    (s, h) => s + (h.cmp || h.avgBuy) * h.qty,
    0,
  );

  const mapped = validHoldings
    .map((h) => {
      const current = (h.cmp || h.avgBuy) * h.qty;
      const weight = totalValue > 0 ? (current / totalValue) * 100 : 0;
      return { ...h, current, weight };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);

  if (mapped.length === 0) {
    return (
      <div className="card" style={{ height: "100%" }}>
        <div className="card-header">
          <div className="card-title">Portfolio Weightings</div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p className="text-muted">No holdings found.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <div className="card-header">
        <div className="card-title">Top Holdings Concentration</div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginTop: 8,
        }}
      >
        {mapped.map((h) => (
          <div
            key={h.id}
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 12,
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {h.symbol}
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                {h.weight.toFixed(1)}%
              </span>
            </div>
            <div
              style={{
                width: "100%",
                height: 6,
                background: "var(--surface-2)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${h.weight}%`,
                  background: "var(--accent-blue)",
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
