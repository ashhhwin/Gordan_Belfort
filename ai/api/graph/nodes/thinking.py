"""
Chain-of-Thought Thinking Node.
Performs deep reasoning before routing — analyzes intent, required tools, complexity.
Streams thinking steps to the frontend in real-time.
"""

import time
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import AIMessage
from langsmith import traceable
from api.config import get_llm, LLM_THINKING_TEMPERATURE

THINKING_PROMPT = """You are an elite financial AI's internal reasoning engine. Your job is to deeply analyze the user's request BEFORE any action is taken.

Think through the following step by step:

1. **Intent Analysis**: What exactly is the user asking? Classify as: QUERY (information retrieval), ANALYSIS (computation/modeling), VISUALIZATION (charts/diagrams), CONVERSATION (general chat), or MULTI-STEP (combination).

2. **Required Data**: What data sources are needed? (portfolio holdings, market prices, historical data, external APIs, none)

3. **Required Tools**: Which tools should be used? Available tools:
   - python_sandbox: For custom calculations, ML models, deep learning
   - run_backtest: For strategy backtesting with equity curves
   - monte_carlo_simulation: For probabilistic price forecasting
   - markov_chain_analysis: For regime detection and transition probabilities
   - train_price_predictor: For ML-based price prediction
   - correlation_analysis: For cross-asset correlation matrices
   - portfolio_risk_analysis: For VaR, CVaR, risk dashboards
   - get_portfolio_holdings: For current positions
   - get_net_worth_summary: For portfolio overview
   - query_market_data: For historical OHLCV data
   - run_readonly_sql: For custom database queries
   - generate_candlestick_chart: For technical chart analysis
   - generate_mermaid_diagram: For flowcharts and diagrams
   - generate_comparison_chart: For multi-stock comparison

4. **Complexity Estimate**: LOW (direct answer), MEDIUM (single tool), HIGH (multiple tools/steps), CRITICAL (financial decision requiring verification)

5. **Routing Decision**: Route to "simulation" (tools/computation needed), "database" (data queries), or "conversation" (no tools needed).

Output your reasoning naturally — it will be streamed to the user as "thinking" steps.
End with a JSON line: {{"route": "simulation"|"database"|"conversation", "complexity": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL"}}"""


@traceable(name="Thinking Node")
async def thinking_node(state, config):
    """Perform chain-of-thought reasoning and determine routing."""
    llm = get_llm(temperature=LLM_THINKING_TEMPERATURE, streaming=True)

    prompt = ChatPromptTemplate.from_messages([
        ("system", THINKING_PROMPT),
        ("placeholder", "{messages}")
    ])

    chain = prompt | llm

    thinking_steps = []
    full_response = ""

    # Stream thinking
    async for chunk in chain.astream({"messages": state["messages"]}, config=config):
        if chunk.content:
            full_response += chunk.content

    # Parse routing decision
    route = "conversation"
    complexity = "LOW"

    # Extract JSON from the response
    import json
    import re
    json_match = re.search(r'\{[^{}]*"route"[^{}]*\}', full_response)
    if json_match:
        try:
            decision = json.loads(json_match.group())
            route = decision.get("route", "conversation")
            complexity = decision.get("complexity", "LOW")
        except json.JSONDecodeError:
            pass

    # Create structured thinking steps
    now = time.time()
    sections = full_response.split("\n\n")
    for i, section in enumerate(sections):
        section = section.strip()
        if not section or section.startswith("{"):
            continue
        step_type = "reasoning"
        if "intent" in section.lower():
            step_type = "intent_analysis"
        elif "tool" in section.lower():
            step_type = "tool_selection"
        elif "data" in section.lower() or "source" in section.lower():
            step_type = "data_assessment"
        elif "complex" in section.lower():
            step_type = "complexity_estimate"
        elif "route" in section.lower() or "routing" in section.lower():
            step_type = "routing_decision"

        thinking_steps.append({
            "step": step_type,
            "content": section,
            "timestamp": now + i * 0.1
        })

    return {
        "next_agent": route,
        "thinking_steps": thinking_steps,
        "metadata": {
            "complexity": complexity,
            "route": route,
            "thinking_model": str(llm.model),
        }
    }
