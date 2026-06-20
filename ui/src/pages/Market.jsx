import { useEffect, useState } from "react";
import { useMarketStore } from "../store/marketStore";
import {
  TrendingUp,
  Calendar,
  Search,
  LineChart,
  Building2,
  BarChart2,
  Activity,
} from "lucide-react";

export default function Market() {
  const [activeTab, setActiveTab] = useState("movers");
  const [searchTicker, setSearchTicker] = useState("AAPL");

  // Filters
  const [region, setRegion] = useState("USA");
  const [marketSearch, setMarketSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [minCapFilter, setMinCapFilter] = useState("");

  const {
    marketOverview,
    earningsCalendar,
    estimates,
    isLoadingOverview,
    isLoadingEarnings,
    isLoadingEstimates,
    fetchMarketOverview,
    fetchEarningsCalendar,
    fetchEstimates,
  } = useMarketStore();

  useEffect(() => {
    fetchMarketOverview({
      region,
      search: marketSearch,
      industry: industryFilter,
      minCap: minCapFilter,
    });
  }, [region, marketSearch, industryFilter, minCapFilter, fetchMarketOverview]);

  useEffect(() => {
    fetchEarningsCalendar();
    fetchEstimates(searchTicker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchTicker.trim()) {
      fetchEstimates(searchTicker.trim());
    }
  };

  return (
    <div className="page-content page-fade">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            className="text-primary"
            style={{ fontSize: 24, marginBottom: 4 }}
          >
            USA Market Feeds
          </h1>
          <p className="text-muted" style={{ fontSize: 13 }}>
            Live daily tracking of market movers, earnings, and analyst
            consensus.
          </p>
        </div>
      </div>

      <div className="tab-strip">
        <button
          className={`tab-btn ${activeTab === "movers" ? "active" : ""}`}
          onClick={() => setActiveTab("movers")}
        >
          <TrendingUp
            size={14}
            style={{
              marginRight: 6,
              display: "inline-block",
              verticalAlign: "text-bottom",
            }}
          />
          Top Movers
        </button>
        <button
          className={`tab-btn ${activeTab === "earnings" ? "active" : ""}`}
          onClick={() => setActiveTab("earnings")}
        >
          <Calendar
            size={14}
            style={{
              marginRight: 6,
              display: "inline-block",
              verticalAlign: "text-bottom",
            }}
          />
          Earnings Calendar
        </button>
        <button
          className={`tab-btn ${activeTab === "estimates" ? "active" : ""}`}
          onClick={() => setActiveTab("estimates")}
        >
          <BarChart2
            size={14}
            style={{
              marginRight: 6,
              display: "inline-block",
              verticalAlign: "text-bottom",
            }}
          />
          Analyst Estimates
        </button>
      </div>

      <div
        className="card glass-card"
        style={{
          flex: 1,
          display: activeTab === "movers" ? "flex" : "none",
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
          <div>
            <h3 className="card-title">Equities Screener (OHLCV)</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>
              {marketOverview.length} results
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <select
              className="filter-select"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                padding: "6px 12px",
                borderRadius: "4px",
              }}
            >
              <option value="USA">USA Markets</option>
              <option value="IND">IND Markets (NSE)</option>
            </select>

            <input
              type="text"
              placeholder="Search Ticker..."
              value={marketSearch}
              onChange={(e) => setMarketSearch(e.target.value)}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                padding: "6px 12px",
                borderRadius: "4px",
                width: 140,
              }}
            />

            {region === "USA" && (
              <>
                <select
                  value={industryFilter}
                  onChange={(e) => setIndustryFilter(e.target.value)}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    padding: "6px 12px",
                    borderRadius: "4px",
                  }}
                >
                  <option value="">All Industries</option>
                  <option value="Technology">Technology</option>
                  <option value="Finance">Finance</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Consumer Discretionary">Consumer Disc.</option>
                </select>

                <select
                  value={minCapFilter}
                  onChange={(e) => setMinCapFilter(e.target.value)}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    padding: "6px 12px",
                    borderRadius: "4px",
                  }}
                >
                  <option value="">Any Market Cap</option>
                  <option value="Mega">Mega (&gt;$200B)</option>
                  <option value="Large">Large ($10B-$200B)</option>
                  <option value="Mid">Mid ($2B-$10B)</option>
                  <option value="Small">Small ($300M-$2B)</option>
                  <option value="Micro">Micro (&lt;$300M)</option>
                </select>
              </>
            )}
          </div>
        </div>

        <div className="holdings-table-wrap" style={{ flex: 1 }}>
          {isLoadingOverview ? (
            <div
              className="skeleton"
              style={{ height: 400, width: "100%" }}
            ></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Company</th>
                  <th style={{ textAlign: "right" }}>Open</th>
                  <th style={{ textAlign: "right" }}>High</th>
                  <th style={{ textAlign: "right" }}>Low</th>
                  <th style={{ textAlign: "right" }}>Close</th>
                  <th style={{ textAlign: "right" }}>% Change</th>
                  <th style={{ textAlign: "right" }}>Volume</th>
                </tr>
              </thead>
              <tbody>
                {marketOverview.map((row, idx) => {
                  const close = Number(row.p_close);
                  const prev = Number(row.prev_close);
                  let pctChange = row.day_change_pct
                    ? Number(row.day_change_pct)
                    : prev
                      ? ((close - prev) / prev) * 100
                      : 0;
                  const color =
                    pctChange >= 0
                      ? "var(--accent-green)"
                      : "var(--accent-red)";
                  const sign = pctChange > 0 ? "+" : "";

                  return (
                    <tr key={idx}>
                      <td className="td-symbol">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 4,
                              background: "var(--surface-3)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Activity size={12} color="var(--accent-blue)" />
                          </div>
                          {row.symbol}
                        </div>
                      </td>
                      <td className="td-company">{row.company_name}</td>
                      <td
                        style={{
                          textAlign: "right",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {row.p_open
                          ? `$${Number(row.p_open).toFixed(2)}`
                          : "--"}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {row.p_high
                          ? `$${Number(row.p_high).toFixed(2)}`
                          : "--"}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {row.p_low ? `$${Number(row.p_low).toFixed(2)}` : "--"}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        ${close.toFixed(2)}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          color: color,
                          fontWeight: 500,
                        }}
                      >
                        {sign}
                        {pctChange.toFixed(2)}%
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {Number(row.volume).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {marketOverview.length === 0 && (
                  <tr>
                    <td
                      colSpan="7"
                      style={{
                        textAlign: "center",
                        padding: 40,
                        color: "var(--text-muted)",
                      }}
                    >
                      No market data found for the latest trade date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div
        className="card glass-card"
        style={{
          flex: 1,
          display: activeTab === "earnings" ? "flex" : "none",
          flexDirection: "column",
        }}
      >
        <div className="card-header">
          <h3 className="card-title">Upcoming Earnings</h3>
        </div>
        <div className="holdings-table-wrap" style={{ flex: 1 }}>
          {isLoadingEarnings ? (
            <div
              className="skeleton"
              style={{ height: 400, width: "100%" }}
            ></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Symbol</th>
                  <th>Quarter</th>
                  <th style={{ textAlign: "right" }}>EPS Estimate</th>
                  <th style={{ textAlign: "right" }}>Revenue Estimate</th>
                </tr>
              </thead>
              <tbody>
                {earningsCalendar.map((row, idx) => {
                  const d = new Date(row.date);
                  const formattedDate = d.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  });
                  return (
                    <tr key={idx}>
                      <td
                        style={{
                          color: "var(--text-primary)",
                          fontWeight: 500,
                        }}
                      >
                        <Calendar
                          size={12}
                          style={{
                            marginRight: 6,
                            display: "inline-block",
                            color: "var(--accent-amber)",
                          }}
                        />
                        {formattedDate}
                      </td>
                      <td className="td-symbol">{row.symbol}</td>
                      <td className="td-company">
                        Q{row.quarter} {row.year}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {row.eps_estimate
                          ? `$${Number(row.eps_estimate).toFixed(2)}`
                          : "--"}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {row.revenue_estimate
                          ? `$${(Number(row.revenue_estimate) / 1e9).toFixed(2)}B`
                          : "--"}
                      </td>
                    </tr>
                  );
                })}
                {earningsCalendar.length === 0 && (
                  <tr>
                    <td
                      colSpan="5"
                      style={{
                        textAlign: "center",
                        padding: 40,
                        color: "var(--text-muted)",
                      }}
                    >
                      No upcoming earnings found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div
        style={{
          display: activeTab === "estimates" ? "flex" : "none",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <form
          onSubmit={handleSearch}
          style={{ display: "flex", gap: 12, alignItems: "center" }}
        >
          <div style={{ position: "relative", width: 300 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: 12,
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              value={searchTicker}
              onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
              placeholder="Search Ticker (e.g. AAPL)"
              style={{
                width: "100%",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                padding: "10px 12px 10px 36px",
                borderRadius: "var(--radius-md)",
                outline: "none",
                fontFamily: "var(--font-sans)",
                fontSize: 14,
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              background:
                "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))",
              color: "#fff",
              border: "none",
              padding: "10px 20px",
              borderRadius: "var(--radius-md)",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Fetch Estimates
          </button>
        </form>

        {isLoadingEstimates ? (
          <div
            className="skeleton"
            style={{ height: 200, width: "100%" }}
          ></div>
        ) : estimates ? (
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
          >
            <div className="card glass-card">
              <div className="card-header">
                <h3
                  className="card-title"
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <Building2 size={16} color="var(--accent-green)" /> Revenue
                  Estimates
                </h3>
              </div>
              <div className="holdings-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th style={{ textAlign: "right" }}>Avg Rev</th>
                      <th style={{ textAlign: "right" }}>Analysts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimates.revenue && estimates.revenue.length > 0 ? (
                      estimates.revenue.map((r, i) => (
                        <tr key={i}>
                          <td style={{ color: "var(--text-secondary)" }}>
                            {new Date(r.period).toLocaleDateString()}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontFamily: "var(--font-mono)",
                              fontWeight: 600,
                            }}
                          >
                            ${(Number(r.revenue_avg) / 1e9).toFixed(2)}B
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              color: "var(--text-muted)",
                            }}
                          >
                            {r.number_analysts}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="3"
                          style={{
                            textAlign: "center",
                            padding: 20,
                            color: "var(--text-muted)",
                          }}
                        >
                          No data available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card glass-card">
              <div className="card-header">
                <h3
                  className="card-title"
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <LineChart size={16} color="var(--accent-blue)" /> EPS
                  Estimates
                </h3>
              </div>
              <div className="holdings-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th style={{ textAlign: "right" }}>Avg EPS</th>
                      <th style={{ textAlign: "right" }}>Analysts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimates.eps && estimates.eps.length > 0 ? (
                      estimates.eps.map((r, i) => (
                        <tr key={i}>
                          <td style={{ color: "var(--text-secondary)" }}>
                            {new Date(r.period).toLocaleDateString()}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontFamily: "var(--font-mono)",
                              fontWeight: 600,
                            }}
                          >
                            ${Number(r.eps_avg).toFixed(2)}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              color: "var(--text-muted)",
                            }}
                          >
                            {r.number_analysts}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="3"
                          style={{
                            textAlign: "center",
                            padding: 20,
                            color: "var(--text-muted)",
                          }}
                        >
                          No data available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
