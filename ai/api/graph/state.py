import operator
from typing import Annotated, Sequence, TypedDict
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    """
    The state of the LangGraph AI loop.
    messages: Contains the conversational history and tool responses.
    next_agent: The name of the agent to route to next (determined by supervisor).
    """
    messages: Annotated[Sequence[BaseMessage], operator.add]
    next_agent: str
