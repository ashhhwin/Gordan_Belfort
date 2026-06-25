"""
Data Agent Node — Rewritten to use real database tools and load prompt from template.
"""

import time
from langgraph.prebuilt import create_react_agent
from langsmith import traceable
from api.config import get_llm, load_prompt, load_kt
from api.graph.state import AgentState

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

DATA_TOOLS = [
    # Portfolio
    get_ibkr_portfolio, get_india_holdings, get_portfolio_summary, get_portfolio_history,
    # NSE Data
    get_nse_stock_history, get_nse_index_data, get_all_indices_latest,
    get_volume_anomalies, get_52w_extremes, get_block_deals, get_alpha_signals,
    get_tech_indicators, get_circuit_breakers, get_earnings_calendar,
    # Market Data
    get_us_stock_snapshot, get_yfinance_quote, get_nse_etf_data,
    get_eps_estimates, get_macro_indicators,
    # SQL
    run_readonly_sql,
]


def _build_data_prompt() -> str:
    """Load data agent prompt and inject DB schema KT."""
    try:
        template = load_prompt("data_agent")
        kt = load_kt()
        return template.replace("{DB_SCHEMA_KT}", kt)
    except Exception:
        kt = load_kt()
        return f"""You are the Lead Data Engineer. Extract data from the portfolio database.
Available tools: get_ibkr_portfolio, get_india_holdings, get_portfolio_summary,
get_nse_stock_history, get_nse_index_data, get_volume_anomalies, get_52w_extremes,
get_block_deals, get_alpha_signals, get_macro_indicators, run_readonly_sql.

DB SCHEMA:
{kt}

RULES: Only extract data. Use correct table names from the schema above.
India holdings: holdings.symbol = full company name, join symbol_mappings for NSE ticker.
IBKR: ibkr_portfolio_holdings.symbol = real US ticker."""


@traceable(name="Data Agent Build")
def build_data_agent():
    llm = get_llm(agent_name="data", temperature=0.1)
    return create_react_agent(
        llm, tools=DATA_TOOLS,
        prompt=_build_data_prompt()
    )


@traceable(name="Data Node")
async def data_agent_node(state: AgentState, config):
    agent = build_data_agent()
    result = await agent.ainvoke({"messages": state["messages"]}, config=config)

    now = time.time()
    thinking_steps = [
        {"step": "data_extraction", "content": "📊 Data Agent fetching real portfolio and market data...", "timestamp": now},
        {"step": "data_complete", "content": "✅ Data Agent completed data extraction from DB.", "timestamp": now + 0.1},
    ]
    return {
        "messages": result["messages"][-1:],
        "thinking_steps": thinking_steps,
        "sender": "data_agent"
    }
