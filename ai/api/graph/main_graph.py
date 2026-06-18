from langgraph.graph import StateGraph, END
from api.graph.state import AgentState
from api.graph.nodes.supervisor import supervisor_node
from api.graph.nodes.simulation import simulation_node

from api.graph.nodes.conversation import conversation_node

def route_next(state: AgentState):
    next_node = state.get("next_agent", "FINISH")
    if next_node == "FINISH":
        return END
    return next_node

def build_app_graph():
    builder = StateGraph(AgentState)
    
    # Add nodes
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("simulation", simulation_node)
    builder.add_node("conversation", conversation_node)
    
    # Edges
    builder.set_entry_point("supervisor")
    
    # The supervisor decides where to go next based on route_next
    builder.add_conditional_edges(
        "supervisor",
        route_next,
        {
            "simulation": "simulation",
            "conversation": "conversation",
            "database": END, # Temporarily end the graph since DB MCP agent isn't built
            END: END
        }
    )
    
    # Once nodes finish, they unconditionally route to END to complete the turn
    builder.add_edge("simulation", END)
    builder.add_edge("conversation", END)
    
    return builder.compile()

app_graph = build_app_graph()
