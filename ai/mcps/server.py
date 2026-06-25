"""
Python MCP Server — Official Model Context Protocol server for Gordan Belfort AI.
Runs on HTTP+SSE (port 8002) so Claude Desktop and other MCP clients can connect.
All tools from all 5 MCP modules are registered here.

Usage:
    python -m mcps.server
    # or directly:
    python mcps/server.py

Claude Desktop config (~/.config/claude/claude_desktop_config.json):
{
    "mcpServers": {
        "gordan-belfort": {
            "url": "http://localhost:8002/sse"
        }
    }
}
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from fastmcp import FastMCP
except ImportError:
    raise ImportError("fastmcp not installed. Run: pip install fastmcp")

# Import all tool modules
from mcps.database.database_tools import (
    get_ibkr_portfolio, get_india_holdings, get_portfolio_summary,
    get_nse_stock_history, get_nse_index_data, get_all_indices_latest,
    get_volume_anomalies, get_52w_extremes, get_block_deals, get_alpha_signals,
    get_tech_indicators, get_portfolio_history, get_earnings_calendar,
    get_circuit_breakers, run_readonly_sql,
)
from mcps.market_data.market_data_tools import (
    get_us_stock_snapshot, get_yfinance_quote, get_nse_etf_data,
    get_eps_estimates, get_macro_indicators,
)
from mcps.quant.quant_tools import (
    calculate_technical_indicators, calculate_garch_volatility,
    optimize_portfolio_weights, run_factor_regression,
    run_cointegration_test, calculate_portfolio_var_real,
    train_price_predictor, train_lstm_price_model,
    run_backtest, monte_carlo_simulation,
    calculate_kelly_criterion, run_hypothesis_test,
)
from mcps.system.system_tools import (
    send_telegram_alert, send_telegram_html, send_telegram_chart,
    get_portfolio_pnl_snapshot,
    get_system_health, generate_rebalancing_options,
)
from mcps.sandbox.sandbox_tools import (
    execute_python_code, generate_candlestick_chart,
    generate_correlation_heatmap, generate_portfolio_performance_chart,
)

# ── Build MCP Server ──────────────────────────────────────────

mcp = FastMCP(
    name="gordan-belfort",
)

# Register all tools
ALL_TOOLS = [
    # Database
    get_ibkr_portfolio, get_india_holdings, get_portfolio_summary,
    get_nse_stock_history, get_nse_index_data, get_all_indices_latest,
    get_volume_anomalies, get_52w_extremes, get_block_deals, get_alpha_signals,
    get_tech_indicators, get_portfolio_history, get_earnings_calendar,
    get_circuit_breakers, run_readonly_sql,
    # Market Data
    get_us_stock_snapshot, get_yfinance_quote, get_nse_etf_data,
    get_eps_estimates, get_macro_indicators,
    # Quant
    calculate_technical_indicators, calculate_garch_volatility,
    optimize_portfolio_weights, run_factor_regression,
    run_cointegration_test, calculate_portfolio_var_real,
    train_price_predictor, train_lstm_price_model,
    run_backtest, monte_carlo_simulation,
    calculate_kelly_criterion, run_hypothesis_test,
    # System
    send_telegram_alert, send_telegram_html, send_telegram_chart,
    get_portfolio_pnl_snapshot,
    get_system_health, generate_rebalancing_options,
    # Sandbox
    execute_python_code, generate_candlestick_chart,
    generate_correlation_heatmap, generate_portfolio_performance_chart,
]

for tool_fn in ALL_TOOLS:
    # If the tool is a LangChain tool, get the underlying function
    fn = getattr(tool_fn, "func", tool_fn)
    mcp.tool(fn)


if __name__ == "__main__":
    print(f"🚀 Gordan Belfort MCP Server starting on port 8002")
    print(f"   Registered {len(ALL_TOOLS)} tools")
    print(f"   Claude Desktop SSE URL: http://localhost:8002/sse")
    mcp.run(transport="sse", port=8002)
