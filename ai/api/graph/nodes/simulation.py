from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama
from langgraph.prebuilt import create_react_agent
from api.tools.sandbox import python_sandbox

SIMULATION_PROMPT = """
You are the Simulation Sub-Agent. 
You possess a secure Python Sandbox tool. 
Whenever the user asks to run a calculation, forecast, or generate a plot/graph, YOU MUST use the python_sandbox tool.
Do NOT guess numbers. Write Python code, run it, and read the stdout.
If plotting is needed, use matplotlib and plt.show() which is intercepted to output Base64.
CRITICAL: If the python_sandbox tool returns a string like [[IMAGE_BASE64:...]], you MUST include that EXACT literal string in your final response to the user. Do NOT truncate the base64 data and do NOT replace it with a placeholder like "[Insert Image Here]". The UI requires the exact [[IMAGE_BASE64:...]] string to render the plot!
"""

from langsmith import traceable

@traceable(name="Simulation Agent Build")
def build_simulation_agent():
    # Tools isolated specifically for this agent
    tools = [python_sandbox]
    
    llm = ChatOllama(model="llama3.1:latest", temperature=0.1, base_url="http://localhost:11434")
    
    # create_react_agent compiles a sub-graph that automatically loops between LLM and Tool Execution
    return create_react_agent(llm, tools=tools, prompt=SIMULATION_PROMPT)

@traceable(name="Simulation Node")
async def simulation_node(state, config):
    agent = build_simulation_agent()
    result = await agent.ainvoke({"messages": state["messages"]}, config=config)
    
    # React agent returns the full updated message list. We just return the new messages.
    return {
        "messages": result["messages"][-1:], # Get the final AI response
        "next_agent": "supervisor" # Route back to supervisor to check if done
    }
