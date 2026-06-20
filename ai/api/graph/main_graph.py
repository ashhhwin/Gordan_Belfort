"""
Main LangGraph definition with SQLite checkpointing, thinking → routing → agent → memory pipeline.
"""

from langgraph.graph import StateGraph, END

from api.graph.state import AgentState
from api.graph.nodes.thinking import thinking_node
from api.graph.nodes.simulation import simulation_node
from api.graph.nodes.conversation import conversation_node
from api.graph.nodes.database_agent import database_node
from api.graph.nodes.memory import memory_retrieve_node, memory_write_node


def route_next(state: AgentState):
    """Route based on the supervisor/thinking node's decision."""
    next_node = state.get("next_agent", "FINISH")
    if next_node == "FINISH":
        return END
    return next_node


def build_app_graph(checkpointer=None):
    builder = StateGraph(AgentState)

    # ── Add all nodes ──
    builder.add_node("memory_retrieve", memory_retrieve_node)
    builder.add_node("thinking", thinking_node)
    builder.add_node("simulation", simulation_node)
    builder.add_node("conversation", conversation_node)
    builder.add_node("database", database_node)
    builder.add_node("memory_write", memory_write_node)

    # ── Entry point: retrieve memories first ──
    builder.set_entry_point("memory_retrieve")

    # ── Memory → Thinking (chain-of-thought reasoning + routing) ──
    builder.add_edge("memory_retrieve", "thinking")

    # ── Thinking node decides which agent to route to ──
    builder.add_conditional_edges(
        "thinking",
        route_next,
        {
            "simulation": "simulation",
            "conversation": "conversation",
            "database": "database",
            END: END
        }
    )

    # ── All agents → Memory Write → END ──
    builder.add_edge("simulation", "memory_write")
    builder.add_edge("conversation", "memory_write")
    builder.add_edge("database", "memory_write")
    builder.add_edge("memory_write", END)

    return builder.compile(checkpointer=checkpointer)
