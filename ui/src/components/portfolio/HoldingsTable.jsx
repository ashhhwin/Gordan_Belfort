import React, { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, Edit2, Trash2, Search, Filter } from "lucide-react";
import { calculateTaxMetrics } from "../../utils/taxCalc";

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

const iconBtnStyle = {
  background: "none",
  border: "none",
  padding: 4,
  cursor: "pointer",
  color: "var(--text-secondary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "var(--radius-sm)",
  transition: "all 0.2s",
};

export default function HoldingsTable({
  holdings,
  currency,
  rate,
  isFamilyMode,
  config,
  onEdit,
  onDelete,
}) {
  const [sort, setSort] = useState({ key: "pnl", dir: -1 });
  const [search, setSearch] = useState("");
  const [assetFilter, setAssetFilter] = useState("ALL");
  const [brokerFilter, setBrokerFilter] = useState("ALL");

  const uniqueAssets = useMemo(() => {
    const assets = new Set(holdings.map(h => h.assetClass).filter(Boolean));
    return Array.from(assets).sort();
  }, [holdings]);

  const uniqueBrokers = useMemo(() => {
    const brokers = new Set(holdings.map(h => h.broker).filter(Boolean));
    return Array.from(brokers).sort();
  }, [holdings]);

  const filteredHoldings = useMemo(() => {
    return holdings.filter(h => {
      const matchSearch = 
        !search || 
        (h.symbol && h.symbol.toLowerCase().includes(search.toLowerCase())) || 
        (h.name && h.name.toLowerCase().includes(search.toLowerCase()));
      
      const matchAsset = assetFilter === "ALL" || h.assetClass === assetFilter;
      const matchBroker = brokerFilter === "ALL" || h.broker === brokerFilter;
      
      return matchSearch && matchAsset && matchBroker;
    });
  }, [holdings, search, assetFilter, brokerFilter]);

  const rows = [...filteredHoldings]
    .map((h) => {
      const taxData = calculateTaxMetrics(h, config);
      return {
        ...h,
        invested: h.avgBuy * h.qty,
        currentVal: h.cmp * h.qty,
        pnl: (h.cmp - h.avgBuy) * h.qty,
        pnlPct: ((h.cmp - h.avgBuy) / h.avgBuy) * 100,
        taxData,
      };
    })
    .sort((a, b) => {
      const aVal = typeof a[sort.key] === "string" ? a[sort.key].toLowerCase() : a[sort.key];
      const bVal = typeof b[sort.key] === "string" ? b[sort.key].toLowerCase() : b[sort.key];
      if (aVal > bVal) return sort.dir;
      if (aVal < bVal) return -sort.dir;
      return 0;
    });

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: -1 }));
  }

  const renderCol = (k, label, right = false) => {
    return (
      <th
        key={k}
        onClick={() => toggleSort(k)}
        style={{ textAlign: right ? "right" : "left", cursor: "pointer", userSelect: "none" }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          {label}
          {sort.key !== k ? (
            <ChevronUp size={11} style={{ opacity: 0.2 }} />
          ) : sort.dir === 1 ? (
            <ChevronUp size={11} />
          ) : (
            <ChevronDown size={11} />
          )}
        </span>
      </th>
    );
  };

  return (
    <div className="card" style={{ padding: "20px 0" }}>
      <div
        className="card-header"
        style={{ boxSizing: "border-box", padding: "0 20px", marginBottom: 16, display: "flex", flexDirection: "column", gap: "16px", alignItems: "flex-start", borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}
      >
        <div style={{ boxSizing: "border-box", display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
          <div>
            <div className="card-title" style={{ fontSize: "16px" }}>
              {isFamilyMode ? "Combined Family Holdings" : "Holdings"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: "4px" }}>
              Showing {filteredHoldings.length} of {holdings.length} positions
            </div>
          </div>
        </div>
        
        {/* FILTERS BAR */}
        <div style={{ boxSizing: "border-box", display: "flex", gap: "12px", width: "100%", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search symbol or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 32px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-primary)",
                fontSize: "13px",
                outline: "none"
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Filter size={14} color="var(--text-muted)" />
            <select
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
              style={{
                padding: "8px 12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-primary)",
                fontSize: "13px",
                outline: "none",
                cursor: "pointer"
              }}
            >
              <option value="ALL">All Asset Classes</option>
              {uniqueAssets.map(a => <option key={a} value={a}>{a}</option>)}
            </select>

            <select
              value={brokerFilter}
              onChange={(e) => setBrokerFilter(e.target.value)}
              style={{
                padding: "8px 12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-primary)",
                fontSize: "13px",
                outline: "none",
                cursor: "pointer"
              }}
            >
              <option value="ALL">All Brokers</option>
              {uniqueBrokers.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
      </div>
      
      <div className="holdings-table-wrap">
        {rows.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
            No holdings found matching your filters.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                {renderCol("symbol", "Symbol")}
                {isFamilyMode && <th>Owner</th>}
                {renderCol("cmp", "CMP", true)}
                {renderCol("qty", "Qty", true)}
                {renderCol("invested", "Invested", true)}
                {renderCol("currentVal", "Mkt Value", true)}
                {renderCol("pnl", "P&L", true)}
                {renderCol("pnlPct", "Return %", true)}
                {renderCol("taxData.netProfit", "Net Post-Tax", true)}
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const pos = h.pnl >= 0;
                return (
                  <tr key={h.id}>
                    <td>
                      <div className="td-symbol">{h.symbol}</div>
                      <div className="td-company">{h.name}</div>
                    </td>
                    {isFamilyMode && (
                      <td>
                        <div className="owner-badge">
                          <div
                            className="owner-dot"
                            style={{ background: h._user.color }}
                          >
                            {h._user.initials}
                          </div>
                          <span style={{ color: "var(--text-secondary)" }}>
                            {h._user.name.split(" ")[0]}
                          </span>
                        </div>
                      </td>
                    )}
                    <td style={{ textAlign: "right" }}>
                      {currency === "INR"
                        ? `₹${h.cmp.toLocaleString("en-IN")}`
                        : `$${(h.cmp / rate).toFixed(2)}`}
                      {h.dayChange !== undefined && (
                        <div style={{ fontSize: 10.5, marginTop: 2 }}>
                          <span
                            style={{
                              color:
                                h.dayChange >= 0
                                  ? "var(--accent-green)"
                                  : "var(--accent-red)",
                            }}
                          >
                            {h.dayChange >= 0 ? "+" : ""}
                            {h.dayChangePct?.toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>{h.qty}</td>
                    <td style={{ textAlign: "right" }}>
                      {fmtVal(h.invested, currency, rate)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {fmtVal(h.currentVal, currency, rate)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className={`badge-gain ${pos ? "pos" : "neg"}`}>
                        {pos ? "+" : ""}
                        {fmtVal(h.pnl, currency, rate)}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span
                        style={{
                          color: pos
                            ? "var(--accent-green)"
                            : "var(--accent-red)",
                          fontWeight: 600,
                        }}
                      >
                        {pos ? "+" : ""}
                        {h.pnlPct.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          color:
                            h.taxData.netProfit >= 0
                              ? "var(--accent-green)"
                              : "var(--accent-red)",
                          fontWeight: 600,
                        }}
                      >
                        {h.taxData.netProfit >= 0 ? "+" : ""}
                        {fmtVal(h.taxData.netProfit, currency, rate)}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        {h.taxData.taxType} ({h.taxData.taxRate}%)
                      </div>
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          justifyContent: "center",
                        }}
                      >
                        <button
                          onClick={() => onEdit(h)}
                          style={iconBtnStyle}
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => onDelete(h.id)}
                          style={{ ...iconBtnStyle, color: "var(--accent-red)" }}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
