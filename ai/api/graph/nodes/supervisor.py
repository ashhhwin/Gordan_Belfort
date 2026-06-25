"""
Supervisor Node — Loads prompt from file, uses get_supervisor_llm() for deterministic routing.
"""

import time
from typing import Literal
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langsmith import traceable
from api.config import get_supervisor_llm, load_prompt
from api.graph.state import AgentState


class RouteDecision(BaseModel):
    """The routing decision made by the Supervisor."""
    reasoning: str = Field(
        description="1-3 sentences explaining WHY you are routing to this agent."
    )
    next_agent: Literal["data_agent", "quant_agent", "judge_agent", "FINISH"] = Field(
        description=(
            "The agent to route to next. Options: "
            "'data_agent' (fetch data), 'quant_agent' (analyze data), "
            "'judge_agent' (risk review + alerts), 'FINISH' (done)."
        )
    )


def _get_supervisor_prompt() -> str:
    try:
        return load_prompt("supervisor")
    except Exception:
        return """You are the Executive Supervisor routing between 3 agents.
Route to data_agent if data is needed, quant_agent for analysis/modeling,
judge_agent for risk review and Telegram alerts. Route to FINISH when fully done.
IMPORTANT: Route to data_agent FIRST before any analysis. Do not loop the same agent twice."""


@traceable(name="Supervisor Node")
async def supervisor_node(state: AgentState, config):
    """Supervisor determines the next agent using strict structured outputs."""
    llm = get_supervisor_llm()
    router_llm = llm.with_structured_output(RouteDecision)

    system_prompt = _get_supervisor_prompt()

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="messages"),
        ("system", "Given the conversation above, decide which agent should act next. "
                   "Provide reasoning and the exact next_agent string."),
    ])

    chain = prompt | router_llm
    decision = await chain.ainvoke({"messages": state["messages"]}, config=config)

    now = time.time()
    thinking_steps = [{
        "step": "routing_decision",
        "content": f"🧭 Routing to `{decision.next_agent}`: {decision.reasoning}",
        "timestamp": now,
    }]

    return {
        "next_agent": decision.next_agent,
        "thinking_steps": thinking_steps,
        "sender": "supervisor",
    }
