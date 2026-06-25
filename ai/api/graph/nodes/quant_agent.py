"""
Quant Agent Node — Full quantitative analysis suite with real tools.
"""

import time
from langgraph.prebuilt import create_react_agent
from langsmith import traceable
from api.config import get_llm, load_prompt
from api.graph.state import AgentState

from mcps.quant.quant_tools import (
    calculate_technical_indicators, calculate_garch_volatility,
    optimize_portfolio_weights, run_factor_regression,
    run_cointegration_test, calculate_portfolio_var_real,
    train_price_predictor, train_lstm_price_model,
    run_backtest, monte_carlo_simulation,
    calculate_kelly_criterion, run_hypothesis_test,
)
from mcps.sandbox.sandbox_tools import (
    execute_python_code, generate_candlestick_chart,
    generate_correlation_heatmap, generate_portfolio_performance_chart,
)
from mcps.database.database_tools import run_readonly_sql, get_nse_stock_history

QUANT_TOOLS = [
    # Technical Analysis
    calculate_technical_indicators, calculate_garch_volatility,
    # Portfolio Optimization & Risk
    optimize_portfolio_weights, calculate_portfolio_var_real,
    # Factor Models
    run_factor_regression, run_cointegration_test,
    # ML / DL
    train_price_predictor, train_lstm_price_model,
    # Backtesting & Simulation
    run_backtest, monte_carlo_simulation,
    # Stats
    calculate_kelly_criterion, run_hypothesis_test,
    # Charts & Code
    generate_candlestick_chart, generate_correlation_heatmap,
    generate_portfolio_performance_chart, execute_python_code,
    # Data access (for raw data retrieval)
    get_nse_stock_history, run_readonly_sql,
]


def _build_quant_prompt() -> str:
    try:
        return load_prompt("quant_agent")
    except Exception:
        return """You are a Senior Quantitative Analyst. Your job is to run rigorous statistical analysis.
Always show your hypothesis, results with numbers (p-values, Sharpe, R²), and generate charts.
Use the tools available to run backtests, simulations, ML models, risk metrics, and visualizations.
After every analysis, provide a clear 3-sentence plain English interpretation."""


@traceable(name="Quant Agent Build")
def build_quant_agent():
    llm = get_llm(agent_name="quant", temperature=0.2)
    return create_react_agent(
        llm, tools=QUANT_TOOLS,
        prompt=_build_quant_prompt()
    )


@traceable(name="Quant Node")
async def quant_agent_node(state: AgentState, config):
    agent = build_quant_agent()
    result = await agent.ainvoke({"messages": state["messages"]}, config=config)

    now = time.time()
    thinking_steps = [
        {"step": "quant_analysis", "content": "🔬 Quant Agent running statistical analysis and models...", "timestamp": now},
        {"step": "quant_complete", "content": "✅ Quant Agent completed analysis.", "timestamp": now + 0.1},
    ]
    return {
        "messages": result["messages"][-1:],
        "thinking_steps": thinking_steps,
        "sender": "quant_agent"
    }
