"""
Supervisor / Router Node.
Uses structured output to reliably route to the correct sub-agent.
Upgraded to Qwen 3.5 with proper Pydantic structured output.
"""

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from langsmith import traceable
from api.config import get_supervisor_llm

SUPERVISOR_PROMPT = """You are the routing supervisor for Gordan Belfort, an elite financial AI system.

Your ONLY job is to read the user's latest message and route it to the correct sub-agent.

AVAILABLE AGENTS:
1. "simulation" → Select when the user wants to:
   - Run calculations, backtests, or simulations
   - Generate charts, plots, or visualizations  
   - Train ML models or run statistical analysis
   - Execute Python code or custom computations
   - Monte Carlo simulations, Markov chains, risk analysis
   - Create diagrams or flowcharts

2. "database" → Select when the user wants to:
   - View portfolio holdings, positions, or P&L
   - Check net worth, asset allocation
   - Query market data, stock prices, or volumes
   - Any data retrieval from the financial database

3. "conversation" → Select when the user wants to:
   - General chat, greetings, or casual questions
   - Explanations of financial concepts
   - Opinions or advice (no computation needed)
   - Follow-up questions about previous responses

ROUTING RULES:
- If the request involves BOTH data and computation, route to "simulation" (it has database access too).
- If uncertain, prefer "simulation" over "conversation" — better to use tools than to guess.
- Always route to exactly ONE agent.

Output your routing decision as structured JSON."""


class RouteResponse(BaseModel):
    """Supervisor routing decision."""
    reasoning: str = Field(description="Brief reasoning for the routing decision (1-2 sentences)")
    next: str = Field(description='The agent to route to: "simulation", "database", or "conversation"')


@traceable(name="Supervisor Node")
async def supervisor_node(state, config):
    llm = get_supervisor_llm()

    try:
        structured_llm = llm.with_structured_output(RouteResponse)
    except Exception:
        # Fallback if structured output isn't supported
        structured_llm = None

    prompt = ChatPromptTemplate.from_messages([
        ("system", SUPERVISOR_PROMPT),
        ("placeholder", "{messages}")
    ])

    if structured_llm:
        chain = prompt | structured_llm
        try:
            response = await chain.ainvoke({"messages": state["messages"]}, config=config)
            route = response.next if response.next in ("simulation", "database", "conversation") else "conversation"
            return {
                "next_agent": route,
                "thinking_steps": [{
                    "step": "routing_decision",
                    "content": f"🧭 Routing: {response.reasoning} → **{route}**",
                    "timestamp": __import__('time').time()
                }]
            }
        except Exception:
            import traceback
            traceback.print_exc()
            return {"next_agent": "conversation"}
    else:
        # Fallback: raw LLM with manual JSON parsing
        chain = prompt | llm
        try:
            response = await chain.ainvoke({"messages": state["messages"]}, config=config)
            content = response.content.lower()
            if "simulation" in content:
                route = "simulation"
            elif "database" in content:
                route = "database"
            else:
                route = "conversation"
            return {"next_agent": route}
        except Exception:
            return {"next_agent": "conversation"}
