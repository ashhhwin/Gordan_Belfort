"""
Database Agent Node.
ReAct agent specialized in querying financial databases — holdings, market data, portfolio analysis.
"""

from langchain_core.prompts import ChatPromptTemplate
from langgraph.prebuilt import create_react_agent
from langsmith import traceable
from api.config import get_llm, PERSONAS, DEFAULT_PERSONA
from api.tools.database_tools import (
    get_portfolio_holdings,
    get_net_worth_summary,
    query_market_data,
    run_readonly_sql,
    get_asset_allocation,
)

DATABASE_AGENT_PROMPT = """You are the Database Query Agent inside the Gordan Belfort AI system.
You have access to a PostgreSQL database containing the user's real financial data.

AVAILABLE TOOLS:
- get_portfolio_holdings: Retrieve all active positions with P&L
- get_net_worth_summary: Get total net worth breakdown by asset class
- query_market_data: Get OHLCV data for a specific stock symbol
- run_readonly_sql: Execute custom SELECT queries
- get_asset_allocation: Get portfolio allocation percentages

RULES:
- Always use the appropriate tool — never guess or fabricate data.
- Format monetary values in ₹ (INR) with proper comma formatting.
- Present data in clean markdown tables when appropriate.
- If a query returns no data, explain what might be missing and suggest alternatives.
- For large datasets, summarize key metrics first, then provide details.

{memory_context}"""


@traceable(name="Database Agent Build")
def build_database_agent(memory_context: str = ""):
    tools = [
        get_portfolio_holdings,
        get_net_worth_summary,
        query_market_data,
        run_readonly_sql,
        get_asset_allocation,
    ]

    llm = get_llm(temperature=0.1)
    prompt = DATABASE_AGENT_PROMPT.format(memory_context=memory_context)
    return create_react_agent(llm, tools=tools, prompt=prompt)


@traceable(name="Database Node")
async def database_node(state, config):
    # Build memory context string
    memory_context = ""
    if state.get("memory_context"):
        memories = state["memory_context"]
        if memories:
            memory_context = "\n\nRELEVANT MEMORIES FROM PAST SESSIONS:\n" + "\n".join(
                f"- [{m['memory_type']}] {m['content']}" for m in memories
            )

    agent = build_database_agent(memory_context)
    result = await agent.ainvoke({"messages": state["messages"]}, config=config)

    return {
        "messages": result["messages"][-1:],
        "next_agent": "FINISH"
    }
