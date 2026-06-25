import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { RefreshCw } from "lucide-react";
import marketHolidays from "../../config/marketHolidays.json";

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

const getMarketStatus = () => {
  const now = new Date();
  
  const nyDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const nyDay = nyDate.getDay(); 
  const nyTime = nyDate.getHours() * 100 + nyDate.getMinutes();
  const nyDateString = nyDate.getFullYear() + "-" + String(nyDate.getMonth() + 1).padStart(2, '0') + "-" + String(nyDate.getDate()).padStart(2, '0');
  const isUsaHoliday = marketHolidays.NYSE.includes(nyDateString);
  const isUsaOpen = !isUsaHoliday && nyDay >= 1 && nyDay <= 5 && nyTime >= 930 && nyTime < 1600;

  const inDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const inDay = inDate.getDay();
  const inTime = inDate.getHours() * 100 + inDate.getMinutes();
  const inDateString = inDate.getFullYear() + "-" + String(inDate.getMonth() + 1).padStart(2, '0') + "-" + String(inDate.getDate()).padStart(2, '0');
  const isNseHoliday = marketHolidays.NSE.includes(inDateString);
  const isNseOpen = !isNseHoliday && inDay >= 1 && inDay <= 5 && inTime >= 915 && inTime < 1530;

  return { isUsaOpen, isNseOpen };
};

export default function TopBar() {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || "Gordan Belfort";
  const [marketStatus, setMarketStatus] = useState(getMarketStatus());
  const {
    currency,
    setCurrency,
    usdInr,
    updateConfig,
    family,
    syncStatus,
    runGlobalSync,
    pollSyncStatus,
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

  const hasFailedJobs = syncStatus?.jobs?.some(
    (j) => j.status.toLowerCase() === "failed" || j.status.toLowerCase() === "error"
  );
  const isSyncing = syncStatus?.jobs?.some(
    (j) => {
      const state = j.status.toLowerCase();
      return state === "running" || state === "started" || state === "in_progress";
    }
  );
  const healthColor = hasFailedJobs ? "var(--accent-red)" : isSyncing ? "var(--accent-amber)" : "var(--accent-green)";

  useEffect(() => {
    let intervalId;
    if (isSyncing) {
      intervalId = setInterval(() => {
        pollSyncStatus();
      }, 3000); // Poll every 3 seconds while syncing
    }
    return () => clearInterval(intervalId);
  }, [isSyncing, pollSyncStatus]);

  useEffect(() => {
    const id = setInterval(() => setMarketStatus(getMarketStatus()), 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-title">{title}</div>

      <div
        className="topbar-badge sync-dropdown-container"
        style={{
          marginLeft: "auto",
          marginRight: "16px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          position: "relative",
        }}
      >
        <div
          className="market-status-dot"
          style={{ background: healthColor, boxShadow: `0 0 8px ${healthColor}` }}
        ></div>
        <span style={{ color: "var(--text-secondary)", cursor: "pointer" }}>
          Synced: {lastSynced}
        </span>
        <button
          onClick={() => {
            runGlobalSync();
            // Start spinning immediately for UX
            document.getElementById('refresh-icon').classList.add('spinning');
            setTimeout(() => document.getElementById('refresh-icon').classList.remove('spinning'), 2000);
          }}
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
          title="Force Sync All Pipelines"
        >
          <RefreshCw id="refresh-icon" size={12} />
        </button>

        {/* The Dropdown */}
        <div className="sync-dropdown">
          <h4>System Health</h4>
          {syncStatus?.jobs && syncStatus.jobs.length > 0 ? (
            syncStatus.jobs.map((job) => {
              const state = job.status.toLowerCase();
              const badgeClass = (state === 'success' || state === 'completed') ? 'success' 
                                : (state === 'failed' || state === 'error') ? 'failed' 
                                : 'running';
              const label = badgeClass === 'success' ? 'PASS' : badgeClass === 'failed' ? 'FAIL' : 'IN PROG';
              return (
                <div key={job.job_name} className="sync-job-row">
                  <span className="job-name">{job.job_name}</span>
                  <span className={`job-status ${badgeClass}`}>{label}</span>
                </div>
              );
            })
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No sync data</div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "16px", marginRight: "16px" }}>
        <div
          className="topbar-badge"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
          title={marketStatus.isNseOpen ? "NSE is Open" : "NSE is Closed"}
        >
          <span
            className="market-status-dot"
            style={{
              background: marketStatus.isNseOpen ? "var(--accent-green)" : "var(--accent-red)",
              boxShadow: `0 0 8px ${marketStatus.isNseOpen ? "var(--accent-green)" : "var(--accent-red)"}`,
            }}
          />
          <span style={{ color: marketStatus.isNseOpen ? "var(--accent-green)" : "var(--accent-red)", fontWeight: 500 }}>
            IND
          </span>
        </div>

        <div
          className="topbar-badge"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
          title={marketStatus.isUsaOpen ? "US Markets are Open" : "US Markets are Closed"}
        >
          <span
            className="market-status-dot"
            style={{
              background: marketStatus.isUsaOpen ? "var(--accent-green)" : "var(--accent-red)",
              boxShadow: `0 0 8px ${marketStatus.isUsaOpen ? "var(--accent-green)" : "var(--accent-red)"}`,
            }}
          />
          <span style={{ color: marketStatus.isUsaOpen ? "var(--accent-green)" : "var(--accent-red)", fontWeight: 500 }}>
            USA
          </span>
        </div>
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
