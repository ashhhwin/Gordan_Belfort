import { Doughnut } from "react-chartjs-2";

const ASSET_COLORS = {
  IND_EQUITY: "#4B7BEC",
  US_EQUITY: "#00D4A1",
  MF: "#F7B731",
  NPS: "#FF4D6A",
  EPF: "#1ABC9C",
  PPF: "#9B59B6",
  BANK: "#E67E22",
  CREDIT_CARD: "#E74C3C",
  Other: "#7f8c8d",
};

const ASSET_LABELS = {
  IND_EQUITY: "IND Stocks",
  US_EQUITY: "US Stocks",
  MF: "Mutual Funds",
  NPS: "NPS",
  EPF: "EPF",
  PPF: "PPF",
  BANK: "Bank Accounts",
  CREDIT_CARD: "Credit Cards",
};

export default function AssetAllocation({ holdings }) {
  const assets = {};

  // Filter out liabilities like CREDIT_CARD for asset allocation? Usually yes.
  const assetHoldings = holdings.filter((h) => h.assetClass !== "CREDIT_CARD");

  assetHoldings.forEach((h) => {
    const val = (h.cmp || h.avgBuy) * h.qty;
    assets[h.assetClass || "Other"] =
      (assets[h.assetClass || "Other"] || 0) + val;
  });

  const labels = Object.keys(assets).map((k) => ASSET_LABELS[k] || k);
  const data = Object.values(assets);
  const total = data.reduce((a, b) => a + b, 0);

  const colors = Object.keys(assets).map(
    (k) => ASSET_COLORS[k] || ASSET_COLORS["Other"],
  );

  const chartData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: colors,
        borderColor: "var(--surface)",
        borderWidth: 3,
        hoverBorderWidth: 4,
      },
    ],
  };

  const opts = {
    cutout: "68%",
    plugins: { legend: { display: false }, tooltip: { padding: 10 } },
    animation: { animateScale: true, duration: 800 },
  };

  return (
    <div className="card" style={{ height: "100%" }}>
      <div className="card-header">
        <div className="card-title">Asset Allocation</div>
      </div>
      {total > 0 ? (
        <>
          <div
            style={{
              position: "relative",
              width: 180,
              height: 180,
              margin: "0 auto 16px",
            }}
          >
            <Doughnut data={chartData} options={opts} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Total Assets
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                100%
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 150,
              overflowY: "auto",
            }}
          >
            {Object.keys(assets).map((k, i) => (
              <div
                key={k}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: colors[i],
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    flex: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {ASSET_LABELS[k] || k}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--text-muted)",
                  }}
                >
                  {((data[i] / total) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p className="text-muted">No assets found.</p>
        </div>
      )}
    </div>
  );
}
