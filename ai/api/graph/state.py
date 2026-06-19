"""
Rich typed state for the Gordan Belfort LangGraph agent.
Uses Pydantic-compatible TypedDict with proper reducers.
"""

import operator
from typing import Annotated, Any, Sequence, TypedDict
from langchain_core.messages import BaseMessage


class ThinkingStep(TypedDict):
    """A single chain-of-thought reasoning step."""
    step: str       # e.g., "intent_analysis", "tool_selection", "memory_retrieval"
    content: str    # The reasoning text
    timestamp: float


class ToolTrace(TypedDict):
    """Record of a tool execution."""
    tool_name: str
    args: dict
    result_preview: str   # First 500 chars of result
    status: str           # "running" | "success" | "error"
    duration_ms: float


class MemoryItem(TypedDict):
    """A retrieved or created memory."""
    content: str
    memory_type: str      # "fact" | "insight" | "preference" | "pattern"
    relevance: float
    source_thread: str


class AgentState(TypedDict):
    """
    The state of the LangGraph AI loop.

    messages:        Conversational history and tool responses (append-only).
    next_agent:      The name of the agent to route to next (determined by supervisor).
    thinking_steps:  Chain-of-thought reasoning log (append-only).
    tool_traces:     Tool execution trace for UI display (append-only).
    memory_context:  Retrieved long-term memories injected into agent context.
    persona:         Active persona key (e.g., "gordan_belfort").
    metadata:        Arbitrary metadata (model used, token counts, etc.).
    """
    messages: Annotated[Sequence[BaseMessage], operator.add]
    next_agent: str
    thinking_steps: Annotated[list[ThinkingStep], operator.add]
    tool_traces: Annotated[list[ToolTrace], operator.add]
    memory_context: list[MemoryItem]
    persona: str
    metadata: dict[str, Any]
