"""
Judge Agent Node — Risk review and Telegram dispatch.
"""

import time
from langgraph.prebuilt import create_react_agent
from langsmith import traceable
from api.config import get_llm, load_prompt
from api.graph.state import AgentState

from mcps.system.system_tools import (
    send_telegram_alert, send_telegram_html, send_telegram_chart,
    get_portfolio_pnl_snapshot,
    get_system_health, generate_rebalancing_options,
)

JUDGE_TOOLS = [
    # Alerts
    send_telegram_alert, send_telegram_html, send_telegram_chart,
    # System & Portfolio Context
    get_portfolio_pnl_snapshot, get_system_health,
    generate_rebalancing_options,
]


def _build_judge_prompt() -> str:
    try:
        return load_prompt("judge_agent")
    except Exception:
        return """You are the Chief Risk Officer. Your job is to:
1. Review and red-team the analysis from the Quant Agent for statistical validity.
2. Send Telegram alerts for high-conviction, actionable signals only.
3. Save key insights to long-term memory via save_to_memory.
4. Search past memory with search_memory before forming recommendations.

Telegram alert criteria: Statistical significance (p<0.05), real data backing,
specific actionable recommendation (BUY/SELL/WATCH with price targets).
Do NOT alert for exploratory analysis or weak signals."""


@traceable(name="Judge Agent Build")
def build_judge_agent():
    llm = get_llm(agent_name="judge", temperature=0.1)
    return create_react_agent(
        llm, tools=JUDGE_TOOLS,
        prompt=_build_judge_prompt()
    )


@traceable(name="Judge Node")
async def judge_agent_node(state: AgentState, config):
    agent = build_judge_agent()
    result = await agent.ainvoke({"messages": state["messages"]}, config=config)

    now = time.time()
    thinking_steps = [
        {"step": "risk_review", "content": "⚖️ Judge Agent reviewing analysis and risk factors...", "timestamp": now},
        {"step": "judge_complete", "content": "✅ Judge Agent completed risk review.", "timestamp": now + 0.1},
    ]
    return {
        "messages": result["messages"][-1:],
        "thinking_steps": thinking_steps,
        "sender": "judge_agent"
    }
