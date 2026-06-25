import { useState } from "react";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  ChevronUp,
  ChevronDown,
  Users,
  Plus,
  Edit2,
  Trash2,
} from "lucide-react";
import { Chart, registerables } from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";
import { useStore } from "../store";
import HoldingsModal from "../components/portfolio/HoldingsModal";
import HoldingsTable from "../components/portfolio/HoldingsTable";
import NetWorthGrid from "../components/portfolio/NetWorthGrid";
import { calculateTaxMetrics } from "../utils/taxCalc";
import { calculateXIRR } from "../utils/mathCalc";
import { fmtVal } from "../utils/formatters";
import ChartModal from "../components/portfolio/ChartModal";

Chart.register(...registerables);

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtINR(n) {
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({
  icon: Icon,
  label,
  value,
  delta,
  deltaLabel,
  glowColor,
  iconBg,
  breakdown,
  chartData,
  onClick,
}) {
  const isPos = delta >= 0;
  
  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false } },
    elements: { point: { radius: 0 }, line: { tension: 0.4, borderWidth: 2 } }
  };

  // We use inline click to optionally show details later
  return (
    <div className="kpi-card-container" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div className="kpi-card-inner">
        {/* Front */}
        <div className="kpi-card-front kpi-card">
          <div className="kpi-card-glow" style={{ background: glowColor }} />
          <div className="kpi-icon" style={{ background: iconBg }}>
            <Icon size={18} color={glowColor} strokeWidth={2} />
          </div>
          <div className="kpi-label">{label}</div>
          <div className="kpi-value">{value}</div>
          <div className="kpi-sub">
            <span className={`kpi-delta ${isPos ? "pos" : "neg"}`}>
              {isPos ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              {Math.abs(delta).toFixed(2)}%
            </span>
            <span className="text-muted" style={{ fontSize: 11 }}>
              {deltaLabel}
            </span>
          </div>
        </div>
        
        {/* Back */}
        <div className="kpi-card-back">
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, fontWeight: 500 }}>
            {label} Details
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", position: 'relative' }}>
            {chartData && chartData.datasets ? (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                <Line data={chartData} options={chartOpts} />
              </div>
            ) : breakdown ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "auto" }}>
                {breakdown.map((b) => (
                  <div key={b.label || b.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: b.color }} />
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {b.label || b.name}: {b.value || b.val}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No trend data</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sector Donut ──────────────────────────────────────────────────────────────
const SECTOR_COLORS = [
  "#4B7BEC",
  "#00D4A1",
  "#F7B731",
  "#FF4D6A",
  "#9B59B6",
  "#1ABC9C",
  "#E67E22",
  "#E74C3C",
];

function SectorDonut({ holdings }) {
  const sectors = {};
  holdings.forEach((h) => {
    const val = h.cmp * h.qty;
    sectors[h.sector || "Other"] = (sectors[h.sector || "Other"] || 0) + val;
  });
  const labels = Object.keys(sectors);
  const data = Object.values(sectors);
  const total = data.reduce((a, b) => a + b, 0);

  const chartData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: SECTOR_COLORS.slice(0, labels.length),
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
        <div className="card-title">Sector Allocation</div>
      </div>
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
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total</div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            {fmtINR(total)}
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
        {labels.map((l, i) => (
          <div
            key={l}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: SECTOR_COLORS[i],
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
              {l}
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
    </div>
  );
}

const iconBtnStyle = {
  background: "none",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: 4,
  borderRadius: 4,
};

import NetWorthChart from "../components/portfolio/NetWorthChart";
import PortfolioFilters from "../components/portfolio/PortfolioFilters";
import AssetAllocation from "../components/portfolio/AssetAllocation";
import TopMovers from "../components/portfolio/TopMovers";
import PortfolioWeights from "../components/portfolio/PortfolioWeights";

// ─── Portfolio Page ────────────────────────────────────────────────────────────
export default function Portfolio() {
  const {
    currency,
    usdInr: rate,
    activeUser,
    holdings,
    isFamilyMode,
    toggleFamilyMode,
    users,
    family,
    deleteHolding,
    history,
  } = useStore();

  const [selectedChart, setSelectedChart] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const [filters, setFilters] = useState({
    userId: "ALL",
    assetClass: "ALL",
    performance: "ALL",
  });

  const config = family?.config;

  const filteredHoldings = holdings.filter((h) => {
    if (!isFamilyMode && h.user_id !== activeUser?.id) return false;
    if (
      isFamilyMode &&
      filters.userId !== "ALL" &&
      h.user_id !== filters.userId
    )
      return false;
    if (filters.assetClass !== "ALL" && h.assetClass !== filters.assetClass)
      return false;
    const pnl = (h.cmp - h.avgBuy) * h.qty;
    if (filters.performance === "GAINERS" && pnl <= 0) return false;
    if (filters.performance === "LOSERS" && pnl >= 0) return false;
    return true;
  });

  const totalAssets = filteredHoldings
    .filter((h) => h.assetClass !== "CREDIT_CARD")
    .reduce((s, h) => s + (h.cmp || h.avgBuy) * h.qty, 0);

  const totalLiabilities = Math.abs(
    filteredHoldings
      .filter((h) => h.assetClass === "CREDIT_CARD")
      .reduce((s, h) => s + (h.cmp || h.avgBuy) * h.qty, 0),
  );

  const netWorth = totalAssets - totalLiabilities;

  // Traditional equity PNL (excluding non-tradables for these metrics)
  // The user wants ALL assets to be included in totalInvested/totalCurrent/dayGain!
  const tradableHoldings = filteredHoldings.filter((h) => h.assetClass !== "CREDIT_CARD");
  const otherHoldings = []; // Deprecated, all non-credit card assets are now tradableHoldings
  const liabilities = filteredHoldings.filter(
    (h) => h.assetClass === "CREDIT_CARD",
  );
  const totalInvested = tradableHoldings.reduce(
    (s, h) => s + h.avgBuy * h.qty,
    0,
  );
  const totalCurrent = tradableHoldings.reduce((s, h) => s + h.cmp * h.qty, 0);
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  // Extract previous date from history to calculate true Day Gain safely without UTC timezone shift
  const safeHistory = Array.isArray(history) ? history : [];
  const uniqueDates = [
    ...new Set(safeHistory.map((h) => h.date.split("T")[0]))
  ].sort((a, b) => new Date(b) - new Date(a));
  
  // Use en-CA to force local YYYY-MM-DD format
  const todayStr = new Date().toLocaleDateString('en-CA');
  const previousDateStr = uniqueDates.find((d) => d < todayStr) || uniqueDates[0];

  let prevTotal = 0;
  let prevInvested = 0;
  if (previousDateStr) {
    const prevHistory = safeHistory.filter((row) => {
      if (!isFamilyMode && row.user_id !== activeUser?.id) return false;
      if (isFamilyMode && filters.userId !== "ALL" && row.user_id !== filters.userId) return false;
      if (filters.assetClass !== "ALL" && row.asset_class !== filters.assetClass) return false;
      if (row.asset_class === 'CREDIT_CARD') return false;
      return row.date.startsWith(previousDateStr);
    });
    prevTotal = prevHistory.reduce((s, row) => s + parseFloat(row.total_value || 0), 0);
    prevInvested = prevHistory.reduce((s, row) => s + parseFloat(row.invested_amount || 0), 0);
  }

  let dayGain = 0;
  let dayGainPct = 0;
  if (previousDateStr && prevTotal > 0) {
    const capitalAdded = totalInvested - prevInvested;
    dayGain = totalCurrent - prevTotal - capitalAdded;
    dayGainPct = (dayGain / prevTotal) * 100;
  }

  // Real CAGR Calculation
  let cagr = 0;
  if (totalInvested > 0 && uniqueDates.length > 0) {
     const firstDateStr = uniqueDates[uniqueDates.length - 1]; // sorted descending
     const firstDate = new Date(firstDateStr);
     const today = new Date();
     // Ensure minimum 1 year so short periods don't scale up exponentially
     const years = Math.max((today - firstDate) / (1000 * 60 * 60 * 24 * 365.25), 1.0);
     cagr = (Math.pow(totalCurrent / totalInvested, 1 / years) - 1) * 100;
  }

  // Value Breakdown for Net Worth Hover
  let valueBreakdown;
  if (isFamilyMode) {
    valueBreakdown = users.map((u) => {
      const uTotal = filteredHoldings
        .filter((h) => h.user_id === u.id)
        .reduce((s, h) => s + (h.cmp || h.avgBuy) * h.qty, 0);
      return {
        label: u.name,
        value: fmtVal(uTotal, currency, rate),
        color: u.color,
      };
    });
  } else {
    valueBreakdown = [
      {
        label: "Tradable",
        value: fmtVal(
          tradableHoldings.reduce((s, h) => s + (h.cmp || h.avgBuy) * h.qty, 0),
          currency,
          rate,
        ),
        color: "var(--accent-blue)",
      },
      {
        label: "Other Assets",
        value: fmtVal(
          otherHoldings.reduce((s, h) => s + (h.cmp || h.avgBuy) * h.qty, 0),
          currency,
          rate,
        ),
        color: "var(--accent-green)",
      },
      {
        label: "Liabilities",
        value: fmtVal(
          liabilities.reduce((s, h) => s + (h.cmp || h.avgBuy) * h.qty, 0),
          currency,
          rate,
        ),
        color: "var(--accent-red)",
      },
    ];
  }

  // Generate Sparklines
  const getTrendData = (metricAccessor, title, themeColor) => {
      if (uniqueDates.length === 0) return null;
      const ascDates = [...uniqueDates].sort((a,b) => new Date(a) - new Date(b));
      
      const fullDataPoints = ascDates.map(dateStr => {
          const rows = safeHistory.filter(row => {
              if (!isFamilyMode && row.user_id !== activeUser?.id) return false;
              if (isFamilyMode && filters.userId !== "ALL" && row.user_id !== filters.userId) return false;
              if (filters.assetClass !== "ALL" && row.asset_class !== filters.assetClass) return false;
              return row.date.startsWith(dateStr);
          });
          return { date: dateStr, value: metricAccessor(rows) };
      });
      // Push today's live value to the end
      fullDataPoints.push({ date: new Date().toLocaleDateString('en-CA'), value: metricAccessor(null, true) });
      
      // For the sparkline, only use the last 30 days
      const sparklineData = fullDataPoints.slice(-30);
      
      return {
          title,
          themeColor,
          rawData: fullDataPoints, // FULL history for the detailed modal
          chartData: {             // 30-day subset for the tiny back-of-card graph
              labels: sparklineData.map(d => d.date),
              datasets: [{
                  data: sparklineData.map(d => d.value),
                  borderColor: 'rgba(255, 255, 255, 0.4)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  fill: true,
              }]
          }
      }
  }

  const netWorthTrend = getTrendData((rows, isToday) => {
      if (isToday) return netWorth;
      const tAssets = rows.filter(r => r.asset_class !== 'CREDIT_CARD').reduce((s, r) => s + parseFloat(r.total_value || 0), 0);
      const tLiab = rows.filter(r => r.asset_class === 'CREDIT_CARD').reduce((s, r) => s + parseFloat(r.total_value || 0), 0);
      return tAssets - Math.abs(tLiab);
  }, "Net Worth", "var(--accent-blue)");
  
  const liabilitiesTrend = getTrendData((rows, isToday) => {
      if (isToday) return totalLiabilities;
      return Math.abs(rows.filter(r => r.asset_class === 'CREDIT_CARD').reduce((s, r) => s + parseFloat(r.total_value || 0), 0));
  }, "Liabilities", "var(--accent-amber)");
  
  const pnlTrend = getTrendData((rows, isToday) => {
      if (isToday) return totalPnl;
      const tInv = rows.filter(r => !['CREDIT_CARD'].includes(r.asset_class)).reduce((s, r) => s + parseFloat(r.invested_amount || 0), 0);
      const tVal = rows.filter(r => !['CREDIT_CARD'].includes(r.asset_class)).reduce((s, r) => s + parseFloat(r.total_value || 0), 0);
      return tVal - tInv;
  }, "Total P&L", totalPnl >= 0 ? "var(--accent-purple)" : "var(--accent-red)");

  return (
    <div className="page-container">
      <div className="page-content page-fade">
        {/* ── Admin Family Toggle ── */}
        {activeUser?.role === "admin" && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                background: "var(--surface-2)",
                padding: 4,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
              }}
            >
              <button
                onClick={() => isFamilyMode && toggleFamilyMode()}
                style={{
                  padding: "6px 20px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: !isFamilyMode ? "var(--surface)" : "transparent",
                  color: !isFamilyMode
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
                  boxShadow: !isFamilyMode ? "var(--shadow-sm)" : "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  fontWeight: 600,
                  fontSize: 13,
                  transition: "all 0.2s",
                }}
              >
                My Portfolio
              </button>
              <button
                onClick={() => !isFamilyMode && toggleFamilyMode()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 20px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: isFamilyMode ? "var(--surface)" : "transparent",
                  color: isFamilyMode
                    ? "var(--accent-blue)"
                    : "var(--text-muted)",
                  boxShadow: isFamilyMode ? "var(--shadow-sm)" : "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  fontWeight: 600,
                  fontSize: 13,
                  transition: "all 0.2s",
                }}
              >
                <Users size={14} /> Family Aggregate
              </button>
            </div>
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >

              {!isFamilyMode && (
                <button
                  onClick={() => {
                    setEditingHolding(null);
                    setIsModalOpen(true);
                  }}
                  style={{
                    background: "var(--accent-gold)",
                    color: "#080E1E",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: "var(--radius-sm)",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <Plus size={14} /> Add Holding
                </button>
              )}
            </div>
          </div>
        )}

        {/* KPI Row */}
        <div className="kpi-grid" style={{ marginBottom: 24, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <KPICard
            icon={Wallet}
            label="Total Net Worth"
            value={fmtVal(netWorth, currency, rate)}
            delta={0} // Hide delta for net worth in MVP
            deltaLabel="Assets - Liabilities"
            glowColor="var(--accent-blue)"
            iconBg="var(--accent-blue-dim)"
            breakdown={valueBreakdown}
            chartData={netWorthTrend?.chartData}
            onClick={() => netWorthTrend && setSelectedChart(netWorthTrend)}
          />
          <KPICard
            icon={TrendingDown}
            label="Liabilities"
            value={fmtVal(totalLiabilities, currency, rate)}
            delta={0}
            deltaLabel="Total Debt"
            glowColor="var(--accent-amber)"
            iconBg="var(--accent-amber-dim)"
            chartData={liabilitiesTrend?.chartData}
            onClick={() => liabilitiesTrend && setSelectedChart(liabilitiesTrend)}
          />
          <KPICard
            icon={dayGain >= 0 ? TrendingUp : TrendingDown}
            label="Day Gain"
            value={fmtVal(Math.abs(dayGain), currency, rate)}
            delta={dayGainPct}
            deltaLabel="Today"
            glowColor={
              dayGain >= 0 ? "var(--accent-green)" : "var(--accent-red)"
            }
            iconBg={
              dayGain >= 0 ? "var(--accent-green-dim)" : "var(--accent-red-dim)"
            }
          />
          <KPICard
            icon={totalPnl >= 0 ? ArrowUpRight : ArrowDownRight}
            label="Total P&L"
            value={fmtVal(Math.abs(totalPnl), currency, rate)}
            delta={totalPnlPct}
            deltaLabel="All Time"
            glowColor={
              totalPnl >= 0 ? "var(--accent-purple)" : "var(--accent-red)"
            }
            iconBg={
              totalPnl >= 0
                ? "var(--accent-purple-dim)"
                : "var(--accent-red-dim)"
            }
            chartData={pnlTrend?.chartData}
            onClick={() => pnlTrend && setSelectedChart(pnlTrend)}
          />
          <KPICard
            icon={Percent}
            label="Est. CAGR"
            value={`${cagr.toFixed(1)}%`}
            delta={0}
            deltaLabel="Annualized"
            glowColor="var(--accent-gold)"
            iconBg="var(--accent-gold-dim)"
          />
        </div>

        <PortfolioFilters
          filters={filters}
          setFilters={setFilters}
          availableUsers={users}
        />
        <NetWorthChart filters={filters} />

        {/* Advanced Analytics Grid */}
        <h2
          style={{
            fontSize: "14px",
            color: "var(--text-muted)",
            marginBottom: "16px",
            marginTop: "32px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Portfolio Analytics
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "20px",
            marginBottom: "40px",
          }}
        >
          <AssetAllocation holdings={filteredHoldings} />
          <SectorDonut
            holdings={filteredHoldings.filter((h) =>
              ["IND_EQUITY", "US_EQUITY", "MF"].includes(h.assetClass),
            )}
          />
          <PortfolioWeights holdings={filteredHoldings} />
          <TopMovers
            holdings={filteredHoldings}
            currency={currency}
            rate={rate}
          />
        </div>

        
        
        {/* ── Net Worth Grid ── */}
        <NetWorthGrid
          holdings={filteredHoldings}
          currency={currency}
          rate={rate}
        />

        
        {/* Holdings Table */}
        <HoldingsTable
          holdings={filteredHoldings}
          currency={currency}
          rate={rate}
          isFamilyMode={isFamilyMode}
          config={config}
          onEdit={(h) => {
            setEditingHolding(h);
            setIsModalOpen(true);
          }}
          onDelete={(id) => deleteHolding(id)}
        />

        {/* Holdings Modal */}
        <HoldingsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          editingHolding={editingHolding}
        />

        

        {/* Selected Chart Details Modal */}
        <ChartModal 
          selectedChart={selectedChart} 
          onClose={() => setSelectedChart(null)}
          currency={currency}
          rate={rate}
        />
      </div>
    </div>
  );
}
