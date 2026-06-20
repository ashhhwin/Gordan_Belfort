import { useStore } from "../../store";

export default function PortfolioFilters({
  filters,
  setFilters,
  availableUsers,
}) {
  const { isFamilyMode } = useStore();

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div
      className="tab-strip"
      style={{
        marginBottom: "16px",
        display: "flex",
        gap: "12px",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--text-muted)",
        }}
      >
        Filters:
      </span>

      {isFamilyMode && (
        <select
          className="filter-select"
          value={filters.userId}
          onChange={(e) => handleFilterChange("userId", e.target.value)}
        >
          <option value="ALL">All Family Members</option>
          {availableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}

      <select
        className="filter-select"
        value={filters.assetClass}
        onChange={(e) => handleFilterChange("assetClass", e.target.value)}
      >
        <option value="ALL">All Asset Classes</option>
        <option value="MF">Mutual Funds</option>
        <option value="IND_EQUITY">Indian Equity</option>
        <option value="US_EQUITY">US Equity</option>
        <option value="BONDS">Debt & Bonds</option>
        <option value="BANK">Bank Balances</option>
      </select>

      <select
        className="filter-select"
        value={filters.performance}
        onChange={(e) => handleFilterChange("performance", e.target.value)}
      >
        <option value="ALL">All Performance</option>
        <option value="GAINERS">Gainers (&gt; 0%)</option>
        <option value="LOSERS">Losers (&lt; 0%)</option>
      </select>

      <button
        className="tab-btn"
        onClick={() =>
          setFilters({ userId: "ALL", assetClass: "ALL", performance: "ALL" })
        }
        style={{ marginLeft: "auto", fontSize: "11px" }}
      >
        Reset Filters
      </button>
    </div>
  );
}
