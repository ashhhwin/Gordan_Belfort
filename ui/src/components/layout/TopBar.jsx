import { useLocation } from "react-router-dom";
import { useStore } from "../../store";
import { RefreshCw } from "lucide-react";

const PAGE_TITLES = {
  "/": "Portfolio Overview",
  "/assistant": "AI Assistant",
  "/market": "Market Overview",
  "/screener": "Stock Screener",
  "/options": "Options Desk",
  "/analytics": "Analytics",
  "/watchlist": "Watchlist",
  "/alerts": "Alerts",
  "/news": "News",
  "/settings": "Settings",
  "/sync-jobs": "Sync Jobs",
};

export default function TopBar() {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || "Gordan Belfort";
  const {
    currency,
    setCurrency,
    usdInr,
    updateConfig,
    family,
    syncStatus,
    initApp,
  } = useStore();

  const handleToggle = (c) => {
    setCurrency(c); // Instant local update
    if (family) {
      updateConfig({ ...(family.config || {}), baseCurrency: c }); // Save in background
    }
  };

  const fmtRate = usdInr ? `₹${usdInr.toFixed(2)} / $1` : "—";

  const lastSynced = syncStatus?.last_synced
    ? new Date(syncStatus.last_synced).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Unknown";

  return (
    <header className="topbar">
      <div className="topbar-title">{title}</div>

      <div
        className="topbar-badge"
        style={{
          marginLeft: "auto",
          marginRight: "16px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div
          className="market-status-dot"
          style={{ background: "var(--accent-gold)" }}
        ></div>
        <span style={{ color: "var(--text-secondary)" }}>
          Synced: {lastSynced}
        </span>
        <button
          onClick={() => initApp()}
          style={{
            background: "none",
            border: "1px solid var(--border-light)",
            borderRadius: "6px",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            color: "var(--text-secondary)",
            marginLeft: "4px",
          }}
          title="Force Sync"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div
        className="topbar-badge"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginRight: "16px",
        }}
      >
        <span
          className="market-status-dot"
          style={{
            background: "var(--accent-green)",
            boxShadow: "0 0 8px var(--accent-green)",
          }}
        />
        <span style={{ color: "var(--accent-green)", fontWeight: 500 }}>
          NSE Live
        </span>
      </div>

      <div className="forex-rate" title="Live USD/INR Rate">
        {usdInr ? (
          fmtRate
        ) : (
          <span style={{ color: "var(--text-muted)" }}>Fetching rate...</span>
        )}
      </div>

      <div className="currency-toggle">
        <button
          className={`currency-btn ${currency === "INR" ? "active" : ""}`}
          onClick={() => handleToggle("INR")}
        >
          ₹ INR
        </button>
        <button
          className={`currency-btn ${currency === "USD" ? "active" : ""}`}
          onClick={() => handleToggle("USD")}
        >
          $ USD
        </button>
      </div>
    </header>
  );
}
