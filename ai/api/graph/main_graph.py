"""
Main LangGraph definition with SQLite checkpointing.
Implements the Multi-Agent Cyclic Supervisor Pattern.
"""

from langgraph.graph import StateGraph, START, END

from api.graph.state import AgentState
from api.graph.nodes.supervisor import supervisor_node
from api.graph.nodes.data_agent import data_agent_node
from api.graph.nodes.quant_agent import quant_agent_node
from api.graph.nodes.judge_agent import judge_agent_node
from api.graph.nodes.presenter_agent import presenter_agent_node


def route_supervisor(state: AgentState):
    """Route based on the supervisor's decision."""
    next_node = state.get("next_agent", "FINISH")
    if next_node == "FINISH":
        return "presenter_agent"
    return next_node


def build_app_graph(checkpointer=None):
    builder = StateGraph(AgentState)

    # ── Add all nodes ──
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("data_agent", data_agent_node)
    builder.add_node("quant_agent", quant_agent_node)
    builder.add_node("judge_agent", judge_agent_node)
    builder.add_node("presenter_agent", presenter_agent_node)

    # ── Entry point ──
    builder.add_edge(START, "supervisor")

    # ── Supervisor routes to workers ──
    builder.add_conditional_edges(
        "supervisor",
        route_supervisor,
        {
            "data_agent": "data_agent",
            "quant_agent": "quant_agent",
            "judge_agent": "judge_agent",
            "presenter_agent": "presenter_agent",
            END: END
        }
    )

    # ── Workers always return to the Supervisor for the next step ──
    builder.add_edge("data_agent", "supervisor")
    builder.add_edge("quant_agent", "supervisor")
    builder.add_edge("judge_agent", "supervisor")

    # ── Presenter Agent is the final step ──
    builder.add_edge("presenter_agent", END)

    return builder.compile(checkpointer=checkpointer)
