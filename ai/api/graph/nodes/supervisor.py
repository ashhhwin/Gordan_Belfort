from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama
from pydantic import BaseModel, Field
import json

# Supervisor prompt to route the conversation
SUPERVISOR_PROMPT = """
You are a highly intelligent financial AI supervisor managing a team of specialized agents.
Your job is to read the user's latest request and route them to the correct sub-agent.

Available Agents:
1. "simulation": Select this agent if the user wants to run mathematical forecasting, python code, backtesting, or generate charts.
2. "conversation": Select this agent if the user is just saying hello, asking a general question, or if no other tools are needed.
3. "database": Select this agent if the user asks about their portfolio balances, holdings, or NSE data.

Output ONLY a JSON object exactly like this:
{{"next": "simulation"}}
"""

class RouteResponse(BaseModel):
    next: str = Field(description="The next agent to route to, or FINISH.")

from langsmith import traceable

@traceable(name="Supervisor Node")
async def supervisor_node(state, config):
    # In production, you swap ChatOllama with ChatOpenAI or ChatAnthropic via env variables
    llm = ChatOllama(model="llama3.1:latest", temperature=0, base_url="http://localhost:11434").with_structured_output(RouteResponse)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", SUPERVISOR_PROMPT),
        ("placeholder", "{messages}")
    ])
    
    chain = prompt | llm
    
    try:
        response = await chain.ainvoke({"messages": state["messages"]}, config=config)
        return {"next_agent": response.next}
    except Exception as e:
        import traceback
        traceback.print_exc()
        # Fallback to conversation if structured output fails, preventing infinite simulation loops
        return {"next_agent": "conversation"}
