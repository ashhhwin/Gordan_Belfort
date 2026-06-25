import {
  Building2,
  Globe,
  PieChart,
  Briefcase,
  Car,
  PiggyBank,
  Landmark,
  ScrollText,
  CreditCard,
  Award,
} from "lucide-react";

const ASSET_CATEGORIES = [
  {
    id: "IND_EQUITY",
    label: "IND Stocks",
    icon: Building2,
    color: "var(--accent-blue)",
  },
  {
    id: "US_EQUITY",
    label: "US Stocks",
    icon: Globe,
    color: "var(--accent-purple)",
  },
  {
    id: "MF",
    label: "Mutual Funds",
    icon: PieChart,
    color: "var(--accent-green)",
  },
  { id: "NPS", label: "NPS", icon: Briefcase, color: "var(--accent-amber)" },
  { id: "VEHICLE", label: "Vehicle", icon: Car, color: "var(--text-muted)" },
  { id: "EPF", label: "EPF", icon: PiggyBank, color: "var(--accent-green)" },
  {
    id: "BONDS",
    label: "Bonds",
    icon: ScrollText,
    color: "var(--text-secondary)",
  },
  { id: "PPF", label: "PPF", icon: Landmark, color: "var(--accent-blue)" },
  {
    id: "ESOP",
    label: "ESOPs / RSUs",
    icon: Award,
    color: "var(--accent-gold)",
  },
  {
    id: "BANK",
    label: "Bank Accounts",
    icon: Landmark,
    color: "var(--text-primary)",
  },
];

const LIABILITY_CATEGORIES = [
  {
    id: "CREDIT_CARD",
    label: "Credit Cards",
    icon: CreditCard,
    color: "var(--accent-red)",
  },
];

function fmtVal(n, currency, rate) {
  if (currency === "INR") {
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
    return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  } else {
    const v = n / rate;
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
    return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
}

function CategoryCard({ category, total, holdings, currency, rate, isLiability, onClick }) {
  if (total === 0) return null; // Don't show empty buckets

  const Icon = category.icon;
  const isPos = !isLiability;

  // Find top 3 holdings in this category
  const catHoldings = holdings
    .filter(h => h.assetClass === category.id)
    .sort((a, b) => ((b.cmp || b.avgBuy) * b.qty) - ((a.cmp || a.avgBuy) * a.qty))
    .slice(0, 3);

  return (
    <div
      className="kpi-card-container"
      onClick={() => onClick && onClick(category.id)}
      style={{ cursor: onClick ? "pointer" : "default", height: "160px" }}
    >
      <div className="kpi-card-inner">
        {/* FRONT */}
        <div 
          className="kpi-card-front kpi-card" 
          style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", border: "1px solid var(--border)" }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "4px",
              height: "100%",
              background: category.color,
              opacity: 0.8,
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "var(--text-secondary)",
            }}
          >
            <div style={{ background: `${category.color}15`, padding: "6px", borderRadius: "8px", display: "flex" }}>
              <Icon size={16} color={category.color} />
            </div>
            <span style={{ fontSize: "13px", fontWeight: 500 }}>
              {category.label}
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "22px",
              fontWeight: 700,
              color: isLiability ? "var(--accent-red)" : "var(--text-primary)",
              marginTop: "auto",
              marginBottom: "4px"
            }}
          >
            {fmtVal(total, currency, rate)}
          </div>
        </div>

        {/* BACK */}
        <div className="kpi-card-back" style={{ padding: "16px", border: `1px solid ${category.color}40`, background: "var(--surface-2)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Top Holdings
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
            {catHoldings.length > 0 ? catHoldings.map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%" }}>
                  {h.symbol || h.name}
                </span>
                <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                  {fmtVal((h.cmp || h.avgBuy) * h.qty, currency, rate)}
                </span>
              </div>
            )) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                No active positions
              </div>
            )}
          </div>
          <div style={{ fontSize: 10, color: category.color, marginTop: "auto", textAlign: "right", opacity: 0.8 }}>
            Click to view all &rarr;
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NetWorthGrid({ holdings, currency, rate, onAssetClick }) {
  // Aggregate totals
  const totals = {};

  holdings.forEach((h) => {
    const val = (h.cmp || h.avgBuy) * h.qty;
    totals[h.assetClass] = (totals[h.assetClass] || 0) + val;
  });

  return (
    <div style={{ marginBottom: "32px" }}>
      {/* ASSETS */}
      <h2
        style={{
          fontSize: "14px",
          color: "var(--text-muted)",
          marginBottom: "16px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Assets
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {ASSET_CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.id}
            category={cat}
            total={totals[cat.id] || 0}
            holdings={holdings}
            currency={currency}
            rate={rate}
            onClick={onAssetClick}
          />
        ))}
      </div>

      {/* LIABILITIES */}
      {totals["CREDIT_CARD"] !== undefined && totals["CREDIT_CARD"] !== 0 && (
        <>
          <h2
            style={{
              fontSize: "14px",
              color: "var(--accent-red)",
              marginBottom: "16px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Liabilities
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            {LIABILITY_CATEGORIES.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                total={totals[cat.id] || 0}
                holdings={holdings}
                currency={currency}
                rate={rate}
                isLiability
                onClick={onAssetClick}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
