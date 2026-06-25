"""
Presenter Agent Node — Synthesizes internal data into a clean, user-facing response.
"""

import time
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langsmith import traceable
from api.config import get_llm, load_prompt
from api.graph.state import AgentState

def _get_presenter_prompt() -> str:
    try:
        return load_prompt("presenter_agent")
    except Exception:
        return "You are the final Presenter Agent. Synthesize the internal data into a clean response."

@traceable(name="Presenter Agent")
async def presenter_agent_node(state: AgentState, config):
    """The final node that synthesizes the output."""
    llm = get_llm()
    system_prompt = _get_presenter_prompt()

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="messages")
    ])

    # Add a metadata tag so the streaming engine knows this is the presenter
    chain = prompt | llm.with_config({"metadata": {"langgraph_node": "presenter_agent"}})
    
    response = await chain.ainvoke({"messages": state["messages"]}, config=config)

    now = time.time()
    thinking_steps = [{
        "step": "synthesis",
        "content": "✨ Synthesizing final response...",
        "timestamp": now,
    }]

    return {
        "messages": [response],
        "thinking_steps": thinking_steps,
        "sender": "presenter_agent",
    }
