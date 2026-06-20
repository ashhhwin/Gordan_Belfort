"""
Simulation Agent Node.
The heavy-lifting agent: backtesting, Monte Carlo, Markov chains, ML, deep learning,
Python sandbox, and visualization tools.
"""

from langgraph.prebuilt import create_react_agent
from langsmith import traceable
from api.config import get_llm

# Import all tools
from api.tools.sandbox import python_sandbox
from api.tools.quant_tools import (
    run_backtest,
    monte_carlo_simulation,
    markov_chain_analysis,
    train_price_predictor,
    correlation_analysis,
    portfolio_risk_analysis,
)
from api.tools.visualization_tools import (
    generate_mermaid_diagram,
    generate_candlestick_chart,
    generate_comparison_chart,
)
from api.tools.database_tools import (
    get_portfolio_holdings,
    get_net_worth_summary,
    query_market_data,
    run_readonly_sql,
    get_asset_allocation,
)

SIMULATION_PROMPT = """You are the Simulation & Analysis Agent inside the Gordan Belfort AI system.
You are a senior quantitative analyst with access to powerful computational tools.

AVAILABLE TOOLS:
📊 **Quantitative Analysis:**
- run_backtest: Backtest trading strategies (SMA crossover, RSI, momentum, Bollinger bands)
- monte_carlo_simulation: Probabilistic price forecasting with fan charts
- markov_chain_analysis: Market regime detection with transition matrices
- train_price_predictor: ML-based price prediction (Random Forest, Gradient Boosting, Linear Regression)
- correlation_analysis: Cross-asset correlation matrices
- portfolio_risk_analysis: VaR, CVaR, volatility, risk dashboards

📈 **Visualization:**
- generate_candlestick_chart: Professional candlestick charts with SMAs
- generate_comparison_chart: Multi-stock comparison (returns or price)
- generate_mermaid_diagram: Flowcharts, sequence diagrams, state diagrams

🗃️ **Data Access:**
- get_portfolio_holdings, get_net_worth_summary, query_market_data, run_readonly_sql, get_asset_allocation

🐍 **Python Sandbox:**
- python_sandbox: Execute arbitrary Python code (numpy, pandas, scipy, sklearn pre-imported)

CRITICAL RULES:
1. ALWAYS use tools — never guess numbers or fabricate data.
2. When a tool returns [[IMAGE_BASE64:...]], you MUST include that EXACT string in your response. The UI renders it as a chart. Do NOT truncate or summarize it.
3. Present results clearly with markdown formatting: headers, tables, bullet points.
4. For complex requests, break them into steps and use multiple tools.
5. When generating Mermaid diagrams, return the mermaid code block directly.
6. Proactively suggest follow-up analyses the user might find valuable.

{memory_context}"""


@traceable(name="Simulation Agent Build")
def build_simulation_agent(memory_context: str = "", model: str = None, temperature: float = 0.1):
    tools = [
        # Quant tools
        run_backtest,
        monte_carlo_simulation,
        markov_chain_analysis,
        train_price_predictor,
        correlation_analysis,
        portfolio_risk_analysis,
        # Visualization
        generate_candlestick_chart,
        generate_comparison_chart,
        generate_mermaid_diagram,
        # Database access
        get_portfolio_holdings,
        get_net_worth_summary,
        query_market_data,
        run_readonly_sql,
        get_asset_allocation,
        # Sandbox
        python_sandbox,
    ]

    llm = get_llm(model=model, temperature=temperature)
    prompt = SIMULATION_PROMPT.format(memory_context=memory_context)
    return create_react_agent(llm, tools=tools, prompt=prompt)


@traceable(name="Simulation Node")
async def simulation_node(state, config):
    # Build memory context
    memory_context = ""
    if state.get("memory_context"):
        memories = state["memory_context"]
        if memories:
            memory_context = "\n\nRELEVANT MEMORIES FROM PAST SESSIONS:\n" + "\n".join(
                f"- [{m['memory_type']}] {m['content']}" for m in memories
            )

    agent = build_simulation_agent(
        memory_context,
        state.get("model"),
        state.get("temperature") if state.get("temperature") is not None else 0.1
    )
    result = await agent.ainvoke({"messages": state["messages"]}, config=config)

    return {
        "messages": result["messages"][-1:],
        "next_agent": "FINISH"
    }
